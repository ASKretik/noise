// web3d/fx3d.js -- running the capture jumpscare and the portal ascension. Browser only.
//
// The timelines are data in web3d/sequences.js; this module plays them: a flash layer, a
// fade layer (black for the jumpscare, teal-white for the ascension), a glitch layer that
// redraws the frame in torn, colour-split slices, and the particles that stream upward
// around you as you rise. web3d/play3d.js reads the tracks each frame to move the camera
// and the alien; everything here is presentation, after the sim's run has already ended.

import * as THREE from 'three';
import { SEQUENCES, sample, flashAt } from './sequences.js';
import { COLORS } from '../web/render.js';

const PARTICLES = 420;
const hash01 = (a, b) => { const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return n - Math.floor(n); };

export class Fx3D {
  constructor({ scene, flash, fade, glitch }) {
    this.flashEl = flash;
    this.fadeEl = fade;
    this.glitchEl = glitch;
    this.gctx = glitch.getContext('2d');
    this.tint = document.createElement('canvas');
    this.run = null;

    // ascension particles: a column of motes rising round the portal
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(PARTICLES * 3), 3));
    // soft round motes, not GL's default squares
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const dg = dot.getContext('2d');
    const grd = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    dg.fillStyle = grd; dg.fillRect(0, 0, 32, 32);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: COLORS.portal, size: 0.18, map: new THREE.CanvasTexture(dot), transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  get active() { return !!this.run && !this.run.done; }
  get kind() { return this.run?.kind ?? null; }

  /**
   * @param {'jumpscare'|'ascension'} kind
   * @param {'full'|'mild'|'off'} variant
   * @param {object} o  { t, center?: THREE.Vector3, onDone }
   */
  start(kind, variant, o) {
    const def = SEQUENCES[kind][variant];
    this.run = { kind, variant, def, t0: o.t, skip: false, done: false, fired: {}, center: o.center, onDone: o.onDone };
    this.fadeEl.style.background = kind === 'jumpscare' ? '#000' : '#dcfff8';
    if (kind === 'ascension' && sample(def.tracks.particles, def.duration) > 0) this.points.visible = true;
  }

  /** Skip to the end -- but never before the sequence's skipAfter seconds have played. */
  skip(t) {
    if (!this.active || !this.run.def.skippable) return;
    if (t != null && this.time(t) < (this.run.def.skipAfter ?? 0)) return;
    this.run.skip = true;
  }

  /** Seconds into the sequence, and the value of a track there. */
  time(t) { return this.run ? (this.run.skip ? this.run.def.duration : t - this.run.t0) : 0; }
  track(name, t) { return this.run ? sample(this.run.def.tracks[name], this.time(t)) : 0; }

  /** Once per sequence: true the first time `key` is reached at or after `at` seconds. */
  once(key, at, t) {
    if (!this.run || this.run.fired[key] || this.time(t) < at) return false;
    this.run.fired[key] = true;
    return true;
  }

  /** Advance the layers. Returns the seconds into the sequence. */
  update(t) {
    if (!this.run) return 0;
    const run = this.run, def = run.def;
    const s = this.time(t);
    const fl = flashAt(def, s);
    this.flashEl.style.opacity = String(fl.a);
    if (fl.color) this.flashEl.style.background = fl.color;
    const fade = run.kind === 'jumpscare' ? sample(def.tracks.fade, s) : sample(def.tracks.whiteout, s);
    this.fadeEl.style.opacity = String(fade);

    if (run.kind === 'ascension' && run.center) {
      const k = sample(def.tracks.particles, s);
      this.points.material.opacity = 0.9 * k;
      const p = this.points.geometry.attributes.position;
      for (let i = 0; i < PARTICLES; i++) {
        const r = 1.2 + hash01(i, 1) * 4.2,          // never right against the lens
         a = hash01(i, 2) * Math.PI * 2, v = 5 + hash01(i, 3) * 11;
        const y = (hash01(i, 4) * 46 + s * v) % 46;
        p.setXYZ(i, run.center.x + Math.cos(a + s * 0.6) * r, y, run.center.z + Math.sin(a + s * 0.6) * r);
      }
      p.needsUpdate = true;
    }

    if (!run.done && s >= def.duration) {
      run.done = true;
      run.onDone?.();
    }
    return s;
  }

  /**
   * The glitch: the frame just rendered, redrawn torn into displaced horizontal slices,
   * with a red ghost and a cyan ghost pulled apart. Must run straight after the WebGL
   * render, in the same task, while the drawing buffer is still readable.
   */
  afterRender(src, t) {
    const a = this.run && this.run.kind === 'jumpscare' ? this.track('glitch', t) : 0;
    const g = this.gctx, el = this.glitchEl;
    if (a < 0.01) {
      if (el.style.opacity !== '0') { el.style.opacity = '0'; g.clearRect(0, 0, el.width, el.height); }
      return;
    }
    // a hidden or collapsed view has a zero-sized buffer; skip the glitch rather than throw
    if (!src.width || !src.height || !src.clientWidth || !src.clientHeight) return;
    const W = Math.max(2, Math.round(src.clientWidth / 2)), H = Math.max(2, Math.round(src.clientHeight / 2));
    if (el.width !== W) { el.width = W; el.height = H; this.tint.width = W; this.tint.height = H; }
    el.style.opacity = '1';
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(src, 0, 0, W, H);
    // torn slices
    const frame = Math.floor(t * 30);
    for (let i = 0; i < 6; i++) {
      const y = Math.floor(hash01(frame, i) * H), h = Math.max(2, Math.floor(hash01(frame, i + 7) * H * 0.08));
      const dx = Math.round((hash01(frame, i + 13) - 0.5) * W * 0.12 * a);
      g.drawImage(src, 0, (y / H) * src.height, src.width, (h / H) * src.height, dx, y, W, h);
    }
    // colour-split ghosts
    const tg = this.tint.getContext('2d');
    for (const [color, dir] of [['#ff2030', 1], ['#20e0ff', -1]]) {
      tg.globalCompositeOperation = 'source-over';
      tg.drawImage(src, 0, 0, W, H);
      tg.globalCompositeOperation = 'multiply';
      tg.fillStyle = color; tg.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.22 * a;
      g.drawImage(this.tint, dir * W * 0.012 * a, 0);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  /** Clear every layer and forget the sequence. */
  reset() {
    this.run = null;
    this.flashEl.style.opacity = '0';
    this.fadeEl.style.opacity = '0';
    this.glitchEl.style.opacity = '0';
    this.points.visible = false;
    this.points.material.opacity = 0;
  }
}
