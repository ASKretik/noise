// bench3d/criteria/maps.js -- 3D-20 and 3D-21: N8's big maps (spec-3d-next.md, N8.1).
//
// 3D-20: the 2D game cannot notice. The city builder reuses two helpers from sim/gen.js,
//        so 10,000 2D levels must hash exactly as they did before N8 touched the file.
// 3D-21: the city maps are sound. Sizes follow the user's curve and grow every district;
//        every key, the portal and all open ground are reachable for the human; aliens
//        reach all the open ground they may stand on; places do not overlap and have
//        unique names; and no alien arrives or divides within the minimum distance.

import { hash2DLevels, HASH_2D_BEFORE_N8 } from '../hash2d.js';
import { SIZE_POINTS, areaMultiple, sizeFor } from '../../sim3d/next/size.js';
import { generateCity, verifyCity, KEY_SPACING } from '../../sim3d/next/city.js';
import { paramsFor, keysFor, timeLimitTicks } from '../../sim3d/next/rules.js';
import { FieldPool } from '../../sim/pathfind.js';
import { Rng } from '../../sim/prng.js';
import { makeBot, BOT_NAMES } from '../../bots/policies.js';
import { DistrictRunner } from '../../web3d/runner.js';

const PASS = 'PASS', FAIL = 'FAIL';

/** The user's points, as agreed in decisions.md R51. Changing them is the user's call. */
const AGREED = [[1, 5], [10, 10], [50, 30], [75, 45], [100, 60]];

