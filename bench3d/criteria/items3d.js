// bench3d/criteria/items3d.js -- 3D-17: each item does exactly what its rule says. N6.1.
//
// Against references written here from the rules in spec-3d-next.md N6, on real `next`
// districts (DistrictRunner):
//
//   dampers  the radius you are heard at is exactly 0.75x, once per district, one spent
//   EMP      stuns exactly the awake aliens within 3 cells of the blast with no wall
//            between, for stunTicks; touches no other alien; refuses a target too far,
//            behind a wall, or in a wall
//   decoy    a hunt ends with its last-known cell on the decoy; the aliens it draws (the
//            hunters, and patrols within the pull) head for it and keep it through the
//            squad re-plans; aliens beyond the pull are untouched
//   caps     a count of 0, or the district's uses spent, refuses with nothing spent
//   replay   runs with items used replay tick for tick from the input record alone
//
// The classic ruleset has no items: Game3D has no canUseItem.

import { DistrictRunner } from '../../web3d/runner.js';
import { replay } from '../../sim3d/record.js';
import { lineOfSight } from '../../sim3d/raycast.js';
import { ITEMS3D, EMP_RADIUS, DECOY_PULL, DAMPERS_FACTOR } from '../../sim3d/shop3d.js';
import { TILE, euclid, walkableCells } from '../../sim/grid.js';
import { hashLog } from '../../sim/game.js';
import { Rng } from '../../sim/prng.js';

const PASS = 'PASS', FAIL = 'FAIL';
const KIT = () => ({ stunGun: true, bullets: 6, boltSeconds: 5, items: { decoy: 3, dampers: 1, emp: 2 } });
const wallsOnly = (t) => t === TILE.WALL;

function runner(seedKey, district = 14) {
  const r = new DistrictRunner({ profileId: 'items3d', district, tier: 'hard', loadout: KIT(), seedKey });
  for (let i = 0; i < 6 && !r.game.over; i++) r.game.step(i % 2 ? 1 : 3);   // started
  return r;
}

