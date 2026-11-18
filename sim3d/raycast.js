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