export const criteria = [
  {
    n: 20,
    text: '2D unchanged: 10,000 2D levels from sim/gen.js hash byte-identical to before N8 touched it',
    async fn() {
      const t0 = Date.now();
      const { hash, count } = hash2DLevels();
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      return hash === HASH_2D_BEFORE_N8
        ? [PASS, `${count} levels in ${secs}s, hash ${hash} as recorded before the change`]
        : [FAIL, `hash ${hash}, expected ${HASH_2D_BEFORE_N8}: the 2D generator's output changed`];
    },
  },
  {
    n: 21,
    text: 'Big maps: sizes follow the agreed curve and grow every district; 500 cities (five per district, 1-100) fully reachable for the human and aliens, places distinct; no arrival or division within the minimum distance over 60 episodes',
    async fn() {
      const problems = [];

      // ---- the curve
      if (JSON.stringify(SIZE_POINTS) !== JSON.stringify(AGREED)) problems.push(`size points ${JSON.stringify(SIZE_POINTS)} are not the agreed ${JSON.stringify(AGREED)}`);
      for (const [d, a] of AGREED) if (Math.abs(areaMultiple(d) - a) > 1e-9) problems.push(`district ${d} is x${areaMultiple(d)}, agreed x${a}`);
      let prev = 0;
      for (let d = 1; d <= 100; d++) {
        const s = sizeFor(d);
        if (s.w * s.h <= prev) problems.push(`district ${d} (${s.w}x${s.h}) is not larger than district ${d - 1}`);
        prev = s.w * s.h;
      }

      // ---- 500 cities
      const t0 = Date.now();
      let cities = 0, places = 0, worstMs = 0;
      const pools = new Map();
      for (let d = 1; d <= 100; d++) {
        const { w, h } = sizeFor(d);
        if (!pools.has(w * h)) pools.set(w * h, new FieldPool(w * h));
        const pool = pools.get(w * h);
        for (let k = 0; k < 5; k++) {
          const a = Date.now();
          const lv = generateCity(`city${k}`, d, { pool, params: paramsFor('next', d, ['easy', 'medium', 'hard', 'ultra'][k % 4]) });
          worstMs = Math.max(worstMs, Date.now() - a);
          const v = verifyCity(lv, pool);
          cities++; places += lv.places.length;
          if (!v.ok && problems.length < 8) problems.push(`city${k} D${d}: ${v.problems[0]}`);
        }
      }
      const genSecs = ((Date.now() - t0) / 1000).toFixed(1);

      // ---- spawn distance, arrivals and divisions, on city maps
      let spawns = 0, splits = 0, closest = Infinity, violations = 0, episodes = 0;
      for (const d of [1, 10, 25, 50, 75, 100]) {
        for (let k = 0; k < 10; k++) {
          const r = new DistrictRunner({ profileId: `spawn${k}`, district: d, tier: ['easy', 'medium', 'hard', 'ultra'][k % 4] });
          const g = r.game;
          const bot = makeBot(BOT_NAMES[k % BOT_NAMES.length]);
          bot.reset();
          const rng = new Rng(k * 31 + d);
          for (let t = 0; t < 600 && !g.over; t++) g.step(bot.act(g, rng));
          episodes++;
          for (const s of g.spawnLog) {
            spawns++;
            if (s.split) splits++;
            closest = Math.min(closest, s.playerDist);
            if (s.playerDist < g.params.spawnMinDist) violations++;
          }
        }
      }
      if (violations) problems.push(`${violations}/${spawns} placements inside the minimum distance`);

      return problems.length
        ? [FAIL, problems.slice(0, 8).join('; ')]
        : [PASS, `curve x5 -> x60 holds and grows every district; ${cities} cities in ${genSecs}s (slowest ${worstMs} ms), ` +
          `${places} places, all reachable; ${episodes} episodes, ${spawns} placements (${splits} divisions), closest ${closest} cells`];
    },
  },
  {
    n: 30,
    text: `Keys and portal (N8.3): 4 to 10 keys by district, each in its own place, at least ${KEY_SPACING} cells apart and never all in one half; the portal drawn from the quarter of sites furthest from the keys; the time limit max(6 min, 6 x par)`,
    async fn() {
      const problems = [];
      const want = [[1, 4], [10, 5], [50, 7], [75, 8], [100, 10]];
      for (const [d, n] of want) if (keysFor(d) !== n) problems.push(`district ${d}: ${keysFor(d)} keys, planned ${n}`);
      let cities = 0, closest = Infinity;
      for (let d = 1; d <= 100; d += 3) {
        for (let k = 0; k < 2; k++) {
          const lv = generateCity(`keys${k}`, d, { params: paramsFor('next', d, 'medium') });
          cities++;
          const ks = lv.caches;
          if (ks.length !== keysFor(d)) problems.push(`D${d}: ${ks.length} keys`);
          if (new Set(lv.keyPlaces).size !== ks.length) problems.push(`D${d}: two keys share a place`);
          for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
            const sp = Math.hypot(ks[i].x - ks[j].x, ks[i].y - ks[j].y);
            closest = Math.min(closest, sp);
            if (sp < KEY_SPACING) problems.push(`D${d}: keys ${sp.toFixed(1)} cells apart`);
          }
          if (new Set(ks.map((q) => q.x < lv.map.w / 2)).size < 2) problems.push(`D${d}: every key in one half`);
          const ds = lv.portalCandidates.map((q) => q.dist);
          if (ds.some((v, i) => i && v > ds[i - 1])) problems.push(`D${d}: portal sites not furthest-from-keys first`);
        }
        if (problems.length > 6) break;
      }
      let runs = 0, farMean = 0;
      for (const d of [1, 25, 50, 100]) {
        for (let k = 0; k < 4; k++) {
          const r = new DistrictRunner({ profileId: `portal${k}`, district: d, tier: 'medium', seedKey: `portal${k}#${d}#${k}` });
          const g = r.game, sites = r.level.portalCandidates;
          const idx = sites.findIndex((q) => q.x === g.portal.x && q.y === g.portal.y);
          if (idx < 0 || idx >= Math.ceil(sites.length / 4)) problems.push(`D${d}: portal at site ${idx} of ${sites.length}`);
          else farMean += sites[idx].dist;
          if (g.maxTicks !== timeLimitTicks(g.par)) problems.push(`D${d}: time limit ${g.maxTicks}, par ${g.par}`);
          runs++;
        }
      }
      return problems.length
        ? [FAIL, problems.slice(0, 6).join('; ')]
        : [PASS, `${cities} cities: keys as planned, own places, closest pair ${closest.toFixed(1)} cells, both halves; ${runs} runs: portal in the far quarter, on average ${(farMean / runs * 1.5).toFixed(0)} m from the nearest key; time limits = max(6 min, 6 x par)`];
    },
  },
];
