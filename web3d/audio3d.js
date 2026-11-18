// web3d/audio3d.js -- the 3D page's sound. Browser only, entirely synthesised.
//
// web/sound.js's Ambience is reused unchanged for the drone and the threat-rate pulse --
// the rate is still the information. On top of it, two things only first person needs:
//
//   - a voice per alien through an HRTF PannerNode, so you can hear one behind a wall.
//     The rule is symmetric with theirs: they hear you, you hear them.
//   - footsteps whose loudness is your detection radius made audible: full on open
//     ground, muffled in water, silent inside a black box.
//
// Nothing starts before a user gesture; every method is safe to call before that.

import { Ambience } from '../web/sound.js';

export class Audio3D {
  constructor() {
    this.amb = new Ambience();
    this.enabled = true;
    this.ctx = null;
    this.bus = null;
    this.voices = new Map();
    this.noise = null;
  }

  start() {
    this.amb.start();
    this.ctx = this.amb.ctx;
    if (!this.ctx || this.bus) return;
    this.bus = this.ctx.createGain();
    this.bus.gain.value = this.enabled ? 0.9 : 0;
    this.bus.connect(this.ctx.destination);
    const len = Math.floor(this.ctx.sampleRate * 0.12);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    // Deterministic noise: a tiny LCG, because nothing in this project calls Math.random.
    const d = this.noise.getChannelData(0);
    let x = 0x2545f491;
    for (let i = 0; i < len; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; d[i] = (x / 2147483648 - 1) * (1 - i / len); }
  }

  /**
   * Silence everything without tearing it down. Web Audio oscillators run on their own
   * clock, independent of the frame loop, so a paused game -- or a hidden tab -- kept
   * droning until the audio clock itself was stopped. Suspending it freezes the drone,
   * every alien voice and the pulse scheduler (which only ever schedules a 0.3 s window
   * ahead of that clock, so nothing piles up while it is frozen). Safe before start().
   */
  pause() {
    this.held = true;
    try { this.ctx?.suspend?.(); } catch { /* already closed */ }
  }

  resume() {
    this.held = false;
    try { this.ctx?.resume?.(); } catch { /* already closed */ }
  }

  /** 'running' | 'suspended' | 'closed' | 'none' -- for the checks. */
  get state() { return this.ctx ? this.ctx.state : 'none'; }

  setEnabled(on) {
    this.enabled = on;
    this.amb.setEnabled(on);
    if (this.bus) this.bus.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  /**
   * @param {object} game
   * @param {{x:number, y:number, z:number, yaw:number}} ear   metres and radians
   * @param {Array<{id:number, x:number, z:number, inert:boolean}>} aliens
   */
  update(game, ear, aliens) {
    if (!this.ctx || !this.bus) return;
    this.amb.follow(game);
    const t = this.ctx.currentTime;
    const L = this.ctx.listener;
    const fx = -Math.sin(ear.yaw), fz = -Math.cos(ear.yaw);
    if (L.positionX) {
      L.positionX.setTargetAtTime(ear.x, t, 0.02); L.positionY.setTargetAtTime(ear.y, t, 0.02); L.positionZ.setTargetAtTime(ear.z, t, 0.02);
      L.forwardX.setTargetAtTime(fx, t, 0.02); L.forwardY.setTargetAtTime(0, t, 0.02); L.forwardZ.setTargetAtTime(fz, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition?.(ear.x, ear.y, ear.z);
      L.setOrientation?.(fx, 0, fz, 0, 1, 0);
    }

    const seen = new Set();
    for (const a of aliens) {
      seen.add(a.id);
      let v = this.voices.get(a.id);
      if (!v) v = this._voice(a.id);
      const pz = v.panner;
      if (pz.positionX) { pz.positionX.setTargetAtTime(a.x, t, 0.05); pz.positionY.setTargetAtTime(1.6, t, 0.05); pz.positionZ.setTargetAtTime(a.z, t, 0.05); }
      else pz.setPosition(a.x, 1.6, a.z);
      v.gain.gain.setTargetAtTime(a.inert ? 0 : 0.22, t, 0.15);
    }
    for (const [id, v] of this.voices) {
      if (seen.has(id)) continue;
      v.gain.gain.setTargetAtTime(0, t, 0.1);
      setTimeout(() => { try { v.osc.stop(); v.lfo.stop(); } catch { /* stopped */ } }, 600);
      this.voices.delete(id);
    }
  }

  /** A low, wavering growl: detuned saw through a lowpass, amplitude wobbling. */
  _voice(id) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 62 + (id % 6) * 9;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 360; lp.Q.value = 6;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 1.3 + (id % 4) * 0.4;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(lp.frequency);
    const panner = ctx.createPanner();
    Object.assign(panner, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 2.5, rolloffFactor: 1.3, maxDistance: 80 });
    osc.connect(lp).connect(gain).connect(panner).connect(this.bus);
    osc.start(); lfo.start();
    const v = { osc, lfo, gain, panner };
    this.voices.set(id, v);
    return v;
  }

