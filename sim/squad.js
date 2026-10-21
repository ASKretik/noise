// sim/squad.js -- the aliens decide together.
//
// Independent pursuers are a surprisingly weak threat. Each one separately descends the
// same distance field toward the same player, so they arrive along the same corridor in
// single file, and a player who escapes the first has escaped all of them. Worse, each
// one separately samples the predictor's distribution, so they all pile into the modal
// district and leave every other route open.
//
// A squad assigns ROLES and DISTINCT districts. While hunting, the nearest alien runs the
// player down directly and the rest are posted on the player's escape routes -- including
// the unlikely ones, because the point of covering a low-probability route is not that
// the player will take it, it is that once every route is covered there is nowhere left
// to go. While calm, each alien gets its own district, highest-probability first, so the
// squad spreads across the map instead of converging on one guess.
//
// This module reads a distribution and returns targets. It does not know how the
// distribution was produced, and it does not know a canvas exists.

import { UNREACHABLE } from './pathfind.js';

export const ROLE = Object.freeze({
  /** Run the player down along the live field. */
  CHASE: 'chase',
  /** Stand on a route the player might break toward. */
  CUTOFF: 'cutoff',
  /** Walk to a predicted district and wait. */
  INTERCEPT: 'intercept',
});

/**
 * How many of the squad commit to the direct chase. The rest cut off.
 * One is enough to apply pressure; two or more and the cutoffs stop covering the map.
 */
const chasersFor = (n) => (n <= 1 ? 1 : n <= 3 ? 1 : 2);

/** Representative cell for a district: the one the player would reach soonest. */
function doorway(view, region) {
  const cells = view.regions.cells[region];
  if (!cells || cells.length === 0) return null;
  const field = view.fields.player;
  let best = null, bestD = Infinity;
  for (const i of cells) {
    const d = field[i];
    if (d === UNREACHABLE || d >= bestD) continue;
    bestD = d; best = i;
  }
  if (best === null) best = cells[0];
  return { x: best % view.map.w, y: Math.floor(best / view.map.w), region, playerDist: bestD };
}

/** A cell inside a district, drawn rather than fixed so two visits are not identical. */
function somewhereIn(view, region, rng) {
  const cells = view.regions.cells[region];
  if (!cells || cells.length === 0) return null;
  const i = cells[rng.int(cells.length)];
  return { x: i % view.map.w, y: Math.floor(i / view.map.w), region };
}

/**
 * @param {object} o
 * @param {object} o.view        live game view
 * @param {object} o.prediction  output of predictor/combine.js predict()
 * @param {Array}  o.patrols     live alien list
 * @param {object} o.rng
 * @returns {Map<number, {x:number,y:number,region:number,role:string}>}
 */
export function assignSquad({ view, prediction, patrols, rng }) {
  const plan = new Map();
  if (!patrols || patrols.length === 0) return plan;

  const alienField = view.fields.alienToPlayer || view.fields.patrols;
  const distToPlayer = (p) => {
    const d = alienField ? alienField[p.y * view.map.w + p.x] : UNREACHABLE;
    return d === UNREACHABLE ? Infinity : d;
  };
  const byProximity = [...patrols].sort((a, b) => distToPlayer(a) - distToPlayer(b));

  const hunting = view.alertTicks > 0;
  const here = view.regions.regionOf[view.player.y * view.map.w + view.player.x];

  // --- rank the districts worth standing in ---
  let ranked;
  if (hunting) {
    // Escape routes: wherever the player could actually be shortly, nearest first,
    // weighted by what the predictor thinks of each. Unlikely routes stay on the list --
    // covering them is how the net closes.
    ranked = [];
    for (let r = 0; r < view.regions.count; r++) {
      const d = doorway(view, r);
      if (!d || d.playerDist === Infinity) continue;
      if (d.playerDist > 14) continue;                  // too far to be an escape this alert
      ranked.push({ region: r, score: prediction.dist[r] + (r === here ? 0.15 : 0), cell: d, playerDist: d.playerDist });
    }
    ranked.sort((a, b) => b.score - a.score);
  } else {
    ranked = [];
    for (let r = 0; r < view.regions.count; r++) {
      ranked.push({ region: r, score: prediction.dist[r], cell: null, playerDist: Infinity });
    }
    ranked.sort((a, b) => b.score - a.score);
  }

  const nChasers = hunting ? chasersFor(patrols.length) : 0;
  const claimed = new Set();
  let rank = 0;

  byProximity.forEach((p, idx) => {
    if (hunting && idx < nChasers) {
      plan.set(p.id, { x: view.player.x, y: view.player.y, region: here, role: ROLE.CHASE });
      return;
    }
    // Take the best unclaimed district. Distinct by construction: that is the whole
    // mechanism. If the squad outnumbers the districts, the surplus falls back to the
    // direct chase rather than doubling up on one cutoff.
    while (rank < ranked.length && claimed.has(ranked[rank].region)) rank++;
    if (rank >= ranked.length) {
      plan.set(p.id, { x: view.player.x, y: view.player.y, region: here, role: ROLE.CHASE });
      return;
    }
    const pick = ranked[rank];
    claimed.add(pick.region);
    const cell = pick.cell || somewhereIn(view, pick.region, rng);
    if (!cell) {
      plan.set(p.id, { x: view.player.x, y: view.player.y, region: here, role: ROLE.CHASE });
      return;
    }
    plan.set(p.id, {
      x: cell.x, y: cell.y, region: pick.region,
      role: hunting ? ROLE.CUTOFF : ROLE.INTERCEPT,
    });
  });

  return plan;
}
