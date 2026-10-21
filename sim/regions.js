// sim/regions.js -- the partition the predictor reasons over.
//
// Tier 1 is a transition matrix over regions, so the region count fixes the matrix
// size and the resolution of every interception. REGION_COUNT is deliberately a
// single constant: open question 1 in the spec is whether 12 is enough resolution,
// and subdividing to 24 must stay a one-line change.
//
// Rooms come first as seeds (a region should mean something a player can perceive),
// then farthest-point sampling tops the seed set up to exactly REGION_COUNT, then a
// multi-source BFS paints every walkable cell with its nearest seed. That gives
// contiguous, room-aligned regions on any map the generator can produce, including
// the degenerate ones.

import { DIRS, TILE, isWalkable, blocksHuman, blocksAlien } from './grid.js';
import { FieldPool, bfsFrom, UNREACHABLE, HUMAN } from './pathfind.js';

export const REGION_COUNT = 12;
export const NO_REGION = 255;

/**
 * @returns {{count:number, regionOf:Uint8Array, seeds:number[], cells:number[][], features:object[]}}
 */
export function buildRegions(map, roomCenters = [], count = REGION_COUNT, pool = null) {
  const n = map.tiles.length;
  const owned = new Uint8Array(n).fill(NO_REGION);
  const localPool = pool || new FieldPool(n);

  // --- seeds ---
  const seeds = [];
  const seen = new Set();
  for (const c of roomCenters) {
    if (seeds.length >= count) break;
    const i = c.y * map.w + c.x;
    if (map.tiles[i] === TILE.WALL || seen.has(i)) continue;
    seeds.push(i); seen.add(i);
  }

  // Districts are a fact about where the HUMAN goes, so seeding and features use human
  // walkability. The paint below is deliberately wider -- see the note there.
  const walkable = [];
  for (let i = 0; i < n; i++) if (!blocksHuman(map.tiles[i])) walkable.push(i);
  if (walkable.length === 0) {
    return { count: 0, regionOf: owned, seeds: [], cells: [], features: [] };
  }
  if (seeds.length === 0) { seeds.push(walkable[0]); seen.add(walkable[0]); }

  // Farthest-point sampling: each new seed is the walkable cell furthest (by BFS, not
  // by straight line -- walls are the whole point) from every seed chosen so far.
  const buf = localPool.take();
  while (seeds.length < count && seeds.length < walkable.length) {
    bfsFrom(map, seeds, buf);
    let bestCell = -1, bestDist = -1;
    for (let k = 0; k < walkable.length; k++) {
      const i = walkable[k];
      const d = buf.dist[i];
      if (d === UNREACHABLE) continue;          // disconnected pocket: handled below
      if (d > bestDist && !seen.has(i)) { bestDist = d; bestCell = i; }
    }
    if (bestCell < 0) {
      // Everything reachable is already a seed; take any unseeded walkable cell so the
      // matrix stays square even on a pathological map.
      bestCell = walkable.find((i) => !seen.has(i));
      if (bestCell === undefined) break;
    }
    seeds.push(bestCell); seen.add(bestCell);
  }

  // --- paint: multi-source BFS carrying ownership ---
  // Painted over ALIEN-passable cells, not human-walkable ones, so that a building cell
  // still belongs to a district. An alien standing inside rubble has to report a region
  // every tick, and `regionOf` being total is cheaper than a null check at every call
  // site. The district's *cells* and *features* below stay human-only.
  const dist = new Int16Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let s = 0; s < seeds.length; s++) {
    dist[seeds[s]] = 0;
    owned[seeds[s]] = s;
    queue[tail++] = seeds[s];
  }
  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % map.w;
    const cy = (cur - cx) / map.w;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DIRS[k].dx, ny = cy + DIRS[k].dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const ni = ny * map.w + nx;
      if (blocksAlien(map.tiles[ni]) || dist[ni] !== -1) continue;
      dist[ni] = dist[cur] + 1;
      owned[ni] = owned[cur];
      queue[tail++] = ni;
    }
  }
  // Any cell the paint could not reach (a sealed pocket the connectivity gate missed)
  // falls back to region 0 rather than NO_REGION, so no tick can log an invalid region.
  for (let i = 0; i < n; i++) {
    if (!blocksAlien(map.tiles[i]) && owned[i] === NO_REGION) owned[i] = 0;
  }

  // cells[] is human-walkable only: it is what the spawner draws candidate cells from,
  // and an alien materialising inside a building would be both invisible and unfair.
  const cells = Array.from({ length: seeds.length }, () => []);
  for (let i = 0; i < n; i++) {
    if (!blocksHuman(map.tiles[i])) cells[owned[i]].push(i);
  }

  localPool.give(buf);
  const regions = {
    count: seeds.length,
    regionOf: owned,
    seeds,
    cells,
  };
  regions.features = regionFeatures(map, regions, localPool);
  return regions;
}

