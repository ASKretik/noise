// bench3d/criteria/aliens.js -- 3D-28 and 3D-29: N8.2's aliens (spec-3d-next.md, N8.2).
//
// 3D-28, smooth on big maps. A tick's work has to stay small however many aliens a
// city holds. Two checks: a deterministic one (new route fields per tick never exceed
// the budget's ceiling of twice fieldsPerTick), and a timed one made machine-relative
// by measuring it in units of one full-map field search on the same machine, so it means
// the same on a laptop and on a CI runner.
//
// 3D-29, fair speed. The tier speeds are the user's 0.5 : 0.75 : 1 : 1.3 at every depth;
// hunting never beats HUNT_CEILING x tier; and no alien ever takes more than one step in
// a tick -- travels -- while it is near you or in your line of sight. No arrival lands in
// your line of sight either.

import { DistrictRunner } from '../../web3d/runner.js';
import { paramsFor, TIER_SPEED_3D, HUNT_CEILING, TRAVEL_SPEED } from '../../sim3d/next/rules.js';
import { FastFields } from '../../sim3d/next/field.js';
import { lineOfSight } from '../../sim3d/raycast.js';
import { euclid } from '../../sim/grid.js';
import { HUMAN } from '../../sim/pathfind.js';
import { Rng } from '../../sim/prng.js';
import { makeBot, BOT_NAMES } from '../../bots/policies.js';

const PASS = 'PASS', FAIL = 'FAIL';
const TIERS = ['easy', 'medium', 'hard', 'ultra'];
/** Bounds in full-map searches: about 4 ms (p99) and 8 ms (worst) on the M3 it was built on. */
const P99_FIELDS = 32, WORST_FIELDS = 64;

function drive(r, botName, seed, ticks, onTick) {
  const g = r.game, bot = makeBot(botName);
  bot.reset();
  const rng = new Rng(seed);
  for (let t = 0; t < ticks && !g.over; t++) {
    const before = g.patrols.map((p) => ({ p, x: p.x, y: p.y }));
    const spawns = g.spawnLog.length;
    const dir = bot.act(g, rng);
    const a = performance.now();
    g.step(dir);
    onTick(g, performance.now() - a, before, spawns);
  }
}

