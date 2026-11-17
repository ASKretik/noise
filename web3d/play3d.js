// web3d/play3d.js -- the 3D district page. 3d/play.html only.
//
// Owns the frame loop, the camera, pointer lock and the page chrome. Everything that
// decides what happens lives in DistrictRunner (DOM-free) and below it in /sim3d and
// /sim; nothing there knows this file exists.

import { DIRS, isWalkable, TILE } from '../sim/grid.js';
import { CELL_M, TICK_HZ_3D, EYE_M, realSeconds } from '../sim3d/units.js';
import { RESPONSE } from '../sim3d/body.js';
import { createScene } from './scene.js';
import { buildWorld, lightScene } from './world.js';
import { currentQuality, setQuality } from './quality.js';
import { Entities } from './entities.js';
import { Audio3D } from './audio3d.js';
import { Controls } from './controls.js';
import { Hud3D } from './hud3d.js';
import { StunGun } from './gun.js';
import { DistrictRunner } from './runner.js';
import { mountBanner } from './banner.js';
import { loadSettings, saveSettings } from './settings3d.js';

const $ = (id) => document.getElementById(id);

/** Dispatch is asked for a line this often (ticks), plus whenever a hunt starts. */
const DISPATCH_EVERY_TICKS = 32;

const TUNE_KEY = 'noise3d-tune-v1';
const DEFAULTS = Object.freeze({ cellM: CELL_M, tickHz: TICK_HZ_3D, response: RESPONSE, debug: false });

