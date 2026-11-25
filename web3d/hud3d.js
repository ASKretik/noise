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
/**
 * The minimap's own board: a window this many cells square around you, drawn by a second
 * 2D renderer offset to it (N8.4). The minimap is a circle MINI_CELLS across, which fits
 * in this square at any rotation. Copying the whole district board into the minimap every
 * frame cost 7 ms at district 100 -- more than the entire 3D world.
 */
const MINI_WIN = MINI_CELLS + 3;

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
    this.miniCanvas = document.createElement('canvas');
    this.miniBoard = new Renderer(this.miniCanvas);
    this.miniBoard.tile = MINI_TILE;
    this.miniBoard.dpr = 1;

    this.overlay = el('canvas', 'h3-overlay', root);       // waypoints + threat arcs
    this.octx = this.overlay.getContext('2d');

    this.crosshair = el('div', 'h3-crosshair', root, '<i></i><b class="h3-lock"></b>');
    // N6.1: the inventory wheel (hold Space) and what is in your hand
    this.wheel = el('div', 'h3-wheel', root);
    this.wheel.hidden = true;
    this.inHand = el('div', 'h3-inhand', root);
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

    this.map = el('div', 'h3-map', root, '<canvas></canvas><p>TACTICAL MAP · release Tab / M to close · wheel to zoom · drag to pan · H heatmap · V visited · I alien targets <b class="h3-map-zoom"></b></p>');
    this.mapCanvas = this.map.querySelector('canvas');
    this.mapZoomEl = this.map.querySelector('.h3-map-zoom');
    this.map.hidden = true;
    /** Zoom (1 = the whole district fits), the view's centre in cells, and its scale. */
    this.mapView = { zoom: 1, max: 1, cx: null, cy: null, dx: null, dy: null, recentre: true, cellPx: 1 };

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
    this.miniBoard.setDistrict(level.level);
    this.miniBoard.tile = this.tile;
    this.miniCanvas.width = this.miniCanvas.height = MINI_WIN * this.tile;
    this.miniBoard._mapKey = null;
    this.districtEl.textContent = `DISTRICT ${level.level}`;
    this.tierEl.textContent = `${String(tier).toUpperCase()} · ${this.board.theme.name}`;
    this.dispatchEl.classList.remove('on');
  }

  toggleLayer(what) {
    this.layers[what] = !this.layers[what];
    for (const b of [this.board, this.miniBoard]) {
      b.showHeatmap = this.layers.heatmap;
      b.showVisited = this.layers.visited;
      b.showIntercepts = this.layers.intercepts;
    }
    return this.layers[what];
  }

  /** Show or hide the Tab map. It opens centred on you, at the zoom it was left at. */
  /**
   * N6.1: open or close the inventory wheel. slots: [{ id, label, count, ok, note }],
   * laid round the circle clockwise from the top; `current` is the one in hand.
   */
  showWheel(open, slots = [], current = null) {
    this.wheel.hidden = !open;
    if (!open) return;
    const n = slots.length, R = 128;
    this.wheel.innerHTML = '<div class="disc"></div><div class="info"></div><div class="ptr"></div>';
    this.wheelSlots = slots.map((sl, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const d = el('div', `slot${sl.ok ? '' : ' off'}${sl.id === current ? ' cur' : ''}`, this.wheel, `<b>${sl.label}</b><span>${sl.count}</span>`);
      d.style.left = `${Math.cos(a) * R}px`;
      d.style.top = `${Math.sin(a) * R}px`;
      return d;
    });
    this.wheelInfo = this.wheel.querySelector('.info');
    this.wheelPtr = this.wheel.querySelector('.ptr');
    this.wheelData = slots;
    this.setWheel(-1, 0, 0);
  }

  /** The highlighted slot (-1: none) and the pointer's offset from the middle, in px. */
  setWheel(sel, x, y) {
    if (!this.wheelSlots) return;
    this.wheelSlots.forEach((d, i) => d.classList.toggle('sel', i === sel));
    const sl = this.wheelData[sel];
    this.wheelInfo.textContent = sl ? (sl.note || '') : 'Move the mouse towards an item, let go of Space to take it.';
    this.wheelPtr.style.transform = `translate(${x * 0.55}px, ${y * 0.55}px)`;
  }

  /** The line under the crosshair: what you are holding and how many are left. */
  setInHand(text) {
    if (this.inHand.textContent !== text) this.inHand.textContent = text;
  }

  showMap(on) {
    if (on && this.map.hidden) this.mapView.recentre = true;
    this.map.hidden = !on;
  }

  /** Wheel over the open map: in or out by about 15 % a notch. */
  zoomMap(deltaY) {
    const v = this.mapView;
    v.zoom = Math.min(v.max, Math.max(1, v.zoom * Math.exp(-deltaY * 0.0015)));
  }

  /** Drag over the open map: the map follows the mouse. */
  panMap(dx, dy) {
    const v = this.mapView;
    if (v.dx == null || v.zoom <= 1) return;       // the whole district is already in view
    v.cx = v.dx - dx / v.cellPx;
    v.cy = v.dy - dy / v.cellPx;
  }

  /** A line of intercepted chatter, subtitle style. */
  dispatch(text, src = 'template') {
    if (!text) return;
    this.dispatchEl.innerHTML = `<b>INTERCEPTED${src === 'model' ? '' : ' · reconstructed'}</b>${text.replace(/[<>&]/g, '')}`;
    this.dispatchEl.classList.add('on');
    clearTimeout(this.dispatchTimer);
    this.dispatchTimer = setTimeout(() => this.dispatchEl.classList.remove('on'), 9000);
  }

  /** Templated dispatch from live predictor state. The model path never runs on this page. */
  narrate({ game, prediction, dossier, chain, lastSpawn, level, profile, mode, habits }) {
    const state = buildState({ game, prediction, dossier, chain, lastSpawn, level, profile, mode });
    // N8.5: once the file holds a habit the aliens act on, the chatter says which.
    const h = habits?.strongest?.();
    const note = h ? ` File note: subject ${h.hint}. Units, ${h.tactic}.` : '';
    this.dispatch(templated(state) + note, 'template');
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

    // ---- the 2D boards, offscreen: the minimap's window every frame, the whole district
    // only while the Tab map is open
    const T = this.tile;
    const wx = Math.floor(body.x - MINI_WIN / 2), wy = Math.floor(body.y - MINI_WIN / 2);
    const boardFrame = { game, level, alpha: 1, prev: null, prediction: f.prediction?.dist ?? null };
    this.miniBoard.ctx.setTransform(1, 0, 0, 1, -wx * T, -wy * T);
    this.miniBoard.draw(boardFrame);
    if (!this.map.hidden) this.board.draw(boardFrame);

    // ---- minimap: centred on you, rotated so forward is up
    const m = this.mctx, S = this.mini.width;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, S, S);
    m.save();
    m.beginPath(); m.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); m.clip();
    m.fillStyle = '#07080c'; m.fillRect(0, 0, S, S);
    const scale = S / (MINI_CELLS * T);
    m.translate(S / 2, S / 2);
    m.rotate(yaw);
    m.scale(scale, scale);
    m.translate((wx - body.x) * T, (wy - body.y) * T);
    m.drawImage(this.miniCanvas, 0, 0);
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

    // ---- tactical map: zoom with the wheel, pan by dragging, opens centred on you (N8.3)
    if (!this.map.hidden) {
      const mc = this.mapCanvas;
      const maxW = Math.min(W * 0.9, 1100), maxH = H * 0.78;
      const k = Math.min(maxW / this.boardCanvas.width, maxH / this.boardCanvas.height);
      const cw = Math.round(this.boardCanvas.width * k), ch = Math.round(this.boardCanvas.height * k);
      if (mc.width !== cw * dpr) { mc.width = cw * dpr; mc.height = ch * dpr; mc.style.width = `${cw}px`; mc.style.height = `${ch}px`; }
      const c = mc.getContext('2d');
      const v = this.mapView;
      v.max = Math.max(1, 2.5 / k);                       // no closer than 2.5 css px per board px
      v.zoom = Math.min(v.max, Math.max(1, v.zoom));
      const s = k * v.zoom, cellPx = T * s;                 // css px per board px, per cell
      // (cx, cy) is where you asked the view to be -- you, on opening, then wherever you
      // dragged it; (dx, dy) is that, kept inside the map. Zooming in from the full view
      // therefore closes in on you, not on the middle of the district.
      if (v.recentre || v.cx == null) { v.cx = body.x; v.cy = body.y; v.recentre = false; }
      const halfW = cw / 2 / cellPx, halfH = ch / 2 / cellPx;
      v.dx = halfW * 2 >= game.map.w ? game.map.w / 2 : Math.min(game.map.w - halfW, Math.max(halfW, v.cx));
      v.dy = halfH * 2 >= game.map.h ? game.map.h / 2 : Math.min(game.map.h - halfH, Math.max(halfH, v.cy));
      v.cellPx = cellPx;
      const ox = cw / 2 - v.dx * cellPx, oy = ch / 2 - v.dy * cellPx;
      const at = (x, y) => [ox + x * cellPx, oy + y * cellPx];   // cell coords -> css px
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = '#07080c'; c.fillRect(0, 0, cw, ch);
      c.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
      c.drawImage(this.boardCanvas, 0, 0);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Place and avenue names, where they fit: city maps only.
      const label = (text, x, y, alpha, size = 10, angle = 0) => {
        c.save(); c.translate(x, y); if (angle) c.rotate(angle);
        c.font = `600 ${size}px ui-monospace, Menlo, monospace`; c.textAlign = 'center';
        c.lineWidth = 3; c.strokeStyle = `rgba(5,7,10,${0.8 * alpha})`; c.fillStyle = `rgba(226,232,244,${alpha})`;
        c.strokeText(text, 0, 3.5); c.fillText(text, 0, 3.5); c.restore();
      };
      if (level.places) {
        c.font = '600 10px ui-monospace, Menlo, monospace';
        for (const pl of level.places) {
          if (!pl.centre) continue;
          const wPx = pl.w * cellPx, text = pl.name.toUpperCase();
          if (wPx < c.measureText(text).width + 6 || pl.h * cellPx < 14) continue;
          const [x, y] = at(pl.x + pl.w / 2, pl.y + pl.h / 2);
          if (x < -40 || y < -10 || x > cw + 40 || y > ch + 10) continue;
          label(text, x, y, 0.62);
        }
        if (v.zoom >= 1.5 && level.avenues) {
          for (const av of level.avenues) {
            const text = av.name.toUpperCase();
            if (av.axis === 'x') {
              const [x] = at(av.at + 0.5, 0);
              if (x > 0 && x < cw) label(text, x, ch * 0.5, 0.5, 9, -Math.PI / 2);
            } else {
              const [, y] = at(0, av.at + 0.5);
              if (y > 0 && y < ch) label(text, cw * 0.5, y, 0.5, 9);
            }
          }
        }
      }

      // Beacons over the keys and the portal, at a fixed screen size: on a city map the
      // board's own key icons shrink to a few pixels and are easy to miss. Rings pulse out
      // about once a second (well under the 3-a-second flash limit) and the marker breathes.
      // Zoomed in, one that is off the map's edge is pinned to the edge so it is never lost.
      const now = performance.now() / 1000;
      const labels = [];                                   // drawn labels, so pinned ones do not overprint
      const beacon = (cx, cy, color, text, phase0) => {
        let [px, py] = at(cx + 0.5, cy + 0.5);
        const off = px < 12 || py < 12 || px > cw - 12 || py > ch - 12;
        px = Math.min(cw - 12, Math.max(12, px)); py = Math.min(ch - 12, Math.max(12, py));
        if (!off) {
          for (const o of [0, 0.5]) {
            const ph = (now / 1.2 + phase0 + o) % 1;
            c.globalAlpha = (1 - ph) * 0.9;
            c.strokeStyle = color; c.lineWidth = 2.5;
            c.beginPath(); c.arc(px, py, 6 + 22 * ph, 0, Math.PI * 2); c.stroke();
          }
        }
        c.globalAlpha = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin((now + phase0) * Math.PI * 2.4));
        c.fillStyle = color; c.strokeStyle = '#05070a'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(px, py - 8); c.lineTo(px + 6, py); c.lineTo(px, py + 8); c.lineTo(px - 6, py); c.closePath();
        c.stroke(); c.fill();
        c.globalAlpha = 1;
        c.font = '600 11px ui-monospace, Menlo, monospace';
        c.lineWidth = 3; c.strokeStyle = 'rgba(5,7,10,0.85)'; c.fillStyle = color;
        const tw = c.measureText(text).width;
        const right = px + 11 + tw < cw;                   // flip the label at the right edge
        c.textAlign = right ? 'left' : 'right';
        const lx = right ? px + 11 : px - 11;
        let ly = py + 4;
        const x0 = right ? lx : lx - tw;
        for (let guard = 0; guard < 6 && labels.some((q) => Math.abs(q.y - ly) < 13 && x0 < q.x1 && x0 + tw > q.x0); guard++) {
          ly += py > ch / 2 ? -13 : 13;
        }
        labels.push({ x0, x1: x0 + tw, y: ly });
        c.strokeText(text, lx, ly); c.fillText(text, lx, ly);
        c.textAlign = 'left';
      };
      const metres = (x, y) => `${Math.round(Math.hypot(x + 0.5 - body.x, y + 0.5 - body.y) * cellM)} m`;
      game.caches.forEach((q, i) => { if (!q.collected) beacon(q.x, q.y, COLORS.key, metres(q.x, q.y), i * 0.17); });
      if (game.portalRevealed) beacon(game.portal.x, game.portal.y, COLORS.portal, `PORTAL ${metres(game.portal.x, game.portal.y)}`, 0);

      // you: the same arrow at a fixed screen size, so it does not shrink with the map
      const [yx, yy] = at(body.x, body.y);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.translate(yx, yy);
      c.rotate(-yaw);
      c.fillStyle = COLORS.beacon; c.strokeStyle = '#041014'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -11); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.stroke(); c.fill();
      this.mapZoomEl.textContent = v.max > 1.01 ? `ZOOM ×${v.zoom.toFixed(1)}` : '';
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
    // Build 44, at the user's request: with `edgeMarkers`, a key or the portal that is off
    // the screen -- behind you, or beside you -- stays on it, held at the left or right edge
    // on the side you would turn to face it, with an arrow and its distance.
    const v = new THREE.Vector3();
    const camF = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), camR = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const way = (x, y, h, color, label) => {
      const wx = (x + 0.5) * cellM, wz = (y + 0.5) * cellM;
      v.set(wx, h, wz).project(camera);
      let sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H;
      const behind = v.z > 1, off = behind || sx < 0 || sx > W;
      if (f.edgeMarkers && off) {
        const rx = wx - camera.position.x, rz = wz - camera.position.z;
        const side = rx * camR.x + rz * camR.z >= 0 ? 1 : -1;   // turn right, or left
        sx = side > 0 ? W - 30 : 30;
        sy = behind ? H * 0.5 : Math.max(70, Math.min(H - 90, sy));
        o.save();
        o.translate(sx, sy);
        o.fillStyle = color; o.strokeStyle = 'rgba(0,0,0,0.75)'; o.lineWidth = 2;
        o.beginPath(); o.moveTo(0, -9); o.lineTo(8, 0); o.lineTo(0, 9); o.lineTo(-8, 0); o.closePath(); o.stroke(); o.fill();
        // the arrow: pointing off the edge, the way to turn
        o.beginPath(); o.moveTo(side * 14, -7); o.lineTo(side * 22, 0); o.lineTo(side * 14, 7); o.closePath(); o.stroke(); o.fill();
        o.font = '600 11px ui-monospace, Menlo, monospace'; o.textAlign = side > 0 ? 'right' : 'left';
        o.lineWidth = 3; o.strokeText(label, side * -2, 24); o.fillText(label, side * -2, 24);
        o.restore();
        return;
      }
      if (v.z > 1) return;
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
    // The run's time limit is a backstop (six times par, never under six minutes), so it
    // stays out of sight until its last minute, then counts down in red.
    const left = realSeconds(Math.max(0, game.maxTicks - game.tick), tickHz);
    if (game.maxTicks && left <= 60) {
      this.timeEl.textContent = `TIME ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} LEFT`;
      this.timeEl.classList.add('h3-time-low');
    } else {
      this.timeEl.textContent = `${realSeconds(game.tick, tickHz).toFixed(1)} s`;
      this.timeEl.classList.remove('h3-time-low');
    }
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
