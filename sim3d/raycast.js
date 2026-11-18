// sim3d/raycast.js -- grid ray marching. Pure.
//
// Amanatides & Woo: walk the cells a segment crosses, in order, without sampling.
// lineOfSight() is the flat test (walls and rubble block, water does not) the aliens'
// arrivals and travel use. shotClear() is the stun gun's: the same walk with heights, so
// a shot passes over a rubble heap whenever the line you see along clears it. The sim
// and the renderer's lock-on both call it, so the crosshair and the sim agree.

import { TILE } from '../sim/grid.js';

/** What blocks the flat line of sight (arrivals, travel, the classic stun test). */
export const opaqueToShot = (t) => t === TILE.WALL || t === TILE.BUILDING;

/**
 * Walk the cells from (x0,y0) to (x1,y1), in cell units. Calls visit(cx, cy) for each cell
 * the segment touches after the starting one, in order, including the end cell. Stops early if visit returns
 * true, and returns that cell.
 */
export function marchCells(x0, y0, x1, y1, visit) {
  let cx = Math.floor(x0), cy = Math.floor(y0);
  const ex = Math.floor(x1), ey = Math.floor(y1);
  const dx = x1 - x0, dy = y1 - y0;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = stepX > 0 ? (cx + 1 - x0) / dx : stepX < 0 ? (x0 - cx) / -dx : Infinity;
  let tMaxY = stepY > 0 ? (cy + 1 - y0) / dy : stepY < 0 ? (y0 - cy) / -dy : Infinity;
  let guard = Math.abs(ex - cx) + Math.abs(ey - cy) + 2;
  while ((cx !== ex || cy !== ey) && guard-- > 0) {
    if (Math.abs(tMaxX - tMaxY) < 1e-9) {
      // Exactly through a corner. Both cells beside the corner are touched, so both are
      // visited: a shot cannot squeeze between two blocks that meet corner to corner,
      // which on screen read as a solid seam.
      if (visit(cx + stepX, cy)) return { x: cx + stepX, y: cy };
      if (visit(cx, cy + stepY)) return { x: cx, y: cy + stepY };
      cx += stepX; cy += stepY; tMaxX += tDeltaX; tMaxY += tDeltaY;
      guard--;
    } else if (tMaxX < tMaxY) { cx += stepX; tMaxX += tDeltaX; }
    else { cy += stepY; tMaxY += tDeltaY; }
    if (visit(cx, cy)) return { x: cx, y: cy };
  }
  return null;
}

/**
 * True if nothing opaque lies on the segment, start cell excluded and end cell included:
 * an alien standing in rubble is behind rubble.
 */
export function lineOfSight(map, x0, y0, x1, y1, opaque = opaqueToShot) {
  const hit = marchCells(x0, y0, x1, y1, (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return true;
    return opaque(map.tiles[cy * map.w + cx]);
  });
  return hit === null;
}

/** The part [t0, t1] of the segment (x0,y0)+t(dx,dy), t in [0,1], inside cell (cx, cy). */
function cellSpan(x0, y0, dx, dy, cx, cy) {
  let t0 = 0, t1 = 1;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (!clip(-dx, x0 - cx) || !clip(dx, cx + 1 - x0) || !clip(-dy, y0 - cy) || !clip(dy, cy + 1 - y0)) return [0, 1];
  return [t0, t1];
}

/**
 * Can a shot travel from (x0, y0) at height h0 to (x1, y1) at height h1? Positions in
 * cells, heights in metres, tops from solid.js solidTops(). A cell stops the shot if the
 * line is anywhere below its top while inside it. Start cell excluded, end cell included
 * (an alien's legs in a rubble heap are behind the heap; its head above it is not).
 * Off the map is solid.
 */
export function shotClear(map, tops, x0, y0, h0, x1, y1, h1) {
  const dx = x1 - x0, dy = y1 - y0, dh = h1 - h0;
  const hit = marchCells(x0, y0, x1, y1, (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return true;
    const top = tops[cy * map.w + cx];
    if (!(top > 0)) return false;
    const [t0, t1] = cellSpan(x0, y0, dx, dy, cx, cy);
    return Math.min(h0 + dh * t0, h0 + dh * t1) < top;
  });
  return hit === null;
}

/**
 * N6.1: where a thrown item comes down. The ray starts at (x0, y0) in cells at height h0
 * in metres and runs along (dx, dy) cells and dh metres per unit. It is traced over the
 * grid with heights (tops from solid.js: walls solid at any height, a rubble heap up to
 * its top): if it meets something solid, the item drops in the last open cell before it;
 * if it meets the ground first, it lands where it does. No range: it runs to the edge of
 * the map, and off the map nothing lands. Returns { x, y, px, py } -- the landing cell
 * and the point (in cells) -- or null.
 */
export function throwLanding(map, tops, x0, y0, h0, dx, dy, dh) {
  const { w, h } = map;
  const sx = Math.floor(x0), sy = Math.floor(y0);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const solidAt = (cx, cy, hgt) => cx < 0 || cy < 0 || cx >= w || cy >= h || hgt < tops[cy * w + cx];
  // straight down (or up): only the cell you stand in
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return dh < 0 ? { x: sx, y: sy, px: x0, py: y0 } : null;
  // the parameter at which the ray leaves the map horizontally
  let tEnd = Infinity;
  if (dx > 0) tEnd = Math.min(tEnd, (w - x0) / dx); else if (dx < 0) tEnd = Math.min(tEnd, -x0 / dx);
  if (dy > 0) tEnd = Math.min(tEnd, (h - y0) / dy); else if (dy < 0) tEnd = Math.min(tEnd, -y0 / dy);
  const x1 = x0 + dx * tEnd, y1 = y0 + dy * tEnd, ddx = x1 - x0, ddy = y1 - y0, dH = dh * tEnd;
  const groundAt = (u) => ({ px: x0 + ddx * u, py: y0 + ddy * u });
  // in the start cell itself it can only reach the ground
  const [, s1] = cellSpan(x0, y0, ddx, ddy, sx, sy);
  if (h0 + dH * s1 <= 0) { const u = h0 / -dH; return { x: sx, y: sy, ...groundAt(u) }; }
  let last = { x: sx, y: sy }, out = null;
  marchCells(x0, y0, x1 - Math.sign(ddx) * 1e-9, y1 - Math.sign(ddy) * 1e-9, (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) return true;
    const [t0, t1] = cellSpan(x0, y0, ddx, ddy, cx, cy);
    const hIn = h0 + dH * t0, hOut = h0 + dH * t1;
    if (solidAt(cx, cy, Math.min(hIn, hOut))) {
      // it hit something solid in this cell: it falls short, into the cell before
      const c = { x: last.x + 0.5, y: last.y + 0.5 };
      out = { x: last.x, y: last.y, px: c.x, py: c.y };
      return true;
    }
    if (hOut <= 0) {
      const u = h0 / -dH;
      out = { x: cx, y: cy, ...groundAt(u) };
      return true;
    }
    last = { x: cx, y: cy };
    return false;
  });
  return out;
}
