// sim3d/units.js -- the scale of the 3D world. Pure.
//
// The sim works in cells and ticks. The 3D page works in metres and real seconds. These
// two constants are the whole translation, and they are tuned in phase 2 by playing:
//
//   CELL_M      how wide one sim cell is in the world
//   TICK_HZ_3D  how many sim ticks run per real second on the 3D page
//
// The 2D page runs at 8 Hz. At first-person scale that is several times a shooter's
// sprint, so the 3D page runs the SAME sim more slowly. Everything is unchanged in ticks --
// chase periods, alert length, stun length, division interval, par, the score -- which is
// why nothing in /sim needs to know.
//
// 3D build 45 (the user's numbers): a cell is 2.5 m, you walk at 5 m/s and sprint at
// 10 m/s. The sim moves you one cell a tick (two sprinting), so the tick rate follows:
// 5 / 2.5 = 2 Hz. Builds 2-44 ran 1.5 m cells at 4 Hz (6 and 12 m/s). The aliens' speeds
// are fractions of yours per tier (sim3d/next/rules.js), so they follow too. A tick is now
// half a second, so every timer kept in ticks lasts twice as long in seconds as it did --
// but exactly as many of your steps.

import { TICKS_PER_SECOND } from '../sim/difficulty.js';

export const CELL_M = 2.5;
export const TICK_HZ_3D = 2;
/** Your speeds in metres per second, as the two constants above make them. */
export const WALK_M_S = CELL_M * TICK_HZ_3D;
export const SPRINT_M_S = 2 * WALK_M_S;

/** Wall height, eye height and body radius, in metres. */
export const WALL_M = 3.2;
export const EYE_M = 1.65;
export const BODY_RADIUS_M = 0.3;

/**
 * A rubble heap is as tall as its biggest block: between these, seeded per cell
 * (sim3d/solid.js). The renderer draws it and the stun gun shoots over it, so both read
 * the same number.
 */
export const RUBBLE_MIN_M = 1.2;
export const RUBBLE_MAX_M = 2.2;

/**
 * How far the stun gun reaches: as far as you can make out an alien. The fog
 * (web3d/world.js) is clear to 26 m and solid at 90 m; at 72 m about a quarter of an
 * alien's contrast is left, a dim figure you can still put the crosshair on. Before
 * build 30 the reach was the alien's detection radius, 4.6-5.6 cells (7-8.4 m).
 */
export const STUN_RANGE_M = 72;

export const metres = (cells) => cells * CELL_M;
export const cells = (m) => m / CELL_M;

/** Real seconds for a number of ticks at the 3D rate. Never use the sim's own seconds. */
export const realSeconds = (ticks, hz = TICK_HZ_3D) => ticks / hz;

/**
 * The sim stores banked lightning in "seconds" of 8 ticks. On the 3D page one of those
 * lasts 8 / TICK_HZ_3D real seconds. The shop labels it in real seconds.
 */
export const simSecondsToReal = (s, hz = TICK_HZ_3D) => (s * TICKS_PER_SECOND) / hz;
