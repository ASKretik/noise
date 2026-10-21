// sim/predictor/dossier.js -- tier 2 of the predictor: the file on you.
//
// One exponentially weighted {mean, var, n} per trait, folded once per run, persisted
// per profile, never reset by a level transition. This is the thing that makes level 6
// different from level 1 and the thing that makes the guest slot a usable demo.
//
// Counting only: an EW mean is a sufficient-statistic update, not a gradient step.
// There is no loss function in this file, which is the sentence to have ready.

import { TRAIT_KEYS } from './traits.js';
import { priorFor } from './priors.js';

/** Weight given to the newest run. 0.3 => roughly a three-run memory. */
export const DOSSIER_ALPHA = 0.3;
/** Runs needed before tier 2 is trusted at all. Shapes the confidence ramp. */
export const CONFIDENCE_K0 = 1.5;
/** z-scores are clamped: one freak run must not be able to dominate the reweighting. */
export const Z_CLAMP = 2.5;

export class Dossier {
  /** @param {{traits?:object, updates?:number, levelsSeen?:number}} [state] */
  constructor(state = {}) {
    this.traits = {};
    this.updates = state.updates || 0;
    this.levelsSeen = state.levelsSeen || 0;
    const src = state.traits || state;
    for (const k of TRAIT_KEYS) {
      const t = src && src[k];
      this.traits[k] = t && Number.isFinite(t.mean)
        ? { mean: t.mean, var: t.var || 0, n: t.n || 0 }
        : { mean: NaN, var: 0, n: 0 };
    }
  }

  /** Fold one run's measured traits in. Omitted traits are left untouched. */
  update(values, opts = {}) {
    const alpha = opts.alpha ?? DOSSIER_ALPHA;
    for (const [k, x] of Object.entries(values)) {
      if (!Number.isFinite(x)) continue;
      const t = this.traits[k];
      if (!t) continue;                       // unknown key: ignore, do not grow the schema
      if (t.n === 0 || !Number.isFinite(t.mean)) {
        t.mean = x; t.var = 0; t.n = 1;
      } else {
        const d = x - t.mean;
        t.mean += alpha * d;
        t.var = (1 - alpha) * (t.var + alpha * d * d);
        t.n += 1;
      }
    }
    this.updates++;
    if (opts.levelCompleted) this.levelsSeen++;
    return this;
  }

  has(key) {
    const t = this.traits[key];
    return !!t && t.n > 0 && Number.isFinite(t.mean);
  }

  mean(key) { return this.has(key) ? this.traits[key].mean : NaN; }
  sd(key) { return this.has(key) ? Math.sqrt(Math.max(0, this.traits[key].var)) : NaN; }
  count(key) { return this.has(key) ? this.traits[key].n : 0; }

  /**
   * Deviation of this player from the population, in population sd units.
   * Unseen traits return 0, which makes them inert in the reweighting rather than
   * silently pulling toward the prior mean.
   */
  z(key) {
    if (!this.has(key)) return 0;
    const p = priorFor(key);
    if (!(p.sd > 0)) return 0;
    const z = (this.traits[key].mean - p.mean) / p.sd;
    return Math.max(-Z_CLAMP, Math.min(Z_CLAMP, z));
  }

  /** How much to believe tier 2, in [0,1). Thin dossier => reweighting fades out. */
  confidence() {
    return this.updates / (this.updates + CONFIDENCE_K0);
  }

  /** The traits that most distinguish this player, strongest first. For dispatch and HUD. */
  strongest(n = 2) {
    return TRAIT_KEYS
      .filter((k) => this.has(k))
      .map((k) => ({ key: k, z: this.z(k), mean: this.traits[k].mean, n: this.traits[k].n }))
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
      .slice(0, n);
  }

  /** Observed traits, for the dossier panel. */
  summary() {
    return TRAIT_KEYS.map((k) => ({
      key: k,
      seen: this.has(k),
      mean: this.has(k) ? this.traits[k].mean : null,
      z: this.z(k),
      n: this.count(k),
    }));
  }

  toJSON() {
    const traits = {};
    for (const k of TRAIT_KEYS) {
      const t = this.traits[k];
      if (t.n > 0 && Number.isFinite(t.mean)) {
        // Round on the way out: the dossier is persisted as JSON and full float
        // precision makes the byte-identity assertion in the isolation test noisy.
        traits[k] = { mean: round6(t.mean), var: round6(t.var), n: t.n };
      }
    }
    return { traits, updates: this.updates, levelsSeen: this.levelsSeen };
  }

  static fromJSON(o) { return new Dossier(o || {}); }

  clone() { return Dossier.fromJSON(JSON.parse(JSON.stringify(this.toJSON()))); }

  reset() {
    for (const k of TRAIT_KEYS) this.traits[k] = { mean: NaN, var: 0, n: 0 };
    this.updates = 0;
    this.levelsSeen = 0;
    return this;
  }
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;
