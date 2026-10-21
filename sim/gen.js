// sim/gen.js -- the level generator.
//
// Four passes, in the order the spec fixes them:
//   1. carve rooms, connect them with corridors
//   2. verify full connectivity by flood fill, regenerate on failure
//   3. scatter cover at a target density
//   4. place caches in distinct rooms, drop in the room furthest from spawn
//
// Seeded from hash(profileId, levelNumber), so a level is content rather than data:
// reproducible, infinite, and a difficulty parameter instead of drawn geometry.

import { GRID_W, GRID_H, TILE, createMap, setTile, isWalkable, DIRS } from './grid.js';
import { FieldPool, bfsField, UNREACHABLE } from './pathfind.js';
import { buildRegions, REGION_COUNT } from './regions.js';
import { Rng, levelSeed } from './prng.js';
import { levelParams } from './difficulty.js';

const MAX_ATTEMPTS = 40;

function carveRect(map, x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) setTile(map, x, y, TILE.FLOOR);
  }
}

function overlaps(a, b, pad = 1) {
  return (
    a.x0 - pad < b.x0 + b.w && a.x0 + a.w + pad > b.x0 &&
    a.y0 - pad < b.y0 + b.h && a.y0 + a.h + pad > b.y0
  );
}

function carveCorridor(map, ax, ay, bx, by, rng) {
  // L-shaped, with the elbow order chosen by the stream so corridors are not all
  // horizontal-first (which produces a visibly gridded, readable city).
  if (rng.bool()) {
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) setTile(map, x, ay, TILE.FLOOR);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) setTile(map, bx, y, TILE.FLOOR);
  } else {
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) setTile(map, ax, y, TILE.FLOOR);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) setTile(map, x, by, TILE.FLOOR);
  }
}

/**
 * Pass 1: binary space partition into rooms, then a minimum spanning tree of corridors,
 * then a couple of extra links.
 *
 * BSP rather than rejection sampling or a fixed sector grid, for one measurable reason:
 * the spec's constants -- detection radius 5, spawn band of 8 to 18 cells, 3 to 5
 * concurrent patrols -- only make sense on a map that is mostly open. Free placement of
 * small rooms produced maps that were 25% walkable, where a radius-5 circle covers a
 * third of every corridor, the 8-to-18 band is the entire level, and contact is
 * unavoidable within twenty ticks no matter how well anyone plays.
 *
 * A BSP keeps total open area near constant as the room count rises (more rooms, each
 * smaller) which is what lets the difficulty curve change room count without silently
 * changing how lethal detection is. It also gives every region a couple of dozen cells
 * instead of nine, which is what tier 1 needs to have anything to count.
 */
const MIN_LEAF_W = 6;
const MIN_LEAF_H = 5;

function bspLeaves(rect, count, rng) {
  let leaves = [rect];
  let guard = 0;
  while (leaves.length < count && guard++ < 200) {
    // Always split the largest splittable leaf, so rooms stay comparable in size.
    const order = leaves
      .map((l, i) => ({ l, i, area: l.w * l.h }))
      .sort((a, b) => b.area - a.area);
    let did = false;
    for (const { l, i } of order) {
      const canV = l.w >= MIN_LEAF_W * 2;
      const canH = l.h >= MIN_LEAF_H * 2;
      if (!canV && !canH) continue;
      const vertical = canV && canH ? (l.w / l.h > 1.15 ? true : l.h / l.w > 1.15 ? false : rng.bool()) : canV;
      if (vertical) {
        const lo = MIN_LEAF_W, hi = l.w - MIN_LEAF_W;
        const cut = rng.range(lo, hi);
        leaves.splice(i, 1,
          { x: l.x, y: l.y, w: cut, h: l.h },
          { x: l.x + cut, y: l.y, w: l.w - cut, h: l.h });
      } else {
        const lo = MIN_LEAF_H, hi = l.h - MIN_LEAF_H;
        const cut = rng.range(lo, hi);
        leaves.splice(i, 1,
          { x: l.x, y: l.y, w: l.w, h: cut },
          { x: l.x, y: l.y + cut, w: l.w, h: l.h - cut });
      }
      did = true;
      break;
    }
    if (!did) break;
  }
  return leaves;
}

