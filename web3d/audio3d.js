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

  /** N6.1: a decoy landing and starting to rattle -- quick ticks, a little metallic. */
  rattle() {
    if (!this.ctx || !this.bus || !this.enabled) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let i = 0; i < 9; i++) {
      const t = t0 + i * 0.055;
      const n = ctx.createBufferSource(); n.buffer = this.noise;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400 + (i % 3) * 700; bp.Q.value = 6;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      n.connect(bp).connect(g).connect(this.bus); n.start(t); n.stop(t + 0.05);
    }
  }

  /** N6.1: dampers on -- a soft low thump. */
  muffle() {
    if (!this.ctx || !this.bus || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + 0.3);
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
  /** The grab: a heavy, close thud, and the heartbeat stops. */
  /** The hit: a sub-bass impact that drops through the floor, a body slam of low noise. */
  grab(level = 1) {
    if (!this.ctx || !this.bus || !this.enabled || level <= 0) return;
    this.setTension(0);
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f0, f1, a, len] of [[120, 28, 0.9, 0.9], [62, 22, 0.7, 1.2]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len * 0.7);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a * level, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(this.bus); o.start(t); o.stop(t + len + 0.05);
    }
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.7 * level, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    n.connect(lp).connect(ng).connect(this.bus); n.start(t);
  }

  /** The hard cut to black: everything goes silent at once. setTension(0) brings the drone back. */
  cut() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.amb._nodes?.master?.gain.setTargetAtTime(0.0001, t, 0.01);
    if (this.bus) { this.bus.gain.setTargetAtTime(0.0001, t, 0.01); this.bus.gain.setTargetAtTime(this.enabled ? 0.9 : 0, t + 0.9, 0.05); }
  }

  /**
   * The scream. The world goes silent under it -- nothing but this -- and it is three
   * voices: a distorted, detuned saw choir climbing two octaves through a vocal formant,
   * a thin screech on top with a sick vibrato, and a burst of torn noise at the front.
   */
  shriek(level = 1, dur = 0.9) {
    if (!this.ctx || !this.bus || !this.enabled || level <= 0) return;
    this.setTension(0);
    const ctx = this.ctx, t = ctx.currentTime;
    this.amb._nodes?.master?.gain.setTargetAtTime(0.0001, t, 0.015);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(x * 6); }
    shaper.curve = curve;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.5 * level, t + 0.012);
    out.gain.setValueAtTime(0.5 * level, t + dur * 0.85);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    shaper.connect(out).connect(this.bus);
    // the choir through a formant: an "aah" that is not quite a voice
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass'; formant.Q.value = 2.2;
    formant.frequency.setValueAtTime(900, t); formant.frequency.exponentialRampToValueAtTime(2600, t + dur);
    formant.connect(shaper);
    const dry = ctx.createGain(); dry.gain.value = 0.35; dry.connect(shaper);
    for (const det of [-40, 0, 31, 1210]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(760, t + dur * 0.8);
      o.connect(formant); o.connect(dry); o.start(t); o.stop(t + dur + 0.05);
    }
    // the screech, with a fast, uneven vibrato
    const sc = ctx.createOscillator();
    sc.type = 'square';
    sc.frequency.setValueAtTime(1900, t); sc.frequency.exponentialRampToValueAtTime(3300, t + dur);
    const vib = ctx.createOscillator(); vib.frequency.value = 23;
    const vg = ctx.createGain(); vg.gain.value = 140;
    vib.connect(vg).connect(sc.frequency);
    const sg = ctx.createGain(); sg.gain.value = 0.12;
    sc.connect(sg).connect(shaper); sc.start(t); vib.start(t); sc.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
    // the tear at the front
    const n = ctx.createBufferSource();
    n.buffer = this.noise; n.loop = true;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(1.2, t); ng.gain.exponentialRampToValueAtTime(0.05, t + 0.35); ng.gain.setValueAtTime(0.05, t + dur * 0.9);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(ng).connect(shaper); n.start(t); n.stop(t + dur + 0.05);
  }

  /** A noise source, looped, starting now. */
  _noise(t, dur) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise; n.loop = true;
    n.start(t); n.stop(t + dur + 0.05);
    return n;
  }

  /** One heartbeat, loud and close: lub-dub. */
  beat(level = 1) {
    if (!this.ctx || !this.bus || !this.enabled || level <= 0) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.amb._nodes?.master?.gain.setTargetAtTime(0.0001, t, 0.05);
    for (const [at, a] of [[0, 1], [0.17, 0.7]]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(62, t + at); o.frequency.exponentialRampToValueAtTime(38, t + at + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(0.9 * a * level, t + at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.16);
      o.connect(g).connect(this.bus); o.start(t + at); o.stop(t + at + 0.2);
    }
  }

  /** The lights dying: a mains buzz that sputters out, with a crackle. */
  buzz(level = 1) {
    if (!this.ctx || !this.bus || !this.enabled || level <= 0) return;
    this.setTension(0);
    const ctx = this.ctx, t = ctx.currentTime;
    this.amb._nodes?.master?.gain.setTargetAtTime(0.0001, t, 0.03);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 100;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (const [at, v] of [[0, 0.28], [0.05, 0.02], [0.08, 0.3], [0.14, 0.01], [0.19, 0.22], [0.3, 0.0001]]) g.gain.setValueAtTime(v * level, t + at);
    o.connect(hp).connect(g).connect(this.bus); o.start(t); o.stop(t + 0.32);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5 * level, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    this._noise(t, 0.1).connect(bp).connect(ng).connect(this.bus);
  }

  /** Its breath, close: a slow wet rasp drawn in. */
  breath(level = 1) {
    if (!this.ctx || !this.bus || !this.enabled || level <= 0) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(500, t); bp.frequency.linearRampToValueAtTime(1300, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45 * level, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    this._noise(t, 0.52).connect(bp).connect(g).connect(this.bus);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 48;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.35 * level, t + 0.3);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(lp).connect(og).connect(this.bus); o.start(t); o.stop(t + 0.55);
  }

  /** The attack's first beat: a wet hiss over a low, tremoring growl. */
  hiss(level = 1) {
    if (!this.ctx || !this.bus || !this.enabled || level <= 0) return;
    this.setTension(0);
    const ctx = this.ctx, t = ctx.currentTime;
    this.amb._nodes?.master?.gain.setTargetAtTime(0.0001, t, 0.02);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
    const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 5200; bp.gain.value = 9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * level, t + 0.05);
    g.gain.setValueAtTime(0.5 * level, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    this._noise(t, 0.45).connect(hp).connect(bp).connect(g).connect(this.bus);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    const trem = ctx.createGain(); trem.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 19;
    const lg = ctx.createGain(); lg.gain.value = 0.45;
    lfo.connect(lg).connect(trem.gain);
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0.0001, t); gg.gain.exponentialRampToValueAtTime(0.7 * level, t + 0.08);
    gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    for (const f of [52, 55.5, 104]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(lp); o.start(t); o.stop(t + 0.5);
    }
    lp.connect(trem).connect(gg).connect(this.bus);
    lfo.start(t); lfo.stop(t + 0.5);
  }

  /** Claws raking the air: a fast band of noise sweeping up. */
  swipe(level = 1) {
    if (!this.ctx || !this.bus || !this.enabled || level <= 0) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(5200, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.75 * level, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    this._noise(t, 0.22).connect(bp).connect(g).connect(this.bus);
  }

  /** A bite snapping shut: a hard clack of teeth and a thud. */
  snap(level = 1) {
    if (!this.ctx || !this.bus || !this.enabled || level <= 0) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(1.0 * level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    this._noise(t, 0.05).connect(hp).connect(g).connect(this.bus);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.8 * level, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(og).connect(this.bus); o.start(t); o.stop(t + 0.2);
  }

  /**
   * In the black, after the cut: bone giving way. Cracks, then a wet crush. It goes
   * straight to the output, because cut() has just silenced the bus.
   */
  crunch(level = 1) {
    if (!this.ctx || !this.enabled || level <= 0) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0.85 * level;
    out.connect(ctx.destination);
    for (let i = 0; i < 6; i++) {
      const at = t + [0, 0.045, 0.07, 0.14, 0.19, 0.27][i];
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6;
      bp.frequency.value = [2400, 1500, 3100, 1100, 2000, 900][i];
      const g = ctx.createGain();
      g.gain.setValueAtTime(1.6, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03 + 0.01 * (i % 3));
      this._noise(at, 0.06).connect(bp).connect(g).connect(out);
    }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 8;
    lp.frequency.setValueAtTime(220, t); lp.frequency.exponentialRampToValueAtTime(950, t + 0.18); lp.frequency.exponentialRampToValueAtTime(260, t + 0.5);
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime(0.9, t + 0.05); wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    this._noise(t, 0.6).connect(lp).connect(wg).connect(out);
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
