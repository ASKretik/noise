// bench3d/criteria/dispatch.js -- 3D-22: the Dispatch learns habits, not rooms (N8.5).
//
// Five checks, on city maps, against the 2D game's five bots and the five habit bots
// (bench3d/bots3d.js):
//
//   predicts   tier 1 is geometry only, and it still names the region you will be in
//              20 ticks (10 s at 2 Hz; 5 s before build 45) later far better than a
//              uniform guess, for every bot
//   recognises a habit file trained on six runs of each habit bot names that bot's own
//              habit as its strongest
//   harmless   a bot with no habit plays exactly the same game with tactics on as off --
//              every paired run identical, tick for tick
//   works      against each habit bot, its tactic improves what the tactic is for, over 20
//              paired runs (same district, seed and record, tactics on vs off): the bot is
//              first seen sooner (hide, corner, lost, map), or seen more often in the
//              chases it runs from (run)
//   replays    a run where the map was opened replays from its record exactly
//
// Measured, not tuned to pass: the tactic numbers are what decisions.md R60 reports.

import { DistrictRunner } from '../../web3d/runner.js';
import { HabitFile } from '../../sim3d/dispatch/habits.js';
import { drive, makeBot3d, HABIT_BOTS, HABIT_OF, POPULATION } from '../bots3d.js';
import { replay } from '../../sim3d/record.js';
import { Rng } from '../../sim/prng.js';
import { TICK_HZ_3D } from '../../sim3d/units.js';

const PASS = 'PASS', FAIL = 'FAIL';

function train(bot) {
  const file = new HabitFile();
  for (const d of [10, 30, 60]) for (let k = 0; k < 2; k++) {
    const r = new DistrictRunner({ profileId: `rec-${bot}-${k}`, district: d, tier: 'medium', habits: new HabitFile() });
    file.update(drive(r, bot, 77 + d + k, 900).habits);
  }
  return file;
}

/** Paired runs, tactics on (the trained file) and off (an empty one). */
function paired(bot, file, pairs) {
  const out = { on: [], off: [], identical: 0 };
  let n = 0;
  for (const d of [8, 20, 35, 55]) for (let k = 0; k < 5 && n < pairs; k++, n++) {
    const sig = {};
    for (const mode of ['on', 'off']) {
      const habits = mode === 'on' ? HabitFile.fromJSON(JSON.parse(JSON.stringify(file.toJSON()))) : new HabitFile();
      const r = new DistrictRunner({ profileId: `eff-${k}`, district: d, tier: 'medium', habits, seedKey: `eff#${d}#${k}` });
      const { game: g } = drive(r, bot, 500 + d * 3 + k, 600);
      out[mode].push({ first: g.firstDetectionTick ?? 600, det: g.detections, caught: g.loseReason === 'caught' });
      sig[mode] = `${g.tick}:${g.player.x},${g.player.y}:${g.detections}:${g.loseReason}`;
    }
    if (sig.on === sig.off) out.identical++;
  }
  return out;
}

const mean = (a, f) => a.reduce((s, x) => s + f(x), 0) / a.length;

