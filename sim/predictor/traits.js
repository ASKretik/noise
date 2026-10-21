// sim/predictor/traits.js -- the twenty map-agnostic traits that make up tier 2.
//
// Every trait here is computable from the tick log with no reference to absolute
// coordinates. That is the whole requirement: a trait that mentions x=14 cannot
// transfer to the next district, and transfer across levels is the premise.
//
// Each trait is measured once per run by TraitAccumulator (streaming, so the live HUD
// and the dossier see the same numbers), then folded into the persistent dossier as an
// exponentially weighted statistic. extractTraits() replays a stored tick log through
// the same accumulator so "computable from the tick log" is literally true and not
// just claimed.

/**
 * TICK SAMPLE CONTRACT -- what sim/game.js hands the observer every tick.
 * Keeping this in one comment is cheaper than a type system for a project this size.
 *
 *   t                 tick index
 *   x, y              player cell
 *   dir               direction index taken this tick, -1 for stay
 *   moved             whether the position actually changed
 *   region            region id of the player's cell
 *   onCover           standing on a cover tile
 *   wallAdj           at least one of the four neighbours is a wall
 *   degree            walkable 4-neighbour count of the player's cell
 *   coverDist         BFS distance to the nearest cover tile
 *   revisit           this cell had been stood on earlier in the run
 *   alertTicks        remaining ticks of live-position alert, 0 when calm
 *   alertStarted      an alert was raised on this tick
 *   threatDist        BFS distance to the nearest patrol, Infinity when none exist
 *   threatVisible     a patrol is within its effective detection radius of the player
 *   threatNewlyVisible first tick of a visibility episode
 *   cachesLeft        uncollected caches
 *   cacheDist         BFS distance to the nearest uncollected cache
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Trait registry. `prior` is the population reference used for z-scoring -- see
 * priors.js, which bench/priors.js regenerates from the bot population.
 * `hint` is the human-readable phrasing the dispatch layer uses.
 */
export const TRAITS = Object.freeze([
  { key: 'wallAffinity',        label: 'wall affinity',        hint: 'hugs walls' },
  { key: 'corridorPreference',  label: 'corridor preference',  hint: 'prefers tight corridors' },
  { key: 'junctionAffinity',    label: 'junction affinity',    hint: 'lives on junctions' },
  { key: 'openGroundTolerance', label: 'open-ground tolerance',hint: 'crosses open ground' },
  { key: 'coverDwell',          label: 'cover dwell',          hint: 'sits in cover' },
  { key: 'coverSeeking',        label: 'cover seeking',        hint: 'routes through cover' },
  { key: 'headingPersistence',  label: 'heading persistence',  hint: 'holds a heading' },
  { key: 'turnRate',            label: 'turn rate',            hint: 'turns constantly' },
  { key: 'backtrackRate',       label: 'backtrack rate',       hint: 'doubles back' },
  { key: 'motionRate',          label: 'motion rate',          hint: 'never stops moving' },
  { key: 'pauseMean',           label: 'pause length',         hint: 'takes long pauses' },
  { key: 'pauseVar',            label: 'pause variance',       hint: 'pauses erratically' },
  { key: 'revisitRate',         label: 'revisit rate',         hint: 'retreads old ground' },
  { key: 'regionDwell',         label: 'region dwell',         hint: 'settles in one district' },
  { key: 'objectiveDirectness', label: 'objective directness', hint: 'takes the direct line' },
  { key: 'cacheOrdering',       label: 'cache ordering',       hint: 'collects nearest-first' },
  { key: 'dropRush',            label: 'drop rush',            hint: 'beelines for the drop' },
  { key: 'threatDistance',      label: 'threat distance',      hint: 'reacts late to patrols' },
  { key: 'threatTurnAway',      label: 'threat turn-away',     hint: 'breaks away on contact' },
  { key: 'postAlertFlee',       label: 'post-alert flight',    hint: 'runs when spotted' },
  { key: 'postAlertFreeze',     label: 'post-alert freeze',    hint: 'freezes when spotted' },
]);