export const criteria = [{
  n: 17,
  text: 'Items do exactly what their rules say: dampers scale your heard radius by 0.75; an EMP stuns exactly the awake aliens within 3 cells with no wall between; a decoy ends a hunt on itself and holds the aliens it draws; caps and counts refuse with nothing spent; item runs replay exactly',
  async fn() {
    const bad = [];
    const rng = new Rng(4242);
    let emps = 0, empHits = 0, decoys = 0, drawnTotal = 0, refusals = 0;

    // ---- dampers
    {
      const g = runner('damp').game;
      const r0 = g.effectiveRadius;
      const a = g.useItem('dampers');
      if (!a.ok || Math.abs(g.effectiveRadius - r0 * DAMPERS_FACTOR) > 1e-9) bad.push(`dampers: ${r0} -> ${g.effectiveRadius}`);
      if (g.loadout.items.dampers !== 0) bad.push('dampers: not spent');
      const b = g.useItem('dampers');
      if (b.ok) bad.push('dampers: used twice');
      if (g.stunRange != null) bad.push('dampers: touched the stun range');
    }

    // ---- EMP, on many placements, against the reference
    for (let trial = 0; trial < 160; trial++) {
      const r = runner(`emp${trial}`, 10 + (trial % 30));
      const g = r.game;
      if (g.patrols.length === 0) continue;
      // put the player beside an alien, so some blasts catch it
      const near = g.patrols[rng.int(g.patrols.length)];
      const cells = walkableCells(g.map).filter((c) => euclid(c.x, c.y, near.x, near.y) <= 5 && euclid(c.x, c.y, near.x, near.y) >= 2);
      if (!cells.length) continue;
      const me = cells[rng.int(cells.length)];
      g.player.x = me.x; g.player.y = me.y;
      g._memo.player.tick = -1; g._memo.alienToPlayer.tick = -1;
      for (const p of g.patrols) if (rng.bool(0.15)) p.stunnedUntil = g.tick + 5;
      const tx = near.x + rng.range(-3, 3), ty = near.y + rng.range(-3, 3);
      const before = g.patrols.map((p) => [p.id, p.stunnedUntil || 0]);
      const want = g.canUseItem('emp', tx, ty);
      // the reference validity
      const inside = tx >= 0 && ty >= 0 && tx < g.map.w && ty < g.map.h;
      const refOk = inside && g.map.tiles[ty * g.map.w + tx] !== TILE.WALL && euclid(tx, ty, g.player.x, g.player.y) <= ITEMS3D.emp.range
        && lineOfSight(g.map, g.player.x + 0.5, g.player.y + 0.5, tx + 0.5, ty + 0.5, wallsOnly);
      if (want.ok !== refOk) { bad.push(`emp trial ${trial}: valid ${want.ok}, reference ${refOk}`); continue; }
      const expect = refOk ? g.patrols.filter((p) => !((p.stunnedUntil || 0) > g.tick) && euclid(p.x, p.y, tx, ty) <= EMP_RADIUS
        && lineOfSight(g.map, tx + 0.5, ty + 0.5, p.x + 0.5, p.y + 0.5, wallsOnly)).map((p) => p.id).sort((a, b) => a - b) : [];
      const left = g.loadout.items.emp, tick = g.tick;
      const res = g.useItem('emp', tx, ty);
      if (!refOk) { refusals++; if (res.ok || g.loadout.items.emp !== left) bad.push(`emp trial ${trial}: refused use spent`); continue; }
      emps++;
      const got = [...res.hit].sort((a, b) => a - b);
      if (got.join() !== expect.join()) bad.push(`emp trial ${trial}: stunned [${got}] expected [${expect}]`);
      for (const [id, su] of before) {
        const p = g.patrols.find((q) => q.id === id);
        const shouldBe = expect.includes(id) ? tick + g.params.stunTicks : su;
        if ((p.stunnedUntil || 0) !== shouldBe) bad.push(`emp trial ${trial}: alien ${id} stunnedUntil ${p.stunnedUntil}, expected ${shouldBe}`);
      }
      empHits += got.length;
      if (g.loadout.items.emp !== left - 1) bad.push(`emp trial ${trial}: not spent`);
      if (g.useItem('emp', tx, ty).ok) bad.push(`emp trial ${trial}: a second EMP in one district`);
      if (bad.length > 6) break;
    }

    // ---- decoy: a hunt, then the pull, then the hold through re-plans
    for (let trial = 0; trial < 40 && bad.length < 7; trial++) {
      const r = runner(`decoy${trial}`, 12 + (trial % 25));
      const g = r.game;
      if (g.patrols.length < 2) continue;
      g.alertTicks = g.params.alertTicks;                 // a hunt is on
      for (const p of g.patrols) { p.mode = 'hunt'; p.stunnedUntil = 0; }
      g.patrols[g.patrols.length - 1].mode = 'intercept'; // one alien not hunting
      const free = walkableCells(g.map).filter((c) => euclid(c.x, c.y, g.player.x, g.player.y) <= ITEMS3D.decoy.range && euclid(c.x, c.y, g.player.x, g.player.y) >= 3
        && lineOfSight(g.map, g.player.x + 0.5, g.player.y + 0.5, c.x + 0.5, c.y + 0.5, wallsOnly));
      if (!free.length) continue;
      const t = free[rng.int(free.length)];
      const loose = g.patrols.filter((p) => p.mode !== 'hunt');
      const looseBefore = loose.map((p) => ({ p, target: p.target && { ...p.target }, near: euclid(p.x, p.y, t.x, t.y) <= DECOY_PULL }));
      const res = g.useItem('decoy', t.x, t.y);
      if (!res.ok) { bad.push(`decoy trial ${trial}: refused (${res.reason})`); continue; }
      decoys++;
      if (g.alertTicks !== 0 || g.lastKnown?.x !== t.x || g.lastKnown?.y !== t.y) bad.push(`decoy trial ${trial}: the hunt did not end on it`);
      const hunters = g.patrols.filter((p) => !loose.includes(p));
      for (const p of hunters) if (!res.hit.includes(p.id) || p.target?.x !== t.x || p.target?.y !== t.y) bad.push(`decoy trial ${trial}: hunter ${p.id} not sent`);
      for (const { p, target, near } of looseBefore) {
        const sent = res.hit.includes(p.id);
        if (near !== sent) bad.push(`decoy trial ${trial}: patrol ${p.id} at ${euclid(p.x, p.y, t.x, t.y).toFixed(1)} sent=${sent}`);
        if (!near && (p.target?.x !== target?.x || p.target?.y !== target?.y)) bad.push(`decoy trial ${trial}: a patrol beyond the pull was moved`);
      }
      drawnTotal += res.hit.length;
      // the hold: step with the player standing still in place for 12 ticks (re-plans every 6)
      g.player.x = g.player.x; g.started = true;
      for (let k = 0; k < 12 && !g.over; k++) {
        g._coordinate(true);
        for (const p of g.patrols) if (res.hit.includes(p.id) && g.alertTicks === 0 && !(p.x === t.x && p.y === t.y) && (p.target?.x !== t.x || p.target?.y !== t.y)) {
          bad.push(`decoy trial ${trial}: re-plan took alien ${p.id} off the decoy`); k = 99; break;
        }
        g.tick++;
      }
    }

    // ---- caps: nothing carried refuses
    {
      const r = new DistrictRunner({ profileId: 'items3d', district: 14, tier: 'hard', loadout: { stunGun: true, bullets: 1, boltSeconds: 0 }, seedKey: 'none' });
      for (let i = 0; i < 6; i++) r.game.step(i % 2 ? 1 : 3);
      for (const id of ['decoy', 'dampers', 'emp']) if (r.game.useItem(id, r.game.player.x, r.game.player.y).ok) bad.push(`${id}: used with none carried`);
    }

    // ---- replay: live runs that use items, then the record alone
    let replays = 0;
    for (const d of [11, 23, 37]) {
      const r = new DistrictRunner({ profileId: 'items3d', district: d, tier: 'hard', loadout: KIT(), seedKey: `rep${d}` });
      const s = r.session, g = r.game, rr = new Rng(d);
      for (let f = 0; f < 60 * 40 && !g.over; f++) {
        if (f % 60 === 0 && g.started) {
          const id = ['decoy', 'dampers', 'emp'][rr.int(3)];
          s.useItem(id, g.player.x + rr.range(-4, 4), g.player.y + rr.range(-4, 4));
        }
        s.update(1 / 60, { moveX: Math.cos(f / 300), moveY: Math.sin(f / 410), sprint: false });
      }
      const fresh = new DistrictRunner({ profileId: 'items3d', district: d, tier: 'hard', loadout: KIT(), seedKey: `rep${d}` });
      replay(fresh.game, s.record.rows);
      const used = g.itemLog.length;
      if (hashLog(g.log) !== hashLog(fresh.game.log) || fresh.game.itemLog.length !== used) bad.push(`replay D${d}: differs (${used} uses live, ${fresh.game.itemLog.length} replayed)`);
      else replays += used;
    }

    return bad.length ? [FAIL, bad.slice(0, 4).join('; ')]
      : [PASS, `dampers 0.75x once; ${emps} EMPs stunned exactly the reference's ${empHits} aliens (${refusals} bad targets refused, nothing spent); ${decoys} decoys ended the hunt on themselves and drew ${drawnTotal} aliens, held through re-plans, none beyond the pull moved; nothing used with none carried; 3 item runs (${replays} uses) replay exactly`];
  },
}];
