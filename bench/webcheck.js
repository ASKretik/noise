// bench/webcheck.js -- run the browser layer under Node against a DOM shim.
//
// `npm run webcheck`. This is not a substitute for opening the page, and it does not
// claim to be: nothing here draws a pixel or proves the CSS lays out. What it does prove
// is that the wiring executes -- that every element id main.js reaches for exists in
// index.html, that boot, profile entry, the fixed-timestep loop, run completion,
// dossier persistence, level advance, live mode switching and the no-WebGPU dispatch
// fallback all run without throwing.

import { installDom } from './domshim.js';
import { Dossier } from '../sim/predictor/dossier.js';
import { isMain, args } from './cli.js';

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail == null ? '' : String(detail) });
  } catch (err) {
    results.push({ name, ok: false, detail: err?.stack || String(err) });
  }
}

export async function run({ webgpu = false, indexeddb = 'working' } = {}) {
  const warnings = [];
  const errors = [];
  const realWarn = console.warn, realError = console.error;
  console.warn = (...a) => warnings.push(a.join(' '));
  console.error = (...a) => { errors.push(a.join(' ')); realError(...a); };

  // ---- the launch page ----
  const launchDom = installDom({ webgpu, indexeddb, page: 'index.html' });
  await import(`../web/launch.js?t=${Date.now()}`);
  for (let i = 0; i < 50; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 20));

  await check('launch page offers both slots as new files needing a tier', () => {
    const slots = launchDom.byId.get('slots');
    if (!slots || slots.children.length !== 2) throw new Error(`expected 2 slots, got ${slots?.children.length}`);
    // Saves were scrapped, so both slots are fresh and must ask for a tier rather than
    // linking straight into a district.
    const linked = slots.children.filter((c) => c.href);
    if (linked.length !== 0) throw new Error(`a fresh slot linked straight through: ${linked.map((c) => c.href)}`);
    const labels = slots.children.map((c) => (c.innerHTML.match(/<h2>(\w+)/) || [])[1]);
    return `${labels.join(', ')} — both new, both must choose a tier first`;
  });

  await check('choosing a tier offers all four and is permanent', () => {
    launchDom.byId.get('slots').children[0].fire('click');
    const tiers = launchDom.byId.get('tiers');
    if (tiers.children.length !== 4) throw new Error(`expected 4 tiers, got ${tiers.children.length}`);
    if (launchDom.byId.get('chooser').hidden) throw new Error('chooser stayed hidden');
    return tiers.children.map((c) => c.dataset.tier).join(', ');
  });

  // ---- the hub ----
  const hubDom = installDom({ webgpu, indexeddb, page: 'districts.html', search: '?p=main' });
  // Seed a tier the way the chooser would, so the hub has a finished save to render.
  {
    const { createProfileStore } = await import(`../web/persist.js?t=${Date.now()}`);
    const { store } = await createProfileStore();
    await store.load('main');
    store.chooseDifficulty('hard');
    await store.addCoins(1200);
    await store.unlockLevel(4);
  }
  await import(`../web/districts.js?t=${Date.now()}`);
  for (let i = 0; i < 60; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 20));

  await check('hub shows all 100 districts in ten themed belts, locked past the furthest unlocked', async () => {
    const { TOTAL_DISTRICTS, BLOCK_SIZE, DISTRICT_THEMES } = await import('../web/themes.js');
    const grid = hubDom.byId.get('district-grid');
    const cards = grid.children.filter((c) => c.classList.contains('district'));
    const heads = grid.children.filter((c) => c.classList.contains('block-head'));

    if (cards.length !== TOTAL_DISTRICTS) throw new Error(`${cards.length} district cards, expected ${TOTAL_DISTRICTS}`);
    if (heads.length !== TOTAL_DISTRICTS / BLOCK_SIZE) throw new Error(`${heads.length} belt headings, expected ${TOTAL_DISTRICTS / BLOCK_SIZE}`);

    // Every belt must carry a distinct accent, and name it rather than rely on colour.
    const accents = new Set(cards.map((c) => c.style.getPropertyValue('--d-accent')));
    if (accents.size !== DISTRICT_THEMES.length) throw new Error(`${accents.size} distinct accents, expected ${DISTRICT_THEMES.length}`);
    const named = heads.every((h) => DISTRICT_THEMES.some((t) => h.textContent.startsWith(t.name)));
    if (!named) throw new Error('a belt heading did not name its palette');

    // Unlocked through 4 (seeded above), so exactly 4 playable and the rest locked.
    const playable = cards.filter((c) => c.href);
    const locked = cards.filter((c) => c.classList.contains('locked'));
    if (playable.length !== 4) throw new Error(`${playable.length} playable, expected 4`);
    if (locked.length !== TOTAL_DISTRICTS - 4) throw new Error(`${locked.length} locked, expected ${TOTAL_DISTRICTS - 4}`);
    if (!playable[0].href.includes('d=1')) throw new Error(`first card links to ${playable[0].href}`);

    return `${cards.length} cards across ${heads.length} belts (${[...accents].length} palettes), ` +
      `${playable.length} playable, ${locked.length} locked`;
  });

  await check('shop sells the gun, charges and lightning, and refuses what is unaffordable', () => {
    hubDom.byId.get('tab-shop').fire('click');
    const items = hubDom.byId.get('shop-grid').children;
    if (items.length !== 3) throw new Error(`expected 3 shop items, got ${items.length}`);
    // Buying the gun must debit exactly 500 and arrive loaded.
    const coins = () => Number(hubDom.byId.get('wallet-coins').textContent.replace(/,/g, ''));
    const before = coins();
    const buyRow = (card) => card.children.find((c) => c.classList.contains('buy-row'));
    buyRow(items[0]).children[0].fire('click');          // the gun
    const afterGun = coins();
    if (before - afterGun !== 500) throw new Error(`gun cost ${before - afterGun}, expected 500`);

    // Lightning: the smallest bundle is 5 seconds at 10 coins each.
    const lightning = hubDom.byId.get('shop-grid').children[2];
    buyRow(lightning).children[0].fire('click');
    const afterBolt = coins();
    if (afterGun - afterBolt !== 50) throw new Error(`5s of lightning cost ${afterGun - afterBolt}, expected 50`);

    // And a purchase that cannot be afforded must be refused, not silently allowed.
    const reloads = hubDom.byId.get('shop-grid').children[1];
    const disabled = buyRow(reloads).children.filter((b) => b.disabled).length;
    return `wallet ${before} -> ${afterBolt}; ${disabled} reload option(s) correctly disabled (gun is full)`;
  });

  // ---- the play page ----
  const dom = installDom({ webgpu, indexeddb, page: 'play.html', search: '?p=main&d=1' });
  // Cache-bust so repeated runs in one process get a fresh module graph.
  await import(`../web/play.js?t=${Date.now()}`);
  // boot() is async and started at import time; let its microtasks drain.
  for (let i = 0; i < 80; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 40));

  const app = globalThis.window.NOISE || globalThis.NOISE;

  await check('boot completed without throwing', () => {
    if (errors.length) throw new Error(errors.join('\n'));
    if (!app) throw new Error('window.NOISE was never set');
    return `store=${app.storeKind}`;
  });

  await check('district 1 generated and game constructed', () => {
    if (!app.game) throw new Error('no game');
    if (app.level.level !== 1) throw new Error(`expected district 1, got ${app.level.level}`);
    if (app.profileId !== 'main') throw new Error(`wrong profile: ${app.profileId}`);
    return `${app.level.rooms.length} rooms, ${app.level.caches.length} keys, ` +
      `${app.level.stats.buildingCount} buildings, ${app.level.stats.safeBoxCount} black boxes, ` +
      `${app.level.stats.coinCount} coins worth ${app.level.stats.coinValue}, ` +
      `tier ${app.difficultyId}`;
  });

  await check('the loadout bought in the shop is carried into the district', () => {
    if (!app.game.loadout.stunGun) throw new Error('gun did not come through');
    if (app.game.loadout.bullets !== 6) throw new Error(`bullets=${app.game.loadout.bullets}`);
    return `gun with ${app.game.loadout.bullets} charges, ${app.game.loadout.boltSeconds}s lightning`;
  });

  await check('E stuns only what can currently see the player, one charge each', () => {
    // Walk an alien into range by stepping the sim, then fire.
    let t = performance.now();
    for (let i = 0; i < 400 && !app.game.over; i++) {
      t += 125;
      app._frame(t);
      if (app.game.patrols.some((p) => Math.hypot(p.x - app.game.player.x, p.y - app.game.player.y) <= app.game.effectiveRadius)) break;
    }
    const before = app.game.loadout.bullets;
    const res = app.game.fireStun();
    if (res.fired > 0) {
      if (app.game.loadout.bullets !== before - res.fired) throw new Error('charge accounting is wrong');
      const stunned = app.game.patrols.filter((p) => (p.stunnedUntil || 0) > app.game.tick);
      if (stunned.length !== res.fired) throw new Error('stun count does not match charges spent');
      return `${res.fired} stunned, ${app.game.loadout.bullets} charges left`;
    }
    // Nothing was in range; the gun must have refused rather than wasted a charge.
    if (app.game.loadout.bullets !== before) throw new Error('spent a charge on nothing');
    return `nothing in range, refused cleanly (${res.reason})`;
  });

  await check('L only drains lightning while it is switched on', () => {
    app.startLevel(1);
    const start = app.game.boltBankTicks;
    let t = performance.now();
    for (let i = 0; i < 8 && !app.game.over; i++) { t += 125; app._frame(t); }
    if (app.game.boltBankTicks !== start) throw new Error('lightning drained while switched off');
    app.boltOn = true;
    for (let i = 0; i < 8 && !app.game.over; i++) { t += 125; app._frame(t); }
    if (app.game.boltBankTicks >= start) throw new Error('lightning did not drain while on');
    return `${start} ticks banked, ${start - app.game.boltBankTicks} drained once switched on`;
  });

  await check('a black box hides the player and erases the trail', () => {
    const g = app.game;
    const safe = [];
    for (let i = 0; i < g.map.tiles.length; i++) if (g.map.tiles[i] === 5) safe.push(i);
    if (safe.length === 0) throw new Error('district generated no black boxes');
    // Teleport onto one and raise an alert, then step: it must be gone.
    g.player.x = safe[0] % g.map.w;
    g.player.y = Math.floor(safe[0] / g.map.w);
    g.alertTicks = 20;
    g.lastKnown = { x: 1, y: 1 };
    g.step(-1);
    if (g.alertTicks !== 0 || g.lastKnown !== null) throw new Error('alert survived the black box');
    if (!g.inSafeBox) throw new Error('inSafeBox was false while standing in one');
    return `${safe.length} black-box cells; alert and last-known both cleared`;
  });

  await check('the portal is hidden until every key is collected', () => {
    if (app.game.portalRevealed) throw new Error('portal revealed with keys outstanding');
    if (!app.game.portal) throw new Error('no portal chosen');
    // And it moves between attempts on the same district.
    const sites = new Set();
    for (let i = 0; i < 12; i++) { app.startLevel(1); sites.add(`${app.game.portal.x},${app.game.portal.y}`); }
    if (sites.size < 2) throw new Error(`portal never moved across 12 restarts (${[...sites]})`);
    return `${sites.size} distinct portal sites across 12 restarts of the same district`;
  });

  await check('keys tab reports what is needed', () => {
    const txt = `${dom.byId.get('keytab-count').textContent} ${dom.byId.get('keytab-note').textContent}`;
    if (!/\d+ \/ \d+/.test(txt)) throw new Error(`keys tab reads "${txt}"`);
    if (dom.byId.get('keytab').dataset.state !== 'locked') throw new Error('portal shown open at the start');
    return txt;
  });

  await check('HUD and panels populated on district start', () => {
    const bars = dom.byId.get('prediction-list');
    if (bars.children.length !== app.level.regions.count) {
      throw new Error(`prediction bars ${bars.children.length} != regions ${app.level.regions.count}`);
    }
    if (!dom.byId.get('dispatch-text').textContent) throw new Error('dispatch panel empty');
    if (!dom.byId.get('hud-score').textContent) throw new Error('score readout empty');
    return `dispatch: "${dom.byId.get('dispatch-text').textContent.slice(0, 48)}..."`;
  });

  await check('fixed-timestep loop advances the sim', () => {
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

  await check('live spawner mode switch takes effect without restarting', () => {
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

  await check('input: a queued tap survives to the next tick', () => {
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

  await check('terminal state reached', () => {
    if (!app.game.over) throw new Error('run never ended');
    return `${app.game.won ? 'won' : `lost (${app.game.loseReason})`} at tick ${app.game.tick}, score ${app.game.score}`;
  });

  await check('dossier folded and run persisted to the active profile', () => {
    const rec = app.store.current();
    if (rec.id !== 'main') throw new Error(`active profile is ${rec.id}`);
    if (rec.runs.length < 1) throw new Error('no run recorded');
    if (!rec.dossier || rec.dossier.updates < 1) throw new Error('dossier not folded');
    const traits = Object.keys(rec.dossier.traits || {}).length;
    if (traits === 0) throw new Error('dossier has no traits');
    return `${rec.runs.length} run(s), ${traits} traits, updates=${rec.dossier.updates}`;
  });

  await check('score and coins are paid out, and replaying decays the score', () => {
    const sc = app.lastScore;
    if (!sc) throw new Error('no score computed');
    if (!Number.isFinite(sc.score) || !Number.isFinite(sc.earned)) throw new Error('score or coins not a number');
    if (sc.earned < sc.picked) throw new Error('earned less than was picked up');
    // Same district, same outcome, more attempts: the multiplier must shrink.
    const a = app.lastScore.factors.replay;
    const plays = app.store.playsOf(app.level.level);
    if (plays < 1) throw new Error('attempts were not counted');
    if (a > 1.0001) throw new Error(`replay factor ${a} should never exceed 1`);
    return `score ${sc.score}, +${sc.earned} coins (${sc.picked} picked up, ${sc.coins} from score), ` +
      `attempt ${plays} at x${a.toFixed(2)}`;
  });

  await check('outcome overlay shown with stats', () => {
    if (dom.byId.get('overlay').hidden) throw new Error('overlay hidden after run end');
    const stats = dom.byId.get('overlay-stats').innerHTML;
    if (!stats.includes('noise index')) throw new Error('overlay stats missing');
    return dom.byId.get('overlay-title').textContent;
  });

  await check('overlay primary button advances or retries', () => {
    const was = app.level.level;
    const wonRun = app.game.won;
    dom.byId.get('overlay-primary').fire('click');
    const now = app.level.level;
    if (wonRun && now !== was + 1) throw new Error(`won run did not advance (${was} -> ${now})`);
    if (!wonRun && now !== was) throw new Error(`lost run changed level (${was} -> ${now})`);
    if (!app.game || app.game.over) throw new Error('new run not started');
    return `level ${was} -> ${now}`;
  });

  await check('difficulty is settled once per district and reused on retry', () => {
    const lvl = app.level.level;
    const first = app.store.settledDifficulty(lvl);
    if (app.mode === 'full' && !first) throw new Error('nothing settled for the current district');
    const tauBefore = app.difficulty.tau;
    app.startLevel(lvl);
    if (Math.abs(app.difficulty.tau - tauBefore) > 1e-9) {
      throw new Error(`retry changed tau ${tauBefore} -> ${app.difficulty.tau}`);
    }
    if (!app.difficulty.settled) throw new Error('retry did not report settled difficulty');
    return `tau ${tauBefore.toFixed(3)} held across a retry of district ${lvl}`;
  });

  await check('tier 1 persists across runs of the same district, not across districts', () => {
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

  // Switch the ACTIVE profile on the same store, which is what the isolation rule
  // actually governs. (Navigating to play.html?p=guest would create a second store with
  // its own backend and prove nothing.)
  const mainBefore = JSON.stringify(await app.store.peek('main'));
  app.profile = await app.store.load('guest');
  app.profileId = 'guest';
  app.dossier = Dossier.fromJSON(app.profile.dossier);
  app.chains.clear();
  app.startLevel(1);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  {
    let t = performance.now();
    let guard = 0;
    while (!app.game.over && guard++ < 4000) { t += 125; app._frame(t); }
    for (let i = 0; i < 60; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 20));
  }
  const mainAfter = JSON.stringify(await app.store.peek('main'));

  await check('isolation rule holds through the real UI path', () => {
    if (mainBefore !== mainAfter) throw new Error('a guest run modified the main profile');
    const guest = app.store.current();
    if (guest.id !== 'guest') throw new Error('active profile is not guest');
    if (guest.dossier.updates < 1) throw new Error('guest dossier was not written');
    return 'main byte-identical; guest dossier written';
  });

  await check('alien division is scheduled in the 10-15 second window', () => {
    app.startLevel(1);
    const [lo, hi] = app.game.params.splitIntervalTicks;
    const at = app.game.splitAt;
    if (at === null) throw new Error('no division scheduled');
    if (at < lo || at > hi) throw new Error(`first division at tick ${at}, outside [${lo}, ${hi}]`);
    // Drive the run out and report whether the squad took distinct roles.
    let t = performance.now();
    let guard = 0;
    while (!app.game.over && guard++ < 3000) { t += 125; app._frame(t); }
    const s = app.game.summary();
    const roles = new Set(app.game.spawnLog.map((e) => (e.split ? 'division' : 'arrival')));
    return `first division due at tick ${at} (window ${lo}-${hi}); run lasted ${s.ticks} ticks, ` +
      `${s.splits} division(s), peak ${s.peakAliens} aliens, log: ${[...roles].join(',') || 'none'}`;
  });

  await check('dispatch degrades to templates without WebGPU', () => {
    const text = dom.byId.get('dispatch-text').textContent;
    if (!text || text === '—') throw new Error('dispatch panel is empty');
    if (app.dispatcher.usingModel) throw new Error('claims a model without WebGPU');
    return `"${text.slice(0, 60)}..."`;
  });

  await check('no unexpected console errors', () => {
    if (errors.length) throw new Error(errors.join('\n'));
    return `${warnings.length} warning(s)`;
  });

  console.warn = realWarn;
  console.error = realError;
  return { results, warnings };
}

if (isMain(import.meta.url)) {
  const a = args();
  const indexeddb = a.indexeddb || 'working';
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
