// sim3d/raycast.js -- grid ray marching. Pure.
//
// Amanatides & Woo: walk the cells a segment crosses, in order, without sampling. Used to
// validate a stun shot (walls and rubble stop it, water does not) and by the renderer's
// lock-on, so the crosshair and the sim agree about what can be hit.

import { TILE } from '../sim/grid.js';

/** What a stun shot cannot pass through. */
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
