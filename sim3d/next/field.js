// sim3d/next/field.js -- distance fields for city maps, faster. Pure.
//
// The same breadth-first search as sim/pathfind.js's bfsFrom, producing the same numbers:
// BFS distances on a grid do not depend on the order neighbours are visited, so only the
// speed differs. It is faster because a city map always has a wall border: every cell
// that can enter the queue has four in-bounds neighbours, so the search needs no bounds
// test and no division to recover x, and passability is read from a byte array built
// once per map instead of calling a predicate per neighbour.
//
// Measured at district 100 (248 x 155): 0.125 ms against bfsFrom's 1.5 ms, 12-15x faster
// at every size, and identical to it cell for cell (checked on human and alien fields,
// single and multi-source). The sim asks for several full fields every tick on a big map,
// and N8.2's target is a tick under 4 ms.

import { blocksHuman, blocksAlien } from '../../sim/grid.js';
import { UNREACHABLE, ALIEN } from '../../sim/pathfind.js';

export class FastFields {
  /** @param {{w:number, h:number, tiles:Uint8Array}} map */
  constructor(map) {
    this.map = map;
    this.w = map.w;
    this.n = map.tiles.length;
    this.human = new Uint8Array(this.n);
    this.alien = new Uint8Array(this.n);
    this.queue = new Int32Array(this.n);
    this.refresh();
  }

  /** Re-read the tiles. Call after anything changes one (nothing does yet). */
  refresh() {
    const { w, h, tiles } = this.map;
    for (let i = 0; i < this.n; i++) {
      const x = i % w, y = (i - x) / w;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      this.human[i] = edge || blocksHuman(tiles[i]) ? 0 : 1;
      this.alien[i] = edge || blocksAlien(tiles[i]) ? 0 : 1;
    }
  }

  /**
   * Multi-source BFS into `dist` (an Int16Array of the map's size).
   * @param {ArrayLike<number>} sources cell indices
   * @param {Int16Array} dist written in place and returned
   * @param {Function} blocks HUMAN or ALIEN from sim/pathfind.js
   */
  run(sources, dist, blocks) {
    const pass = blocks === ALIEN ? this.alien : this.human;
    const q = this.queue, w = this.w;
    dist.fill(UNREACHABLE);
    let head = 0, tail = 0;
    for (let s = 0; s < sources.length; s++) {
      const i = sources[s];
      if (i < 0 || i >= this.n || !pass[i] || dist[i] === 0) continue;
      dist[i] = 0;
      q[tail++] = i;
    }
    while (head < tail) {
      const c = q[head++];
      const d = dist[c] + 1;
      let ni = c - 1;
      if (pass[ni] && dist[ni] === UNREACHABLE) { dist[ni] = d; q[tail++] = ni; }
      ni = c + 1;
      if (pass[ni] && dist[ni] === UNREACHABLE) { dist[ni] = d; q[tail++] = ni; }
      ni = c - w;
      if (pass[ni] && dist[ni] === UNREACHABLE) { dist[ni] = d; q[tail++] = ni; }
      ni = c + w;
      if (pass[ni] && dist[ni] === UNREACHABLE) { dist[ni] = d; q[tail++] = ni; }
    }
    return dist;
  }

  /** Does this map qualify: a wall border all round? (City maps always have one.) */
  static fits(map) {
    const { w, h, tiles } = map;
    for (let x = 0; x < w; x++) if (!blocksHuman(tiles[x]) || !blocksAlien(tiles[x]) || !blocksHuman(tiles[(h - 1) * w + x]) || !blocksAlien(tiles[(h - 1) * w + x])) return false;
    for (let y = 0; y < h; y++) if (!blocksHuman(tiles[y * w]) || !blocksAlien(tiles[y * w]) || !blocksHuman(tiles[y * w + w - 1]) || !blocksAlien(tiles[y * w + w - 1])) return false;
    return true;
  }
}