export const TRAIT_KEYS = TRAITS.map((t) => t.key);
export const TRAIT_BY_KEY = Object.fromEntries(TRAITS.map((t) => [t.key, t]));

/** Ticks after an alert is raised that count as the reaction window. */
const ALERT_WINDOW = 8;
/** Open ground means "more than this many cells from cover". */
const OPEN_GROUND_CELLS = 3;

/**
 * Streaming measurement of one run.
 * Fed by sim/game.js through the observer hook, or by extractTraits() over a tick log.
 */
export class TraitAccumulator {
  constructor() {
    this.ticks = 0;
    this.moves = 0;

    this.wallAdjTicks = 0;
    this.corridorTicks = 0;
    this.junctionTicks = 0;
    this.openGroundTicks = 0;
    this.coverTicks = 0;
    this.revisitTicks = 0;

    this.sameHeading = 0;
    this.turns = 0;
    this.backtracks = 0;
    this.headingDecisions = 0;
    this.lastDir = -1;

    this.pauseRuns = [];
    this.pauseRun = 0;
    this.coverStillRuns = [];
    this.coverStillRun = 0;

    this.regionRuns = [];
    this.regionRun = 0;
    this.lastRegion = -1;

    this.objectiveRatios = [];
    this.objectiveRanks = [];
    this.dropRatio = null;

    this.threatFirstDists = [];
    this.threatTicks = 0;
    this.threatAwayMoves = 0;
    this.prevThreatDist = null;

    this.alertWindows = [];
    this._window = null;

    this.lastSample = null;
  }

  observe(s) {
    this.ticks++;
    if (s.moved) this.moves++;

    if (s.wallAdj) this.wallAdjTicks++;
    if (s.degree <= 2) this.corridorTicks++;
    if (s.degree >= 3) this.junctionTicks++;
    if (!(s.coverDist <= OPEN_GROUND_CELLS)) this.openGroundTicks++;
    if (s.onCover) this.coverTicks++;
    if (s.revisit) this.revisitTicks++;

    // --- heading ---
    if (s.dir >= 0) {
      if (this.lastDir >= 0) {
        this.headingDecisions++;
        if (s.dir === this.lastDir) this.sameHeading++;
        else if (s.dir === (this.lastDir + 2) % 4) this.backtracks++;
        else this.turns++;
      }
      this.lastDir = s.dir;
    }

    // --- pauses, and pauses specifically taken in cover ---
    if (s.moved) {
      if (this.pauseRun > 0) { this.pauseRuns.push(this.pauseRun); this.pauseRun = 0; }
      if (this.coverStillRun > 0) { this.coverStillRuns.push(this.coverStillRun); this.coverStillRun = 0; }
    } else {
      this.pauseRun++;
      if (s.onCover) this.coverStillRun++;
      else if (this.coverStillRun > 0) { this.coverStillRuns.push(this.coverStillRun); this.coverStillRun = 0; }
    }

    // --- region dwell ---
    if (s.region !== this.lastRegion) {
      if (this.regionRun > 0) this.regionRuns.push(this.regionRun);
      this.regionRun = 1;
      this.lastRegion = s.region;
    } else {
      this.regionRun++;
    }

    // --- threat response ---
    if (s.threatVisible) {
      this.threatTicks++;
      if (s.threatNewlyVisible && Number.isFinite(s.threatDist)) this.threatFirstDists.push(s.threatDist);
      if (this.prevThreatDist !== null && Number.isFinite(s.threatDist) && s.threatDist > this.prevThreatDist) {
        this.threatAwayMoves++;
      }
    }
    this.prevThreatDist = Number.isFinite(s.threatDist) ? s.threatDist : null;

    // --- post-alert classification over a fixed window ---
    if (s.alertStarted) {
      this._closeWindow();
      this._window = { ticks: 0, moves: 0, startDist: Number.isFinite(s.threatDist) ? s.threatDist : null, endDist: null };
    }
    if (this._window) {
      this._window.ticks++;
      if (s.moved) this._window.moves++;
      if (Number.isFinite(s.threatDist)) this._window.endDist = s.threatDist;
      if (this._window.ticks >= ALERT_WINDOW) this._closeWindow();
    }

    this.lastSample = s;
  }

