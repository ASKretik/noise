// sim3d/next/rules.js -- which rules a district is played by. Pure.
//
// Decision D1 (spec-3d-next.md), landed in N8.1 because big maps already need it:
//
//   classic  today's 32 x 20 districts from the 2D generator. The parity reference:
//            criterion 3D-3 checks it bit for bit against the 2D sim.
//   next     the game as it grows from here: N8's city maps first; items, objectives and
//            floors later. Every district on the 3D page plays `next`.
//
// Only the level differs so far. The Game3D that plays it is the same class.

import { generateLevel } from '../../sim/gen.js';
import { TICKS_PER_SECOND } from '../../sim/difficulty.js';
import { generateCity } from './city.js';
import { areaMultiple } from './size.js';

export const RULESETS = Object.freeze(['classic', 'next']);
export const DEFAULT_RULESET = 'next';

export function rulesetOf(id) {
  return RULESETS.includes(id) ? id : DEFAULT_RULESET;
}

/**
 * The run's time limit, in sim ticks. The 2D game allows 180 "seconds" of 8 ticks, which
 * on the 3D page (4 ticks a second) is six real minutes. A route across a city map grows
 * with its side, not its area, so `next` scales the limit by the square root of the area
 * multiple: about 13 minutes at district 1 and 46 at district 100. Generous on purpose --
 * N8.3 measures real run lengths and may tighten it. `undefined` keeps the 2D default.
 */
export function maxTicksFor(ruleset, district) {
  if (rulesetOf(ruleset) === 'classic') return undefined;
  return Math.round(180 * TICKS_PER_SECOND * Math.sqrt(areaMultiple(district)));
}

/** Generate a district's level under a ruleset. Same seed, same profile, same district. */
export function generateDistrict(ruleset, profileId, district, opts = {}) {
  return rulesetOf(ruleset) === 'classic'
    ? generateLevel(profileId, district, opts)
    : generateCity(profileId, district, opts);
}
