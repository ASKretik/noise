// web3d/play3d.js -- the 3D district page. 3d/play.html only.
//
// Owns the frame loop, the camera, pointer lock and the page chrome. Everything that
// decides what happens lives in DistrictRunner (DOM-free) and below it in /sim3d and
// /sim; nothing there knows this file exists.

import { DIRS, isWalkable } from '../sim/grid.js';
import { CELL_M, TICK_HZ_3D, EYE_M, realSeconds } from '../sim3d/units.js';
import { RESPONSE } from '../sim3d/body.js';
import { createScene } from './scene.js';
import { buildWorld, lightScene } from './world.js';
import { currentQuality } from './quality.js';
import { TILE } from '../sim/grid.js';
import { Entities } from './entities.js';
import { Audio3D } from './audio3d.js';
import { Controls } from './controls.js';
import { DistrictRunner } from './runner.js';
import { mountBanner } from './banner.js';

const $ = (id) => document.getElementById(id);

const TUNE_KEY = 'noise3d-tune-v1';
const DEFAULTS = Object.freeze({ cellM: CELL_M, tickHz: TICK_HZ_3D, response: RESPONSE, fov: 90, sens: 1, debug: false });

function loadTune() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(TUNE_KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
function saveTune(t) { try { localStorage.setItem(TUNE_KEY, JSON.stringify(t)); } catch { /* not remembered */ } }

class Play3D {
  constructor() {
    const q = new URLSearchParams(location.search);
    this.district = Math.max(1, Math.min(100, Number(q.get('d')) || 1));
    this.tier = ['easy', 'medium', 'hard', 'ultra'].includes(q.get('t')) ? q.get('t') : 'medium';
    this.profileId = q.get('p') || 'graybox';
    this.tune = loadTune();
    this.attempt = 0;
    this.chains = new Map();
    this.dossier = null;
    this.paused = true;
    this.t = 0;

    this.quality = currentQuality();
    this.view = createScene($('view'), {
      pixelRatio: Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio),
      antialias: this.quality.antialias,
    });
    this.view.renderer.shadowMap.enabled = this.quality.shadows;
    this.view.setHFov(this.tune.fov);

    this.audio = new Audio3D();
    this.controls = new Controls($('view'));
    this.controls.sensitivity = this.tune.sens;
    this.frame = this.frame.bind(this);
  }

  boot() {
    mountBanner(document.body, { compact: true }).classList.add('b3-floating');
    this.controls.attach();
    this.controls.on('lock', (locked) => this.onLock(locked));
    this.controls.on('lockerror', () => { $('ov-note').textContent = 'The browser refused to capture the mouse. Click again.'; });
    this.controls.on('restart', () => this.start(this.district));
    this.controls.on('tune', () => this.toggleTune());
    $('ov-primary').addEventListener('click', () => this.primary());
    $('ov-secondary').addEventListener('click', () => { this.start(this.district); this.controls.lock(); });
    window.addEventListener('resize', () => this.view.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.controls.unlock(); });
    this.wireTune();
    if (matchMedia('(hover: none) and (pointer: coarse)').matches) {
      $('ov-note').textContent = 'Touch controls arrive in phase 8. For now this needs a mouse and keyboard.';
    }
    this.view.resize();
    this.start(this.district);
    requestAnimationFrame(this.frame);
  }

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
      loadout: { boltSeconds: 0 },
    });
    this.runner.session.response = this.tune.response;
    this.dossier = this.runner.dossier;
    this.chains.set(n, this.runner.chain);
    this.runner.onEnd = (summary) => this.finish(summary);
    this.runner.onTick = () => this.afterTick();
    this.lastCell = { x: this.runner.game.player.x, y: this.runner.game.player.y };
    this.endAnim = null;
    document.body.classList.remove('g3-caught', 'g3-won');
    this.buildScene();
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
    $('hud-district').textContent = `DISTRICT ${n}`;
    $('hud-tier').textContent = this.tier.toUpperCase();
    $('ov-secondary').hidden = true;
    this.ended = false;
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
  }

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
    clearTimeout(this.overlayTimer);
    this.overlayTimer = setTimeout(() => this.showEnd(summary), summary.won ? 650 : 900);
  }

  showEnd(summary) {
    const secs = realSeconds(summary.ticks, this.runner.session.tickHz).toFixed(1);
    $('ov-title').textContent = summary.won ? 'THROUGH THE PORTAL' : summary.loseReason === 'timeout' ? 'TIMED OUT' : 'CAUGHT';
    $('ov-body').textContent = summary.won
      ? `District ${this.district} cleared in ${secs}s. The file on you follows you to district ${this.district + 1}.`
      : `They reached you after ${secs}s, with ${summary.collected} of ${summary.caches} keys.`;
    $('ov-stats').innerHTML = [
      ['keys', `${summary.collected}/${summary.caches}`],
      ['time', `${secs}s (par ${realSeconds(summary.par, this.runner.session.tickHz).toFixed(0)}s)`],
      ['aliens at peak', summary.peakAliens],
      ['coins picked up', summary.coinValue],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    $('ov-primary').textContent = summary.won ? `enter district ${this.district + 1}` : 'run it again';
    $('ov-secondary').hidden = !summary.won;
    $('ov-secondary').textContent = 'replay this district';
    $('overlay').hidden = false;
  }

  frame(now) {
    const dt = Math.min(((now - (this.last ?? now)) / 1000), 0.1);
    this.last = now;
    this.t += dt;
    const r = this.runner;
    const g = r.game;
    if (!this.paused && !g.over) r.update(dt, this.controls.intent());

    const cellM = this.tune.cellM;
    const cam = this.view.camera;
    const b = r.session.body;
    cam.position.set(b.x * cellM, EYE_M, b.y * cellM);
    cam.rotation.set(this.controls.pitch, this.controls.yaw, 0);
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
    const inBox = this.runner.map.tiles[Math.floor(b.y) * this.runner.map.w + Math.floor(b.x)] === TILE.SAFE;
    document.body.classList.toggle('g3-in-box', inBox);
    this.hud();
    this.view.render();
    requestAnimationFrame(this.frame);
  }

  hud() {
    const r = this.runner, g = r.game;
    $('hud-objective').textContent = g.portalRevealed ? 'REACH THE PORTAL' : `KEYS ${g.collected} / ${g.caches.length}`;
    $('hud-time').textContent = `${realSeconds(g.tick, r.session.tickHz).toFixed(1)} s`;
    $('hud-begin').hidden = g.started;
    const sprintLeft = realSeconds(g.sprintTicks, r.session.tickHz);
    $('hud-sprint').textContent = sprintLeft > 0 ? `SPRINT ${sprintLeft.toFixed(1)} s${g.sprinting ? ' ·' : ''}` : '';
    if (this.tune.debug) {
      const b = r.session.body;
      const row = r.lastRow;
      $('hud-debug').textContent =
        `tick ${g.tick}  ${g.started ? '' : '(frozen)'}\n` +
        `sim cell  ${g.player.x},${g.player.y}\n` +
        `body cell ${Math.floor(b.x)},${Math.floor(b.y)}  (${b.x.toFixed(2)}, ${b.y.toFixed(2)})\n` +
        `speed     ${Math.hypot(b.vx, b.vy).toFixed(2)} cells/s\n` +
        `emitted   ${row ? (row.dir < 0 ? 'STAY' : DIRS[row.dir].name) + (row.sprint ? ' x2' : '') : '-'}\n` +
        `aliens    ${g.patrols.length}  alert ${g.alertTicks}\n` +
        `snaps     ${r.session.snapped}`;
    }
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
      ['t-fov', 'o-fov', 'fov', (v) => `${v}°`],
      ['t-sens', 'o-sens', 'sens', (v) => `${v.toFixed(2)}×`],
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
      const text = `cell ${t.cellM} m, tick ${t.tickHz} Hz, accel ${t.response}/s, fov ${t.fov}, sens ${t.sens}`;
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
    if (key === 'fov') this.view.setHFov(this.tune.fov);
    if (key === 'sens') this.controls.sensitivity = this.tune.sens;
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
