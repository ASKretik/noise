// sim3d/dispatch/habits.js -- what the 3D Dispatch learns about how you play. Pure.
//
// N8.5 (spec-3d-next.md): the user asked for the aliens to learn the player's behaviour
// -- "likes to hide, has trouble at the corners, gets lost pretty easily, stays at the
// same place looking at map" -- rather than which room they spend time in. Five habits,
// each measured once per run as a rate from the tick samples the sim already produces
// (sim/predictor/traits.js has the sample contract), plus whether the Tab map was open:
//
//   hide    under threat, how much of the time you are hidden: in a black box, or
//           standing still in water
//   corner  how much more often you stop near a wall corner than elsewhere
//   lost    walking away from the nearest key, retreading old ground, opening the map
//   map     standing still with the Tab map open, as a share of the run
//   run     under threat, how much of the time you are moving away from it (sprinting
//           counts extra), rather than hiding -- a step away from the alien that also
//           brings you closer to your key is walking on, not running away
//
// "Under threat" is judged on where the nearest alien was before your step: judged after,
// every successful escape (11 cells to 13) would not count as one.
//
// A run that gave no evidence for a habit (never threatened, say) reports NaN for it, and
// the file leaves that habit alone. The file is exponentially weighted per habit, like the
// 2D dossier, and kept per profile (profile.habits3d). A habit counts against you only
// when it is clearly above the bot population (priors3d.js): its tactic's strength is 0 at
// z <= Z_ON, rising to 1 at Z_FULL, times how many runs back it up.

import { TILE, blocksHuman } from '../../sim/grid.js';
import { HABIT_PRIORS } from './priors3d.js';

export const HABITS = Object.freeze([
  { key: 'hide', hint: 'goes to ground when it hears us', tactic: 'sweep the water on its route and wait outside its black box' },
  { key: 'corner', hint: 'stops at corners', tactic: 'hold just round the next corner on its route' },
  { key: 'lost', hint: 'gets lost', tactic: 'cut it off between it and the key it needs' },
  { key: 'map', hint: 'stands still to read its map', tactic: 'close in while it reads' },
  { key: 'run', hint: 'runs when it is seen', tactic: 'flank the side it runs to' },
]);
export const HABIT_KEYS = Object.freeze(HABITS.map((h) => h.key));

/** Weight of the newest run (the 2D dossier's DOSSIER_ALPHA). */
export const HABIT_ALPHA = 0.3;
/** Runs before the file is believed: confidence n / (n + K0). */
export const HABIT_K0 = 1.5;
export const Z_CLAMP = 2.5;
/** A tactic switches on above Z_ON and is at full strength from Z_FULL. */
export const Z_ON = 0.5;
export const Z_FULL = 2.0;
/** "Under threat": an alien within this many cells, or an alert running. */
export const THREAT_CELLS = 12;
/**
 * The habit file's unit of time: 240 ticks, one real minute at 4 Hz (two minutes in
 * builds 45-47 at 2 Hz). A unit, not a clock: the priors are measured in it, so changing
 * it would only rescale both sides.
 */
export const TICKS_PER_MINUTE = 240;

/**
 * Cells at the convex corner of a wall: a walkable cell with a wall (or rubble) diagonally
 * next to it and open ground on both sides of that diagonal -- the cell you peek round
 * from. `near1` is that set grown by one cell; `near` by two, where "stopping at a
 * corner" is counted: someone who hesitates stops on the approach, a step or two short.
 */
export function cornerMask(map) {
  const { w, h, tiles } = map;
  const at = new Uint8Array(w * h), near = new Uint8Array(w * h), near1 = new Uint8Array(w * h);
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !blocksHuman(tiles[y * w + x]);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!open(x, y)) continue;
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (!open(x + dx, y + dy) && open(x + dx, y) && open(x, y + dy)) { at[y * w + x] = 1; break; }
      }
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!at[y * w + x]) continue;
      for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) {
        if (!open(xx, yy)) continue;
        near[yy * w + xx] = 1;
        if (Math.abs(yy - y) <= 1 && Math.abs(xx - x) <= 1) near1[yy * w + xx] = 1;
      }
    }
  }
  return { at, near, near1 };
}

/** Measures one run's habits from the sim's tick samples. */
export class HabitAccumulator {
  constructor(map) {
    this.map = map;
    this.corners = cornerMask(map);
    this.c = { ticks: 0, thr: 0, hidden: 0, flee: 0, sprint: 0, nc: 0, ncStop: 0, far: 0, farStop: 0, mv: 0, away: 0, moved: 0, revisit: 0, opens: 0, mapStill: 0 };
    this.prev = null;
  }

