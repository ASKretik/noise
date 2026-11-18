// sim3d/next/city.js -- big districts, built as a city. Pure.
//
// The 2D generator places 6-10 rooms on 640 cells and was never meant for 38,000. The
// `next` ruleset builds a district as a city instead (spec-3d-next.md, N8.1):
//
//   1. Avenues (3 wide) cross the map. Each block between them is cut by streets (2 wide)
//      and alleys (1 wide) until no lot is larger than 22 x 16 cells.
//   2. Every lot gets a neighbourhood type by seed -- tenements, plaza, market, yards,
//      park, canal, depot, ruins -- which decides its walls, water, rubble and pillars.
//   3. Every lot is a named PLACE with its bounds. The story, the art and the objectives
//      are written against places, not coordinates.
//   4. The spawn, keys and portal sites are chosen over places; bolts and coins are placed
//      by the 2D game's own rules (sim/gen.js). The level object has exactly the shape the
//      sim already plays, plus `places`, `avenues` and `size`.
//
// Connectivity is safe by construction rather than by retry. Every lot touches a street.
// Every obstacle dropped into open ground (a pillar, a stall, a wreck, a black box) must
// have a ring of open ground all round it, so it can always be walked round and can never
// seal anything off -- and since a later obstacle may not touch that ring, it stays open.
// A final flood fill walls up any pocket the human could not reach anyway.

import { TILE, createMap, blocksHuman, blocksAlien } from '../../sim/grid.js';
import { FieldPool, bfsField, UNREACHABLE, HUMAN, ALIEN } from '../../sim/pathfind.js';
import { buildRegions } from '../../sim/regions.js';
import { Rng, levelSeed } from '../../sim/prng.js';
import { levelParams } from '../../sim/difficulty.js';
import { scatterBolts, scatterCoins, verifyLevel } from '../../sim/gen.js';
import { sizeFor } from './size.js';

export const AVENUE_W = 3;
export const STREET_W = 2;
export const ALLEY_W = 1;
export const LOT_MAX_W = 22;
export const LOT_MAX_H = 16;
export const LOT_MIN = 7;

/** What a cell is part of. Kept for placement now and for the art (N4) later. */
export const CELL = Object.freeze({ LOT: 0, AVENUE: 1, STREET: 2, ALLEY: 3 });

export const PLACE_TYPES = Object.freeze(['tenements', 'plaza', 'market', 'yards', 'park', 'canal', 'depot', 'ruins']);
const TYPE_WEIGHT = Object.freeze({ tenements: 28, plaza: 10, market: 12, yards: 14, park: 10, canal: 6, depot: 10, ruins: 10 });
/** Lots that are mostly open ground: where the spawn and the black boxes go. */
const OPEN_TYPES = new Set(['plaza', 'market', 'yards', 'park', 'canal']);

const NAME_WORDS = Object.freeze([
  'Ash', 'Cinder', 'Kettle', 'Lantern', 'Mercy', 'Iron', 'Salt', 'Copper', 'Hollow', 'Cable',
  'Gutter', 'Tallow', 'Brass', 'Quarry', 'Needle', 'Harrow', 'Wick', 'Ferry', 'Tannery', 'Rook',
  'Vesper', 'Pike', 'Furnace', 'Lamb', 'Chapel', 'Weir', 'Bell', 'Flint', 'Slate', 'Gallows',
  'Tinker', 'Mirror', 'Orchard', 'Pylon', 'Saint Ide', 'Marrow', 'Coil', 'Dynamo', 'Glass', 'Hook',
  'Juniper', 'Kiln', 'Larch', 'Mast', 'Nettle', 'Oxbow', 'Pewter', 'Quill', 'Rivet', 'Sorrow',
  'Thimble', 'Umber', 'Vane', 'Wren', 'Yarrow', 'Zinc', 'Anchor', 'Barrow', 'Cobble', 'Drover',
  'Fathom', 'Gasket', 'Heron', 'Ingot', 'Jetty', 'Keel', 'Ledger', 'Mortar', 'Noon', 'Oriel',
  'Pallet', 'Rafter', 'Sexton', 'Trowel', 'Usher', 'Valve', 'Warden', 'Tolling', 'Lark', 'Cistern',
]);
const TYPE_SUFFIX = Object.freeze({
  tenements: ['Row', 'Courts', 'Terrace', 'Blocks'],
  plaza: ['Square', 'Plaza', 'Cross'],
  market: ['Market', 'Bazaar', 'Arcade'],
  yards: ['Yards', 'Lots', 'Sidings'],
  park: ['Park', 'Gardens', 'Green'],
  canal: ['Canal', 'Cut', 'Basin'],
  depot: ['Depot', 'Works', 'Sheds'],
  ruins: ['Ruins', 'Fall', 'Wreck'],
});
const AVENUE_SUFFIX = Object.freeze(['Avenue', 'Way', 'Road', 'Parade']);

