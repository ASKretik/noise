// web3d/touch3d.js -- phone controls for the 3D page. Browser only.
//
// Left half: a floating ANALOG stick -- its base appears where your thumb lands. Unlike
// the 2D stick it is not quantised to four headings: it drives the body, and the leash
// does the quantising, exactly as it does for a keyboard. Right half: drag to look.
// Under the right thumb: RUN (latches, as in 2D, because holding a thumb on it while
// steering with the other is awkward), STUN (fires at the current lock, with a touch-only
// aim-assist cone in gun.js), and MAP.
//
// Built only behind (hover: none) and (pointer: coarse); a mouse never sees any of it.

const DEADZONE = 10;     // px
const STICK_R = 56;      // px of travel for full speed
const LOOK_K = 0.0055;   // radians per px

export const isTouchDevice = () => typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;

export class Touch3D {
  constructor(root, controls) {
    this.root = root;
    this.controls = controls;
    this.stick = null;        // { id, ox, oy, x, y }
    this.look = null;         // { id, x, y }
    this.run = false;
    this.handlers = {};
    this.enabled = false;
  }

  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); return this; }
  emit(evt, ...a) { for (const fn of this.handlers[evt] || []) fn(...a); }

  attach() {
    this.enabled = true;
    const r = this.root;
    r.hidden = false;
    r.innerHTML = `
      <div class="t3-zone t3-left" data-zone="move"><div class="t3-base"><i class="t3-knob"></i></div></div>
      <div class="t3-zone t3-right" data-zone="look"></div>
      <div class="t3-buttons">
        <button type="button" class="t3-btn t3-map" data-btn="map">MAP</button>
        <button type="button" class="t3-btn t3-run" data-btn="run">RUN</button>
        <button type="button" class="t3-btn t3-stun" data-btn="stun">STUN<b></b></button>
      </div>
      <button type="button" class="t3-pause" data-btn="pause" aria-label="Pause">II</button>`;
    this.base = r.querySelector('.t3-base');
    this.knob = r.querySelector('.t3-knob');
    const left = r.querySelector('.t3-left'), right = r.querySelector('.t3-right');

    left.addEventListener('pointerdown', (e) => {
      if (this.stick) return;
      left.setPointerCapture?.(e.pointerId);
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      this.base.style.left = `${e.clientX}px`; this.base.style.top = `${e.clientY}px`;
      this.base.classList.add('on');
      this.emit('move');
    });
    right.addEventListener('pointerdown', (e) => {
      if (this.look) return;
      right.setPointerCapture?.(e.pointerId);
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    const move = (e) => {
      if (this.stick && e.pointerId === this.stick.id) { this.stick.x = e.clientX; this.stick.y = e.clientY; this._knob(); }
      if (this.look && e.pointerId === this.look.id) {
        const dx = e.clientX - this.look.x, dy = e.clientY - this.look.y;
        this.look.x = e.clientX; this.look.y = e.clientY;
        const c = this.controls;
        c.yaw -= dx * LOOK_K * c.sensitivity;
        c.pitch -= dy * LOOK_K * c.sensitivity * (c.invertY ? -1 : 1);
        const lim = Math.PI / 2 - 0.05;
        c.pitch = Math.max(-lim, Math.min(lim, c.pitch));
      }
    };
    const up = (e) => {
      if (this.stick && e.pointerId === this.stick.id) { this.stick = null; this.base.classList.remove('on'); this._knob(); }
      if (this.look && e.pointerId === this.look.id) this.look = null;
    };
    for (const z of [left, right]) {
      z.addEventListener('pointermove', move);
      z.addEventListener('pointerup', up);
      z.addEventListener('pointercancel', up);
    }
    r.querySelectorAll('[data-btn]').forEach((b) => b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const what = b.dataset.btn;
      if (what === 'run') { this.run = !this.run; this.emit('run', this.run); }
      if (what === 'stun') this.emit('fire');
      if (what === 'map') this.emit('map');
      if (what === 'pause') this.emit('pause');
    }));
  }

  _knob() {
    if (!this.stick) { this.knob.style.transform = 'translate(-50%, -50%)'; return; }
    let dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) { dx *= STICK_R / len; dy *= STICK_R / len; }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  /** Grid-space movement intent from the stick, camera-relative. */
  intent(yaw) {
    if (!this.stick) return { moveX: 0, moveY: 0, sprint: this.run };
    const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy;
    const len = Math.hypot(dx, dy);
    if (len < DEADZONE) return { moveX: 0, moveY: 0, sprint: this.run };
    const mag = Math.min(1, (len - DEADZONE) / (STICK_R - DEADZONE));
    const r = (dx / len) * mag, f = (-dy / len) * mag;
    const s = Math.sin(yaw), c = Math.cos(yaw);
    return { moveX: -s * f + c * r, moveY: -c * f - s * r, sprint: this.run };
  }

  setState({ running, charges, gun, locked }) {
    const run = this.root.querySelector('.t3-run'), stun = this.root.querySelector('.t3-stun');
    run.classList.toggle('on', !!running);
    stun.hidden = !gun;
    stun.classList.toggle('ready', charges > 0);
    stun.classList.toggle('locked', !!locked);
    stun.querySelector('b').textContent = gun ? ` ${charges}` : '';
  }
}