export const criteria = [{
  n: 22,
  text: 'The 3D Dispatch learns habits, not rooms: geometry-only prediction beats uniform for all ten bots; each habit bot is recognised; no habit, no change; each tactic helps against its bot; map-open runs replay exactly',
  async fn() {
    const problems = [], notes = [];

    // ---- predicts
    let worst = Infinity;
    for (const bot of [...POPULATION, ...HABIT_BOTS]) {
      let hit = 0, n = 0, uni = 0;
      for (const d of [10, 40, 80]) for (let k = 0; k < 2; k++) {
        const r = new DistrictRunner({ profileId: `acc-${k}`, district: d, tier: 'medium', habits: new HabitFile() });
        const g = r.game, b = makeBot3d(bot), rng = new Rng(9 + d + k);
        const pending = [];
        for (let t = 0; t < 600 && !g.over; t++) {
          if (g.started && t % 4 === 0) { pending.push({ at: g.tick + 20, top: r.system.predictNow(g.view, { k: 20 }).top }); uni += 1 / g.regions.count; }
          g.step(b.act(g, rng), b.actions(g));
          const here = g.regions.regionOf[g.player.y * g.map.w + g.player.x];
          while (pending.length && pending[0].at <= g.tick) { const q = pending.shift(); n++; if (q.top === here) hit++; }
        }
      }
      const ratio = (hit / n) / (uni / n);
      worst = Math.min(worst, ratio);
      if (!(ratio >= 3)) problems.push(`${bot}: top-1 ${(hit / n * 100).toFixed(0)}% is not 3x uniform ${(uni / n * 100).toFixed(1)}%`);
    }
    notes.push(`top-1 at least ${worst.toFixed(1)}x uniform for all ten bots`);

    // ---- recognises, and works
    const effects = [];
    for (const bot of HABIT_BOTS) {
      const file = train(bot), own = HABIT_OF[bot];
      const st = file.strongest();
      if (st?.key !== own) { problems.push(`${bot}: strongest habit ${st?.key ?? 'none'}, not ${own}`); continue; }
      const p = paired(bot, file, 20);
      if (own === 'run') {
        const on = mean(p.on, (x) => x.det), off = mean(p.off, (x) => x.det);
        effects.push(`run: ${off.toFixed(1)} -> ${on.toFixed(1)} detections`);
        if (!(on > off)) problems.push(`runner: detections ${on.toFixed(1)} with the run tactic, ${off.toFixed(1)} without`);
      } else {
        const on = mean(p.on, (x) => x.first) / TICK_HZ_3D, off = mean(p.off, (x) => x.first) / TICK_HZ_3D;
        effects.push(`${own}: first seen ${off.toFixed(0)} s -> ${on.toFixed(0)} s`);
        if (!(on < off)) problems.push(`${bot}: first seen at ${on.toFixed(0)} s with the ${own} tactic, ${off.toFixed(0)} s without`);
      }
    }
    notes.push(`habits recognised; ${effects.join(', ')}`);

    // ---- harmless
    let quiet = 0, same = 0;
    for (const bot of ['beeline', 'wallHugger', 'coverCrawler']) {
      const file = train(bot);
      if (file.strongest()) { notes.push(`${bot} reads as ${file.strongest().key}`); continue; }
      const p = paired(bot, file, 8);
      quiet += 8; same += p.identical;
    }
    if (same !== quiet) problems.push(`${quiet - same}/${quiet} runs of habit-free bots changed with tactics on`);
    notes.push(`${same}/${quiet} habit-free runs identical with tactics on`);

    // ---- replays
    {
      // the first of a few fixed seeds whose run opens the map before it ends
      const file = train('mapReader');
      let a = null, rows = [], mk = null;
      for (let seed = 1; seed <= 8 && !rows.some((r) => r.mapOpen); seed++) {
        mk = () => new DistrictRunner({ profileId: 'rep', district: 12, tier: 'easy', habits: HabitFile.fromJSON(file.toJSON()), seedKey: `rep#${seed}` });
        a = mk(); rows = [];
        const b = makeBot3d('mapReader'), rng = new Rng(seed);
        for (let t = 0; t < 500 && !a.game.over; t++) {
          const dir = b.act(a.game, rng), act = b.actions(a.game);
          rows.push({ dir, sprint: !!act.sprint, stunTarget: null, mapOpen: !!act.mapOpen });
          a.game.step(dir, act);
        }
      }
      const r2 = replay(mk().game, rows);
      const sig = (g) => `${g.tick}:${g.player.x},${g.player.y}:${g.patrols.map((p) => `${p.x},${p.y}`).join(';')}:${g.tacticMoves}`;
      if (sig(a.game) !== sig(r2)) problems.push('a map-open run did not replay exactly');
      if (!rows.some((r) => r.mapOpen)) problems.push('the replay run never opened the map');
      notes.push(`map-open run of ${rows.length} ticks replays exactly`);
    }

    return problems.length ? [FAIL, problems.slice(0, 6).join('; ')] : [PASS, notes.join('; ')];
  },
}];
