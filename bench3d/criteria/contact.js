// bench3d/criteria/contact.js -- 3D-27: aliens are solid to the body, and still catch you.
//
// Before build 16 the body could lead the sim through an alien and out the other side
// before the next tick registered the capture: "the human is able to run past the alien
// and then only the game stops". Awake aliens are now circles the body cannot enter;
// stunned ones stay passable, as in 2D.

import { DistrictRunner } from '../../web3d/runner.js';
import { BODY_RADIUS } from '../../sim3d/body.js';
import { FieldPool, bfsField, HUMAN, UNREACHABLE } from '../../sim/pathfind.js';
import { DIRS } from '../../sim/grid.js';

/**
 * Where to walk to reach an alien: straight at it once close, otherwise the next cell on
 * the shortest human route to it. On N8's city maps an alien is usually round several
 * corners, and walking a straight line at it only finds a wall (3D build 23).
 */
function aimAt(g, a, body, pool) {
  if (Math.hypot(a.x + 0.5 - body.x, a.y + 0.5 - body.y) < 2.5) return { x: a.x + 0.5, y: a.y + 0.5 };
  const buf = pool.take();
  const f = bfsField(g.map, a.x, a.y, buf, HUMAN);
  const here = f[g.player.y * g.map.w + g.player.x];
  let best = null, bd = here === UNREACHABLE ? Infinity : here;
  for (const d of DIRS) {
    const nx = g.player.x + d.dx, ny = g.player.y + d.dy;
    const v = f[ny * g.map.w + nx];
    if (v !== UNREACHABLE && v < bd) { bd = v; best = { x: nx + 0.5, y: ny + 0.5 }; }
  }
  pool.give(buf);
  return best || { x: a.x + 0.5, y: a.y + 0.5 };
}

const R = 0.24;

export const criteria = [{
  n: 27,
  text: 'Contact: walking at an awake alien, the body never passes into it and the run ends in a capture; a stunned alien can be walked through',
  async fn() {
    let caught = 0, runs = 0, overlaps = 0, passedStunned = 0, stunnedTries = 0;
    for (const d of [1, 3, 5, 7, 9, 12, 24, 36, 48, 60]) {
      const r = new DistrictRunner({ profileId: 'contact', district: d, tier: 'hard', loadout: { stunGun: true, bullets: 6 } });
      const g = r.game, s = r.session;
      const pool = new FieldPool(g.map.tiles.length);
      runs++;
      // walk at the nearest alien (by its route), drawn exactly at its sim cell
      for (let f = 0; f < 60 * 60 && !g.over; f++) {
        const fa = g.fieldAlienToPlayer();
        const a = [...g.patrols].sort((p, q) => fa[p.y * g.map.w + p.x] - fa[q.y * g.map.w + q.x])[0];
        if (!a) { r.update(1 / 60, { moveX: 0, moveY: -1, sprint: false }); continue; }
        const solids = g.patrols.filter((p) => !((p.stunnedUntil || 0) > g.tick)).map((p) => ({ x: p.x + 0.5, y: p.y + 0.5, r: R }));
        const aim = aimAt(g, a, s.body, pool);
        const dx = aim.x - s.body.x, dy = aim.y - s.body.y, len = Math.hypot(dx, dy) || 1;
        r.update(1 / 60, { moveX: dx / len, moveY: dy / len, sprint: false }, solids);
        for (const c of solids) if (Math.hypot(s.body.x - c.x, s.body.y - c.y) < R + BODY_RADIUS - 1e-6) overlaps++;
      }
      if (g.over && g.loseReason === 'caught') caught++;
    }
    // a stunned alien is not a solid: the body walks through where it stands
    {
      const r = new DistrictRunner({ profileId: 'contact', district: 2, tier: 'easy' });
      const s = r.session;
      const c = { x: s.body.x + 1, y: s.body.y, r: R };
      stunnedTries = 1;
      for (let f = 0; f < 60; f++) r.update(1 / 60, { moveX: 1, moveY: 0, sprint: false }, []);
      if (s.body.x > c.x + 0.1 || r.game.player.x !== Math.floor(c.x - 1)) passedStunned = 1;
    }
    const ok = overlaps === 0 && caught >= runs - 1 && passedStunned === 1;
    return [ok ? 'PASS' : 'FAIL', `${caught}/${runs} walk-at-it runs ended in a capture, ${overlaps} frames with the body inside an awake alien, stunned pass-through ${passedStunned ? 'ok' : 'blocked'}`];
  },
}];