/** Black boxes per district: they grow with the side of the map, not its area. */
export const safeBoxTarget = (area) => Math.round(3 * Math.sqrt(area));
/** Predictor regions: kept as large as on a 2D board would make them meaningless here. */
export const regionTarget = (area) => Math.min(48, Math.max(12, Math.round(12 * Math.sqrt(area / 5))));

const isOpen = (t) => t === TILE.FLOOR || t === TILE.COVER;

// ------------------------------------------------------------------ carving

function carve(map, role, x0, y0, w, h, tile, r) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = y * map.w + x;
      map.tiles[i] = tile;
      if (r != null) role[i] = r;
    }
  }
}

/**
 * Can a w x h obstacle go at (x0, y0)? Every cell must be plain floor and unprotected,
 * and the ring of cells round it must be open ground for both the human and the aliens.
 */
function canPlace(map, x0, y0, w, h, protectedCells) {
  if (x0 < 2 || y0 < 2 || x0 + w > map.w - 2 || y0 + h > map.h - 2) return false;
  for (let y = y0 - 1; y <= y0 + h; y++) {
    for (let x = x0 - 1; x <= x0 + w; x++) {
      const i = y * map.w + x;
      const inside = x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
      if (inside) {
        if (map.tiles[i] !== TILE.FLOOR || protectedCells.has(i)) return false;
      } else if (!isOpen(map.tiles[i])) return false;
    }
  }
  return true;
}

function place(map, x0, y0, w, h, tile, protectedCells) {
  if (!canPlace(map, x0, y0, w, h, protectedCells)) return false;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) map.tiles[y * map.w + x] = tile;
  return true;
}

/** Scatter `count` obstacles of random size inside a lot, by the ring rule. */
function scatterIn(map, rng, lot, count, sizes, tileFor, protectedCells) {
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 12; tries++) {
    const [w, h] = rng.pick(sizes);
    const x0 = lot.x + rng.int(Math.max(1, lot.w - w + 1));
    const y0 = lot.y + rng.int(Math.max(1, lot.h - h + 1));
    if (place(map, x0, y0, w, h, tileFor(), protectedCells)) placed++;
  }
  return placed;
}

/** Centres of `count` avenues across [1, len - 2], evenly spread with jitter. */
function avenueCentres(rng, len, count) {
  const out = [];
  const gap = (len - 2) / (count + 1);
  const lo = 1 + LOT_MIN + 1, hi = len - 2 - LOT_MIN - 1;
  for (let i = 1; i <= count; i++) {
    const c = Math.round(1 + gap * i + (rng.float() - 0.5) * gap * 0.36);
    out.push(Math.max(lo, Math.min(hi, c)));
  }
  return out;
}

/** The intervals of [1, len - 2] that the avenues leave, as [start, length]. */
function between(len, centres) {
  const out = [];
  let start = 1;
  for (const c of centres) {
    const end = c - 2;                       // the avenue covers c - 1 .. c + 1
    if (end >= start) out.push([start, end - start + 1]);
    start = c + 2;
  }
  if (len - 2 >= start) out.push([start, len - 2 - start + 1]);
  return out;
}

