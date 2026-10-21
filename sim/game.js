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

import { TILE, DIRS, STAY, isWalkable, euclid } from './grid.js';
import { FieldPool, bfsFrom, bfsField, stepDownhill, UNREACHABLE } from './pathfind.js';
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
    this.drop = { x: o.level.drop.x, y: o.level.drop.y };

    this.patrols = [];
    this.nextPatrolId = 1;
    this.alertTicks = 0;
    this.lastKnown = null;
    this.detections = 0;
    this.spawnCount = 0;
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
    this._dropField = this._staticField([this.drop.y * this.map.w + this.drop.x], UNREACHABLE);

    // --- per-tick memoised fields ---
    this._memo = {
      player: { tick: -1, arr: new Int16Array(this.map.tiles.length) },
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

    // Tick 0 is a real tick of standing still: it is where the player's first region
    // observation and the first entry in the visit histogram come from.
    this._record({ moved: false, collectedNow: false, detectedNow: false, spawnedNow: false });
  }

  // ---------------------------------------------------------------- geometry helpers

  _cellsOfType(t) {
    const out = [];
    for (let i = 0; i < this.map.tiles.length; i++) if (this.map.tiles[i] === t) out.push(i);
    return out;
  }

  _staticField(sources, emptyFallback) {
    if (sources.length === 0) return new Int16Array(this.map.tiles.length).fill(emptyFallback);
    const buf = this.pool.take();
    const arr = Int16Array.from(bfsFrom(this.map, sources, buf));
    this.pool.give(buf);
    return arr;
  }

  /** BFS distance from the player, recomputed at most once per tick. */
  fieldPlayer() {
    const m = this._memo.player;
    if (m.tick !== this.tick) {
      const buf = this.pool.take();
      bfsField(this.map, this.player.x, this.player.y, buf);
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
        bfsFrom(this.map, this.patrols.map((p) => p.y * this.map.w + p.x), buf);
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
        bfsFrom(this.map, src, buf);
        m.arr.set(buf.dist);
        this.pool.give(buf);
      }
      m.stamp = this.collected;
    }
    return m.arr;
  }

  /** The player's effective detection radius: halved while standing in cover. */
  get effectiveRadius() {
    return this.onCover ? this.params.detectRadius / 2 : this.params.detectRadius;
  }

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
      get drop() { return game.drop; },
      get dropUnlocked() { return game.dropUnlocked; },
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
    const field = Int16Array.from(bfsField(this.map, this.player.x, this.player.y, buf));
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
  step(inputDir = STAY) {
    if (this.over) return false;

    const prev = { x: this.player.x, y: this.player.y };
    this.player.prevDir = this.player.dir;

    // --- 1. the player moves ---
    let moved = false;
    let dir = STAY;
    if (inputDir >= 0 && inputDir < 4) {
      const nx = this.player.x + DIRS[inputDir].dx;
      const ny = this.player.y + DIRS[inputDir].dy;
      if (isWalkable(this.map, nx, ny)) {
        this.player.x = nx; this.player.y = ny;
        moved = true;
        dir = inputDir;
        this._leg.moves++;
      } else {
        // Walking into a wall still counts as an intent: the heading traits should see
        // that the player meant to keep going, even though the cell refused.
        dir = inputDir;
      }
    }
    this.player.dir = dir;
    this._memo.player.tick = -1;          // position changed, invalidate the field

    // --- 2. caught by walking into a patrol ---
    if (this._collides()) return this._finish(false, LOSE.CAUGHT, { moved, dir });

    // --- 3. objectives ---
    let collectedNow = false;
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
    if (!this.dropUnlocked && this.collected >= this.caches.length) {
      this.dropUnlocked = true;
      this._startLeg();                   // the final leg is last cache -> dead drop
    }

    // --- 4. win, checked before the patrols move ---
    // Deliberately generous: standing on the unlocked drop ends the run in your favour
    // even if a patrol would have stepped onto you this tick. Losing on the drop tile
    // reads as a bug to a player regardless of whether it is one.
    if (this.dropUnlocked && this.player.x === this.drop.x && this.player.y === this.drop.y) {
      return this._finish(true, null, { moved, dir, collectedNow });
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

    // --- 6. patrols retire, then the rest move ---
    this._retirePatrols();
    this._movePatrols();

    // --- 7. detection ---
    let detectedNow = false;
    const threat = this.nearestPatrolDist();
    if (this.firstEncounterTick === null && threat <= this.params.detectRadius) {
      this.firstEncounterTick = this.tick;
    }
    for (const p of this.patrols) {
      if (euclid(p.x, p.y, this.player.x, this.player.y) <= this.effectiveRadius) {
        detectedNow = true;
        break;
      }
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
      return this._finish(false, LOSE.CAUGHT, { moved, dir, detectedNow, spawnedNow, collectedNow });
    }

    // --- 9. bookkeeping ---
    this._record({ moved, dir, collectedNow, detectedNow, spawnedNow, alertStarted: detectedNow && alertWasCalm });

    if (this.tick >= this.maxTicks) return this._finish(false, LOSE.TIMEOUT, {});
    return true;
  }

  /**
   * End of shift. Nobody rotates out mid-hunt, and nobody disappears in plain sight:
   * a patrol vanishing in front of the player reads as a glitch and costs more
   * credibility than the balance is worth.
   */
  _retirePatrols() {
    if (this.alertTicks > 0 || this.patrols.length === 0) return;
    const keep = [];
    for (const p of this.patrols) {
      const offScreen = euclid(p.x, p.y, this.player.x, this.player.y) > this.params.detectRadius + 3;
      if (this.tick >= p.expiresAt && offScreen) continue;
      keep.push(p);
    }
    if (keep.length !== this.patrols.length) {
      this.patrols = keep;
      this._memo.patrols.tick = -1;
    }
  }

  _collides() {
    for (const p of this.patrols) if (p.x === this.player.x && p.y === this.player.y) return true;
    return false;
  }

  /** The player and a patrol traded cells, which would otherwise let them pass through. */
  _swapped(prev) {
    for (const p of this.patrols) {
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
      // Memoryless shift length. Retirement is checked only when the patrol is calm and
      // off-screen, so a patrol never evaporates while the player is watching it.
      expiresAt: this.tick + this.rngArrival.exponential(1 / Math.max(1, this.params.patrolLifetime)),
      spawnRegion: spawn.region,
      reason: spawn.reason || '',
      fallback: !!spawn.fallback,
    };
    this.patrols.push(p);
    this.spawnCount++;
    this.spawnLog.push({
      tick: this.tick, x: spawn.x, y: spawn.y, region: spawn.region,
      reason: spawn.reason || '', fallback: !!spawn.fallback, tries: spawn.tries ?? 0,
      playerDist: this.fieldPlayer()[spawn.y * this.map.w + spawn.x],
      topP: spawn.prediction?.topP ?? null,
      top: spawn.prediction?.top ?? null,
    });
    this._assignIntercept(p);
    this._memo.patrols.tick = -1;
  }

  _assignIntercept(p) {
    const got = this.spawnPolicy?.intercept?.(this.view, this.rngSpawn, p);
    const target = got || { x: this.drop.x, y: this.drop.y, region: -1 };
    p.target = target;
    p.mode = 'intercept';
    const buf = this.pool.take();
    bfsField(this.map, target.x, target.y, buf);
    p.field = Int16Array.from(buf.dist);
    this.pool.give(buf);
  }

  _movePatrols() {
    const playerField = this.alertTicks > 0 ? this.fieldPlayer() : null;
    for (const p of this.patrols) {
      p.prevX = p.x; p.prevY = p.y;

      // Mode selection. Alert overrides everything: for alertTicks ticks every patrol
      // receives the live player position, after which they fall back to the last known
      // cell and then resume their intercept.
      let field = null;
      if (this.alertTicks > 0) {
        p.mode = 'hunt';
        field = playerField;
      } else if (p.mode === 'hunt') {
        p.mode = 'search';
        const lk = this.lastKnown || this.drop;
        p.target = { x: lk.x, y: lk.y, region: this.regions.regionOf[lk.y * this.map.w + lk.x] };
        const buf = this.pool.take();
        bfsField(this.map, p.target.x, p.target.y, buf);
        p.field = Int16Array.from(buf.dist);
        this.pool.give(buf);
        field = p.field;
      } else {
        if (!p.field || !p.target) this._assignIntercept(p);
        if (p.x === p.target.x && p.y === p.target.y) {
          // Arrived. Ask the predictor where to go next -- this is why the model keeps
          // mattering after the spawn, instead of only at the moment of arrival.
          if (p.mode === 'search') this._assignIntercept(p);
          else this._assignIntercept(p);
        }
        field = p.field;
      }

      const period = p.mode === 'hunt' ? this.params.chaseMovePeriod : this.params.patrolMovePeriod;
      p.moveAcc += 1;
      if (p.moveAcc < period) continue;
      p.moveAcc -= period;

      if (!field) continue;
      const occupied = (nx, ny) => this.patrols.some((q) => q !== p && q.x === nx && q.y === ny);
      const d = stepDownhill(this.map, field, p.x, p.y, this.rngPatrol, occupied);
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
