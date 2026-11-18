// web3d/runner.js -- one district's game logic for the 3D page, with no DOM and no WebGL.
//
// The 3D counterpart of the game half of web/play.js: generate the level, wire the
// predictor system, build a Game3D with the opening freeze, wrap it in a Session3D. The
// page owns the frame loop, the camera and the HUD; this owns everything that decides
// what happens. Keeping it DOM-free is what lets the whole loop run under Node.

import { createSystem, resolveDifficulty } from '../sim/system.js';
import { regionAdjacency } from '../sim/regions.js';
import { FieldPool } from '../sim/pathfind.js';
import { hashString } from '../sim/prng.js';
import { Dossier } from '../sim/predictor/dossier.js';
import { Game3D } from '../sim3d/game3d.js';
import { Session3D } from '../sim3d/session.js';
import { TICK_HZ_3D } from '../sim3d/units.js';
import { thinBolts } from '../sim3d/bolts.js';
import { generateDistrict, rulesetOf, paramsFor } from '../sim3d/next/rules.js';
import { sizeFor } from '../sim3d/next/size.js';
import { Game3DNext } from '../sim3d/next/game.js';
import { nextSpawnPolicy } from '../sim3d/next/spawn.js';
import { GeometryChain } from '../sim3d/dispatch/geometry.js';
import { HabitAccumulator, HabitFile } from '../sim3d/dispatch/habits.js';

/** One field pool per map size, shared by every runner: a district reuses its buffers. */
const pools = new Map();
function poolFor(n) {
  if (!pools.has(n)) pools.set(n, new FieldPool(n));
  return pools.get(n);
}

export class DistrictRunner {
  /**
   * @param {object} o
   * @param {string} o.profileId      seeds the map: hash(profileId, district)
   * @param {number} o.district
   * @param {string} o.tier           'easy' | 'medium' | 'hard' | 'ultra'
   * @param {Dossier} [o.dossier]
   * @param {object}  [o.chain]       carry tier 1 across retries of one district
   * @param {object}  [o.difficulty]  { tau, lambdaScale } settled for this district
   * @param {object}  [o.loadout]
   * @param {string}  [o.seedKey]     distinguishes attempts
   * @param {number}  [o.tickHz]
   * @param {string}  [o.mode]
   * @param {boolean} [o.thinBolts]   default true: fewer bolts deeper into each belt
   * @param {string}  [o.ruleset]     'next' (default: N8's city maps) or 'classic' (32 x 20,
   *                                  the parity reference)
   * @param {HabitFile} [o.habits]    the file on your habits (N8.5, `next` only): its
   *                                  tactics act this run, and this run's habits are
   *                                  measured into `habitValues` for the caller to fold in
   */
  constructor(o) {
    this.o = o;
    this.district = o.district;
    this.ruleset = rulesetOf(o.ruleset);
    this.params = paramsFor(this.ruleset, o.district, o.tier);
    const size = this.ruleset === 'classic' ? 32 * 20 : sizeFor(o.district).w * sizeFor(o.district).h;
    const pool = poolFor(size);
    this.level = generateDistrict(this.ruleset, o.profileId, o.district, { pool, params: this.params });
    this.level.regions.adjacency ||= regionAdjacency(this.level.map, this.level.regions);
    // Fewer bolts deeper into each belt (spec-3d-next.md, N1). The runner's own copy of the
    // level; nothing generated for the 2D game is touched. `thinBolts: false` disables it.
    this.generatedBolts = this.level.bolts.length;
    if (o.thinBolts !== false) this.level.bolts = thinBolts(this.level.bolts, o.district, o.profileId);
    this.mode = o.mode || 'full';
    this.difficulty = o.difficulty || resolveDifficulty({ mode: this.mode, params: this.params, runs: [] });
    this.dossier = o.dossier || new Dossier();
    // `next` plays Game3DNext with its own arrival policy (N8.2) and, from N8.5, a Dispatch
    // that learns habits, not rooms: tier 1 is geometry only (GeometryChain), and the habit
    // file's tactics steer the squad. `classic` stays the plain Game3D on the Dispatch's
    // own spawner and room chain, the parity reference.
    const next = this.ruleset === 'next';
    this.system = createSystem({
      level: this.level, dossier: this.dossier, mode: this.mode,
      tau: this.difficulty.tau,
      chain: o.chain || (next ? new GeometryChain(this.level) : undefined),
    });
    this.seed = hashString(o.seedKey || `${o.profileId}#${o.district}`);
    this.spawnPolicy = next ? nextSpawnPolicy(this.system) : this.system.spawnPolicy;
    const GameClass = next ? Game3DNext : Game3D;
    this.habits = next ? (o.habits || new HabitFile()) : null;
    this.habitAcc = next ? new HabitAccumulator(this.level.map) : null;
    this.habitValues = null;
    const sys = this.system.observer;
    const observer = !next ? sys : {
      onTick: (sample, view) => {
        this.system.chain.locate?.(sample.x, sample.y);
        sys.onTick(sample, view);
        this.habitAcc.observe(sample, view);
      },
      onObjective: (info) => sys.onObjective(info),
      onRunEnd: (summary, leg) => { sys.onRunEnd(summary, leg); this.habitValues = this.habitAcc.values(); },
    };
    this.game = new GameClass({
      level: this.level, params: this.params, pool, seed: this.seed,
      spawnPolicy: this.spawnPolicy, observer,
      tau: this.difficulty.tau, lambdaScale: this.difficulty.lambdaScale,
      logLevel: 'player', freezeUntilFirstMove: true,
      loadout: o.loadout,
      habits: this.habits,
    });
    this.prediction = this.system.predictNow(this.game.view);
    this.lastRow = null;
    this.ended = false;
    this.onTick = null;
    this.onEnd = null;
    this.session = new Session3D({
      game: this.game,
      tickHz: o.tickHz ?? TICK_HZ_3D,
      onTick: (row) => this._afterTick(row),
    });
  }

  get map() { return this.level.map; }
  /** The latest arrival and why it landed there, for the Dispatch's narration. */
  get lastSpawn() { return this.spawnPolicy.lastSpawn ?? this.system.lastSpawn; }
  get chain() { return this.system.chain; }

  update(dt, controls, solids = null) { return this.session.update(dt, controls, solids); }

  fire(targetId, aim = null) { this.session.fire(targetId, aim); }

  _afterTick(row) {
    this.lastRow = row;
    if (this.game.started && !this.game.over) this.prediction = this.system.predictNow(this.game.view);
    this.onTick?.(row, this);
    if (this.game.over && !this.ended) {
      this.ended = true;
      this.onEnd?.(this.game.summary(), this);
    }
  }
}