/** Cut a block with streets and alleys until every lot fits. */
function splitBlock(rng, map, role, rect, lots) {
  const { x, y, w, h } = rect;
  const tooWide = w > LOT_MAX_W, tooTall = h > LOT_MAX_H;
  if (!tooWide && !tooTall) { lots.push(rect); return; }
  const vertical = tooWide && (!tooTall || w / LOT_MAX_W >= h / LOT_MAX_H);
  const len = vertical ? w : h;
  const gapW = rng.float() < 0.3 ? ALLEY_W : STREET_W;
  const room = len - gapW - 2 * LOT_MIN;
  if (room < 0) { lots.push(rect); return; }
  const at = LOT_MIN + Math.round(((rng.float() + rng.float()) / 2) * room);
  const kind = gapW === ALLEY_W ? CELL.ALLEY : CELL.STREET;
  if (vertical) {
    carve(map, role, x + at, y, gapW, h, TILE.FLOOR, kind);
    splitBlock(rng, map, role, { x, y, w: at, h }, lots);
    splitBlock(rng, map, role, { x: x + at + gapW, y, w: w - at - gapW, h }, lots);
  } else {
    carve(map, role, x, y + at, w, gapW, TILE.FLOOR, kind);
    splitBlock(rng, map, role, { x, y, w, h: at }, lots);
    splitBlock(rng, map, role, { x, y: y + at + gapW, w, h: h - at - gapW }, lots);
  }
}

// ------------------------------------------------------------------ neighbourhoods

function chooseType(rng, lot) {
  const small = lot.w < LOT_MIN || lot.h < 5;
  const types = PLACE_TYPES.filter((t) => {
    if (small) return t === 'yards' || t === 'plaza' || t === 'tenements';
    if (t === 'depot') return lot.w >= 9 && lot.h >= 7;
    if (t === 'canal' || t === 'park') return lot.w >= 7 && lot.h >= 6;
    return true;
  });
  return types[rng.categorical(types.map((t) => TYPE_WEIGHT[t]))];
}

/**
 * Build one lot's interior. Returns the cell its place is centred on (where a portal may
 * open and a region may be seeded), before any check that it stayed open.
 */