  /** The stun gun landing: a rising electric chirp over a crackle. */
  zap() {
    if (!this.ctx || !this.bus || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(2400, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
    o.connect(hp).connect(g).connect(this.bus);
    o.start(t); o.stop(t + 0.25);
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.1, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    n.connect(ng).connect(this.bus); n.start(t);
  }

  /** Trigger pulled with no lock: a dry mechanical click, nothing spent. */
  click() {
    if (!this.ctx || !this.bus || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    n.connect(bp).connect(g).connect(this.bus); n.start(t); n.stop(t + 0.04);
  }

  /**
   * Tension, 0..1: a hunting alien within two cells. A heartbeat swells and the ambience
   * ducks toward silence, so the jumpscare lands out of quiet rather than over a drone.
   */
  setTension(x) {
    this.tension = Math.max(0, Math.min(1, x));
    if (!this.ctx || !this.bus) return;
    const t = this.ctx.currentTime;
    const m = this.amb._nodes?.master;
    if (m && this.enabled) m.gain.setTargetAtTime(0.9 * (1 - 0.85 * this.tension), t, 0.12);
    if (this.tension > 0.05 && !this._beat) this._heartbeat();
  }

  _heartbeat() {
    if (!this.ctx || !this.bus || !(this.tension > 0.05)) { this._beat = null; return; }
    const ctx = this.ctx, t = ctx.currentTime + 0.02;
    const level = 0.35 * this.tension * (this.enabled ? 1 : 0);
    for (const [dt, f] of [[0, 58], [0.16, 50]]) {          // lub-dub
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t + dt);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dt + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), t + dt + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.18);
      o.connect(g).connect(this.bus);
      o.start(t + dt); o.stop(t + dt + 0.2);
    }
    const bpm = 78 + 50 * this.tension;
    this._beat = setTimeout(() => this._heartbeat(), 60000 / bpm);
  }

  /** The jumpscare's shriek: a sawtooth tearing upward over a noise burst, distorted. */
  shriek(level = 1) {
    if (!this.ctx || !this.bus || !this.enabled || level <= 0) return;
    this.setTension(0);
    const m = this.amb._nodes?.master;
    const ctx = this.ctx, t = ctx.currentTime;
    if (m) m.gain.setTargetAtTime(0.9, t, 0.05);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) { const x = (i / 255.5) - 1; curve[i] = Math.tanh(x * 4); }
    shaper.curve = curve;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.32 * level, t + 0.025);
    out.gain.setValueAtTime(0.32 * level, t + 0.35);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    shaper.connect(out).connect(this.bus);
    for (const det of [0, 37]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(1400, t + 0.9);
      o.connect(shaper); o.start(t); o.stop(t + 0.95);
    }
    const n = ctx.createBufferSource();
    n.buffer = this.noise; n.loop = true;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.9, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    n.connect(ng).connect(shaper); n.start(t); n.stop(t + 0.55);
  }

  /** The ascension: a low rumble swelling under a tone that rises an octave and a half. */
  rise(level = 1) {
    if (!this.ctx || !this.bus || !this.enabled || level <= 0) return;
    this.setTension(0);
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noise; n.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 90;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.5 * level, t + 1.6);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    n.connect(lp).connect(ng).connect(this.bus); n.start(t); n.stop(t + 2.7);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(330, t + 2.2);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.12 * level, t + 1.8);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    o.connect(og).connect(this.bus); o.start(t); o.stop(t + 2.6);
  }

  /** One footstep. kind: 'floor' | 'water' | 'safe'. */
  footstep(kind, sprinting = false) {
    if (!this.ctx || !this.bus || !this.enabled || kind === 'safe') return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = kind === 'water' ? 520 : 1100;
    bp.Q.value = kind === 'water' ? 0.8 : 1.6;
    const g = ctx.createGain();
    const peak = (kind === 'water' ? 0.09 : 0.18) * (sprinting ? 1.3 : 1);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'water' ? 0.18 : 0.09));
    src.connect(bp).connect(g).connect(this.bus);
    src.start(t);
  }
}
