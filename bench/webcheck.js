// bench/webcheck.js -- run the browser layer under Node against a DOM shim.
//
// `npm run webcheck`. This is not a substitute for opening the page, and it does not
// claim to be: nothing here draws a pixel or proves the CSS lays out. What it does prove
// is that the wiring executes -- that every element id main.js reaches for exists in
// index.html, that boot, profile entry, the fixed-timestep loop, run completion,
// dossier persistence, level advance, live mode switching and the no-WebGPU dispatch
// fallback all run without throwing.

import { installDom } from './domshim.js';
import { isMain, args } from './cli.js';

const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail == null ? '' : String(detail) });
  } catch (err) {
    results.push({ name, ok: false, detail: err?.stack || String(err) });
  }
}

export async function run({ webgpu = false, indexeddb = 'absent' } = {}) {
  const warnings = [];
  const errors = [];
  const realWarn = console.warn, realError = console.error;
  console.warn = (...a) => warnings.push(a.join(' '));
  console.error = (...a) => { errors.push(a.join(' ')); realError(...a); };

  const dom = installDom({ webgpu, indexeddb });
  // Cache-bust so repeated runs in one process get a fresh module graph.
  const { default: _ } = { default: null };
  await import(`../web/main.js?t=${Date.now()}`);
  // boot() is async and started at import time; let its microtasks drain.
  for (let i = 0; i < 50; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 30));

  const app = globalThis.window.NOISE || globalThis.NOISE;

  check('boot completed without throwing', () => {
    if (errors.length) throw new Error(errors.join('\n'));
    if (!app) throw new Error('window.NOISE was never set');
    return `store=${app.storeKind}`;
  });

  check('launch screen rendered both profile slots', () => {
    const slots = dom.byId.get('slots');
    if (!slots || slots.children.length !== 2) throw new Error(`expected 2 slots, got ${slots?.children.length}`);
    return slots.children.map((c) => c.innerHTML.match(/<h2>(\w+)<\/h2>/)?.[1]).join(', ');
  });

  await app.enterProfile('main');
  for (let i = 0; i < 20; i++) await Promise.resolve();

  check('level 1 generated and game constructed', () => {
    if (!app.game) throw new Error('no game');
    if (app.level.level !== 1) throw new Error(`expected level 1, got ${app.level.level}`);
    if (dom.byId.get('game').hidden) throw new Error('game screen still hidden');
    return `${app.level.rooms.length} rooms, ${app.level.caches.length} caches, ${app.level.regions.count} regions`;
  });

  check('HUD and panels populated on level start', () => {
    const bars = dom.byId.get('prediction-list');
    if (bars.children.length !== app.level.regions.count) {
      throw new Error(`prediction bars ${bars.children.length} != regions ${app.level.regions.count}`);
    }
    if (!dom.byId.get('dispatch-text').textContent) throw new Error('dispatch panel empty');
    if (!dom.byId.get('hud-caches').textContent) throw new Error('caches readout empty');
    return `dispatch: "${dom.byId.get('dispatch-text').textContent.slice(0, 48)}..."`;
  });

  check('fixed-timestep loop advances the sim', () => {
    const before = app.game.tick;
    // Drive frames by hand: 40 frames of 125 ms is 40 ticks.
    let t = performance.now();
    for (let i = 0; i < 40 && !app.game.over; i++) {
      t += 125;
      app._frame(t);
    }
    if (app.game.tick <= before) throw new Error(`tick did not advance (${before} -> ${app.game.tick})`);
    return `tick ${app.game.tick}, patrols ${app.game.patrols.length}`;
  });

  check('live spawner mode switch takes effect without restarting', () => {
    const tickBefore = app.game.tick;
    const levelBefore = app.level.level;
    for (const mode of ['uniform', 'chain', 'chainDossier', 'full']) {
      dom.byId.get('mode-select').value = mode;
      dom.byId.get('mode-select').fire('change', { target: { value: mode } });
      if (app.system.mode !== mode) throw new Error(`system mode did not change to ${mode}`);
    }
    if (app.level.level !== levelBefore) throw new Error('mode switch restarted the level');
    if (app.game.tick < tickBefore) throw new Error('mode switch reset the run');
    return 'all four modes switched in place';
  });

  check('input: a queued tap survives to the next tick', () => {
    app.input.press(1);
    const d = app.input.consume();
    if (d !== 1) throw new Error(`expected dir 1, got ${d}`);
    app.input.release(1);
    return 'ok';
  });

  {
    let t = performance.now();
    let guard = 0;
    while (!app.game.over && guard++ < 4000) { t += 125; app._frame(t); }
    for (let i = 0; i < 60; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 20));
  }

  check('terminal state reached', () => {
    if (!app.game.over) throw new Error('run never ended');
    return `${app.game.won ? 'won' : `lost (${app.game.loseReason})`} at tick ${app.game.tick}, score ${app.game.score}`;
  });

  check('dossier folded and run persisted to the active profile', () => {
    const rec = app.store.current();
    if (rec.id !== 'main') throw new Error(`active profile is ${rec.id}`);
    if (rec.runs.length < 1) throw new Error('no run recorded');
    if (!rec.dossier || rec.dossier.updates < 1) throw new Error('dossier not folded');
    const traits = Object.keys(rec.dossier.traits || {}).length;
    if (traits === 0) throw new Error('dossier has no traits');
    return `${rec.runs.length} run(s), ${traits} traits, updates=${rec.dossier.updates}`;
  });

  check('outcome overlay shown with stats', () => {
    if (dom.byId.get('overlay').hidden) throw new Error('overlay hidden after run end');
    const stats = dom.byId.get('overlay-stats').innerHTML;
    if (!stats.includes('noise index')) throw new Error('overlay stats missing');
    return dom.byId.get('overlay-title').textContent;
  });

  check('overlay primary button advances or retries', () => {
    const was = app.level.level;
    const wonRun = app.game.won;
    dom.byId.get('overlay-primary').fire('click');
    const now = app.level.level;
    if (wonRun && now !== was + 1) throw new Error(`won run did not advance (${was} -> ${now})`);
    if (!wonRun && now !== was) throw new Error(`lost run changed level (${was} -> ${now})`);
    if (!app.game || app.game.over) throw new Error('new run not started');
    return `level ${was} -> ${now}`;
  });

  check('tier 1 persists across runs of the same level, not across levels', () => {
    const lvl = app.level.level;
    const chain = app.chains.get(lvl);
    if (!chain) throw new Error('no chain cached for the current level');
    const obs = chain.observations;
    app.startLevel(lvl);
    if (app.chains.get(lvl) !== chain) throw new Error('chain was replaced on a replay of the same level');
    if (app.chains.get(lvl).observations < obs) throw new Error('chain lost observations on replay');
    app.startLevel(lvl + 1);
    if (app.chains.get(lvl + 1) === chain) throw new Error('chain carried into a new level');
    return `level ${lvl} chain kept ${obs} observations; level ${lvl + 1} started fresh`;
  });

  const mainBefore = JSON.stringify(await app.store.peek('main'));
  await app.enterProfile('guest');
  for (let i = 0; i < 20; i++) await Promise.resolve();
  {
    let t = performance.now();
    let guard = 0;
    while (!app.game.over && guard++ < 4000) { t += 125; app._frame(t); }
    for (let i = 0; i < 60; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 20));
  }
  const mainAfter = JSON.stringify(await app.store.peek('main'));

  check('isolation rule holds through the real UI path', () => {
    if (mainBefore !== mainAfter) throw new Error('a guest run modified the main profile');
    const guest = app.store.current();
    if (guest.id !== 'guest') throw new Error('active profile is not guest');
    if (guest.dossier.updates < 1) throw new Error('guest dossier was not written');
    return 'main byte-identical; guest dossier written';
  });

  check('dispatch degrades to templates without WebGPU', () => {
    const text = dom.byId.get('dispatch-text').textContent;
    if (!text || text === '—') throw new Error('dispatch panel is empty');
    if (app.dispatcher.usingModel) throw new Error('claims a model without WebGPU');
    return `"${text.slice(0, 60)}..."`;
  });

  check('no unexpected console errors', () => {
    if (errors.length) throw new Error(errors.join('\n'));
    return `${warnings.length} warning(s)`;
  });

  console.warn = realWarn;
  console.error = realError;
  return { results, warnings };
}

if (isMain(import.meta.url)) {
  const a = args();
  const indexeddb = a.indexeddb || 'absent';
  const webgpu = !!a.webgpu;
  const { results: rs, warnings } = await run({ webgpu, indexeddb });
  let failed = 0;
  console.log(`\nWEB LAYER CHECK (Node + DOM shim, WebGPU ${webgpu ? 'claimed' : 'absent'}, IndexedDB ${indexeddb})\n`);
  for (const r of rs) {
    console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}`);
    if (r.detail) console.log(`        ${r.detail.split('\n').slice(0, 6).join('\n        ')}`);
    if (!r.ok) failed++;
  }
  if (warnings.length) {
    console.log('\n  warnings (expected: storage and model fallbacks)');
    for (const w of [...new Set(warnings)]) console.log(`    - ${w}`);
  }
  console.log(`\n  ${rs.filter((r) => r.ok).length}/${rs.length} passed\n`);
  process.exit(failed ? 1 : 0);
}
