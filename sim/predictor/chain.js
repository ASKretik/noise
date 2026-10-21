// sim/predictor/chain.js -- tier 1 of the predictor: the level chain.
//
// A transition count matrix over the level's regions with Laplace smoothing, one row
// normalisation away from a Markov chain, and a k-step projection by repeated
// vector-matrix multiply. Learns this map's geometry fast and means nothing on the
// next map, which is exactly why tier 2 exists.
//
// UNITS NOTE, and it matters: the spec says the matrix is "incremented on every region
// change" and in the next breath that the k-step distribution uses "k around 20 ticks".
// Those two only agree if a matrix step is one tick, so by default this chain is
// per-tick and self-transitions land on the diagonal. The diagonal then carries dwell
// time, which is information the change-only variant throws away -- a player who sits
// in a junction for forty ticks and a player who crosses it in two produce the same
// change-only counts and very different per-tick counts. Set perTick:false for the
// literal change-only reading; bench/run.js reports both.

import { REGION_COUNT } from '../regions.js';

export class LevelChain {
  /**
   * @param {number} count
   * @param {object} [opts]
   * @param {number} [opts.laplace]   prior count on every structurally possible transition
   * @param {number} [opts.floor]     prior count on impossible transitions
   * @param {number[][]} [opts.adjacency]  region adjacency; see the note below
   * @param {boolean} [opts.perTick]
   */
  constructor(count = REGION_COUNT, opts = {}) {
    this.count = count;
    this.laplace = opts.laplace ?? 1;
    this.floor = opts.floor ?? 0.02;
    this.perTick = opts.perTick ?? true;
    this.adjacency = opts.adjacency || null;
    this.counts = new Float64Array(count * count);
    this._seedPrior();
    this.observations = 0;
    this.changes = 0;
    this._p = new Float64Array(count * count);
    this._dirty = true;
    this._va = new Float64Array(count);
    this._vb = new Float64Array(count);
  }

  /**
   * Laplace smoothing, but only along the region graph.
   *
   * A flat add-one prior says a one-tick jump from region 3 to region 9 on the far side
   * of the map is exactly as likely as a step into the neighbouring room. It is not
   * merely unlikely, it is impossible, and spending prior mass on it has a measurable
   * cost: with a flat prior the cold chain's 20-step projection is uniform, and the
   * warm chain's projection is dominated by the regions the player has already LEFT,
   * because those are the only off-diagonal cells with real counts. Measured against the
   * goal-driven bots, a flat prior scored 3-4% top-1 against uniform's 8% -- actively
   * worse than guessing.
   *
   * Restricting the prior to self-transitions and genuine neighbours turns the cold chain
   * into a diffusion over the map's actual topology, which is a far better starting guess
   * than uniform and converges to the same place once counts arrive. Impossible pairs
   * keep a small floor rather than zero so no row can ever sum to zero.
   */
  _seedPrior() {
    const n = this.count;
    if (!this.adjacency) { this.counts.fill(this.laplace); return; }
    this.counts.fill(this.floor);
    for (let i = 0; i < n; i++) {
      this.counts[i * n + i] = this.laplace;
      for (const j of this.adjacency[i] || []) {
        if (j >= 0 && j < n) this.counts[i * n + j] = this.laplace;
      }
    }
  }

  reset() {
    this._seedPrior();
    this.observations = 0;
    this.changes = 0;
    this._dirty = true;
  }

  /** Record one step of the player's region trajectory. */
  observe(from, to) {
    if (from < 0 || to < 0 || from >= this.count || to >= this.count) return;
    if (from === to && !this.perTick) return;
    this.counts[from * this.count + to] += 1;
    this.observations++;
    if (from !== to) this.changes++;
    this._dirty = true;
  }

  /** Row-normalise into the cached transition matrix. */
  _normalise() {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) sum += this.counts[i * n + j];
      const inv = sum > 0 ? 1 / sum : 0;
      for (let j = 0; j < n; j++) this._p[i * n + j] = this.counts[i * n + j] * inv;
    }
    this._dirty = false;
  }

  get P() {
    if (this._dirty) this._normalise();
    return this._p;
  }

  /** P[i][j]. */
  prob(i, j) { return this.P[i * this.count + j]; }

  /** One row of P, as a copy. */
  row(i) {
    const n = this.count;
    return this.P.slice(i * n, i * n + n);
  }

  /**
   * Row i of P^k, computed as e_i P^k by k vector-matrix multiplies.
   * k = 20 and 12 regions is 2,880 multiplies, which is cheaper and better conditioned
   * than building P^k explicitly.
   */
  kStep(i, k = 20, out = null) {
    const n = this.count;
    const P = this.P;
    let a = this._va, b = this._vb;
    a.fill(0);
    a[Math.max(0, Math.min(n - 1, i))] = 1;
    const steps = Math.max(1, k | 0);
    for (let s = 0; s < steps; s++) {
      b.fill(0);
      for (let r = 0; r < n; r++) {
        const w = a[r];
        if (w === 0) continue;
        const base = r * n;
        for (let c = 0; c < n; c++) b[c] += w * P[base + c];
      }
      const t = a; a = b; b = t;
    }
    const dst = out || new Float64Array(n);
    dst.set(a);
    this._va = a; this._vb = b;
    return dst;
  }

  /** How much the chain has actually learned, in [0,1). Drives the dispatch panel's hedging. */
  maturity() {
    let prior = 0;
    for (let i = 0; i < this.counts.length; i++) prior += this.counts[i];
    prior -= this.observations;
    return this.observations / (this.observations + Math.max(1, prior));
  }

  /** Mean entropy of the rows, in bits. A flat chain has learned nothing. */
  meanRowEntropy() {
    const n = this.count;
    const P = this.P;
    let total = 0;
    for (let i = 0; i < n; i++) {
      let h = 0;
      for (let j = 0; j < n; j++) {
        const p = P[i * n + j];
        if (p > 0) h -= p * Math.log2(p);
      }
      total += h;
    }
    return total / n;
  }

  toJSON() {
    return { count: this.count, laplace: this.laplace, floor: this.floor, perTick: this.perTick, adjacency: this.adjacency, counts: Array.from(this.counts), observations: this.observations, changes: this.changes };
  }

  static fromJSON(o) {
    const c = new LevelChain(o.count, { laplace: o.laplace, floor: o.floor, perTick: o.perTick, adjacency: o.adjacency });
    c.counts.set(o.counts);
    c.observations = o.observations || 0;
    c.changes = o.changes || 0;
    c._dirty = true;
    return c;
  }
}
