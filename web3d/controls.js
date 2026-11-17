// web3d/controls.js -- pointer lock, mouse look and the keyboard. Browser only.
//
// Produces grid-space movement intent for the session: W is "where the camera faces",
// projected onto the ground. Yaw 0 faces grid up (-z in the world, dir 0 in the sim).
// Keys are read by physical position (e.code), so WASD works on any keyboard layout.

const MOVE = {
  KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b',
  KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
};

export class Controls {
  constructor(target) {
    this.target = target;
    this.yaw = 0;
    this.pitch = 0;
    this.sensitivity = 1;          // multiplier on 0.0022 rad per pixel
    this.invertY = false;
    this.held = new Set();
    this.sprint = false;
    this.locked = false;
    this.handlers = {};
    this._onMouse = this._onMouse.bind(this);
  }

  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); return this; }
  emit(evt, ...a) { for (const fn of this.handlers[evt] || []) fn(...a); }

  attach() {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) { this.held.clear(); this.sprint = false; }
      this.emit('lock', this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.emit('lockerror'));
    document.addEventListener('mousemove', this._onMouse);
    this.target.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.emit('fire');
    });
    window.addEventListener('keydown', (e) => {
      if (e.target?.closest?.('input, select, textarea')) return;
      if (MOVE[e.code]) { this.held.add(MOVE[e.code]); e.preventDefault(); this.emit('move'); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = true;
      if (e.repeat) return;
      if (e.code === 'KeyR') this.emit('restart');
      if (e.code === 'KeyL') this.emit('bolt');
      if (e.code === 'KeyH') this.emit('toggle', 'heatmap');
      if (e.code === 'KeyV') this.emit('toggle', 'visited');
      if (e.code === 'KeyI') this.emit('toggle', 'intercepts');
      if (e.code === 'Tab' || e.code === 'KeyM') { e.preventDefault(); this.emit('map', true); }
      if (e.code === 'Backquote') this.emit('tune');
      this.emit('any');
    });
    window.addEventListener('keyup', (e) => {
      if (MOVE[e.code]) this.held.delete(MOVE[e.code]);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = false;
      if (e.code === 'Tab' || e.code === 'KeyM') this.emit('map', false);
    });
    window.addEventListener('blur', () => { this.held.clear(); this.sprint = false; });
  }

  lock() {
    try {
      const p = this.target.requestPointerLock?.({ unadjustedMovement: true });
      if (p?.catch) p.catch(() => this.target.requestPointerLock?.());
    } catch { this.target.requestPointerLock?.(); }
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  _onMouse(e) {
    if (!this.locked) return;
    const k = 0.0022 * this.sensitivity;
    this.yaw -= e.movementX * k;
    this.pitch -= e.movementY * k * (this.invertY ? -1 : 1);
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  /** Movement intent in grid space, length <= 1. */
  intent() {
    const f = (this.held.has('f') ? 1 : 0) - (this.held.has('b') ? 1 : 0);
    const r = (this.held.has('r') ? 1 : 0) - (this.held.has('l') ? 1 : 0);
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw) in (x, y-down) grid space
    let mx = -s * f + c * r;
    let my = -c * f - s * r;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    return { moveX: mx, moveY: my, sprint: this.sprint };
  }
}
