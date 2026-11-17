// sim3d/leash.js -- continuous body, grid truth. Pure.
//
// The player moves a continuous body; the sim moves a cell, one per tick in four
// directions (two while sprinting). The leash keeps them honest with each other:
//
//   1. The sim cell is the truth. Pickups, the portal, detection and capture happen where
//      the sim says, exactly as in 2D.
//   2. The body may lead the cell but never escape it: the body's cell must be reachable
//      from the sim's cell in at most `allowance` four-direction steps over human-walkable
//      tiles (2 walking, 3 sprinting). prepare() turns everything farther away into a
//      wall for the body's collision, so the clamp is a soft slide, not a snap.
//
//      The allowance is SLACK, not the speed limit. The speed limit is body.js's
//      Manhattan cap, which keeps the body followable; the leash only has to catch what
//      timing leaves over. Builds 2-9 used 1 and 2, which was no slack at all: the body
//      met the clamp on most diagonal frames, and on an exact diagonal both the body and
//      the sim waited on each other forever (the cell ahead diagonally is two steps
//      away). Measured in decisions.md R39.
//   3. Each tick, decide() emits the one sim direction that starts a shortest walkable
//      path to the body's cell, preferring the axis the body has moved along most.
//   4. When the body stops, the sim catches up within `allowance` ticks (one, in practice).
//
// To the sim, the predictor, the dossier and the difficulty controller, the output is an
// ordinary four-direction input stream. A 3D player is a player.

import { DIRS, STAY, isWalkable } from '../sim/grid.js';

/** Slack, in four-direction steps, between the body's cell and the sim's. */
export const LEAD_WALK = 2;
export const LEAD_SPRINT = 3;

const W = 9;               // BFS window, centred: covers 4 steps in every direction
const HALF = 4;

export class Leash {
  constructor(map) {
    this.map = map;
    this.allowance = 1;
    this.simX = 0; this.simY = 0;
    this.keepX = -1; this.keepY = -1;
    this._fromSim = new Int8Array(W * W);
    this._fromBody = new Int8Array(W * W);
    this._queue = new Int16Array(W * W * 2);
    /** Collision predicate for the body: solid tiles plus everything beyond the leash. */
    this.blocked = (cx, cy) => {
      if (!isWalkable(this.map, cx, cy)) return true;
      if (cx === this.keepX && cy === this.keepY) return false;
      const d = this._dist(this._fromSim, this.simX, this.simY, cx, cy);
      return d < 0 || d > this.allowance;
    };
  }

  /** BFS over human-walkable cells inside a 9x9 window centred on (ox, oy). */
  _bfs(buf, ox, oy) {
    buf.fill(-1);
    if (!isWalkable(this.map, ox, oy)) return;
    const q = this._queue;
    let head = 0, tail = 0;
    buf[HALF * W + HALF] = 0;
    q[tail++] = HALF; q[tail++] = HALF;
    while (head < tail) {
      const wx = q[head++], wy = q[head++];
      const d = buf[wy * W + wx];
      for (const { dx, dy } of DIRS) {
        const nx = wx + dx, ny = wy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
        if (buf[ny * W + nx] >= 0) continue;
        if (!isWalkable(this.map, ox + nx - HALF, oy + ny - HALF)) continue;
        buf[ny * W + nx] = d + 1;
        q[tail++] = nx; q[tail++] = ny;
      }
    }
  }

  _dist(buf, ox, oy, cx, cy) {
    const wx = cx - ox + HALF, wy = cy - oy + HALF;
    if (wx < 0 || wy < 0 || wx >= W || wy >= W) return -1;
    return buf[wy * W + wx];
  }

  /**
   * Recompute the leash around the sim's current cell. Call before moving the body each
   * frame and after every sim step.
   * @returns {boolean} false if the body had escaped and was snapped back (never expected)
   */
  prepare(game, body, sprintHeld) {
    this.allowance = sprintHeld ? LEAD_SPRINT : LEAD_WALK;
    this.simX = game.player.x; this.simY = game.player.y;
    this._bfs(this._fromSim, this.simX, this.simY);
    const bx = Math.floor(body.x), by = Math.floor(body.y);
    const d = this._dist(this._fromSim, this.simX, this.simY, bx, by);
    if (d < 0 || d > LEAD_SPRINT) {
      body.x = this.simX + 0.5; body.y = this.simY + 0.5; body.vx = 0; body.vy = 0;
      this.keepX = this.simX; this.keepY = this.simY;
      return false;
    }
    // The body's own cell is never forbidden, even if the allowance just shrank (sprint
    // released while two cells ahead): ejecting the player backwards would be a snap.
    this.keepX = bx; this.keepY = by;
    return true;
  }

  /** The sim input for this tick: { dir, sprint }. */
  decide(game, body, sprintHeld) {
    const sx = game.player.x, sy = game.player.y;
    const bx = Math.floor(body.x), by = Math.floor(body.y);
    if (bx === sx && by === sy) return { dir: STAY, sprint: false };
    this._bfs(this._fromBody, bx, by);
    const dS = this._dist(this._fromBody, bx, by, sx, sy);
    if (dS <= 0) return { dir: STAY, sprint: false };

    const ox = body.x - (sx + 0.5), oy = body.y - (sy + 0.5);
    let best = STAY, bestScore = -Infinity;
    for (let d = 0; d < 4; d++) {
      const nx = sx + DIRS[d].dx, ny = sy + DIRS[d].dy;
      if (this._dist(this._fromBody, bx, by, nx, ny) !== dS - 1) continue;
      const score = DIRS[d].dx * ox + DIRS[d].dy * oy;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    if (best === STAY) return { dir: STAY, sprint: false };

    // A sprint tick moves the sim two cells, but only in a straight line. Take a double
    // step along ANY direction that stays on a shortest path, not just the preferred
    // one: off-axis, the preferred axis is usually the one with a single cell of lag,
    // and insisting on it threw away half of every sprint tick.
    if (sprintHeld && game.sprintTicks > 0 && dS >= 2) {
      let dbl = STAY, dblScore = -Infinity;
      for (let d = 0; d < 4; d++) {
        const tx = sx + 2 * DIRS[d].dx, ty = sy + 2 * DIRS[d].dy;
        if (this._dist(this._fromBody, bx, by, tx, ty) !== dS - 2) continue;
        if (this._dist(this._fromBody, bx, by, sx + DIRS[d].dx, sy + DIRS[d].dy) !== dS - 1) continue;
        const score = DIRS[d].dx * ox + DIRS[d].dy * oy;
        if (score > dblScore) { dblScore = score; dbl = d; }
      }
      if (dbl !== STAY) return { dir: dbl, sprint: true };
    }
    return { dir: best, sprint: false };
  }
}
