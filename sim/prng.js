// sim/prng.js -- seeded pseudo-randomness. Nothing in this project may call Math.random.
//
// Rule fixed in session 1 of the build order: every stochastic decision draws from a
// named Rng stream seeded from hash(profileId, levelNumber). That is what makes
// "same seed + same input sequence => identical run" checkable by hashing the tick log.

/** mulberry32: 32-bit state, period 2^32, good enough for a game and ten lines long. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a string -> uint32. Used for seeds and for tick-log hashes. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Incremental FNV-1a over numbers, for hashing a tick log without building a string. */
export class Hasher {
  constructor() { this.h = 0x811c9dc5; }
  num(n) {
    // Quantise to an integer so float noise can never change the hash.
    let v = (n | 0) >>> 0;
    for (let i = 0; i < 4; i++) {
      this.h ^= (v >>> (i * 8)) & 0xff;
      this.h = Math.imul(this.h, 0x01000193);
    }
    return this;
  }
  get value() { return this.h >>> 0; }
  get hex() { return (this.h >>> 0).toString(16).padStart(8, '0'); }
}

/** The level seed. Reproducible maps per (profile, level) with no stored map data. */
export function levelSeed(profileId, levelNumber) {
  return hashString(`${profileId}#${levelNumber}`);
}

/** A named random stream. Separate streams keep one subsystem's draws from shifting another's. */
export class Rng {
  constructor(seed, name = '') {
    this.seed = seed >>> 0;
    this.name = name;
    this._next = mulberry32(this.seed);
    this.draws = 0;
  }

  /** Derive an independent child stream. Deterministic in (parent seed, label). */
  fork(label) {
    return new Rng(hashString(`${this.seed}:${label}`), this.name ? `${this.name}/${label}` : label);
  }

  /** Uniform on [0,1). */
  float() { this.draws++; return this._next(); }

  /** Uniform on (0,1) -- excludes 0, which -ln(U) needs. */
  unit() {
    let u = this.float();
    // mulberry32 can return exactly 0; nudge it rather than loop forever.
    return u > 0 ? u : Number.EPSILON;
  }

  /** Uniform integer on [0,n). */
  int(n) { return Math.floor(this.float() * n); }

  /** Uniform integer on [lo,hi] inclusive. */
  range(lo, hi) { return lo + this.int(hi - lo + 1); }

  bool(p = 0.5) { return this.float() < p; }

  pick(arr) { return arr[this.int(arr.length)]; }

  /** In-place Fisher-Yates. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** Exponential inter-arrival time: -ln(U) / lambda. See sim/poisson.js. */
  exponential(lambda) { return -Math.log(this.unit()) / lambda; }

  /** Sample an index from an unnormalised weight array. */
  categorical(weights) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    if (!(total > 0)) return this.int(weights.length);
    let r = this.float() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }
}
