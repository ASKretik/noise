// sim3d/game3d.js -- the one rule that changes in first person. Pure.
//
// In 2D, E stuns every alien whose detection range contains you. In first person you aim,
// so the stun gun hits the ONE alien under the crosshair -- if you can see the part of it
// the crosshair is on, it is awake, and it is within STUN_RANGE_M (72 m, about as far as
// the fog lets you make one out). A trigger pull with no valid target does nothing and
// spends nothing, so six charges are still six stuns.
//
// "Can see" is a line from your eye to the point on the alien's body the crosshair is on,
// through no wall and under no rubble heap's top (raycast.js shotClear, solid.js). The
// page sends that line with the shot -- the aim, in 1/32 of a cell and of a metre -- and
// the sim re-checks it against where you and the alien really are (within the leash's
// slack and a step of the alien's), so a recorded aim cannot shoot from somewhere else.
// A shot without an aim (headless runs) goes from your cell's centre at eye height to the
// alien's centre at mid-body.
//
// Everything else is the 2D Game, unmodified: this subclass overrides step() only to
// carry the target and aim in, and fireStun() only to aim it. Both are part of the
// per-tick input record, so a replay of (seed, record) reproduces the run exactly.
// (Before 3D build 30 the reach was the alien's detection radius, 7-8.4 m, along a flat
// line from cell centre to cell centre.)

import { Game } from '../sim/game.js';
import { shotClear } from './raycast.js';
import { solidTops } from './solid.js';
import { CELL_M, EYE_M, WALL_M, STUN_RANGE_M } from './units.js';

export const STUN_REASON = Object.freeze({
  NO_GUN: 'no gun',
  EMPTY: 'out of charges',
  NO_TARGET: 'no target',
  INERT: 'already stunned',
  RANGE: 'out of range',
  BLOCKED: 'blocked',
  OFF_TARGET: 'aim not on the alien',
});

/** The stun gun's reach in cells. */
export const STUN_RANGE = STUN_RANGE_M / CELL_M;
/** An aim is six integers: eye x, y, height, then the struck point's, in 1/AIM_Q units. */
export const AIM_Q = 32;
/** How far the aim's eye may be from your cell's centre: the leash lets the body lead by 3 steps. */
export const AIM_FROM_SLACK = 5;
/** How far the struck point may be from the alien's cell centre: drawn between cells, limbs, a step before the tick. */
export const AIM_AT_SLACK = 2.5;
/** Where a shot without an aim strikes: mid-body (web3d/entities.js alienPosition). */
export const BODY_AIM_M = 1.2;

/**
 * The aim of a shot from world positions in metres ({x, y, z}, y up; the page's
 * coordinates, where cell (cx, cy) spans x = cx..cx+1 and z = cy..cy+1 times cellM).
 */
export function aimOf(eye, point, cellM = CELL_M) {
  const q = (v) => Math.round(v * AIM_Q);
  return [q(eye.x / cellM), q(eye.z / cellM), q(eye.y), q(point.x / cellM), q(point.z / cellM), q(point.y)];
}

export class Game3D extends Game {
  constructor(o) {
    super(o);
    this._stunTarget = null;
    this._stunAim = null;
    /** The last trigger pull the sim resolved: { tick, id, ok, reason }. */
    this.lastStun = null;
  }

  /** @param {{sprint?:boolean, stunTarget?:number|null, stunAim?:number[]|null}} [actions] */
  step(inputDir, actions = null) {
    this._stunTarget = actions && actions.stunTarget != null ? actions.stunTarget : null;
    this._stunAim = this._stunTarget != null && actions.stunAim ? actions.stunAim : null;
    const a = actions ? { sprint: !!actions.sprint, stun: this._stunTarget != null } : null;
    return super.step(inputDir, a);
  }

  /**
   * Could a shot at this alien land right now? Used by the crosshair lock as well.
   * @param {number} id
   * @param {number[]|null} [aim]  aimOf(eye, point): the line the shot travels
   */
  canStun(id, aim = null) {
    if (!this.loadout.stunGun) return { ok: false, reason: STUN_REASON.NO_GUN };
    if (this.loadout.bullets <= 0) return { ok: false, reason: STUN_REASON.EMPTY };
    const p = this.patrols.find((q) => q.id === id);
    if (!p) return { ok: false, reason: STUN_REASON.NO_TARGET };
    if (this._isInert(p)) return { ok: false, reason: STUN_REASON.INERT };
    const px = this.player.x + 0.5, py = this.player.y + 0.5, ax = p.x + 0.5, ay = p.y + 0.5;
    const tops = solidTops(this.level);
    let fx = px, fy = py, fh = EYE_M, tx = ax, ty = ay, th = BODY_AIM_M;
    if (aim) {
      [fx, fy, fh, tx, ty, th] = aim.map((v) => v / AIM_Q);
      const { w, h } = this.map;
      const inside = fx >= 0 && fy >= 0 && fx < w && fy < h;
      if (!inside || tops[Math.floor(fy) * w + Math.floor(fx)] > 0 ||       // an eye is never inside a wall
        Math.hypot(fx - px, fy - py) > AIM_FROM_SLACK || Math.hypot(tx - ax, ty - ay) > AIM_AT_SLACK ||
        !(fh >= 0 && fh <= WALL_M) || !(th >= 0 && th <= WALL_M + 1)) {
        return { ok: false, reason: STUN_REASON.OFF_TARGET };
      }
    }
    // seen before far: the crosshair only owns up to an alien you can see
    if (!shotClear(this.map, tops, fx, fy, fh, tx, ty, th)) {
      return { ok: false, reason: STUN_REASON.BLOCKED };
    }
    if (Math.hypot(tx - fx, ty - fy) > STUN_RANGE) return { ok: false, reason: STUN_REASON.RANGE };
    return { ok: true, reason: null, patrol: p };
  }

  fireStun() {
    const id = this._stunTarget;
    const check = this.canStun(id, this._stunAim);
    this.lastStun = { tick: this.tick, id, ok: check.ok, reason: check.reason };
    if (!check.ok) return { fired: 0, spent: 0, reason: check.reason };
    check.patrol.stunnedUntil = this.tick + this.params.stunTicks;
    this.loadout.bullets--;
    this.stuns++;
    this.shotsFired++;
    return { fired: 1, spent: 1, reason: null };
  }
}