export const criteria = [
  {
    n: 28,
    text: `Smooth on big maps: at district 100 with the city filling up, new route fields per tick never exceed twice the budget, and the tick's sim work stays under ${P99_FIELDS} full-map searches at the 99th percentile and ${WORST_FIELDS} at worst`,
    async fn() {
      const problems = [];
      const times = [];
      let worstBuilt = 0, maxPop = 0, budget = 0, ticks = 0, fieldMs = 0;
      for (let k = 0; k < 6; k++) {
        const r = new DistrictRunner({ profileId: `smooth${k}`, district: 100, tier: TIERS[k % 4] });
        const g = r.game;
        budget = g.fieldsPerTick;
        if (k === 0) {
          // calibrate: one full-map human field on this machine, this map
          const ff = new FastFields(g.map), out = new Int16Array(g.map.tiles.length);
          const src = [g.player.y * g.map.w + g.player.x];
          for (let i = 0; i < 50; i++) ff.run(src, out, HUMAN);
          const a = performance.now();
          for (let i = 0; i < 400; i++) ff.run(src, out, HUMAN);
          fieldMs = (performance.now() - a) / 400;
        }
        drive(r, BOT_NAMES[1 + (k % 4)], k + 1, 900, (game, ms) => {
          ticks++;
          if (game.tick > 2) times.push(ms);
          const built = (game.fieldsBuilt || 0) - (game._lastBuilt || 0);
          game._lastBuilt = game.fieldsBuilt || 0;
          worstBuilt = Math.max(worstBuilt, built);
          maxPop = Math.max(maxPop, game.patrols.length);
        });
      }
      times.sort((a, b) => a - b);
      const p99 = times[Math.floor(times.length * 0.99)], worst = times[times.length - 1];
      if (worstBuilt > 2 * budget) problems.push(`${worstBuilt} route fields built in one tick, ceiling ${2 * budget}`);
      if (p99 / fieldMs > P99_FIELDS) problems.push(`p99 tick ${p99.toFixed(2)} ms = ${(p99 / fieldMs).toFixed(0)} searches`);
      if (worst / fieldMs > WORST_FIELDS) problems.push(`worst tick ${worst.toFixed(2)} ms = ${(worst / fieldMs).toFixed(0)} searches`);
      const detail = `${ticks} ticks, up to ${maxPop} aliens; at most ${worstBuilt} new routes in a tick (budget ${budget}); ` +
        `one full-map search ${fieldMs.toFixed(3)} ms; tick p99 ${p99.toFixed(2)} ms (${(p99 / fieldMs).toFixed(0)} searches), worst ${worst.toFixed(2)} ms (${(worst / fieldMs).toFixed(0)})`;
      return problems.length ? [FAIL, `${problems.join('; ')} -- ${detail}`] : [PASS, detail];
    },
  },
  {
    n: 29,
    text: 'Fair speed: tier speeds 0.5 : 0.75 : 1 : 1.3 at every district, hunting never above the ceiling; no alien takes two steps in a tick while near you or in your sight, and no arrival lands in your sight',
    async fn() {
      const problems = [];
      // ---- the table, every district and tier
      for (let d = 1; d <= 100; d++) {
        const hard = paramsFor('next', d, 'hard');
        for (const t of TIERS) {
          const p = paramsFor('next', d, t), k = TIER_SPEED_3D[t];
          const hunt = 1 / p.chaseMovePeriod, patrol = 1 / p.patrolMovePeriod;
          if (hunt > HUNT_CEILING * k + 1e-9) problems.push(`D${d} ${t}: hunting ${hunt.toFixed(3)} above ${HUNT_CEILING * k}`);
          if (patrol > hunt + 1e-9) problems.push(`D${d} ${t}: patrols faster than it hunts`);
          if (Math.abs(hunt - k / hard.chaseMovePeriod) > 1e-9) problems.push(`D${d} ${t}: hunting not ${k} x HARD`);
          if (Math.abs(p.travelRate - TRAVEL_SPEED * k) > 1e-9) problems.push(`D${d} ${t}: travel ${p.travelRate}`);
        }
        if (problems.length > 6) break;
      }
      // ---- play: every multi-step move and every arrival checked against your position
      let travelSteps = 0, multi = 0, arrivals = 0, episodes = 0;
      for (const d of [10, 50, 100]) {
        for (let k = 0; k < 4; k++) {
          const r = new DistrictRunner({ profileId: `fair${k}`, district: d, tier: TIERS[k] });
          episodes++;
          drive(r, BOT_NAMES[1 + k], d + k, 700, (g, ms, before, spawns) => {
            if (g.over) return;
            const px = g.player.x, py = g.player.y;
            for (const b of before) {
              const steps = Math.abs(b.p.x - b.x) + Math.abs(b.p.y - b.y);
              if (steps < 2 || !g.patrols.includes(b.p)) continue;
              multi++; travelSteps += steps;
              if (euclid(b.x, b.y, px, py) < g.params.travelMinCells) problems.push(`D${d}: alien ${b.p.id} travelled ${steps} cells within ${euclid(b.x, b.y, px, py).toFixed(1)} of you`);
              else if (lineOfSight(g.map, px + 0.5, py + 0.5, b.x + 0.5, b.y + 0.5)) problems.push(`D${d}: alien ${b.p.id} travelled in your line of sight`);
            }
            for (const s of g.spawnLog.slice(spawns)) {
              if (s.split) continue;
              arrivals++;
              if (lineOfSight(g.map, px + 0.5, py + 0.5, s.x + 0.5, s.y + 0.5)) problems.push(`D${d}: an alien arrived in your line of sight at ${s.x},${s.y}`);
            }
          });
          if (problems.length > 6) break;
        }
      }
      return problems.length
        ? [FAIL, problems.slice(0, 6).join('; ')]
        : [PASS, `table holds for districts 1-100 x 4 tiers; ${episodes} episodes: ${multi} travelling moves (${travelSteps} steps), all far and out of sight; ${arrivals} arrivals, none in sight`];
    },
  },
];
