// bench3d/criteria/meta.js -- criteria 3D-8 to 3D-10: saves, the career loop, no optional loads.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { memoryBackend, ProfileStore } from '../../sim/profile.js';
import { DIRS, STAY } from '../../sim/grid.js';
import { Rng } from '../../sim/prng.js';
import { makeBot } from '../../bots/policies.js';
import { buildState, templated } from '../../web/dispatch.js';
import { installDom, endBrowserSession, resetFakeStorage } from '../../bench/domshim.js';
import { installFakeIndexedDB } from '../fakeidb.js';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PASS = 'PASS', FAIL = 'FAIL';

/**
 * Play one district through the real Session3D with continuous controls, steered by a
 * bot: each tick the bot names a direction, and every frame the body is pushed toward the
 * centre of that cell. The body, the leash and the sim are all the real ones.
 */
export function playRunner(runner, botName = 'beeline', seed = 1, maxFrames = 60 * 60 * 8) {
  const bot = makeBot(botName);
  bot.reset();
  const rng = new Rng(seed);
  const g = runner.game;
  const s = runner.session;
  let aim = { x: g.player.x, y: g.player.y };
  const choose = () => {
    const d = bot.act(g, rng);
    aim = d === STAY || d < 0 ? { x: g.player.x, y: g.player.y } : { x: g.player.x + DIRS[d].dx, y: g.player.y + DIRS[d].dy };
  };
  choose();
  for (let f = 0; f < maxFrames && !g.over; f++) {
    const dx = aim.x + 0.5 - s.body.x, dy = aim.y + 0.5 - s.body.y;
    const len = Math.hypot(dx, dy);
    const k = len < 0.04 ? 0 : 1 / Math.max(len, 1e-6);
    if (runner.update(1 / 60, { moveX: dx * k, moveY: dy * k, sprint: false }) > 0) choose();
  }
  return g;
}

