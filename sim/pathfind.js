// sim/pathfind.js -- breadth-first distance fields over the grid.
//
// Everything that needs "how far is that, and which way do I step" goes through here:
// patrol chase, intercept walking, the spawner's min/max distance constraints, the
// generator's connectivity check, and the objective-directness trait.
//
// Fields are Int16Array(w*h) with -1 for unreachable. Buffers are pooled because the
// headless harness runs this roughly a thousand times per episode and the acceptance
// criterion is 1,000 episodes in under 30 seconds.

import { DIRS, TILE } from './grid.js';

export const UNREACHABLE = -1;

/** A pool of reusable distance/queue buffers sized to one map. */
export class FieldPool {
  constructor(size) {
    this.size = size;
    this._free = [];
  }
  take() {
    const b = this._free.pop();
    if (b) return b;
    return { dist: new Int16Array(this.size), queue: new Int32Array(this.size) };
  }
  give(b) { this._free.push(b); }
}

/**
 * Multi-source BFS. `sources` is a flat array of cell indices.
 * Writes into buf.dist and returns it.
 */
export function bfsFrom(map, sources, buf) {
  const { w, h, tiles } = map;
  const dist = buf.dist;
  const queue = buf.queue;
  dist.fill(UNREACHABLE);
  let head = 0, tail = 0;
  for (let s = 0; s < sources.length; s++) {
    const i = sources[s];
    if (i < 0 || i >= tiles.length || tiles[i] === TILE.WALL) continue;
    dist[i] = 0;
    queue[tail++] = i;
  }
  while (head < tail) {
    const cur = queue[head++];
    const d = dist[cur] + 1;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DIRS[k].dx;
      const ny = cy + DIRS[k].dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (tiles[ni] === TILE.WALL || dist[ni] !== UNREACHABLE) continue;
      dist[ni] = d;
      queue[tail++] = ni;
    }
  }
  return dist;
}

export function bfsField(map, sx, sy, buf) {
  return bfsFrom(map, [sy * map.w + sx], buf);
}

/**
 * The step a chaser takes: the neighbour with the smallest distance-to-target.
 * Ties are broken by the supplied Rng so two patrols on the same field do not
 * deterministically clump, and so the choice stays reproducible.
 * Returns a direction index, or STAY (-1) when already there or boxed in.
 */
export function stepDownhill(map, dist, x, y, rng, blocked = null) {
  const here = dist[y * map.w + x];
  if (here === 0) return -1;
  let best = here === UNREACHABLE ? Infinity : here;
  const cands = [];
  for (let k = 0; k < 4; k++) {
    const nx = x + DIRS[k].dx;
    const ny = y + DIRS[k].dy;
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
    const ni = ny * map.w + nx;
    if (map.tiles[ni] === TILE.WALL) continue;
    if (blocked && blocked(nx, ny)) continue;
    const d = dist[ni];
    if (d === UNREACHABLE) continue;
    if (d < best) { best = d; cands.length = 0; cands.push(k); }
    else if (d === best) cands.push(k);
  }
  if (cands.length === 0) return -1;
  return cands.length === 1 ? cands[0] : cands[rng.int(cands.length)];
}

/** The step that maximises distance from a field -- used by fleeing bots. */
export function stepUphill(map, dist, x, y, rng) {
  let best = -Infinity;
  const cands = [];
  for (let k = 0; k < 4; k++) {
    const nx = x + DIRS[k].dx;
    const ny = y + DIRS[k].dy;
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
    const ni = ny * map.w + nx;
    if (map.tiles[ni] === TILE.WALL) continue;
    const d = dist[ni];
    if (d === UNREACHABLE) continue;
    if (d > best) { best = d; cands.length = 0; cands.push(k); }
    else if (d === best) cands.push(k);
  }
  if (cands.length === 0) return -1;
  return cands.length === 1 ? cands[0] : cands[rng.int(cands.length)];
}

/** Number of walkable cells reachable from (sx,sy). The generator's connectivity gate. */
export function reachableCount(map, sx, sy, buf) {
  const dist = bfsField(map, sx, sy, buf);
  let n = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] !== UNREACHABLE) n++;
  return n;
}
