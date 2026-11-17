// sim3d/bolts.js -- fewer lightning bolts deeper into each belt. Pure.
//
// The 2D generator scatters one or two bolts per map region, about the same number in
// every district. In 3D the supply thins as you go deeper into a belt and recovers at the
// start of the next: all of them in a belt's first district, about a third in its tenth.
// Bought lightning (the shop) becomes the way to make up the difference.
//
// Applied by web3d/runner.js after generateLevel(), to the runner's own level object, so
// the generator, the 2D game and every 2D-derived criterion are untouched. The bolts kept
// are a seeded choice: a district always keeps the same ones.

import { Rng, hashString } from '../sim/prng.js';

/** Position within the belt: 0 for a belt's first district, 9 for its last. */
export const beltDepth = (district) => (Math.max(1, district) - 1) % 10;

/** Fraction of generated bolts kept at the deepest district of a belt is 1 - THIN. */
export const THIN = 2 / 3;

/** How many of n generated bolts a district keeps: max(1, round(n * (1 - THIN * k / 9))). */
export function boltKeepCount(n, district) {
  if (n <= 0) return 0;
  const k = beltDepth(district);
  return Math.max(1, Math.round(n * (1 - (THIN * k) / 9)));
}

/**
 * The bolts a district keeps, chosen by a seeded shuffle. Returns new objects; the input
 * array is not modified.
 */
export function thinBolts(bolts, district, profileId) {
  const keep = boltKeepCount(bolts.length, district);
  if (keep >= bolts.length) return bolts.map((b) => ({ ...b }));
  const rng = new Rng(hashString(`bolts:${profileId}:${district}`), 'bolts');
  const order = bolts.map((_, i) => i);
  rng.shuffle(order);
  return order.slice(0, keep).sort((a, b) => a - b).map((i) => ({ ...bolts[i] }));
}
