// web/play.js -- the game page. play.html only.
//
// Owns the fixed-timestep loop, district progression and the wiring between the pure core
// and the browser-only leaves (canvas, input, persistence, dispatch). Everything
// game-shaped lives in /sim; nothing in /sim knows this file exists.

import { generateLevel } from '../sim/gen.js';
import { Game } from '../sim/game.js';
import { createSystem, resolveDifficulty } from '../sim/system.js';
import { Dossier } from '../sim/predictor/dossier.js';
import { SPAWNER_MODES } from '../sim/predictor/combine.js';
import { levelParams, TICKS_PER_SECOND, CURVE_CAP, difficultyOf } from '../sim/difficulty.js';
import { scoreRun, scoreBreakdown } from '../sim/score.js';
import { PROFILE_IDS } from '../sim/profile.js';
import { hashString } from '../sim/prng.js';
import { regionAdjacency } from '../sim/regions.js';
import { FieldPool } from '../sim/pathfind.js';

import { createProfileStore } from './persist.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { createDispatcher, buildState, webgpuAvailable } from './dispatch.js';
import { Ambience } from './sound.js';

const STEP_MS = 1000 / TICKS_PER_SECOND;
/** Dispatch is asked for a line this often, plus on events. Fire-and-forget either way. */
const DISPATCH_EVERY_TICKS = 8 * 4;
/** Give the first district a moment to be playable before a few hundred megabytes start. */
const MODEL_LOAD_DELAY_MS = 2500;

const $ = (id) => document.getElementById(id);

class Play {
  constructor(profileId, startDistrict) {
    this.profileId = profileId;
    this.startDistrict = startDistrict;
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
     * Tier 1 resets at each new district -- a chain over this map's regions cannot mean
     * anything on the next map -- but NOT at each new run. Keeping it per district number
     * is what gives the chain the "about a minute of play" it needs to converge.
     */
    this.chains = new Map();

    this.mode = 'full';
    this.difficulty = { tau: 1, lambdaScale: 1, controller: null, settled: false };
    this.running = false;
    this.paused = false;
    this.acc = 0;
    this.lastFrame = 0;
    this.prevSnapshot = null;
    this.prediction = null;
    this.seenSpawns = 0;
    this.attempt = 0;
    this.modelLoadTimer = null;
    this.sound = new Ambience();
    /** Set for exactly one tick when E or L is pressed; consumed by the next sim step. */
    this.pendingStun = false;
    this.boltOn = false;
    this.lastScore = null;

    this.dispatcher = createDispatcher({
      onStatus: (s, d) => this.hud.dispatchStatus(s, d),
      onText: (t, src) => this.hud.dispatch(t, src),
    });

    this._frame = this._frame.bind(this);
  }

  // ------------------------------------------------------------------ boot

  async boot() {
    const { store, degraded } = await createProfileStore();
    this.store = store;
    this.storeKind = store.kind;

    this.profile = await this.store.load(this.profileId);

    // A save file with no tier has not finished being created.
    if (!this.profile.difficulty) {
      window.location.replace(`index.html?new=${encodeURIComponent(this.profileId)}`);
      return;
    }
    this.difficultyId = this.profile.difficulty;
    this.dossier = Dossier.fromJSON(this.profile.dossier);
    $('btn-hub').href = `districts.html?p=${encodeURIComponent(this.profileId)}`;
    this.mode = SPAWNER_MODES.includes(this.profile.settings.spawnerMode)
      ? this.profile.settings.spawnerMode
      : 'full';
    $('mode-select').value = this.mode;
    this.renderer.showHeatmap = !!this.profile.settings.showHeatmap;
    this.hud.setProfile(this.profile, this.storeKind);
    this.hud.dispatchStatus(webgpuAvailable() ? 'idle' : 'template',
      webgpuAvailable() ? null : 'no WebGPU in this browser');

    this.wireChrome();
    this.input.attach();
    this.input.bindTouch($('touchpad'));
    this.input.on('pause', () => this.togglePause());
    this.input.on('restart', () => { if (this.running) this.startLevel(this.level.level); });
    this.input.on('toggle', (what) => this.toggleOverlayLayer(what));
    this.input.on('stun', () => { this.pendingStun = true; });
    this.input.on('bolt', () => { this.boltOn = !this.boltOn; });
    // Audio can only start from a genuine gesture; the first keypress or tap is it.
    this.input.on('any', () => this.sound.start());
    $('btn-sound').addEventListener('click', () => {
      this.soundOn = !this.soundOn;
      this.sound.start();
      this.sound.setEnabled(this.soundOn);
      $('btn-sound').textContent = this.soundOn ? 'sound on' : 'sound off';
    });
    this.soundOn = true;
    window.addEventListener('resize', () => {
      if (this.level) this.renderer.resize(this.level.map);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.running && !this.paused) this.togglePause(true);
    });

    // The hub picks the district; fall back to the furthest unlocked one.
    const wanted = this.startDistrict ?? this.profile.level;
    this.startLevel(Math.max(1, Math.min(wanted, this.profile.level)));

