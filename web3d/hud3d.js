// web3d/hud3d.js -- the first-person HUD. Browser only.
//
// Shooter conventions mapped one-to-one onto what the 2D game already shows: the 3D
// player is never shown more than the 2D player sees, and (in v1) never less, because the
// balance was measured against full information.
//
// The minimap and the tactical map are the 2D game's own drawing: web/render.js's
// Renderer, UNCHANGED, drawn into an offscreen canvas and composited -- cropped and
// rotated for the minimap, whole for the map. There is exactly one drawing of the board in
// the project, and information parity holds by construction.

import * as THREE from 'three';
import { Renderer, COLORS } from '../web/render.js';
import { euclid, TILE } from '../sim/grid.js';
import { buildState, templated } from '../web/dispatch.js';
import { realSeconds } from '../sim3d/units.js';

const MINI_TILE = 16;            // px per cell in the offscreen board, on a 2D-sized map
/**
 * Px per cell for a map: 16 on today's boards, smaller on N8's city maps, so the board
 * the 2D renderer redraws every frame stays near 2,400 px wide (a district-100 board at
 * 16 px would be 4,000 x 2,500, redrawn sixty times a second).
 */
export const boardTile = (w) => Math.max(6, Math.min(MINI_TILE, Math.floor(2400 / w)));
const MINI_SIZE = 188;           // css px
const MINI_CELLS = 13;           // cells across the minimap

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  parent?.append(e);
  return e;
}

export class Hud3D {
  constructor(root) {
    this.root = root;
    root.innerHTML = '';
    root.classList.add('h3');

    // offscreen 2D board, drawn by the 2D renderer
    this.boardCanvas = document.createElement('canvas');
    this.board = new Renderer(this.boardCanvas);
    this.tile = MINI_TILE;
    this.board.tile = MINI_TILE;
    this.board.dpr = 1;

    this.overlay = el('canvas', 'h3-overlay', root);       // waypoints + threat arcs
    this.octx = this.overlay.getContext('2d');

    this.crosshair = el('div', 'h3-crosshair', root, '<i></i><b class="h3-lock"></b>');
    this.compass = el('div', 'h3-compass', root, '<div class="h3-compass-track"></div><div class="h3-compass-mark"></div>');
    this.compassTrack = this.compass.firstChild;

    const tl = el('div', 'h3-tl', root);
    this.mini = el('canvas', 'h3-mini', tl);
    this.mini.width = this.mini.height = MINI_SIZE * 2;
    this.mctx = this.mini.getContext('2d');
    this.objective = el('div', 'h3-objective', tl);
    this.alertLine = el('div', 'h3-alert', tl);

    const tr = el('div', 'h3-tr', root);
    this.districtEl = el('div', 'h3-district', tr);
    this.tierEl = el('div', 'h3-tier', tr);
    this.timeEl = el('div', 'h3-time', tr);

    const bl = el('div', 'h3-bl', root);
    this.dispatchEl = el('div', 'h3-dispatch', bl);
    this.noise = el('div', 'h3-noise', bl, '<span class="h3-noise-label">QUIET</span><div class="h3-bar"><i></i></div>');
    this.noiseLabel = this.noise.querySelector('.h3-noise-label');
    this.noiseBar = this.noise.querySelector('i');

    this.sprint = el('div', 'h3-sprint', root, '<span></span><div class="h3-bar"><i></i></div>');
    this.sprintLabel = this.sprint.querySelector('span');
    this.sprintBar = this.sprint.querySelector('i');

    this.begin = el('div', 'h3-begin', root, 'MOVE TO BEGIN');
    this.ammo = el('div', 'h3-ammo', root);

    this.map = el('div', 'h3-map', root, '<canvas></canvas><p>TACTICAL MAP · release Tab / M to close · H heatmap · V visited · I alien targets</p>');
    this.mapCanvas = this.map.querySelector('canvas');
    this.map.hidden = true;

    this.dispatchTimer = null;
    this.layers = { heatmap: false, visited: false, intercepts: false };
  }

  setDistrict(level, tier) {
    this.board.setDistrict(level.level);
    this.tile = boardTile(level.map.w);
    this.board.tile = this.tile;
    const w = level.map.w * this.tile, h = level.map.h * this.tile;
    this.boardCanvas.width = w; this.boardCanvas.height = h;
    this.board.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.board._mapKey = null;
    this.districtEl.textContent = `DISTRICT ${level.level}`;
    this.tierEl.textContent = `${String(tier).toUpperCase()} · ${this.board.theme.name}`;
    this.dispatchEl.classList.remove('on');
  }

  toggleLayer(what) {
    this.layers[what] = !this.layers[what];
    this.board.showHeatmap = this.layers.heatmap;
    this.board.showVisited = this.layers.visited;
    this.board.showIntercepts = this.layers.intercepts;
    return this.layers[what];
  }