export const criteria = [
  {
    n: 8,
    text: 'Save isolation: 3D writes never touch the 2D database; each sweep pattern spares the other game; a 3D guest run leaves the 3D main file byte-identical',
    async fn() {
      const problems = [];
      // ---- the patterns, read from the real sources
      const src2d = readFileSync(resolve(ROOT, 'web/persist.js'), 'utf8');
      const m = src2d.match(/\/(\^noise\(-\\d\+\)\?\$)\/\.test\(name\)/);
      if (!m) return [FAIL, 'could not find the 2D sweep pattern in web/persist.js'];
      const sweep2d = new RegExp(m[1]);
      const p3 = await import('../../web3d/persist3d.js');
      const sweep3d = p3.SWEEP_3D;
      const cases = [
        [sweep2d, 'noise-2', true], [sweep2d, 'noise', true], [sweep2d, 'noise3d-7', false], [sweep2d, p3.DB_NAME_3D, false],
        [sweep3d, 'noise3d-7', true], [sweep3d, 'noise-2', false], [sweep3d, 'noise', false],
      ];
      for (const [re, name, want] of cases) if (re.test(name) !== want) problems.push(`${re} on ${name} should be ${want}`);

      // ---- real writes through both adapters, against one shared in-process IndexedDB
      resetFakeStorage();
      installDom({ indexeddb: 'working', webgpu: false, page: 'index.html' });
      const idb = installFakeIndexedDB();
      const { BUILD } = await import('../../web/build.js');
      // stale databases from earlier builds of BOTH games, for the sweeps to find
      for (const n of ['noise-0', `noise3d-0`, 'noise']) idb._seed(n);
      const p2 = await import(`../../web/persist.js?t=${Date.now()}`);
      const { store: s2 } = await p2.createProfileStore();
      await s2.load('main');
      s2.chooseDifficulty('hard');
      await s2.addCoins(77);
      await s2.unlockLevel(4);
      const before2d = JSON.stringify(await s2.peek('main'));
      const { Career3D } = await import('../../web3d/career3d.js');
      const { store: s3 } = await p3.createProfileStore3d();
      await s3.load('main');
      s3.chooseDifficulty('easy');
      const c3 = new Career3D(s3);
      const r3 = c3.startRun(1);
      playRunner(r3, 'beeline', 3);
      await c3.finishRun(r3);
      const main3dAfterRun = JSON.stringify(await s3.peek('main'));

      // a 3D GUEST run must not move the 3D MAIN file by one byte
      endBrowserSession();
      await p3.ensureGuestSession3d(s3);
      await s3.load('guest');
      s3.chooseDifficulty('medium');
      const cg = new Career3D(s3);
      const rg = cg.startRun(1);
      playRunner(rg, 'drunk', 5);
      await cg.finishRun(rg);
      const main3dAfterGuest = JSON.stringify(await s3.peek('main'));

      const { store: s2b } = await p2.createProfileStore();
      const after2d = JSON.stringify(await s2b.peek('main'));
      await new Promise((r) => setTimeout(r, 20));        // both sweeps are fire-and-forget
      const names = idb._names();
      const want = [`noise-${BUILD}`, p3.DB_NAME_3D].sort();
      if (JSON.stringify(names) !== JSON.stringify(want)) problems.push(`after both sweeps the databases are [${names}], expected [${want}]`);
      const main3d = JSON.parse(main3dAfterRun);
      if (after2d !== before2d) problems.push('the 2D MAIN file changed after 3D play');
      if (main3dAfterGuest !== main3dAfterRun) problems.push('a 3D guest run changed the 3D MAIN file');
      if (!(main3d.runs?.length === 1 && main3d.difficulty === 'easy')) problems.push('the 3D MAIN file did not record its own run');
      if (JSON.parse(after2d).difficulty !== 'hard') problems.push('2D tier was not preserved');
      return problems.length ? [FAIL, problems.join('; ')]
        : [PASS, `patterns disjoint (7 cases); both sweeps run, each removed only its own stale builds, leaving [${names.join(', ')}]; 2D MAIN byte-identical after a 3D run; 3D MAIN byte-identical after a 3D guest run`];
    },
  },
  {
    n: 9,
    text: 'The full meta loop runs headless: tier, district, a win, score, payout, dossier, unlock, a shop purchase, and the kit carried into the next district',
    async fn() {
      const { Career3D } = await import('../../web3d/career3d.js');
      const store = new ProfileStore(memoryBackend());
      await store.load('main');
      store.chooseDifficulty('easy');
      const career = new Career3D(store);
      let won = null, attempts = 0;
      for (const bot of ['beeline', 'evader', 'wallHugger', 'beeline', 'coverCrawler', 'evader', 'beeline', 'evader']) {
        attempts++;
        const r = career.startRun(1);
        const g = playRunner(r, bot, attempts * 7);
        const res = await career.finishRun(r);
        if (g.won) { won = res; break; }
      }
      if (!won) return [FAIL, `no win at district 1 EASY in ${attempts} bot attempts`];
      const p = store.current();
      const problems = [];
      if (p.level < 2) problems.push('district 2 not unlocked');
      if (p.runs.length !== attempts) problems.push(`runs ${p.runs.length} != attempts ${attempts}`);
      if ((p.plays['1'] || 0) !== attempts) problems.push('attempts not counted at run start');
      if (!(won.scored.score > 0) || !(p.bestScores['1'] > 0)) problems.push('no score recorded');
      if (career.dossier.updates < attempts) problems.push('dossier not folded per run');
      // buy as much lightning as the wallet allows, then check it rides into district 2
      const coins = p.wallet.coins;
      const secs = Math.min(60, Math.floor(coins / 10));
      if (secs > 0) {
        const res = store.buy('boltSecond', secs);
        if (!res.ok) problems.push(`purchase refused: ${res.reason}`);
      }
      const r2 = career.startRun(2);
      if (r2.game.loadout.boltSeconds !== store.current().inventory.boltSeconds) problems.push('kit not carried into the next district');
      return problems.length ? [FAIL, problems.join('; ')]
        : [PASS, `won D1 on attempt ${attempts}: score ${won.scored.score}, +${won.earned} coins, ${secs}s lightning bought and carried into D2`];
    },
  },
  {
    n: 10,
    text: 'Playable with nothing optional loaded: no 3D page fetches a model or any off-site script, and the templated dispatch narrates from live 3D state',
    async fn() {
      const problems = [];
      const files = readdirSync(resolve(ROOT, 'web3d')).filter((f) => f.endsWith('.js'));
      for (const f of files) {
        const src = readFileSync(resolve(ROOT, 'web3d', f), 'utf8');
        if (/createDispatcher|huggingface|transformers/.test(src.replace(/\/\/.*$/gm, ''))) problems.push(`web3d/${f} references the model path`);
        if (/https?:\/\//.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))) problems.push(`web3d/${f} contains an absolute URL`);
      }
      for (const page of readdirSync(resolve(ROOT, '3d')).filter((f) => f.endsWith('.html'))) {
        const html = readFileSync(resolve(ROOT, '3d', page), 'utf8');
        for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) if (/^https?:/.test(m[1])) problems.push(`3d/${page} loads ${m[1]}`);
        const map = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
        if (map) for (const v of Object.values(JSON.parse(map[1]).imports)) if (/^https?:/.test(v)) problems.push(`3d/${page} maps to ${v}`);
      }
      const { DistrictRunner } = await import('../../web3d/runner.js');
      const r = new DistrictRunner({ profileId: 'bench', district: 3, tier: 'medium' });
      playRunner(r, 'drunk', 2, 60 * 20);
      const text = templated(buildState({
        game: r.game, prediction: r.prediction, dossier: r.dossier, chain: r.chain,
        lastSpawn: r.system.lastSpawn, level: 3, profile: { displayName: 'BENCH' }, mode: 'full',
      }));
      if (!text || text.length < 30) problems.push('templated dispatch produced no text');
      return problems.length ? [FAIL, problems.join('; ')] : [PASS, `${files.length} web3d modules, every 3D page local-only; dispatch: "${text.slice(0, 70)}…"`];
    },
  },
];
