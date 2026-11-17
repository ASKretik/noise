// web3d/runner.js -- one district's game logic for the 3D page, with no DOM and no WebGL.
//
// The 3D counterpart of the game half of web/play.js: generate the level, wire the
// predictor system, build a Game3D with the opening freeze, wrap it in a Session3D. The
// page owns the frame loop, the camera and the HUD; this owns everything that decides
// what happens. Keeping it DOM-free is what lets the whole loop run under Node.

import { generateLevel } from '../sim/gen.js';
import { createSystem, resolveDifficulty } from '../sim/system.js';
import { levelParams } from '../sim/difficulty.js';
import { regionAdjacency } from '../sim/regions.js';
import { FieldPool } from '../sim/pathfind.js';
import { hashString } from '../sim/prng.js';
import { Dossier } from '../sim/predictor/dossier.js';
import { Game3D } from '../sim3d/game3d.js';
import { Session3D } from '../sim3d/session.js';
import { TICK_HZ_3D } from '../sim3d/units.js';
import { thinBolts } from '../sim3d/bolts.js';

const pool = new FieldPool(32 * 20);

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
   */
  constructor(o) {
    this.o = o;
    this.district = o.district;
    this.params = levelParams(o.district, o.tier);
    this.level = generateLevel(o.profileId, o.district, { pool, params: this.params });
    this.level.regions.adjacency ||= regionAdjacency(this.level.map, this.level.regions);
    // Fewer bolts deeper into each belt (spec-3d-next.md, N1). The runner's own copy of the
    // level; nothing generated for the 2D game is touched. `thinBolts: false` disables it.
    this.generatedBolts = this.level.bolts.length;
    if (o.thinBolts !== false) this.level.bolts = thinBolts(this.level.bolts, o.district, o.profileId);
    this.mode = o.mode || 'full';
    this.difficulty = o.difficulty || resolveDifficulty({ mode: this.mode, params: this.params, runs: [] });
    this.dossier = o.dossier || new Dossier();
    this.system = createSystem({
      level: this.level, dossier: this.dossier, mode: this.mode,
      tau: this.difficulty.tau, chain: o.chain,
    });
    this.seed = hashString(o.seedKey || `${o.profileId}#${o.district}`);
    this.game = new Game3D({
      level: this.level, params: this.params, pool, seed: this.seed,
      spawnPolicy: this.system.spawnPolicy, observer: this.system.observer,
      tau: this.difficulty.tau, lambdaScale: this.difficulty.lambdaScale,
      logLevel: 'player', freezeUntilFirstMove: true,
      loadout: o.loadout,
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
  get chain() { return this.system.chain; }

  update(dt, controls) { return this.session.update(dt, controls); }

  fire(targetId) { this.session.fire(targetId); }

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
