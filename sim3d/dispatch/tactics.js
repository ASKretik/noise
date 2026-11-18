// sim3d/dispatch/tactics.js -- where the aliens go to use what the Dispatch knows. Pure.
//
// Each habit in the file (habits.js) has a tactic, and each tactic is a few target cells
// worked out from the map and from the route you are likely to walk next -- the shortest
// walk to the nearest key you still need, or to the portal once it is open. The squad
// (Game3DNext._coordinate) sends round(TACTIC_ALIENS x strength) aliens to them, the
// nearest first, and plans the rest exactly as before. At strength 0 a tactic does not
// exist, so a player without the habit plays the same game as before.
//
//   hide    once you have gone to ground: search the water nearest where you were last
//           seen (or are now), and in a black box, wait outside the exit nearest your next
//           key. Nothing while you are simply walking: sending aliens to water ahead of a
//           hider who is not hiding only took them off a plan that was working (R60)
//   corner  just round the wall corners on your route
//   lost    the middle of your route: between you and the key you need
//   run     (during a chase) the place you would run to: the open ground 5-11 cells from
//           you that is furthest from every alien -- near enough to be reached in time
//   map     not a target list: see Game3DNext -- when you stand still with the map open,
//           the nearest aliens walk to where you are
//
// Every one of these is an ordinary destination: the aliens walk there at their ordinary
// speeds, by the ordinary rules, and you can see them coming on the minimap.

import { DIRS, TILE, isSharedGround } from '../../sim/grid.js';
import { UNREACHABLE } from '../../sim/pathfind.js';

/** Aliens a tactic may take at full strength. */
export const TACTIC_ALIENS = 3;

/**
 * The cells you would walk to reach your next objective, nearest first: down the field to
 * the nearest uncollected key, or to the portal once every key is in.
 */
export function routeAhead(game, max = 300) {
  const w = game.map.w;
  const f = game.caches.length - game.collected > 0 ? game.fieldCaches() : game._dropField;
  const out = [];
  if (!f) return out;
  let x = game.player.x, y = game.player.y;
  let d = f[y * w + x];
  if (d === UNREACHABLE || d <= 0) return out;
  for (let s = 0; s < max && d > 0; s++) {
    let best = -1, bd = d;
    for (let k = 0; k < 4; k++) {
      const v = f[(y + DIRS[k].dy) * w + x + DIRS[k].dx];
      if (v !== UNREACHABLE && v >= 0 && v < bd) { bd = v; best = k; }
    }
    if (best < 0) break;
    x += DIRS[best].dx; y += DIRS[best].dy; d = bd;
    out.push({ x, y });
  }
  return out;
}

/** Up to `n` picks from candidates (in route order), at least `gap` route steps apart. */
function spaced(cands, n, gap) {
  const out = [];
  for (const c of cands) {
    if (out.length >= n) break;
    if (out.some((o) => Math.abs(o.at - c.at) < gap)) continue;
    out.push(c);
  }
  return out;
}

/** The ground cells round the black box you are standing in. */
function boxExits(game) {
  const { map } = game;
  const w = map.w;
  const start = game.player.y * w + game.player.x;
  const seen = new Set([start]), stack = [start], exits = [];
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i - x) / w;
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy, j = ny * w + nx;
      if (seen.has(j)) continue;
      seen.add(j);
      if (map.tiles[j] === TILE.SAFE) stack.push(j);
      else if (isSharedGround(map, nx, ny)) exits.push({ x: nx, y: ny });
    }
  }
  return exits;
}

/**
 * Target cells for one tactic, right now.
 * @param {object} game     a Game3DNext
 * @param {string} key      'hide' | 'corner' | 'lost' | 'run'
 * @param {{at:Uint8Array}} corners  cornerMask(map)
 */
export function tacticTargets(game, key, corners) {
  const { map } = game;
  const w = map.w;
  if (key === 'run') {
    const fp = game.fieldPlayer(), fa = game.fieldPatrols();
    let best = null, bs = -Infinity;
    const R = 11;
    for (let y = Math.max(1, game.player.y - R); y <= Math.min(map.h - 2, game.player.y + R); y++) {
      for (let x = Math.max(1, game.player.x - R); x <= Math.min(map.w - 2, game.player.x + R); x++) {
        const i = y * w + x, dp = fp[i];
        if (dp < 5 || dp > 11 || !isSharedGround(map, x, y)) continue;
        const da = fa[i] === UNREACHABLE ? 99 : fa[i];
        if (da - dp > bs) { bs = da - dp; best = { x, y }; }
      }
    }
    return best ? [best] : [];
  }
  if (key === 'hide') {
    if (game.inSafeBox) {
      const exits = boxExits(game);
      if (!exits.length) return [];
      const f = game.caches.length - game.collected > 0 ? game.fieldCaches() : game._dropField;
      exits.sort((a, b) => (f[a.y * w + a.x] ?? 0) - (f[b.y * w + b.x] ?? 0) || a.y - b.y || a.x - b.x);
      return [exits[0]];
    }
    const hidden = game.onCover;
    const anchor = game.lastKnown || (hidden ? game.player : null);
    if (!anchor) return [];
    const R = 10, cands = [];
    for (let y = Math.max(1, anchor.y - R); y <= Math.min(map.h - 2, anchor.y + R); y++) {
      for (let x = Math.max(1, anchor.x - R); x <= Math.min(map.w - 2, anchor.x + R); x++) {
        if (map.tiles[y * w + x] === TILE.COVER) cands.push({ x, y, d: (x - anchor.x) ** 2 + (y - anchor.y) ** 2 });
      }
    }
    cands.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
    const out = [];
    for (const c of cands) {
      if (out.length >= 2) break;
      if (out.some((o) => Math.abs(o.x - c.x) + Math.abs(o.y - c.y) < 4)) continue;
      out.push({ x: c.x, y: c.y });
    }
    return out;
  }
  const route = routeAhead(game);
  if (route.length < 8) return [];
  if (key === 'lost') return [route[Math.floor(route.length * 0.55)]];
  const cands = [];
  for (let at = 6; at < Math.min(route.length, 70); at++) {
    const c = route[at];
    if (key === 'corner') {
      if (corners.at[c.y * w + c.x]) cands.push({ ...route[Math.min(route.length - 1, at + 2)], at });
    }
  }
  return spaced(cands, 2, 6).map(({ x, y }) => ({ x, y }));
}
