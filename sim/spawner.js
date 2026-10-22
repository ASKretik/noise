// sim/spawner.js -- where patrols arrive.
//
// Rejection sampling from a truncated distribution, and it is worth saying in exactly
// those words: draw a region from the predictor's final distribution, draw a cell inside
// it, then accept or reject against four constraints -- walkable, BFS distance from the
// player at least spawnMinDist, outside the player's current view, and BFS distance at
// most spawnMaxDist. Up to spawnTries draws, then fall back to uniform over all cells
// that satisfy the same constraints.
//
// The minimum-distance constraint is not a detail. Without it the system occasionally
// spawns a patrol on top of you, the death reads as arbitrary rather than earned, and the
// player stops believing the model is intelligent -- they conclude the game cheats.
//
// This module consumes a distribution and returns cells. It knows nothing about a canvas
// and nothing about how the distribution was produced beyond calling predict().

import { UNREACHABLE } from './pathfind.js';
import { isSharedGround } from './grid.js';
import { predict } from './predictor/combine.js';
import { euclid } from './grid.js';

export const REJECT = Object.freeze({
  OK: 'ok',
  UNWALKABLE: 'unwalkable',
  TOO_CLOSE: 'too-close',
  TOO_FAR: 'too-far',
  IN_VIEW: 'in-view',
  OCCUPIED: 'occupied',
  UNREACHABLE: 'unreachable',
});

/** The four constraints, in one place so the spawn path and the fallback path agree. */
export function checkCell(view, i, params) {
  const { map, player, fields } = view;
  // Aliens arrive on ground BOTH can occupy: never inside rubble the player cannot see
  // into, and never inside a black box they are not allowed to enter at all.
  const x0 = i % map.w;
  if (!isSharedGround(map, x0, (i - x0) / map.w)) return REJECT.UNWALKABLE;
  // Measured as the ALIEN travels, because the honest question behind "at least 8 cells
  // away" is how many ticks until it can reach you -- and it cuts through buildings.
  const d = fields.alienToPlayer[i];
  if (d === UNREACHABLE) return REJECT.UNREACHABLE;
  if (d < params.spawnMinDist) return REJECT.TOO_CLOSE;
  if (d > params.spawnMaxDist) return REJECT.TOO_FAR;
  const x = i % map.w, y = (i - x) / map.w;
  // "Outside the player's current view": never let a patrol wink into existence inside
  // the radius at which it could already see the player.
  if (euclid(x, y, player.x, player.y) <= view.viewRadius) return REJECT.IN_VIEW;
  for (const p of view.patrols) if (p.x === x && p.y === y) return REJECT.OCCUPIED;
  return REJECT.OK;
}

/**
 * Pick a spawn cell.
 * @returns {{x:number,y:number,region:number,tries:number,fallback:boolean,reason:string,prediction:object}|null}
 */
export function sampleSpawn({ view, chain, dossier, tau, mode, rng, params }) {
  const prediction = predict({ chain, dossier, view, tau, mode, k: params.kAhead });
  const regions = view.regions;
  const rejections = {};
  let tries = 0;

  for (; tries < params.spawnTries; tries++) {
    const r = rng.categorical(Array.from(prediction.dist));
    const cells = regions.cells[r];
    if (!cells || cells.length === 0) continue;
    const i = cells[rng.int(cells.length)];
    const verdict = checkCell(view, i, params);
    if (verdict === REJECT.OK) {
      const x = i % view.map.w, y = (i - x) / view.map.w;
      return {
        x, y, region: r, tries: tries + 1, fallback: false,
        reason: describe(prediction, r, false),
        prediction, rejections,
      };
    }
    rejections[verdict] = (rejections[verdict] || 0) + 1;
  }

  // Fallback: uniform over every cell that satisfies the constraints. This is the
  // baseline the whole predictor is measured against, so it lives in the same function.
  const valid = [];
  for (let i = 0; i < view.map.tiles.length; i++) {
    if (checkCell(view, i, params) === REJECT.OK) valid.push(i);
  }
  if (valid.length === 0) {
    // Nothing in the 8-to-18 band. Relax the ceiling before relaxing the floor: a patrol
    // arriving far away is a non-event, one arriving close is a cheat.
    for (let i = 0; i < view.map.tiles.length; i++) {
      if (checkCell(view, i, { ...params, spawnMaxDist: Infinity }) === REJECT.OK) valid.push(i);
    }
  }
  if (valid.length === 0) return null;

  const i = valid[rng.int(valid.length)];
  const x = i % view.map.w, y = (i - x) / view.map.w;
  return {
    x, y, region: regions.regionOf[i], tries, fallback: true,
    reason: describe(prediction, regions.regionOf[i], true),
    prediction, rejections,
  };
}

/**
 * An intercept cell for a patrol that has nothing better to do.
 * No minimum distance here -- the point of an intercept is to already be where you are
 * going, and a patrol walking there is visible and avoidable in a way a spawn is not.
 */
export function sampleIntercept({ view, chain, dossier, tau, mode, rng, params, prediction = null }) {
  const pred = prediction || predict({ chain, dossier, view, tau, mode, k: params.kAhead });
  const regions = view.regions;
  for (let t = 0; t < 12; t++) {
    const r = rng.categorical(Array.from(pred.dist));
    const cells = regions.cells[r];
    if (!cells || cells.length === 0) continue;
    const i = cells[rng.int(cells.length)];
    const ix = i % view.map.w;
    if (!isSharedGround(view.map, ix, (i - ix) / view.map.w)) continue;
    if (view.fields.alienToPlayer[i] === UNREACHABLE) continue;
    const x = i % view.map.w, y = (i - x) / view.map.w;
    return { x, y, region: r, prediction: pred };
  }
  // Degenerate map: stand on the predicted region's seed cell.
  const i = regions.seeds[pred.top] ?? 0;
  const x = i % view.map.w, y = (i - x) / view.map.w;
  return { x, y, region: pred.top, prediction: pred };
}

function describe(prediction, region, fallback) {
  const p = (prediction.dist[region] * 100).toFixed(0);
  if (fallback) return `uniform fallback into region ${region} (prediction gave it ${p}%)`;
  if (prediction.mode === 'uniform') return `uniform draw into region ${region}`;
  const driver = prediction.drivers[0];
  const base = `region ${region} at ${p}% on a ${prediction.k}-tick projection`;
  return driver ? `${base}, lifted because subject ${driver.why}` : base;
}
