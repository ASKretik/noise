// bench/couplings.js -- choose the trait-to-geometry couplings by measurement.
//
// Run with:  npm run couplings
//
// WHY THIS EXISTS. The couplings in sim/predictor/couplings.js say things like "a
// wall-hugging player is more likely to be found in a wall-heavy region". Each one is a
// plausible sentence, and plausible sentences are not evidence. Measured, the authored
// set improved the three goal-driven bots' top-1 accuracy by 8 to 10 points and cost the
// cover-dwelling bot 18 points, because "sits in cover" was coupled to a global ranking
// of cover density when its real counterpart is "the cell they are already standing in".
// Open question 2 in the spec expects exactly this and asks for the list to be cut.
//
// METHOD. Greedy forward selection over CANDIDATE_TERMS against a recorded corpus, each
// addition also choosing its weight from a small grid. The objective is the macro-average
// of per-bot top-1 accuracy, minus a penalty for any bot left worse off than chain-only,
// so the selector cannot buy accuracy on the legible bots by wrecking the dwellers.
//
// WHAT THIS IS NOT. There is no gradient, no loss function, no parameter updated from
// data at runtime. It is offline constant selection run by a developer, the same
// category of decision as choosing k = 20 or 12 regions, and it is reported on seeds
// disjoint from the ones it was chosen on.
//
// THE OFF-POLICY CAVEAT, stated rather than hidden: the corpus is recorded under
// mode 'chain', so changing the couplings would in reality change where patrols spawn and
// therefore the trajectories themselves. Scoring every candidate against one fixed corpus
// is an off-policy approximation. It is the right trade -- it makes every candidate
// comparable on identical data and runs about a hundred times faster than re-simulating
// -- and bench/run.js re-measures the chosen set on-policy, which is the number that
// counts.

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { generateLevel } from '../sim/gen.js';
import { Game } from '../sim/game.js';
import { createSystem } from '../sim/system.js';
import { Rng } from '../sim/prng.js';
import { FieldPool } from '../sim/pathfind.js';
import { regionAdjacency } from '../sim/regions.js';
import { Dossier } from '../sim/predictor/dossier.js';
import { CANDIDATE_TERMS } from '../sim/predictor/couplings.js';
import { featureZ, dossierZ, applyTerms, temperatureMix, normalisedEntropyOf, BETA, ALL_FEATURES } from '../sim/predictor/combine.js';
import { BOT_NAMES, makeBot } from '../bots/policies.js';
import { isMain, args, num } from './cli.js';

const here = dirname(fileURLToPath(import.meta.url));
const TARGET = join(here, '..', 'sim', 'predictor', 'couplings.js');

const WEIGHT_GRID = [0.4, 0.7, 1.0, 1.4];
const MAX_TERMS = 12;            // the spec's own "cut the list to 12 or so"
const MIN_GAIN = 0.0005;         // stop when the next term buys less than this
const REGRESSION_PENALTY = 2.0;  // multiplier on any bot left worse than chain-only

/**
 * Record (projection, features, deviation, truth) tuples by playing careers.
 * Every trait the dossier knows is recorded, not just the ones currently coupled, so the
 * corpus can score candidates the shipping configuration does not use.
 */
export function recordCorpus({ seeds, levels = 6, scoreFrom = 3, k = 20, every = 3 } = {}) {
  const pool = new FieldPool(32 * 20);
  const corpus = [];
  const allTraits = [...new Set(CANDIDATE_TERMS.map((t) => t.trait))];

  for (const bot of BOT_NAMES) {
    for (const s of seeds) {
      const dossier = new Dossier();
      for (let L = 1; L <= levels; L++) {
        const lv = generateLevel(`c${s}`, L, { pool });
        lv.regions.adjacency = regionAdjacency(lv.map, lv.regions);
        const sys = createSystem({ level: lv, mode: 'chain', dossier });
        const g = new Game({
          level: lv, seed: 900 * s + L, pool,
          spawnPolicy: sys.spawnPolicy, observer: sys.observer, tau: sys.tau, logLevel: 'none',
        });
        const policy = makeBot(bot);
        policy.reset();
        const rng = new Rng(5 * s + 17 * L);
        const history = [];
        const pending = [];
        const scoring = L >= scoreFrom;

        while (!g.over) {
          history.push(g.playerRegion);
          if (scoring && g.tick % every === 0) {
            const R = lv.regions.count;
            const pk = new Float64Array(R);
            sys.chain.kStep(g.playerRegion, k, pk);
            const { gate } = normalisedEntropyOf(pk);
            const { zFeat } = featureZ(g.view);
            // Flatten to plain arrays: the corpus outlives the game object.
            const feats = {};
            for (const f of ALL_FEATURES) feats[f] = Array.from(zFeat[f] || new Float64Array(R));
            const dz = {};
            for (const t of allTraits) dz[t] = dossier.z(t);
            pending.push({
              bot, pk: Array.from(pk), feats, dz, gate,
              confidence: dossier.confidence(),
              tau: lv.params.tauBase, R, at: g.tick + k,
            });
          }
          g.step(policy.act(g, rng));
        }
        for (const row of pending) {
          const truth = history[row.at];
          if (truth === undefined) continue;
          row.truth = truth;
          delete row.at;
          corpus.push(row);
        }
        dossier.update(sys.traits, { levelCompleted: g.won });
      }
    }
  }
  return corpus;
}

