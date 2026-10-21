// bench/plots.js -- the report figures. `npm run plots`
//
// Writes standalone SVGs plus docs/bench.html, which embeds them next to the numbers they
// came from. Static SVG rather than a charting library: this project has no dependencies
// and no build step, and a figure in a viva needs to survive being a file.
//
// The palette is not a taste call. The four spawner modes are an ORDERED progression of
// predictor capability, so they get a single-hue ordinal ramp rather than four arbitrary
// hues -- the ordering is the information. Chain-versus-dossier is two unordered
// identities, so that one gets two categorical slots. Both sets were checked against the
// dark panel surface (#0c1016) with the data-viz validator and pass every gate:
//
//   ordinal 4-step  #184f95 #2a78d6 #5598e7 #b7d3f6
//     monotone lightness, all adjacent dL >= 0.06, dark end 2.35:1 vs surface, hue spread 3 deg
//   categorical 2   #3987e5 #d95926
//     inside the dark lightness band, worst-pair CVD dE 26.8, normal-vision dE 31.8, both >= 3:1
//
// Every series is also direct-labelled, so identity never rests on colour alone, and
// docs/bench.html carries the full table for the colour-blind, print and screen-reader cases.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { career, MODES, BOT_NAMES, mean, fmtPct } from './harness.js';
import { MODE_LABEL } from '../sim/predictor/combine.js';
import { isMain, args, num } from './cli.js';

const OUT = resolve(fileURLToPath(new URL('..', import.meta.url)), 'docs', 'plots');

const INK = {
  surface: '#0c1016',
  primary: '#dfe7f2',
  secondary: '#8294a8',
  muted: '#5b6b7e',
  grid: '#1e2834',
  reference: '#6b7a8c',
};
/** Ordinal ramp, recessive -> prominent, for the four modes in capability order. */
const RAMP = ['#184f95', '#2a78d6', '#5598e7', '#b7d3f6'];
/** Two categorical identities. */
const CAT = ['#3987e5', '#d95926'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svgOpen(w, h, title, subtitle) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">`,
    `<style>
      text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .t  { fill: ${INK.primary}; font-size: 15px; font-weight: 600; }
      .st { fill: ${INK.secondary}; font-size: 11.5px; }
      .ax { fill: ${INK.secondary}; font-size: 11px; }
      .mu { fill: ${INK.muted}; font-size: 10.5px; }
      .vl { fill: ${INK.primary}; font-size: 10.5px; }
      .gl { stroke: ${INK.grid}; stroke-width: 1; }
      .rf { stroke: ${INK.reference}; stroke-width: 1; stroke-dasharray: 3 3; }
    </style>`,
    `<rect width="${w}" height="${h}" fill="${INK.surface}"/>`,
    `<text class="t" x="20" y="26">${esc(title)}</text>`,
    `<text class="st" x="20" y="44">${esc(subtitle)}</text>`,
  ].join('\n');
}

/**
 * Legend row: a colour chip plus a text label, never colour alone.
 * Advance width is computed from the monospace metric rather than guessed -- the first
 * version underestimated it and the four mode labels overlapped into an unreadable smear.
 */
const CHAR_W = 6.35;   // ui-monospace advance at font-size 10.5px
function legend(items, x, y) {
  let out = '';
  let cx = x;
  for (const it of items) {
    out += `<rect x="${cx.toFixed(1)}" y="${y - 8}" width="10" height="10" rx="2" fill="${it.color}"/>`;
    out += `<text class="mu" x="${(cx + 15).toFixed(1)}" y="${y}">${esc(it.label)}</text>`;
    cx += 15 + it.label.length * CHAR_W + 18;
  }
  return out;
}

/** Short names for the legend; MODE_LABEL's full glosses belong in the table, not the chip. */
const MODE_SHORT = { uniform: 'uniform', chain: 'chain', chainDossier: 'chain+dossier', full: 'full' };

/**
 * Grouped horizontal bars. Horizontal because the group labels are words, and words
 * read horizontally; 4px rounded data-ends anchored to the baseline; a 2px surface gap
 * between adjacent bars in a group.
 */