function buildLot(map, role, rng, lot, protectedCells) {
  const { x, y, w, h } = lot;
  const W = map.w, H = map.h;
  const cx = x + (w >> 1), cy = y + (h >> 1);
  const rubble = () => TILE.BUILDING, wall = () => TILE.WALL;

  switch (lot.type) {
    case 'tenements': {
      // Solid blocks of flats, threaded by alleys that run edge to edge (so each one
      // reaches a street), with a courtyard on one of them.
      const rows = h >= 12 ? 2 : 1, cols = w >= 20 ? 2 : (w >= 10 || rng.bool(0.5) ? 1 : 0);
      const alleyRows = [], alleyCols = [];
      for (let k = 0; k < rows; k++) {
        const ay = y + Math.max(1, Math.min(h - 2, Math.round(((k + 1) * h) / (rows + 1)) + rng.range(-1, 1)));
        if (h >= 3) { carve(map, role, x, ay, w, 1, TILE.FLOOR, CELL.ALLEY); alleyRows.push(ay); }
      }
      for (let k = 0; k < cols; k++) {
        const ax = x + Math.max(1, Math.min(w - 2, Math.round(((k + 1) * w) / (cols + 1)) + rng.range(-1, 1)));
        if (w >= 3) { carve(map, role, ax, y, 1, h, TILE.FLOOR, CELL.ALLEY); alleyCols.push(ax); }
      }
      if (alleyRows.length && w >= 7 && h >= 7) {
        const ay = rng.pick(alleyRows);
        const cw = rng.range(3, Math.min(5, w - 2)), ch = rng.range(3, Math.min(4, h - 2));
        const qx = Math.max(x + 1, Math.min(x + w - 1 - cw, cx - (cw >> 1) + rng.range(-2, 2)));
        const qy = Math.max(y + 1, Math.min(y + h - 1 - ch, ay - (ch >> 1)));
        carve(map, role, qx, qy, cw, ch, TILE.FLOOR, CELL.LOT);
        return { x: qx + (cw >> 1), y: qy + (ch >> 1) };
      }
      if (alleyRows.length) return { x: cx, y: alleyRows[0] };
      if (alleyCols.length) return { x: alleyCols[0], y: cy };
      return null;                            // a solid block: a building, not a place to stand
    }
    case 'plaza': {
      carve(map, role, x, y, w, h, TILE.FLOOR, CELL.LOT);
      if (w >= 9 && h >= 9 && place(map, cx - 1, cy - 1, 2, 2, TILE.WALL, protectedCells)) {
        // a fountain: a plinth in a ring of water
        for (let yy = cy - 2; yy <= cy + 1; yy++) for (let xx = cx - 2; xx <= cx + 1; xx++) {
          const i = yy * W + xx;
          if (map.tiles[i] === TILE.FLOOR) map.tiles[i] = TILE.COVER;
        }
        scatterIn(map, rng, lot, Math.round((w * h) / 50), [[1, 1], [2, 1], [1, 2]], rubble, protectedCells);
        return { x: cx - 2, y: cy + 2 };
      }
      place(map, cx, cy, 1, 1, TILE.WALL, protectedCells);   // a monument
      scatterIn(map, rng, lot, Math.round((w * h) / 45), [[1, 1], [2, 1], [1, 2]], rubble, protectedCells);
      return { x: cx + 1, y: cy + 1 };
    }
    case 'market': {
      // an arcade: walled, with many ways in, and rows of stalls
      const inner = walledLot(map, role, rng, lot, 5);
      let row = 0;
      for (let yy = inner.y + 1; yy + 1 < inner.y + inner.h; yy += 3, row++) {
        for (let xx = inner.x + 1 + (row % 2) * 2; xx + 2 < inner.x + inner.w; xx += 4) {
          if (rng.float() < 0.75) place(map, xx, yy, 2, 1, rng.bool(0.5) ? TILE.WALL : TILE.BUILDING, protectedCells);
        }
      }
      return { x: cx, y: cy };
    }
    case 'yards': {
      // fenced yards with a gate or two a side, stacked with wrecks and crates
      if (w < LOT_MIN || h < 5) carve(map, role, x, y, w, h, TILE.FLOOR, CELL.LOT);
      const inner = w < LOT_MIN || h < 5 ? lot : walledLot(map, role, rng, lot, 9);
      scatterIn(map, rng, inner, Math.round((w * h) / 22), [[1, 1], [2, 1], [1, 2], [2, 2]], rubble, protectedCells);
      return { x: cx, y: cy };
    }
    case 'park': {
      // railed gardens with gates, a pond and trees
      walledLot(map, role, rng, lot, 6);
      const rx = Math.max(1, Math.floor(((w - 4) / 2) * (0.45 + 0.3 * rng.float())));
      const ry = Math.max(1, Math.floor(((h - 4) / 2) * (0.45 + 0.3 * rng.float())));
      for (let yy = cy - ry; yy <= cy + ry; yy++) for (let xx = cx - rx; xx <= cx + rx; xx++) {
        const dx = (xx - cx) / (rx + 0.5), dy = (yy - cy) / (ry + 0.5);
        if (dx * dx + dy * dy <= 1) map.tiles[yy * W + xx] = TILE.COVER;
      }
      scatterIn(map, rng, lot, Math.round((w * h) / 20), [[1, 1]], wall, protectedCells);   // trees
      return { x: Math.min(x + w - 1, cx + rx + 1), y: cy };
    }
    case 'canal': {
      carve(map, role, x, y, w, h, TILE.FLOOR, CELL.LOT);
      const along = w >= h;
      const bw = (along ? h : w) >= 10 ? 3 : 2;
      if (along) {
        const by = cy - (bw >> 1) + rng.range(-1, 1);
        carve(map, null, x, by, w, bw, TILE.COVER);
        return { x: cx, y: by > y + 1 ? by - 1 : by + bw };
      }
      const bx = cx - (bw >> 1) + rng.range(-1, 1);
      carve(map, null, bx, y, bw, h, TILE.COVER);
      return { x: bx > x + 1 ? bx - 1 : bx + bw, y: cy };
    }
    case 'depot': {
      // A walled hall with doors onto the streets and a grid of columns inside.
      carve(map, role, x + 1, y + 1, w - 2, h - 2, TILE.FLOOR, CELL.LOT);
      const sides = [];
      if (y > 1) sides.push('top');
      if (y + h < H - 1) sides.push('bottom');
      if (x > 1) sides.push('left');
      if (x + w < W - 1) sides.push('right');
      rng.shuffle(sides);
      const doors = Math.min(sides.length, w * h >= 220 ? 3 : 2);
      for (let k = 0; k < doors; k++) {
        const s = sides[k];
        if (s === 'top' || s === 'bottom') carve(map, role, x + 2 + rng.int(Math.max(1, w - 5)), s === 'top' ? y : y + h - 1, 2, 1, TILE.FLOOR, CELL.LOT);
        else carve(map, role, s === 'left' ? x : x + w - 1, y + 2 + rng.int(Math.max(1, h - 5)), 1, 2, TILE.FLOOR, CELL.LOT);
      }
      for (let yy = y + 3; yy < y + h - 3; yy += 4) for (let xx = x + 3; xx < x + w - 3; xx += 4) {
        place(map, xx, yy, 1, 1, TILE.WALL, protectedCells);
      }
      return { x: cx, y: cy };
    }
    case 'ruins':
    default: {
      // Collapsed blocks: rubble you must go round and they walk straight through, a few
      // standing wall stubs, and a cross of cleared paths out to the streets.
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        map.tiles[yy * W + xx] = rng.float() < 0.22 ? TILE.WALL : TILE.BUILDING;
        role[yy * W + xx] = CELL.LOT;
      }
      const py = cy + rng.range(-1, 1), px = cx + rng.range(-1, 1);
      carve(map, role, x, py, w, 1, TILE.FLOOR, CELL.LOT);
      carve(map, role, px, y, 1, h, TILE.FLOOR, CELL.LOT);
      carve(map, role, px - 1, py - 1, 3, 3, TILE.FLOOR, CELL.LOT);   // a clearing where they cross
      return { x: px, y: py };
    }
  }
}

