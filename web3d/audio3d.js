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
