// bench3d/criteria/core.js -- criteria 3D-3 to 3D-7: the pure 3D core.

import { generateLevel } from '../../sim/gen.js';
import { Game, hashLog } from '../../sim/game.js';
import { createSystem, resolveDifficulty } from '../../sim/system.js';
import { levelParams } from '../../sim/difficulty.js';
import { regionAdjacency } from '../../sim/regions.js';
import { FieldPool } from '../../sim/pathfind.js';
import { Rng } from '../../sim/prng.js';
import { DIRS, STAY, isWalkable, walkableCells, euclid } from '../../sim/grid.js';
import { makeBot, BOT_NAMES } from '../../bots/policies.js';

import { Game3D, aimOf, STUN_RANGE, AIM_Q, AIM_FROM_SLACK, AIM_AT_SLACK, BODY_AIM_M } from '../../sim3d/game3d.js';
import { solidTops } from '../../sim3d/solid.js';
import { EYE_M, WALL_M } from '../../sim3d/units.js';
import { Session3D } from '../../sim3d/session.js';
import { replay } from '../../sim3d/record.js';
import { BODY_RADIUS } from '../../sim3d/body.js';
import { LEAD_WALK, LEAD_SPRINT } from '../../sim3d/leash.js';
import { marchCells, lineOfSight, opaqueToShot, shotClear } from '../../sim3d/raycast.js';

const PASS = 'PASS', FAIL = 'FAIL';
const pool = new FieldPool(32 * 20);
const levels = new Map();

export function level(n, tier = 'hard', profile = 'bench3d') {
  const key = `${profile}|${n}|${tier}`;
  if (!levels.has(key)) {
    const lv = generateLevel(profile, n, { pool, params: levelParams(n, tier) });
    lv.regions.adjacency = regionAdjacency(lv.map, lv.regions);
    levels.set(key, lv);
  }
  return levels.get(key);
}

/** A game with the real system wired in, the way the harness and both pages build one. */
export function makeGame(Cls, lv, seed, extra = {}) {
  const difficulty = resolveDifficulty({ mode: 'full', params: lv.params, runs: [] });
  const sys = createSystem({ level: lv, mode: 'full', tau: difficulty.tau });
  const game = new Cls({
    level: lv, params: lv.params, pool, seed,
    spawnPolicy: sys.spawnPolicy, observer: sys.observer,
    tau: difficulty.tau, lambdaScale: difficulty.lambdaScale,
    logLevel: 'full', ...extra,
  });
  return { game, sys };
}

const walk = (map, x, y, d) => isWalkable(map, x + DIRS[d].dx, y + DIRS[d].dy);

// ------------------------------------------------------------------ 3D-3

function parityCase(lv, seed, policy, loadout) {
  // Reference: the plain 2D Game, driven by a policy, wall bumps turned into STAY so the
  // run is one the leash can express (a body cannot press into a wall and log a heading).
  const { game: ref } = makeGame(Game, lv, seed, { loadout });
  const path = [];
  const inputRng = new Rng(seed ^ 0x5bf03635);
  policy.reset?.();
  while (!ref.over) {
    const { dir, sprint } = policy.act(ref, inputRng);
    // Where the player MEANT to be: a double step that a capture or the portal cuts short
    // still went out as a sprint, so the body has to stand where the sprint was aimed.
    const double = !!sprint && ref.sprintTicks > 0 && dir >= 0;
    const k = dir < 0 ? 0 : double ? 2 : 1;
    const aim = { x: ref.player.x + (dir < 0 ? 0 : k * DIRS[dir].dx), y: ref.player.y + (dir < 0 ? 0 : k * DIRS[dir].dy) };
    ref.step(dir, sprint ? { sprint: true } : null);
    path.push({ x: aim.x, y: aim.y, sprint: double });
  }

  // 3D: a Game3D whose only input is the leash, fed a body standing on each cell the
  // reference reached. If the leash emits exactly what produced that cell, the logs agree.
  const { game } = makeGame(Game3D, lv, seed, { loadout });
  const s = new Session3D({ game });
  for (const p of path) {
    if (game.over) break;
    s.body.x = p.x + 0.5; s.body.y = p.y + 0.5;
    s.leash.prepare(game, s.body, p.sprint);
    const d = s.leash.decide(game, s.body, p.sprint);
    game.step(d.dir, { sprint: d.sprint, stunTarget: null });
  }
  return { ok: hashLog(ref.log) === hashLog(game.log), ticks: ref.tick, ref: hashLog(ref.log), got: hashLog(game.log) };
}