function loadTune() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(TUNE_KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
function saveTune(t) { try { localStorage.setItem(TUNE_KEY, JSON.stringify(t)); } catch { /* not remembered */ } }

export class Play3D {
  constructor() {
    const q = new URLSearchParams(location.search);
    this.district = Math.max(1, Math.min(100, Number(q.get('d')) || 1));
    this.tier = ['easy', 'medium', 'hard', 'ultra'].includes(q.get('t')) ? q.get('t') : 'medium';
    this.profileId = q.get('p') || 'graybox';
    this.tune = loadTune();
    this.settings = loadSettings();
    this.attempt = 0;
    this.chains = new Map();
    this.dossier = null;
    this.paused = true;
    this.t = 0;
    this.bob = 0;
    this.fovKick = 0;

    this.quality = currentQuality();
    this.view = createScene($('view'), {
      pixelRatio: Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio),
      antialias: this.quality.antialias,
    });
    this.view.renderer.shadowMap.enabled = this.quality.shadows;

    this.audio = new Audio3D();
    this.controls = new Controls($('view'));
    this.hud = new Hud3D($('hud'));
    this.gun = new StunGun();
    this.lock = null;
    this.kit = q.get('kit') === '1';
    this.applySettings();
    this.frame = this.frame.bind(this);
  }

  boot() {
    mountBanner(document.body, { compact: true }).classList.add('b3-floating');
    this.controls.attach();
    this.controls.on('lock', (locked) => this.onLock(locked));
    this.controls.on('lockerror', () => { $('ov-note').textContent = 'The browser refused to capture the mouse. Click again.'; });
    this.controls.on('restart', () => { if (this.controls.locked) this.start(this.district); });
    this.controls.on('tune', () => this.toggleTune());
    this.controls.on('map', (on) => this.hud.showMap(on));
    this.controls.on('toggle', (what) => this.hud.toggleLayer(what));
    this.controls.on('fire', () => this.fire());
    $('ov-primary').addEventListener('click', () => this.primary());
    $('ov-secondary').addEventListener('click', () => { this.start(this.district); this.controls.lock(); });
    window.addEventListener('resize', () => this.view.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.controls.unlock(); });
    this.wireTune();
    this.wireSettings();
    if (matchMedia('(hover: none) and (pointer: coarse)').matches) {
      $('ov-note').textContent = 'Touch controls arrive in phase 8. For now this needs a mouse and keyboard.';
    }
    this.view.resize();
    this.start(this.district);
    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- a district

  start(n) {
    clearTimeout(this.overlayTimer);
    this.district = n;
    this.attempt++;
    if (this.world) { this.view.scene.remove(this.world.group); this.world.dispose(); }
    if (this.entities) this.view.scene.remove(this.entities.group);
    this.runner = new DistrictRunner({
      profileId: this.profileId, district: n, tier: this.tier,
      dossier: this.dossier, chain: this.chains.get(n),
      seedKey: `${this.profileId}#${n}#${this.attempt}`,
      tickHz: this.tune.tickHz,
      loadout: this.loadout(),
    });
    this.runner.session.response = this.tune.response;
    this.dossier = this.runner.dossier;
    this.chains.set(n, this.runner.chain);
    this.runner.onEnd = (summary) => this.finish(summary);
    this.runner.onTick = (row) => this.afterTick(row);
    this.lastCell = { x: this.runner.game.player.x, y: this.runner.game.player.y };
    this.wasAlert = false;
    this.endAnim = null;
    document.body.classList.remove('g3-caught', 'g3-won');
    this.buildScene();
    this.hud.setDistrict(this.runner.level, this.tier);

    // Face the most open direction, so the first thing you see is a corridor, not a wall.
    const g = this.runner.game;
    let best = 0, bestRun = -1;
    for (let d = 0; d < 4; d++) {
      let k = 0;
      while (k < 12 && isWalkable(this.runner.map, g.player.x + DIRS[d].dx * (k + 1), g.player.y + DIRS[d].dy * (k + 1))) k++;
      if (k > bestRun) { bestRun = k; best = d; }
    }
    this.controls.yaw = [0, -Math.PI / 2, Math.PI, Math.PI / 2][best];
    this.controls.pitch = 0;
    $('ov-secondary').hidden = true;
    this.ended = false;
    this.narrate();
  }

  /**
   * What the player carries in. Phase 7 reads this from the save file; until then
   * ?kit=1 hands the graybox a full stun gun and ten seconds of lightning, for testing.
   */
  loadout() {
    return this.kit ? { stunGun: true, bullets: 6, boltSeconds: 10 } : { stunGun: false, bullets: 0, boltSeconds: 0 };
  }

  /** Left click. A locked shot always lands; without a lock the gun only clicks. */
  fire() {
    const g = this.runner.game;
    if (this.paused || g.over || !g.loadout.stunGun) return;
    const lock = this.lock;
    if (lock?.ok) {
      this.runner.fire(lock.id);
      this.view.camera.updateMatrixWorld();
      this.gun.fired(this.view.scene, this.gun.muzzleWorld(this.view.camera), this.entities.alienPosition(lock.id));
      this.audio.zap();
    } else {
      this.gun.dry();
      this.audio.click();
    }
  }

  buildScene() {
    const cellM = this.tune.cellM;
    this.world = buildWorld(this.runner.level, { cellM, shadows: this.quality.shadows });
    this.view.scene.add(this.world.group);
    lightScene(this.view.scene, this.world.palette, {
      cellM, mapW: this.runner.map.w, mapH: this.runner.map.h, shadows: this.quality.shadows,
    });
    this.entities = new Entities(this.view.scene, { cellM });
    this.entities.reset(this.runner.game);
  }

  afterTick() {
    const g = this.runner.game;
    if (g.player.x !== this.lastCell.x || g.player.y !== this.lastCell.y) {
      const tile = this.runner.map.tiles[g.player.y * this.runner.map.w + g.player.x];
      this.audio.footstep(tile === TILE.COVER ? 'water' : tile === TILE.SAFE ? 'safe' : 'floor', g.sprinting);
      this.lastCell = { x: g.player.x, y: g.player.y };
    }
    const alert = g.alertTicks > 0;
    if ((g.started && g.tick % DISPATCH_EVERY_TICKS === 0) || (alert && !this.wasAlert)) this.narrate();
    this.wasAlert = alert;
  }

  narrate() {
    const r = this.runner;
    this.hud.narrate({
      game: r.game, prediction: r.prediction, dossier: r.dossier, chain: r.chain,
      lastSpawn: r.system.lastSpawn, level: r.district,
      profile: this.profileName(), mode: r.mode,
    });
  }

  /** Phase 7 replaces this with the real profile. */
  profileName() { return { displayName: 'GRAYBOX' }; }

  primary() {
    this.audio.start();
    if (this.ended) {
      const won = this.runner.game.won;
      this.start(won ? Math.min(100, this.district + 1) : this.district);
    }
    this.controls.lock();
  }

  onLock(locked) {
    this.paused = !locked;
    if (locked) this.audio.start();
    $('overlay').hidden = locked || this.ended;
    $('hud').hidden = false;
    if (!locked) this.hud.showMap(false);
    if (!locked && !this.ended) {
      $('ov-title').textContent = 'PAUSED';
      $('ov-body').textContent = 'Nothing moves while the mouse is released. Click to resume.';
      $('ov-primary').textContent = 'resume';
      $('ov-stats').innerHTML = '';
    }
  }

  finish(summary) {
    this.ended = true;
    this.controls.unlock();
    // The capture is never ambiguous about who did it: the camera turns to face it.
    const g = this.runner.game;
    if (!summary.won) {
      let best = null, bestD = Infinity;
      for (const p of g.patrols) {
        const d = Math.hypot(p.x - g.player.x, p.y - g.player.y);
        if (d < bestD) { bestD = d; best = p; }
      }
      const at = best && this.entities.alienPosition(best.id);
      if (at) {
        const cam = this.view.camera.position;
        const toYaw = Math.atan2(-(at.x - cam.x), -(at.z - cam.z));
        let diff = toYaw - this.controls.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.endAnim = { t0: this.t, fromYaw: this.controls.yaw, dYaw: diff, fromPitch: this.controls.pitch };
      }
      document.body.classList.add('g3-caught');
    } else {
      document.body.classList.add('g3-won');
    }
    this.narrate();
    clearTimeout(this.overlayTimer);
    this.overlayTimer = setTimeout(() => this.showEnd(summary), summary.won ? 650 : 900);
  }

  endStats(summary) {
    const hz = this.runner.session.tickHz;
    const secs = realSeconds(summary.ticks, hz).toFixed(1);
    return [
      ['keys', `${summary.collected}/${summary.caches}`],
      ['time', `${secs}s (par ${realSeconds(summary.par, hz).toFixed(0)}s)`],
      ['aliens at peak', summary.peakAliens],
      ['coins picked up', summary.coinValue],
      ['aliens stunned', summary.stuns ?? 0],
      ['file depth', `${this.dossier.levelsSeen} districts`],
    ];
  }

  showEnd(summary) {
    const secs = realSeconds(summary.ticks, this.runner.session.tickHz).toFixed(1);
    $('ov-title').textContent = summary.won ? 'THROUGH THE PORTAL' : summary.loseReason === 'timeout' ? 'TIMED OUT' : 'CAUGHT';
    $('ov-body').textContent = summary.won
      ? `District ${this.district} cleared in ${secs}s. The file on you follows you to district ${this.district + 1}.`
      : `They reached you after ${secs}s, with ${summary.collected} of ${summary.caches} keys. The run still went into your file.`;
    $('ov-stats').innerHTML = this.endStats(summary).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    $('ov-primary').textContent = summary.won ? `enter district ${this.district + 1}` : 'run it again';
    $('ov-secondary').hidden = !summary.won;
    $('ov-secondary').textContent = 'replay this district';
    $('overlay').hidden = false;
  }

  // ---------------------------------------------------------------- the frame

  frame(now) {
    const dt = Math.min(((now - (this.last ?? now)) / 1000), 0.1);
    this.last = now;
    this.t += dt;
    const r = this.runner;
    const g = r.game;
    const intent = this.controls.intent();
    if (!this.paused && !g.over) r.update(dt, intent);

    const cellM = this.tune.cellM;
    const cam = this.view.camera;
    const b = r.session.body;
    const speed = Math.hypot(b.vx, b.vy);
    const calm = this.settings.reduceMotion;
    // Head bob from distance actually walked, not from time: standing still is still.
    this.bob += speed * dt * 2.4;
    const bobY = calm ? 0 : Math.sin(this.bob * 2) * 0.035 * Math.min(1, speed / r.session.tickHz);
    cam.position.set(b.x * cellM, EYE_M + bobY, b.y * cellM);
    cam.rotation.set(this.controls.pitch, this.controls.yaw, 0);
    // A small FOV kick while actually sprinting.
    const kick = !calm && g.sprinting && speed > r.session.tickHz * 1.2 ? 5 : 0;
    this.fovKick += (kick - this.fovKick) * (1 - Math.exp(-dt * 8));
    this.view.setHFov(this.settings.fov + this.fovKick);

    if (this.endAnim) {
      const k = Math.min(1, (this.t - this.endAnim.t0) / 0.45);
      const e = 1 - (1 - k) * (1 - k);
      this.controls.yaw = this.endAnim.fromYaw + this.endAnim.dYaw * e;
      this.controls.pitch = this.endAnim.fromPitch * (1 - e) - 0.06 * e;
      cam.rotation.set(this.controls.pitch, this.controls.yaw, 0);
    }
    this.entities.sync(g, r.session.alpha, this.t, { dt, tickHz: r.session.tickHz, camera: cam });
    this.audio.update(g, { x: cam.position.x, y: EYE_M, z: cam.position.z, yaw: this.controls.yaw }, this.entities.alienVoices());
    this.world.animate(this.t);
    // Inside a black box the world goes dark and quiet: nothing can see in, and you know it.
    const inBox = r.map.tiles[Math.floor(b.y) * r.map.w + Math.floor(b.x)] === TILE.SAFE;
    document.body.classList.toggle('g3-in-box', inBox);

    cam.updateMatrixWorld();
    this.lock = !this.paused && !g.over ? this.gun.aim(cam, this.entities, g) : null;
    this.gun.update(dt, cam, g, { yaw: this.controls.yaw, pitch: this.controls.pitch, bob: bobY, reduceMotion: calm });
    this.hud.update({
      game: g, level: r.level, body: b, camera: cam, yaw: this.controls.yaw,
      tickHz: r.session.tickHz, cellM, prediction: r.prediction, entities: this.entities,
      lock: this.lock,
    });
    if (this.tune.debug) this.debugReadout();
    this.view.render();
    this.gun.render(this.view.renderer);
    requestAnimationFrame(this.frame);
  }

  debugReadout() {
    const r = this.runner, g = r.game, b = r.session.body, row = r.lastRow;
    $('hud-debug').textContent =
      `tick ${g.tick}  ${g.started ? '' : '(frozen)'}\n` +
      `sim cell  ${g.player.x},${g.player.y}\n` +
      `body cell ${Math.floor(b.x)},${Math.floor(b.y)}  (${b.x.toFixed(2)}, ${b.y.toFixed(2)})\n` +
      `speed     ${Math.hypot(b.vx, b.vy).toFixed(2)} cells/s\n` +
      `emitted   ${row ? (row.dir < 0 ? 'STAY' : DIRS[row.dir].name) + (row.sprint ? ' x2' : '') : '-'}\n` +
      `aliens    ${g.patrols.length}  alert ${g.alertTicks}\n` +
      `snaps     ${r.session.snapped}\n` +
      `draws     ${this.view.renderer.info.render.calls}`;
  }

  // ---------------------------------------------------------------- settings

  applySettings() {
    const s = this.settings;
    this.controls.sensitivity = s.sens;
    this.controls.invertY = s.invertY;
    this.view.setHFov(s.fov);
    this.audio.setEnabled(s.sound);
  }

  wireSettings() {
    const s = this.settings;
    const bindRange = (id, out, key, fmt) => {
      const el = $(id);
      el.value = s[key];
      $(out).textContent = fmt(Number(el.value));
      el.addEventListener('input', () => {
        s[key] = Number(el.value);
        $(out).textContent = fmt(s[key]);
        this.applySettings(); saveSettings(s);
      });
    };
    bindRange('s-sens', 'o-sens', 'sens', (v) => `${v.toFixed(2)}×`);
    bindRange('s-fov', 'o-fov', 'fov', (v) => `${v}°`);
    const bindCheck = (id, key) => {
      const el = $(id);
      el.checked = !!s[key];
      el.addEventListener('change', () => { s[key] = el.checked; this.applySettings(); saveSettings(s); });
    };
    bindCheck('s-invert', 'invertY');
    bindCheck('s-motion', 'reduceMotion');
    bindCheck('s-sound', 'sound');
    let stored = '';
    try { stored = localStorage.getItem('noise3d-quality') || ''; } catch { /* fine */ }
    $('s-quality').value = stored;
    $('s-quality').addEventListener('change', (e) => setQuality(e.target.value));
  }

  // ---------------------------------------------------------------- tuning panel

  toggleTune() {
    const el = $('tune');
    el.hidden = !el.hidden;
    if (!el.hidden) this.controls.unlock();
  }

  wireTune() {
    const fields = [
      ['t-cell', 'o-cell', 'cellM', (v) => `${v.toFixed(2)} m`],
      ['t-hz', 'o-hz', 'tickHz', (v) => `${v} Hz`],
      ['t-resp', 'o-resp', 'response', (v) => `${v}/s`],
    ];
    const derived = () => {
      const walk = this.tune.cellM * this.tune.tickHz;
      $('t-derived').textContent = `walk ${walk.toFixed(1)} m/s · sprint ${(walk * 2).toFixed(1)} m/s · map ${(32 * this.tune.cellM).toFixed(0)}×${(20 * this.tune.cellM).toFixed(0)} m`;
    };
    for (const [inp, out, key, fmt] of fields) {
      const el = $(inp);
      el.value = this.tune[key];
      $(out).textContent = fmt(Number(el.value));
      el.addEventListener('input', () => {
        const v = Number(el.value);
        this.tune[key] = v;
        $(out).textContent = fmt(v);
        this.applyTune(key);
        derived();
        saveTune(this.tune);
      });
    }
    $('t-debug').checked = this.tune.debug;
    $('hud-debug').hidden = !this.tune.debug;
    $('t-debug').addEventListener('change', (e) => {
      this.tune.debug = e.target.checked;
      $('hud-debug').hidden = !this.tune.debug;
      saveTune(this.tune);
    });
    $('t-copy').addEventListener('click', async () => {
      const t = this.tune;
      const text = `cell ${t.cellM} m, tick ${t.tickHz} Hz, accel ${t.response}/s, fov ${this.settings.fov}, sens ${this.settings.sens}`;
      try { await navigator.clipboard.writeText(text); $('t-copy').textContent = 'copied'; } catch { $('t-copy').textContent = text; }
      setTimeout(() => { $('t-copy').textContent = 'copy values'; }, 1500);
    });
    $('t-reset').addEventListener('click', () => {
      this.tune = { ...DEFAULTS, debug: this.tune.debug };
      saveTune(this.tune);
      for (const [inp, out, key, fmt] of fields) { $(inp).value = this.tune[key]; $(out).textContent = fmt(this.tune[key]); this.applyTune(key); }
      derived();
    });
    derived();
  }

  applyTune(key) {
    if (key === 'tickHz') this.runner.session.tickHz = this.tune.tickHz;
    if (key === 'response') this.runner.session.response = this.tune.response;
    if (key === 'cellM') {
      this.view.scene.remove(this.world.group); this.world.dispose();
      this.view.scene.remove(this.entities.group);
      this.buildScene();
    }
  }
}

// Exposed for inspection from the console and the browser checks; read-only by convention.
window.__noise3d = new Play3D();
window.__noise3d.boot();