function groupedBars({ title, subtitle, groups, series, max, fmt, xLabel, reference, colors, width = 720 }) {
  const padL = 112, padR = 116, padT = 92, padB = 62;
  const barH = 13, gap = 2, groupGap = 16;
  const groupH = series.length * (barH + gap) - gap + groupGap;
  const height = padT + groups.length * groupH + padB;
  const plotW = width - padL - padR;
  const x = (v) => padL + (Math.max(0, v) / max) * plotW;

  let s = svgOpen(width, height, title, subtitle);
  s += legend(series.map((se, i) => ({ label: se.label, color: colors[i] })), 20, 68);

  // Recessive grid, behind the marks.
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const v = (max * i) / ticks;
    const px = x(v);
    s += `<line class="gl" x1="${px.toFixed(1)}" y1="${padT - 6}" x2="${px.toFixed(1)}" y2="${height - padB + 2}"/>`;
    s += `<text class="mu" x="${px.toFixed(1)}" y="${height - padB + 16}" text-anchor="middle">${fmt(v)}</text>`;
  }
  if (reference !== undefined) {
    // The reference label sits BELOW the axis, not above the plot: above the plot it
    // collided with the legend row.
    const px = x(reference.value);
    s += `<line class="rf" x1="${px.toFixed(1)}" y1="${padT - 6}" x2="${px.toFixed(1)}" y2="${height - padB + 2}"/>`;
    s += `<text class="mu" x="${(px + 6).toFixed(1)}" y="${height - padB + 32}">${esc(reference.label)}</text>`;
  }

  groups.forEach((g, gi) => {
    const top = padT + gi * groupH;
    s += `<text class="ax" x="${padL - 10}" y="${(top + (groupH - groupGap) / 2 + 4).toFixed(1)}" text-anchor="end">${esc(g)}</text>`;
    series.forEach((se, si) => {
      const v = se.values[gi];
      const y = top + si * (barH + gap);
      const w = Math.max(0, x(v) - padL);
      s += `<title>${esc(`${g} · ${se.label}: ${fmt(v)}`)}</title>`;
      s += `<rect x="${padL}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barH}" rx="4" fill="${colors[si]}">` +
        `<title>${esc(`${g} · ${se.label}: ${fmt(v)}`)}</title></rect>`;
      s += `<text class="vl" x="${(padL + w + 7).toFixed(1)}" y="${(y + barH - 2.5).toFixed(1)}">${fmt(v)}</text>`;
    });
  });

  s += `<text class="mu" x="${width / 2}" y="${height - 10}" text-anchor="middle">${esc(xLabel)}</text>`;
  return `${s}\n</svg>\n`;
}

/** Two-series line chart over level number. 2px strokes, 8px markers, direct end labels. */
function lineChart({ title, subtitle, xs, series, yMax, fmt, xLabel, yLabel, colors, width = 720, height = 400 }) {
  const padL = 66, padR = 152, padT = 112, padB = 58;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const x = (i) => padL + (xs.length === 1 ? plotW / 2 : (i / (xs.length - 1)) * plotW);
  const y = (v) => padT + plotH - (Math.max(0, v) / yMax) * plotH;

  let s = svgOpen(width, height, title, subtitle);
  s += legend(series.map((se, i) => ({ label: se.label, color: colors[i] })), 20, 68);
  // The y-axis label gets its own line under the legend; sharing a line collided.
  s += `<text class="mu" x="20" y="90">${esc(yLabel)}</text>`;

  for (let i = 0; i <= 4; i++) {
    const v = (yMax * i) / 4;
    s += `<line class="gl" x1="${padL}" y1="${y(v).toFixed(1)}" x2="${padL + plotW}" y2="${y(v).toFixed(1)}"/>`;
    s += `<text class="mu" x="${padL - 8}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`;
  }
  xs.forEach((xv, i) => {
    s += `<text class="mu" x="${x(i).toFixed(1)}" y="${height - padB + 17}" text-anchor="middle">${esc(xv)}</text>`;
  });

  series.forEach((se, si) => {
    const pts = se.values.map((v, i) => (v === null ? null : [x(i), y(v)]));
    const path = pts.filter(Boolean).map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    s += `<path d="${path}" fill="none" stroke="${colors[si]}" stroke-width="2" stroke-linecap="round"/>`;
    pts.forEach((p, i) => {
      if (!p) return;
      // 2px surface ring so overlapping markers stay separable.
      s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5" fill="${colors[si]}" stroke="${INK.surface}" stroke-width="2">` +
        `<title>${esc(`${se.label} · level ${xs[i]}: ${fmt(se.values[i])}`)}</title></circle>`;
    });
    const last = pts.filter(Boolean).at(-1);
    if (last) {
      s += `<text class="vl" x="${(last[0] + 11).toFixed(1)}" y="${(last[1] + 4).toFixed(1)}" fill="${colors[si]}">${esc(se.label)}</text>`;
    }
  });

  s += `<text class="mu" x="${padL + plotW / 2}" y="${height - 10}" text-anchor="middle">${esc(xLabel)}</text>`;
  return `${s}\n</svg>\n`;
}

