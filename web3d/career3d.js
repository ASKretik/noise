// web3d/career3d.js -- a profile's career across districts, for the 3D page. DOM-free.
//
// The 3D counterpart of the bookkeeping half of web/play.js: difficulty settled once per
// district, attempts counted when a run STARTS, tier 1 carried across retries of a
// district, tier 2 folded once per run, the score and the coin payout, and every write
// going through the active profile only. All the rules are the 2D game's, imported from
// /sim, not copied. DOM-free, so criterion 3D-9 can run a whole career under Node.

import { levelParams, difficultyOf } from '../sim/difficulty.js';
import { resolveDifficulty } from '../sim/system.js';
import { scoreRun } from '../sim/score.js';
import { Dossier } from '../sim/predictor/dossier.js';
import { DistrictRunner } from './runner.js';
import { HabitFile } from '../sim3d/dispatch/habits.js';
import { saveHabits3d } from './persist3d.js';

export class Career3D {
  /** @param {import('../sim/profile.js').ProfileStore} store  with the profile already loaded */
  constructor(store) {
    this.store = store;
    this.profile = store.current();
    this.dossier = Dossier.fromJSON(this.profile.dossier);
    this.habits = HabitFile.fromJSON(this.profile.habits3d);
    this.chains = new Map();
    this.attempt = 0;
    this.mode = 'full';
  }

  get tier() { return this.profile.difficulty; }

  /** Settled once per district and reused on every retry (see web/play.js resolveFor). */
  resolveFor(level) {
    const params = levelParams(level, this.tier);
    const stored = this.store.settledDifficulty(level);
    if (stored) return { tau: stored.tau, lambdaScale: stored.lambdaScale, controller: stored, settled: true };
    const fresh = resolveDifficulty({ mode: this.mode, params, runs: this.store.recentRuns(5) });
    this.store.rememberDifficulty(level, fresh.controller || fresh);
    return { ...fresh, settled: false };
  }

  /** Begin a run. Counts the attempt now, so quitting cannot dodge the replay decay. */
  startRun(n, { tickHz } = {}) {
    this.attempt++;
    this.playsOfLevel = this.store.countPlay(n);
    this.difficulty = this.resolveFor(n);
    const inv = this.profile.inventory;
    const runner = new DistrictRunner({
      profileId: this.profile.id,
      district: n,
      tier: this.tier,
      dossier: this.dossier,
      habits: this.habits,
      chain: this.chains.get(n),
      difficulty: this.difficulty,
      loadout: { stunGun: inv.stunGun, bullets: inv.bullets, boltSeconds: inv.boltSeconds },
      seedKey: `${this.profile.id}#${n}#${this.profile.runs?.length ?? 0}#${this.attempt}`,
      tickHz,
      mode: this.mode,
    });
    this.chains.set(n, runner.chain);
    return runner;
  }

  /** Score the run, pay out, fold the dossier, write it all to the active profile. */
  async finishRun(runner) {
    const summary = runner.game.summary();
    const traits = runner.system.traits || runner.system.liveTraits();
    const scored = scoreRun({
      ticks: summary.ticks, par: summary.par, won: summary.won,
      coinValue: summary.coinValue, stuns: summary.stuns, keys: summary.collected,
      level: runner.district, plays: this.playsOfLevel,
      difficultyMult: difficultyOf(this.tier).scoreMult,
    });
    const clearBonus = summary.won ? runner.params.clearBonusCoins : 0;
    const earned = summary.coinValue + clearBonus + scored.coins;
    summary.score = scored.score;
    summary.mode3d = true;

    this.dossier.update(traits, { levelCompleted: summary.won });
    if (runner.habitValues) this.habits.update(runner.habitValues);
    try {
      await this.store.saveDossier(this.dossier.toJSON());
      if (runner.habitValues) await saveHabits3d(this.store, this.habits.toJSON());
      await this.store.recordRun(summary);
      await this.store.addCoins(earned);
      await this.store.recordScore(runner.district, scored.score);
      await this.store.returnLoadout(summary.loadoutLeft);
      if (summary.won) await this.store.unlockLevel(runner.district + 1);
    } catch (err) {
      console.warn('[career3d] persistence failed on run end:', err?.message);
    }
    this.profile = this.store.current();
    return { summary, scored, earned, clearBonus, picked: summary.coinValue };
  }
}
