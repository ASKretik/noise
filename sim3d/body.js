// sim3d/body.js -- the continuous player body. Pure.
//
// Positions are in CELL units with the origin at the map's top-left corner, so the centre
// of cell (x, y) is (x + 0.5, y + 0.5). The renderer multiplies by CELL_M. Working in cells
// keeps every comparison with the sim exact and free of a scale factor.
//
// The body is a circle that slides along whatever `blocked(cx, cy)` says is solid. The
// caller decides what is solid -- human-blocked tiles plus whatever the leash forbids --
// so this module knows nothing about the sim's rules.

import { BODY_RADIUS_M, CELL_M } from './units.js';

export const BODY_RADIUS = BODY_RADIUS_M / CELL_M;
/** How fast velocity approaches its target, per second. ~0.12 s to full speed. */
export const RESPONSE = 18;
/**
 * Spare sim capacity kept on a pure diagonal, as a fraction of top speed (scaled down
 * toward zero for straight lines). The smallest values with no stalled frames at any
 * heading from 0 to 45 degrees.
 */
export const WALK_DIAGONAL_HEADROOM = 0.10;
export const SPRINT_DIAGONAL_HEADROOM = 0.25;
/** Largest distance moved in one collision substep, in cells. Under the radius. */
const MAX_SUBSTEP = 0.1;

export function createBody(cx, cy) {
  return { x: cx + 0.5, y: cy + 0.5, vx: 0, vy: 0 };
}

export function placeBody(body, cx, cy) {
  body.x = cx + 0.5; body.y = cy + 0.5; body.vx = 0; body.vy = 0;
}

export const bodyCell = (body) => ({ x: Math.floor(body.x), y: Math.floor(body.y) });

/**
 * Advance the body by dt seconds.
 * @param {object} body
 * @param {number} ix,iy   desired direction in grid space; length is clamped to 1
 * @param {number} maxSpeed cells per second
 * @param {number} dt       seconds
 * @param {(cx:number, cy:number) => boolean} blocked
 * @param {number} [response] how fast velocity approaches its target, per second
 * @param {{sprint?: boolean}} [opts]
 */
export function moveBody(body, ix, iy, maxSpeed, dt, blocked, response = RESPONSE, opts = {}) {
  const len = Math.hypot(ix, iy);
  if (len > 1) { ix /= len; iy /= len; }
  let tx = ix * maxSpeed;
  let ty = iy * maxSpeed;
  // Speed is capped in the grid's own metric. The sim crosses at most `maxSpeed` cells
  // per second ACROSS PLUS ALONG -- it cannot step diagonally -- so a body moving at
  // `maxSpeed` on a diagonal would outrun it by 41% and slam into the leash every few
  // frames. That stop-start was the "discrete, laggy" movement of builds 2-9.
  //
  // Off-axis, the cap also leaves some headroom. At exactly the sim's capacity, every
  // tick on which the body has not quite crossed into the next cell is a step lost for
  // good, the lag builds, and the body meets the leash anyway. A few percent of spare
  // capacity lets the sim catch up instead. Straight lines need none: their crossings
  // land on the same tick phase every time. Measured in decisions.md R39.
  const l1 = Math.abs(tx) + Math.abs(ty);
  const diag = l1 > 0 ? (2 * Math.min(Math.abs(tx), Math.abs(ty))) / l1 : 0;
  const cap = maxSpeed * (1 - (opts.sprint ? SPRINT_DIAGONAL_HEADROOM : WALK_DIAGONAL_HEADROOM) * diag);
  if (l1 > cap) { tx *= cap / l1; ty *= cap / l1; }
  const k = 1 - Math.exp(-response * dt);
  body.vx += (tx - body.vx) * k;
  body.vy += (ty - body.vy) * k;
  // Settle to rest instead of creeping forever.
  if (len === 0 && Math.hypot(body.vx, body.vy) < 0.02) { body.vx = 0; body.vy = 0; }

  const dist = Math.hypot(body.vx, body.vy) * dt;
  const n = Math.max(1, Math.ceil(dist / MAX_SUBSTEP));
  const sx = (body.vx * dt) / n;
  const sy = (body.vy * dt) / n;
  for (let i = 0; i < n; i++) {
    body.x += sx;
    body.y += sy;
    resolve(body, blocked);
  }
}

/** Push the circle out of every blocked cell it overlaps, and cancel velocity into them. */
export function resolve(body, blocked, r = BODY_RADIUS) {
  for (let iter = 0; iter < 4; iter++) {
    let pushed = false;
    const x0 = Math.floor(body.x - r), x1 = Math.floor(body.x + r);
    const y0 = Math.floor(body.y - r), y1 = Math.floor(body.y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!blocked(cx, cy)) continue;
        const nx = Math.max(cx, Math.min(body.x, cx + 1));
        const ny = Math.max(cy, Math.min(body.y, cy + 1));
        let dx = body.x - nx, dy = body.y - ny;
        let d = Math.hypot(dx, dy);
        if (d >= r) continue;
        if (d < 1e-9) {
          // Centre inside the block: leave by the nearest face.
          const faces = [
            [body.x - cx, -1, 0], [cx + 1 - body.x, 1, 0],
            [body.y - cy, 0, -1], [cy + 1 - body.y, 0, 1],
          ].sort((a, b) => a[0] - b[0]);
          const [depth, fx, fy] = faces[0];
          body.x += fx * (depth + r); body.y += fy * (depth + r);
          dx = fx; dy = fy; d = 1;
        } else {
          const push = r - d;
          dx /= d; dy /= d;
          body.x += dx * push; body.y += dy * push;
        }
        const into = body.vx * dx + body.vy * dy;
        if (into < 0) { body.vx -= into * dx; body.vy -= into * dy; }
        pushed = true;
      }
    }
    if (!pushed) return;
  }
}
