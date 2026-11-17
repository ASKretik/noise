// sim3d/units.js -- the scale of the 3D world. Pure.
//
// The sim works in cells and ticks. The 3D page works in metres and real seconds. These
// two constants are the whole translation, and they are tuned in phase 2 by playing:
//
//   CELL_M      how wide one sim cell is in the world
//   TICK_HZ_3D  how many sim ticks run per real second on the 3D page
//
// The 2D page runs at 8 Hz. At first-person scale that is about twice a shooter's sprint,
// so the 3D page runs the SAME sim more slowly. Everything is unchanged in ticks -- chase
// periods, alert length, stun length, division interval, par, the score -- which is why
// nothing in /sim needs to know.

import { TICKS_PER_SECOND } from '../sim/difficulty.js';

export const CELL_M = 1.5;
export const TICK_HZ_3D = 4;

/** Wall height, eye height and body radius, in metres. */
export const WALL_M = 3.2;
export const EYE_M = 1.65;
export const BODY_RADIUS_M = 0.3;

export const metres = (cells) => cells * CELL_M;
export const cells = (m) => m / CELL_M;

/** Real seconds for a number of ticks at the 3D rate. Never use the sim's own seconds. */
export const realSeconds = (ticks, hz = TICK_HZ_3D) => ticks / hz;

/**
 * The sim stores banked lightning in "seconds" of 8 ticks. On the 3D page one of those
 * lasts 8 / TICK_HZ_3D real seconds. The shop labels it in real seconds.
 */
export const simSecondsToReal = (s, hz = TICK_HZ_3D) => (s * TICKS_PER_SECOND) / hz;