function botPolicy(name) {
  const bot = makeBot(name);
  return {
    reset: () => bot.reset(),
    act(game, rng) {
      const d = bot.act(game, rng);
      if (d >= 0 && d < 4 && !walk(game.map, game.player.x, game.player.y, d)) return { dir: STAY };
      return { dir: d };
    },
  };
}

/** A sprinting wanderer, because no bot ever sprints. */
function sprinterPolicy() {
  let heading = 1;
  return {
    act(game, rng) {
      const { x, y } = game.player;
      if (rng.bool(0.15) || !walk(game.map, x, y, heading)) {
        const open = [0, 1, 2, 3].filter((d) => walk(game.map, x, y, d));
        if (open.length === 0 || rng.bool(0.1)) return { dir: STAY };
        heading = rng.pick(open);
      }
      const two = isWalkable(game.map, x + 2 * DIRS[heading].dx, y + 2 * DIRS[heading].dy);
      return { dir: heading, sprint: two && rng.bool(0.5) };
    },
  };
}

// ------------------------------------------------------------------ geometry reference

/**
 * Does segment (x0,y0)-(x1,y1) touch the closed unit cell at (cx,cy)? Touching counts --
 * a ray through the exact corner of a cell touches it -- which is the raycast's rule.
 */
function segHitsCell(x0, y0, x1, y1, cx, cy) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (!clip(-dx, x0 - cx) || !clip(dx, cx + 1 - x0) || !clip(-dy, y0 - cy) || !clip(dy, cy + 1 - y0)) return false;
  return t1 - t0 >= -1e-12;
}

function refCells(x0, y0, x1, y1) {
  const out = new Set();
  const sx = Math.floor(x0), sy = Math.floor(y0);
  for (let cy = Math.floor(Math.min(y0, y1)); cy <= Math.floor(Math.max(y0, y1)); cy++) {
    for (let cx = Math.floor(Math.min(x0, x1)); cx <= Math.floor(Math.max(x0, x1)); cx++) {
      if (cx === sx && cy === sy) continue;
      if (segHitsCell(x0, y0, x1, y1, cx, cy)) out.add(`${cx},${cy}`);
    }
  }
  return out;
}

/** The span [t0, t1] of the segment inside the cell, by the same clip as segHitsCell. */
function refSpan(x0, y0, x1, y1, cx, cy) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  clip(-dx, x0 - cx); clip(dx, cx + 1 - x0); clip(-dy, y0 - cy); clip(dy, cy + 1 - y0);
  return [t0, t1];
}

/** Reference for shotClear: every touched cell, the line's lowest point inside it against its top. */
function refShot(map, tops, x0, y0, h0, x1, y1, h1) {
  for (const k of refCells(x0, y0, x1, y1)) {
    const [cx, cy] = k.split(',').map(Number);
    if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return false;
    const top = tops[cy * map.w + cx];
    if (!(top > 0)) continue;
    const [t0, t1] = refSpan(x0, y0, x1, y1, cx, cy);
    if (Math.min(h0 + (h1 - h0) * t0, h0 + (h1 - h0) * t1) < top) return false;
  }
  return true;
}

function refLOS(map, x0, y0, x1, y1) {
  for (const k of refCells(x0, y0, x1, y1)) {
    const [cx, cy] = k.split(',').map(Number);
    if (opaqueToShot(map.tiles[cy * map.w + cx])) return false;
  }
  return true;
}

// ------------------------------------------------------------------ criteria

