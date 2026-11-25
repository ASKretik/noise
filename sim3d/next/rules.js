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
import { levelParams, difficultyOf } from '../../sim/difficulty.js';
import { generateCity } from './city.js';
import { areaMultiple } from './size.js';
import { TICK_HZ_3D } from '../units.js';

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
/**
 * Aliens travel only when at least this many cells from you, and out of your line of
 * sight. Distances the sim plays by are in cells -- your steps -- so a change of scale
 * leaves the game itself alone: these were 40 m and 25-60 m at build 44's 1.5 m cells,
 * and are 67 m and 42-100 m at 2.5 m (build 45). Only what you see is set in metres:
 * the fog, and the stun gun's reach.
 */
export const TRAVEL_MIN_CELLS = 27;
/** Where arrivals land: as the alien walks, 17-40 cells from you, and out of your sight. */
export const ARRIVE_MIN_CELLS = 17;
export const ARRIVE_MAX_CELLS = 40;

/** Arrival cap on a city map: grows with the side of the map, not its area. */
export const arrivalCap = (area) => Math.round(4 * Math.sqrt(area));

/** Keys per district on a city map (N8.3): 4 at district 1, 5 at 10, 7 at 50, 8 at 75, 10 at 100. */
export const keysFor = (district) => Math.round(4 + (6 * (Math.min(100, Math.max(1, district)) - 1)) / 99);

export const districtSpeed = (district) => 1 + ((DISTRICT_SPEED_MAX - 1) * (Math.min(100, Math.max(1, district)) - 1)) / 99;

/**
 * A district's parameters under a ruleset. `classic` is the 2D game's, untouched. `next`
 * re-times and re-sizes the aliens for big maps:
 *
 *   speeds   the base move rate (the 2D period with its tier factor undone) x the 3D tier
 *            factor x the district factor; hunting is capped at HUNT_CEILING x tier, and
 *            patrolling is never faster than hunting. A move period is 1 / rate.
 *   travel   TRAVEL_SPEED x tier walking speeds, beyond TRAVEL_MIN_CELLS and out of sight
 *   numbers  arrival cap round(4 sqrt A), divisions up to twice that, about one in eight
 *            already on the map, and the arrival rate scaled up so the city fills over the
 *            first two minutes or so rather than ten
 *   arrivals 17-40 cells away as the alien walks (sim3d/next/spawn.js adds "out of sight")
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
    travelMinCells: TRAVEL_MIN_CELLS,
    caches: keysFor(district),
    maxPatrols: cap,
    splitCeiling: 2 * cap,
    initialPatrols: Math.max(1, Math.round(cap / 8)),
    lambdaBase: (p.lambdaBase * cap) / p.maxPatrols,
    spawnMinDist: ARRIVE_MIN_CELLS,
    spawnMaxDist: ARRIVE_MAX_CELLS,
  };
}

/**
 * The run's time limit (N8.3), set per run from its par -- the greedy key route plus the
 * portal, with the 2D game's 1.35 slack -- so it scales with the route actually drawn.
 * Measured at build 23's 4 Hz: walking the route with no aliens takes 0.9 min at district 1
 * and 4.4 at 100 (par 1.2 and 6.0), so six times par is about eight times the walk: a
 * backstop no careful run meets, never under six real minutes. The HUD counts down the
 * last minute. Par is in ticks: at 4 Hz (again since build 48) these are the minutes.
 * (N8.1 used 180 s x 8 ticks x sqrt(A), 13-46 min, before anyone had measured.)
 */
export const LIMIT_PAR = 6;
export const LIMIT_MIN_TICKS = 6 * 60 * TICK_HZ_3D;
export const timeLimitTicks = (par) => Math.max(LIMIT_MIN_TICKS, Math.round(LIMIT_PAR * par));

/** Generate a district's level under a ruleset. Same seed, same profile, same district. */
export function generateDistrict(ruleset, profileId, district, opts = {}) {
  return rulesetOf(ruleset) === 'classic'
    ? generateLevel(profileId, district, opts)
    : generateCity(profileId, district, opts);
}
