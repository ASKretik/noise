// bench3d/bots3d.js -- bots with one clear habit each, for the 3D Dispatch (N8.5).
//
// The 2D game's five bots (bots/policies.js) are the population the habits are measured
// against. These five each exaggerate one habit the user named, on top of the 2D
// "beeline" bot walking to the nearest key:
//
//   hider       goes to the nearest water or black box when an alien is near, and stays
//   cornerShy   stops for three ticks before stepping round a wall corner
//   wanderer    takes a random step a third of the time; glances at the map now and then
//   mapReader   every ten seconds, stops for two and a half with the map open
//   runner      runs (sprinting if it can) straight away from the aliens when one is near
//
// A bot here is { name, reset(), act(game, rng) -> dir, actions(game) -> {sprint, mapOpen} }.
// drive() plays one through a Game3DNext tick by tick.

import { makeBot, BOT_NAMES } from '../bots/policies.js';
import { DIRS, STAY, isWalkable } from '../sim/grid.js';
import { stepDownhill, stepUphill, HUMAN } from '../sim/pathfind.js';
import { FastFields } from '../sim3d/next/field.js';
import { cornerMask, hidingCells } from '../sim3d/dispatch/habits.js';
import { Rng } from '../sim/prng.js';

export const HABIT_BOTS = Object.freeze(['hider', 'cornerShy', 'wanderer', 'mapReader', 'runner']);
/** Which habit each one is built to show. */
export const HABIT_OF = Object.freeze({ hider: 'hide', cornerShy: 'corner', wanderer: 'lost', mapReader: 'map', runner: 'run' });
export const POPULATION = BOT_NAMES;

const threatened = (g) => g.alertTicks > 0 || g.nearestPatrolDist() <= g.params.detectRadius + 3;
/** The habit measure's own "under threat" (habits.js THREAT_CELLS), for the runner. */
const nearThreat = (g) => g.alertTicks > 0 || g.nearestPatrolDist() <= 12;

export function makeBot3d(name) {
  if (!HABIT_BOTS.includes(name)) {
    const b = makeBot(name);
    return { name, reset: () => b.reset(), act: (g, rng) => b.act(g, rng), actions: () => ({}) };
  }
  const base = makeBot('beeline');
  let s = {};
  const bot = {
    name,
    reset() { base.reset(); s = { pause: 0, pausedFor: -1, read: 0, lastRead: 0, calm: 0, sprint: false, glance: 0, hide: null, corners: null, map: null }; },
    actions() { return { sprint: s.sprint, mapOpen: s.read > 0 || s.glance > 0 }; },
    act(g, rng) {
      const { map } = g, w = map.w, x = g.player.x, y = g.player.y, i = y * w + x;
      if (s.map !== map) {
        s.map = map;
        s.corners = cornerMask(map);
        s.hide = new FastFields(map).run(hidingCells(map), new Int16Array(map.tiles.length), HUMAN);
      }
      s.sprint = false;
      switch (name) {
        case 'hider': {
          if (threatened(g)) s.calm = 10; else if (s.calm > 0) s.calm--;
          if (s.calm > 0) {
            if (s.hide[i] === 0) return STAY;
            const d = stepDownhill(map, s.hide, x, y, rng, null, HUMAN);
            if (d >= 0) return d;
          }
          return base.act(g, rng);
        }
        case 'cornerShy': {
          if (s.pause > 0) { s.pause--; return STAY; }
          const d = base.act(g, rng);
          if (d < 0) return d;
          const ni = (y + DIRS[d].dy) * w + x + DIRS[d].dx;
          if (s.corners.near1[ni] && !s.corners.near1[i] && s.pausedFor !== ni) { s.pausedFor = ni; s.pause = 2; return STAY; }
          return d;
        }
        case 'wanderer': {
          if (s.glance > 0) s.glance--;
          else if (rng.float() < 0.03) s.glance = 3;
          if (rng.float() < 0.33) {
            const open = [0, 1, 2, 3].filter((k) => isWalkable(map, x + DIRS[k].dx, y + DIRS[k].dy));
            if (open.length) return open[rng.int(open.length)];
          }
          return base.act(g, rng);
        }
        case 'mapReader': {
          if (s.read > 0) { s.read--; return STAY; }
          if (g.started && g.tick - s.lastRead >= 40 && !threatened(g)) { s.read = 10; s.lastRead = g.tick; return STAY; }
          return base.act(g, rng);
        }
        case 'runner':
        default: {
          if (nearThreat(g) && g.patrols.length) {
            const d = stepUphill(map, g.fieldPatrols(), x, y, rng, HUMAN);
            if (d >= 0) { s.sprint = g.sprintTicks > 0; return d; }
          }
          return base.act(g, rng);
        }
      }
    },
  };
  bot.reset();
  return bot;
}

/**
 * Play a bot through a runner's game (no body, no frames: the sim directly).
 * @returns {{game:object, habits:object}} the game, and the habits measured this run
 */
export function drive(runner, botName, seed, maxTicks = 900) {
  const g = runner.game, bot = makeBot3d(botName);
  const rng = new Rng(seed);
  for (let t = 0; t < maxTicks && !g.over; t++) {
    const dir = bot.act(g, rng);
    g.step(dir, bot.actions(g));
  }
  return { game: g, habits: runner.habitValues || runner.habitAcc?.values() };
}
