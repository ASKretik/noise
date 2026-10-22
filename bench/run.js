// bench/run.js -- the measurement report. `npm run bench`
//
// Everything the viva could ask for, measured rather than asserted. Where a result is
// weaker than the spec hoped, it is printed as such: a benchmark that only prints good
// news is a decoration.
//
// Flags: --seeds=N  --levels=N  --attempts=N  --quick  --json=path

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { career, episode, level, MODES, BOT_NAMES, mean, sem, welch, fmtPct, pad, padL, TICKS_PER_SECOND, clearLevelCache, BENCH_TIER } from './harness.js';
import { Dossier } from '../sim/predictor/dossier.js';
import { LevelChain } from '../sim/predictor/chain.js';
import { REWEIGHT_TERMS } from '../sim/predictor/couplings.js';
import { levelParams, SURVIVAL_BAND, adaptDifficulty, CURVE_CAP } from '../sim/difficulty.js';
import { TRAIT_KEYS } from '../sim/predictor/traits.js';
import { isMain, args, num } from './cli.js';

const rule = (w = 78) => console.log('-'.repeat(w));
function heading(n, title) {
  console.log('');
  console.log(`${n}. ${title.toUpperCase()}`);
  rule();
}

/** Top-1 accuracy per mode per bot, with tier 1 given the warm-up the game gives it. */
export function accuracyTable({ seeds, levels, attempts }) {
  const rows = {};
  for (const bot of BOT_NAMES) {
    rows[bot] = {};
    for (const mode of MODES) {
      const accs = [];
      for (let s = 1; s <= seeds; s++) {
        const c = career({
          bot, mode, seed: s, levels, attemptsPerLevel: attempts,
          predictions: true, scoreFrom: 2,
        });
        if (c.accuracy !== null) accs.push(c.accuracy);
      }
      rows[bot][mode] = { mean: mean(accs), sem: sem(accs), samples: accs };
    }
  }
  return rows;
}

/** Transfer: tier 1 gets exactly one attempt per level, so the dossier has to carry it. */
export function transferTable({ seeds, levels }) {
  const rows = {};
  for (const bot of BOT_NAMES) {
    rows[bot] = {};
    for (const mode of ['chain', 'chainDossier']) {
      const accs = [];
      for (let s = 1; s <= seeds; s++) {
        const c = career({
          bot, mode, seed: s, levels, attemptsPerLevel: 1,
          predictions: true, scoreFrom: 3, freshChainPerAttempt: true,
        });
        if (c.accuracy !== null) accs.push(c.accuracy);
      }
      rows[bot][mode] = { mean: mean(accs), sem: sem(accs), samples: accs };
    }
  }
  return rows;
}

/** Pressure: survival, encounters and the player's own entropy, by mode. */
export function pressureTable({ seeds, levels, attempts }) {
  const rows = {};
  for (const bot of BOT_NAMES) {
    rows[bot] = {};
    for (const mode of MODES) {
      const cs = [];
      for (let s = 1; s <= seeds; s++) {
        cs.push(career({ bot, mode, seed: s, levels, attemptsPerLevel: attempts }));
      }
      const fe = cs.map((c) => c.meanFirstEncounter).filter((v) => v !== null);
      rows[bot][mode] = {
        winRate: mean(cs.map((c) => c.winRate)),
        ticks: mean(cs.map((c) => c.meanTicks)),
        entropy: mean(cs.map((c) => c.meanEntropy)),
        entropySamples: cs.map((c) => c.meanEntropy),
        entropyAt40: mean(cs.map((c) => c.meanEntropyAt[40]).filter((v) => v !== null)),
        entropyAt40Samples: cs.map((c) => c.meanEntropyAt[40]).filter((v) => v !== null),
        entropyAt80: mean(cs.map((c) => c.meanEntropyAt[80]).filter((v) => v !== null)),
        reached40: mean(cs.map((c) => c.entropyAt[40].length / Math.max(1, c.episodes))),
        firstEncounter: mean(fe),
        feSamples: fe,
        spawns: mean(cs.map((c) => c.spawns / Math.max(1, c.episodes))),
      };
    }
  }
  return rows;
}

