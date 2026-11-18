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
import { CELL_M } from '../units.js';

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

// ---- N8.2: few aliens, fast where you cannot see them (spec-3d-next.md, decisions R54)

/** Aliens grow faster with depth: x1.0 at district 1 to x1.4 at district 100. */
export const DISTRICT_SPEED_MAX = 1.4;
/**
 * Hunting speed ceiling at HARD, as a fraction of your walking speed. Above 0.7 a 5 s
 * alert can no longer be outrun past the detection radius, and breaking contact stops
 * being a mechanic. The ceiling scales with the tier like everything else, so the user's
 * 0.5 : 0.75 : 1 : 1.3 holds at every depth -- which puts ULTRA's at 0.91: on ULTRA you
 * hide, you do not outrun.
 */
export const HUNT_CEILING = 0.7;
/** Travel speed at HARD, in your walking speeds, scaled by tier like the rest. */
export const TRAVEL_SPEED = 2.0;
/** Aliens travel only when at least this far from you, and out of your line of sight. */
export const TRAVEL_MIN_M = 40;
/** Where arrivals land: as the alien walks, 25-60 m from you, and out of your sight. */
export const ARRIVE_MIN_M = 25;
export const ARRIVE_MAX_M = 60;

/** Arrival cap on a city map: grows with the side of the map, not its area. */
export const arrivalCap = (area) => Math.round(4 * Math.sqrt(area));

export const districtSpeed = (district) => 1 + ((DISTRICT_SPEED_MAX - 1) * (Math.min(100, Math.max(1, district)) - 1)) / 99;

/**
 * A district's parameters under a ruleset. `classic` is the 2D game's, untouched. `next`
 * re-times and re-sizes the aliens for big maps:
 *
 *   speeds   the base move rate (the 2D period with its tier factor undone) x the 3D tier
 *            factor x the district factor; hunting is capped at HUNT_CEILING x tier, and
 *            patrolling is never faster than hunting. A move period is 1 / rate.
 *   travel   TRAVEL_SPEED x tier walking speeds, beyond TRAVEL_MIN_M and out of sight
 *   numbers  arrival cap round(4 sqrt A), divisions up to twice that, about one in eight
 *            already on the map, and the arrival rate scaled up so the city fills over the
 *            first two minutes or so rather than ten
 *   arrivals 25-60 m away as the alien walks (sim3d/next/spawn.js adds "out of sight")
 */
export function paramsFor(ruleset, district, tier) {
  const p = levelParams(district, tier);
  if (rulesetOf(ruleset) === 'classic') return p;
  const was = difficultyOf(p.difficulty).speedFactor;
  const k = TIER_SPEED_3D[p.difficulty] ?? 1;
  const f = districtSpeed(district);
  const baseChase = p.chaseMovePeriod * was, basePatrol = p.patrolMovePeriod * was;   // ticks per move at 1x
  const hunt = k * Math.min(f / baseChase, HUNT_CEILING);
  const patrol = Math.min(k * (f / basePatrol), hunt);
  const cap = arrivalCap(areaMultiple(district));
  return {
    ...p,
    speedFactor3d: k,
    districtSpeed: f,
    chaseMovePeriod: 1 / hunt,
    patrolMovePeriod: 1 / patrol,
    travelRate: TRAVEL_SPEED * k,
    travelMinCells: Math.round(TRAVEL_MIN_M / CELL_M),
    maxPatrols: cap,
    splitCeiling: 2 * cap,
    initialPatrols: Math.max(1, Math.round(cap / 8)),
    lambdaBase: (p.lambdaBase * cap) / p.maxPatrols,
    spawnMinDist: Math.round(ARRIVE_MIN_M / CELL_M),
    spawnMaxDist: Math.round(ARRIVE_MAX_M / CELL_M),
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
