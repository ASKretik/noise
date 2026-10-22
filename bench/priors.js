// bench/priors.js -- regenerate sim/predictor/priors.js from the bot population.
//
// Tier 2 reweights on trait DEVIATION, so every coupling's sign depends on the
// population mean being roughly right. Hand-guessed priors are not a detail that can be
// left for later: if the guessed mean for a trait sits on the wrong side of the real
// population, every player gets the same sign of z and the coupling fires the same
// (wrong) way for all of them.
//
// The population here is the five bot policies across the whole difficulty curve, which
// is the only population this project actually has. Run with:  npm run priors
//
// Writes between the PRIORS-BEGIN / PRIORS-END markers and leaves the rest of the file
// alone, so the commentary in priors.js survives regeneration.

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { isMain } from './cli.js';

import { generateLevel } from '../sim/gen.js';
import { Game } from '../sim/game.js';
import { createSystem } from '../sim/system.js';
import { Rng } from '../sim/prng.js';
import { FieldPool } from '../sim/pathfind.js';
import { CURVE_CAP, levelParams } from '../sim/difficulty.js';
import { TRAIT_KEYS } from '../sim/predictor/traits.js';
import { BOT_NAMES, makeBot } from '../bots/policies.js';

const here = dirname(fileURLToPath(import.meta.url));
const TARGET = join(here, '..', 'sim', 'predictor', 'priors.js');

const SEEDS = Number(process.env.PRIOR_SEEDS || 12);

export function collectPopulation({ seeds = SEEDS, levels = CURVE_CAP } = {}) {
  const pool = new FieldPool(32 * 20);
  const samples = Object.fromEntries(TRAIT_KEYS.map((k) => [k, []]));
  let runs = 0;

  for (const name of BOT_NAMES) {
    for (let s = 0; s < seeds; s++) {
      for (let L = 1; L <= levels; L++) {
        const lv = generateLevel(`prior-${name}-${s}`, L, { pool, params: levelParams(L, 'hard') });
        const sys = createSystem({ level: lv, mode: 'chain' });
        const g = new Game({
          level: lv, seed: 1e6 + s * 1000 + L, pool,
          spawnPolicy: sys.spawnPolicy, observer: sys.observer, tau: sys.tau,
          logLevel: 'none',
        });
        const bot = makeBot(name);
        bot.reset();
        const rng = new Rng(77777 + s * 31 + L);
        while (!g.over) g.step(bot.act(g, rng));
        runs++;
        const vals = sys.traits || {};
        for (const [k, v] of Object.entries(vals)) {
          if (Number.isFinite(v) && samples[k]) samples[k].push(v);
        }
      }
    }
  }
  return { samples, runs };
}

function stats(a) {
  const n = a.length;
  if (n === 0) return null;
  const mean = a.reduce((x, y) => x + y, 0) / n;
  const varr = n > 1 ? a.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1) : 0;
  let sd = Math.sqrt(varr);
  // A trait with no spread would make z infinite. Floor the sd at something small but
  // non-degenerate relative to the mean.
  if (!(sd > 1e-4)) sd = Math.max(1e-3, Math.abs(mean) * 0.1 || 1e-3);
  return { mean, sd, n };
}

function render(table) {
  const width = Math.max(...Object.keys(table).map((k) => k.length));
  const lines = ['export const TRAIT_PRIORS = {'];
  for (const k of TRAIT_KEYS) {
    const t = table[k];
    if (!t) continue;
    const pad = ' '.repeat(width - k.length);
    lines.push(`  ${k}:${pad} { mean: ${t.mean.toFixed(4)}, sd: ${t.sd.toFixed(4)} },  // n=${t.n}`);
  }
  lines.push('};');
  return lines.join('\n');
}

if (isMain(import.meta.url)) {
  const t0 = Date.now();
  const { samples, runs } = collectPopulation();
  const table = {};
  for (const k of TRAIT_KEYS) {
    const st = stats(samples[k]);
    if (st) table[k] = st;
    else console.warn(`  ! trait never observed, keeping previous prior: ${k}`);
  }

  const src = readFileSync(TARGET, 'utf8');
  const begin = src.indexOf('// PRIORS-BEGIN');
  const end = src.indexOf('// PRIORS-END');
  if (begin < 0 || end < 0) throw new Error('priors.js markers not found');
  const next = `${src.slice(0, begin)}// PRIORS-BEGIN\n${render(table)}\n${src.slice(end)}`;
  writeFileSync(TARGET, next);

  console.log(`priors regenerated from ${runs} bot runs in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const k of TRAIT_KEYS) {
    const t = table[k];
    if (t) console.log(`  ${k.padEnd(22)} mean ${t.mean.toFixed(4)}  sd ${t.sd.toFixed(4)}  n ${t.n}`);
  }
}