/**
 * A walled lot: the perimeter stays wall, the inside is cleared, and gates are cut in
 * every side that faces a street (never the map's edge), about one per `every` cells.
 * This is what keeps a city reading as streets and enclosures rather than open fields.
 */
function walledLot(map, role, rng, lot, every) {
  const { x, y, w, h } = lot;
  carve(map, role, x + 1, y + 1, w - 2, h - 2, TILE.FLOOR, CELL.LOT);
  const sides = [];
  if (y > 1) sides.push('top');
  if (y + h < map.h - 1) sides.push('bottom');
  if (x > 1) sides.push('left');
  if (x + w < map.w - 1) sides.push('right');
  for (const side of sides) {
    const len = side === 'top' || side === 'bottom' ? w : h;
    const n = Math.max(1, Math.round((len - 2) / every));
    const gw = len >= 8 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const span = (len - 2 - gw) / n;
      const at = 1 + Math.round(span * k + rng.float() * Math.max(0, span - 1));
      if (side === 'top') carve(map, role, x + at, y, gw, 1, TILE.FLOOR, CELL.LOT);
      else if (side === 'bottom') carve(map, role, x + at, y + h - 1, gw, 1, TILE.FLOOR, CELL.LOT);
      else if (side === 'left') carve(map, role, x, y + at, 1, gw, TILE.FLOOR, CELL.LOT);
      else carve(map, role, x + w - 1, y + at, 1, gw, TILE.FLOOR, CELL.LOT);
    }
  }
  return { x: x + 1, y: y + 1, w: w - 2, h: h - 2 };
}

/** The open floor cell nearest a point, inside a rectangle; null if there is none. */
function nearestFloor(map, rect, px, py) {
  let best = null, bd = Infinity;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (map.tiles[y * map.w + x] !== TILE.FLOOR) continue;
      const d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < bd) { bd = d; best = { x, y }; }
    }
  }
  return best;
}

function nameFor(rng, type, used, words) {
  const suffixes = TYPE_SUFFIX[type];
  for (let k = 0; k < words.length * 2; k++) {
    const word = words[(used.cursor + k) % words.length];
    const name = `${word} ${rng.pick(suffixes)}`;
    if (!used.names.has(name)) { used.names.add(name); used.cursor = (used.cursor + k + 1) % words.length; return name; }
  }
  const name = `${words[used.cursor]} ${suffixes[0]} ${used.names.size}`;
  used.names.add(name);
  return name;
}