/** Macro-averaged per-bot top-1 accuracy for one coupling set. */
export function scoreTerms(corpus, terms) {
  const hit = {}, n = {};
  for (const bot of BOT_NAMES) { hit[bot] = 0; n[bot] = 0; }
  for (const row of corpus) {
    const R = row.R;
    const pk = Float64Array.from(row.pk);
    let scores;
    if (terms.length === 0) {
      scores = new Float64Array(R).fill(1);
    } else {
      const zFeat = {};
      for (const t of terms) if (!zFeat[t.feature]) zFeat[t.feature] = Float64Array.from(row.feats[t.feature] || []);
      scores = applyTerms({
        zFeat, dz: row.dz, R,
        strength: BETA * row.confidence * row.gate,
        terms,
      }).scores;
    }
    const { top } = temperatureMix(pk, scores, row.tau);
    n[row.bot]++;
    if (top === row.truth) hit[row.bot]++;
  }
  const per = {};
  let sum = 0, bots = 0;
  for (const bot of BOT_NAMES) {
    if (n[bot] === 0) continue;
    per[bot] = hit[bot] / n[bot];
    sum += per[bot];
    bots++;
  }
  return { macro: bots ? sum / bots : 0, per };
}

/** Objective: macro accuracy, penalised for leaving any single bot worse than baseline. */
function objective(result, baseline) {
  let regression = 0;
  for (const bot of BOT_NAMES) {
    if (result.per[bot] === undefined) continue;
    const d = baseline.per[bot] - result.per[bot];
    if (d > 0) regression += d;
  }
  return result.macro - REGRESSION_PENALTY * (regression / BOT_NAMES.length);
}

export function select(corpus, { maxTerms = MAX_TERMS, verbose = true } = {}) {
  const baseline = scoreTerms(corpus, []);
  if (verbose) {
    console.log(`  chain-only baseline: macro ${(100 * baseline.macro).toFixed(2)}%`);
    for (const b of BOT_NAMES) console.log(`    ${b.padEnd(13)} ${(100 * baseline.per[b]).toFixed(2)}%`);
  }

  const chosen = [];
  let bestObj = objective(baseline, baseline);
  const used = new Set();

  while (chosen.length < maxTerms) {
    let best = null;
    for (let i = 0; i < CANDIDATE_TERMS.length; i++) {
      if (used.has(i)) continue;
      for (const w of WEIGHT_GRID) {
        const trial = [...chosen, { ...CANDIDATE_TERMS[i], w }];
        const res = scoreTerms(corpus, trial);
        const obj = objective(res, baseline);
        if (!best || obj > best.obj) best = { i, w, obj, res };
      }
    }
    if (!best || best.obj - bestObj < MIN_GAIN) break;
    const term = { ...CANDIDATE_TERMS[best.i], w: best.w };
    chosen.push(term);
    used.add(best.i);
    bestObj = best.obj;
    if (verbose) {
      console.log(`  + ${term.trait} -> ${term.feature} (sign ${term.sign > 0 ? '+' : '-'}, w ${best.w})` +
        `  macro ${(100 * best.res.macro).toFixed(2)}%  obj ${(100 * best.obj).toFixed(2)}`);
    }
  }
  return { terms: chosen, baseline };
}

function render(terms) {
  if (terms.length === 0) {
    return 'export const REWEIGHT_TERMS = Object.freeze([]);  // selection kept nothing';
  }
  const tw = Math.max(...terms.map((t) => t.trait.length));
  const fw = Math.max(...terms.map((t) => t.feature.length));
  const lines = ['export const REWEIGHT_TERMS = Object.freeze(['];
  for (const t of terms) {
    lines.push(`  { trait: '${t.trait}',${' '.repeat(tw - t.trait.length)} feature: '${t.feature}',${' '.repeat(fw - t.feature.length)} sign: ${t.sign > 0 ? '+1' : '-1'}, w: ${t.w.toFixed(1)}, why: '${t.why}' },`);
  }
  lines.push(']);');
  return lines.join('\n');
}

if (isMain(import.meta.url)) {
  const a = args();
  const selSeeds = Array.from({ length: num(a.seeds, 10) }, (_, i) => i);
  const holdSeeds = Array.from({ length: num(a.holdout, 8) }, (_, i) => 500 + i);

  console.log('recording selection corpus...');
  const t0 = Date.now();
  const sel = recordCorpus({ seeds: selSeeds });
  console.log(`  ${sel.length} samples in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  console.log('greedy forward selection:');
  const { terms, baseline } = select(sel);

  console.log('recording held-out corpus...');
  const hold = recordCorpus({ seeds: holdSeeds });
  const holdBase = scoreTerms(hold, []);
  const holdNew = scoreTerms(hold, terms);

  console.log('\nHELD-OUT (seeds the weights were never chosen on)');
  console.log('  bot            chain-only  +dossier   delta');
  let wins = 0;
  for (const b of BOT_NAMES) {
    const c = holdBase.per[b] ?? 0, d = holdNew.per[b] ?? 0;
    if (d > c) wins++;
    console.log(`  ${b.padEnd(13)} ${(100 * c).toFixed(1).padStart(9)}% ${(100 * d).toFixed(1).padStart(9)}%  ${(d >= c ? '+' : '')}${(100 * (d - c)).toFixed(1)}pp`);
  }
  console.log(`  macro ${(100 * holdBase.macro).toFixed(1)}% -> ${(100 * holdNew.macro).toFixed(1)}%   dossier wins on ${wins}/${BOT_NAMES.length} bots`);

  if (a.dry) {
    console.log('\n--dry: not writing couplings.js');
  } else {
    const src = readFileSync(TARGET, 'utf8');
    const begin = src.indexOf('// COUPLINGS-BEGIN');
    const end = src.indexOf('// COUPLINGS-END');
    if (begin < 0 || end < 0) throw new Error('couplings.js markers not found');
    writeFileSync(TARGET, `${src.slice(0, begin)}// COUPLINGS-BEGIN\n${render(terms)}\n${src.slice(end)}`);
    console.log(`\nwrote ${terms.length} couplings to sim/predictor/couplings.js`);
  }
}
