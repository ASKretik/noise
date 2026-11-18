// sim3d/next/spawn.js -- where aliens arrive on a city map. Pure.
//
// The 2D spawner draws a region from the Dispatch's prediction, then a random cell in it,
// and rejects cells outside the distance band. On a 32 x 20 board most regions touch the
// band. On a city map with 40 regions most do not, so nearly every draw is rejected and it
// falls back to uniform -- the prediction stops mattering exactly where it should matter
// most. So `next` turns it round (spec-3d-next.md, N8.2):
//
//   1. take every cell in the band around you -- the 2D spawner's own four checks
//      (shared ground, alien distance between spawnMinDist and spawnMaxDist, outside your
//      view radius, unoccupied) -- AND out of your line of sight: nothing appears where
//      you could be looking;
//   2. weight each by the predicted probability of its region (plus a floor, so a region
//      the Dispatch rates at zero is unlikely rather than impossible);
//   3. draw one. If there is none, nothing arrives this time; a patrol never appears
//      unfairly to keep a schedule.
//
// The aliens already on the map when a run starts are placed further out, 60-120 m: a
// run on a city map should not open with something round the first corner.
//
// Intercepts and the squad plan are the Dispatch's own, unchanged.

import { checkCell, REJECT } from '../../sim/spawner.js';
import { lineOfSight } from '../raycast.js';

/** Weight given to a region the prediction rates at zero, relative to probability 1. */
export const SPAWN_FLOOR = 0.02;

export function nextSpawnPolicy(system) {
  const base = system.spawnPolicy;
  let last = null;
  return {
    get lastSpawn() { return last; },
    arrive(view, rng) {
      const pred = system.predictNow(view);
      const { map, player } = view;
      const opening = !view.started;
      const params = opening
        ? { ...view.params, spawnMinDist: view.params.spawnMaxDist, spawnMaxDist: 2 * view.params.spawnMaxDist }
        : view.params;
      const R = params.spawnMaxDist;
      const cells = [], weights = [];
      for (let y = Math.max(1, player.y - R); y <= Math.min(map.h - 2, player.y + R); y++) {
        for (let x = Math.max(1, player.x - R); x <= Math.min(map.w - 2, player.x + R); x++) {
          const i = y * map.w + x;
          if (checkCell(view, i, params) !== REJECT.OK) continue;
          if (lineOfSight(map, player.x + 0.5, player.y + 0.5, x + 0.5, y + 0.5)) continue;
          const r = view.regions.regionOf[i];
          cells.push(i);
          weights.push((r < pred.dist.length ? pred.dist[r] : 0) + SPAWN_FLOOR);
        }
      }
      if (cells.length === 0) return null;
      const i = cells[rng.categorical(weights)];
      const x = i % map.w, y = (i - x) / map.w, region = view.regions.regionOf[i];
      const pct = region < pred.dist.length ? (pred.dist[region] * 100).toFixed(0) : '0';
      last = {
        x, y, region, tries: 1, fallback: false, prediction: pred,
        reason: `region ${region} at ${pct}% on a ${pred.k}-tick projection, out of your sight, ${view.fields.alienToPlayer[i]} cells away`,
      };
      return last;
    },
    intercept(view, rng, patrol) { return base.intercept(view, rng, patrol); },
    assign(view, rng, patrols) { return base.assign(view, rng, patrols); },
  };
}