// ------------------------------------------------------------------ the district

/**
 * Generate one big district.
 * @param {string} profileId
 * @param {number} district
 * @param {object} [opts] { params, pool }
 */
export function generateCity(profileId, district, opts = {}) {
  const params = opts.params || levelParams(district);
  const size = sizeFor(district);
  const W = size.w, H = size.h, N = W * H;
  const pool = opts.pool && opts.pool.size === N ? opts.pool : new FieldPool(N);
  const baseSeed = levelSeed(profileId, district);
  const root = new Rng(baseSeed, `city:${district}`);
  const rng = root.fork('layout');

  const map = createMap(W, H, TILE.WALL);
  const role = new Uint8Array(N);

  // ---- 1. avenues
  const nv = Math.max(1, Math.round((W - 2) / 46));
  const nh = Math.max(1, Math.round((H - 2) / 40));
  const vx = avenueCentres(rng, W, nv), hy = avenueCentres(rng, H, nh);
  for (const c of vx) carve(map, role, c - 1, 1, AVENUE_W, H - 2, TILE.FLOOR, CELL.AVENUE);
  for (const c of hy) carve(map, role, 1, c - 1, W - 2, AVENUE_W, TILE.FLOOR, CELL.AVENUE);

  // ---- 2. blocks, streets, lots
  const lots = [];
  for (const [by, bh] of between(H, hy)) {
    for (const [bx, bw] of between(W, vx)) splitBlock(rng, map, role, { x: bx, y: by, w: bw, h: bh }, lots);
  }

  // ---- 3. neighbourhoods
  const protectedCells = new Set();
  const lotRng = root.fork('lots');
  const centres = lots.map((lot) => {
    lot.type = chooseType(lotRng, lot);
    return buildLot(map, role, lotRng, lot, protectedCells);
  });

  // ---- 4. wall up anything the human cannot reach from the first crossing
  {
    const buf = pool.take();
    const dist = bfsField(map, vx[0], hy[0], buf, HUMAN);
    for (let i = 0; i < N; i++) {
      if (!blocksHuman(map.tiles[i]) && dist[i] === UNREACHABLE) map.tiles[i] = TILE.WALL;
    }
    pool.give(buf);
  }

  // ---- 5. places
  const nameRng = root.fork('names');
  const words = nameRng.shuffle(NAME_WORDS.slice());
  const used = { names: new Set(), cursor: 0 };
  const places = [];
  lots.forEach((lot, k) => {
    const c = centres[k];
    const centre = c && map.tiles[c.y * W + c.x] === TILE.FLOOR ? c : nearestFloor(map, lot, c ? c.x : lot.x + (lot.w >> 1), c ? c.y : lot.y + (lot.h >> 1));
    places.push({
      id: places.length, name: nameFor(nameRng, lot.type, used, words), type: lot.type,
      x: lot.x, y: lot.y, w: lot.w, h: lot.h, centre,
    });
  });
  const avenues = [
    ...vx.map((c) => ({ axis: 'x', at: c, w: AVENUE_W })),
    ...hy.map((c) => ({ axis: 'y', at: c, w: AVENUE_W })),
  ].map((a) => ({ ...a, name: `${words[(used.cursor++) % words.length]} ${nameRng.pick(AVENUE_SUFFIX)}` }));

  // ---- 6. spawn: in an open place, else on the first crossing
  const pickRng = root.fork('objectives');
  const openPlaces = places.filter((p) => p.centre && OPEN_TYPES.has(p.type));
  const spawnPlace = openPlaces.length ? pickRng.pick(openPlaces) : null;
  const spawn = spawnPlace ? { ...spawnPlace.centre } : { x: vx[0], y: hy[0] };
  protectedCells.add(spawn.y * W + spawn.x);

  // ---- 7. keys: spread out, each in its own place, far from the spawn and each other
  const buf = pool.take();
  const fromSpawn = Int16Array.from(bfsField(map, spawn.x, spawn.y, buf, HUMAN));
  const cand = places.filter((p) => p.centre && p !== spawnPlace && fromSpawn[p.centre.y * W + p.centre.x] !== UNREACHABLE);
  const minD = new Map(cand.map((p) => [p, fromSpawn[p.centre.y * W + p.centre.x]]));
  const caches = [];
  const keyPlaces = [];
  for (let c = 0; c < params.caches && minD.size; c++) {
    const ranked = [...minD.entries()].sort((a, b) => b[1] - a[1] || a[0].id - b[0].id);
    const top = ranked.slice(0, Math.max(3, Math.ceil(ranked.length * 0.15)));
    const p = top[pickRng.int(top.length)][0];
    const cells = [];
    for (let yy = p.y; yy < p.y + p.h; yy++) for (let xx = p.x; xx < p.x + p.w; xx++) {
      const i = yy * W + xx;
      if (map.tiles[i] === TILE.FLOOR && !protectedCells.has(i) && fromSpawn[i] !== UNREACHABLE) cells.push({ x: xx, y: yy });
    }
    minD.delete(p);
    if (!cells.length) { c--; continue; }
    const k = pickRng.pick(cells);
    caches.push({ x: k.x, y: k.y, collected: false });
    keyPlaces.push(p.id);
    protectedCells.add(k.y * W + k.x);
    const d = bfsField(map, k.x, k.y, buf, HUMAN);
    for (const [q, v] of minD) {
      const dq = d[q.centre.y * W + q.centre.x];
      if (dq !== UNREACHABLE && dq < v) minD.set(q, dq);
    }
  }
  pool.give(buf);
  for (const p of places) if (p.centre) protectedCells.add(p.centre.y * W + p.centre.x);

  // ---- 8. black boxes, in open places, by the ring rule
  const safeRng = root.fork('safe');
  const safeBoxes = [];
  const safeWant = safeBoxTarget(size.area);
  const hosts = safeRng.shuffle(places.filter((q) => OPEN_TYPES.has(q.type)));
  for (let pass = 0; pass < 3 && safeBoxes.length < safeWant; pass++) for (const p of hosts) {
    if (safeBoxes.length >= safeWant) break;
    for (let tries = 0; tries < 10; tries++) {
      const bw = safeRng.range(2, 3), bh = safeRng.range(1, 2);
      const x0 = p.x + safeRng.int(Math.max(1, p.w - bw + 1)), y0 = p.y + safeRng.int(Math.max(1, p.h - bh + 1));
      if (!place(map, x0, y0, bw, bh, TILE.SAFE, protectedCells)) continue;
      const cells = [];
      for (let yy = y0; yy < y0 + bh; yy++) for (let xx = x0; xx < x0 + bw; xx++) cells.push(yy * W + xx);
      safeBoxes.push({ x0, y0, w: bw, h: bh, cells, place: p.id });
      break;
    }
  }

  // ---- 9. water: top up to the district's density with puddles by the walls
  const waterRng = root.fork('water');
  let floor = 0, water = 0;
  for (let i = 0; i < N; i++) { if (map.tiles[i] === TILE.FLOOR) floor++; else if (map.tiles[i] === TILE.COVER) water++; }
  const waterWant = Math.round((floor + water) * params.coverDensity) - water;
  if (waterWant > 0) {
    // weighted sampling without replacement: smallest -ln(u) / weight first
    const keyed = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (map.tiles[i] !== TILE.FLOOR || protectedCells.has(i)) continue;
      let adj = 0;
      if (!isOpen(map.tiles[i - 1])) adj++;
      if (!isOpen(map.tiles[i + 1])) adj++;
      if (!isOpen(map.tiles[i - W])) adj++;
      if (!isOpen(map.tiles[i + W])) adj++;
      keyed.push({ i, k: -Math.log(waterRng.unit()) / (1 + adj * 0.8) });
    }
    keyed.sort((a, b) => a.k - b.k || a.i - b.i);
    for (let n = 0; n < waterWant && n < keyed.length; n++) map.tiles[keyed[n].i] = TILE.COVER;
  }

  // ---- 10. regions, bolts and coins, by the 2D game's rules
  const regions = buildRegions(map, [spawn], regionTarget(size.area), pool);
  const taken = new Set(protectedCells);
  const bolts = scatterBolts(map, root.fork('bolts'), regions, params.boltsPerDistrict, taken);
  const { coins, value: coinValue } = scatterCoins(map, root.fork('coins'), regions, params.coinValuePerLevel, taken);

  // ---- 11. portal sites: every place's centre, furthest from the spawn first
  const buf2 = pool.take();
  const after = Int16Array.from(bfsField(map, spawn.x, spawn.y, buf2, HUMAN));
  pool.give(buf2);
  const portalCandidates = places
    .filter((p) => p.centre && p !== spawnPlace)
    .map((p) => ({ x: p.centre.x, y: p.centre.y, room: p.id, dist: after[p.centre.y * W + p.centre.x] }))
    .filter((p) => p.dist !== UNREACHABLE)
    .sort((a, b) => b.dist - a.dist || a.room - b.room);

  let walkable = 0, coverCount = 0;
  for (let i = 0; i < N; i++) {
    if (!blocksHuman(map.tiles[i])) walkable++;
    if (map.tiles[i] === TILE.COVER) coverCount++;
  }

  return {
    profileId,
    level: district,
    ruleset: 'next',
    seed: baseSeed,
    attempt: 0,
    params,
    size,
    map,
    role,
    rooms: places.map((p) => ({ x0: p.x, y0: p.y, w: p.w, h: p.h, cx: p.centre ? p.centre.x : p.x, cy: p.centre ? p.centre.y : p.y })),
    places,
    avenues,
    spawnPlace: spawnPlace ? spawnPlace.id : -1,
    keyPlaces,
    spawn,
    caches,
    portalCandidates,
    bolts,
    coins,
    buildings: [],
    safeBoxes,
    regions,
    stats: {
      walkable,
      places: places.length,
      coverCount,
      safeBoxCount: safeBoxes.length,
      boltCount: bolts.length,
      coinCount: coins.length,
      coinValue,
      furthestPortal: portalCandidates.length ? portalCandidates[0].dist : 0,
    },
  };
}