export function regionAt(regions, map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return 0;
  const r = regions.regionOf[y * map.w + x];
  return r === NO_REGION ? 0 : r;
}

/**
 * Map-agnostic geometric descriptors, one record per region.
 *
 * These are the handles tier 2 pulls on. A dossier trait is a number about the
 * player; a region feature is the matching number about a place; the reweighting in
 * predictor/combine.js is the dot product between them. Everything here is a
 * fraction or a normalised mean so it transfers across maps of different shapes.
 */
export function regionFeatures(map, regions, pool = null) {
  const localPool = pool || new FieldPool(map.tiles.length);
  const buf = localPool.take();

  // Distance to the nearest cover tile, for open-ground accounting.
  const coverSources = [];
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === TILE.COVER) coverSources.push(i);
  const coverDist = coverSources.length
    ? Int16Array.from(bfsFrom(map, coverSources, buf, HUMAN))
    : new Int16Array(map.tiles.length).fill(999);

  const totalWalkable = regions.cells.reduce((a, c) => a + c.length, 0) || 1;
  const out = [];
  for (let r = 0; r < regions.count; r++) {
    const cs = regions.cells[r];
    let wallAdj = 0, cover = 0, degSum = 0, open = 0, deadEnd = 0, junction = 0, building = 0;
    let sx = 0, sy = 0;
    for (const i of cs) {
      const x = i % map.w, y = (i - x) / map.w;
      sx += x; sy += y;
      let d = 0;
      for (let k = 0; k < 4; k++) {
        if (isWalkable(map, x + DIRS[k].dx, y + DIRS[k].dy)) d++;
      }
      degSum += d;
      if (d < 4) wallAdj++;
      if (d <= 1) deadEnd++;
      if (d >= 3) junction++;
      if (map.tiles[i] === TILE.COVER) cover++;
      if (coverDist[i] === UNREACHABLE || coverDist[i] > 3) open++;
      for (let k = 0; k < 4; k++) {
        if (map.tiles[(y + DIRS[k].dy) * map.w + (x + DIRS[k].dx)] === TILE.BUILDING) { building++; break; }
      }
    }
    const nc = cs.length || 1;
    out.push({
      id: r,
      cellCount: cs.length,
      areaFrac: cs.length / totalWalkable,
      wallAdjFrac: wallAdj / nc,
      coverFrac: cover / nc,
      meanDegree: degSum / nc,
      corridorFrac: 1 - junction / nc,   // high => tight, low => open floor
      deadEndFrac: deadEnd / nc,
      junctionFrac: junction / nc,
      openGroundFrac: open / nc,
      /** Cells that touch rubble -- ground where an alien can arrive from a direction
       *  the human cannot retreat into. */
      buildingEdgeFrac: building / nc,
      centroid: { x: sx / nc, y: sy / nc },
      seed: regions.seeds[r],
    });
  }
  localPool.give(buf);
  return out;
}

/** Region-level adjacency, derived from cell adjacency. Used by the heatmap and bench. */
export function regionAdjacency(map, regions) {
  const adj = Array.from({ length: regions.count }, () => new Set());
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (!isWalkable(map, x, y)) continue;
      const a = regions.regionOf[y * map.w + x];
      for (let k = 0; k < 4; k++) {
        const nx = x + DIRS[k].dx, ny = y + DIRS[k].dy;
        if (!isWalkable(map, nx, ny)) continue;
        const b = regions.regionOf[ny * map.w + nx];
        if (a !== b) { adj[a].add(b); adj[b].add(a); }
      }
    }
  }
  return adj.map((s) => [...s]);
}