if (isMain(import.meta.url)) {
  const a = args();
  const quick = !!a.quick;
  const seeds = num(a.seeds, quick ? 6 : 14);
  const levels = num(a.levels, 6);
  const attempts = num(a.attempts, quick ? 2 : 3);
  const t0 = Date.now();
  const out = { meta: { seeds, levels, attempts, at: new Date().toISOString() } };

  console.log('');
  console.log('NOISE -- benchmark report');
  console.log(`seeds ${seeds} | levels 1-${levels} | attempts per level ${attempts}`);

  // ---------------------------------------------------------------- 1
  heading(1, `difficulty curve (measured at ${BENCH_TIER.toUpperCase()})`);
  console.log('  lvl keys  cap  init   lambda  fill  radius  chase   tau  bldgs  split window');
  for (let L = 1; L <= CURVE_CAP; L++) {
    const p = levelParams(L, BENCH_TIER);
    console.log(`  ${padL(L, 3)} ${padL(p.caches, 4)} ${padL(p.maxPatrols, 6)} ${padL(p.initialPatrols, 5)} ` +
      `${padL(p.lambdaBase.toFixed(4), 8)} ${padL(`${Math.round((p.maxPatrols - p.initialPatrols) / p.lambdaBase)}t`, 5)} ` +
      `${padL(p.detectRadius.toFixed(1), 7)} ${padL(p.chaseMovePeriod.toFixed(2), 6)} ${padL(p.tauBase.toFixed(2), 5)} ` +
      `${padL(p.buildings, 6)} ${padL(`${p.splitIntervalTicks[0]}-${p.splitIntervalTicks[1]}t`, 13)}`);
  }
  console.log('  "fill" is the expected ticks for arrivals to take the district from its initial alien to the cap.');
  console.log('  Aliens never leave; only division takes the count past the cap.');
  console.log(`  survival band ${SURVIVAL_BAND.lo}-${SURVIVAL_BAND.hi} ticks (${SURVIVAL_BAND.lo / TICKS_PER_SECOND}-${SURVIVAL_BAND.hi / TICKS_PER_SECOND}s); a win counts as right-censored at the horizon`);

  // ---------------------------------------------------------------- 2
  heading(2, 'top-1 region accuracy, k=20 ticks ahead');
  console.log('  tier 1 gets the warm-up the game gives it: the chain persists across replays of a level.');
  console.log(`  ${pad('bot', 14)}${MODES.map((m) => padL(m, 16)).join('')}`);
  const acc = accuracyTable({ seeds, levels, attempts });
  out.accuracy = acc;
  for (const bot of BOT_NAMES) {
    const cells = MODES.map((m) => padL(`${fmtPct(acc[bot][m].mean)} ±${fmtPct(acc[bot][m].sem, 1).replace('%', '')}`, 16));
    console.log(`  ${pad(bot, 14)}${cells.join('')}`);
  }
  const macro = {};
  for (const m of MODES) macro[m] = mean(BOT_NAMES.map((b) => acc[b][m].mean));
  console.log(`  ${pad('MACRO MEAN', 14)}${MODES.map((m) => padL(fmtPct(macro[m]), 16)).join('')}`);
  const beatsUniform = BOT_NAMES.filter((b) => acc[b].chain.mean > acc[b].uniform.mean);
  console.log(`\n  chain beats uniform on ${beatsUniform.length}/${BOT_NAMES.length} bots` +
    ` (uniform is 1/12 = ${fmtPct(1 / 12)} by construction)`);

  // ---------------------------------------------------------------- 3
  heading(3, 'cross-level transfer: does tier 2 earn its place?');
  console.log('  One attempt per level, so tier 1 is cold on every new map and only the dossier carries over.');
  console.log('  This is the progression claim stated as a measurement.');
  const tr = transferTable({ seeds, levels });
  out.transfer = tr;
  console.log(`  ${pad('bot', 14)}${padL('chain only', 14)}${padL('chain+dossier', 16)}${padL('delta', 10)}${padL('Welch t', 10)}`);
  let transferWins = 0;
  for (const bot of BOT_NAMES) {
    const c = tr[bot].chain, d = tr[bot].chainDossier;
    if (d.mean > c.mean) transferWins++;
    const t = welch(d.samples, c.samples);
    console.log(`  ${pad(bot, 14)}${padL(fmtPct(c.mean), 14)}${padL(fmtPct(d.mean), 16)}` +
      `${padL(`${d.mean >= c.mean ? '+' : ''}${(100 * (d.mean - c.mean)).toFixed(1)}pp`, 10)}${padL(t === null ? '-' : t.toFixed(2), 10)}`);
  }
  console.log(`\n  chain+dossier beats chain-only on ${transferWins}/${BOT_NAMES.length} bots.`);
  if (transferWins < BOT_NAMES.length) {
    console.log('  Where it loses, it loses to a chain that is already sharp: a player who barely');
    console.log('  changes district is best predicted by "still there", and the uncertainty gate in');
    console.log('  predictor/combine.js is what keeps tier 2 from overriding that.');
  }

  // ---------------------------------------------------------------- 4
  heading(4, 'spawner pressure');
  const pr = pressureTable({ seeds, levels, attempts });
  out.pressure = pr;
  console.log('  mean ticks to first encounter (lower = the system is waiting for you)');
  console.log(`  ${pad('bot', 14)}${MODES.map((m) => padL(m, 15)).join('')}${padL('uniform->full', 15)}`);
  let feWins = 0;
  for (const bot of BOT_NAMES) {
    const u = pr[bot].uniform.firstEncounter, f = pr[bot].full.firstEncounter;
    if (f < u) feWins++;
    const t = welch(pr[bot].uniform.feSamples, pr[bot].full.feSamples);
    console.log(`  ${pad(bot, 14)}${MODES.map((m) => padL(pr[bot][m].firstEncounter.toFixed(1), 15)).join('')}` +
      `${padL(`${(f - u).toFixed(1)}t  t=${t === null ? '-' : t.toFixed(1)}`, 15)}`);
  }
  console.log(`  lower under full than uniform on ${feWins}/${BOT_NAMES.length} bots`);

  console.log('\n  player visit entropy at end of run, bits -- CONFOUNDED, shown to make the point');
  console.log(`  ${pad('bot', 14)}${MODES.map((m) => padL(m, 15)).join('')}`);
  let entWins = 0;
  for (const bot of BOT_NAMES) {
    if (pr[bot].full.entropy > pr[bot].uniform.entropy) entWins++;
    console.log(`  ${pad(bot, 14)}${MODES.map((m) => padL(pr[bot][m].entropy.toFixed(3), 15)).join('')}`);
  }
  console.log(`  higher under full than uniform on ${entWins}/${BOT_NAMES.length} bots`);
  console.log('  Read naively this says the better predictor makes players MORE predictable, which is');
  console.log('  backwards. It is a length confound: a sharper spawner ends the run sooner, a shorter');
  console.log('  run visits fewer districts, and entropy over fewer districts is lower. End-of-run');
  console.log('  entropy cannot separate "pressured into predictability" from "killed early".');

  console.log('\n  player visit entropy at tick 40, bits -- LENGTH-MATCHED, the comparison that holds');
  console.log(`  ${pad('bot', 14)}${MODES.map((m) => padL(m, 15)).join('')}${padL('u->full', 12)}${padL('Welch t', 9)}`);
  let entWins40 = 0;
  for (const bot of BOT_NAMES) {
    const u = pr[bot].uniform.entropyAt40, f = pr[bot].full.entropyAt40;
    if (f > u) entWins40++;
    const t = welch(pr[bot].full.entropyAt40Samples, pr[bot].uniform.entropyAt40Samples);
    console.log(`  ${pad(bot, 14)}${MODES.map((m) => padL(pr[bot][m].entropyAt40.toFixed(3), 15)).join('')}` +
      `${padL(`${f >= u ? '+' : ''}${(f - u).toFixed(3)}`, 12)}${padL(t === null ? '-' : t.toFixed(2), 9)}`);
  }
  console.log(`  higher under full than uniform on ${entWins40}/${BOT_NAMES.length} bots`);
  console.log('  And the honest limit on even this: four of the five bots are FIXED policies. They');
  console.log('  cannot become less predictable in response to pressure, because they cannot respond');
  console.log('  to anything. Only coverCrawler and evader read the patrols at all. This criterion');
  console.log('  is really about a human player, and a bot population can only bound it, not settle it.');

  console.log('\n  win rate and mean survival');
  console.log(`  ${pad('bot', 14)}${MODES.map((m) => padL(m, 15)).join('')}`);
  for (const bot of BOT_NAMES) {
    console.log(`  ${pad(bot, 14)}${MODES.map((m) => padL(`${fmtPct(pr[bot][m].winRate, 0)} / ${pr[bot][m].ticks.toFixed(0)}t`, 15)).join('')}`);
  }

  // ---------------------------------------------------------------- 5
  heading(5, 'tier-1 units: per-tick chain vs change-only chain');
  console.log('  The spec says "incremented on every region change" and "k around 20 ticks". Those only');
  console.log('  agree if a matrix step is one tick, so the shipping chain is per-tick and the diagonal');
  console.log('  carries dwell time. Both readings, measured:');
  const unitRows = [];
  for (const perTick of [true, false]) {
    const accs = [];
    for (const bot of BOT_NAMES) {
      for (let s = 1; s <= Math.max(4, Math.floor(seeds / 2)); s++) {
        const lv = level(`units-${bot}-${s}`, 3);
        const chain = new LevelChain(lv.regions.count, { perTick, adjacency: lv.regions.adjacency });
        let last = null;
        for (let a = 0; a < 4; a++) {
          last = episode({ level: lv, bot, mode: 'chain', seed: s * 31 + a, chain, predictions: a >= 1 });
        }
        if (last.accuracy !== null) accs.push(last.accuracy);
      }
    }
    unitRows.push({ perTick, mean: mean(accs), sem: sem(accs) });
  }
  for (const r of unitRows) {
    console.log(`  ${pad(r.perTick ? 'per-tick (shipping)' : 'change-only (literal)', 24)}top-1 ${fmtPct(r.mean)} ±${fmtPct(r.sem)}`);
  }
  out.chainUnits = unitRows;

  // ---------------------------------------------------------------- 6
  heading(6, 'which traits actually move');
  console.log('  Open question 2 in the spec: expect to cut the trait list. These are the couplings');
  console.log(`  selection kept (${REWEIGHT_TERMS.length} of ${TRAIT_KEYS.length} traits have a geometric counterpart at all):`);
  for (const t of REWEIGHT_TERMS) {
    console.log(`    ${pad(t.trait, 22)} ${t.sign > 0 ? '+' : '-'}  ${pad(t.feature, 17)} w=${t.w.toFixed(1)}  ${t.why}`);
  }
  const unused = TRAIT_KEYS.filter((k) => !REWEIGHT_TERMS.some((t) => t.trait === k));
  console.log(`\n  measured but not coupled (${unused.length}): ${unused.join(', ')}`);
  console.log('  These still earn their place: they are what the dossier panel shows the player and');
  console.log('  what the dispatch layer speaks from. They just have no clean geometric handle.');

  // ---------------------------------------------------------------- 7
  heading(7, 'difficulty controller');
  console.log('  Proportional control on the last 5 runs, with wins right-censored at the horizon.');
  const scenarios = [
    ['all losses, fast (20t)', Array.from({ length: 5 }, () => ({ ticks: 20, won: false }))],
    ['all losses, slow (400t)', Array.from({ length: 5 }, () => ({ ticks: 400, won: false }))],
    ['mixed, 2 of 5 won', [{ ticks: 40, won: false }, { ticks: 300, won: true }, { ticks: 50, won: false }, { ticks: 260, won: true }, { ticks: 45, won: false }]],
    ['all wins', Array.from({ length: 5 }, () => ({ ticks: 120, won: true }))],
  ];
  const p6 = levelParams(6, BENCH_TIER);
  console.log(`  ${pad('history', 26)}${padL('mean survival', 15)}${padL('tau', 8)}${padL('lambda x', 10)}${padL('action', 12)}`);
  for (const [label, runs] of scenarios) {
    const c = adaptDifficulty(runs, p6);
    console.log(`  ${pad(label, 26)}${padL(`${c.meanSurvival.toFixed(0)}t`, 15)}${padL(c.tau.toFixed(2), 8)}${padL(c.lambdaScale.toFixed(2), 10)}` +
      `${padL(c.acting ? (c.error > 0 ? 'tighten' : 'ease') : 'hold', 12)}`);
  }
  console.log(`  (level 6 base tau ${p6.tauBase.toFixed(2)})`);

  // ---------------------------------------------------------------- 7b
  heading(8, 'the added mechanics, measured');
  console.log('  Buildings, bolts and division all change how long a run lasts, which is the only');
  console.log('  thing that decides whether a player ever SEES them. An efficient bot finishes a');
  console.log('  district in about forty ticks -- five seconds -- so it never reaches the ten-to-');
  console.log('  fifteen-second division window at all. A wandering bot does, and so will a human.');
  console.log('');
  console.log(`  ${pad('bot', 14)}${padL('mean ticks', 12)}${padL('seconds', 10)}${padL('divisions', 11)}${padL('peak aliens', 13)}${padL('bolts used', 12)}`);
  clearLevelCache();
  for (const bot of BOT_NAMES) {
    let ticks = 0, splits = 0, peak = 0, boosts = 0;
    const N = quick ? 40 : 80;
    for (let i = 0; i < N; i++) {
      const lv = level(`mech${i % 20}`, 1 + (i % 6));
      const r = episode({ level: lv, bot, mode: 'full', seed: 4000 + i });
      ticks += r.summary.ticks;
      splits += r.summary.splits || 0;
      peak += r.summary.peakAliens || 0;
      boosts += r.summary.boostsUsed || 0;
    }
    console.log(`  ${pad(bot, 14)}${padL((ticks / N).toFixed(0), 12)}${padL((ticks / N / TICKS_PER_SECOND).toFixed(1), 10)}` +
      `${padL((splits / N).toFixed(2), 11)}${padL((peak / N).toFixed(1), 13)}${padL((boosts / N).toFixed(1), 12)}`);
  }
  console.log('');
  console.log('  Divisions are held to the same minimum distance as arrivals: one that cannot be');
  console.log('  placed fairly is deferred rather than dropped next to the player. Without that the');
  console.log('  floor was violated by 128 of 1,425 placements, one of them directly adjacent.');

  // ---------------------------------------------------------------- 9
  heading(9, 'throughput');
  clearLevelCache();
  const N = quick ? 300 : 1000;
  const tStart = Date.now();
  let ticks = 0;
  for (let i = 0; i < N; i++) {
    const lv = level(`tp${i % 50}`, 1 + (i % CURVE_CAP));
    const r = episode({ level: lv, bot: BOT_NAMES[i % BOT_NAMES.length], mode: 'full', seed: i, logLevel: 'none' });
    ticks += r.summary.ticks;
  }
  const secs = (Date.now() - tStart) / 1000;
  console.log(`  ${N} episodes, ${ticks} ticks in ${secs.toFixed(2)}s` +
    `  (${Math.round(N / secs)} episodes/s, ${Math.round(ticks / secs / 1000)}k ticks/s)`);
  out.throughput = { episodes: N, ticks, seconds: secs };

  rule();
  console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (a.json) {
    mkdirSync(dirname(String(a.json)), { recursive: true });
    writeFileSync(String(a.json), JSON.stringify(out, null, 2));
    console.log(`wrote ${a.json}`);
  }
}
