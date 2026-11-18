// sim3d/dispatch/geometry.js -- tier 1 of the 3D Dispatch: geometry, not rooms. Pure.
//
// The 2D Dispatch's tier 1 (sim/predictor/chain.js) counts which region you move to next
// and learns this map's room preferences: "room 6, then room 5". The user asked for the
// opposite -- learn the player, not the room -- and on a city of 40 regions that chain
// says little anyway. So in 3D tier 1 is only what the map allows: the share of each
// region you could physically reach in the next k ticks from where you are now. It
// learns nothing. Tier 2 -- the dossier's 20 traits, and in 3D the habit file's tactics
// -- is what knows you.
//
// It answers the three questions the rest of the predictor asks of a chain (observe,
// kStep, maturity), so sim/predictor/combine.js runs on it unchanged.

import { FastFields } from '../next/field.js';
import { FieldPool, bfsFrom, HUMAN } from '../../sim/pathfind.js';

/** Share of the projection spread evenly over every region, so none is ever ruled out. */
export const GEOMETRY_FLOOR = 0.03;

export class GeometryChain {
  /** @param {object} level  a generated level: map, regions, spawn */
  constructor(level) {
    this.map = level.map;
    this.regions = level.regions;
    this.count = level.regions.count;
    this.ff = FastFields.fits(level.map) ? new FastFields(level.map) : null;
    this.pool = this.ff ? null : new FieldPool(level.map.tiles.length);
    this.dist = new Int16Array(level.map.tiles.length);
    // a search that stops at depth k: k = 20 touches ~1,000 cells, not the city's 38,000
    this.queue = new Int32Array(level.map.tiles.length);
    this.mark = new Int32Array(level.map.tiles.length);
    this.stamp = 0;
    this.cnt = new Float64Array(this.count);
    this.at = { x: level.spawn.x, y: level.spawn.y };
    this.observations = 0;
    this._key = -1;
    this._k = -1;
    this._p = new Float64Array(this.count);
  }

  /** Where the player is, from each tick sample (the runner calls this). */
  locate(x, y) { this.at = { x, y }; }

  /** Region changes are counted, never learned from. */
  observe() { this.observations++; }

  /** Always 0: there is nothing about the rooms to mature. */
  maturity() { return 0; }

  /** The k-tick reach from where you are, as a distribution over regions. */
  kStep(_from, k = 20, out = null) {
    const R = this.count;
    const dst = out || new Float64Array(R);
    const key = this.at.y * this.map.w + this.at.x;
    if (key !== this._key || k !== this._k) {
      const cnt = this.cnt;
      cnt.fill(0);
      let total = 0;
      const of = this.regions.regionOf;
      if (this.ff) {
        // breadth-first to depth k only: the same cells as a full field's dist <= k
        const pass = this.ff.human, q = this.queue, mark = this.mark, w = this.map.w;
        const st = ++this.stamp;
        let head = 0, tail = 0, depth = 0, levelEnd = 1;
        q[tail++] = key; mark[key] = st;
        while (head < tail) {
          if (head === levelEnd) { depth++; if (depth > k) break; levelEnd = tail; }
          const c = q[head++];
          const r = of[c];
          if (r < R) { cnt[r]++; total++; }
          if (depth >= k) continue;
          for (const ni of [c - 1, c + 1, c - w, c + w]) {
            if (pass[ni] && mark[ni] !== st) { mark[ni] = st; q[tail++] = ni; }
          }
        }
      } else {
        const buf = this.pool.take();
        const d = bfsFrom(this.map, [key], buf, HUMAN);
        for (let i = 0; i < d.length; i++) {
          if (d[i] < 0 || d[i] > k) continue;
          const r = of[i];
          if (r < R) { cnt[r]++; total++; }
        }
        this.pool.give(buf);
      }
      for (let r = 0; r < R; r++) this._p[r] = (1 - GEOMETRY_FLOOR) * (total > 0 ? cnt[r] / total : 1 / R) + GEOMETRY_FLOOR / R;
      this._key = key;
      this._k = k;
    }
    dst.set(this._p);
    return dst;
  }
}
