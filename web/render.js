// web/render.js -- canvas rendering. Browser-only leaf, reads the sim and writes pixels.
//
// Coloured rectangles and circles, per the spec's no-art decision: every hour spent on
// sprites is an hour not spent on the thing this project is actually about. What the
// renderer does spend effort on is making the model legible -- the detection radius, the
// alert state, and the prediction heatmap are all visible, because a predictor the player
// cannot see is indistinguishable from a game that cheats.
//
// Rendering is decoupled from the 8 Hz simulation: positions are interpolated between the
// previous and current tick so movement reads as smooth without the sim ever running at
// frame rate.

import { TILE, DIRS } from '../sim/grid.js';

export const COLORS = {
  bg: '#07090c',
  floor: '#141a21',
  floorAlt: '#161d25',
  wall: '#05070a',
  wallEdge: '#1d2630',
  cover: '#1e3038',
  coverHatch: '#2b4654',
  dropLocked: '#2a3340',
  dropOpen: '#19e0c8',
  cache: '#ffb93b',
  player: '#eaf2ff',
  playerCover: '#8fd9ff',
  patrol: '#ff4d5e',
  patrolCalm: '#d8495a',
  radius: 'rgba(255,77,94,0.10)',
  radiusEdge: 'rgba(255,77,94,0.35)',
  heat: '255,77,94',
  visited: 'rgba(143,217,255,0.05)',
  grid: 'rgba(255,255,255,0.025)',
  intercept: 'rgba(255,185,59,0.5)',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tile = 26;
    this.showHeatmap = false;
    this.showVisited = false;
    this.showIntercepts = false;
    this.dpr = 1;
    this._mapCache = null;
    this._mapKey = null;
  }

  /** Size the backing store to the device pixel ratio and the map's aspect. */
  resize(map) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Measure .board, not .canvas-wrap: the wrapper is inline-block and sized BY the
    // canvas, so measuring it would make the canvas size depend on itself.
    const host = this.canvas.closest('.board') || this.canvas.parentElement;
    const availW = host && host.clientWidth > 0 ? host.clientWidth : 832;
    // Integer tile size keeps walls crisp; at least 12px so phones stay playable.
    const tile = Math.max(12, Math.floor(Math.min(availW / map.w, 34)));
    this.tile = tile;
    this.dpr = dpr;
    const w = tile * map.w;
    const h = tile * map.h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._mapKey = null;      // tile size changed, the static layer must be redrawn
  }

  /**
   * The map never changes during a run, so it is drawn once into an offscreen canvas and
   * blitted. At 8 Hz this hardly matters; on a phone at 60 fps it does.
   */
  _staticLayer(map, level) {
    const key = `${level.seed}:${level.level}:${this.tile}`;
    if (this._mapKey === key) return this._mapCache;
    const t = this.tile;
    const off = document.createElement('canvas');
    off.width = map.w * t;
    off.height = map.h * t;
    const c = off.getContext('2d');
    c.fillStyle = COLORS.bg;
    c.fillRect(0, 0, off.width, off.height);

    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const tile = map.tiles[y * map.w + x];
        const px = x * t, py = y * t;
        if (tile === TILE.WALL) {
          c.fillStyle = COLORS.wall;
          c.fillRect(px, py, t, t);
          continue;
        }
        c.fillStyle = (x + y) % 2 === 0 ? COLORS.floor : COLORS.floorAlt;
        c.fillRect(px, py, t, t);
        if (tile === TILE.COVER) {
          c.fillStyle = COLORS.cover;
          c.fillRect(px, py, t, t);
          // Hatching, so cover is distinguishable without relying on colour alone.
          c.strokeStyle = COLORS.coverHatch;
          c.lineWidth = 1;
          c.beginPath();
          for (let o = -t; o < t; o += 5) {
            c.moveTo(px + o, py + t);
            c.lineTo(px + o + t, py);
          }
          c.save();
          c.rect(px, py, t, t);
          c.clip();
          c.stroke();
          c.restore();
        }
      }
    }

    // Wall edges: a one-pixel lip where floor meets wall, which is what makes the layout
    // readable at a glance instead of a field of flat blocks.
    c.strokeStyle = COLORS.wallEdge;
    c.lineWidth = 1;
    c.beginPath();
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (map.tiles[y * map.w + x] === TILE.WALL) continue;
        for (let k = 0; k < 4; k++) {
          const nx = x + DIRS[k].dx, ny = y + DIRS[k].dy;
          const solid = nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || map.tiles[ny * map.w + nx] === TILE.WALL;
          if (!solid) continue;
          const px = x * t, py = y * t;
          if (k === 0) { c.moveTo(px, py + 0.5); c.lineTo(px + t, py + 0.5); }
          if (k === 1) { c.moveTo(px + t - 0.5, py); c.lineTo(px + t - 0.5, py + t); }
          if (k === 2) { c.moveTo(px, py + t - 0.5); c.lineTo(px + t, py + t - 0.5); }
          if (k === 3) { c.moveTo(px + 0.5, py); c.lineTo(px + 0.5, py + t); }
        }
      }
    }
    c.stroke();

    this._mapCache = off;
    this._mapKey = key;
    return off;
  }

  /**
   * @param {object} o
   * @param {import('../sim/game.js').Game} o.game
   * @param {object} o.level
   * @param {number} o.alpha        interpolation factor in [0,1] between prev and current tick
   * @param {object} o.prev         previous-tick positions
   * @param {Float64Array} [o.prediction]  per-region probabilities for the heatmap
   */
  draw({ game, level, alpha = 1, prev = null, prediction = null }) {
    const ctx = this.ctx;
    const t = this.tile;
    const map = game.map;
    ctx.clearRect(0, 0, map.w * t, map.h * t);
    ctx.drawImage(this._staticLayer(map, level), 0, 0);

    // --- prediction heatmap: what the system thinks you are about to do ---
    if (this.showHeatmap && prediction) {
      let max = 0;
      for (const p of prediction) if (p > max) max = p;
      if (max > 0) {
        for (let r = 0; r < game.regions.count; r++) {
          const a = (prediction[r] / max) * 0.42;
          if (a < 0.015) continue;
          ctx.fillStyle = `rgba(${COLORS.heat},${a.toFixed(3)})`;
          for (const i of game.regions.cells[r]) {
            const x = i % map.w, y = (i - x) / map.w;
            ctx.fillRect(x * t, y * t, t, t);
          }
        }
      }
    }

    // --- where you have already been: the histogram the score is taken over ---
    if (this.showVisited) {
      ctx.fillStyle = COLORS.visited;
      for (let i = 0; i < game.visitedCells.length; i++) {
        if (!game.visitedCells[i]) continue;
        const x = i % map.w, y = (i - x) / map.w;
        ctx.fillRect(x * t, y * t, t, t);
      }
    }

    // --- dead drop ---
    const unlocked = game.dropUnlocked;
    const dx = game.drop.x * t, dy = game.drop.y * t;
    ctx.save();
    ctx.strokeStyle = unlocked ? COLORS.dropOpen : COLORS.dropLocked;
    ctx.lineWidth = 2;
    if (unlocked) {
      ctx.shadowColor = COLORS.dropOpen;
      ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    ctx.rect(dx + 3, dy + 3, t - 6, t - 6);
    ctx.moveTo(dx + 3, dy + 3); ctx.lineTo(dx + t - 3, dy + t - 3);
    ctx.moveTo(dx + t - 3, dy + 3); ctx.lineTo(dx + 3, dy + t - 3);
    ctx.stroke();
    ctx.restore();

    // --- caches ---
    for (const c of game.caches) {
      if (c.collected) continue;
      ctx.save();
      ctx.fillStyle = COLORS.cache;
      ctx.shadowColor = COLORS.cache;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(c.x * t + t / 2, c.y * t + t / 2, Math.max(3, t * 0.22), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // --- patrols: body, heading, and the radius that actually matters ---
    for (const p of game.patrols) {
      const pp = prev?.patrols?.[p.id];
      const px = (pp ? pp.x + (p.x - pp.x) * alpha : p.x) * t + t / 2;
      const py = (pp ? pp.y + (p.y - pp.y) * alpha : p.y) * t + t / 2;
      const hunting = p.mode === 'hunt';

      const radius = game.params.detectRadius * t;
      ctx.fillStyle = COLORS.radius;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.radiusEdge;
      ctx.lineWidth = hunting ? 1.5 : 1;
      ctx.setLineDash(hunting ? [] : [3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (this.showIntercepts && p.target && !hunting) {
        ctx.strokeStyle = COLORS.intercept;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(p.target.x * t + t / 2, p.target.y * t + t / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COLORS.intercept;
        ctx.fillRect(p.target.x * t + t / 2 - 2, p.target.y * t + t / 2 - 2, 4, 4);
      }

      ctx.save();
      ctx.fillStyle = hunting ? COLORS.patrol : COLORS.patrolCalm;
      if (hunting) { ctx.shadowColor = COLORS.patrol; ctx.shadowBlur = 10; }
      ctx.beginPath();
      ctx.arc(px, py, Math.max(4, t * 0.3), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = COLORS.bg;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1.5, t * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }

    // --- player ---
    const pl = game.player;
    const prevP = prev?.player;
    const plx = (prevP ? prevP.x + (pl.x - prevP.x) * alpha : pl.x) * t;
    const ply = (prevP ? prevP.y + (pl.y - prevP.y) * alpha : pl.y) * t;
    const inCover = game.onCover;
    ctx.save();
    ctx.fillStyle = inCover ? COLORS.playerCover : COLORS.player;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = inCover ? 4 : 10;
    const pad = t * 0.22;
    ctx.fillRect(plx + pad, ply + pad, t - pad * 2, t - pad * 2);
    ctx.restore();
    if (inCover) {
      // A visible ring at the halved radius: the cover rule has to be legible to be used.
      ctx.strokeStyle = 'rgba(143,217,255,0.25)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(plx + t / 2, ply + t / 2, (game.params.detectRadius / 2) * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // --- alert vignette ---
    if (game.alertTicks > 0) {
      const a = 0.08 + 0.12 * (game.alertTicks / game.params.alertTicks);
      const g = ctx.createRadialGradient(
        (map.w * t) / 2, (map.h * t) / 2, Math.min(map.w, map.h) * t * 0.3,
        (map.w * t) / 2, (map.h * t) / 2, Math.max(map.w, map.h) * t * 0.6,
      );
      g.addColorStop(0, 'rgba(255,77,94,0)');
      g.addColorStop(1, `rgba(255,77,94,${a.toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, map.w * t, map.h * t);
    }
  }
}
