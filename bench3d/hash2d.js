// bench3d/hash2d.js -- a fingerprint of the 2D generator's output, for criterion 3D-20.
//
// N8 lets the city builder reuse pieces of sim/gen.js, which is a 2D file. The 2D game
// must not notice: with its defaults, the generator has to produce exactly the levels it
// produced before. This hashes everything a 2D level carries -- tiles, spawn, keys, portal
// sites, bolts, coins, rubble, black boxes, regions, stats -- over 10,000 generations.

import { createHash } from 'node:crypto';
import { generateLevel } from '../sim/gen.js';
import { FieldPool } from '../sim/pathfind.js';
import { GRID_W, GRID_H } from '../sim/grid.js';

/** Recorded from sim/gen.js before N8.1 touched it (3D build 21). */
export const HASH_2D_BEFORE_N8 = '2795fc802090';

export function hash2DLevels({ profiles = 100, levels = 100 } = {}) {
  const h = createHash('sha256');
  const pool = new FieldPool(GRID_W * GRID_H);
  for (let p = 0; p < profiles; p++) {
    for (let lv = 1; lv <= levels; lv++) {
      const L = generateLevel(`h2d-${p}`, lv, { pool });
      h.update(L.map.tiles);
      h.update(L.regions.regionOf);
      h.update(JSON.stringify({
        seed: L.seed, attempt: L.attempt, spawn: L.spawn, caches: L.caches,
        portal: L.portalCandidates, bolts: L.bolts, coins: L.coins,
        buildings: L.buildings, safe: L.safeBoxes, seeds: L.regions.seeds,
        rooms: L.rooms, stats: L.stats,
      }));
    }
  }
  return { hash: h.digest('hex').slice(0, 12), count: profiles * levels };
}
