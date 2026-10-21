// web/input.js -- keyboard and touch, reduced to one direction per tick.
//
// The sim takes exactly one direction index per tick and nothing else, so all this has to
// do is decide which. Two rules make it feel right at 8 Hz:
//
//   1. A tap between ticks is queued, not dropped. At 125 ms per tick a quick tap can
//      easily begin and end inside one tick, and losing it feels like input lag.
//   2. While keys are held, the most recently pressed one wins, so rolling from one
//      direction to another turns immediately instead of waiting for a key release.

import { STAY } from '../sim/grid.js';

const KEYMAP = {
  ArrowUp: 0, KeyW: 0,
  ArrowRight: 1, KeyD: 1,
  ArrowDown: 2, KeyS: 2,
  ArrowLeft: 3, KeyA: 3,
};

export class Input {
  constructor() {
    this.held = [];
    this.queued = null;
    this.paused = false;
    this.listeners = { pause: [], restart: [], toggle: [] };
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }

  on(event, fn) { (this.listeners[event] ||= []).push(fn); return this; }
  _emit(event, arg) { for (const fn of this.listeners[event] || []) fn(arg); }

  _onKeyDown(e) {
    if (e.repeat) return;
    const dir = KEYMAP[e.code];
    if (dir !== undefined) {
      e.preventDefault();
      this.held = [dir, ...this.held.filter((d) => d !== dir)];
      this.queued = dir;
      return;
    }
    if (e.code === 'Space' || e.code === 'Escape') { e.preventDefault(); this._emit('pause'); return; }
    if (e.code === 'KeyR') { this._emit('restart'); return; }
    if (e.code === 'KeyH') { this._emit('toggle', 'heatmap'); return; }
    if (e.code === 'KeyV') { this._emit('toggle', 'visited'); return; }
    if (e.code === 'KeyI') { this._emit('toggle', 'intercepts'); return; }
  }

  _onKeyUp(e) {
    const dir = KEYMAP[e.code];
    if (dir !== undefined) {
      e.preventDefault();
      this.held = this.held.filter((d) => d !== dir);
    }
  }

  /** A lost window must not leave the player sprinting into a wall. */
  _onBlur() { this.held = []; this.queued = null; }

  /** Press a direction from an on-screen control. */
  press(dir) { this.held = [dir, ...this.held.filter((d) => d !== dir)]; this.queued = dir; }
  release(dir) { this.held = this.held.filter((d) => d !== dir); }

  /** The direction for this tick. Clears the one-shot queue. */
  consume() {
    if (this.queued !== null) {
      const d = this.queued;
      this.queued = null;
      return d;
    }
    return this.held.length ? this.held[0] : STAY;
  }

  /** Wire a touch d-pad so the deployed link is usable on a phone. */
  bindTouch(root) {
    if (!root) return;
    for (const btn of root.querySelectorAll('[data-dir]')) {
      const dir = Number(btn.dataset.dir);
      const down = (e) => { e.preventDefault(); this.press(dir); };
      const up = (e) => { e.preventDefault(); this.release(dir); };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
    }
  }
}
