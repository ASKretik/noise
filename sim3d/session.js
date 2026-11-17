// sim3d/session.js -- one district, played in real time. Pure.
//
// The glue between a frame loop and the sim: each frame it moves the body under the
// leash; every 1 / TICK_HZ_3D seconds it asks the leash for a direction, records it, and
// steps the Game3D. The browser calls update(dt, controls) from requestAnimationFrame;
// the tests call it from a loop with synthetic controls. Same code either way.

import { createBody, moveBody, placeBody, RESPONSE } from './body.js';
import { Leash } from './leash.js';
import { InputRecord } from './record.js';
import { TICK_HZ_3D } from './units.js';

/** Never run more than this many ticks in one frame: a backgrounded tab must not catch up. */
const MAX_TICKS_PER_UPDATE = 4;

export class Session3D {
  /**
   * @param {object} o
   * @param {import('./game3d.js').Game3D} o.game
   * @param {number} [o.tickHz]
   * @param {(row:object, session:Session3D) => void} [o.onTick]  after every sim step
   */
  constructor(o) {
    this.game = o.game;
    this.tickHz = o.tickHz ?? TICK_HZ_3D;
    this.onTick = o.onTick || null;
    this.body = createBody(this.game.player.x, this.game.player.y);
    this.leash = new Leash(this.game.map);
    this.record = new InputRecord();
    this.acc = 0;
    this.pendingStun = null;
    this.snapped = 0;
    /** Body acceleration, per second. Tunable live in the phase-2 graybox. */
    this.response = o.response ?? RESPONSE;
  }

  /** Fraction of the way to the next tick, for interpolating the aliens. */
  get alpha() { return Math.min(1, this.acc * this.tickHz); }

  sprintHeld(controls) { return !!controls.sprint && this.game.sprintTicks > 0; }

  /** Body speed in cells per second. */
  speed(controls) { return (this.sprintHeld(controls) ? 2 : 1) * this.tickHz; }

  /** Queue a trigger pull at an alien id; it resolves on the next tick. */
  fire(targetId) { this.pendingStun = targetId; }

  /**
   * @param {number} dt seconds since the last frame
   * @param {{moveX:number, moveY:number, sprint:boolean}} controls grid-space intent
   * @returns {number} sim ticks run this frame
   */
  update(dt, controls) {
    const g = this.game;
    if (g.over) return 0;
    const sprintHeld = this.sprintHeld(controls);
    if (!this.leash.prepare(g, this.body, sprintHeld)) this.snapped++;
    moveBody(this.body, controls.moveX || 0, controls.moveY || 0, this.speed(controls), dt, this.leash.blocked, this.response);

    this.acc += dt;
    const step = 1 / this.tickHz;
    let n = 0;
    while (this.acc >= step && n < MAX_TICKS_PER_UPDATE && !g.over) {
      this.acc -= step;
      n++;
      this._tick(sprintHeld);
    }
    if (this.acc > step) this.acc = step;     // dropped ticks are dropped, not owed
    return n;
  }

  _tick(sprintHeld) {
    const g = this.game;
    const d = this.leash.decide(g, this.body, sprintHeld);
    const row = { dir: d.dir, sprint: d.sprint, stunTarget: this.pendingStun };
    this.pendingStun = null;
    this.record.push(row);
    g.step(row.dir, { sprint: row.sprint, stunTarget: row.stunTarget });
    if (!g.over && !this.leash.prepare(g, this.body, sprintHeld)) this.snapped++;
    this.onTick?.(row, this);
  }

  /** Put the body back on the sim's cell (restart, teleport). */
  resync() { placeBody(this.body, this.game.player.x, this.game.player.y); this.acc = 0; }
}