function carveRoomsAndCorridors(map, rng, targetRooms) {
  const leaves = bspLeaves({ x: 1, y: 1, w: map.w - 2, h: map.h - 2 }, targetRooms, rng);

  const rooms = [];
  for (const l of leaves) {
    // Fill most of the leaf. One cell of wall between neighbouring leaves is enough to
    // keep rooms distinct; shrinking further just turns open floor back into rock.
    const w = Math.max(4, l.w - 1 - rng.int(2));
    const h = Math.max(3, l.h - 1 - rng.int(2));
    const x0 = l.x + rng.int(Math.max(1, l.w - w));
    const y0 = l.y + rng.int(Math.max(1, l.h - h));
    if (x0 + w >= map.w || y0 + h >= map.h) continue;
    const room = { x0, y0, w, h, cx: x0 + ((w / 2) | 0), cy: y0 + ((h / 2) | 0), leaf: l };
    if (rooms.some((o) => overlaps(room, o, 0))) continue;
    rooms.push(room);
    carveRect(map, x0, y0, w, h);
  }
  if (rooms.length < 2) return rooms;

  const roomDist = (a, b) => Math.abs(rooms[a].cx - rooms[b].cx) + Math.abs(rooms[a].cy - rooms[b].cy);

  // Prim's MST over room centres: connectivity by construction, which keeps the
  // flood-fill gate in pass 2 an assertion rather than the actual mechanism.
  const inTree = new Set([0]);
  const edges = [];
  const edgeKey = (i, j) => (i < j ? `${i}-${j}` : `${j}-${i}`);
  const have = new Set();
  while (inTree.size < rooms.length) {
    let best = null;
    for (const i of inTree) {
      for (let j = 0; j < rooms.length; j++) {
        if (inTree.has(j)) continue;
        const d = roomDist(i, j);
        if (!best || d < best.d) best = { i, j, d };
      }
    }
    if (!best) break;
    inTree.add(best.j);
    edges.push([best.i, best.j]);
    have.add(edgeKey(best.i, best.j));
  }

  // Extra links create cycles. Loops are not cosmetic: a tree-shaped map funnels every
  // escape into a dead end, and it also makes the transition matrix nearly symmetric
  // and therefore uninformative. Prefer short links so a loop does not bulldoze the map.
  const extra = rng.range(2, 4);
  for (let e = 0; e < extra; e++) {
    const i = rng.int(rooms.length);
    let bestJ = -1, bestD = Infinity;
    for (let j = 0; j < rooms.length; j++) {
      if (j === i || have.has(edgeKey(i, j))) continue;
      const d = roomDist(i, j);
      if (d < bestD) { bestD = d; bestJ = j; }
    }
    if (bestJ >= 0) { edges.push([i, bestJ]); have.add(edgeKey(i, bestJ)); }
  }

  for (const [i, j] of edges) {
    carveCorridor(map, rooms[i].cx, rooms[i].cy, rooms[j].cx, rooms[j].cy, rng);
  }
  return rooms;
}

/** Pass 2: is every walkable cell reachable from the first room centre? */
function fullyConnected(map, from, pool) {
  const buf = pool.take();
  const dist = bfsField(map, from.x, from.y, buf);
  let total = 0, reached = 0;
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] === TILE.WALL) continue;
    total++;
    if (dist[i] !== UNREACHABLE) reached++;
  }
  pool.give(buf);
  return { ok: total > 0 && total === reached, total, reached };
}

/** Pass 3: cover, biased toward wall-adjacent cells because that is where it reads. */
function scatterCover(map, rng, density, forbidden) {
  const cands = [];
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (map.tiles[i] !== TILE.FLOOR) continue;
      if (forbidden.has(i)) continue;
      let adj = 0;
      for (let k = 0; k < 4; k++) if (!isWalkable(map, x + DIRS[k].dx, y + DIRS[k].dy)) adj++;
      cands.push({ i, weight: 1 + adj * 0.8 });
    }
  }
  const target = Math.round(cands.length * density);
  const weights = cands.map((c) => c.weight);
  const chosen = new Set();
  let guard = 0;
  while (chosen.size < target && guard++ < target * 12 && cands.length) {
    const pick = rng.categorical(weights);
    const cell = cands[pick].i;
    if (chosen.has(cell)) continue;
    chosen.add(cell);
    weights[pick] = 0;
    map.tiles[cell] = TILE.COVER;
  }
  return chosen.size;
}

/** Area floor. Below this a level is technically valid and miserable to play: regions
 *  shrink to a handful of cells and the spawner's 8-to-18 band has almost nowhere to
 *  land. It is a preference rather than a hard gate -- see the fallback below. */
const MIN_WALKABLE = 290;

/** Carve one candidate layout for a given attempt index. Deterministic in (seed, attempt). */
function carveAttempt(baseSeed, level, attempt, params, pool) {
  // Each retry is its own deterministic stream, so "regenerate on failure" stays
  // reproducible instead of consuming an unpredictable number of draws.
  const rng = new Rng(baseSeed ^ Math.imul(attempt + 1, 0x9e3779b9), `gen:${level}:${attempt}`);
  const map = createMap(GRID_W, GRID_H, TILE.WALL);
  const rooms = carveRoomsAndCorridors(map, rng, params.rooms);
  if (rooms.length < Math.max(3, params.caches + 2)) return null;
  const conn = fullyConnected(map, { x: rooms[0].cx, y: rooms[0].cy }, pool);
  if (!conn.ok) return null;
  return { rng, map, rooms, conn, attempt };
}

