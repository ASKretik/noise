// sim/poisson.js -- when patrols arrive.
//
// A non-homogeneous Poisson process over ticks. The rate rises through a run, so the
// pressure curve inside a single level is part of the design rather than something the
// difficulty controller has to fake.
//
// Inter-arrival times are drawn as -ln(U)/lambda(t) with lambda frozen at the current
// tick. That is the piecewise-constant approximation, which is what the spec asks for and
// is exact whenever lambda is locally flat. `exact:true` switches to thinning (draw at
// lambdaMax, accept with probability lambda(t)/lambdaMax), which is the textbook-correct
// sampler for a varying rate; it costs a handful of extra draws and is here mainly so the
// approximation is a stated choice rather than an accident.

export class ArrivalProcess {
  /**
   * @param {object} o
   * @param {number} o.lambdaBase    arrivals per tick at the ramp's midpoint
   * @param {number} [o.lambdaScale] difficulty controller's multiplier
   * @param {number} [o.graceTicks]  no arrivals at all before this tick
   * @param {number} [o.rampTicks]   ticks over which the rate climbs to its ceiling
   * @param {import('./prng.js').Rng} o.rng
   */
  constructor(o) {
    this.lambdaBase = o.lambdaBase;
    this.lambdaScale = o.lambdaScale ?? 1;
    this.graceTicks = o.graceTicks ?? 40;
    this.rampTicks = o.rampTicks ?? 480;
    this.rampLo = o.rampLo ?? 0.6;
    this.rampHi = o.rampHi ?? 1.5;
    this.exact = o.exact ?? false;
    this.rng = o.rng;
    this.arrivals = 0;
    this.nextAt = this.graceTicks + this.rng.exponential(Math.max(1e-6, this.lambdaAt(this.graceTicks)));
  }

  /** The rate at tick t, arrivals per tick. */
  lambdaAt(t) {
    if (t < this.graceTicks) return 0;
    const u = Math.min(1, (t - this.graceTicks) / this.rampTicks);
    const ramp = this.rampLo + (this.rampHi - this.rampLo) * u;
    return Math.max(0, this.lambdaBase * this.lambdaScale * ramp);
  }

  get lambdaMax() { return Math.max(1e-6, this.lambdaBase * this.lambdaScale * this.rampHi); }

  /** Let the controller retune mid-run without restarting the process. */
  setScale(scale) { this.lambdaScale = scale; }

  /**
   * Advance to tick t.
   * @returns {number} how many patrols arrive on this tick (normally 0 or 1)
   */
  step(t) {
    if (t < this.graceTicks) return 0;
    let count = 0;
    let guard = 0;
    while (t >= this.nextAt && guard++ < 8) {
      const lam = this.lambdaAt(t);
      if (lam <= 0) { this.nextAt = t + 1; break; }
      if (this.exact) {
        // Thinning: the candidate was drawn at lambdaMax, keep it with prob lam/lambdaMax.
        if (this.rng.float() <= lam / this.lambdaMax) { count++; this.arrivals++; }
        this.nextAt = this.nextAt + this.rng.exponential(this.lambdaMax);
      } else {
        count++; this.arrivals++;
        this.nextAt = this.nextAt + this.rng.exponential(lam);
      }
    }
    return count;
  }
}
