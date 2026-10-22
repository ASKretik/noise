// web/sound.js -- the ominous bit. Browser-only leaf, entirely procedural.
//
// No audio files: a low detuned drone through a lowpass, plus a pulse whose RATE is the
// actual information. Three tempos, driven by how close the nearest alien is to seeing
// you:
//
//   calm     nothing has you        slow, almost a heartbeat at rest
//   seen     an alien has you       faster, and the drone opens up
//   closing  you are well inside    fast, urgent, filter wide open
//             its detection radius
//
// Why synthesis rather than a loop: the tempo has to be continuous with the threat, and
// crossfading three audio files at 8 Hz is both heavier and worse. It also keeps the
// repository dependency-free and the deploy a static upload.
//
// Browsers refuse to start audio without a user gesture, so nothing is created until
// start() is called from a real keypress or tap, and every method is safe to call before
// that happens.

export const THREAT = Object.freeze({ CALM: 'calm', SEEN: 'seen', CLOSING: 'closing' });

const PROFILES = {
  calm:    { bpm: 46,  cutoff: 260,  droneGain: 0.050, pulseGain: 0.055, detune: 6 },
  seen:    { bpm: 104, cutoff: 700,  droneGain: 0.075, pulseGain: 0.090, detune: 14 },
  closing: { bpm: 168, cutoff: 1500, droneGain: 0.100, pulseGain: 0.125, detune: 26 },
};

export class Ambience {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.started = false;
    this.state = THREAT.CALM;
    this._nextPulse = 0;
    this._timer = null;
    this._nodes = null;
  }

  /** Call from a genuine user gesture. Safe to call repeatedly. */
  start() {
    if (this.started || !this.enabled) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
      this._build();
      this.started = true;
      this._tick();
    } catch (err) {
      console.warn('[sound] unavailable:', err?.message);
      this.ctx = null;
    }
  }

  _build() {
    const ctx = this.ctx;
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = PROFILES.calm.cutoff;
    filter.Q.value = 3;
    filter.connect(master);

    const droneGain = ctx.createGain();
    droneGain.gain.value = PROFILES.calm.droneGain;
    droneGain.connect(filter);

    // Two saws a few cents apart: the beating between them is most of the unease.
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = 'sawtooth'; b.type = 'sawtooth';
    a.frequency.value = 55;            // A1
    b.frequency.value = 55;
    b.detune.value = PROFILES.calm.detune;
    a.connect(droneGain); b.connect(droneGain);
    a.start(); b.start();

    // A slow wobble on the filter, so a held state never sits perfectly still.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.09;
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    this._nodes = { master, filter, droneGain, a, b, lfo };
    master.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 1.2);
  }

  /** One percussive hit. Pitch drops with urgency, which reads as "closer". */
  _pulse(when, profile) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const base = profile === PROFILES.closing ? 150 : profile === PROFILES.seen ? 118 : 92;
    osc.frequency.setValueAtTime(base, when);
    osc.frequency.exponentialRampToValueAtTime(base * 0.45, when + 0.16);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(profile.pulseGain, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
    osc.connect(gain);
    gain.connect(this._nodes.filter);
    osc.start(when);
    osc.stop(when + 0.34);
  }

  /** Scheduler. Runs a little ahead of the clock so timing does not depend on rAF. */
  _tick() {
    if (!this.ctx || !this.started) return;
    const now = this.ctx.currentTime;
    const profile = PROFILES[this.state] || PROFILES.calm;
    const interval = 60 / profile.bpm;
    if (this._nextPulse < now) this._nextPulse = now + 0.05;
    while (this._nextPulse < now + 0.3) {
      this._pulse(this._nextPulse, profile);
      this._nextPulse += interval;
    }
    this._timer = setTimeout(() => this._tick(), 120);
  }

  /**
   * @param {'calm'|'seen'|'closing'} state
   */
  setThreat(state) {
    if (!PROFILES[state] || state === this.state) return;
    this.state = state;
    if (!this.ctx || !this._nodes) return;
    const p = PROFILES[state];
    const t = this.ctx.currentTime;
    const ramp = 0.35;
    this._nodes.filter.frequency.cancelScheduledValues(t);
    this._nodes.filter.frequency.setTargetAtTime(p.cutoff, t, ramp);
    this._nodes.droneGain.gain.setTargetAtTime(p.droneGain, t, ramp);
    this._nodes.b.detune.setTargetAtTime(p.detune, t, ramp);
    // Re-schedule immediately so a tempo change is heard now, not after the old interval.
    this._nextPulse = Math.min(this._nextPulse, t + 60 / p.bpm);
  }

  /**
   * Derive the threat state from the game. One place, so the audio cannot disagree with
   * what the screen is showing.
   */
  follow(game) {
    if (!game) return;
    if (game.inSafeBox) { this.setThreat(THREAT.CALM); return; }
    const d = game.nearestPatrolDist();
    const r = game.effectiveRadius;
    if (Number.isFinite(d) && d <= r * 0.5) this.setThreat(THREAT.CLOSING);
    else if (game.alertTicks > 0 || (Number.isFinite(d) && d <= r)) this.setThreat(THREAT.SEEN);
    else this.setThreat(THREAT.CALM);
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!this._nodes || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._nodes.master.gain.cancelScheduledValues(t);
    this._nodes.master.gain.setTargetAtTime(on ? 0.9 : 0.0001, t, 0.2);
  }

  stop() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    this.started = false;
    try { this.ctx?.close(); } catch { /* already gone */ }
    this.ctx = null;
    this._nodes = null;
  }
}