/**
 * Everything criterion 3D-21 asks of one city, beyond the 2D game's own verifyLevel:
 * the size on the curve, aliens able to reach all the open ground, places not overlapping.
 */
export function verifyCity(level, pool) {
  const problems = [];
  const { map } = level;
  const N = map.tiles.length;
  const p = pool && pool.size === N ? pool : new FieldPool(N);
  const want = sizeFor(level.level);
  if (map.w !== want.w || map.h !== want.h) problems.push(`size ${map.w}x${map.h}, curve says ${want.w}x${want.h}`);
  const v = verifyLevel(level, p);
  if (!v.ok) problems.push(`human: ${v.bad.length ? JSON.stringify(v.bad[0]) : `${v.total - v.reached} cells unreachable`}`);
  if (level.caches.length !== level.params.caches) problems.push(`${level.caches.length} keys, wanted ${level.params.caches}`);
  if (level.portalCandidates.length === 0) problems.push('no portal site');

  const buf = p.take();
  const dist = bfsField(map, level.spawn.x, level.spawn.y, buf, ALIEN);
  let missed = 0;
  for (let i = 0; i < N; i++) {
    const t = map.tiles[i];
    if (blocksHuman(t) || blocksAlien(t)) continue;
    if (dist[i] === UNREACHABLE) missed++;
  }
  p.give(buf);
  if (missed) problems.push(`${missed} open cells no alien can reach`);

  const owner = new Int32Array(N).fill(-1);
  for (const pl of level.places) {
    for (let y = pl.y; y < pl.y + pl.h; y++) for (let x = pl.x; x < pl.x + pl.w; x++) {
      const i = y * map.w + x;
      if (owner[i] >= 0) { problems.push(`places ${owner[i]} and ${pl.id} overlap`); y = Infinity; break; }
      owner[i] = pl.id;
    }
  }
  const names = new Set(level.places.map((q) => q.name));
  if (names.size !== level.places.length) problems.push('duplicate place names');
  return { ok: problems.length === 0, problems };
}