    if (!this.modelLoadTimer && this.profile.settings.dispatchEnabled) {
      this.modelLoadTimer = setTimeout(() => this.dispatcher.load(), MODEL_LOAD_DELAY_MS);
    }
    if (degraded) console.warn('[noise] progress will not be saved this session');
  }

  wireChrome() {
    $('mode-select').addEventListener('change', (e) => this.setMode(e.target.value));
    $('btn-switch').addEventListener('click', () => { window.location.href = 'index.html'; });
    $('btn-reset').addEventListener('click', () => this.resetProfile());
    $('overlay-primary').addEventListener('click', () => this.overlayPrimary());
    $('overlay-secondary').addEventListener('click', () => this.startLevel(this.level.level));
  }

  async resetProfile() {
    const name = this.profile.displayName;
    if (!window.confirm(
      `Wipe ${name}? This clears the dossier, every logged run, the settled difficulty and ` +
      `all unlocked districts. The other profile is untouched.`)) return;
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

  // ------------------------------------------------------------------ difficulty

  /**
   * Difficulty is settled ONCE per district and then reused on every retry.
   *
   * Re-running the controller on each attempt makes a district get harder every time you
   * lose it, which reads as the game punishing failure rather than adapting to you. What
   * your movement tunes is the districts you have not reached yet: the controller reads
   * the last five runs -- how long you survived and how predictable your route was -- and
   * settles the NEXT district the first time you walk into it.
   */
  resolveFor(level) {
    const params = levelParams(level, this.difficultyId);
    if (this.mode !== 'full') {
      return { tau: params.tauBase, lambdaScale: 1, controller: null, settled: false };
    }
    const stored = this.store.settledDifficulty(level);
    if (stored) {
      return { tau: stored.tau, lambdaScale: stored.lambdaScale, controller: stored, settled: true };
    }
    const fresh = resolveDifficulty({ mode: this.mode, params, runs: this.store.recentRuns(5) });
    this.store.rememberDifficulty(level, fresh.controller || fresh);
    return { ...fresh, settled: false };
  }

  applyDifficulty() {
    this.difficulty = this.resolveFor(this.level ? this.level.level : 1);
    if (this.system) this.system.tau = this.difficulty.tau;
    if (this.game) {
      this.game.tau = this.difficulty.tau;
      this.game.arrivals.setScale(this.difficulty.lambdaScale);
    }
    this.hud.setMode(this.mode, this.difficulty);
  }

  // ------------------------------------------------------------------ district

  startLevel(n) {
    const params = levelParams(n, this.difficultyId);
    this.attempt++;
    // Counted when the run STARTS, so quitting out of a district you were losing still
    // costs you the replay decay. Otherwise the decay is trivially avoidable.
    this.playsOfLevel = this.store.countPlay(n);
    this.level = generateLevel(this.profile.id, n, { pool: this.pool, params });
    this.level.regions.adjacency ||= regionAdjacency(this.level.map, this.level.regions);

    this.difficulty = this.resolveFor(n);

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
      /**
       * A fresh seed per attempt, derived rather than drawn: the map is fixed by
       * hash(profile, district), but the run -- which includes where the portal opens --
       * has to differ between attempts or restarting hands the player a route they have
       * already memorised. Still no Math.random anywhere; the attempt index and the
       * profile's logged-run count are the entropy, so a given attempt is reproducible.
       */
      seed: hashString(`${this.profile.id}#${n}#${this.profile.runs?.length ?? 0}#${this.attempt}`),
      spawnPolicy: this.system.spawnPolicy,
      observer: this.system.observer,
      tau: this.difficulty.tau,
      lambdaScale: this.difficulty.lambdaScale,
      logLevel: 'player',
      // A copy of what was bought. The profile is debited only when the run ends, so a
      // crash or a closed tab mid-district does not quietly eat someone's charges.
      loadout: {
        stunGun: this.profile.inventory.stunGun,
        bullets: this.profile.inventory.bullets,
        boltSeconds: this.profile.inventory.boltSeconds,
      },
    });
    this.boltOn = false;
    this.pendingStun = false;

    this.seenSpawns = 0;
    this.prevSnapshot = this.snapshot();
    this.prediction = this.system.predictNow(this.game.view);

    this.renderer.resize(this.level.map);
    this.hud.setLevel(n, params);
    this.hud.setWallet(this.profile.wallet.coins);
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
    const actions = { stun: this.pendingStun, bolt: this.boltOn };
    this.pendingStun = false;
    this.game.step(dir, actions);
    // The sim refuses the toggle when the bank is empty; keep the UI honest about it.
    this.boltOn = this.game.boltOn;
    if (this.soundOn) this.sound.follow(this.game);

    // The predictor is queried once per tick for the panels and the heatmap. The spawner
    // and the squad query it independently when they need a cell.
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
      this.hud.spawn(this.game.spawnLog[i]);
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
        body: 'They are still looking. Space or Escape to resume.',
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
    const tier = difficultyOf(this.difficultyId);

    const scored = scoreRun({
      ticks: summary.ticks,
      par: summary.par,
      won: summary.won,
      coinValue: summary.coinValue,
      stuns: summary.stuns,
      keys: summary.collected,
      level: this.level.level,
      plays: this.playsOfLevel,
      difficultyMult: tier.scoreMult,
    });
    // Coins earned = what you picked up, plus a flat award for clearing, plus a share of
    // the score. Only the last of those decays with replays.
    const clearBonus = summary.won ? this.level.params.clearBonusCoins : 0;
    const earned = summary.coinValue + clearBonus + scored.coins;
    this.lastScore = { ...scored, earned, clearBonus, picked: summary.coinValue };
    summary.score = scored.score;

    // Write on run end, not every tick, and only ever to the active profile.
    this.dossier.update(traits, { levelCompleted: summary.won });
    try {
      await this.store.saveDossier(this.dossier.toJSON());
      await this.store.recordRun(summary);
      await this.store.addCoins(earned);
      await this.store.recordScore(this.level.level, scored.score);
      await this.store.returnLoadout(summary.loadoutLeft);
      if (summary.won) await this.store.unlockLevel(this.level.level + 1);
      this.profile = this.store.current();
      this.hud.setWallet(this.profile.wallet.coins);
    } catch (err) {
      console.warn('[play] persistence failed on run end:', err?.message);
    }

    this.hud.dossier(this.dossier, this.system.chain);
    this.requestDispatch();

    const next = this.level.level + 1;
    if (summary.won) {
      this.showOverlay({
        kind: 'won',
        title: 'THROUGH THE PORTAL',
        body: next > CURVE_CAP
          ? `District ${this.level.level} is behind you. The curve caps at ${CURVE_CAP}, so from here the districts keep coming and the file keeps thickening.`
          : `District ${this.level.level} is behind you. Your file follows you to district ${next}.`,
        stats: this.runStats(summary),
        primary: `enter district ${next}`,
        secondary: 'replay this district',
      });
    } else {
      this.showOverlay({
        kind: 'lost',
        title: summary.loseReason === 'timeout' ? 'TIMED OUT' : 'CAUGHT',
        body: summary.loseReason === 'timeout'
          ? 'The window closed. The run still went into your file.'
          : `They reached you after ${(summary.ticks / TICKS_PER_SECOND).toFixed(1)}s. ` +
            `The run still went into your file — that is the point. This district will not ` +
            `get harder because you lost it.`,
        stats: this.runStats(summary),
        primary: 'run it again',
        secondary: 'replay this district',
      });
    }
  }

  runStats(summary = null) {
    const s = summary || this.game.summary();
    const sc = this.lastScore;
    const rows = [];

    if (sc) {
      const { rows: parts, mults } = scoreBreakdown(sc);
      rows.push(['SCORE', sc.score.toLocaleString()]);
      for (const [label, value, note] of parts) {
        if (value === 0 && label !== 'speed') continue;
        rows.push([`· ${label}`, `${value} — ${note}`]);
      }
      for (const [label, , note] of mults) rows.push([`· ${label}`, note]);
      rows.push(['COINS EARNED', `+${sc.earned}`]);
      rows.push(['· picked up', `+${sc.picked}`]);
      if (sc.clearBonus) rows.push(['· clear bonus', `+${sc.clearBonus}`]);
      rows.push(['· from score', `+${sc.coins}`]);
      rows.push(['wallet', String(this.profile?.wallet?.coins ?? 0)]);
    }

    rows.push(
      ['noise index', `${s.score ?? this.game.score} / 1000`],
      ['survived', `${(s.ticks / TICKS_PER_SECOND).toFixed(1)}s of ${(s.par / TICKS_PER_SECOND).toFixed(0)}s par`],
      ['keys', `${s.collected}/${s.caches}`],
      ['aliens stunned', String(s.stuns ?? 0)],
      ['aliens at peak', String(s.peakAliens ?? 0)],
      ['divisions', String(s.splits ?? 0)],
      ['hidden in a box', `${((s.safeTicks ?? 0) / TICKS_PER_SECOND).toFixed(1)}s`],
      ['file depth', `${this.dossier.levelsSeen} districts`],
      ['temperature τ', this.difficulty.tau.toFixed(2)],
    );
    return rows;
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

const query = new URLSearchParams(window.location.search);
const requested = query.get('p');
const profileId = PROFILE_IDS.includes(requested) ? requested : 'main';
const districtParam = Number.parseInt(query.get('d') || '', 10);
const startDistrict = Number.isFinite(districtParam) && districtParam >= 1 ? districtParam : null;

const app = new Play(profileId, startDistrict);
app.boot().catch((err) => {
  console.error('[noise] boot failed', err);
  document.body.innerHTML =
    `<pre style="padding:24px;color:#ff4d5e;font:13px ui-monospace,monospace">` +
    `NOISE failed to start.\n\n${err?.stack || err}\n</pre>`;
});

// Exposed for the browser console: handy during a demo, and harmless.
window.NOISE = app;