  showMap(on) { this.map.hidden = !on; }

  /** A line of intercepted chatter, subtitle style. */
  dispatch(text, src = 'template') {
    if (!text) return;
    this.dispatchEl.innerHTML = `<b>INTERCEPTED${src === 'model' ? '' : ' · reconstructed'}</b>${text.replace(/[<>&]/g, '')}`;
    this.dispatchEl.classList.add('on');
    clearTimeout(this.dispatchTimer);
    this.dispatchTimer = setTimeout(() => this.dispatchEl.classList.remove('on'), 9000);
  }

  /** Templated dispatch from live predictor state. The model path never runs on this page. */
  narrate({ game, prediction, dossier, chain, lastSpawn, level, profile, mode }) {
    const state = buildState({ game, prediction, dossier, chain, lastSpawn, level, profile, mode });
    this.dispatch(templated(state), 'template');
  }

  /**
   * @param {object} f
   * @param {object} f.game, f.level, f.body, f.camera, f.prediction
   * @param {number} f.yaw, f.tickHz, f.cellM
   * @param {object} f.entities
   * @param {object} [f.lock]  crosshair lock state from the stun gun
   */
  update(f) {
    const { game, level, body, camera, yaw, tickHz, cellM } = f;
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.overlay.width !== Math.round(W * dpr)) { this.overlay.width = Math.round(W * dpr); this.overlay.height = Math.round(H * dpr); }
    const o = this.octx;
    o.setTransform(dpr, 0, 0, dpr, 0, 0);
    o.clearRect(0, 0, W, H);

    // ---- the 2D board, offscreen
    this.board.draw({ game, level, alpha: 1, prev: null, prediction: f.prediction?.dist ?? null });

