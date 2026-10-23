// web/touch.js -- thumb controls. Browser-only leaf.
//
// A floating virtual stick on the left and two translucent action buttons on the right,
// the arrangement every mobile action game converged on for a reason: your thumbs are
// already at the bottom corners, and a fixed D-pad makes you look at the screen edge
// instead of the board.
//
// FLOATING, not fixed: the stick's base is placed wherever the thumb lands inside the
// left zone rather than at a painted spot. On a phone you cannot see your own thumb, so a
// fixed pad means hunting for it; a floating one is always exactly where you put it.
//
// The game is four-directional on a grid, so the stick resolves to one of four headings by
// dominant axis rather than to a continuous angle. Mapping a 360-degree stick onto four
// directions any other way produces diagonal inputs that the sim cannot express and that
// feel like dropped frames.

const DEADZONE = 16;        // px before the stick registers at all
const MAX_RADIUS = 52;      // px at which the knob stops following

export class TouchControls {
  /**
   * @param {object} o
   * @param {import('./input.js').Input} o.input
   * @param {HTMLElement} o.root   the #touch-layer overlay
   */
  constructor({ input, root }) {
    this.input = input;
    this.root = root;
    this.zone = root.querySelector('[data-stick-zone]');
    this.stick = root.querySelector('[data-stick]');
    this.knob = root.querySelector('[data-knob]');
    this.pointerId = null;
    this.origin = { x: 0, y: 0 };
    this.dir = -1;
    this.enabled = false;
  }

  /** Only engage on a touch device; a mouse should never get a thumbstick. */
  attach() {
    const coarse = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
    if (!coarse) return false;
    this.enabled = true;
    this.root.hidden = false;
    document.body.classList.add('touch');

    this.zone.addEventListener('pointerdown', (e) => this._down(e), { passive: false });
    this.zone.addEventListener('pointermove', (e) => this._move(e), { passive: false });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      this.zone.addEventListener(type, (e) => this._up(e), { passive: false });
    }

    for (const btn of this.root.querySelectorAll('[data-act]')) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.classList.add('pressed');
        this.input.action('any');
        this.input.action(btn.dataset.act);
      }, { passive: false });
      const release = () => btn.classList.remove('pressed');
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    }
    return true;
  }

  _down(e) {
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.zone.setPointerCapture?.(e.pointerId);
    this.origin = { x: e.clientX, y: e.clientY };
    const rect = this.root.getBoundingClientRect();
    this.stick.style.left = `${e.clientX - rect.left}px`;
    this.stick.style.top = `${e.clientY - rect.top}px`;
    this.stick.classList.add('live');
    this._setKnob(0, 0);
    this.input.action('any');
  }

  _move(e) {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - this.origin.x;
    const dy = e.clientY - this.origin.y;
    const mag = Math.hypot(dx, dy);

    const clamp = mag > MAX_RADIUS ? MAX_RADIUS / mag : 1;
    this._setKnob(dx * clamp, dy * clamp);

    if (mag < DEADZONE) { this._setDir(-1); return; }
    // Dominant axis: the grid has no diagonals, so resolving any other way would
    // manufacture inputs the sim cannot express.
    const dir = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 1 : 3)
      : (dy > 0 ? 2 : 0);
    this._setDir(dir);
  }

  _up(e) {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    this.zone.releasePointerCapture?.(e.pointerId);
    this.pointerId = null;
    this.stick.classList.remove('live');
    this._setKnob(0, 0);
    this._setDir(-1);
  }

  _setKnob(x, y) {
    this.knob.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px))`;
  }

  /** Hold the heading: Input keeps it in `held` until released, so it repeats every tick. */
  _setDir(dir) {
    if (dir === this.dir) return;
    if (this.dir >= 0) this.input.release(this.dir);
    this.dir = dir;
    if (dir >= 0) this.input.press(dir);
  }

  /** Mirror the lightning state onto the RUN button so the toggle is visible. */
  setRunActive(on) {
    const btn = this.root.querySelector('[data-act="bolt"]');
    if (btn) btn.classList.toggle('active', !!on);
  }

  setStunReady(ready, charges) {
    const btn = this.root.querySelector('[data-act="stun"]');
    if (!btn) return;
    btn.classList.toggle('empty', !ready);
    const count = btn.querySelector('[data-count]');
    if (count) count.textContent = charges > 0 ? String(charges) : '—';
  }
}
