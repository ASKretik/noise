// sim3d/game3d.js -- the one rule that changes in first person. Pure.
//
// In 2D, E stuns every alien whose detection range contains you. In first person you aim,
// so the stun gun hits the ONE alien under the crosshair -- if it is within its detection
// radius of you (unhalved by water), awake, and in a clear line through no wall or
// rubble. A trigger pull with no valid target does nothing and spends nothing, so six
// charges are still six stuns.
//
// Everything else is the 2D Game, unmodified: this subclass overrides step() only to
// carry the target id in, and fireStun() only to aim it. The target id is part of the
// per-tick input record, so a replay of (seed, record) reproduces the run exactly.

import { Game } from '../sim/game.js';
import { euclid } from '../sim/grid.js';
import { lineOfSight } from './raycast.js';

export const STUN_REASON = Object.freeze({
  NO_GUN: 'no gun',
  EMPTY: 'out of charges',
  NO_TARGET: 'no target',
  INERT: 'already stunned',
  RANGE: 'out of range',
  BLOCKED: 'blocked',
});

export class Game3D extends Game {
  constructor(o) {
    super(o);
    this._stunTarget = null;
    /** The last trigger pull the sim resolved: { tick, id, ok, reason }. */
    this.lastStun = null;
  }

  /** @param {{sprint?:boolean, stunTarget?:number|null}} [actions] */
  step(inputDir, actions = null) {
    this._stunTarget = actions && actions.stunTarget != null ? actions.stunTarget : null;
    const a = actions ? { sprint: !!actions.sprint, stun: this._stunTarget != null } : null;
    return super.step(inputDir, a);
  }

  /** Could a shot at this alien land right now? Used by the crosshair lock as well. */
  canStun(id) {
    if (!this.loadout.stunGun) return { ok: false, reason: STUN_REASON.NO_GUN };
    if (this.loadout.bullets <= 0) return { ok: false, reason: STUN_REASON.EMPTY };
    const p = this.patrols.find((q) => q.id === id);
    if (!p) return { ok: false, reason: STUN_REASON.NO_TARGET };
    if (this._isInert(p)) return { ok: false, reason: STUN_REASON.INERT };
    if (euclid(p.x, p.y, this.player.x, this.player.y) > this.params.detectRadius) {
      return { ok: false, reason: STUN_REASON.RANGE };
    }
    if (!lineOfSight(this.map, this.player.x + 0.5, this.player.y + 0.5, p.x + 0.5, p.y + 0.5)) {
      return { ok: false, reason: STUN_REASON.BLOCKED };
    }
    return { ok: true, reason: null, patrol: p };
  }

  fireStun() {
    const id = this._stunTarget;
    const check = this.canStun(id);
    this.lastStun = { tick: this.tick, id, ok: check.ok, reason: check.reason };
    if (!check.ok) return { fired: 0, spent: 0, reason: check.reason };
    check.patrol.stunnedUntil = this.tick + this.params.stunTicks;
    this.loadout.bullets--;
    this.stuns++;
    this.shotsFired++;
    return { fired: 1, spent: 1, reason: null };
  }
}
