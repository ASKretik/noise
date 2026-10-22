// sim/score.js -- the score equation, and the coins it pays out.
//
// The score is deliberately NOT the same thing as the coins you picked up. Coins are a
// currency you spend; the score is a judgement of the run, and it reads three things:
// how fast you were, how much you collected, and how many aliens you put down. Replaying
// a district for coins is allowed and expected -- it is the only way to afford a stun gun
// -- but the score decays each time you do it, so farming fills your wallet without
// inflating your record.
//
// SCALING, since the economy has to hold together: a stun gun is 500 coins and a bullet
// is 100, so a gun plus a reload is 1,100. A district pays 10-15x its number in scattered
// coins plus 5x for clearing it, so a first clear of district 1 is worth roughly 20 coins
// from the map and another 10 or so from the score. Districts 1 through 10 cleared once
// each come to a little under a thousand -- about one gun. That is the intended pace: the
// gun is a goal, not an impulse buy, and the fastest route to one is playing further in
// rather than grinding district 1 forty times.

import { TICKS_PER_SECOND } from './difficulty.js';

export const SCORE = Object.freeze({
  /** Full marks for finishing at par; double marks for finishing in half par. */
  speedMax: 400,
  speedCap: 2.0,
  /** Points per coin of VALUE collected, not per coin. */
  perCoinValue: 8,
  /** Putting an alien down is worth about fifteen coins of value. */
  perStun: 120,
  /** Partial credit per key, so a run that died holding three keys still scored. */
  perKey: 50,
  /** Deeper districts are worth more, linearly. */
  levelGain: 0.15,
  /** Each previous attempt at this district shrinks the score. 1, 0.74, 0.59, 0.49... */
  replayDecay: 0.35,
  /** A failed run still scores, at a quarter. */
  lossMultiplier: 0.25,
  /** Coins paid per point of score. */
  coinsPerPoint: 1 / 60,
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * @param {object} o
 * @param {number} o.ticks           run length
 * @param {number} o.par             estimated optimal route length, in ticks
 * @param {boolean} o.won
 * @param {number} o.coinValue       total VALUE of coins collected this run
 * @param {number} o.stuns           aliens stunned
 * @param {number} o.keys            keys collected
 * @param {number} o.level           district number
 * @param {number} o.plays           times this district has been played INCLUDING this one
 * @param {number} [o.difficultyMult]
 * @returns {{score:number, coins:number, parts:object, factors:object}}
 */
export function scoreRun(o) {
  const ticks = Math.max(1, o.ticks || 0);
  const par = Math.max(1, o.par || ticks);

  const speed = o.won
    ? Math.round(SCORE.speedMax * clamp(par / ticks, 0, SCORE.speedCap))
    : 0;    // you cannot be fast at something you did not finish
  const coins = Math.round((o.coinValue || 0) * SCORE.perCoinValue);
  const stuns = Math.round((o.stuns || 0) * SCORE.perStun);
  const keys = Math.round((o.keys || 0) * SCORE.perKey);
  const subtotal = speed + coins + stuns + keys;

  const levelFactor = 1 + SCORE.levelGain * (Math.max(1, o.level || 1) - 1);
  const plays = Math.max(1, o.plays || 1);
  const replayFactor = 1 / (1 + SCORE.replayDecay * (plays - 1));
  const difficultyMult = o.difficultyMult ?? 1;
  const winMult = o.won ? 1 : SCORE.lossMultiplier;

  const score = Math.max(0, Math.round(subtotal * levelFactor * replayFactor * difficultyMult * winMult));

  return {
    score,
    coins: Math.floor(score * SCORE.coinsPerPoint),
    parts: { speed, coins, stuns, keys, subtotal },
    factors: {
      level: levelFactor,
      replay: replayFactor,
      difficulty: difficultyMult,
      win: winMult,
      plays,
      parSeconds: par / TICKS_PER_SECOND,
      tookSeconds: ticks / TICKS_PER_SECOND,
    },
  };
}

/** Human-readable breakdown rows for the end-of-run overlay. */
export function scoreBreakdown(result) {
  const { parts, factors } = result;
  const rows = [
    ['speed', parts.speed, `par ${factors.parSeconds.toFixed(0)}s, took ${factors.tookSeconds.toFixed(1)}s`],
    ['coins', parts.coins, `${Math.round(parts.coins / SCORE.perCoinValue)} value collected`],
    ['stuns', parts.stuns, `${Math.round(parts.stuns / SCORE.perStun)} alien(s) stunned`],
    ['keys', parts.keys, `${Math.round(parts.keys / SCORE.perKey)} collected`],
  ];
  const mults = [
    ['district', factors.level, `x${factors.level.toFixed(2)}`],
    ['replay', factors.replay, `attempt ${factors.plays} — x${factors.replay.toFixed(2)}`],
    ['difficulty', factors.difficulty, `x${factors.difficulty.toFixed(2)}`],
  ];
  if (factors.win !== 1) mults.push(['not finished', factors.win, `x${factors.win.toFixed(2)}`]);
  return { rows, mults };
}
