// bench/harness.js -- shared episode machinery for the benchmarks.
//
// One place where an episode is defined, so bench/run.js, bench/acceptance.js,
// bench/plots.js and bench/couplings.js cannot quietly measure four different games.
//
// Everything here runs under Node at a few thousand ticks a millisecond because the sim
// core imports nothing and touches no DOM. That property is the reason the acceptance
// criterion "1,000 episodes in under 30 seconds" is achievable at all.

import { generateLevel } from '../sim/gen.js';
import { Game } from '../sim/game.js';
import { createSystem, resolveDifficulty } from '../sim/system.js';
import { Rng } from '../sim/prng.js';
import { FieldPool } from '../sim/pathfind.js';
import { regionAdjacency } from '../sim/regions.js';
import { Dossier } from '../sim/predictor/dossier.js';
import { levelParams, TICKS_PER_SECOND } from '../sim/difficulty.js';
import { makeBot, BOT_NAMES } from '../bots/policies.js';

export { BOT_NAMES, TICKS_PER_SECOND };

export const MODES = Object.freeze(['uniform', 'chain', 'chainDossier', 'full']);

/**
 * Every benchmark measures at HARD, explicitly.
 *
 * levelParams() defaults to MEDIUM because that is the sensible tier for a new player,
 * and for a while the benchmarks inherited it -- which quietly slowed every alien by 25%
 * and shifted results for a reason that has nothing to do with prediction. The predictor
 * is the thing under test, so the curve under it is pinned to the unmodified one.
 */
export const BENCH_TIER = 'hard';
export const K_AHEAD = 20;
/** Predictions are sampled rather than taken every tick; this is the stride. */
export const PREDICT_EVERY = 3;

const pool = new FieldPool(32 * 20);
export const sharedPool = pool;

const levelCache = new Map();

/** Levels are deterministic in (profileId, level), so generating one twice is waste. */
export function level(profileId, n, params = null) {
  const key = `${profileId}|${n}|${params ? JSON.stringify(params) : ''}`;
  let lv = levelCache.get(key);
  if (!lv) {
    lv = generateLevel(profileId, n, { pool, params: params || levelParams(n, BENCH_TIER) });
    lv.regions.adjacency = regionAdjacency(lv.map, lv.regions);
    levelCache.set(key, lv);
  }
  return lv;
}

export function clearLevelCache() { levelCache.clear(); }

/**
 * Play one episode.
 *
 * @param {object} o
 * @param {object} o.level              generated level
 * @param {string} o.bot                bot policy name
 * @param {string} o.mode               spawner mode
 * @param {Dossier} [o.dossier]
 * @param {object} [o.chain]            pass one in to carry tier 1 across runs of a level
 * @param {number} o.seed
 * @param {number} [o.inputSeed]        the bot's own stream, separate from the game's
 * @param {boolean} [o.predictions]     sample k-step predictions and score top-1
 * @param {Array} [o.runs]              prior runs, for the difficulty controller in 'full'
 * @param {'none'|'player'|'full'} [o.logLevel]
 */
export function episode(o) {
  const lv = o.level;
  const params = lv.params;
  const difficulty = resolveDifficulty({ mode: o.mode, params, runs: o.runs || [] });

  const sys = createSystem({
    level: lv,
    dossier: o.dossier,
    mode: o.mode,
    tau: difficulty.tau,
    chain: o.chain,
  });

  const game = new Game({
    level: lv,
    params,
    pool,
    seed: o.seed,
    spawnPolicy: sys.spawnPolicy,
    observer: sys.observer,
    tau: difficulty.tau,
    lambdaScale: difficulty.lambdaScale,
    logLevel: o.logLevel || 'none',
    maxTicks: o.maxTicks,
  });

  const bot = makeBot(o.bot);
  bot.reset();
  const inputRng = new Rng(o.inputSeed ?? (o.seed ^ 0x5bf03635));

  const regionHistory = [];
  const pending = [];
  let predHit = 0, predN = 0;
  let gateSum = 0, confSum = 0, predSamples = 0;

  while (!game.over) {
    regionHistory.push(game.playerRegion);
    if (o.predictions && game.tick % PREDICT_EVERY === 0) {
      const p = sys.predictNow(game.view, { k: o.k ?? K_AHEAD });
      pending.push({ at: game.tick + (o.k ?? K_AHEAD), top: p.top });
      gateSum += p.gate; confSum += p.confidence; predSamples++;
    }
    game.step(bot.act(game, inputRng));
  }
  for (const q of pending) {
    const truth = regionHistory[q.at];
    if (truth === undefined) continue;
    predN++;
    if (q.top === truth) predHit++;
  }

  const summary = game.summary();
  return {
    summary,
    game,
    system: sys,
    difficulty,
    accuracy: predN ? predHit / predN : null,
    predN,
    meanGate: predSamples ? gateSum / predSamples : null,
    meanConfidence: predSamples ? confSum / predSamples : null,
  };
}

/**
 * A career: one bot plays `levels` consecutive levels on one profile.
 *
 * Tier 1 resets at each new level (a chain over this map's regions cannot transfer).
 * Tier 2 carries across every level. That asymmetry IS the progression claim, so the
 * career is the only unit of measurement in which it can be tested.
 *
 * @param {object} o
 * @param {number} [o.attemptsPerLevel] replays of each level, with tier 1 persisting
 * @param {number} [o.scoreFrom]        first level whose predictions count toward accuracy
 */