/**
 * Generate one level.
 * @param {string} profileId
 * @param {number} level
 * @param {object} [opts] {pool, params}
 */
export function generateLevel(profileId, level, opts = {}) {
  const params = opts.params || levelParams(level);
  const pool = opts.pool || new FieldPool(GRID_W * GRID_H);
  const baseSeed = levelSeed(profileId, level);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const cand = carveAttempt(baseSeed, level, attempt, params, pool);
    if (!cand) continue;
    // Roomy enough, or we have run out of budget and take the best connected layout.
    if (cand.conn.total < MIN_WALKABLE && attempt < MAX_ATTEMPTS - 1) continue;
    const built = furnish(cand, profileId, level, baseSeed, params, pool);
    if (built) return built;
  }

  // Nothing met the area floor. Take the largest connected layout we can carve; a
  // cramped level beats a thrown exception mid-run.
  let best = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const cand = carveAttempt(baseSeed, level, attempt, params, pool);
    if (!cand) continue;
    if (!best || cand.conn.total > best.conn.total) best = cand;
  }
  if (best) {
    const built = furnish(best, profileId, level, baseSeed, params, pool);
    if (built) return built;
  }

  throw new Error(`generateLevel: no valid layout after ${MAX_ATTEMPTS} attempts (profile=${profileId}, level=${level})`);
}

/** Pass 4 plus cover and regions: turn a carved, connected layout into a playable level. */
function furnish(cand, profileId, level, baseSeed, params, pool) {
  const { rng, map, rooms, conn } = cand;

  const order = rng.shuffle(rooms.map((_, i) => i));
  const spawnRoom = order[0];
  const spawn = { x: rooms[spawnRoom].cx, y: rooms[spawnRoom].cy };

  const buf = pool.take();
  const fromSpawn = Int16Array.from(bfsField(map, spawn.x, spawn.y, buf));
  pool.give(buf);

  // Drop goes in the room whose centre is furthest from spawn by path, not by line.
  let dropRoom = -1, dropDist = -1;
  for (let i = 0; i < rooms.length; i++) {
    if (i === spawnRoom) continue;
    const d = fromSpawn[rooms[i].cy * map.w + rooms[i].cx];
    if (d !== UNREACHABLE && d > dropDist) { dropDist = d; dropRoom = i; }
  }
  if (dropRoom < 0) return null;
  const drop = { x: rooms[dropRoom].cx, y: rooms[dropRoom].cy };

  // Caches in distinct rooms, none of them the spawn room or the drop room.
  const cacheRooms = order.filter((i) => i !== spawnRoom && i !== dropRoom);
  if (cacheRooms.length < params.caches) return null;
  const caches = [];
  for (let c = 0; c < params.caches; c++) {
    const r = rooms[cacheRooms[c]];
    // Offset inside the room so caches are not all dead centre, which would make
    // every room's interior interchangeable to the chain.
    const cx = r.x0 + rng.int(r.w);
    const cy = r.y0 + rng.int(r.h);
    const i = cy * map.w + cx;
    if (fromSpawn[i] === UNREACHABLE) return null;
    caches.push({ x: cx, y: cy, collected: false });
  }

  const forbidden = new Set([spawn.y * map.w + spawn.x, drop.y * map.w + drop.x]);
  for (const c of caches) forbidden.add(c.y * map.w + c.x);
  const coverCount = scatterCover(map, rng, params.coverDensity, forbidden);

  setTile(map, drop.x, drop.y, TILE.DROP);

  const regions = buildRegions(map, rooms.map((r) => ({ x: r.cx, y: r.cy })), REGION_COUNT, pool);

  return {
    profileId,
    level,
    seed: baseSeed,
    attempt: cand.attempt,
    params,
    map,
    rooms,
    spawn,
    caches,
    drop,
    regions,
    stats: { walkable: conn.total, coverCount, dropDist },
  };
}

/** Connectivity assertion used by the acceptance criteria: every cache and the drop reachable. */
export function verifyLevel(level, pool) {
  const p = pool || new FieldPool(level.map.tiles.length);
  const buf = p.take();
  const dist = bfsField(level.map, level.spawn.x, level.spawn.y, buf);
  const bad = [];
  for (const c of level.caches) {
    if (dist[c.y * level.map.w + c.x] === UNREACHABLE) bad.push({ kind: 'cache', ...c });
  }
  if (dist[level.drop.y * level.map.w + level.drop.x] === UNREACHABLE) bad.push({ kind: 'drop', ...level.drop });
  let total = 0, reached = 0;
  for (let i = 0; i < level.map.tiles.length; i++) {
    if (level.map.tiles[i] === TILE.WALL) continue;
    total++;
    if (dist[i] !== UNREACHABLE) reached++;
  }
  p.give(buf);
  return { ok: bad.length === 0 && total === reached, bad, total, reached };
}
