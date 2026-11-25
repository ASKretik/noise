// bench3d/criteria/smooth.js -- 3D-13: the body never stutters.
//
// Builds 2-9 passed every other criterion and still moved in stops and starts off-axis:
// at 20 degrees the body stalled on a quarter of frames, at exactly 45 it froze, and
// sprinting stalled on up to half. Nothing measured it, because nothing asked how
// SMOOTHLY the body moved, only whether it ended up in the right place. This does.
//
// Open ground for walking at every heading and sprinting off-axis; long straight lanes
// for sprinting straight, because at 4-8 cells/s a small open patch ends in a wall within
// a second and that is a wall, not a stall.

import { DIRS, isWalkable } from '../../sim/grid.js';
import { DistrictRunner } from '../../web3d/runner.js';
import { WALK_DIAGONAL_HEADROOM, SPRINT_DIAGONAL_HEADROOM } from '../../sim3d/body.js';

const HEADINGS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45];

function openPatch(m, size) {
  for (let y = 1; y < m.h - size; y++) for (let x = 1; x < m.w - size; x++) {
    let ok = true;
    for (let dy = 0; dy < size && ok; dy++) for (let dx = 0; dx < size && ok; dx++) ok = isWalkable(m, x + dx, y + dy);
    if (ok) return { x, y };
  }
  return null;
}

function fresh(d) {
  const r = new DistrictRunner({ profileId: 'smooth', district: d, tier: 'easy', loadout: { boltSeconds: 60 } });
  r.game.spawnPolicy = null;
  r.game.patrols.length = 0;
  return r;
}

/**
 * The speed the body is SUPPOSED to reach on this heading: top speed, capped in the
 * grid's metric with the diagonal headroom, converted back to straight-line speed. A
 * diagonal is meant to be slower; only falling under half of its own speed is a stall.
 */
export function expectedSpeed(top, mx, my, sprint) {
  const ax = Math.abs(mx), ay = Math.abs(my), l1 = ax + ay;
  const diag = l1 > 0 ? (2 * Math.min(ax, ay)) / l1 : 0;
  const cap = top * (1 - (sprint ? SPRINT_DIAGONAL_HEADROOM : WALK_DIAGONAL_HEADROOM) * diag);
  const len = Math.hypot(mx, my);
  return Math.min(top, cap * len / l1);
}

/** Frames (after the first 10, the acceleration) whose speed fell under half the expected. */
function stalls(r, mx, my, sprint, frames) {
  const s = r.session;
  let n = 0, bad = 0;
  const target = expectedSpeed(s.speed({ sprint }), mx, my, sprint);
  for (let f = 0; f < frames; f++) {
    const bx = s.body.x, by = s.body.y;
    r.update(1 / 60, { moveX: mx, moveY: my, sprint });
    if (f < 10) continue;
    n++;
    if (Math.hypot(s.body.x - bx, s.body.y - by) * 60 < 0.5 * target) bad++;
  }
  return { n, bad };
}

export const criteria = [{
  n: 13,
  text: 'Movement never stutters: walking at every heading 0-45 degrees and sprinting off-axis on open ground, and sprinting down long lanes, the body never drops under half the speed its heading should have',
  async fn() {
    let frames = 0, bad = 0;
    const worst = [];
    for (const deg of HEADINGS) {
      for (const sprint of [false, true]) {
        if (sprint && deg < 20) continue;               // near-straight sprints are the lane test
        let n = 0, b = 0;
        for (const d of [1, 3, 5, 7, 9]) {
          const r = fresh(d);
          const at = openPatch(r.map, sprint ? 6 : 5);
          if (!at) continue;
          r.game.player.x = at.x; r.game.player.y = at.y; r.session.resync();
          const a = (deg * Math.PI) / 180;
          const got = stalls(r, Math.cos(a), Math.sin(a), sprint, 50);
          n += got.n; b += got.bad;
        }
        frames += n; bad += b;
        if (b) worst.push(`${sprint ? 'sprint' : 'walk'} ${deg}°: ${b}/${n}`);
      }
    }
    let lanes = 0;
    for (let d = 1; d <= 40 && lanes < 6; d++) {
      const r = fresh(d);
      const m = r.map;
      let best = null;
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) for (let k = 0; k < 4; k++) {
        if (!isWalkable(m, x, y)) continue;
        let len = 0;
        while (isWalkable(m, x + DIRS[k].dx * (len + 1), y + DIRS[k].dy * (len + 1))) len++;
        if (!best || len > best.len) best = { x, y, k, len };
      }
      if (best.len < 12) continue;
      lanes++;
      r.game.player.x = best.x; r.game.player.y = best.y; r.session.resync();
      const got = stalls(r, DIRS[best.k].dx, DIRS[best.k].dy, true, Math.floor(((best.len - 2) / 8) * 60));
      frames += got.n; bad += got.bad;
      if (got.bad) worst.push(`sprint lane D${d}: ${got.bad}/${got.n}`);
    }
    return bad === 0
      ? ['PASS', `${frames} frames across ${HEADINGS.length} headings walking, 4 sprinting off-axis and ${lanes} straight sprint lanes: no stalled frame`]
      : ['FAIL', `${bad}/${frames} stalled frames -- ${worst.slice(0, 6).join(', ')}`];
  },
}];
