// web/main.js -- the browser composition root.
//
// Owns the screens, the fixed-timestep loop, level progression and the wiring between the
// pure core and the four browser-only leaves (canvas, input, persistence, dispatch).
// Everything game-shaped lives in /sim; nothing in /sim knows this file exists.

import { generateLevel } from '../sim/gen.js';
import { Game } from '../sim/game.js';
import { createSystem, resolveDifficulty } from '../sim/system.js';
import { Dossier } from '../sim/predictor/dossier.js';
import { SPAWNER_MODES } from '../sim/predictor/combine.js';
import { levelParams, TICKS_PER_SECOND, CURVE_CAP } from '../sim/difficulty.js';
import { PROFILE_IDS } from '../sim/profile.js';
import { regionAdjacency } from '../sim/regions.js';
import { FieldPool } from '../sim/pathfind.js';

import { createProfileStore } from './persist.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { createDispatcher, buildState, webgpuAvailable } from './dispatch.js';

const STEP_MS = 1000 / TICKS_PER_SECOND;
/** Dispatch is asked for a line this often, plus on events. Fire-and-forget either way. */
const DISPATCH_EVERY_TICKS = 8 * 4;
/** Give the first level a moment to be playable before a few hundred megabytes start. */
const MODEL_LOAD_DELAY_MS = 2500;

const $ = (id) => document.getElementById(id);

class Noise {
  constructor() {
    this.pool = new FieldPool(32 * 20);
    this.renderer = new Renderer($('board'));
    this.input = new Input();
    this.hud = new Hud();
    this.store = null;
    this.storeKind = 'memory';
    this.profile = null;

    this.level = null;
    this.game = null;
    this.system = null;
    this.dossier = new Dossier();
    /**
     * Tier 1 resets at each new level -- a chain over this map's regions cannot mean
     * anything on the next map -- but NOT at each new run. Keeping it per level number is
     * what gives the chain the "about a minute of play" it needs to converge: measured,
     * a chain handed a fresh map every attempt scores below uniform, and the same chain
     * allowed to persist across attempts at one level reaches 22% top-1 against
     * uniform's 9%.
     */
    this.chains = new Map();

    this.mode = 'full';
    this.difficulty = { tau: 1, lambdaScale: 1, controller: null };
    this.running = false;
    this.paused = false;
    this.acc = 0;
    this.lastFrame = 0;
    this.prevSnapshot = null;
    this.prediction = null;
    this.seenSpawns = 0;
    this.modelLoadTimer = null;

    this.dispatcher = createDispatcher({
      onStatus: (s, d) => this.hud.dispatchStatus(s, d),
      onText: (t, src) => this.hud.dispatch(t, src),
    });

    this._frame = this._frame.bind(this);
  }

  // ------------------------------------------------------------------ boot