export const criteria = [
  {
    n: 3,
    text: 'Parity: Game3D driven only through the leash reproduces recorded 2D runs bit for bit (5 bots + a sprinter, no stun fired)',
    async fn() {
      let cases = 0, ticks = 0;
      const bad = [];
      for (const n of [1, 4, 8]) {
        const lv = level(n);
        for (const seed of [11, 23, 37]) {
          for (const name of BOT_NAMES) {
            const r = parityCase(lv, seed, botPolicy(name), undefined);
            cases++; ticks += r.ticks;
            if (!r.ok) bad.push(`${name} D${n} s${seed}`);
          }
          const r = parityCase(lv, seed, sprinterPolicy(), { boltSeconds: 20 });
          cases++; ticks += r.ticks;
          if (!r.ok) bad.push(`sprinter D${n} s${seed}`);
        }
      }
      return bad.length ? [FAIL, `${bad.length}/${cases} diverged: ${bad.slice(0, 6).join(', ')}`]
        : [PASS, `${cases} runs, ${ticks} ticks, identical tick-log hashes`];
    },
  },
  {
    n: 4,
    text: 'Determinism: same seed and same continuous controls give the same run; the input record alone replays it',
    async fn() {
      const out = [];
      for (const [n, seed] of [[2, 5], [6, 9], [10, 13]]) {
        const lv = level(n);
        const play = () => {
          const { game } = makeGame(Game3D, lv, seed, { loadout: { stunGun: true, bullets: 4, boltSeconds: 10 } });
          const s = new Session3D({ game });
          const rng = new Rng(seed * 7919);
          let mx = 0, my = 0, sprint = false;
          for (let f = 0; f < 60 * 60 && !game.over; f++) {
            if (f % 30 === 0) {
              const a = rng.float() * Math.PI * 2;
              const stop = rng.bool(0.15);
              mx = stop ? 0 : Math.cos(a); my = stop ? 0 : Math.sin(a);
              sprint = rng.bool(0.3);
              if (game.patrols.length && rng.bool(0.3)) {
                // half the shots carry an aim from the body's eye, as the page sends them
                const t = rng.pick(game.patrols);
                const aim = rng.bool(0.5) ? aimOf({ x: s.body.x * 1.5, z: s.body.y * 1.5, y: EYE_M }, { x: (t.x + 0.5) * 1.5, z: (t.y + 0.5) * 1.5, y: 1.2 }, 1.5) : null;
                s.fire(t.id, aim);
              }
            }
            s.update(1 / 60, { moveX: mx, moveY: my, sprint });
          }
          return { game, s };
        };
        const a = play(), b = play();
        const { game: fresh } = makeGame(Game3D, lv, seed, { loadout: { stunGun: true, bullets: 4, boltSeconds: 10 } });
        replay(fresh, a.s.record.rows);
        const ha = hashLog(a.game.log), hb = hashLog(b.game.log), hr = hashLog(fresh.log);
        out.push({ ok: ha === hb && ha === hr && a.s.record.hash() === b.s.record.hash(), n, ticks: a.game.tick, moved: a.game.log.length, aims: a.s.record.rows.filter((r) => r.stunAim).length, stuns: a.game.stuns });
      }
      const bad = out.filter((o) => !o.ok);
      return bad.length ? [FAIL, `diverged on D${bad.map((o) => o.n).join(', D')}`]
        : [PASS, out.map((o) => `D${o.n}: ${o.ticks} ticks, ${o.aims} aimed shots, ${o.stuns} stuns`).join(' · ') + ' -- live, repeat and replay all agree'];
    },
  },
  {
    n: 5,
    text: `Leash invariants over 10,000 random continuous control sequences: never inside a solid tile, never more than ${LEAD_WALK} steps ahead walking or ${LEAD_SPRINT} sprinting, never snapped, a stopped body and the sim agree within ${LEAD_SPRINT} ticks`,
    async fn() {
      const SEQ = 10000;
      const rng = new Rng(424242);
      let worstLead = 0, overlap = 0, catchupWorst = 0, snaps = 0, leadViolations = 0, frames = 0;
      let lv, game, s, cellsList;
      const fresh = () => {
        lv = level(1 + rng.int(10), 'hard', `leash${rng.int(4)}`);
        ({ game } = makeGame(Game3D, lv, rng.int(1e6), { spawnPolicy: null, observer: null, maxTicks: 1e9, logLevel: 'none' }));
        s = new Session3D({ game });
        cellsList = walkableCells(lv.map);
      };
      fresh();
      const distSimBody = () => {
        const bx = Math.floor(s.body.x), by = Math.floor(s.body.y);
        s.leash._bfs(s.leash._fromSim, game.player.x, game.player.y);
        return s.leash._dist(s.leash._fromSim, game.player.x, game.player.y, bx, by);
      };
      for (let i = 0; i < SEQ; i++) {
        if (game.over || i % 400 === 0) fresh();
        const c = cellsList[rng.int(cellsList.length)];
        game.player.x = c.x; game.player.y = c.y;
        game.sprinting = false;
        game.fieldBoltTicks = rng.bool(0.5) ? 1000 : 0;
        s.resync();
        const sprintSeq = rng.bool(0.5);
        const len = 20 + rng.int(60);
        for (let f = 0; f < len && !game.over; f++) {
          const a = rng.float() * Math.PI * 2;
          const dt = 1 / (30 + rng.int(115));
          s.update(dt, { moveX: Math.cos(a) * (0.5 + rng.float()), moveY: Math.sin(a) * (0.5 + rng.float()), sprint: sprintSeq && rng.bool(0.8) });
          frames++;
          // the body never overlaps a solid tile
          const r = BODY_RADIUS - 1e-6;
          for (let cy = Math.floor(s.body.y - r); cy <= Math.floor(s.body.y + r); cy++) {
            for (let cx = Math.floor(s.body.x - r); cx <= Math.floor(s.body.x + r); cx++) {
              if (isWalkable(lv.map, cx, cy)) continue;
              const nx = Math.max(cx, Math.min(s.body.x, cx + 1)), ny = Math.max(cy, Math.min(s.body.y, cy + 1));
              if (Math.hypot(s.body.x - nx, s.body.y - ny) < r) overlap++;
            }
          }
          const d = distSimBody();
          if (d < 0 || d > LEAD_SPRINT) leadViolations++;
          if (!sprintSeq && d > LEAD_WALK) leadViolations++;
          worstLead = Math.max(worstLead, d);
        }
        if (game.over) continue;
        // let go of the controls: once the body has stopped, the sim must agree in <= 2 ticks
        let stoppedAt = -1, t0 = 0;
        for (let f = 0; f < 120; f++) {
          s.update(1 / 60, { moveX: 0, moveY: 0, sprint: false });
          if (stoppedAt < 0 && s.body.vx === 0 && s.body.vy === 0) { stoppedAt = f; t0 = s.record.length; }
          if (stoppedAt >= 0 && Math.floor(s.body.x) === game.player.x && Math.floor(s.body.y) === game.player.y) {
            catchupWorst = Math.max(catchupWorst, s.record.length - t0);
            break;
          }
          if (f === 119) catchupWorst = Math.max(catchupWorst, 99);
        }
        snaps += s.snapped; s.snapped = 0;
      }
      const ok = overlap === 0 && leadViolations === 0 && snaps === 0 && catchupWorst <= LEAD_SPRINT;
      return [ok ? PASS : FAIL,
        `${SEQ} sequences, ${frames} frames: ${overlap} solid overlaps, ${leadViolations} lead violations (worst lead ${worstLead}), ${snaps} snaps, worst catch-up ${catchupWorst} ticks`];
    },
  },
  {
    n: 6,
    text: 'Targeted stun lands exactly when you can see the struck point within 72 m: never on an inert, hidden (wall, or under a rubble heap\'s top), out-of-range or mis-aimed alien, never spends without a stun, never touches another alien',
    async fn() {
      const rng = new Rng(77);
      let trials = 0, landed = 0, refused = 0, aimed = 0, overRubble = 0;
      const bad = [];
      let game, lv, cells, tops;
      const fresh = () => {
        lv = level(3 + rng.int(8));
        ({ game } = makeGame(Game3D, lv, rng.int(1e6), { maxTicks: 1e9, logLevel: 'none' }));
        for (let i = 0; i < 60 && !game.over; i++) game.step(rng.int(5) - 1, null);
        cells = walkableCells(lv.map);
        tops = solidTops(lv);
      };
      fresh();
      while (trials < 6000) {
        if (game.over || game.patrols.length === 0 || trials % 200 === 0) { fresh(); if (game.over) continue; }
        // Most trigger pulls are taken within a dozen cells of an alien.
        const near = rng.bool(0.7) ? rng.pick(game.patrols) : null;
        const pool6 = near ? cells.filter((q) => euclid(q.x, q.y, near.x, near.y) <= 12) : cells;
        const c = (pool6.length ? pool6 : cells)[rng.int((pool6.length ? pool6 : cells).length)];
        game.player.x = c.x; game.player.y = c.y;
        game._memo.player.tick = -1; game._memo.alienToPlayer.tick = -1;
        if (game.patrols.some((p) => p.x === game.player.x && p.y === game.player.y)) continue;
        game.loadout.stunGun = rng.bool(0.9);
        game.loadout.bullets = rng.int(4);
        for (const p of game.patrols) if (rng.bool(0.1)) p.stunnedUntil = game.tick + 3;
        const target = rng.bool(0.9) ? rng.pick(game.patrols).id : 99999;
        const p = game.patrols.find((q) => q.id === target);
        // half the pulls carry an aim, as the page sends: an eye near your cell, a point near the alien
        let aim = null, from = [game.player.x + 0.5, game.player.y + 0.5, EYE_M], to = p ? [p.x + 0.5, p.y + 0.5, BODY_AIM_M] : null;
        let aimOk = true;
        if (p && rng.bool(0.5)) {
          aimed++;
          const off = (r) => { const a = rng.float() * 2 * Math.PI, d = rng.float() * r; return [Math.cos(a) * d, Math.sin(a) * d]; };
          const [ex, ey] = off(rng.bool(0.9) ? 1.2 : 6);
          const [qx, qy] = off(rng.bool(0.9) ? 1.2 : 4);
          const eye = { x: (from[0] + ex) * 1.5, z: (from[1] + ey) * 1.5, y: 1.3 + rng.float() * 0.6 };
          const pt = { x: (to[0] + qx) * 1.5, z: (to[1] + qy) * 1.5, y: 0.2 + rng.float() * 2.2 };
          aim = aimOf(eye, pt, 1.5);
          from = aim.slice(0, 3).map((v) => v / AIM_Q); to = aim.slice(3).map((v) => v / AIM_Q);
          const { w, h } = lv.map;
          const fIn = from[0] >= 0 && from[1] >= 0 && from[0] < w && from[1] < h;
          aimOk = fIn && !(tops[Math.floor(from[1]) * w + Math.floor(from[0])] > 0) &&
            Math.hypot(from[0] - (game.player.x + 0.5), from[1] - (game.player.y + 0.5)) <= AIM_FROM_SLACK &&
            Math.hypot(to[0] - (p.x + 0.5), to[1] - (p.y + 0.5)) <= AIM_AT_SLACK &&
            from[2] >= 0 && from[2] <= WALL_M && to[2] >= 0 && to[2] <= WALL_M + 1;
        }
        const seen = p && aimOk ? refShot(lv.map, tops, ...from, ...to) : false;
        const expect = !!(game.loadout.stunGun && game.loadout.bullets > 0 && p &&
          !((p.stunnedUntil || 0) > game.tick) && aimOk && seen &&
          Math.hypot(to[0] - from[0], to[1] - from[1]) <= STUN_RANGE);
        if (expect && !refLOS(lv.map, ...from.slice(0, 2), ...to.slice(0, 2))) overRubble++;
        const before = game.patrols.map((q) => [q.id, q.stunnedUntil || 0]);
        const bullets = game.loadout.bullets;
        const tick = game.tick;
        game.step(STAY, { sprint: false, stunTarget: target, stunAim: aim });
        trials++;
        const spent = bullets - game.loadout.bullets;
        const changed = before.filter(([id, su]) => {
          const q = game.patrols.find((x) => x.id === id);
          return q && (q.stunnedUntil || 0) !== su;
        }).map(([id]) => id);
        if (expect) {
          landed++;
          if (spent !== 1 || changed.length !== 1 || changed[0] !== target ||
            game.patrols.find((q) => q.id === target).stunnedUntil !== tick + game.params.stunTicks) {
            bad.push(`trial ${trials}: expected a stun on ${target}, spent ${spent}, changed [${changed}]`);
          }
        } else {
          refused++;
          if (spent !== 0 || changed.length !== 0) bad.push(`trial ${trials}: expected nothing, spent ${spent}, changed [${changed}]`);
        }
        if (bad.length > 5) break;
      }

      // Reach, on a district-100 city: down a long open street, in range at 47 cells, not at 49.
      const { DistrictRunner } = await import('../../web3d/runner.js');
      const r = new DistrictRunner({ profileId: 'reach', district: 100, tier: 'hard' });
      const g = r.game, m = g.map;
      let lane = { len: 0 };
      for (let y = 0; y < m.h; y++) {
        let run = 0;
        for (let x = 0; x < m.w; x++) {
          run = isWalkable(m, x, y) ? run + 1 : 0;
          if (run > lane.len) lane = { len: run, x0: x - run + 1, y };
        }
      }
      let reach = 'no street long enough';
      if (lane.len >= 52) {
        g.loadout.stunGun = true; g.loadout.bullets = 6;
        g.player.x = lane.x0; g.player.y = lane.y;
        const a = g.patrols[0] || null;
        if (a) {
          a.stunnedUntil = 0; a.y = lane.y;
          const at = (d) => { a.x = lane.x0 + d; return g.canStun(a.id, aimOf({ x: (lane.x0 + 0.5) * 1.5, z: (lane.y + 0.5) * 1.5, y: EYE_M }, { x: (lane.x0 + d + 0.5) * 1.5, z: (lane.y + 0.5) * 1.5, y: 1.2 }, 1.5)); };
          const near = at(47), far = at(49);
          if (!near.ok) bad.push(`reach: refused at 47 cells (${near.reason})`);
          if (far.ok || far.reason !== 'out of range') bad.push(`reach: at 49 cells got ${far.ok ? 'a stun' : far.reason}`);
          reach = `on a ${lane.len}-cell street at district 100: lands at 47 cells (70.5 m), out of range at 49 (73.5 m)`;
        } else reach = 'no alien to test reach on';
      }
      return bad.length ? [FAIL, bad.slice(0, 3).join('; ')]
        : [PASS, `${trials} trigger pulls (${aimed} with an aim): ${landed} landed exactly as the reference says (${overRubble} over a rubble heap the flat test calls blocked), ${refused} refused with nothing spent; ${reach}`];
    },
  },
  {
    n: 7,
    text: 'Grid raycast visits exactly the cells an exhaustive segment-cell test finds, on 10,000 random rays plus a sweep of centre-to-centre rays; the stun gun\'s height-aware line agrees with the reference on 10,000 more',
    async fn() {
      const rng = new Rng(31337);
      const lv = level(5);
      const { w, h } = lv.map;
      let mismatchCells = 0, mismatchLOS = 0;
      for (let i = 0; i < 10000; i++) {
        const x0 = rng.float() * w, y0 = rng.float() * h;
        const x1 = rng.bool(0.5) ? Math.min(w - 1e-6, Math.max(0, x0 + (rng.float() - 0.5) * 12)) : rng.float() * w;
        const y1 = rng.bool(0.5) ? Math.min(h - 1e-6, Math.max(0, y0 + (rng.float() - 0.5) * 12)) : rng.float() * h;
        const got = new Set();
        marchCells(x0, y0, x1, y1, (cx, cy) => { got.add(`${cx},${cy}`); return false; });
        const want = refCells(x0, y0, x1, y1);
        if (got.size !== want.size || [...want].some((k) => !got.has(k))) mismatchCells++;
        if (lineOfSight(lv.map, x0, y0, x1, y1) !== refLOS(lv.map, x0, y0, x1, y1)) mismatchLOS++;
      }
      // Centre to centre is what the stun gun actually fires, and it is full of exact
      // corner passes that random rays never produce.
      let centre = 0;
      for (let a = 0; a < w * h; a += 3) {
        for (let b = 0; b < w * h; b += 7) {
          const x0 = (a % w) + 0.5, y0 = Math.floor(a / w) + 0.5, x1 = (b % w) + 0.5, y1 = Math.floor(b / w) + 0.5;
          if (Math.hypot(x1 - x0, y1 - y0) > 8) continue;
          centre++;
          if (lineOfSight(lv.map, x0, y0, x1, y1) !== refLOS(lv.map, x0, y0, x1, y1)) mismatchLOS++;
        }
      }
      // the stun gun's line, with heights, on the same map
      const tops = solidTops(lv);
      let mismatchShot = 0, shotRays = 0;
      for (let i = 0; i < 10000; i++) {
        const x0 = rng.float() * w, y0 = rng.float() * h;
        const x1 = Math.min(w - 1e-6, Math.max(0, x0 + (rng.float() - 0.5) * 16));
        const y1 = Math.min(h - 1e-6, Math.max(0, y0 + (rng.float() - 0.5) * 16));
        const h0 = 0.8 + rng.float() * 1.4, h1 = rng.float() * 3;
        shotRays++;
        if (shotClear(lv.map, tops, x0, y0, h0, x1, y1, h1) !== refShot(lv.map, tops, x0, y0, h0, x1, y1, h1)) mismatchShot++;
      }
      return mismatchCells || mismatchLOS || mismatchShot ? [FAIL, `${mismatchCells} cell-set, ${mismatchLOS} line-of-sight and ${mismatchShot} shot-with-height mismatches`]
        : [PASS, `10,000 random rays and ${centre} centre-to-centre rays: identical cell sets and line-of-sight verdicts; ${shotRays} rays with heights: identical shot verdicts`];
    },
  },
];