  /**
   * @param {object} s     the tick sample (sim/predictor/traits.js contract)
   * @param {object} view  the game's view: inSafeBox, boosted, mapOpen
   */
  observe(s, view) {
    const c = this.c, p = this.prev;
    const i = s.y * this.map.w + s.x;
    const mapOpen = !!view?.mapOpen;
    const inBox = !!view?.inSafeBox;
    const threatened = s.alertTicks > 0 || (p && Number.isFinite(p.threatDist) ? p.threatDist : s.threatDist) <= THREAT_CELLS;
    const hidden = inBox || (s.onCover && !s.moved);
    c.ticks++;
    if (threatened) {
      c.thr++;
      if (hidden) c.hidden++;
      else if (p && Number.isFinite(p.threatDist) && s.threatDist > p.threatDist && !(s.cacheDist < p.cacheDist)) c.flee++;
      if (view?.boosted) c.sprint++;
    }
    // corners: calm, map-closed ticks only -- stopping to hide or to read the map is those
    // habits, not this one
    if (!threatened && !mapOpen) {
      if (this.corners.near[i]) { c.nc++; if (!s.moved) c.ncStop++; } else { c.far++; if (!s.moved) c.farStop++; }
    }
    if (!threatened && s.cachesLeft > 0 && s.moved) {
      c.mv++;
      if (p && p.cachesLeft === s.cachesLeft && s.cacheDist > p.cacheDist) c.away++;
    }
    if (s.moved) { c.moved++; if (s.revisit) c.revisit++; }
    if (mapOpen && !(p && p.mapOpen)) c.opens++;
    if (mapOpen && !s.moved) c.mapStill++;
    this.prev = { threatDist: s.threatDist, cachesLeft: s.cachesLeft, cacheDist: s.cacheDist, mapOpen };
  }

  /** This run's habit rates; NaN where the run gave no evidence. */
  values() {
    const c = this.c;
    const minutes = c.ticks / TICKS_PER_MINUTE;
    return {
      hide: c.thr >= 12 ? c.hidden / c.thr : NaN,
      corner: c.nc >= 20 && c.far >= 20 ? c.ncStop / c.nc - c.farStop / c.far : NaN,
      lost: c.mv >= 20
        ? 0.5 * (c.away / c.mv) + 0.3 * (c.revisit / Math.max(1, c.moved)) + 0.2 * Math.min(1, minutes > 0 ? c.opens / minutes / 6 : 0)
        : NaN,
      map: c.ticks >= 40 ? c.mapStill / c.ticks : NaN,
      run: c.thr >= 12 ? Math.min(1, (c.flee + 0.5 * c.sprint) / c.thr) : NaN,
    };
  }
}

/** The file on your habits, kept per profile and carried across districts. */
export class HabitFile {
  constructor(state = {}) {
    this.updates = state.updates || 0;
    this.habits = {};
    for (const k of HABIT_KEYS) {
      const t = state.habits?.[k];
      this.habits[k] = t && Number.isFinite(t.mean) ? { mean: t.mean, var: t.var || 0, n: t.n || 0 } : { mean: NaN, var: 0, n: 0 };
    }
  }

  static fromJSON(j) { return new HabitFile(j || {}); }
  toJSON() { return { habits: this.habits, updates: this.updates }; }

  /** Fold one run in. Habits the run gave no evidence for are left alone. */
  update(values, alpha = HABIT_ALPHA) {
    if (!values) return;
    for (const k of HABIT_KEYS) {
      const x = values[k];
      if (!Number.isFinite(x)) continue;
      const t = this.habits[k];
      if (!(t.n > 0)) { t.mean = x; t.var = 0; } else {
        const d = x - t.mean;
        t.mean += alpha * d;
        t.var = (1 - alpha) * (t.var + alpha * d * d);
      }
      t.n++;
    }
    this.updates++;
  }

  confidence(k) { const n = this.habits[k]?.n || 0; return n / (n + HABIT_K0); }

  /** How far this habit sits above (or below) the population, clamped. */
  z(k) {
    const t = this.habits[k], p = HABIT_PRIORS[k];
    if (!t || !(t.n > 0) || !p || !(p.std > 0)) return 0;
    return Math.max(-Z_CLAMP, Math.min(Z_CLAMP, (t.mean - p.mean) / p.std));
  }

  /** The tactic's strength in [0,1]: 0 unless the habit is clearly yours. */
  strength(k) {
    const z = this.z(k);
    if (z <= Z_ON) return 0;
    return Math.min(1, (z - Z_ON) / (Z_FULL - Z_ON)) * this.confidence(k);
  }

  strengths() { return Object.fromEntries(HABIT_KEYS.map((k) => [k, this.strength(k)])); }

  /** The habit the aliens act on most, or null. */
  strongest() {
    let best = null;
    for (const h of HABITS) {
      const s = this.strength(h.key);
      if (s > 0 && (!best || s > best.strength)) best = { ...h, strength: s, z: this.z(h.key) };
    }
    return best;
  }
}

/** Water and black-box cells, the places a hider goes. */
export function hidingCells(map) {
  const out = [];
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === TILE.COVER || map.tiles[i] === TILE.SAFE) out.push(i);
  return out;
}