  async boot() {
    const { store, degraded, reason } = await createProfileStore();
    this.store = store;
    this.storeKind = store.kind;
    if (degraded) {
      $('storage-note').textContent =
        `Local storage unavailable (${reason}). You can play, but nothing will be saved.`;
    }
    this.hud.dispatchStatus(webgpuAvailable() ? 'idle' : 'template',
      webgpuAvailable() ? null : 'no WebGPU in this browser');

    await this.renderLaunch();
    this.wireChrome();
    this.input.attach();
    this.input.bindTouch($('touchpad'));
    this.input.on('pause', () => this.togglePause());
    this.input.on('restart', () => { if (this.running) this.startLevel(this.level.level); });
    this.input.on('toggle', (what) => this.toggleOverlayLayer(what));
    window.addEventListener('resize', () => {
      if (this.level) this.renderer.resize(this.level.map);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.running && !this.paused) this.togglePause(true);
    });
  }

  /** The launch screen: two slots, each showing what the system already knows. */
  async renderLaunch() {
    const host = $('slots');
    host.innerHTML = '';
    for (const id of PROFILE_IDS) {
      const rec = await this.store.peek(id);
      const dossier = new Dossier(rec?.dossier);
      const runs = rec?.runs?.length ?? 0;
      const strongest = dossier.strongest(1)[0];
      const btn = document.createElement('button');
      btn.className = 'slot';
      btn.type = 'button';
      btn.innerHTML =
        `<h2>${id === 'main' ? 'MAIN' : 'GUEST'}</h2>` +
        `<div class="slot-meta">` +
        `<span>unlocked<b>district ${rec?.level ?? 1}</b></span>` +
        `<span>runs logged<b>${runs}</b></span>` +
        `<span>file depth<b>${dossier.levelsSeen} level${dossier.levelsSeen === 1 ? '' : 's'}</b></span>` +
        `<span>tier-2 confidence<b>${Math.round(dossier.confidence() * 100)}%</b></span>` +
        `</div>` +
        `<p class="slot-hint">${strongest
          ? `strongest habit: ${strongest.key} ${strongest.z > 0 ? '+' : ''}${strongest.z.toFixed(2)}sd`
          : (id === 'main' ? 'no file yet — the system starts blind' : 'hand the laptop over; the system starts blind again')}</p>`;
      btn.addEventListener('click', () => this.enterProfile(id));
      host.appendChild(btn);
    }
  }

  wireChrome() {
    $('mode-select').addEventListener('change', (e) => this.setMode(e.target.value));
    $('btn-switch').addEventListener('click', () => this.leaveProfile());
    $('btn-reset').addEventListener('click', () => this.resetProfile());
    $('overlay-primary').addEventListener('click', () => this.overlayPrimary());
    $('overlay-secondary').addEventListener('click', () => this.startLevel(this.level.level));
  }

  // --------------------------------------------------------------- profiles

  async enterProfile(id) {
    this.profile = await this.store.load(id);
    this.dossier = Dossier.fromJSON(this.profile.dossier);
    this.chains.clear();
    this.mode = SPAWNER_MODES.includes(this.profile.settings.spawnerMode)
      ? this.profile.settings.spawnerMode
      : 'full';
    $('mode-select').value = this.mode;
    this.renderer.showHeatmap = !!this.profile.settings.showHeatmap;
    this.hud.setProfile(this.profile, this.storeKind);

    $('launch').hidden = true;
    $('game').hidden = false;

    this.startLevel(Math.min(this.profile.level, 99));

    // Lazy load, after the first level is already playable.
    if (!this.modelLoadTimer && this.profile.settings.dispatchEnabled) {
      this.modelLoadTimer = setTimeout(() => this.dispatcher.load(), MODEL_LOAD_DELAY_MS);
    }
  }

  leaveProfile() {
    this.running = false;
    this.paused = false;
    $('game').hidden = true;
    $('launch').hidden = false;
    $('overlay').hidden = true;
    this.renderLaunch();
  }

  async resetProfile() {
    const name = this.profile.displayName;
    if (!window.confirm(
      `Wipe ${name}? This clears the dossier, every logged run and all unlocked districts. ` +
      `The other profile is untouched.`)) return;
    this.profile = await this.store.resetActive();
    this.dossier = Dossier.fromJSON(this.profile.dossier);
    this.chains.clear();
    this.hud.setProfile(this.profile, this.storeKind);
    this.startLevel(1);
  }

  setMode(mode) {
    if (!SPAWNER_MODES.includes(mode)) return;
    this.mode = mode;
    if (this.system) this.system.mode = mode;
    this.applyDifficulty();
    this.store.setSettings({ spawnerMode: mode }).catch(() => {});
    this.requestDispatch();
  }

  toggleOverlayLayer(what) {
    if (what === 'heatmap') {
      this.renderer.showHeatmap = !this.renderer.showHeatmap;
      this.store.setSettings({ showHeatmap: this.renderer.showHeatmap }).catch(() => {});
    }
    if (what === 'visited') this.renderer.showVisited = !this.renderer.showVisited;
    if (what === 'intercepts') this.renderer.showIntercepts = !this.renderer.showIntercepts;
  }

  // ------------------------------------------------------------------ level

  applyDifficulty() {
    const params = this.level ? this.level.params : levelParams(1);
    this.difficulty = resolveDifficulty({
      mode: this.mode,
      params,
      runs: this.store.recentRuns(5),
    });
    if (this.system) this.system.tau = this.difficulty.tau;
    if (this.game) {
      this.game.tau = this.difficulty.tau;
      this.game.arrivals.setScale(this.difficulty.lambdaScale);
    }
    this.hud.setMode(this.mode, this.difficulty);
  }

  startLevel(n) {
    const params = levelParams(n);
    this.level = generateLevel(this.profile.id, n, { pool: this.pool, params });
    this.level.regions.adjacency ||= regionAdjacency(this.level.map, this.level.regions);

    this.difficulty = resolveDifficulty({ mode: this.mode, params, runs: this.store.recentRuns(5) });

    this.system = createSystem({
      level: this.level,
      dossier: this.dossier,
      mode: this.mode,
      tau: this.difficulty.tau,
      chain: this.chains.get(n),
    });
    this.chains.set(n, this.system.chain);

    this.game = new Game({
      level: this.level,
      params,
      pool: this.pool,
      spawnPolicy: this.system.spawnPolicy,
      observer: this.system.observer,
      tau: this.difficulty.tau,
      lambdaScale: this.difficulty.lambdaScale,
      logLevel: 'player',
    });

    this.seenSpawns = 0;
    this.prevSnapshot = this.snapshot();
    this.prediction = this.system.predictNow(this.game.view);

    this.renderer.resize(this.level.map);
    this.hud.setLevel(n, params);
    this.hud.setMode(this.mode, this.difficulty);
    this.hud.clearSpawns();
    this.hud.dossier(this.dossier, this.system.chain);
    this.hud.prediction(this.prediction, this.game);
    this.hud.tick(this.game);
    this.syncSpawnLog();
    this.requestDispatch();

    $('overlay').hidden = true;
    this.paused = false;
    this.acc = 0;
    this.lastFrame = performance.now();
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(this._frame);
    }
  }

  snapshot() {
    const patrols = {};
    for (const p of this.game.patrols) patrols[p.id] = { x: p.x, y: p.y };
    return { player: { x: this.game.player.x, y: this.game.player.y }, patrols };
  }

  // ------------------------------------------------------------------- loop

  _frame(now) {
    if (!this.running) return;
    const dt = Math.min(now - this.lastFrame, 250);   // a backgrounded tab must not catch up
    this.lastFrame = now;

    if (!this.paused && !this.game.over) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP_MS && steps < 4 && !this.game.over) {
        this.prevSnapshot = this.snapshot();
        this.acc -= STEP_MS;
        steps++;
        this.simStep();
      }
    }

    const alpha = this.game.over || this.paused ? 1 : Math.min(1, this.acc / STEP_MS);
    this.renderer.draw({
      game: this.game,
      level: this.level,
      alpha,
      prev: this.prevSnapshot,
      prediction: this.prediction?.dist,
    });
    this.hud.tick(this.game);
    requestAnimationFrame(this._frame);
  }

  simStep() {
    const dir = this.input.consume();
    const alertBefore = this.game.alertTicks > 0;
    this.game.step(dir);

    // The predictor is queried once per tick for the panels and the heatmap. The spawner
    // queries it independently when it actually needs a cell; this one is for the player.
    this.prediction = this.system.predictNow(this.game.view);
    this.hud.prediction(this.prediction, this.game);

    if (this.game.spawnLog.length > this.seenSpawns) this.syncSpawnLog();

    const alertNow = this.game.alertTicks > 0;
    if (this.game.tick % DISPATCH_EVERY_TICKS === 0 || (alertNow && !alertBefore)) {
      this.requestDispatch();
    }

    if (this.game.over) this.finishRun();
  }

  syncSpawnLog() {
    for (let i = this.seenSpawns; i < this.game.spawnLog.length; i++) {
      this.hud.spawn(this.game.spawnLog[i], this.game.regions);
    }
    this.seenSpawns = this.game.spawnLog.length;
  }

  togglePause(force = null) {
    if (this.game.over) return;
    this.paused = force === null ? !this.paused : force;
    if (this.paused) {
      this.showOverlay({
        kind: 'paused',
        title: 'HELD',
        body: 'The grid is still watching. Space or Escape to resume.',
        stats: this.runStats(),
        primary: 'resume',
        secondary: 'restart district',
      });
    } else {
      $('overlay').hidden = true;
    }
  }

  // --------------------------------------------------------------- run end

  async finishRun() {
    const summary = this.game.summary();
    const traits = this.system.traits || this.system.liveTraits();

    // Write on run end, not every tick, and only ever to the active profile.
    this.dossier.update(traits, { levelCompleted: summary.won });
    try {
      await this.store.saveDossier(this.dossier.toJSON());
      await this.store.recordRun(summary);
      if (summary.won) await this.store.unlockLevel(this.level.level + 1);
      this.profile = this.store.current();
    } catch (err) {
      console.warn('[main] persistence failed on run end:', err?.message);
    }

    this.hud.dossier(this.dossier, this.system.chain);
    this.applyDifficulty();
    this.requestDispatch();

    const next = this.level.level + 1;
    if (summary.won) {
      this.showOverlay({
        kind: 'won',
        title: 'DELIVERED',
        body: next > CURVE_CAP
          ? `District ${this.level.level} is clear. The curve caps at ${CURVE_CAP}, so from here the districts keep coming and the file keeps thickening.`
          : `District ${this.level.level} is clear. Your file follows you to district ${next}.`,
        stats: this.runStats(summary),
        primary: `enter district ${next}`,
        secondary: 'replay this district',
      });
    } else {
      this.showOverlay({
        kind: 'lost',
        title: summary.loseReason === 'timeout' ? 'TIMED OUT' : 'INTERCEPTED',
        body: summary.loseReason === 'timeout'
          ? 'The courier window closed. The run still went into your file.'
          : `A unit walked into you after ${(summary.ticks / TICKS_PER_SECOND).toFixed(1)}s. ` +
            `The run still went into your file — that is the point.`,
        stats: this.runStats(summary),
        primary: 'run it again',
        secondary: 'replay this district',
      });
    }
  }

  runStats(summary = null) {
    const s = summary || this.game.summary();
    const band = this.difficulty.controller;
    return [
      ['noise index', `${s.score} / 1000`],
      ['visit entropy', `${s.entropy.toFixed(2)} bits`],
      ['survived', `${(s.ticks / TICKS_PER_SECOND).toFixed(1)}s`],
      ['caches', `${s.collected}/${s.caches}`],
      ['times seen', String(s.detections)],
      ['units sent', String(s.spawns)],
      ['file depth', `${this.dossier.levelsSeen} levels`],
      ['temperature τ', this.difficulty.tau.toFixed(2)],
      band && band.meanSurvival !== null
        ? ['controller', band.acting
          ? `${band.error > 0 ? 'tightening' : 'easing'} (mean ${(band.meanSurvival / TICKS_PER_SECOND).toFixed(0)}s)`
          : `holding (mean ${(band.meanSurvival / TICKS_PER_SECOND).toFixed(0)}s in band)`]
        : ['controller', this.mode === 'full' ? 'no history yet' : 'off in this mode'],
    ].filter(Boolean);
  }

  showOverlay({ kind, title, body, stats, primary, secondary }) {
    const el = $('overlay');
    el.hidden = false;
    el.querySelector('.overlay-card').className = `overlay-card ${kind}`;
    $('overlay-title').textContent = title;
    $('overlay-body').textContent = body;
    $('overlay-stats').innerHTML = stats
      .map(([k, v]) => `<span>${k}<b>${v}</b></span>`).join('');
    $('overlay-primary').textContent = primary;
    $('overlay-secondary').textContent = secondary;
    $('overlay-secondary').hidden = !secondary;
    this.overlayKind = kind;
  }

  overlayPrimary() {
    if (this.overlayKind === 'paused') { this.togglePause(false); return; }
    if (this.overlayKind === 'won') { this.startLevel(this.level.level + 1); return; }
    this.startLevel(this.level.level);
  }

  requestDispatch() {
    if (!this.profile?.settings?.dispatchEnabled) return;
    const state = buildState({
      game: this.game,
      prediction: this.prediction,
      dossier: this.dossier,
      chain: this.system?.chain,
      lastSpawn: this.system?.lastSpawn,
      level: this.level?.level ?? 1,
      profile: this.profile,
      mode: this.mode,
    });
    this.dispatcher.request(state);
  }
}

const app = new Noise();
app.boot().catch((err) => {
  console.error('[noise] boot failed', err);
  document.body.innerHTML =
    `<pre style="padding:24px;color:#ff4d5e;font:13px ui-monospace,monospace">` +
    `NOISE failed to start.\n\n${err?.stack || err}\n</pre>`;
});

// Exposed for the browser console: handy during a demo, and harmless.
window.NOISE = app;
