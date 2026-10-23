// web/render.js -- canvas rendering. Browser-only leaf, reads the sim and writes pixels.
//
// Still no art assets: everything here is a path, a rectangle or an arc, drawn from the
// tile grid. What it does spend effort on is making the RULES visible, because a rule the
// player cannot see is indistinguishable from the game cheating:
//
//   - the detection ring around each alien is drawn at its EFFECTIVE radius, so stepping
//     into water visibly halves every circle on screen at once;
//   - the portal is not drawn at all until the last key is collected, because it does not
//     exist until then;
//   - rubble is drawn as broken masonry the aliens are seen to walk through, which is the
//     only way "they can cross it and you cannot" reads as a rule rather than a bug.
//
// Rendering is decoupled from the 8 Hz simulation: positions are interpolated between the
// previous and current tick so movement reads as smooth without the sim ever running at
// frame rate.

import { TILE, DIRS } from '../sim/grid.js';
import { themeFor } from './themes.js';

/**
 * Entity colours, identical in every belt.
 *
 * These are the game's vocabulary: gold means a key, the four coin colours mean 1/2/5/10,
 * red means alien. Repainting them per belt would force the player to relearn the board
 * every ten districts. Only the TERRAIN changes, and it comes from web/themes.js.
 */
export const COLORS = {
  bg: '#0b0906',
  groundSpeck: 'rgba(0,0,0,0.42)',
  waterGlint: 'rgba(170,232,255,0.32)',
  buildingCrack: 'rgba(0,0,0,0.6)',
  key: '#ffc93b',
  bolt: '#ffe66d',
  /** Coin colours by denomination. Worth is readable without counting. */
  coin1: '#c8803c',
  coin2: '#cfd8e3',
  coin5: '#ffc93b',
  coin10: '#c87bff',
  safeFill: 'rgba(5,5,7,0.80)',
  safeEdge: 'rgba(180,196,214,0.38)',
  stunned: '#6d6a74',
  spark: '#9fd8ff',
  human: '#f2f6ff',
  humanHidden: '#8fd9ff',
  humanJacket: '#5c6a86',
  humanLimb: '#44506b',
  humanHair: '#23262f',
  alien: '#ff4d5e',
  alienCalm: '#c9414f',
  alienEye: '#ffe9ec',
  ring: 'rgba(255,77,94,0.09)',
  ringEdge: 'rgba(255,77,94,0.38)',
  ringHidden: 'rgba(143,217,255,0.45)',
  portal: '#19e0c8',
  heat: '255,77,94',
  visited: 'rgba(143,217,255,0.05)',
  intercept: 'rgba(255,201,59,0.45)',
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
    this.frame = 0;
    /** Terrain palette for the belt of ten this district belongs to. */
    this.theme = themeFor(1);
  }

  /** Belt palette. Changing it invalidates the cached terrain layer. */
  setDistrict(level) {
    const next = themeFor(level);
    if (next !== this.theme) {
      this.theme = next;
      this._mapKey = null;
    }
    return this.theme;
  }

  /** Size the backing store to the device pixel ratio and the map's aspect. */
  resize(map) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Measure .board, not .canvas-wrap: the wrapper is inline-block and sized BY the
    // canvas, so measuring it would make the canvas size depend on itself.
    const host = this.canvas.closest('.board') || this.canvas.parentElement;
    const availW = host && host.clientWidth > 0 ? host.clientWidth : 832;

    // Height from the REAL visible viewport, not innerHeight minus a guess.
    //
    // On a phone `innerHeight` includes the collapsible address bar, so a layout sized
    // against it is taller than what you can actually see and the board slides off the
    // bottom. visualViewport reports what is genuinely on screen. The board's own top
    // offset and the status bar below it are then measured rather than assumed, because
    // the top bar wraps to a different number of rows at different widths.
    const vh = window.visualViewport?.height || window.innerHeight || 800;
    let availH = 260;
    try {
      const rect = host.getBoundingClientRect();
      const status = document.querySelector('.statusbar');
      const statusH = status ? status.getBoundingClientRect().height + 10 : 0;
      availH = Math.max(160, vh - rect.top - statusH - 12);
    } catch {
      availH = Math.max(260, vh - 210);
    }
    // Integer tile size keeps edges crisp; at least 12px so phones stay playable.
    const tile = Math.max(12, Math.floor(Math.min(availW / map.w, availH / map.h, 34)));
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
   * The terrain never changes during a run, so it is drawn once into an offscreen canvas
   * and blitted. At 8 Hz this hardly matters; on a phone at 60 fps it does.
   */
  _staticLayer(map, level) {
    const key = `${level.seed}:${level.level}:${this.tile}:${this.theme.name}`;
    if (this._mapKey === key) return this._mapCache;
    const t = this.tile;
    const off = document.createElement('canvas');
    off.width = map.w * t;
    off.height = map.h * t;
    const c = off.getContext('2d');
    const T = this.theme.terrain;
    c.fillStyle = T.wall;
    c.fillRect(0, 0, off.width, off.height);

    // A cheap deterministic hash per cell, so speckle and cracks stay put between frames.
    const noise = (x, y) => {
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return n - Math.floor(n);
    };

    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const tile = map.tiles[y * map.w + x];
        const px = x * t, py = y * t;

        if (tile === TILE.WALL) {
          c.fillStyle = T.wall;
          c.fillRect(px, py, t, t);
          continue;
        }

        // --- ground: lightly flecked so it does not read as flat paint ---
        c.fillStyle = (x + y) % 2 === 0 ? T.ground : T.groundAlt;
        c.fillRect(px, py, t, t);
        const n = noise(x, y);
        if (n > 0.62) {
          c.fillStyle = COLORS.groundSpeck;
          const sx = px + 3 + n * (t - 7);
          const sy = py + 3 + noise(y, x) * (t - 7);
          c.fillRect(Math.round(sx), Math.round(sy), 2, 2);
        }

        if (tile === TILE.COVER) {
          // --- water: a shallow pool with a lighter rim and two glints ---
          c.fillStyle = T.water;
          c.beginPath();
          c.ellipse(px + t / 2, py + t / 2, t * 0.46, t * 0.40, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = T.waterDeep;
          c.beginPath();
          c.ellipse(px + t / 2, py + t / 2 + t * 0.05, t * 0.33, t * 0.26, 0, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = COLORS.waterGlint;
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(px + t * 0.26, py + t * 0.38);
          c.lineTo(px + t * 0.46, py + t * 0.38);
          c.moveTo(px + t * 0.55, py + t * 0.56);
          c.lineTo(px + t * 0.70, py + t * 0.56);
          c.stroke();
        }

        if (tile === TILE.SAFE) {
          // A translucent black box. Deliberately drawn as a hole rather than an object:
          // it is the one place on the map nothing can see into.
          c.fillStyle = COLORS.safeFill;
          c.fillRect(px, py, t, t);
          // Edged in the belt's accent so it still belongs to this district, but the
          // fill stays black everywhere: the box reads as a hole, and a hole has no hue.
          c.strokeStyle = this.theme.accent;
          c.lineWidth = 1;
          c.setLineDash([3, 3]);
          c.strokeRect(px + 0.5, py + 0.5, t - 1, t - 1);
          c.setLineDash([]);
        }

        if (tile === TILE.BUILDING) {
          // --- broken building: a slab with a chipped top edge and a crack ---
          c.fillStyle = T.building;
          c.fillRect(px + 1, py + 1, t - 2, t - 2);
          c.fillStyle = T.buildingTop;
          const chip = Math.round(n * 4);
          c.fillRect(px + 1, py + 1, t - 2, 3);
          c.fillStyle = T.building;
          c.fillRect(px + 1 + chip, py + 1, 3, 3);
          c.fillRect(px + t - 6 - chip, py + 1, 3, 3);
          c.strokeStyle = COLORS.buildingCrack;
          c.lineWidth = 1.5;
          c.beginPath();
          const cx = px + t * (0.3 + n * 0.4);
          c.moveTo(cx, py + 3);
          c.lineTo(cx - 2 + n * 4, py + t * 0.5);
          c.lineTo(cx + 1, py + t - 3);
          c.stroke();
          c.strokeStyle = 'rgba(0,0,0,0.5)';
          c.lineWidth = 1;
          c.strokeRect(px + 1.5, py + 1.5, t - 3, t - 3);
        }
      }
    }

    // Wall edges: a one-pixel lip where ground meets wall, which is what makes the layout
    // readable at a glance instead of a field of flat blocks.
    c.strokeStyle = T.wallEdge;
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

  // ------------------------------------------------------------------ entity shapes

  /** A key: round bow, straight shaft, two teeth. */
  _drawKey(ctx, cx, cy, r, pulse) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 5);
    ctx.fillStyle = COLORS.key;
    ctx.shadowColor = COLORS.key;
    ctx.shadowBlur = 6 + pulse * 5;
    ctx.beginPath();
    ctx.arc(0, -r * 0.45, r * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillRect(-r * 0.12, -r * 0.3, r * 0.24, r * 1.25);
    ctx.fillRect(-r * 0.12, r * 0.55, r * 0.52, r * 0.2);
    ctx.fillRect(-r * 0.12, r * 0.9, r * 0.36, r * 0.18);
    ctx.restore();
    // Punch the bow's hole back out so it reads as a key at 12px.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 5);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(0, -r * 0.45, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** A coin: a disc with a rim and its value stamped on it. Colour carries the worth. */
  _drawCoin(ctx, cx, cy, r, value, pulse) {
    const fill = value >= 10 ? COLORS.coin10 : value >= 5 ? COLORS.coin5 : value >= 2 ? COLORS.coin2 : COLORS.coin1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = fill;
    ctx.shadowColor = fill;
    ctx.shadowBlur = 4 + pulse * 3;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2);
    ctx.stroke();
    // The number only fits once tiles are reasonably large; colour carries it below that.
    if (r >= 6) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.font = `600 ${Math.round(r * 1.1)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(value), 0, 0.5);
    }
    ctx.restore();
  }

  /** A lightning bolt: the classic two-triangle zigzag. */
  _drawBolt(ctx, cx, cy, r, pulse) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = COLORS.bolt;
    ctx.shadowColor = COLORS.bolt;
    ctx.shadowBlur = 8 + pulse * 7;
    ctx.beginPath();
    ctx.moveTo(r * 0.22, -r);
    ctx.lineTo(-r * 0.46, r * 0.16);
    ctx.lineTo(-r * 0.04, r * 0.16);
    ctx.lineTo(-r * 0.24, r);
    ctx.lineTo(r * 0.5, -r * 0.2);
    ctx.lineTo(r * 0.06, -r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * The human. Head with hair and a face, shoulders, a jacket, swinging arms and
   * alternating legs, and it turns to face the way it is walking.
   *
   * Detail at a 20-to-26 pixel tile has to come from silhouette and two or three tones,
   * not from linework -- anything finer turns to mush. So: a dark hair cap and dark eyes
   * against the bright body give the head a readable front and back, a dimmer jacket
   * breaks the torso out of the limbs, and the limbs move. Facing is what sells it as a
   * person rather than a token: the eyes disappear when walking away from the camera.
   */
  _drawHuman(ctx, cx, cy, t, hidden, boosted, dir, moving, phase) {
    const s = t / 26;
    const body = hidden ? COLORS.humanHidden : COLORS.human;
    ctx.save();
    ctx.translate(cx, cy);

    if (boosted) { ctx.shadowColor = COLORS.bolt; ctx.shadowBlur = 14; }
    else if (!hidden) { ctx.shadowColor = body; ctx.shadowBlur = 7; }

    const swing = moving ? Math.sin(phase * 7) : 0;
    const facingUp = dir === 0;
    const facingSide = dir === 1 || dir === 3;
    const flip = dir === 3 ? -1 : 1;

    // ---- legs, behind everything ----
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS.humanLimb;
    const legSwing = swing * 2.0 * s;
    ctx.fillRect(-2.9 * s + (facingSide ? legSwing : 0), 3.6 * s, 2.1 * s, 4.8 * s + (facingSide ? 0 : legSwing));
    ctx.fillRect(0.8 * s - (facingSide ? legSwing : 0), 3.6 * s, 2.1 * s, 4.8 * s - (facingSide ? 0 : legSwing));

    // ---- arms ----
    ctx.fillStyle = body;
    const armSwing = swing * 2.4 * s;
    ctx.save();
    ctx.translate(-4.1 * s, -0.6 * s);
    ctx.rotate(armSwing * 0.14);
    ctx.fillRect(-0.9 * s, 0, 1.8 * s, 5.0 * s);
    ctx.restore();
    ctx.save();
    ctx.translate(4.1 * s, -0.6 * s);
    ctx.rotate(-armSwing * 0.14);
    ctx.fillRect(-0.9 * s, 0, 1.8 * s, 5.0 * s);
    ctx.restore();

    // ---- torso: a jacket, so the trunk is not the same block as the limbs ----
    ctx.fillStyle = COLORS.humanJacket;
    ctx.beginPath();
    ctx.moveTo(-3.8 * s, -2.4 * s);
    ctx.lineTo(3.8 * s, -2.4 * s);
    ctx.lineTo(3.0 * s, 4.2 * s);
    ctx.lineTo(-3.0 * s, 4.2 * s);
    ctx.closePath();
    ctx.fill();
    // collar
    ctx.fillStyle = body;
    ctx.fillRect(-3.8 * s, -2.4 * s, 7.6 * s, 1.1 * s);
    // a seam down the front, only when we can see the front
    if (!facingUp) {
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(-0.35 * s, -1.3 * s, 0.7 * s, 5.5 * s);
    }

    // ---- head ----
    ctx.fillStyle = body;
    if (boosted) { ctx.shadowColor = COLORS.bolt; ctx.shadowBlur = 10; }
    ctx.beginPath();
    ctx.arc(0, -6.4 * s, 3.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Hair: a cap over the crown only. The first version sat low enough to read as
    // sunglasses -- it has to leave most of the face showing or the eyes have nowhere
    // to be.
    ctx.fillStyle = COLORS.humanHair;
    ctx.beginPath();
    ctx.arc(facingSide ? -0.45 * s * flip : 0, -7.5 * s, 3.5 * s, Math.PI * 0.98, Math.PI * 2.02);
    ctx.fill();
    if (facingUp) {
      // walking away: the back of the head is all hair
      ctx.beginPath();
      ctx.arc(0, -6.4 * s, 3.5 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    // eyes, only when the face is toward the camera
    if (!facingUp) {
      ctx.fillStyle = COLORS.humanHair;
      if (facingSide) {
        ctx.beginPath();
        ctx.arc(1.45 * s * flip, -5.9 * s, 0.66 * s, 0, Math.PI * 2);
        ctx.fill();
      } else {
        for (const ex of [-1.35, 1.35]) {
          ctx.beginPath();
          ctx.arc(ex * s, -5.9 * s, 0.6 * s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  /** An alien: bulbous body, three eyes, trailing tendrils. Not a circle. */
  _drawAlien(ctx, cx, cy, t, hunting, phase, stunned = false) {
    const s = t / 26;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = stunned ? COLORS.stunned : (hunting ? COLORS.alien : COLORS.alienCalm);
    if (hunting && !stunned) { ctx.shadowColor = COLORS.alien; ctx.shadowBlur = 11; }

    ctx.beginPath();                                   // tendrils
    for (let i = -1; i <= 1; i++) {
      const wobble = Math.sin(phase * 2 + i) * 1.3 * s;
      ctx.moveTo(i * 3.1 * s, 2.0 * s);
      ctx.quadraticCurveTo(i * 3.1 * s + wobble, 5.6 * s, i * 3.1 * s - wobble, 8.2 * s);
    }
    ctx.lineWidth = 1.7 * s;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.stroke();

    ctx.beginPath();                                   // body
    ctx.ellipse(0, -0.9 * s, 5.2 * s, 5.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (stunned) {
      // Eyes shut, and a couple of sparks arcing off it.
      ctx.strokeStyle = '#2b2930';
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(-3.3 * s, -1.6 * s); ctx.lineTo(-1.1 * s, -1.6 * s);
      ctx.moveTo(1.1 * s, -1.6 * s); ctx.lineTo(3.3 * s, -1.6 * s);
      ctx.stroke();
      ctx.strokeStyle = COLORS.spark;
      ctx.lineWidth = 1.4 * s;
      const w = Math.sin(phase * 7) * 1.6 * s;
      ctx.beginPath();
      ctx.moveTo(-6 * s, -5 * s); ctx.lineTo(-4 * s + w, -7 * s); ctx.lineTo(-5 * s, -8.6 * s);
      ctx.moveTo(6 * s, -4 * s); ctx.lineTo(4.2 * s - w, -6.4 * s); ctx.lineTo(5.4 * s, -8 * s);
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.fillStyle = COLORS.alienEye;                   // eyes
    for (const [ex, ey, er] of [[-2.2, -1.6, 1.35], [2.2, -1.6, 1.35], [0, 1.3, 1.0]]) {
      ctx.beginPath();
      ctx.arc(ex * s, ey * s, er * s, 0, Math.PI * 2);
      ctx.fill();
    }
    if (hunting) {
      ctx.fillStyle = '#2a0309';
      for (const [ex, ey] of [[-2.2, -1.6], [2.2, -1.6]]) {
        ctx.beginPath();
        ctx.arc(ex * s, ey * s, 0.62 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** The portal: a rotating double ring. Only ever drawn once it exists. */
  _drawPortal(ctx, cx, cy, t, phase) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = COLORS.portal;
    ctx.shadowColor = COLORS.portal;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 2; i++) {
      const r = t * (0.26 + i * 0.13);
      const spin = phase * (i ? -1.4 : 1.9);
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.74, spin, 0.5, Math.PI * 1.7);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(25,224,200,0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, t * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------------ the frame

  /**
   * @param {object} o
   * @param {import('../sim/game.js').Game} o.game
   * @param {object} o.level
   * @param {number} o.alpha        interpolation in [0,1] between prev and current tick
   * @param {object} o.prev         previous-tick positions
   * @param {Float64Array} [o.prediction]  per-district probabilities for the heatmap
   */
  draw({ game, level, alpha = 1, prev = null, prediction = null }) {
    const ctx = this.ctx;
    const t = this.tile;
    const map = game.map;
    this.frame++;
    const phase = this.frame / 22;
    const pulse = 0.5 + 0.5 * Math.sin(this.frame / 14);

    ctx.clearRect(0, 0, map.w * t, map.h * t);
    ctx.drawImage(this._staticLayer(map, level), 0, 0);

    // --- prediction heatmap: what the system thinks you are about to do ---
    if (this.showHeatmap && prediction) {
      let max = 0;
      for (const p of prediction) if (p > max) max = p;
      if (max > 0) {
        for (let r = 0; r < game.regions.count; r++) {
          const a = (prediction[r] / max) * 0.4;
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

    // --- the portal, if it exists yet ---
    if (game.portalRevealed) {
      this._drawPortal(ctx, game.portal.x * t + t / 2, game.portal.y * t + t / 2, t, phase);
    }

    // --- keys and bolts ---
    for (const c of game.caches) {
      if (c.collected) continue;
      this._drawKey(ctx, c.x * t + t / 2, c.y * t + t / 2, Math.max(5, t * 0.30), pulse);
    }
    for (const b of game.bolts) {
      if (b.taken) continue;
      this._drawBolt(ctx, b.x * t + t / 2, b.y * t + t / 2, Math.max(4, t * 0.24), pulse);
    }
    for (const c of game.coins) {
      if (c.taken) continue;
      this._drawCoin(ctx, c.x * t + t / 2, c.y * t + t / 2, Math.max(3.5, t * 0.21), c.value, pulse);
    }

    // --- aliens, each ringed at the radius that applies RIGHT NOW ---
    // Drawing the effective radius rather than the nominal one is what makes the water
    // rule legible: step into a pool and every ring on screen visibly contracts.
    const hidden = game.onCover;
    const radius = game.effectiveRadius * t;
    for (const p of game.patrols) {
      const pp = prev?.patrols?.[p.id];
      const px = (pp ? pp.x + (p.x - pp.x) * alpha : p.x) * t + t / 2;
      const py = (pp ? pp.y + (p.y - pp.y) * alpha : p.y) * t + t / 2;
      const stunned = (p.stunnedUntil || 0) > game.tick;
      const hunting = !stunned && (p.mode === 'hunt' || p.mode === 'cutoff');

      // A stunned alien sees nothing, so it is drawn without a detection ring at all --
      // the clearest possible signal that the charge did something.
      if (!stunned) {
        ctx.fillStyle = COLORS.ring;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hidden ? COLORS.ringHidden : COLORS.ringEdge;
        ctx.lineWidth = hunting ? 1.6 : 1;
        ctx.setLineDash(hunting ? [] : [3, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (this.showIntercepts && p.target && p.mode !== 'hunt') {
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

      this._drawAlien(ctx, px, py, t, hunting, phase + p.id, stunned);
      if (stunned) {
        const left = ((p.stunnedUntil - game.tick) / (game.params.stunTicks || 40));
        ctx.strokeStyle = COLORS.spark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, t * 0.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
        ctx.stroke();
      }
    }

    // --- the human ---
    const pl = game.player;
    const prevP = prev?.player;
    const plx = (prevP ? prevP.x + (pl.x - prevP.x) * alpha : pl.x) * t + t / 2;
    const ply = (prevP ? prevP.y + (pl.y - prevP.y) * alpha : pl.y) * t + t / 2;

    if (game.boosted) {
      // Speed trail, so the three seconds are felt rather than read off the HUD.
      ctx.strokeStyle = `rgba(255,230,109,${(0.25 + 0.2 * pulse).toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(plx, ply, t * 0.46, phase % (Math.PI * 2), (phase % (Math.PI * 2)) + Math.PI * 1.2);
      ctx.stroke();
    }
    this._drawHuman(
      ctx, plx, ply, t, hidden, game.boosted,
      pl.dir, !!(prevP && (prevP.x !== pl.x || prevP.y !== pl.y)), phase,
    );

    if (hidden) {
      // The player's own halved ring, so the benefit is attached to them, not inferred.
      ctx.strokeStyle = COLORS.ringHidden;
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(plx, ply, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // --- standing in a black box: the whole board dims except you ---
    if (game.inSafeBox) {
      ctx.fillStyle = 'rgba(4,4,6,0.34)';
      ctx.fillRect(0, 0, map.w * t, map.h * t);
      ctx.strokeStyle = COLORS.safeEdge;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(plx - t * 0.7, ply - t * 0.7, t * 1.4, t * 1.4);
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
