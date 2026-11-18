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
import { TICKS_PER_SECOND, levelParams, difficultyOf } from '../../sim/difficulty.js';
import { generateCity } from './city.js';
import { areaMultiple } from './size.js';

export const RULESETS = Object.freeze(['classic', 'next']);
export const DEFAULT_RULESET = 'next';

export function rulesetOf(id) {
  return RULESETS.includes(id) ? id : DEFAULT_RULESET;
}

/**
 * Alien speed per tier on the 3D page, as a multiple of the sim's base speed (the user's
 * numbers, 3D build 22). The 2D game caps EASY, MEDIUM and HARD at 0.75 of what their
 * names say (0.375 / 0.5625 / 0.75) and runs ULTRA at 1.0; the 3D page takes the names at
 * their word and pushes ULTRA past full speed. `classic` keeps the 2D values for parity.
 */
export const TIER_SPEED_3D = Object.freeze({ easy: 0.5, medium: 0.75, hard: 1.0, ultra: 1.3 });

/** What the 3D hub says about each tier's aliens. */
export const TIER_BLURB_3D = Object.freeze({
  easy: 'Aliens move at half speed. They learn how you move, but not which keys you have taken.',
  medium: 'Aliens move at three-quarter speed. They learn how you move, but not which keys you have taken.',
  hard: 'Aliens move at full speed. They learn how you move, but not which keys you have taken.',
  ultra: 'Aliens move at 1.3 times full speed, close to your own: outrunning them rarely works, so hide. They know exactly which keys you have taken. Scores triple.',
});

/**
 * A district's parameters under a ruleset. `next` re-times the aliens for the 3D tier
 * speeds: a move period is the base period divided by the speed factor, so the 2D factor
 * is undone and the 3D one applied.
 */
export function paramsFor(ruleset, district, tier) {
  const p = levelParams(district, tier);
  if (rulesetOf(ruleset) === 'classic') return p;
  const was = difficultyOf(p.difficulty).speedFactor;
  const now = TIER_SPEED_3D[p.difficulty] ?? 1;
  return {
    ...p,
    speedFactor3d: now,
    chaseMovePeriod: (p.chaseMovePeriod * was) / now,
    patrolMovePeriod: (p.patrolMovePeriod * was) / now,
  };
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
