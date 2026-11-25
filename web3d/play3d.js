// web3d/play3d.js -- the 3D district page. 3d/play.html only.
//
// Owns the frame loop, the camera, pointer lock and the page chrome. Everything that
// decides what happens lives in DistrictRunner (DOM-free) and below it in /sim3d and
// /sim; nothing there knows this file exists.

import { DIRS, isWalkable, TILE } from '../sim/grid.js';
import { CELL_M, TICK_HZ_3D, EYE_M, realSeconds } from '../sim3d/units.js';
import { RESPONSE } from '../sim3d/body.js';
import { createScene } from './scene.js';
import { createPost } from './post.js';
import { buildWorld, lightScene } from './world.js';
import { artFor } from './art/belts.js';
import { loadDayEnv, envFromSky } from './art/daylight.js';
import { loadKit, kitReady, initKtx2 } from './art/kit.js';
import { loadGround2k, groundIdsFor } from './art/ground.js';
import { currentQuality, setQuality } from './quality.js';
import { Entities } from './entities.js';
import { Audio3D } from './audio3d.js';
import { Controls } from './controls.js';
import { Hud3D } from './hud3d.js';
import { StunGun } from './gun.js';
import { Fx3D } from './fx3d.js';
import { variantFor } from './sequences.js';
import { Touch3D, isTouchDevice } from './touch3d.js';
import { DistrictRunner } from './runner.js';
import { ITEMS3D, ITEM3D_IDS, DECOY_TICKS, EMP_RADIUS, throwRayOf } from '../sim3d/shop3d.js';
import { HabitFile } from '../sim3d/dispatch/habits.js';
import { installDevRun } from './dev3d.js'; // DEV-MODE
import { mountBanner } from './banner.js';
import { loadSettings, saveSettings } from './settings3d.js';
import { createProfileStore3d, ensureGuestSession3d } from './persist3d.js';
import { Career3D } from './career3d.js';
import { scoreBreakdown } from '../sim/score.js';
import { CURVE_CAP } from '../sim/difficulty.js';

const $ = (id) => document.getElementById(id);

/** Dispatch is asked for a line this often (ticks), plus whenever a hunt starts. */
const DISPATCH_EVERY_TICKS = 32;

const TUNE_KEY = 'noise3d-tune-v1';
/** Head bob per metre walked: one dip, and one footstep, about every 2 m (build 45: per metre, not per cell). */
const BOB_PER_M = 2.4 / 1.5;
const footfall = (bob) => Math.floor(bob / Math.PI - 0.75);
/**
 * A stumble's shape (build 46). Amplitudes at k = 1, about walking pace: radians for dip,
 * roll, turn and jolt, metres for drop, sway and lurch. Sprinting multiplies k by
 * sprintGain on top of the extra speed, which makes it about twice a walking stumble.
 * Build 42-45 were dip 0.15, drop 0.09, roll 0.085, sway 0.06, 0.75 s, sprint x1.15.
 */
