// sim/grid.js -- the map format. Four tile types, one flat typed array, zero DOM.

export const GRID_W = 32;
export const GRID_H = 20;

export const TILE = Object.freeze({
  /** Open ground. */
  FLOOR: 0,
  /** Solid. Nothing crosses it, human or alien. */
  WALL: 1,
  /** Water. Standing in it halves the radius at which an alien can see you. */
  COVER: 2,
  /** The portal out. Only exists once every key is collected. */
  DROP: 3,
  /**
   * A broken building. The human cannot climb it; the aliens go straight through.
   *
   * This is the first thing in the project where the two agent types do not share a
   * movement rule, and it is load-bearing rather than cosmetic: it means every distance
   * field now has to declare whose distance it is measuring. The two predicates below
   * are the only legitimate way to ask.
   */
  BUILDING: 4,
});

export const TILE_NAME = ['floor', 'wall', 'water', 'portal', 'building'];

/** What stops the human. */
export const blocksHuman = (t) => t === TILE.WALL || t === TILE.BUILDING;
/** What stops an alien. Rubble is not an obstacle to something that flows through it. */
export const blocksAlien = (t) => t === TILE.WALL;

/**
 * Directions, in a fixed order that must never be reshuffled: the index is written
 * into the tick log and into the dossier's heading statistics.
 * -1 means "stay put", which is a legal input and a meaningful one (pause traits).
 */
export const DIRS = Object.freeze([
  { dx: 0, dy: -1, name: 'up' },
  { dx: 1, dy: 0, name: 'right' },
  { dx: 0, dy: 1, name: 'down' },
  { dx: -1, dy: 0, name: 'left' },
]);

export const STAY = -1;

/** The direction that undoes dir. Used by the backtrack-rate trait. */
export function opposite(dir) {
  return dir < 0 ? STAY : (dir + 2) % 4;
}

export function createMap(w = GRID_W, h = GRID_H, fill = TILE.WALL) {
  const tiles = new Uint8Array(w * h);
  if (fill !== 0) tiles.fill(fill);
  return { w, h, tiles };
}

export function cloneMap(map) {
  return { w: map.w, h: map.h, tiles: map.tiles.slice() };
}

export const idx = (map, x, y) => y * map.w + x;

export function inBounds(map, x, y) {
  return x >= 0 && y >= 0 && x < map.w && y < map.h;
}

export function tileAt(map, x, y) {
  return inBounds(map, x, y) ? map.tiles[y * map.w + x] : TILE.WALL;
}

export function setTile(map, x, y, t) {
  if (inBounds(map, x, y)) map.tiles[y * map.w + x] = t;
}

/**
 * Can the HUMAN stand here? This is the default sense of "walkable" throughout the
 * project: districts, objectives, level connectivity and the bots all mean the human's
 * world when they say walkable.
 */
export function isWalkable(map, x, y) {
  return inBounds(map, x, y) && !blocksHuman(map.tiles[y * map.w + x]);
}

export function isWalkableIdx(map, i) {
  return !blocksHuman(map.tiles[i]);
}

/** Can an ALIEN stand here? Everything but solid wall. */
export function isAlienPassable(map, x, y) {
  return inBounds(map, x, y) && !blocksAlien(map.tiles[y * map.w + x]);
}

export function isAlienPassableIdx(map, i) {
  return !blocksAlien(map.tiles[i]);
}

/** Count of walkable 4-neighbours. 1 = dead end, 2 = corridor, 3+ = junction or room. */
export function degree(map, x, y) {
  let d = 0;
  for (let i = 0; i < 4; i++) {
    if (isWalkable(map, x + DIRS[i].dx, y + DIRS[i].dy)) d++;
  }
  return d;
}

/** Does this cell touch a wall (including the implicit wall outside the grid)? */
export function wallAdjacent(map, x, y) {
  for (let i = 0; i < 4; i++) {
    if (!isWalkable(map, x + DIRS[i].dx, y + DIRS[i].dy)) return true;
  }
  return false;
}

export function walkableCells(map) {
  const out = [];
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (!blocksHuman(map.tiles[y * map.w + x])) out.push({ x, y });
    }
  }
  return out;
}

export const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
export const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
export const euclid = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

/** Serialise a map to a compact string -- used by the determinism tests and the bench cache. */
export function mapToString(map) {
  const glyph = ['.', '#', '~', 'O', 'B'];
  const rows = [];
  for (let y = 0; y < map.h; y++) {
    let r = '';
    for (let x = 0; x < map.w; x++) r += glyph[map.tiles[y * map.w + x]];
    rows.push(r);
  }
  return rows.join('\n');
}
