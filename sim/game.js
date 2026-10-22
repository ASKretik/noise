// sim/game.js -- the simulation core.
//
// Pure ES module. Zero DOM access, zero imports outside /sim, no reference to a canvas,
// a profile or a model. That is the constraint that lets this same file run under Node at
// a few thousand ticks a millisecond for the benchmark harness and in the browser at 8 Hz
// for play, and it is miserable to retrofit, so it is fixed here in session 1 terms.
//
// Everything stochastic draws from an injected Rng. Everything that decides where a
// patrol goes is injected too, as `spawnPolicy`. The core therefore has no opinion about
// the predictor: run it with no policy at all and you get an empty city; run it with the
// uniform policy and you get the baseline; run it with the full policy and you get the
// game. Same core, three experiments.

import { TILE, DIRS, STAY, isWalkable, isAlienPassable, euclid } from './grid.js';
import { STUN_GUN_CAPACITY } from './shop.js';
import { FieldPool, bfsFrom, bfsField, stepDownhill, UNREACHABLE, HUMAN, ALIEN } from './pathfind.js';
import { Rng } from './prng.js';
import { entropyBits, entropyScore } from './entropy.js';
import { levelParams, TICKS_PER_SECOND } from './difficulty.js';
import { ArrivalProcess } from './poisson.js';

export const LOSE = Object.freeze({ CAUGHT: 'caught', TIMEOUT: 'timeout' });

/** Tick-log layout. Order is load-bearing: the determinism hash is taken over it. */
export const LOG_FIELDS = Object.freeze(['t', 'x', 'y', 'dir', 'flags', 'alert', 'patrols']);

export const FLAG = Object.freeze({
  MOVED: 1,
  ON_COVER: 2,
  DETECTED: 4,
  COLLECTED: 8,
  WON: 16,
  LOST: 32,
  SPAWNED: 64,
  BOOSTED: 128,
  SPLIT: 256,
  STUNNED: 512,
  IN_SAFE: 1024,
});