const TRIP = Object.freeze({ dip: 0.28, drop: 0.16, roll: 0.15, turn: 0.07, sway: 0.1, lurch: 0.14, jolt: 0.018, sprintGain: 1.6, durWalk: 0.95, durSprint: 1.3 });
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
    this.profileId = q.get('p') || 'sandbox';
    /** ?rules=classic plays today's 32 x 20 districts in the sandbox, for comparison. */
    this.ruleset = q.get('rules') === 'classic' ? 'classic' : 'next';
    /** A real save file, or an unsaved sandbox (?kit=1 and a tier in the URL). */
    this.careerMode = this.profileId === 'main' || this.profileId === 'guest';
    this.career = null;
    this.tune = loadTune();
    this.settings = loadSettings();
    this.attempt = 0;
    this.chains = new Map();
    this.dossier = null;
    /** The sandbox's file on your habits, for this page only (a career's is saved). */
    this.habits = new HabitFile();
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
    initKtx2(this.view.renderer);   // build 43: the GPU-compressed (2K) textures' decoder
    // N4.3: bloom and the belt's grade, by the Glow setting (applyGlow)
    this.applyGlow();

    this.audio = new Audio3D();
    this.controls = new Controls($('view'));
    this.hud = new Hud3D($('hud'));
    this.gun = new StunGun();
    this.fx = new Fx3D({ scene: this.view.scene, flash: $('fx-flash'), fade: $('fx-fade'), glitch: $('fx-glitch') });
    this.tension = 0;
    this.lock = null;
    this.kit = q.get('kit') === '1';
    this.touchMode = isTouchDevice();
    this.touch = this.touchMode ? new Touch3D($('touch3d'), this.controls) : null;
    this.fps = 60;
    this.applySettings();
    this.dev = installDevRun(this); // DEV-MODE
    this.frame = this.frame.bind(this);
  }

  async boot() {
    mountBanner(document.body, { compact: true }).classList.add('b3-floating');
    if (this.careerMode) {
      const { store } = await createProfileStore3d();
      await ensureGuestSession3d(store);
      const rec = await store.load(this.profileId);
      if (!rec.difficulty) { location.replace(`./?p=${this.profileId}`); return; }
      this.career = new Career3D(store);
      this.tier = rec.difficulty;
      this.district = Math.max(1, Math.min(this.district, rec.level));
      this.dossier = this.career.dossier;
      document.querySelector('#overlay a.btn.ghost').href = `./?p=${this.profileId}`;
    }
    this.controls.attach();
    this.controls.on('lock', (locked) => this.onLock(locked));
    this.controls.on('lockerror', () => { $('ov-note').textContent = 'The browser refused to capture the mouse. Click again.'; });
    this.controls.on('restart', () => { if (this.controls.locked) this.start(this.district); });
    this.controls.on('tune', () => this.toggleTune());
    this.controls.on('map', (on) => this.hud.showMap(on));
    this.controls.on('zoom', (dy) => this.hud.zoomMap(dy));
    this.controls.on('pan', (dx, dy) => this.hud.panMap(dx, dy));
    this.controls.on('toggle', (what) => this.hud.toggleLayer(what));
    this.controls.on('fire', () => this.fire());
    // N6.1: hold Space for the inventory wheel; the mouse picks, letting go takes it
    this.active = 'gun';
    this.itemFx = [];
    this.controls.on('wheel', (open, cancel) => (open ? this.openWheel() : this.closeWheel(cancel)));
    this.controls.on('wheelmove', (x, y) => this.wheelMove(x, y));
    // N4.4: the torch is off until you want it (F); dark alleys are where you will
    this.torchOn = false;
    this.controls.on('torch', () => { if (!this.lights?.torch) return; this.torchOn = !this.torchOn; this.audio.click(); });
    $('ov-primary').addEventListener('click', () => this.primary());
    $('ov-secondary').addEventListener('click', () => { this.start(this.district); this.controls.lock(); });
    $('ov-killcam').addEventListener('click', () => this.playKillcam());
    // the jumpscare and the ascension can always be skipped with any key or click
    // ...but only deliberately. A held movement key auto-repeats keydown many times a
    // second, and in builds 15-16 that skipped the capture the instant it began: you were
    // holding W when you were caught, so you saw black and the end card, never the face.
    // Now only a fresh Space / Enter / Esc, a click or a tap skips, and not before
    // the sequence's skipAfter.
    const SKIP_KEYS = new Set(['Space', 'Enter', 'NumpadEnter', 'Escape']);
    window.addEventListener('keydown', (e) => { if (!e.repeat && SKIP_KEYS.has(e.code) && this.fx.active) this.fx.skip(this.t); });
    for (const ev of ['mousedown', 'touchstart']) window.addEventListener(ev, () => { if (this.fx.active) this.fx.skip(this.t); });
    window.addEventListener('resize', () => this.view.resize());
    // A hidden tab is silent, always, and on a phone (no pointer lock to lose) the game
    // pauses too. Coming back resumes the sound only if the game is actually playing.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.controls.unlock();
        if (this.touch && !this.paused) this.onLock(false);
        this.audio.pause();
      } else if (!this.paused && !this.ended) {
        this.audio.resume();
      }
    });
    this.wireTune();
    this.wireSettings();
    if (this.touch) {
      this.touch.attach();
      this.touch.on('fire', () => this.fire());
      this.touch.on('map', () => { this.mapOpen = !this.mapOpen; this.hud.showMap(this.mapOpen); });
      this.touch.on('pause', () => this.onLock(false));
      this.touch.on('move', () => this.audio.start());
      document.body.classList.add('t3-touch');
      $('ov-primary').textContent = 'tap to play';
      this.gun.rest.set(0.13, -0.25, -0.5);      // lower and inward, clear of the thumb buttons
      $('ov-body').textContent = 'Left thumb moves, right thumb looks. RUN latches sprint, STUN fires at whatever is locked, MAP shows the district.';
      const orient = () => { $('rotate3d').hidden = innerHeight <= innerWidth; };
      addEventListener('resize', orient); orient();
    }
    this.view.resize();
    // build 41: district 1 is built from downloaded models (art/kit.js, about 90 MB the
    // first time); wait for them rather than show it half-made
    const H0 = artFor(this.district)?.hd;
    if (H0) {
      const note = $('ov-note'), was = note.textContent;
      const res = H0.res || '1k';
      try {
        await Promise.all([
          loadKit((f) => { note.textContent = `Loading the district's buildings and props${res === '2k' ? ' (2K)' : ''}... ${Math.round(f * 100)}%`; }, res),
          res === '2k' ? loadGround2k(groundIdsFor(H0.ground)) : null,
        ]);
      } catch (e) {
        console.warn(`kit: the ${res} models did not load; trying 1K`, e);
        try { await loadKit(() => {}, '1k'); } catch (e2) { console.warn('kit: no models; drawing the buildings instead', e2); }
      }
      note.textContent = was;
    }
    this.start(this.district);
    requestAnimationFrame(this.frame);
  }

  /**
   * Build 42, at the user's request: running into something small -- a stoop, a bin, a
   * crate, a bag, rubble -- catches your foot. Speed is untouched and the sim never knows:
   * it is the camera only. Once per obstacle until you are clear of it; Reduce motion
   * keeps a third of it, with no roll or head turn. Returns the drop, for the gun to follow.
   *
   * Build 46, asked for "more pronounced, and even more when sprinting": a jolt as the foot
   * stops dead, the view pitching forward and down (about 10 degrees walking) and lurching
   * on, rolling and turning toward the side you hit, then a stagger back. Sprinting it is
   * about twice that (about 20 degrees), lasts 1.3 s instead of 0.95, and the recovery
   * wobbles twice, one side and then the other, before you have your feet again.
   */
  stumble(dt, cam, b, speed, cellM, calm, sprinting) {
    const px = b.x * cellM, pz = b.y * cellM;
    const hit = speed * cellM > 1.35 ? this.world.obstacleAt?.(px, pz, 0.22) : null;
    if (hit && hit !== this.tripOn && (!this.tripState || this.t - this.tripState.t0 > 0.45)) {
      // which side of your path it is on: a foot caught on the left throws you left
      const fx = -Math.sin(this.controls.yaw), fz = -Math.cos(this.controls.yaw);
      const side = Math.sign(fx * (hit.z - pz) - fz * (hit.x - px)) || 1;
      const k = Math.min(1.3, 0.6 + speed / (this.runner.session.tickHz * 2.2)) * (sprinting ? TRIP.sprintGain : 1);
      this.tripState = { t0: this.t, side, k: calm ? k * 0.33 : k, sprint: !!sprinting, dur: sprinting ? TRIP.durSprint : TRIP.durWalk };
      this.audio.stumble(hit.kind, Math.min(1.3, 0.55 + 0.35 * k));
    }
    this.tripOn = hit;
    const st = this.tripState;
    if (!st) return 0;
    const tau = this.t - st.t0, u = tau / st.dur;
    if (u >= 1) { this.tripState = null; return 0; }
    const k = st.k, side = st.side;
    const catchUp = 1 - Math.exp(-u * 22);                 // the foot stops dead
    const fall = catchUp * Math.exp(-u * 4.2);              // forward and down, then back up
    const jolt = TRIP.jolt * k * Math.sin(tau * 70) * Math.exp(-tau * 18);
    // the stagger: walking one swing to the side you hit; sprinting a second, smaller one
    // to the other side as the next foot comes down
    const wobble = st.sprint
      ? Math.sin(u * 11) * Math.exp(-u * 2.4)
      : Math.sin(u * 8.5) * Math.exp(-u * 3.4);
    const dip = -TRIP.dip * k * fall + jolt;
    const drop = -TRIP.drop * k * catchUp * Math.exp(-u * 4.8);
    const roll = calm ? 0 : side * TRIP.roll * k * wobble;
    const turn = calm ? 0 : side * TRIP.turn * k * Math.sin(u * 7) * Math.exp(-u * 4);
    const sway = side * TRIP.sway * k * wobble;
    const lurch = TRIP.lurch * k * fall;
    const fx = -Math.sin(this.controls.yaw), fz = -Math.cos(this.controls.yaw);
    cam.rotation.x += dip;
    cam.rotation.y += turn;
    cam.rotation.z += roll;
    cam.position.y += drop;
    cam.position.x += Math.cos(this.controls.yaw) * sway + fx * lurch;
    cam.position.z += -Math.sin(this.controls.yaw) * sway + fz * lurch;
    return drop;
  }

  // ---------------------------------------------------------------- a district

  start(n) {
    clearTimeout(this.overlayTimer);
    this.district = n;
    this.attempt++;
    if (this.world) { this.view.scene.remove(this.world.group); this.world.dispose(); }
    if (this.entities) this.view.scene.remove(this.entities.group);
    this.runner = this.career
      ? this.career.startRun(n, { tickHz: this.tune.tickHz })
      : new DistrictRunner({
        profileId: this.profileId, district: n, tier: this.tier,
        dossier: this.dossier, chain: this.chains.get(n),
        seedKey: `${this.profileId}#${n}#${this.attempt}`,
        tickHz: this.tune.tickHz,
        loadout: this.loadout(),
        ruleset: this.ruleset,
        habits: this.habits,
      });
    this.runner.session.response = this.tune.response;
    // N6.1: a new district starts with the gun in hand and no effects left over
    this.active = 'gun';
    this.tripState = null; this.tripOn = null;
    for (const fx of this.itemFx || []) this.view.scene.remove(fx.obj);
    this.itemFx = [];
    this.dossier = this.runner.dossier;
    this.chains.set(n, this.runner.chain);
    this.runner.onEnd = (summary) => this.finish(summary);
    this.runner.onTick = (row) => this.afterTick(row);
    this.wasAlert = false;
    this.endAnim = null;
    this.fx.reset();
    this.tension = 0;
    this.audio.setTension(0);
    this.killcam = null;
    this.history = [];
    this.remember();
    $('ov-killcam').hidden = true;
    $('killcam').hidden = true;
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
    return this.kit ? { stunGun: true, bullets: 6, boltSeconds: 10, items: { decoy: 3, dampers: 1, emp: 2 } } : { stunGun: false, bullets: 0, boltSeconds: 0 };
  }

  /** Left click. A locked shot always lands; without a lock the gun only clicks. */
  // ---------------------------------------------------------------- items (N6.1)

  /** What the wheel offers: the stun gun, then every item the rules know. */
  wheelSlots() {
    const g = this.runner.game;
    const out = [{
      id: 'gun', label: 'Stun gun', ok: !!g.loadout.stunGun,
      count: g.loadout.stunGun ? `${g.loadout.bullets} charges` : 'not owned',
      note: 'Click: stun the alien under the crosshair, if you can see it, within 72 m.',
    }];
    if (!g.canUseItem) return out;   // the classic ruleset has no items
    for (const id of ITEM3D_IDS) {
      const it = ITEMS3D[id], have = g.loadout.items[id] || 0;
      const used = !g.itemCapOff && g.itemUses[id] >= it.perDistrict;
      out.push({
        id, label: it.label, count: `×${have}${used ? ' · used here' : ''}`,
        ok: have > 0 && !used && !(id === 'dampers' && g.dampers),
        note: id === 'dampers' ? 'Click: put them on. Heard at 3/4 the distance for the rest of the district.'
          : id === 'decoy' ? 'Click: throw it where you aim, as far as you can see. Hunters go there instead.'
            : `Click: throw it where you aim. Stuns every alien within ${EMP_RADIUS} cells of where it lands.`,
      });
    }
    return out;
  }

  openWheel() {
    if (this.paused || !this.runner || this.runner.game.over) return;
    this.wheelData = this.wheelSlots();
    this.wheelSel = -1;
    this.hud.showWheel(true, this.wheelData, this.active);
  }

  wheelMove(x, y) {
    if (!this.wheelData) return;
    const n = this.wheelData.length;
    let sel = -1;
    if (Math.hypot(x, y) > 28) {
      // the slot whose direction is nearest the pointer's (slot 0 at the top, clockwise)
      const a = Math.atan2(y, x) + Math.PI / 2;
      sel = ((Math.round((a / (2 * Math.PI)) * n) % n) + n) % n;
    }
    this.wheelSel = sel;
    this.hud.setWheel(sel, x, y);
  }

  closeWheel(cancel) {
    const sl = this.wheelData?.[this.wheelSel];
    this.hud.showWheel(false);
    this.wheelData = null;
    if (!cancel && sl?.ok && sl.id !== this.active) { this.active = sl.id; this.audio.click(); }
  }

  /** Can the item in hand still be used? If not, the gun comes back to hand. */
  checkInHand(g) {
    if (this.active === 'gun') return;
    const it = ITEMS3D[this.active];
    const used = !g.itemCapOff && g.itemUses?.[this.active] >= it.perDistrict;
    if (!g.canUseItem || !(g.loadout.items?.[this.active] > 0) || used || (this.active === 'dampers' && g.dampers)) this.active = 'gun';
  }

  /**
   * Where a throw would land: the ray from your eye through the crosshair, traced over the
   * city by the sim's own function (canUseItem with the ray). No range; it lands where you
   * aim, or just short of the first wall or heap the ray meets.
   */
  aimItem(cam, g) {
    if (!ITEMS3D[this.active]?.thrown) return null;
    const dir = new this.view.THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const ray = throwRayOf(cam.position, dir, CELL_M);
    const c = g.canUseItem(this.active, { ray });
    return { ray, ok: c.ok, reason: c.reason, land: c.land, x: c.land?.x, y: c.land?.y };
  }

  /** The throw's path: from your hand up and over to where it lands. */
  arcPoints(cam, land, n = 48) {
    const T = this.view.THREE;
    const fwd = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), right = new T.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const a = cam.position.clone().addScaledVector(right, 0.28).addScaledVector(fwd, 0.5).add(new T.Vector3(0, -0.25, 0));
    const b = new T.Vector3((land.x + 0.5) * CELL_M, 0.08, (land.y + 0.5) * CELL_M);
    const H = Math.min(9, 0.6 + a.distanceTo(b) * 0.12);
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(a.clone().lerp(b, t).add(new T.Vector3(0, 4 * H * t * (1 - t), 0))); }
    return pts;
  }

  /** Click with an item in hand: throw it, or put the dampers on. */
  useInHand() {
    const g = this.runner.game, id = this.active;
    if (id === 'dampers') {
      if (!g.canUseItem('dampers').ok) { this.audio.click(); return; }
      this.runner.useItem('dampers');
      this.audio.muffle?.();
      this.active = 'gun';
      return;
    }
    const t = this.itemTarget;
    if (!t?.ok) { this.audio.click(); return; }
    this.runner.useItem(id, { ray: t.ray });
    // the item flies along the arc and lands; the sim has it land on the next tick
    const T = this.view.THREE, pts = this.arcPoints(this.view.camera, t.land, 32);
    const dur = 0.25 + pts[0].distanceTo(pts[pts.length - 1]) / 40;
    const ball = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), new T.MeshBasicMaterial({ color: new T.Color('#c8d8ff').multiplyScalar(2.4), toneMapped: false }));
    this.view.scene.add(ball);
    this.itemFx.push({ obj: ball, t: 0, dur, update(k) {
      const u = Math.min(1, k / dur) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(u));
      ball.position.copy(pts[i]).lerp(pts[i + 1], u - i);
    }, onEnd: () => this.spawnItemFx(id, t.x, t.y) });
  }

  /** What a thrown item looks like where it lands: a decoy blinking, an EMP's flash. */
  spawnItemFx(id, x, y) {
    const T = this.view.THREE, c = new T.Vector3((x + 0.5) * CELL_M, 0, (y + 0.5) * CELL_M);
    const blue = new T.Color('#c8d8ff').multiplyScalar(2.4);
    if (id === 'decoy') {
      const g = new T.Group();
      g.position.copy(c);
      const body = new T.Mesh(new T.CylinderGeometry(0.09, 0.11, 0.14, 10), new T.MeshStandardMaterial({ color: 0x3a3e46, roughness: 0.5, metalness: 0.5 }));
      body.position.y = 0.07;
      const lamp = new T.Mesh(new T.SphereGeometry(0.04, 8, 6), new T.MeshBasicMaterial({ color: blue, toneMapped: false }));
      lamp.position.y = 0.16;
      const ring = new T.Mesh(new T.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: blue, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
      ring.position.y = 0.04;
      g.add(body, lamp, ring);
      this.view.scene.add(g);
      this.audio.rattle?.();
      this.itemFx.push({ obj: g, t: 0, dur: DECOY_TICKS / this.runner.session.tickHz, update(t) {
        lamp.visible = (t * 3) % 1 < 0.5;
        const k = (t * 1.4) % 1;
        ring.scale.setScalar(0.3 + k * 3.2); ring.material.opacity = 0.6 * (1 - k);
      } });
    } else if (id === 'emp') {
      const R = EMP_RADIUS * CELL_M;
      const ball = new T.Mesh(new T.SphereGeometry(1, 24, 14), new T.MeshBasicMaterial({ color: blue, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
      ball.position.copy(c).setY(0.8);
      this.view.scene.add(ball);
      this.audio.zap();
      this.itemFx.push({ obj: ball, t: 0, dur: 0.6, update(t) {
        const k = Math.min(1, t / 0.35);
        ball.scale.setScalar(0.2 + R * k);
        ball.material.opacity = 0.55 * (1 - t / 0.6);
      } });
    }
  }

  /** Advance and retire the item effects. */
  updateItemFx(dt) {
    for (const fx of this.itemFx) { fx.t += dt; fx.update(fx.t); }
    for (const fx of this.itemFx.filter((f) => f.t >= f.dur)) {
      fx.onEnd?.();
      this.view.scene.remove(fx.obj);
      fx.obj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    }
    this.itemFx = this.itemFx.filter((f) => f.t < f.dur && !f.done);
  }

  /** The landing ring and the arc for a throw: pale when it would land, grey when not. */
  showItemTarget(t) {
    const T = this.view.THREE;
    if (!this.itemRing) {
      const mat = () => new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false });
      this.itemRing = new T.Mesh(new T.RingGeometry(0.62, 0.72, 40).rotateX(-Math.PI / 2), mat());
      this.itemBlast = new T.Mesh(new T.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), mat());
      this.itemRing.material.opacity = 0.85; this.itemBlast.material.opacity = 0.45;
      const geo = new T.BufferGeometry().setFromPoints(Array.from({ length: 49 }, () => new T.Vector3()));
      this.itemArc = new T.Line(geo, new T.LineDashedMaterial({ color: 0xffffff, dashSize: 0.35, gapSize: 0.22, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }));
      this.itemArc.frustumCulled = false;
      this.view.scene.add(this.itemRing, this.itemBlast, this.itemArc);
    }
    const show = !!t?.land;
    this.itemRing.visible = this.itemArc.visible = show;
    this.itemBlast.visible = show && this.active === 'emp';
    if (!show) return;
    const col = t.ok ? '#dbe6ff' : '#5c616b';
    for (const m of [this.itemRing, this.itemBlast, this.itemArc]) m.material.color.set(col);
    this.itemRing.position.set((t.land.x + 0.5) * CELL_M, 0.06, (t.land.y + 0.5) * CELL_M);
    this.itemBlast.position.copy(this.itemRing.position);
    this.itemBlast.scale.setScalar(EMP_RADIUS * CELL_M);
    const pts = this.arcPoints(this.view.camera, t.land), pos = this.itemArc.geometry.attributes.position;
    pts.forEach((p, i) => pos.setXYZ(i, p.x, p.y, p.z));
    pos.needsUpdate = true;
    this.itemArc.geometry.computeBoundingSphere();
    this.itemArc.computeLineDistances();
  }

  inHandText(g) {
    // N4.4: in a dark alley without the torch on, say how to see
    const b = this.runner.session.body;
    const dark = this.lights?.torch && !this.torchOn && this.world.darkAt(Math.floor(b.x), Math.floor(b.y)) < 0.35;
    if (dark && this.active === 'gun') return 'Too dark to see · F: torch';
    if (this.active === 'gun') return g.canUseItem ? `${g.dampers ? 'Dampers on · ' : ''}${this.torchOn ? 'F: torch off · ' : ''}Space: inventory` : '';
    const it = ITEMS3D[this.active], have = g.loadout.items[this.active];
    const why = this.itemTarget && !this.itemTarget.ok && this.itemTarget.reason ? ` · ${this.itemTarget.reason}` : '';
    return `${it.label} ×${have} · click to ${this.active === 'dampers' ? 'put them on' : 'throw'}${why}`;
  }

  fire() {
    const g = this.runner.game;
    if (this.paused || g.over) return;
    if (this.active !== 'gun') { this.useInHand(); return; }
    if (!g.loadout.stunGun) return;
    const lock = this.lock;
    if (lock?.ok) {
      this.runner.fire(lock.id, lock.aim);
      this.view.camera.updateMatrixWorld();
      this.gun.fired(this.view.scene, this.gun.muzzleWorld(this.view.camera), lock.point || this.entities.alienPosition(lock.id));
      this.audio.zap();
    } else {
      this.gun.dry();
      this.audio.click();
    }
  }

  buildScene() {
    const cellM = this.tune.cellM;
    // builds 41-42: a belt's first district in its own style (art/hdstyles.js). Its key
    // light casts shadows at Medium too -- the look is built on them (Low has none)
    const H = artFor(this.runner.level.level)?.hd || null;
    const castsShadow = !!H && !!((H.sun || H.moonLight)?.shadow || H.moon2?.shadow || H.effects?.searchlight);
    const shadows = this.quality.shadows || (castsShadow && this.quality.id !== 'low');
    const R = this.view.renderer, T = this.view.THREE;
    R.shadowMap.enabled = shadows;
    R.shadowMap.type = H ? T.PCFSoftShadowMap : T.PCFShadowMap;
    // for the next time this district is built, or the next district if it is a belt's first
    // (build 43: a style may ask for the 2K kit; the 1K one stands in if that is not loaded)
    const res = H?.res || '1k', nextH = artFor(this.runner.level.level + 1)?.hd;
    if (H && !kitReady(res)) loadKit(undefined, res).catch(() => {});
    if (nextH && !kitReady(nextH.res || '1k')) loadKit(undefined, nextH.res || '1k').catch(() => {});
    if (res === '2k') loadGround2k(groundIdsFor(H.ground)).catch(() => {});
    if (nextH?.res === '2k') loadGround2k(groundIdsFor(nextH.ground)).catch(() => {});
    this.world = buildWorld(this.runner.level, { cellM, shadows, kit: H ? (kitReady(res) || kitReady('1k') || kitReady('2k')) : null });
    this.view.post?.setGrade(this.world.art.grade);
    // film tone mapping: in post.js when it runs, else (Low) by the renderer
    R.toneMapping = H ? T.ACESFilmicToneMapping : T.NoToneMapping;
    R.toneMappingExposure = this.world.art.grade?.exposure ?? 1;
    // the sky's own light on every PBR surface: a photograph's HDR, or the drawn sky itself
    const sc = this.view.scene;
    sc.environment = null;
    this.skyEnv?.dispose(); this.skyEnv = null;
    if (H?.sky?.photo) {
      const world = this.world;
      loadDayEnv(R, H.sky.env).then((env) => {
        if (this.world !== world) return;
        sc.environment = env;
        sc.environmentIntensity = H.env ?? 1;
      }).catch((e) => console.warn('the sky light did not load', e));
    } else if (H?.sky?.proc && this.world.skyMesh) {
      this.skyEnv = envFromSky(R, this.world.skyMesh);
      sc.environment = this.skyEnv.texture;
      sc.environmentIntensity = H.env ?? 1;
    }
    // N4.4 prototype: the far plane follows the district's fog (district 1's smog ends at 38 m)
    this.view.camera.far = (this.world.art.fog.far ?? 90) + 8;
    this.view.camera.updateProjectionMatrix();
    this.view.scene.add(this.world.group);
    this.lights = lightScene(this.view.scene, this.world.palette, {
      cellM, mapW: this.runner.map.w, mapH: this.runner.map.h, shadows, follow: true,
    });
    this.entities = new Entities(this.view.scene, { cellM, district: this.runner.district });
    this.entities.reset(this.runner.game);
    this.horror(0);   // makes the capture's two lights now, so the scare frame never recompiles shaders
  }

  /**
   * What the killcam replays: the sim's own state after every tick, the last few seconds
   * of it. Positions only -- the replay is a picture of what happened, not a re-run.
   */
  remember() {
    const g = this.runner.game;
    this.history.push({
      tick: g.tick, x: g.player.x, y: g.player.y, yaw: this.controls.yaw,
      patrols: g.patrols.map((p) => ({ id: p.id, x: p.x, y: p.y, mode: p.mode, stunnedUntil: p.stunnedUntil || 0 })),
    });
    if (this.history.length > 16) this.history.shift();
  }

  /**
   * Horror lighting for the capture, k in 0..1: the district's own light drains away, the
   * fog closes in to a red-black a few metres out, and the alien's face is lit from below
   * by a flickering red light between it and you. horror(0) puts the district back.
   */
  horror(k, sc = null, cam = null, fogFar = null) {
    const T = this.view.THREE, scene = this.view.scene;
    const lights = scene.getObjectByName('district-lights');
    if (lights) lights.traverse((o) => { if (o.isLight) { o.userData.i0 ??= o.intensity; o.intensity = o.userData.i0 * (1 - (sc?.target ? 0.985 : 0.94) * k); } });
    const f = scene.fog;
    if (f) {
      f.userData ??= {};
      f.userData.base ??= { color: f.color.clone(), near: f.near, far: f.far, bg: scene.background?.isColor ? scene.background.clone() : null };
      const b = f.userData.base, dark = new T.Color(0x070102);
      f.color.copy(b.color).lerp(dark, k);
      f.near = b.near + (0.6 - b.near) * k;
      f.far = b.far + ((fogFar ?? (sc?.target ? 3.4 : 5.5)) - b.far) * k;
      if (b.bg) scene.background = b.bg.clone().lerp(dark, k);
    }
    if (!this.scareLight) {
      this.scareLight = new T.PointLight(0xff1a10, 0, 2.6, 1.6);
      this.scareFill = new T.PointLight(0x6a86ff, 0, 3, 2);   // a cold light from above
      // the attack's key: a tight cold spot on the face alone, so the body falls into black
      this.scareKey = new T.SpotLight(0xc4d6ff, 0, 4, 0.3, 0.75, 1.2);
      scene.add(this.scareLight, this.scareFill, this.scareKey, this.scareKey.target);
    }
    const sky = this.world?.group.getObjectByName('sky');
    if (sky) sky.visible = !(sc?.target && k > 0.5);
    // once the lights are fully out the attack happens in a void: no wall can stand between
    // you and it, wherever you were facing when it caught you
    if (this.world) this.world.group.visible = !(sc?.target && k > 0.98);
    // wet skin: the cold light should slide off it, not sink in
    const skin = this.entities?.kit?.skin;
    if (skin) { skin.userData.r0 ??= skin.roughness; skin.roughness = skin.userData.r0 + (0.5 - skin.userData.r0) * (sc?.target ? k : 0); }
    if (k <= 0 || !sc) { this.scareLight.intensity = 0; this.scareFill.intensity = 0; this.scareKey.intensity = 0; return; }
    if (sc.target) {
      // the attack: a hard cold key from above and toward you, glinting off the teeth and
      // the wet skin, and a dim guttering red from under the jaw
      const toCam = cam.position.clone().sub(sc.target).normalize();
      const flick = 0.75 + 0.25 * Math.sin(this.t * 47) * Math.sin(this.t * 13 + 2);
      this.scareKey.position.copy(sc.target).addScaledVector(toCam, 0.75).add(new T.Vector3(0, 0.7, 0));
      this.scareKey.target.position.copy(sc.target).add(new T.Vector3(0, -0.06, 0));
      this.scareKey.target.updateMatrixWorld();
      this.scareKey.intensity = 4.2 * k;
      this.scareFill.intensity = 0;
      this.scareLight.position.copy(sc.target).addScaledVector(toCam, 0.2).add(new T.Vector3(0, -0.4, 0));
      this.scareLight.distance = 1.2;
      this.scareLight.intensity = 0.45 * k * flick;
      return;
    }
    this.scareFill.color.setHex(0x6a86ff);
    this.scareLight.distance = 2.6;
    this.scareKey.intensity = 0;
    // under the chin, a little toward you; it gutters like a failing tube
    const flick = 0.72 + 0.28 * Math.sin(this.t * 47) * Math.sin(this.t * 13 + 2);
    this.scareLight.position.copy(sc.pos).addScaledVector(sc.fwd, -0.4).setY(1.0);
    this.scareLight.intensity = 1.6 * k * flick;
    this.scareFill.position.copy(sc.pos).addScaledVector(sc.fwd, 0.6).setY(2.4);
    this.scareFill.intensity = 1.2 * k;
  }

  playKillcam() {
    const frames = this.history.slice(-13);
    if (frames.length < 2) return;
    $('overlay').hidden = true;
    $('hud').hidden = true;
    $('killcam').hidden = false;
    document.body.classList.remove('g3-caught');
    this.fx.reset();
    this.horror(0);
    this.entities.scare = null;
    this.entities.vis.clear();
    this.killcam = { t0: this.t, frames };
  }

  /** Drive the scene from a remembered frame instead of the live game. */
  killcamFrame(dt) {
    const k = this.killcam, g = this.runner.game, hz = this.runner.session.tickHz;
    const pos = (this.t - k.t0) * hz;
    const i = Math.min(k.frames.length - 1, Math.floor(pos));
    const f = k.frames[i], next = k.frames[Math.min(k.frames.length - 1, i + 1)];
    const a = Math.min(1, pos - i);
    const px = f.x + (next.x - f.x) * a, py = f.y + (next.y - f.y) * a;
    const view = Object.create(g);
    Object.defineProperties(view, {
      tick: { value: f.tick }, patrols: { value: f.patrols },
      player: { value: { x: Math.round(px), y: Math.round(py) } },
    });
    this.entities.sync(view, 1, this.t, { dt, tickHz: hz, camera: this.view.camera });
    this.entities.showHuman(true, px, py, f.yaw);
    // Above and behind you, looking down at where it happened.
    const cellM = this.tune.cellM, cam = this.view.camera;
    const yaw = f.yaw, cx = (px + 0.5) * cellM, cz = (py + 0.5) * cellM;
    cam.position.set(cx + Math.sin(yaw) * 4.5, 6.5, cz + Math.cos(yaw) * 4.5);
    cam.lookAt(cx, 0.6, cz);
    if (pos > k.frames.length + 2) {
      this.killcam = null;
      this.entities.showHuman(false);
      $('killcam').hidden = true;
      $('hud').hidden = false;
      $('overlay').hidden = false;
      document.body.classList.add('g3-caught');
    }
  }

  afterTick() {
    this.remember();
    const g = this.runner.game;
    const alert = g.alertTicks > 0;
    if ((g.started && g.tick % DISPATCH_EVERY_TICKS === 0) || (alert && !this.wasAlert)) this.narrate();
    this.wasAlert = alert;
  }

  narrate() {
    const r = this.runner;
    this.hud.narrate({
      game: r.game, prediction: r.prediction, dossier: r.dossier, chain: r.chain,
      lastSpawn: r.lastSpawn, level: r.district, habits: r.habits,
      profile: this.profileName(), mode: r.mode,
    });
  }

  profileName() { return this.career ? this.career.profile : { displayName: 'SANDBOX' }; }

  primary() {
    this.audio.start();
    if (this.ended) {
      const won = this.runner.game.won;
      const cap = this.career ? this.career.profile.level : 100;
      this.start(won ? Math.min(100, cap, this.district + 1) : this.district);
    }
    if (this.touch) {
      // No pointer lock on a phone: playing is simply "not paused". Full screen and a
      // landscape lock where the browser allows it, because height is the scarce thing.
      try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}); } catch { /* fine */ }
      try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* fine */ }
      this.onLock(true);
      return;
    }
    this.controls.lock();
  }

  onLock(locked) {
    this.paused = !locked;
    // Paused means silent. Not at the moment of capture, though: finish() releases the
    // pointer too, and the capture keeps its sound until the end card (showEnd).
    if (locked) { this.audio.start(); this.audio.resume(); }
    else if (!this.ended) this.audio.pause();
    $('overlay').hidden = locked || this.ended;
    // finish() releases the pointer, and the browser reports it a moment later -- in the
    // middle of the capture. The HUD stays off until the end card (showEnd) brings it back:
    // build 16 put the minimap, keys and debug panel back over the alien's face.
    if (!this.ended) $('hud').hidden = false;
    if (!locked) { this.hud.showMap(false); this.controls.mapOpen = false; }
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
    this.audio.setTension(0);
    $('hud').hidden = true;                 // the sequence plays clean; showEnd() brings it back
    const g = this.runner.game;
    const variant = variantFor(this.settings.jumpscares);
    this.lastVariant = variant;
    $('hud-debug').hidden = true;           // the leash readout too: nothing over the scene
    const cam = this.view.camera.position;
    let done;
    const sequenceDone = new Promise((res) => { done = res; });
    if (!summary.won) {
      // The capture is never ambiguous about who did it: the camera turns to face it --
      // and, unless jumpscares are off, it is pulled right up to your face.
      let best = null, bestD = Infinity;
      for (const p of g.patrols) {
        const d = Math.hypot(p.x - g.player.x, p.y - g.player.y);
        if (d < bestD) { bestD = d; best = p; }
      }
      const at = best && this.entities.alienPosition(best.id);
      this.fx.start('jumpscare', variant, { t: this.t, onDone: done });
      const seq = this.fx.run.def;
      if (at) {
        // An instant scare does not turn you round to find it: it is already there, dead
        // centre of wherever you were looking, on the frame you are caught.
        const toYaw = seq.instant ? this.controls.yaw : Math.atan2(-(at.x - cam.x), -(at.z - cam.z));
        let diff = toYaw - this.controls.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        // with the lunge, look down a little: its face is below your eyes once it is close
        this.endAnim = { t0: this.t, fromYaw: this.controls.yaw, dYaw: diff, fromPitch: this.controls.pitch, dur: seq.snap, toPitch: seq.lunge ? (seq.pitch ?? -0.3) : -0.06 };
        if (seq.lunge) {
          // The cutscene moves the alien along the line from your eyes to it; its face is
          // ~0.28 m ahead of its feet. d0 is where it starts: wherever it really was.
          const T = this.view.THREE;
          const fwd = new T.Vector3(-Math.sin(toYaw), 0, -Math.cos(toYaw));
          const eye = new T.Vector3(cam.x, 0, cam.z);
          const d0 = Math.max(0.6, Math.hypot(at.x - cam.x, at.z - cam.z) - 0.28);
          this.entities.scare = { id: best.id, eye, fwd, d0, pos: new T.Vector3(at.x, 0, at.z), heading: toYaw + Math.PI, jaw: 0, reach: 0, dilate: 0 };
          // the attack drives the camera itself (knocked down, rolled, looking up at it)
          if (seq.attack) {
            Object.assign(this.entities.scare, { target: new T.Vector3(at.x, 1.6, at.z), yaw0: this.controls.yaw, pitch0: this.controls.pitch, lean: 0, claw: 0, swipe: 0, thrash: 0 });
            this.endAnim = null;
          }
        }
      }
      document.body.classList.add('g3-caught');
    } else {
      const center = new this.view.THREE.Vector3(cam.x, 0, cam.z);
      this.fx.start('ascension', variant, { t: this.t, center, onDone: done });
      this.ascend = { fromYaw: this.controls.yaw };
      if (variant === 'off') document.body.classList.add('g3-won');
    }
    this.narrate();
    clearTimeout(this.overlayTimer);
    const saved = this.career ? this.career.finishRun(this.runner) : Promise.resolve(null);
    if (!this.career) this.dossier.update(this.runner.system.traits || this.runner.system.liveTraits(), { levelCompleted: summary.won });
    if (!this.career && this.runner.habitValues) this.habits.update(this.runner.habitValues);
    // the end card waits for the sequence; the timer is only a fallback for a hidden tab
    const fallback = new Promise((res) => { this.overlayTimer = setTimeout(res, (this.fx.run.def.duration + 0.6) * 1000); });
    const runner = this.runner;
    Promise.all([saved, Promise.race([sequenceDone, fallback])]).then(([result]) => { if (this.runner === runner) this.showEnd(summary, result); });
  }

  endStats(summary, result) {
    const hz = this.runner.session.tickHz;
    const secs = realSeconds(summary.ticks, hz).toFixed(1);
    const rows = [];
    if (result) {
      const { rows: parts } = scoreBreakdown(result.scored);
      rows.push(['SCORE', result.scored.score.toLocaleString()]);
      for (const [label, value] of parts) if (value) rows.push([`· ${label}`, value]);
      rows.push(['COINS EARNED', `+${result.earned}`]);
      rows.push(['wallet', this.career.profile.wallet.coins]);
    }
    return rows.concat([
      ['keys', `${summary.collected}/${summary.caches}`],
      ['time', `${secs}s (par ${realSeconds(summary.par, hz).toFixed(0)}s)`],
      ['aliens at peak', summary.peakAliens],
      ['coins picked up', summary.coinValue],
      ['aliens stunned', summary.stuns ?? 0],
      ['file depth', `${this.dossier.levelsSeen} districts`],
    ]);
  }

  showEnd(summary, result = null) {
    $('hud').hidden = false;
    $('hud-debug').hidden = !this.tune.debug;
    const secs = realSeconds(summary.ticks, this.runner.session.tickHz).toFixed(1);
    $('ov-title').textContent = summary.won ? 'THROUGH THE PORTAL' : summary.loseReason === 'timeout' ? 'TIMED OUT' : 'CAUGHT';
    $('ov-body').textContent = summary.won
      ? (this.district >= CURVE_CAP
        ? `District ${this.district} cleared in ${secs}s. The curve caps at ${CURVE_CAP}; from here the districts keep coming and the file keeps thickening.`
        : `District ${this.district} cleared in ${secs}s. The file on you follows you to district ${this.district + 1}.`)
      : `They reached you after ${secs}s, with ${summary.collected} of ${summary.caches} keys. The run still went into your file.`
        // never again a silent downgrade: say when the capture was not the full one (R50)
        + (this.lastVariant && this.lastVariant !== 'full' ? ` (Jumpscares are set to ${this.lastVariant}; Settings below.)` : '');
    $('ov-stats').innerHTML = this.endStats(summary, result).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    $('ov-primary').textContent = summary.won ? `enter district ${this.district + 1}` : 'run it again';
    $('ov-secondary').hidden = !summary.won;
    $('ov-secondary').textContent = 'replay this district';
    $('ov-killcam').hidden = summary.won || this.history.length < 2;
    $('overlay').hidden = false;
    this.audio.pause();
  }

  // ---------------------------------------------------------------- the frame

  frame(now, once = false) {
    // The frame-rate setting (N8.4): skip display refreshes until a frame is due. A cap
    // draws nothing sooner; it gives every frame the same, longer, time, which a weak
    // laptop can turn into a steady 30 instead of an uneven 40-60. Frames are due on a
    // fixed schedule, not "long enough since the last one", so the average holds on any
    // display (60 on a 144 Hz screen, not 48).
    const cap = Number(this.settings.fpsCap) || 0;
    if (cap && !once) {
      const every = 1000 / cap;
      if (this.nextDue != null && now < this.nextDue - 1) { requestAnimationFrame(this.frame); return; }
      this.nextDue = Math.max((this.nextDue ?? now) + every, now - every);
    } else this.nextDue = null;
    // clamped both ways: a timestamp that runs backwards must never run the clock backwards
    const dt = Math.max(0, Math.min(((now - (this.last ?? now)) / 1000), 0.1));
    this.last = now;
    this.t += dt;
    const r = this.runner;
    const g = r.game;
    const intent = this.touch ? this.touch.intent(this.controls.yaw) : this.controls.intent();
    intent.mapOpen = !this.hud.map.hidden;     // part of the input record since N8.5
    this.fps += ((dt > 0 ? 1 / dt : 60) - this.fps) * 0.05;
    // awake aliens are solid to your body: you bump into one and it gets you
    if (!this.paused && !g.over) r.update(dt, intent, this.entities.solids());

    if (this.killcam) {
      this.killcamFrame(dt);
      this.world.animate(this.t, this.view.camera.position, this.view.renderer.domElement.height);
      this.lights.follow(this.view.camera);
      this.view.render();
      if (!once) requestAnimationFrame(this.frame);
      return;
    }

    const cellM = this.tune.cellM;
    const cam = this.view.camera;
    const b = r.session.body;
    const speed = Math.hypot(b.vx, b.vy);
    const calm = this.settings.reduceMotion;
    // Head bob from distance actually walked, not from time: standing still is still. A
    // footstep at each low point (build 45: by distance, not by sim cell -- a 2.5 m cell
    // is too long a step, and a sprint tick of two cells would be one step for 5 m).
    const stepWas = footfall(this.bob);
    this.bob += speed * cellM * dt * BOB_PER_M;
    if (footfall(this.bob) > stepWas && !g.over) {
      const { w, h, tiles } = r.map, tx = Math.floor(b.x), ty = Math.floor(b.y);
      const tile = tx >= 0 && ty >= 0 && tx < w && ty < h ? tiles[ty * w + tx] : TILE.FLOOR;
      this.audio.footstep(tile === TILE.COVER ? 'water' : tile === TILE.SAFE ? 'safe' : 'floor', g.sprinting);
    }
    const bobY = calm ? 0 : Math.sin(this.bob * 2) * 0.035 * Math.min(1, speed / r.session.tickHz);
    cam.position.set(b.x * cellM, EYE_M + bobY, b.y * cellM);
    cam.rotation.set(this.controls.pitch, this.controls.yaw, 0);
    // build 42: a foot caught on a step, a bin, a bag: a stumble you recover from at once
    const trip = !this.paused && !g.over && !this.fx.run && !this.endAnim ? this.stumble(dt, cam, b, speed, cellM, calm, g.sprinting) : 0;
    // A small FOV kick while actually sprinting.
    const kick = !calm && g.sprinting && speed > r.session.tickHz * 1.2 ? 5 : 0;
    this.fovKick += (kick - this.fovKick) * (1 - Math.exp(-dt * 8));
    this.view.setHFov(this.settings.fov + this.fovKick);

    if (this.endAnim) {
      const k = Math.min(1, (this.t - this.endAnim.t0) / (this.endAnim.dur || 0.45));
      const e = 1 - (1 - k) * (1 - k);
      this.controls.yaw = this.endAnim.fromYaw + this.endAnim.dYaw * e;
      this.controls.pitch = this.endAnim.fromPitch * (1 - e) + (this.endAnim.toPitch ?? -0.06) * e;
      cam.rotation.set(this.controls.pitch, this.controls.yaw, 0);
    }
    // ---- the capture jumpscare and the portal ascension (web3d/sequences.js)
    if (this.fx.run) {
      const st = this.fx.update(this.t);
      const fx = this.fx, def = fx.run.def;
      if (fx.kind === 'jumpscare') {
        const sc = this.entities.scare;
        if (sc && def.attack) {
          // The attack (web3d/sequences.js): the camera is knocked back, down and rolled,
          // and the alien's face is pinned to a point in that view -- the body hangs off it.
          const tr = (n) => fx.track(n, this.t);
          const T = this.view.THREE;
          const yaw = sc.yaw0 + tr('yawK');
          const pitch = sc.pitch0 + (tr('pitch') - sc.pitch0) * Math.min(1, st / (def.blend || 0.06));
          this.controls.yaw = yaw; this.controls.pitch = pitch;
          cam.position.y = EYE_M + tr('camY');
          cam.position.addScaledVector(sc.fwd, -tr('back'));
          cam.rotation.set(pitch, yaw, tr('roll'));
          const q = cam.quaternion;
          const dir = new T.Vector3(0, 0, -1).applyQuaternion(q), up = new T.Vector3(0, 1, 0).applyQuaternion(q), right = new T.Vector3(1, 0, 0).applyQuaternion(q);
          sc.target.copy(cam.position).addScaledVector(dir, tr('dist')).addScaledVector(up, tr('yOff')).addScaledVector(right, tr('xOff'));
          sc.pos.copy(sc.target);
          sc.lean = tr('lean'); sc.claw = tr('claw'); sc.swipe = tr('swipe');
          sc.jaw = tr('jaw'); sc.dilate = tr('dilate'); sc.thrash = tr('thrash');
        } else if (sc) {
          const ap = def.tracks.approach ? fx.track('approach', this.t) : 1;
          const d = ap < 1 ? sc.d0 + (0.9 - sc.d0) * ap : fx.track('dist', this.t);
          sc.pos.copy(sc.eye).addScaledVector(sc.fwd, d + 0.28);
          sc.jaw = fx.track('jaw', this.t);
          sc.reach = fx.track('reach', this.t);
          sc.dilate = fx.track('dilate', this.t);
          // the grab drags you toward it
          cam.position.addScaledVector(sc.fwd, fx.track('pull', this.t));
        }
        const amp = fx.track('shake', this.t);
        if (amp > 0) {
          cam.position.x += amp * Math.sin(this.t * 91);
          cam.position.y += amp * Math.sin(this.t * 73 + 1);
          cam.rotation.z += amp * 1.5 * Math.sin(this.t * 61);
        }
        this.view.setHFov(this.settings.fov + fx.track('fov', this.t));
        this.horror(def.tracks.dark ? fx.track('dark', this.t) : 0, sc, cam, def.tracks.fogFar ? fx.track('fogFar', this.t) : null);
        if (def.grab && fx.once('grab', def.grab.at, this.t)) this.audio.grab(def.grab.level);
        if (def.shriek && fx.once('shriek', def.shriek.at, this.t)) this.audio.shriek(def.shriek.level, def.shriek.dur);
        if (def.cut && fx.once('cut', def.cut.at, this.t)) this.audio.cut();
        // a skip jumps to the end: it must not fire every remaining sound at once
        (def.sounds || []).forEach((snd, i) => {
          if (!fx.once(`snd${i}`, snd.at, this.t) || fx.run.skip) return;
          if (snd.kind === 'cut') this.audio.cut();
          else this.audio[snd.kind]?.(snd.level ?? 1, snd.dur);
        });
      } else {
        cam.position.y += fx.track('lift', this.t) * 38;
        this.controls.yaw = this.ascend.fromYaw + fx.track('spin', this.t);
        this.controls.pitch = fx.track('pitch', this.t);
        cam.rotation.set(this.controls.pitch, this.controls.yaw, 0);
        this.view.setHFov(this.settings.fov + fx.track('fov', this.t));
        this.entities.portalBoost = fx.track('beam', this.t);
        if (def.rise && fx.once('rise', 0, this.t)) this.audio.rise(def.rise.level);
      }
    } else if (!g.over && !this.paused && variantFor(this.settings.jumpscares) !== 'off') {
      // tension: a hunting alien within two cells -- the heartbeat swells, the drone ducks
      let near = Infinity;
      for (const p of g.patrols) {
        if ((p.stunnedUntil || 0) > g.tick || !(p.mode === 'hunt' || p.mode === 'cutoff')) continue;
        near = Math.min(near, Math.hypot(p.x - g.player.x, p.y - g.player.y));
      }
      const x = near <= 2.5 ? Math.max(0, Math.min(1, 1 - (near - 1) / 1.5)) : 0;
      if (Math.abs(x - this.tension) > 0.02) { this.tension = x; this.audio.setTension(x); }
    }
    this.entities.sync(g, r.session.alpha, this.t, { dt, tickHz: r.session.tickHz, camera: cam });
    this.audio.update(g, { x: cam.position.x, y: EYE_M, z: cam.position.z, yaw: this.controls.yaw }, this.entities.alienVoices());
    this.world.animate(this.t, this.view.camera.position, this.view.renderer.domElement.height);
    // Inside a black box the world goes dark and quiet: nothing can see in, and you know it.
    const inBox = r.map.tiles[Math.floor(b.y) * r.map.w + Math.floor(b.x)] === TILE.SAFE;
    document.body.classList.toggle('g3-in-box', inBox);

    cam.updateMatrixWorld();
    this.checkInHand(g);
    this.lock = !this.paused && !g.over && this.active === 'gun' ? this.gun.aim(cam, this.entities, g, this.touch ? 0.14 : 0) : null;
    this.itemTarget = !g.over ? this.aimItem(cam, g) : null;
    this.showItemTarget(this.itemTarget);
    this.updateItemFx(dt);
    this.hud.setInHand(this.inHandText(g));
    if (this.touch) {
      // RUN latches, but the sim refuses sprint on an empty charge: keep the latch honest.
      if (this.touch.run && g.sprintTicks <= 0) this.touch.run = false;
      this.touch.setState({ running: g.sprinting, charges: g.loadout.bullets, gun: g.loadout.stunGun, locked: this.lock?.ok });
    }
    this.gun.update(dt, cam, g, { yaw: this.controls.yaw, pitch: this.controls.pitch, bob: bobY + trip, reduceMotion: calm });
    if (this.active !== 'gun') this.gun.model.visible = false;   // an item in hand, not the gun
    this.hud.update({
      game: g, level: r.level, body: b, camera: cam, yaw: this.controls.yaw,
      tickHz: r.session.tickHz, cellM, prediction: r.prediction, entities: this.entities,
      lock: this.lock, edgeMarkers: !!this.world.art.hd?.proto?.edgeMarkers,
    });
    if (this.tune.debug) this.debugReadout();
    this.lights.follow(this.view.camera);
    if (this.lights.torch) this.lights.torch.intensity = this.torchOn ? this.world.art.hd.torch.intensity : 0;
    this.view.render();
    // Read the world pass's counters before the gun pass resets them.
    this.worldInfo = { ...this.view.sceneInfo };
    this.gun.render(this.view.renderer);
    this.fx.afterRender(this.view.renderer.domElement, this.t);
    if (!once) requestAnimationFrame(this.frame);
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
      `fps       ${this.fps.toFixed(0)}  quality ${this.quality.id}\n` +
      `draws     ${this.worldInfo?.calls ?? 0}  tris ${this.worldInfo?.tris ?? 0}`;
  }

  /**
   * Frame cost at a given resolution, with the GPU forced to finish every frame (a
   * one-pixel readback), so the number includes GPU time and not just command submission.
   * Used for criterion 3D-11; the browser's own frame pacing is not involved.
   */
  benchmark({ width = 1920, height = 1080, pixelRatio = 1, frames = 120, spin = true } = {}) {
    const R = this.view.renderer, gl = R.getContext();
    const prevRatio = R.getPixelRatio();
    R.setPixelRatio(pixelRatio);
    R.setSize(width, height, false);
    this.view.camera.aspect = width / height;
    this.view.setHFov(this.settings.fov);
    const px = new Uint8Array(4);
    const times = [];
    let calls = 0, tris = 0;
    for (let i = 0; i < frames + 10; i++) {
      // Turn through a full circle over the run, so every view direction is in the sample.
      if (spin) this.controls.yaw += (Math.PI * 2) / frames;
      const t0 = performance.now();
      this.frame(performance.now(), true);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const ms = performance.now() - t0;
      if (i >= 10) times.push(ms);
      calls = Math.max(calls, this.worldInfo.calls); tris = Math.max(tris, this.worldInfo.tris);
    }
    R.setPixelRatio(prevRatio);
    this.view.resize();
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    return { width, height, pixelRatio, frames, mean, p95: times[Math.floor(times.length * 0.95)], max: times[times.length - 1], calls, tris, quality: this.quality.id };
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
    $('s-jumpscare').value = s.jumpscares || 'full';
    $('s-fps').value = String(s.fpsCap || 'auto');
    $('s-fps').addEventListener('change', (e) => { s.fpsCap = e.target.value === 'auto' ? 'auto' : Number(e.target.value); saveSettings(s); });
    $('s-glow').value = s.glow || 'auto';
    $('s-glow').addEventListener('change', (e) => { s.glow = e.target.value; saveSettings(s); this.applyGlow(); });
    $('s-jumpscare').addEventListener('change', (e) => { s.jumpscares = e.target.value; saveSettings(s); });
    $('s-quality').addEventListener('change', (e) => setQuality(e.target.value));
  }

  /**
   * Glow and colour grade (web3d/post.js), switched live by the Glow setting: automatic
   * means on at High (half-resolution glow, 4x multisampling) and Medium (quarter, 2x)
   * and off at Low. It costs about 3-4 ms a frame at 1080p Medium on an M3, which is why
   * it is a setting of its own and not only part of Quality.
   */
  applyGlow() {
    const g = this.settings.glow || 'auto';
    const want = g === 'on' || (g === 'auto' && this.quality.id !== 'low');
    if (want && !this.view.post) {
      const q = this.quality.id;
      this.view.setPost(createPost(this.view.renderer, { scale: q === 'high' ? 0.5 : 0.25, samples: q === 'high' ? 4 : q === 'medium' ? 2 : 0 }));
      if (this.world) this.view.post.setGrade(this.world.art.grade);
    } else if (!want && this.view.post) {
      this.view.setPost(null);
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
window.__noise3d.ready = window.__noise3d.boot();