    // ---- minimap: centred on you, rotated so forward is up
    const m = this.mctx, S = this.mini.width;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, S, S);
    m.save();
    m.beginPath(); m.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); m.clip();
    m.fillStyle = '#07080c'; m.fillRect(0, 0, S, S);
    const T = this.tile;
    const scale = S / (MINI_CELLS * T);
    m.translate(S / 2, S / 2);
    m.rotate(yaw);
    m.scale(scale, scale);
    m.translate(-body.x * T, -body.y * T);
    m.drawImage(this.boardCanvas, 0, 0);
    m.restore();
    // you
    m.save();
    m.translate(S / 2, S / 2);
    m.fillStyle = COLORS.beacon;
    m.strokeStyle = '#041014'; m.lineWidth = 3;
    m.beginPath(); m.moveTo(0, -15); m.lineTo(10, 11); m.lineTo(0, 5); m.lineTo(-10, 11); m.closePath();
    m.stroke(); m.fill();
    m.restore();
    m.strokeStyle = 'rgba(255,255,255,0.18)'; m.lineWidth = 3;
    m.beginPath(); m.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); m.stroke();

    // ---- tactical map
    if (!this.map.hidden) {
      const mc = this.mapCanvas;
      const maxW = Math.min(W * 0.9, 1100), maxH = H * 0.78;
      const k = Math.min(maxW / this.boardCanvas.width, maxH / this.boardCanvas.height);
      const cw = Math.round(this.boardCanvas.width * k), ch = Math.round(this.boardCanvas.height * k);
      if (mc.width !== cw * dpr) { mc.width = cw * dpr; mc.height = ch * dpr; mc.style.width = `${cw}px`; mc.style.height = `${ch}px`; }
      const c = mc.getContext('2d');
      c.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      c.drawImage(this.boardCanvas, 0, 0);
      c.translate(body.x * T, body.y * T);
      c.rotate(-yaw);
      c.fillStyle = COLORS.beacon; c.strokeStyle = '#041014'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -11); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.stroke(); c.fill();
    }

    // ---- compass strip: north is grid-up
    const heading = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
    const marks = [];
    const span = 200;                    // px per 90 degrees
    const put = (deg, html, cls) => {
      let rel = ((deg - heading + 540) % 360) - 180;
      if (Math.abs(rel) > 100) return;
      marks.push(`<span class="${cls}" style="left:calc(50% + ${(rel / 90) * span}px)">${html}</span>`);
    };
    for (let d = 0; d < 360; d += 15) {
      const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d];
      put(d, label || (d % 45 === 0 ? '·' : '|'), label ? 'h3-c-card' : 'h3-c-tick');
    }
    const bearing = (x, y) => ((Math.atan2(x + 0.5 - body.x, -(y + 0.5 - body.y)) * 180 / Math.PI) + 360) % 360;
    for (const c of game.caches) if (!c.collected) put(bearing(c.x, c.y), '◆', 'h3-c-key');
    if (game.portalRevealed) put(bearing(game.portal.x, game.portal.y), '▲', 'h3-c-portal');
    this.compassTrack.innerHTML = marks.join('');

    // ---- waypoints over keys and the portal, through walls (the 2D player sees them)
    const v = new THREE.Vector3();
    const way = (x, y, h, color, label) => {
      v.set((x + 0.5) * cellM, h, (y + 0.5) * cellM).project(camera);
      if (v.z > 1) return;
      const sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H;
      if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) return;
      o.save();
      o.translate(sx, sy);
      o.fillStyle = color; o.strokeStyle = 'rgba(0,0,0,0.7)'; o.lineWidth = 2;
      o.beginPath(); o.moveTo(0, -8); o.lineTo(7, 0); o.lineTo(0, 8); o.lineTo(-7, 0); o.closePath(); o.stroke(); o.fill();
      o.font = '600 11px ui-monospace, Menlo, monospace'; o.textAlign = 'center';
      o.lineWidth = 3; o.strokeText(label, 0, 22); o.fillText(label, 0, 22);
      o.restore();
    };
    for (const c of game.caches) {
      if (c.collected) continue;
      way(c.x, c.y, 1.6, COLORS.key, `${(Math.hypot(c.x + 0.5 - body.x, c.y + 0.5 - body.y) * cellM).toFixed(0)} m`);
    }
    if (game.portalRevealed) {
      way(game.portal.x, game.portal.y, 2.2, COLORS.portal, `PORTAL ${(Math.hypot(game.portal.x + 0.5 - body.x, game.portal.y + 0.5 - body.y) * cellM).toFixed(0)} m`);
    }

    // ---- threat arcs: one per alien that can hear you right now, pointing at it
    const effR = game.effectiveRadius;
    let depth = 0, hearers = 0;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    for (const p of game.patrols) {
      if ((p.stunnedUntil || 0) > game.tick) continue;
      const d = euclid(p.x, p.y, game.player.x, game.player.y);
      if (effR > 0) depth = Math.max(depth, 1 - d / effR);
      if (d > effR) continue;
      hearers++;
      const pos = f.entities.alienPosition(p.id);
      if (!pos) continue;
      const rel = pos.sub(camera.position);
      const ang = Math.atan2(rel.dot(right), rel.dot(fwd));
      const R = Math.min(W, H) * 0.16;
      o.strokeStyle = `rgba(255,77,94,${0.45 + 0.5 * Math.max(0, 1 - d / effR)})`;
      o.lineWidth = 5; o.lineCap = 'round';
      o.beginPath();
      o.arc(W / 2, H / 2, R, ang - Math.PI / 2 - 0.28, ang - Math.PI / 2 + 0.28);
      o.stroke();
    }

    // ---- noise meter: how deep inside the nearest radius you are
    const tile = game.map.tiles[game.player.y * game.map.w + game.player.x];
    let label = depth > 0 ? 'HEARD' : 'QUIET';
    if (tile === TILE.SAFE) label = 'SILENT · black box';
    else if (tile === TILE.COVER) label = depth > 0 ? 'HEARD · water muffles you' : 'MUFFLED · water';
    this.noiseLabel.textContent = label;
    this.noise.classList.toggle('hot', depth > 0 && tile !== TILE.SAFE);
    this.noiseBar.style.width = `${Math.max(0, Math.min(1, depth)) * 100}%`;

    // ---- text
    this.objective.textContent = game.portalRevealed ? 'REACH THE PORTAL' : `KEYS ${game.collected} / ${game.caches.length}`;
    this.alertLine.textContent = game.alertTicks > 0 ? `HUNTED · ${hearers} can hear you` : game.patrols.length ? `${game.patrols.length} alien${game.patrols.length > 1 ? 's' : ''} in the district` : '';
    this.alertLine.classList.toggle('hot', game.alertTicks > 0);
    this.timeEl.textContent = `${realSeconds(game.tick, tickHz).toFixed(1)} s`;
    this.begin.hidden = game.started;

    const sprintLeft = realSeconds(game.sprintTicks, tickHz);
    this.sprint.hidden = sprintLeft <= 0;
    this.sprintLabel.textContent = `SPRINT ${sprintLeft.toFixed(1)} s`;
    this.sprintBar.style.width = `${Math.min(1, sprintLeft / 12) * 100}%`;
    this.sprint.classList.toggle('on', game.sprinting);

    const lo = game.loadout;
    this.ammo.hidden = !lo.stunGun;
    this.ammo.textContent = `STUN ${lo.bullets}`;

    this.crosshair.classList.toggle('locked', !!f.lock?.ok);
    this.crosshair.classList.toggle('nolock', !!f.lock && !f.lock.ok && f.lock.id != null);
  }
}