function table(caption, head, rows) {
  return `<figure><figcaption>${esc(caption)}</figcaption><table>` +
    `<thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<t${i === 0 ? 'h' : 'd'}>${esc(c)}</t${i === 0 ? 'h' : 'd'}>`).join('')}</tr>`).join('')}</tbody>` +
    `</table></figure>`;
}

if (isMain(import.meta.url)) {
  const a = args();
  const seeds = num(a.seeds, 12);
  const levels = num(a.levels, 8);
  mkdirSync(OUT, { recursive: true });
  console.log(`measuring (${seeds} seeds, levels 1-${levels})...`);

  // ---- figure 1: top-1 accuracy by bot and mode -------------------------------
  const accByMode = {};
  for (const mode of MODES) {
    accByMode[mode] = BOT_NAMES.map((bot) => {
      const v = [];
      for (let s = 1; s <= seeds; s++) {
        const c = career({ bot, mode, seed: s, levels: 6, attemptsPerLevel: 3, predictions: true, scoreFrom: 2 });
        if (c.accuracy !== null) v.push(c.accuracy);
      }
      return mean(v);
    });
  }
  const fig1 = groupedBars({
    title: 'Top-1 district prediction, 20 ticks ahead',
    subtitle: `Where the player stands 20 ticks later. ${seeds} careers per bot, levels 1-6.`,
    groups: BOT_NAMES,
    series: MODES.map((m) => ({ label: MODE_SHORT[m], values: accByMode[m] })),
    max: 0.9,
    fmt: (v) => `${(100 * v).toFixed(0)}%`,
    xLabel: 'top-1 accuracy',
    reference: { value: 1 / 12, label: 'chance (1 of 12 districts)' },
    colors: RAMP,
  });
  writeFileSync(resolve(OUT, 'accuracy.svg'), fig1);

  // ---- figure 2: does the dossier compound across levels? ---------------------
  const perLevel = {};
  for (const mode of ['chain', 'chainDossier']) {
    const acc = Array.from({ length: levels }, () => []);
    for (const bot of ['beeline', 'wallHugger', 'coverCrawler']) {
      for (let s = 1; s <= seeds; s++) {
        const c = career({
          bot, mode, seed: s, levels, attemptsPerLevel: 1,
          predictions: true, scoreFrom: 1, freshChainPerAttempt: true,
        });
        for (let L = 1; L <= levels; L++) {
          const bl = c.byLevel[L];
          if (bl && bl.accuracy !== null) acc[L - 1].push(bl.accuracy);
        }
      }
    }
    perLevel[mode] = acc.map((v) => (v.length ? mean(v) : null));
  }
  const fig2 = lineChart({
    // Named for what the data shows, not for what would have been nicer: the gain is a
    // step at the level-2 boundary that then holds, not a curve that climbs with depth.
    title: 'The dossier transfers; the chain starts over',
    subtitle: 'Level 1 is the control \u2014 an empty dossier, so the two are the same system.',
    xs: Array.from({ length: levels }, (_, i) => String(i + 1)),
    series: [
      { label: 'chain only', values: perLevel.chain },
      { label: 'chain + dossier', values: perLevel.chainDossier },
    ],
    yMax: 0.4,
    fmt: (v) => `${(100 * v).toFixed(0)}%`,
    xLabel: 'district \u2014 tier 1 is wiped at every boundary, tier 2 is not',
    yLabel: 'top-1 accuracy',
    colors: CAT,
  });
  writeFileSync(resolve(OUT, 'transfer.svg'), fig2);

  // ---- figure 3: is it actually waiting for you? ------------------------------
  const feByMode = {};
  for (const mode of MODES) {
    feByMode[mode] = BOT_NAMES.map((bot) => {
      const v = [];
      for (let s = 1; s <= seeds; s++) {
        const c = career({ bot, mode, seed: s, levels: 6, attemptsPerLevel: 3 });
        if (c.meanFirstEncounter !== null) v.push(c.meanFirstEncounter);
      }
      return mean(v);
    });
  }
  const fig3 = groupedBars({
    title: 'Ticks until the first patrol is within detection range',
    subtitle: 'Lower means the system was already there. Same careers as figure 1.',
    groups: BOT_NAMES,
    series: MODES.map((m) => ({ label: MODE_SHORT[m], values: feByMode[m] })),
    max: 130,
    fmt: (v) => v.toFixed(0),
    xLabel: 'mean ticks to first encounter (8 ticks = 1 second)',
    colors: RAMP,
  });
  writeFileSync(resolve(OUT, 'encounter.svg'), fig3);

  // ---- the table view ---------------------------------------------------------
  const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NOISE — benchmarks</title>
<meta name="color-scheme" content="dark">
<style>
  :root { --bg:#07090c; --panel:#0c1016; --line:#1e2834; --fg:#dfe7f2; --dim:#8294a8; --faint:#5b6b7e; }
  html,body { margin:0; background:var(--bg); color:var(--fg);
    font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  main { max-width: 820px; margin: 0 auto; padding: 40px 16px 80px; }
  h1 { letter-spacing:.3em; font-size:22px; margin:0 0 4px; }
  h2 { font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:var(--faint);
    margin:44px 0 12px; border-bottom:1px solid var(--line); padding-bottom:8px; }
  p { color:var(--dim); max-width:68ch; }
  a { color:#19e0c8; }
  img { max-width:100%; height:auto; display:block; border:1px solid var(--line); border-radius:4px; background:var(--panel); }
  figure { margin:18px 0; }
  figcaption { color:var(--faint); font-size:11.5px; margin-bottom:6px; }
  table { border-collapse:collapse; width:100%; font-size:12.5px; }
  th,td { text-align:right; padding:5px 9px; border-bottom:1px solid var(--line); }
  thead th { color:var(--faint); font-weight:600; }
  tbody th { text-align:left; color:var(--dim); font-weight:400; }
  .note { color:var(--faint); font-size:12px; }
</style></head><body><main>
<h1>NOISE</h1>
<p class="note">Benchmark figures, generated by <code>npm run plots</code>. Every number is measured, not
asserted; <a href="../index.html">play the game</a> or run <code>npm test</code> for the acceptance criteria.
Each figure carries its data as a table below it, so nothing here depends on telling the colours apart.</p>

<h2>1 · Can it predict you at all?</h2>
<p>Each bar is the share of the time the predictor's single most likely district is the one the
player is actually standing in twenty ticks later. Chance is one in twelve.</p>
<img src="plots/accuracy.svg" alt="Grouped bars: top-1 district prediction accuracy per bot under four spawner modes.">
${table('Top-1 accuracy (%) by bot and spawner mode',
    ['bot', ...MODES.map((m) => MODE_LABEL[m])],
    BOT_NAMES.map((b, i) => [b, ...MODES.map((m) => (100 * accByMode[m][i]).toFixed(1))]))}
<p class="note">The chain alone is excellent for players who sit still and barely better than chance for
players who cross the map: counts from one short one-way trip converge on where the player
<em>has been</em>, which twenty ticks ahead of a mover is behind them. Tier 2 is what recovers those cases.</p>

<h2>2 · Does learning carry across levels?</h2>
<p>Tier 1 is deleted at every level boundary, so anything that improves with level number is
the dossier. One attempt per level, averaged over the three goal-driven bots.</p>
<img src="plots/transfer.svg" alt="Line chart: top-1 accuracy by level, chain only versus chain plus dossier.">
${table('Top-1 accuracy (%) by level',
    ['level', 'chain only', 'chain + dossier'],
    Array.from({ length: levels }, (_, i) => [String(i + 1),
      perLevel.chain[i] === null ? '—' : (100 * perLevel.chain[i]).toFixed(1),
      perLevel.chainDossier[i] === null ? '—' : (100 * perLevel.chainDossier[i]).toFixed(1)]))}

<h2>3 · Is it actually waiting for you?</h2>
<p>Accuracy is a claim about a distribution. This is the claim a player can feel: how long
before a patrol is close enough to see you.</p>
<img src="plots/encounter.svg" alt="Grouped bars: mean ticks to first encounter per bot under four spawner modes.">
${table('Mean ticks to first encounter by bot and spawner mode',
    ['bot', ...MODES.map((m) => MODE_LABEL[m])],
    BOT_NAMES.map((b, i) => [b, ...MODES.map((m) => feByMode[m][i].toFixed(1))]))}
<p class="note">Lower under the full spawner than under uniform for all five bots, and the two bots that
survive long enough for the predictor to converge — drunk and evader — lose more than half their
grace period.</p>
</main></body></html>
`;
  writeFileSync(resolve(OUT, '..', 'bench.html'), page);

  console.log(`wrote docs/plots/accuracy.svg, docs/plots/transfer.svg, docs/plots/encounter.svg`);
  console.log(`wrote docs/bench.html`);
}
