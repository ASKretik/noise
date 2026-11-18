// sim3d/solid.js -- what a stun shot cannot pass through, and how tall it is. Pure.
//
// The stun gun fires along what you see (sim3d/game3d.js), so the sim has to know the
// shape the renderer draws: a wall stops a shot at any height (tenements are drawn
// 5.4 m tall, the rest WALL_M); a rubble heap is as tall as its
// biggest block, a seeded draw per cell that web3d/world.js makes from the same Rng, in
// the same order, before it draws the rest of the heap. Water, black boxes and open
// ground stop nothing.
//
// solidTops(level) is that height for every cell, computed once per map.

import { TILE } from '../sim/grid.js';
import { Rng, hashString } from '../sim/prng.js';
import { RUBBLE_MIN_M, RUBBLE_MAX_M } from './units.js';

/** The seed every drawn detail of a district comes from. */
export const worldSeed = (level) => hashString(`world:${level.seed ?? level.level}`);

/** The Rng a rubble cell is drawn from; its first draw is the heap's height. */
export const rubbleRng = (seed, x, y) => new Rng(hashString(`${seed}:rubble:${x},${y}`), 'rubble');
export const rubblePeak = (rng) => RUBBLE_MIN_M + rng.float() * (RUBBLE_MAX_M - RUBBLE_MIN_M);

const cache = new WeakMap();

/** Height in metres of whatever is solid in each cell (0 = nothing). Cached per map. */
export function solidTops(level) {
  const { map } = level;
  let tops = cache.get(map);
  if (tops) return tops;
  const seed = worldSeed(level);
  tops = new Float32Array(map.w * map.h);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const t = map.tiles[y * map.w + x];
      if (t === TILE.WALL) tops[y * map.w + x] = Infinity;   // drawn 3.2-5.4 m tall (N4.2): solid all the way up
      else if (t === TILE.BUILDING) tops[y * map.w + x] = rubblePeak(rubbleRng(seed, x, y));
    }
  }
  cache.set(map, tops);
  return tops;
}
