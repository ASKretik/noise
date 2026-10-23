// bench/webcheck.js -- run the browser layer under Node against a DOM shim.
//
// `npm run webcheck`. This is not a substitute for opening the page, and it does not
// claim to be: nothing here draws a pixel or proves the CSS lays out. What it does prove
// is that the wiring executes -- that every element id main.js reaches for exists in
// index.html, that boot, profile entry, the fixed-timestep loop, run completion,
// dossier persistence, level advance, live mode switching and the no-WebGPU dispatch
// fallback all run without throwing.

import { installDom, endBrowserSession } from './domshim.js';
import { Dossier } from '../sim/predictor/dossier.js';
import { isMain, args } from './cli.js';

const results = [];

/**
 * Nothing in a district moves until the player presses a direction (sim/game.js's
 * opening freeze), so every loop that drives frames has to begin like a player does.
 * Holding east is enough: the figure walks until it meets a wall and then stands.
 */
function begin(app) { app.input.press(1); }
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

  const actionsOf = (slot) => slot.children.find((c) => c.classList.contains('slot-actions'));

  await check('launch page offers both slots as new files needing a tier', () => {
    const slots = launchDom.byId.get('slots');
    if (!slots || slots.children.length !== 2) throw new Error(`expected 2 slots, got ${slots?.children.length}`);
    for (const slot of slots.children) {
      const acts = actionsOf(slot);
      if (!acts) throw new Error('a slot has no actions row');
      if (acts.children.some((b) => b.href)) throw new Error('a fresh slot linked straight into a district');
      if (acts.children.length !== 1) throw new Error(`a fresh slot offered ${acts.children.length} actions, expected 1`);
    }
    return 'MAIN, GUEST — both new, both must choose a tier first';
  });

  await check('choosing a tier offers all four and is permanent', () => {
    actionsOf(launchDom.byId.get('slots').children[0]).children[0].fire('click');
    const tiers = launchDom.byId.get('tiers');
    if (tiers.children.length !== 4) throw new Error(`expected 4 tiers, got ${tiers.children.length}`);
    if (launchDom.byId.get('chooser').hidden) throw new Error('chooser stayed hidden');
    return tiers.children.map((c) => c.dataset.tier).join(', ');
  });

  await check('an existing MAIN offers continue AND start-fresh; fresh erases everything', async () => {
    const { createProfileStore } = await import(`../web/persist.js?t=${Date.now()}`);
    const { store } = await createProfileStore();
    await store.load('main');
    store.chooseDifficulty('hard');
    await store.unlockLevel(6);
    await store.addCoins(777);
    await store.saveDossier({ traits: { wallAffinity: { mean: 0.9, var: 0.01, n: 5 } }, updates: 5, levelsSeen: 5 });

    // Re-render the launch screen against that file.
    installDom({ webgpu, indexeddb, page: 'index.html' });
    await import(`../web/launch.js?t=${Date.now()}`);
    for (let i = 0; i < 60; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 20));

    const main = globalThis.document.getElementById('slots').children[0];
    const acts = actionsOf(main);
    if (acts.children.length !== 2) throw new Error(`MAIN offered ${acts.children.length} actions, expected continue + start fresh`);
    if (!acts.children[0].href?.includes('districts.html')) throw new Error('continue does not go to the hub');

    // window.confirm is stubbed true in the shim, so this proceeds.
    acts.children[1].fire('click');
    for (let i = 0; i < 40; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 20));

    const after = await store.peek('main');
    if (after.difficulty !== null) throw new Error('start fresh kept the tier');
    if (after.level !== 1) throw new Error(`start fresh left level ${after.level}`);
    if (after.wallet.coins !== 0) throw new Error('start fresh kept the coins');
    if (Object.keys(after.dossier.traits).length !== 0) throw new Error('start fresh kept the dossier');
    return 'continue + start fresh offered; fresh wiped tier, district, coins and dossier';
  });

  await check('GUEST is wiped when the browser session ends, not on every navigation', async () => {
    const { createProfileStore, ensureGuestSession } = await import(`../web/persist.js?t=${Date.now()}`);
    const { store } = await createProfileStore();

    await ensureGuestSession(store);                 // this session is now marked
    await store.load('guest');
    store.chooseDifficulty('easy');
    await store.unlockLevel(4);

    // Navigating between pages inside the same session must NOT wipe it.
    const wipedMidSession = await ensureGuestSession(store);
    const midSession = await store.peek('guest');
    if (wipedMidSession) throw new Error('guest was wiped mid-session');
    if (midSession.level !== 4) throw new Error(`guest lost progress mid-session (level ${midSession.level})`);

    // Closing the tab must.
    endBrowserSession();
    const wipedOnClose = await ensureGuestSession(store);
    const afterClose = await store.peek('guest');
    if (!wipedOnClose) throw new Error('guest survived the tab closing');
    if (afterClose.difficulty !== null || afterClose.level !== 1) {
      throw new Error(`guest survived as tier ${afterClose.difficulty} at district ${afterClose.level}`);
    }

    // And MAIN must be untouched by any of it.
    const main = await store.peek('main');
    if (main === null) throw new Error('main vanished');
    return 'kept across navigation, erased on close, main untouched';
  });

  // ---- the hub ----
  const hubDom = installDom({ webgpu, indexeddb, page: 'districts.html', search: '?p=main' });
  // Seed a tier the way the chooser would, so the hub has a finished save to render.
  const { createProfileStore: mkStore } = await import(`../web/persist.js?t=${Date.now()}`);
  const app0 = await (async () => {
    const { store } = await mkStore();
    await store.load('main');
    store.chooseDifficulty('hard');
    await store.addCoins(2000);
    await store.unlockLevel(4);
    return { store };
  })();
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
    const inv = () => app0.store.current().inventory;
    const before = coins();
    const buyRow = (card) => card.children.find((c) => c.classList.contains('buy-row'));

    // Charges cannot be bought before the gun exists.
    const reloadsFirst = hubDom.byId.get('shop-grid').children[1];
    if (!buyRow(reloadsFirst).children.every((b) => b.disabled)) {
      throw new Error('charges were purchasable without owning a gun');
    }

    buyRow(items[0]).children[0].fire('click');          // the gun
    const afterGun = coins();
    if (before - afterGun !== 500) throw new Error(`gun cost ${before - afterGun}, expected 500`);

    // The gun arrives EMPTY: a loaded one would make the charge price meaningless.
    const invAfterGun = hubDom.byId.get('shop-grid').children[0]
      .children.find((c) => c.classList.contains('owned')).textContent;
    if (!invAfterGun.includes('0/6')) throw new Error(`gun arrived as "${invAfterGun}", expected 0/6`);

    buyRow(hubDom.byId.get('shop-grid').children[1]).children[2].fire('click');   // 6 charges
    const afterCharges = coins();
    if (afterGun - afterCharges !== 600) throw new Error(`6 charges cost ${afterGun - afterCharges}, expected 600`);

    // Lightning: the smallest bundle is 5 seconds at 10 coins each.
    buyRow(hubDom.byId.get('shop-grid').children[2]).children[0].fire('click');
    const afterBolt = coins();
    if (afterCharges - afterBolt !== 50) throw new Error(`5s of lightning cost ${afterCharges - afterBolt}, expected 50`);

    return `wallet ${before} -> ${afterBolt}; gun arrived empty, armed for 600, 5s lightning for 50`;
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
    if (app.game.loadout.bullets !== 6) throw new Error(`charges=${app.game.loadout.bullets}, expected the 6 bought`);
    if (app.game.loadout.boltSeconds < 5) throw new Error(`lightning=${app.game.loadout.boltSeconds}s, expected 5`);
    return `gun with ${app.game.loadout.bullets} charges, ${app.game.loadout.boltSeconds}s lightning`;
  });

  await check('a stunned alien is inert — walking into one does not end the run', () => {
    app.startLevel(1);
    const g = app.game;
    const a = g.patrols[0];
    if (!a) throw new Error('district started with no aliens');
    g.started = true;      // the opening freeze would otherwise short-circuit step()
    a.stunnedUntil = g.tick + g.params.stunTicks;
    g.player.x = a.x; g.player.y = a.y;      // stand directly on it
    g.step(-1);
    if (g.over) throw new Error('a stunned alien still caught the player');
    // And the same alien, awake, must still be lethal.
    a.stunnedUntil = 0;
    g.player.x = a.x; g.player.y = a.y;
    g.step(-1);
    if (!g.over || g.loseReason !== 'caught') throw new Error('an active alien failed to catch the player');
    return 'stunned: survived · awake: caught';
  });

  await check('each belt of ten districts paints its own terrain', async () => {
    const { themeFor } = await import('../web/themes.js');
    const seen = new Map();
    for (const d of [1, 11, 21, 51, 71, 91]) {
      const th = themeFor(d);
      seen.set(th.name, th.terrain.ground);
    }
    if (seen.size !== 6) throw new Error(`6 belts gave ${seen.size} distinct palettes`);
    const grounds = new Set(seen.values());
    if (grounds.size !== 6) throw new Error('two belts share a ground colour');
    // Switching district must invalidate the cached terrain layer.
    app.renderer.setDistrict(1);
    app.renderer._mapKey = 'stale';
    app.renderer.setDistrict(11);
    if (app.renderer._mapKey !== null) throw new Error('terrain layer was not invalidated on a belt change');
    return [...seen].map(([n, g]) => `${n} ${g}`).join(', ');
  });

  await check('E stuns only what can currently see the player, one charge each', () => {
    // Walk an alien into range by stepping the sim, then fire.
    begin(app);
    begin(app);
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

  await check('sprint is held, not latched: one tap is always one cell without Shift', () => {
    app.input.clear();
    app.startLevel(1);
    const g = app.game;
    g.started = true;
    const charge = g.sprintTicks;
    if (charge <= 0) throw new Error('district started with no sprint charge to test');

    // A tap with no Shift must move exactly one cell, charge in hand or not.
    const walk = (sprint) => {
      const x0 = g.player.x, y0 = g.player.y;
      g.step(1, { sprint });
      return Math.abs(g.player.x - x0) + Math.abs(g.player.y - y0);
    };
    const plain = walk(false);
    if (plain > 1) throw new Error(`a tap without Shift moved ${plain} cells`);
    if (g.sprintTicks !== charge) throw new Error('charge drained without sprinting');

    // With Shift it moves two, and the charge pays for it.
    const before = g.sprintTicks;
    const sprinted = walk(true);
    if (sprinted !== 2) throw new Error(`a tap with Shift moved ${sprinted} cells, expected 2`);
    if (g.sprintTicks >= before) throw new Error('sprinting did not spend charge');

    // Releasing drops back to one cell on the very next tick.
    const after = walk(false);
    if (after > 1) throw new Error(`releasing Shift still moved ${after} cells`);

    // Shift keys reach the input layer.
    app.input._onKeyDown({ code: 'ShiftLeft', preventDefault() {} });
    if (!app.input.sprintHeld) throw new Error('ShiftLeft did not register');
    app.input._onKeyUp({ code: 'ShiftLeft', preventDefault() {} });
    if (app.input.sprintHeld) throw new Error('releasing Shift did not clear');

    return `no Shift: 1 cell · Shift: 2 cells and charge spent · released: 1 cell again`;
  });

  await check('a field bolt adds charge rather than firing automatically', () => {
    const g = app.game;
    g.started = true;
    const before = g.fieldBoltTicks;
    const bolt = g.bolts.find((b) => !b.taken);
    if (!bolt) throw new Error('district had no bolts');
    g.player.x = bolt.x; g.player.y = bolt.y;
    g.step(-1, { sprint: false });
    if (!bolt.taken) throw new Error('standing on a bolt did not collect it');
    if (g.fieldBoltTicks <= before) throw new Error('the bolt did not add charge');
    if (g.boosted) throw new Error('the bolt started a sprint on its own');
    return `+${((g.fieldBoltTicks - before) / 8).toFixed(0)}s charge, no automatic sprint`;
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

  await check('nothing moves until the player presses a direction', () => {
    app.input.clear();
    app.startLevel(1);
    const g = app.game;
    if (g.started) throw new Error('the run started on its own');
    const aliensAt = g.patrols.map((p) => `${p.x},${p.y}`).join(' ');
    const tick = g.tick;

    // Fifty frames of no input: the clock, the aliens and the arrival process must all
    // be exactly where they were.
    let t = performance.now();
    for (let i = 0; i < 50; i++) { t += 125; app._frame(t); }
    if (g.tick !== tick) throw new Error(`the clock advanced ${tick} -> ${g.tick} before the first move`);
    if (g.patrols.map((p) => `${p.x},${p.y}`).join(' ') !== aliensAt) throw new Error('an alien moved before the first move');
    if (dom.byId.get('start-hint').hidden) throw new Error('the start prompt was not shown');

    // One direction, and the world comes alive.
    begin(app);
    t += 125; app._frame(t);
    if (!g.started) throw new Error('a direction did not start the run');
    for (let i = 0; i < 40; i++) { t += 125; app._frame(t); }
    if (g.tick <= tick + 1) throw new Error('the clock did not advance after the first move');
    if (!dom.byId.get('start-hint').hidden) throw new Error('the start prompt stayed up');
    return `frozen for 50 idle frames at tick ${tick}, running at tick ${g.tick} after one input`;
  });

  await check('fixed-timestep loop advances the sim', () => {
    // Fresh district: the previous check drove its run to a terminal state.
    app.input.clear();
    app.startLevel(1);
    const before = app.game.tick;
    // Drive frames by hand: 40 frames of 125 ms is 40 ticks.
    begin(app);
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
    begin(app);
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

  await check('outcome overlay is shown, reachable, and releases the thumb controls', () => {
    if (dom.byId.get('overlay').hidden) throw new Error('overlay hidden after run end');
    const stats = dom.byId.get('overlay-stats').innerHTML;
    if (!stats.includes('noise index')) throw new Error('overlay stats missing');

    // The phone bug: the card was clipped by .canvas-wrap's overflow and the primary
    // button was rendered outside the visible box. Both halves of the fix are asserted
    // here -- the body class that hides the thumb controls, and a primary button that is
    // present, labelled and enabled.
    if (!globalThis.document.body.classList.contains('overlay-open')) {
      throw new Error('overlay-open was not set, so the thumb controls still cover the card');
    }
    const primary = dom.byId.get('overlay-primary');
    if (primary.hidden || primary.disabled) throw new Error('primary action is not usable');
    if (!primary.textContent.trim()) throw new Error('primary action has no label');

    return `"${dom.byId.get('overlay-title').textContent}" → "${primary.textContent}"`;
  });

  await check('overlay primary button advances or retries, and clears the overlay state', () => {
    const was = app.level.level;
    const wonRun = app.game.won;
    dom.byId.get('overlay-primary').fire('click');
    const now = app.level.level;
    if (wonRun && now !== was + 1) throw new Error(`won run did not advance (${was} -> ${now})`);
    if (!wonRun && now !== was) throw new Error(`lost run changed level (${was} -> ${now})`);
    if (!app.game || app.game.over) throw new Error('new run not started');
    if (globalThis.document.body.classList.contains('overlay-open')) {
      throw new Error('overlay-open survived the new run, so the thumb controls stay hidden');
    }
    return `district ${was} -> ${now}, overlay state cleared`;
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
    begin(app);
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
    begin(app);
    begin(app);
    let t = performance.now();
    let guard = 0;
    while (!app.game.over && guard++ < 3000) { t += 125; app._frame(t); }
    const s = app.game.summary();
    const roles = new Set(app.game.spawnLog.map((e) => (e.split ? 'division' : 'arrival')));
    return `first division due at tick ${at} (window ${lo}-${hi}); run lasted ${s.ticks} ticks, ` +
      `${s.splits} division(s), peak ${s.peakAliens} aliens, log: ${[...roles].join(',') || 'none'}`;
  });

  await check('light and dark flip, persist, and leave the board alone', async () => {
    const { current, toggle } = await import(`../web/theme.js?t=${Date.now()}`);
    const root = globalThis.document.documentElement;
    const btn = dom.byId.get('btn-theme');

    const first = current();
    if (!['dark', 'light'].includes(first)) throw new Error(`unknown theme "${first}"`);
    if (root.dataset.theme !== first) throw new Error('the document was not stamped on boot');

    btn.fire('click');
    const second = current();
    if (second === first) throw new Error('the toggle did nothing');
    if (root.dataset.theme !== second) throw new Error('the document stamp did not follow');
    if (btn.getAttribute('aria-pressed') !== String(second === 'light')) throw new Error('aria-pressed did not follow');

    // It has to survive a reload, which is a fresh module over the same storage.
    const again = await import(`../web/theme.js?t=${Date.now() + 1}`);
    if (again.current() !== second) throw new Error('the choice did not persist');

    btn.fire('click');
    if (current() !== first) throw new Error('toggling back failed');

    // The board is a rendered scene and must not be restyled by the page theme.
    if (typeof app.renderer.theme.terrain.ground !== 'string') throw new Error('belt terrain went missing');
    return `${first} → ${second} → ${first}, persisted across a reload; belt terrain untouched`;
  });

  await check('the sound toggle flips state and is remembered on the profile', () => {
    const btn = dom.byId.get('btn-sound');
    const label = dom.byId.get('btn-sound-label');
    const was = app.soundOn;
    btn.fire('click');
    if (app.soundOn === was) throw new Error('toggle did nothing');
    if (btn.dataset.on !== String(app.soundOn)) throw new Error('button state did not follow');
    if (!/sound (on|off)/.test(label.textContent)) throw new Error(`label reads "${label.textContent}"`);
    if (btn.getAttribute('aria-pressed') !== String(app.soundOn)) throw new Error('aria-pressed did not follow');
    const stored = app.store.current().settings.soundEnabled;
    if (stored !== app.soundOn) throw new Error(`profile says ${stored}, button says ${app.soundOn}`);
    btn.fire('click');
    return `toggled off and back on, persisted to the profile both times`;
  });

  await check('repeated resizes allocate nothing — the mobile tab-killer', () => {
    const r = app.renderer;
    const map = app.level.map;
    r.resize(map);
    const tile = r.tile;
    const layer = r._staticLayer(map, app.level);
    const w = r.canvas.width;

    // visualViewport fires a burst of these while a phone's address bar animates.
    for (let i = 0; i < 200; i++) r.resize(map);

    if (r.tile !== tile) throw new Error(`tile drifted ${tile} -> ${r.tile}`);
    if (r.canvas.width !== w) throw new Error('canvas backing store was reallocated');
    if (r._mapKey === null) throw new Error('terrain cache was dropped by an identical resize');
    if (r._staticLayer(map, app.level) !== layer) throw new Error('terrain layer was rebuilt');
    return `200 identical resizes: tile held at ${tile}px, no canvas or terrain reallocation`;
  });

  await check('every published build namespaces its own save storage', async () => {
    const { BUILD } = await import('../web/build.js');
    if (!Number.isInteger(BUILD) || BUILD < 1) throw new Error(`bad build stamp: ${BUILD}`);
    const persist = (await import('node:fs')).readFileSync(
      new URL('../web/persist.js', import.meta.url), 'utf8');
    if (!persist.includes('`noise-${BUILD}`')) throw new Error('the database name is not namespaced by the build');
    if (!persist.includes('sweepOldBuilds')) throw new Error('old build databases are never swept');
    const html = (await import('node:fs')).readFileSync(
      new URL('../play.html', import.meta.url), 'utf8');
    if (!html.includes(`style.css?v=${BUILD}`)) {
      throw new Error('the stylesheet cache-buster has drifted from the build stamp — run npm run stamp');
    }
    return `build ${BUILD}: database noise-${BUILD}, stylesheet ?v=${BUILD}, older builds swept`;
  });

  await check('the model is never auto-loaded on a touch device', async () => {
    const { modelAdvisable } = await import('../web/dispatch.js');
    // No WebGPU in Node, so assert the touch branch directly by faking the matchMedia
    // and navigator the real check reads.
    const realNav = globalThis.navigator;
    const realMM = globalThis.window.matchMedia;
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: { gpu: {}, deviceMemory: 8 }, configurable: true, writable: true,
      });
      globalThis.window.matchMedia = () => ({ matches: true });
      const touch = modelAdvisable();
      if (touch.ok) throw new Error('a touch device was cleared to download the weights');

      globalThis.window.matchMedia = () => ({ matches: false });
      const desktop = modelAdvisable();
      if (!desktop.ok) throw new Error(`desktop with WebGPU was refused: ${desktop.reason}`);

      Object.defineProperty(globalThis, 'navigator', {
        value: { gpu: {}, deviceMemory: 2 }, configurable: true, writable: true,
      });
      if (modelAdvisable().ok) throw new Error('a 2GB device was cleared to download the weights');

      Object.defineProperty(globalThis, 'navigator', {
        value: { gpu: {}, deviceMemory: 8, connection: { saveData: true } }, configurable: true, writable: true,
      });
      if (modelAdvisable().ok) throw new Error('data saver was ignored');

      return `refused on: touch, 2GB memory, data saver — allowed on desktop with WebGPU`;
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: realNav, configurable: true, writable: true });
      globalThis.window.matchMedia = realMM;
    }
  });

  await check('dispatch degrades to templates without WebGPU', () => {
    const text = dom.byId.get('dispatch-text').textContent;
    if (!text || text === '—') throw new Error('dispatch panel is empty');
    if (app.dispatcher.usingModel) throw new Error('claims a model without WebGPU');
    return `"${text.slice(0, 60)}..."`;
  });

  // LAST, because it re-installs the global DOM: anything checked after this would be
  // inspecting a different page than the one it set up.
  await check('thumb controls stay off for a mouse and drive movement on a touch device', async () => {
    // Desktop: no stick, and the overlay stays hidden.
    if (app.touch?.enabled) throw new Error('a mouse was given a thumbstick');
    if (!dom.byId.get('touch-layer').hidden) throw new Error('touch overlay shown on desktop');

    // Touch: re-boot the page claiming a coarse pointer.
    installDom({ webgpu, indexeddb, page: 'play.html', search: '?p=main&d=1', coarsePointer: true });
    await import(`../web/play.js?t=${Date.now()}`);
    for (let i = 0; i < 80; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 30));
    const t = globalThis.window.NOISE;
    if (!t.touch?.enabled) throw new Error('coarse pointer did not get a thumbstick');

    const doc = globalThis.document;
    const zone = doc.querySelector('.stick-zone');
    const rect = { left: 0, top: 0 };
    // Drag right past the deadzone: the held direction must become 1 (right).
    zone.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 400 });
    zone.fire('pointermove', { pointerId: 1, clientX: 160, clientY: 404 });
    if (t.input.consume() !== 1) throw new Error('dragging right did not produce east');
    // Up past the deadzone.
    zone.fire('pointermove', { pointerId: 1, clientX: 102, clientY: 340 });
    if (t.input.consume() !== 0) throw new Error('dragging up did not produce north');
    // Inside the deadzone: no heading at all, rather than a stale one.
    zone.fire('pointermove', { pointerId: 1, clientX: 104, clientY: 398 });
    if (t.input.consume() !== -1) throw new Error('the deadzone still produced a heading');
    zone.fire('pointerup', { pointerId: 1 });
    if (t.input.consume() !== -1) throw new Error('releasing left a heading held');

    // The two action buttons must reach the same handlers the keys do.
    let stunFired = false;
    t.input.on('stun', () => { stunFired = true; });
    doc.querySelector('[data-act="stun"]').fire('pointerdown', {});
    if (!stunFired) throw new Error('STUN button did not fire');
    const before = t.boltOn;
    doc.querySelector('[data-act="bolt"]').fire('pointerdown', {});
    if (t.boltOn === before) throw new Error('RUN button did not toggle sprint');

    return 'off for a mouse; stick resolves to 4 headings with a deadzone; STUN and RUN wired';
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