  _closeWindow() {
    const w = this._window;
    if (!w) return;
    let kind = 'continue';
    if (w.moves === 0) kind = 'freeze';
    else if (w.startDist !== null && w.endDist !== null && w.endDist > w.startDist + 1) kind = 'flee';
    this.alertWindows.push(kind);
    this._window = null;
  }

  /**
   * One cache collected.
   * @param {{movesTaken:number, shortest:number, rank:number, candidates:number}} info
   */
  objective(info) {
    if (info.shortest > 0 && info.movesTaken > 0) {
      this.objectiveRatios.push(info.movesTaken / info.shortest);
    }
    if (info.candidates > 1) {
      this.objectiveRanks.push(info.rank / (info.candidates - 1));
    }
  }

  /** The final leg: last cache to the dead drop. */
  finish(info) {
    if (info && info.shortest > 0 && info.movesTaken > 0) {
      this.dropRatio = info.movesTaken / info.shortest;
    }
    this._closeWindow();
    if (this.pauseRun > 0) { this.pauseRuns.push(this.pauseRun); this.pauseRun = 0; }
    if (this.coverStillRun > 0) { this.coverStillRuns.push(this.coverStillRun); this.coverStillRun = 0; }
    if (this.regionRun > 0) { this.regionRuns.push(this.regionRun); this.regionRun = 0; }
  }

  /**
   * The measured trait vector for this run. Traits with no support are omitted rather
   * than defaulted -- the dossier must not be nudged by a number nobody observed.
   */
  values() {
    const T = Math.max(1, this.ticks);
    const out = {};
    const put = (k, v) => { if (Number.isFinite(v)) out[k] = v; };

    put('wallAffinity', this.wallAdjTicks / T);
    put('corridorPreference', this.corridorTicks / T);
    put('junctionAffinity', this.junctionTicks / T);
    put('openGroundTolerance', this.openGroundTicks / T);
    put('coverSeeking', this.coverTicks / T);
    put('revisitRate', this.revisitTicks / T);
    put('motionRate', this.moves / T);

    if (this.headingDecisions > 0) {
      put('headingPersistence', this.sameHeading / this.headingDecisions);
      put('turnRate', this.turns / this.headingDecisions);
      put('backtrackRate', this.backtracks / this.headingDecisions);
    }

    put('coverDwell', mean(this.coverStillRuns) || 0);
    if (this.pauseRuns.length) {
      put('pauseMean', mean(this.pauseRuns));
      put('pauseVar', variance(this.pauseRuns));
    } else {
      put('pauseMean', 0);
      put('pauseVar', 0);
    }
    if (this.regionRuns.length) put('regionDwell', mean(this.regionRuns));
    if (this.objectiveRatios.length) put('objectiveDirectness', mean(this.objectiveRatios));
    if (this.objectiveRanks.length) put('cacheOrdering', mean(this.objectiveRanks));
    if (this.dropRatio !== null) put('dropRush', this.dropRatio);
    if (this.threatFirstDists.length) put('threatDistance', mean(this.threatFirstDists));
    if (this.threatTicks > 0) put('threatTurnAway', clamp01(this.threatAwayMoves / this.threatTicks));
    if (this.alertWindows.length) {
      const n = this.alertWindows.length;
      put('postAlertFlee', this.alertWindows.filter((k) => k === 'flee').length / n);
      put('postAlertFreeze', this.alertWindows.filter((k) => k === 'freeze').length / n);
    }
    return out;
  }
}

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function variance(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1);
}

/**
 * Replay a stored tick log through the accumulator.
 * `log` rows are the compact arrays sim/game.js writes; see Game.LOG_FIELDS.
 */
export function extractTraits(log, hydrate) {
  const acc = new TraitAccumulator();
  for (const row of log) acc.observe(hydrate(row));
  acc.finish(null);
  return acc.values();
}