/** FNV-1a over the whole tick log. Two runs with the same seed and inputs must agree. */
function hashLog(log) {
  let h = 0x811c9dc5;
  const mix = (n) => {
    const v = (n | 0) >>> 0;
    for (let b = 0; b < 4; b++) {
      h ^= (v >>> (b * 8)) & 0xff;
      h = Math.imul(h, 0x01000193);
    }
  };
  for (const row of log) for (const n of row) mix(n);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class Game {
  /**
   * @param {object} o
   * @param {object} o.level          output of sim/gen.js generateLevel()
   * @param {object} [o.params]       difficulty params; defaults to the level's
   * @param {number} [o.seed]         run seed; defaults to the level seed
   * @param {object} [o.spawnPolicy]  { arrive(view,rng), intercept(view,rng,patrol) }
   * @param {object} [o.observer]     { onTick(sample,view), onObjective(info), onRunEnd(summary) }
   * @param {'none'|'player'|'full'} [o.logLevel]
   * @param {number} [o.maxTicks]
   * @param {number} [o.lambdaScale]  difficulty controller's arrival multiplier
   * @param {number} [o.tau]          temperature, passed through to the policy
   */
  constructor(o) {
    this.level = o.level;
    this.map = o.level.map;
    this.regions = o.level.regions;
    this.params = o.params || o.level.params || levelParams(o.level.level);
    this.maxTicks = o.maxTicks ?? 180 * TICKS_PER_SECOND;
    this.logLevel = o.logLevel ?? 'full';
    this.spawnPolicy = o.spawnPolicy || null;
    this.observer = o.observer || null;
    this.tau = o.tau ?? this.params.tauBase;

    const seed = o.seed ?? o.level.seed;
    this.rng = new Rng(seed, `run:${o.level.level}`);
    // Separate streams: a change in how patrols break movement ties must not shift
    // which cells the spawner draws, or no A/B comparison between modes is meaningful.
    this.rngSpawn = this.rng.fork('spawn');
    this.rngPatrol = this.rng.fork('patrol');
    this.rngArrival = this.rng.fork('arrival');

    this.pool = o.pool || new FieldPool(this.map.tiles.length);

    this.tick = 0;
    this.over = false;
    this.won = false;
    this.loseReason = null;

    this.player = { x: o.level.spawn.x, y: o.level.spawn.y, dir: STAY, prevDir: STAY };
    this.caches = o.level.caches.map((c) => ({ x: c.x, y: c.y, collected: false }));
    this.collected = 0;
    this.dropUnlocked = false;

    /**
     * The portal is drawn fresh for every attempt, from the run's own stream rather than
     * the level's. Restarting a district therefore re-rolls where the exit will be, so a
     * failed run teaches you the map but not the route, and it stays reproducible for a
     * given run seed -- which is what the determinism criterion actually hashes.
     *
     * It is also not revealed until every key is collected: until then the player does
     * not know which way they will eventually need to run, and neither does the
     * predictor's drop-proximity feature, which is gated on the same flag.
     */
    this.portal = this._choosePortal(o.level);
    this.drop = this.portal;              // legacy alias; the predictor view reads `drop`

    /** Lightning bolts: three seconds at double speed. Copied, never shared with the level. */
    this.bolts = (o.level.bolts || []).map((b) => ({ x: b.x, y: b.y, taken: false }));
    this.boostTicks = 0;
    this.boostsUsed = 0;

    /** Coins. Value, not count, is what the score and the wallet care about. */
    this.coins = (o.level.coins || []).map((c) => ({ x: c.x, y: c.y, value: c.value, taken: false }));
    this.coinValue = 0;
    this.coinsTaken = 0;

    /**
     * What the player brought in with them, bought from the shop. The run spends from a
     * copy: the profile is only debited once the run ends, so a crash mid-district does
     * not silently eat someone's charges.
     */
    const loadout = o.loadout || {};
    this.loadout = {
      stunGun: !!loadout.stunGun,
      bullets: Math.min(STUN_GUN_CAPACITY, loadout.bullets || 0),
      boltSeconds: Math.max(0, loadout.boltSeconds || 0),
    };
    this.startingLoadout = { ...this.loadout };
    /** Banked lightning, in ticks, drained only while the player has it switched on. */
    this.boltBankTicks = Math.round(this.loadout.boltSeconds * TICKS_PER_SECOND);
    this.boltOn = false;
    this.stuns = 0;
    this.shotsFired = 0;

    /** Next tick at which one alien splits into two. Redrawn after every split. */
    this.splitAt = null;
    this.splits = 0;

    this.patrols = [];
    this.nextPatrolId = 1;
    this.alertTicks = 0;
    this.lastKnown = null;
    this.detections = 0;
    this.spawnCount = 0;
    this.peakAliens = 0;
    this.spawnLog = [];
    this.firstEncounterTick = null;
    this.firstDetectionTick = null;

    /**
     * Entropy snapshots at fixed ticks.
     *
     * Comparing end-of-run visit entropy between spawner modes is confounded, and badly:
     * a sharper spawner kills the player sooner, a shorter run covers fewer districts, and
     * so the better predictor LOOKS like it makes players more predictable when all it did
     * was end the run early. Snapshotting at fixed ticks gives a length-matched comparison
     * -- same number of ticks of walking, different amount of pressure.
     */
    this.entropyMarks = o.entropyMarks || [40, 80, 160];
    this.entropyAt = {};

    this.visits = new Int32Array(this.regions.count);
    this.visitedCells = new Uint8Array(this.map.tiles.length);
    this.log = [];

    this.arrivals = new ArrivalProcess({
      lambdaBase: this.params.lambdaBase,
      lambdaScale: o.lambdaScale ?? 1,
      graceTicks: this.params.spawnGraceTicks,
      rng: this.rngArrival,
    });

    // --- static distance fields, computed once per level ---
    this._coverField = this._staticField(
      this._cellsOfType(TILE.COVER),
      /* emptyFallback */ 999,
    );
    this._dropField = this._staticField([this.portal.y * this.map.w + this.portal.x], UNREACHABLE);

    // --- per-tick memoised fields ---
    this._memo = {
      // The player field is the HUMAN's; the alien field is the aliens'. They differ
      // wherever there is rubble, and conflating them is the whole bug class buildings
      // introduced.
      player: { tick: -1, arr: new Int16Array(this.map.tiles.length) },
      alienToPlayer: { tick: -1, arr: new Int16Array(this.map.tiles.length) },
      patrols: { tick: -1, arr: new Int16Array(this.map.tiles.length) },
      caches: { stamp: -1, arr: new Int16Array(this.map.tiles.length) },
    };

    // --- objective legs, for the directness and ordering traits ---
    this._leg = null;
    this._startLeg();

    this._view = this._buildView();

    // The district is already staffed. These go through the same spawner and therefore
    // the same four constraints as any later arrival.
    const wanted = Math.min(o.initialPatrols ?? this.params.initialPatrols ?? 0, this.params.maxPatrols);
    for (let i = 0; i < wanted; i++) {
      if (!this.spawnPolicy?.arrive) break;
      const spawn = this.spawnPolicy.arrive(this.view, this.rngSpawn);
      if (spawn) this._addPatrol(spawn);
    }
    this._scheduleSplit();

    /**
     * Par: a greedy nearest-key route plus the run to the portal, with slack for the fact
     * that nobody walks a shortest path through a district with things hunting them. The
     * speed component of the score is measured against this, so it has to be computed
     * from THIS run's portal rather than the level's geometry alone.
     */
    this.par = this._computePar();

    // Tick 0 is a real tick of standing still: it is where the player's first region
    // observation and the first entry in the visit histogram come from.
    this._record({ moved: false, collectedNow: false, detectedNow: false, spawnedNow: false });
  }

  /**
   * Pick this run's portal site. Weighted toward the far end of the district -- the
   * furthest site is the most likely, but not certain -- so the exit is unpredictable
   * without ever being next to the spawn.
   */
  _choosePortal(level) {
    const sites = level.portalCandidates;
    if (!sites || sites.length === 0) {
      return level.drop ? { x: level.drop.x, y: level.drop.y } : { x: level.spawn.x, y: level.spawn.y };
    }
    const far = sites.slice(0, Math.max(1, Math.ceil(sites.length / 2)));
    const weights = far.map((p) => Math.max(1, p.dist));
    const pick = far[this.rng.fork('portal').categorical(weights)];
    return { x: pick.x, y: pick.y };
  }

  /** Slack on the optimal route. Par is a fair target, not a speedrun record. */
  static PAR_SLACK = 1.35;

  _computePar() {
    const buf = this.pool.take();
    let cx = this.player.x, cy = this.player.y;
    let total = 0;
    const left = this.caches.map((c) => ({ x: c.x, y: c.y }));
    while (left.length) {
      const field = bfsField(this.map, cx, cy, buf, HUMAN);
      let best = -1, bestD = Infinity;
      for (let i = 0; i < left.length; i++) {
        const d = field[left[i].y * this.map.w + left[i].x];
        if (d !== UNREACHABLE && d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) break;
      total += bestD;
      cx = left[best].x; cy = left[best].y;
      left.splice(best, 1);
    }
    const field = bfsField(this.map, cx, cy, buf, HUMAN);
    const toPortal = field[this.portal.y * this.map.w + this.portal.x];
    if (toPortal !== UNREACHABLE) total += toPortal;
    this.pool.give(buf);
    return Math.max(20, Math.round(total * Game.PAR_SLACK));
  }

  _scheduleSplit() {
    const [lo, hi] = this.params.splitIntervalTicks || [80, 120];
    this.splitAt = this.tick + this.rngArrival.range(lo, hi);
  }

  // ---------------------------------------------------------------- geometry helpers

  _cellsOfType(t) {
    const out = [];
    for (let i = 0; i < this.map.tiles.length; i++) if (this.map.tiles[i] === t) out.push(i);
    return out;
  }

  _staticField(sources, emptyFallback, blocks = HUMAN) {
    if (sources.length === 0) return new Int16Array(this.map.tiles.length).fill(emptyFallback);
    const buf = this.pool.take();
    const arr = Int16Array.from(bfsFrom(this.map, sources, buf, blocks));
    this.pool.give(buf);
    return arr;
  }

  /** BFS distance from the player over HUMAN-walkable ground. */
  fieldPlayer() {
    const m = this._memo.player;
    if (m.tick !== this.tick) {
      const buf = this.pool.take();
      bfsField(this.map, this.player.x, this.player.y, buf, HUMAN);
      m.arr.set(buf.dist);
      this.pool.give(buf);
      m.tick = this.tick;
    }
    return m.arr;
  }

  /**
   * Distance to the player as an ALIEN measures it -- straight through rubble. This is
   * what a hunting alien descends and what the spawner's minimum-distance constraint is
   * checked against, because the honest question is how fast the thing can reach you,
   * not how far you would have to walk.
   */
  fieldAlienToPlayer() {
    const m = this._memo.alienToPlayer;
    if (m.tick !== this.tick) {
      const buf = this.pool.take();
      bfsField(this.map, this.player.x, this.player.y, buf, ALIEN);
      m.arr.set(buf.dist);
      this.pool.give(buf);
      m.tick = this.tick;
    }
    return m.arr;
  }

  /** BFS distance from the nearest patrol. Only the predictor asks for this. */
  fieldPatrols() {
    const m = this._memo.patrols;
    if (m.tick !== this.tick) {
      if (this.patrols.length === 0) m.arr.fill(UNREACHABLE);
      else {
        const buf = this.pool.take();
        bfsFrom(this.map, this.patrols.map((p) => p.y * this.map.w + p.x), buf, ALIEN);
        m.arr.set(buf.dist);
        this.pool.give(buf);
      }
      m.tick = this.tick;
    }
    return m.arr;
  }

  /** BFS distance from the nearest uncollected cache. Invalidated on collection. */
  fieldCaches() {
    const m = this._memo.caches;
    if (m.stamp !== this.collected) {
      const src = this.caches.filter((c) => !c.collected).map((c) => c.y * this.map.w + c.x);
      if (src.length === 0) m.arr.fill(UNREACHABLE);
      else {
        const buf = this.pool.take();
        bfsFrom(this.map, src, buf, HUMAN);
        m.arr.set(buf.dist);
        this.pool.give(buf);
      }
      m.stamp = this.collected;
    }
    return m.arr;
  }

  /** The player's effective detection radius: halved while standing in water. */
  get effectiveRadius() {
    return this.onCover ? this.params.detectRadius / 2 : this.params.detectRadius;
  }

  /**
   * Cells the player covers per tick. Doubled by either boost source: a bolt picked up
   * off the map (automatic, three seconds) or banked lightning bought from the shop
   * (manual, drains only while switched on).
   */
  get speed() {
    return this.boosted ? (this.params.boostSpeed || 2) : 1;
  }

  get boosted() { return this.boostTicks > 0 || (this.boltOn && this.boltBankTicks > 0); }

  /** Is the player standing inside a black box? */
  get inSafeBox() {
    return this.map.tiles[this.player.y * this.map.w + this.player.x] === TILE.SAFE;
  }

  /**
   * Fire the stun gun. Every alien whose detection range currently contains the player is
   * stunned, one charge each -- deliberately not every alien in the district, so the gun
   * answers the threat you are actually in rather than clearing the map.
   * @returns {{fired:number, spent:number, reason:string|null}}
   */
  fireStun() {
    if (!this.loadout.stunGun) return { fired: 0, spent: 0, reason: 'no gun' };
    if (this.loadout.bullets <= 0) return { fired: 0, spent: 0, reason: 'out of charges' };

    const inRange = this.patrols.filter((p) => (
      !this._isInert(p) &&
      euclid(p.x, p.y, this.player.x, this.player.y) <= this.effectiveRadius
    ));
    if (inRange.length === 0) return { fired: 0, spent: 0, reason: 'nothing in range' };

    // Nearest first, so a partial magazine answers the closest threat.
    inRange.sort((a, b) =>
      euclid(a.x, a.y, this.player.x, this.player.y) - euclid(b.x, b.y, this.player.x, this.player.y));

    let spent = 0;
    for (const p of inRange) {
      if (this.loadout.bullets <= 0) break;
      p.stunnedUntil = this.tick + this.params.stunTicks;
      this.loadout.bullets--;
      spent++;
      this.stuns++;
    }
    this.shotsFired++;
    return { fired: spent, spent, reason: null };
  }

  /** Switch banked lightning on or off. Returns whether it is now on. */
  setBolt(on) {
    this.boltOn = !!on && this.boltBankTicks > 0;
    return this.boltOn;
  }

  get boltSecondsLeft() { return this.boltBankTicks / TICKS_PER_SECOND; }

  /**
   * What the aliens are allowed to believe about the objectives.
   *
   * Below ULTRA they are never told which keys you have taken, so every key still reads
   * as live to the predictor's objective features and the portal never reads as open.
   * They model how you MOVE and nothing else. At ULTRA they are told, and interception
   * near the keys you have left gets noticeably sharper.
   */
  get belief() {
    if (this.params.aliensKnowKeys) {
      return { caches: this.caches, dropUnlocked: this.dropUnlocked };
    }
    if (!this._blindBelief) {
      this._blindBelief = this.caches.map((c) => ({ x: c.x, y: c.y, collected: false }));
    }
    return { caches: this._blindBelief, dropUnlocked: false };
  }

  /** The portal only exists, visually and mechanically, once every key is in hand. */
  get portalRevealed() { return this.dropUnlocked; }

  get onCover() {
    return this.map.tiles[this.player.y * this.map.w + this.player.x] === TILE.COVER;
  }

  get playerRegion() {
    return this.regions.regionOf[this.player.y * this.map.w + this.player.x];
  }

  /** Euclidean distance to the nearest patrol. Matches the radius-based detection model. */
  nearestPatrolDist() {
    let best = Infinity;
    for (const p of this.patrols) {
      const d = euclid(p.x, p.y, this.player.x, this.player.y);
      if (d < best) best = d;
    }
    return best;
  }

  // ---------------------------------------------------------------- the injected view

  _buildView() {
    const game = this;
    return {
      get tick() { return game.tick; },
      get map() { return game.map; },
      get regions() { return game.regions; },
      get player() { return game.player; },
      get patrols() { return game.patrols; },
      get caches() { return game.caches; },
      get drop() { return game.portal; },
      get portal() { return game.portal; },
      get portalRevealed() { return game.portalRevealed; },
      get dropUnlocked() { return game.dropUnlocked; },
      get bolts() { return game.bolts; },
      get coins() { return game.coins; },
      get boosted() { return game.boosted; },
      get inSafeBox() { return game.inSafeBox; },
      /** What the aliens are allowed to believe -- see Game#belief. */
      get belief() { return game.belief; },
      get visited() { return game.visitedCells; },
      get viewRadius() { return game.effectiveRadius; },
      get alertTicks() { return game.alertTicks; },
      get params() { return game.params; },
      get kAhead() { return game.params.kAhead; },
      get tau() { return game.tau; },
      get level() { return game.level.level; },
      get entropyBits() { return entropyBits(game.visits); },
      get visits() { return game.visits; },
      fields: {
        get player() { return game.fieldPlayer(); },
        get alienToPlayer() { return game.fieldAlienToPlayer(); },
        get patrols() { return game.fieldPatrols(); },
        get caches() { return game.fieldCaches(); },
        get drop() { return game._dropField; },
        get cover() { return game._coverField; },
      },
    };
  }

  get view() { return this._view; }

  // ---------------------------------------------------------------- objective legs

  _startLeg() {
    const buf = this.pool.take();
    const field = Int16Array.from(bfsField(this.map, this.player.x, this.player.y, buf, HUMAN));
    this.pool.give(buf);
    const candidates = this.caches
      .filter((c) => !c.collected)
      .map((c) => ({ c, d: field[c.y * this.map.w + c.x] }))
      .filter((e) => e.d !== UNREACHABLE)
      .sort((a, b) => a.d - b.d);
    this._leg = { field, moves: 0, candidates, from: { x: this.player.x, y: this.player.y } };
  }

  // ---------------------------------------------------------------- the tick

  /**
   * Advance one tick.
   * @param {number} inputDir direction index 0-3, or STAY (-1)
   * @returns {boolean} whether the run is still live
   */
  step(inputDir = STAY, actions = null) {
    if (this.over) return false;

    // Actions resolve before movement and are part of the input sequence, so a replay of
    // (seed, inputs) still reproduces the run exactly -- which is what the determinism
    // criterion hashes.
    let stunResult = null;
    if (actions) {
      if (actions.bolt !== undefined) this.setBolt(actions.bolt);
      if (actions.stun) stunResult = this.fireStun();
    }

    const prev = { x: this.player.x, y: this.player.y };
    this.player.prevDir = this.player.dir;

    // --- 1. the player moves, once normally or twice while boosted ---
    let moved = false;
    let dir = STAY;
    let collectedNow = false;
    let boltNow = false;
    const steps = this.speed;

    for (let m = 0; m < steps; m++) {
      if (inputDir >= 0 && inputDir < 4) {
        const nx = this.player.x + DIRS[inputDir].dx;
        const ny = this.player.y + DIRS[inputDir].dy;
        if (isWalkable(this.map, nx, ny)) {
          this.player.x = nx; this.player.y = ny;
          moved = true;
          this._leg.moves++;
          this._memo.player.tick = -1;
          this._memo.alienToPlayer.tick = -1;
        }
        // Walking into a wall still counts as an intent: the heading traits should see
        // that the player meant to keep going, even though the cell refused.
        dir = inputDir;
      }
      this.player.dir = dir;

      // --- 2. caught by walking into an alien ---
      if (this._collides()) return this._finish(false, LOSE.CAUGHT, { moved, dir });

      // --- 3. objectives, picked up on every cell crossed, not only the last ---
      for (const c of this.caches) {
        if (!c.collected && c.x === this.player.x && c.y === this.player.y) {
          c.collected = true;
          this.collected++;
          collectedNow = true;
          const field = this._leg.field;
          const shortest = field[c.y * this.map.w + c.x];
          const rank = this._leg.candidates.findIndex((e) => e.c.x === c.x && e.c.y === c.y);
          this.observer?.onObjective?.({
            movesTaken: this._leg.moves,
            shortest: shortest === UNREACHABLE ? 0 : shortest,
            rank: rank < 0 ? 0 : rank,
            candidates: this._leg.candidates.length,
            cache: { x: c.x, y: c.y },
            tick: this.tick,
          });
          this._startLeg();
          break;
        }
      }
      for (const c of this.coins) {
        if (!c.taken && c.x === this.player.x && c.y === this.player.y) {
          c.taken = true;
          this.coinValue += c.value;
          this.coinsTaken++;
          break;
        }
      }
      for (const b of this.bolts) {
        if (!b.taken && b.x === this.player.x && b.y === this.player.y) {
          b.taken = true;
          boltNow = true;
          this.boostsUsed++;
          // Refresh rather than stack: two bolts in a row give six seconds of double
          // speed, not three seconds of quadruple speed.
          this.boostTicks = this.params.boostTicks || 24;
          break;
        }
      }
      if (!this.dropUnlocked && this.collected >= this.caches.length) {
        this.dropUnlocked = true;
        this._startLeg();                 // the final leg is last key -> portal
      }

      // --- 4. win, checked before the aliens move ---
      // Deliberately generous: standing on an open portal ends the run in your favour
      // even if an alien would have stepped onto you this tick. Losing on the exit tile
      // reads as a bug to a player regardless of whether it is one.
      if (this.portalRevealed && this.player.x === this.portal.x && this.player.y === this.portal.y) {
        return this._finish(true, null, { moved, dir, collectedNow, boltNow });
      }
    }

    // --- 5. arrivals ---
    let spawnedNow = false;
    const nArrivals = this.arrivals.step(this.tick);
    for (let a = 0; a < nArrivals; a++) {
      if (this.patrols.length >= this.params.maxPatrols) break;
      if (!this.spawnPolicy?.arrive) break;
      const spawn = this.spawnPolicy.arrive(this.view, this.rngSpawn);
      if (!spawn) continue;
      this._addPatrol(spawn);
      spawnedNow = true;
    }

    // --- 6. one alien splits in two, then they all move ---
    const splitNow = this._maybeSplit();
    this._movePatrols();

    // --- 7. detection ---
    let detectedNow = false;
    const threat = this.nearestPatrolDist();
    if (this.firstEncounterTick === null && threat <= this.params.detectRadius) {
      this.firstEncounterTick = this.tick;
    }
    for (const p of this.patrols) {
      if (this._isInert(p)) continue;                      // a stunned alien sees nothing
      if (euclid(p.x, p.y, this.player.x, this.player.y) <= this.effectiveRadius) {
        detectedNow = true;
        break;
      }
    }

    // A black box is not cover, it is erasure: nothing can see in, and the moment you are
    // inside, whatever they knew about where you went is gone. That is what makes it a
    // way out of a chase rather than a slightly better hiding place.
    if (this.inSafeBox) {
      detectedNow = false;
      this.alertTicks = 0;
      this.lastKnown = null;
      this.safeTicks = (this.safeTicks || 0) + 1;
    }

    const alertWasCalm = this.alertTicks === 0;
    if (detectedNow) {
      this.detections++;
      this.alertTicks = this.params.alertTicks;
      this.lastKnown = { x: this.player.x, y: this.player.y };
      if (this.firstDetectionTick === null) this.firstDetectionTick = this.tick;
    } else if (this.alertTicks > 0) {
      this.alertTicks--;
    }

    // --- 8. caught by a patrol stepping onto you, or swapping through you ---
    if (this._collides() || this._swapped(prev)) {
      return this._finish(false, LOSE.CAUGHT, { moved, dir, detectedNow, spawnedNow, collectedNow, boltNow });
    }

    // --- 9. bookkeeping ---
    if (this.boostTicks > 0) this.boostTicks--;
    if (this.boltOn) {
      this.boltBankTicks--;
      this.loadout.boltSeconds = this.boltBankTicks / TICKS_PER_SECOND;
      if (this.boltBankTicks <= 0) { this.boltBankTicks = 0; this.boltOn = false; }
    }

    this._record({
      moved, dir, collectedNow, boltNow, detectedNow, spawnedNow, splitNow,
      stunNow: !!(stunResult && stunResult.fired),
      alertStarted: detectedNow && alertWasCalm,
    });

    if (this.tick >= this.maxTicks) return this._finish(false, LOSE.TIMEOUT, {});
    return true;
  }

  /**
   * Every ten to fifteen seconds one alien, chosen at random, splits in two.
   *
   * The new one is placed on a cell adjacent to its parent so it is visibly a division
   * rather than a spawn, and it inherits the parent's shift clock so the population
   * does not become immortal just by dividing. If there is nothing to split -- the map
   * is empty of aliens -- the window is simply redrawn.
   *
   * This overrides the concurrent cap on purpose: the cap governs ARRIVALS, and division
   * is not an arrival. See decisions.md for what that does to run length.
   */
  _maybeSplit() {
    if (this.splitAt === null || this.tick < this.splitAt) return false;
    if (this.patrols.length === 0) { this._scheduleSplit(); return false; }

    // A division is held to the SAME minimum distance as an arrival.
    //
    // The first version placed the child on any free cell beside its parent, and across
    // a thousand episodes 128 of them landed inside the eight-cell floor, one of them
    // directly adjacent to the player. That is precisely the failure the spawner's
    // minimum distance exists to prevent: an alien silently becomes two, the second one
    // is on top of you, and the death reads as the game cheating rather than as
    // something you could have avoided. A division that cannot happen fairly is deferred
    // a couple of seconds instead, which during a close chase means the squad does not
    // get to double while it has you cornered.
    const field = this.fieldAlienToPlayer();
    const minDist = this.params.spawnMinDist;
    const distAt = (x, y) => {
      const d = field[y * this.map.w + x];
      return d === UNREACHABLE ? Infinity : d;
    };

    const parents = [...this.patrols].sort((a, b) => distAt(b.x, b.y) - distAt(a.x, a.y));
    for (const parent of parents) {
      const spots = [];
      for (let k = 0; k < 4; k++) {
        const nx = parent.x + DIRS[k].dx;
        const ny = parent.y + DIRS[k].dy;
        if (!isAlienPassable(this.map, nx, ny)) continue;
        if (nx === this.player.x && ny === this.player.y) continue;
        if (this.patrols.some((q) => q.x === nx && q.y === ny)) continue;
        const d = distAt(nx, ny);
        if (d < minDist) continue;
        spots.push({ x: nx, y: ny, d });
      }
      if (spots.length === 0) continue;
      // Furthest legal cell, so the division opens away from the player rather than toward.
      spots.sort((a, b) => b.d - a.d);
      const at = spots[0];

      const child = {
        id: this.nextPatrolId++,
        x: at.x, y: at.y, prevX: at.x, prevY: at.y,
        dir: STAY,
        mode: parent.mode,
        target: null,
        field: null,
        moveAcc: 0,
        spawnedAt: this.tick,
        spawnRegion: this.regions.regionOf[at.y * this.map.w + at.x],
        reason: `division of unit ${parent.id}`,
        fallback: false,
        bornFromSplit: true,
      };
      this.patrols.push(child);
      this.splits++;
      this._memo.patrols.tick = -1;
      this._assignIntercept(child);
      this.spawnLog.push({
        tick: this.tick, x: at.x, y: at.y, region: child.spawnRegion,
        reason: child.reason, fallback: false, tries: 0, split: true,
        playerDist: at.d,
        topP: null, top: null,
      });
      this._scheduleSplit();

    /**
     * Par: a greedy nearest-key route plus the run to the portal, with slack for the fact
     * that nobody walks a shortest path through a district with things hunting them. The
     * speed component of the score is measured against this, so it has to be computed
     * from THIS run's portal rather than the level's geometry alone.
     */
    this.par = this._computePar();
      return true;
    }

    // Nobody could divide without crowding the player. Try again shortly.
    this.splitAt = this.tick + (this.params.splitDeferTicks || 16);
    return false;
  }

  /**
   * ALIENS NEVER LEAVE, and this used to be the opposite.
   *
   * There was a birth-death process here: each alien drew an exponential shift length and
   * retired once it was calm and "off-screen", where off-screen meant more than a detection
   * radius or so from the player. That guard is nonsense in this game. The whole 32x20
   * district is on screen at all times, so there is no off-screen -- every retirement
   * happened in full view, and from the player's side an alien simply blinked out of
   * existence and another blinked in somewhere else a few seconds later.
   *
   * The population is bounded by the arrival cap instead: arrivals stop at maxPatrols, so
   * the Poisson process fills up to the cap and then waits. Division deliberately ignores
   * that cap (see _maybeSplit), which is the only way the count grows past it.
   */

  /**
   * A stunned alien is inert for the whole five seconds: it cannot see, cannot move, and
   * cannot catch you. Walking over one is free.
   *
   * This is what makes the stun gun worth 500 coins. Without it the charge buys a pause
   * and nothing else -- you would still have to go around something lying on the floor,
   * which in a one-wide corridor means the gun cannot open the route it was fired to
   * open.
   */
  _isInert(p) { return (p.stunnedUntil || 0) > this.tick; }

  _collides() {
    for (const p of this.patrols) {
      if (this._isInert(p)) continue;
      if (p.x === this.player.x && p.y === this.player.y) return true;
    }
    return false;
  }

  /** The player and an alien traded cells, which would otherwise let them pass through. */
  _swapped(prev) {
    for (const p of this.patrols) {
      if (this._isInert(p)) continue;
      if (p.prevX === this.player.x && p.prevY === this.player.y && p.x === prev.x && p.y === prev.y) return true;
    }
    return false;
  }

  _addPatrol(spawn) {
    const p = {
      id: this.nextPatrolId++,
      x: spawn.x, y: spawn.y, prevX: spawn.x, prevY: spawn.y,
      dir: STAY,
      mode: 'intercept',
      target: null,
      field: null,
      moveAcc: 0,
      spawnedAt: this.tick,
      spawnRegion: spawn.region,
      reason: spawn.reason || '',
      fallback: !!spawn.fallback,
    };
    this.patrols.push(p);
    this.spawnCount++;
    this.spawnLog.push({
      tick: this.tick, x: spawn.x, y: spawn.y, region: spawn.region,
      reason: spawn.reason || '', fallback: !!spawn.fallback, tries: spawn.tries ?? 0,
      playerDist: this.fieldAlienToPlayer()[spawn.y * this.map.w + spawn.x],
      topP: spawn.prediction?.topP ?? null,
      top: spawn.prediction?.top ?? null,
    });
    this._assignIntercept(p);
    this._memo.patrols.tick = -1;
  }

  _assignIntercept(p) {
    const got = this.spawnPolicy?.intercept?.(this.view, this.rngSpawn, p);
    const target = got || { x: this.portal.x, y: this.portal.y, region: -1 };
    this._setTarget(p, target, 'intercept');
  }

  /** Give an alien a destination and the field it will descend to get there. */
  _setTarget(p, target, mode) {
    p.target = { x: target.x, y: target.y, region: target.region ?? -1 };
    p.mode = mode;
    p.role = target.role || mode;
    const buf = this.pool.take();
    // ALIEN, not HUMAN: an alien that refuses to cut through rubble is just a slow human.
    bfsField(this.map, target.x, target.y, buf, ALIEN);
    p.field = Int16Array.from(buf.dist);
    this.pool.give(buf);
  }

  /**
   * Ask the squad for a joint assignment. Re-planned on a cadence rather than every tick
   * because each cutoff role costs a BFS, and a plan that changes eight times a second
   * produces aliens that jitter instead of committing.
   */
  _coordinate(force = false) {
    if (!this.spawnPolicy?.assign || this.patrols.length === 0) return;
    const every = this.params.coordEvery || 6;
    if (!force && this.tick % every !== 0) return;
    const plan = this.spawnPolicy.assign(this.view, this.rngSpawn, this.patrols);
    if (!plan) return;
    for (const p of this.patrols) {
      const t = plan.get(p.id);
      if (!t) continue;
      p.role = t.role;
      // A chaser rides the shared live field; no per-alien BFS and no stale target.
      if (t.role === 'chase') { p.mode = 'hunt'; p.target = null; p.field = null; continue; }
      if (p.target && p.target.x === t.x && p.target.y === t.y && p.field) { p.mode = t.role; continue; }
      this._setTarget(p, t, t.role);
    }
  }

  _movePatrols() {
    this._coordinate();
    const hunting = this.alertTicks > 0;
    // One shared field for everyone running the player down directly.
    const chaseField = hunting ? this.fieldAlienToPlayer() : null;

    for (const p of this.patrols) {
      p.prevX = p.x; p.prevY = p.y;
      if (this._isInert(p)) continue;                      // stunned: nothing moves

      let field = null;
      if (hunting) {
        // Alert overrides everything, but not identically for everyone: chasers close,
        // cutoffs hold a route. Anything without a usable cutoff field falls back to
        // chasing rather than standing still.
        if (p.role === 'cutoff' && p.field) { p.mode = 'cutoff'; field = p.field; }
        else { p.mode = 'hunt'; field = chaseField; }
      } else if (p.mode === 'hunt' || p.mode === 'cutoff') {
        // The alert just lapsed: fall back to the last cell the player was seen in.
        const lk = this.lastKnown || this.portal;
        this._setTarget(p, { x: lk.x, y: lk.y, region: this.regions.regionOf[lk.y * this.map.w + lk.x] }, 'search');
        field = p.field;
      } else {
        if (!p.field || !p.target) this._assignIntercept(p);
        if (p.x === p.target.x && p.y === p.target.y) {
          // Arrived. Re-plan the whole squad rather than only this one, so the districts
          // stay divided up instead of drifting into overlap one alien at a time.
          this._coordinate(true);
          if (!p.target || (p.x === p.target.x && p.y === p.target.y)) this._assignIntercept(p);
        }
        field = p.field;
      }

      const period = (p.mode === 'hunt' || p.mode === 'cutoff')
        ? this.params.chaseMovePeriod
        : this.params.patrolMovePeriod;
      p.moveAcc += 1;
      if (p.moveAcc < period) continue;
      p.moveAcc -= period;

      if (!field) continue;
      const occupied = (nx, ny) => this.patrols.some((q) => q !== p && q.x === nx && q.y === ny);
      const d = stepDownhill(this.map, field, p.x, p.y, this.rngPatrol, occupied, ALIEN);
      if (d >= 0) {
        p.x += DIRS[d].dx; p.y += DIRS[d].dy;
        p.dir = d;
      }
    }
    if (this.patrols.length) this._memo.patrols.tick = -1;
  }

  _record(info) {
    const i = this.player.y * this.map.w + this.player.x;
    const region = this.regions.regionOf[i];
    const revisit = this.visitedCells[i] === 1;
    this.visits[region]++;
    this.visitedCells[i] = 1;
    if (this.entropyMarks.includes(this.tick)) this.entropyAt[this.tick] = entropyBits(this.visits);

    if (this.patrols.length > this.peakAliens) this.peakAliens = this.patrols.length;

    const threatDist = this.nearestPatrolDist();
    const threatVisible = threatDist <= this.effectiveRadius;
    const wasVisible = this._prevThreatVisible === true;
    this._prevThreatVisible = threatVisible;

    if (this.observer?.onTick) {
      let deg = 0;
      for (let k = 0; k < 4; k++) {
        if (isWalkable(this.map, this.player.x + DIRS[k].dx, this.player.y + DIRS[k].dy)) deg++;
      }
      this.observer.onTick({
        t: this.tick,
        x: this.player.x, y: this.player.y,
        dir: info.dir ?? STAY,
        moved: !!info.moved,
        region,
        onCover: this.onCover,
        wallAdj: deg < 4,
        degree: deg,
        coverDist: this._coverField[i],
        revisit,
        alertTicks: this.alertTicks,
        alertStarted: !!info.alertStarted,
        threatDist,
        threatVisible,
        threatNewlyVisible: threatVisible && !wasVisible,
        cachesLeft: this.caches.length - this.collected,
        cacheDist: this.fieldCaches()[i],
      }, this.view);
    }

    if (this.logLevel !== 'none') {
      let flags = 0;
      if (info.moved) flags |= FLAG.MOVED;
      if (this.onCover) flags |= FLAG.ON_COVER;
      if (info.detectedNow) flags |= FLAG.DETECTED;
      if (info.collectedNow) flags |= FLAG.COLLECTED;
      if (info.spawnedNow) flags |= FLAG.SPAWNED;
      if (this.boosted) flags |= FLAG.BOOSTED;
      if (info.splitNow) flags |= FLAG.SPLIT;
      if (info.stunNow) flags |= FLAG.STUNNED;
      if (this.inSafeBox) flags |= FLAG.IN_SAFE;
      if (info.won) flags |= FLAG.WON;
      if (info.lost) flags |= FLAG.LOST;
      const row = [this.tick, this.player.x, this.player.y, info.dir ?? STAY, flags, this.alertTicks];
      if (this.logLevel === 'full') {
        for (const p of this.patrols) { row.push(p.x, p.y); }
      }
      this.log.push(row);
    }

    this.tick++;
  }

  _finish(won, reason, info) {
    this.over = true;
    this.won = won;
    this.loseReason = won ? null : reason;
    this._record({ ...info, won, lost: !won });
    this.tick--;                           // _record advanced it; the run ends on this tick

    const finalLeg = this.dropUnlocked && this._leg
      ? { movesTaken: this._leg.moves, shortest: this._leg.field[this.drop.y * this.map.w + this.drop.x] }
      : null;
    this.observer?.onRunEnd?.(this.summary(), finalLeg);
    return false;
  }

  // ---------------------------------------------------------------- results

  get entropy() { return entropyBits(this.visits); }
  get score() { return entropyScore(this.visits, this.regions.count); }

  summary() {
    return {
      level: this.level.level,
      ticks: this.tick,
      seconds: this.tick / TICKS_PER_SECOND,
      won: this.won,
      loseReason: this.loseReason,
      entropy: this.entropy,
      score: this.score,
      collected: this.collected,
      caches: this.caches.length,
      detections: this.detections,
      spawns: this.spawnCount,
      splits: this.splits,
      boostsUsed: this.boostsUsed,
      peakAliens: this.peakAliens,
      coinValue: this.coinValue,
      coinsTaken: this.coinsTaken,
      stuns: this.stuns,
      shotsFired: this.shotsFired,
      par: this.par,
      safeTicks: this.safeTicks || 0,
      difficulty: this.params.difficulty,
      loadoutLeft: { ...this.loadout },
      firstEncounterTick: this.firstEncounterTick,
      firstDetectionTick: this.firstDetectionTick,
      visits: Array.from(this.visits),
      entropyAt: { ...this.entropyAt },
      logHash: this.logLevel === 'none' ? null : hashLog(this.log),
    };
  }

  /** The determinism criterion: same seed, same inputs, same hash. */
  hash() { return hashLog(this.log); }

  /** Rehydrate a log row into a tick sample, for predictor/traits.js extractTraits(). */
  hydrator() {
    const game = this;
    let prevRegion = -1;
    const visited = new Uint8Array(this.map.tiles.length);
    let prevThreatVisible = false;
    return (row) => {
      const [t, x, y, dir, flags, alert] = row;
      const i = y * game.map.w + x;
      let deg = 0;
      for (let k = 0; k < 4; k++) if (isWalkable(game.map, x + DIRS[k].dx, y + DIRS[k].dy)) deg++;
      let threatDist = Infinity;
      for (let j = 6; j + 1 < row.length; j += 2) {
        const d = euclid(row[j], row[j + 1], x, y);
        if (d < threatDist) threatDist = d;
      }
      const onCover = (flags & FLAG.ON_COVER) !== 0;
      const radius = onCover ? game.params.detectRadius / 2 : game.params.detectRadius;
      const threatVisible = threatDist <= radius;
      const sample = {
        t, x, y, dir,
        moved: (flags & FLAG.MOVED) !== 0,
        region: game.regions.regionOf[i],
        onCover,
        wallAdj: deg < 4,
        degree: deg,
        coverDist: game._coverField[i],
        revisit: visited[i] === 1,
        alertTicks: alert,
        alertStarted: (flags & FLAG.DETECTED) !== 0 && alert === game.params.alertTicks,
        threatDist,
        threatVisible,
        threatNewlyVisible: threatVisible && !prevThreatVisible,
        cachesLeft: 0,
        cacheDist: 0,
      };
      visited[i] = 1;
      prevRegion = sample.region;
      prevThreatVisible = threatVisible;
      return sample;
    };
  }
}

export { hashLog };