export function career(o) {
  const dossier = o.dossier || new Dossier();
  const levels = o.levels ?? 6;
  const attempts = o.attemptsPerLevel ?? 1;
  const scoreFrom = o.scoreFrom ?? 1;
  const profileId = `${o.bot}-${o.seed}`;

  const out = {
    bot: o.bot, mode: o.mode, dossier,
    runs: [], predHit: 0, predN: 0,
    wins: 0, episodes: 0,
    ticks: 0, entropy: 0, score: 0,
    firstEncounter: [], detections: 0, spawns: 0,
    gate: [], confidence: [],
    /** Length-matched entropy: only runs that actually reached the mark contribute. */
    entropyAt: { 40: [], 80: [], 160: [] },
    /** Per-level breakdown, so "accuracy as the dossier thickens" is plottable. */
    byLevel: {},
  };

  for (let L = 1; L <= levels; L++) {
    const lv = level(profileId, L);
    let chain = o.freshChainPerAttempt ? null : undefined;
    for (let a = 0; a < attempts; a++) {
      const res = episode({
        level: lv,
        bot: o.bot,
        mode: o.mode,
        dossier,
        chain: chain === undefined ? undefined : chain,
        seed: (o.seed * 7919 + L * 131 + a) | 0,
        inputSeed: (o.seed * 104729 + L * 31 + a) | 0,
        predictions: o.predictions && L >= scoreFrom,
        runs: out.runs,
        k: o.k,
      });
      if (!o.freshChainPerAttempt) chain = res.system.chain;

      out.episodes++;
      out.ticks += res.summary.ticks;
      out.entropy += res.summary.entropy;
      out.score += res.summary.score;
      out.detections += res.summary.detections;
      out.spawns += res.summary.spawns;
      if (res.summary.won) out.wins++;
      if (res.summary.firstEncounterTick !== null) out.firstEncounter.push(res.summary.firstEncounterTick);
      if (res.accuracy !== null) {
        out.predHit += Math.round(res.accuracy * res.predN);
        out.predN += res.predN;
        const bl = (out.byLevel[L] ||= { hit: 0, n: 0, firstEncounter: [], entropy: [] });
        bl.hit += Math.round(res.accuracy * res.predN);
        bl.n += res.predN;
      }
      const blAny = (out.byLevel[L] ||= { hit: 0, n: 0, firstEncounter: [], entropy: [] });
      if (res.summary.firstEncounterTick !== null) blAny.firstEncounter.push(res.summary.firstEncounterTick);
      blAny.entropy.push(res.summary.entropy);
      if (res.meanGate !== null) { out.gate.push(res.meanGate); out.confidence.push(res.meanConfidence); }

      for (const mark of [40, 80, 160]) {
        const v = res.summary.entropyAt[mark];
        if (v !== undefined) out.entropyAt[mark].push(v);
      }

      out.runs.push({ level: L, ticks: res.summary.ticks, won: res.summary.won });
      dossier.update(res.system.traits || {}, { levelCompleted: res.summary.won });
    }
  }

  out.accuracy = out.predN ? out.predHit / out.predN : null;
  out.winRate = out.episodes ? out.wins / out.episodes : 0;
  out.meanTicks = out.episodes ? out.ticks / out.episodes : 0;
  out.meanEntropy = out.episodes ? out.entropy / out.episodes : 0;
  out.meanScore = out.episodes ? out.score / out.episodes : 0;
  out.meanFirstEncounter = out.firstEncounter.length ? mean(out.firstEncounter) : null;
  out.encounterRate = out.episodes ? out.firstEncounter.length / out.episodes : 0;
  out.meanEntropyAt = {};
  for (const mark of [40, 80, 160]) {
    out.meanEntropyAt[mark] = out.entropyAt[mark].length ? mean(out.entropyAt[mark]) : null;
    out.meanEntropyAt[`${mark}n`] = out.entropyAt[mark].length;
  }
  for (const [L, bl] of Object.entries(out.byLevel)) {
    bl.accuracy = bl.n ? bl.hit / bl.n : null;
    bl.meanFirstEncounter = bl.firstEncounter.length ? mean(bl.firstEncounter) : null;
    bl.meanEntropy = bl.entropy.length ? mean(bl.entropy) : null;
  }
  out.meanGate = out.gate.length ? mean(out.gate) : null;
  out.meanConfidence = out.confidence.length ? mean(out.confidence) : null;
  return out;
}

export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
}

/** Standard error of the mean, for honest comparisons between modes. */
export const sem = (a) => (a.length ? stdev(a) / Math.sqrt(a.length) : 0);

/** Welch's t statistic. Reported rather than dressed up as a p-value. */
export function welch(a, b) {
  if (a.length < 2 || b.length < 2) return null;
  const va = stdev(a) ** 2 / a.length;
  const vb = stdev(b) ** 2 / b.length;
  const denom = Math.sqrt(va + vb);
  if (!(denom > 0)) return null;
  return (mean(a) - mean(b)) / denom;
}

export function fmtPct(v, digits = 1) { return `${(100 * v).toFixed(digits)}%`; }
export function pad(s, n) { return String(s).padEnd(n); }
export function padL(s, n) { return String(s).padStart(n); }
