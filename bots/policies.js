// bots/policies.js -- five scripted players.
//
// These exist so the predictor can be measured against something that does not get
// bored, and so the five acceptance criteria about top-1 accuracy, chain-versus-dossier
// and time-to-first-encounter have a population to average over.
//
// They are deliberately spread across the legibility axis the game is about:
//
//   drunk        uniform random    -- the entropy ceiling, unpredictable by construction
//   beeline      greedy shortest   -- the entropy floor, trivially predictable
//   wallHugger   wall-following    -- predictable via a dossier trait, not via geometry alone
//   coverCrawler cover-seeking     -- predictable via a different trait, same geometry
//   evader       randomised goals  -- goal-driven but deliberately noisy, the hard case
//
// A bot is not part of the sim core and is allowed to read the game: it is a player, and
// a player can see the screen. What it must not do is read the predictor, which would
// make every benchmark circular.

import { DIRS, STAY, TILE, isWalkable, euclid } from '../sim/grid.js';
import { FieldPool, bfsField, bfsFrom, stepDownhill, stepUphill, UNREACHABLE, ALIEN } from '../sim/pathfind.js';

export const BOT_NAMES = Object.freeze(['drunk', 'beeline', 'wallHugger', 'coverCrawler', 'evader']);

/** Current objective: the chosen cache, or the dead drop once they are all collected. */
function objective(game, chooser) {
  if (!game.dropUnlocked) {
    const live = game.caches.filter((c) => !c.collected);
    if (live.length === 0) return game.drop;
    return chooser ? chooser(live) : nearest(game, live);
  }
  return game.drop;
}

function nearest(game, cells) {
  const field = game.fieldPlayer();
  let best = cells[0], bestD = Infinity;
  for (const c of cells) {
    const d = field[c.y * game.map.w + c.x];
    if (d !== UNREACHABLE && d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** A bot keeps one BFS field toward its current goal and only redoes it when the goal moves. */
class Navigator {
  constructor(size) {
    this.pool = new FieldPool(size);
    this.field = null;
    this.goal = null;
  }
  fieldTo(map, goal) {
    if (!this.field || !this.goal || this.goal.x !== goal.x || this.goal.y !== goal.y) {
      const buf = this.pool.take();
      bfsField(map, goal.x, goal.y, buf);
      this.field = Int16Array.from(buf.dist);
      this.pool.give(buf);
      this.goal = { x: goal.x, y: goal.y };
    }
    return this.field;
  }
}

/**
 * Danger, measured the way it actually travels: an alien's distance to a cell, straight
 * through rubble. The bot's own MOVES stay restricted to human ground -- stepUphill
 * defaults to the human rule -- so this is "how close is the thing" scored on a map the
 * bot cannot itself shortcut across.
 */
function threatField(game, nav) {
  if (game.patrols.length === 0) return null;
  const buf = nav.pool.take();
  bfsFrom(game.map, game.patrols.map((p) => p.y * game.map.w + p.x), buf, ALIEN);
  const f = Int16Array.from(buf.dist);
  nav.pool.give(buf);
  return f;
}

const seesThreat = (game) => game.patrols.some(
  (p) => euclid(p.x, p.y, game.player.x, game.player.y) <= game.params.detectRadius * 1.3,
);

/**
 * @param {string} name one of BOT_NAMES
 * @returns {{name:string, reset():void, act(game, rng):number}}
 */
export function makeBot(name, opts = {}) {
  const size = 32 * 20;
  const nav = new Navigator(size);
  let facing = 1;
  let goalPick = null;
  let lastCollected = -1;

  const bot = {
    name,
    reset() { nav.field = null; nav.goal = null; facing = 1; goalPick = null; lastCollected = -1; },

    act(game, rng) {
      switch (name) {
        // ---- the entropy ceiling -------------------------------------------------
        case 'drunk': {
          if (rng.float() < 0.08) return STAY;
          return rng.int(4);
        }

        // ---- the entropy floor ---------------------------------------------------
        case 'beeline': {
          const goal = objective(game, null);
          const field = nav.fieldTo(game.map, goal);
          const d = stepDownhill(game.map, field, game.player.x, game.player.y, rng);
          return d;
        }

        // ---- wall following, re-anchored on the objective when it loses the wall --
        case 'wallHugger': {
          const goal = objective(game, null);
          const field = nav.fieldTo(game.map, goal);
          const here = field[game.player.y * game.map.w + game.player.x];
          let best = -1, bestKey = null;
          // Preference order: stay against a wall, make progress, hold the heading.
          for (let turn = 0; turn < 4; turn++) {
            const k = (facing + [0, 1, 3, 2][turn]) % 4;
            const nx = game.player.x + DIRS[k].dx;
            const ny = game.player.y + DIRS[k].dy;
            if (!isWalkable(game.map, nx, ny)) continue;
            let adj = 0;
            for (let j = 0; j < 4; j++) if (!isWalkable(game.map, nx + DIRS[j].dx, ny + DIRS[j].dy)) adj++;
            // Progress has to dominate or the bot follows walls forever and never
            // collects anything; wall adjacency is a tie-breaker between equally good
            // steps, which is what "wall affinity" actually means as a habit.
            const progress = here - field[ny * game.map.w + nx];
            const key = progress * 6 + adj * 1.5 + (k === facing ? 0.5 : 0);
            if (bestKey === null || key > bestKey) { bestKey = key; best = k; }
          }
          if (best >= 0) facing = best;
          return best;
        }

        // ---- cover-seeking, and it routes AROUND patrols rather than through them --
        // This is the competent-player proxy: it pursues objectives, prefers cover, and
        // treats a nearby patrol as terrain to be avoided. Balance is tuned against this
        // bot, because beeline and drunk are both blind and would otherwise push the
        // whole game toward either trivial or impossible.
        case 'coverCrawler': {
          const goal = objective(game, null);
          const field = nav.fieldTo(game.map, goal);
          const onCover = game.map.tiles[game.player.y * game.map.w + game.player.x] === TILE.COVER;
          const threat = seesThreat(game) ? threatField(game, nav) : null;
          if (onCover && threat && rng.float() < 0.6) return STAY;
          const here = field[game.player.y * game.map.w + game.player.x];
          const hereThreat = threat ? threat[game.player.y * game.map.w + game.player.x] : 0;
          let best = STAY, bestKey = threat ? hereThreat * 1.2 : -Infinity;
          for (let k = 0; k < 4; k++) {
            const nx = game.player.x + DIRS[k].dx;
            const ny = game.player.y + DIRS[k].dy;
            if (!isWalkable(game.map, nx, ny)) continue;
            const ni = ny * game.map.w + nx;
            const progress = here - field[ni];
            const cover = game.map.tiles[ni] === TILE.COVER ? 1 : 0;
            // Patrol distance is weighted hard when one is close and ignored otherwise,
            // so the bot does not spend calm stretches walking in circles.
            const safety = threat ? Math.min(threat[ni], 10) * 1.2 : 0;
            const key = progress * 2 + cover * 1.5 + safety;
            if (bestKey === null || key > bestKey) { bestKey = key; best = k; }
          }
          return best;
        }

        // ---- goal-driven but deliberately noisy: the hard case for the predictor ---
        case 'evader': {
          if (game.collected !== lastCollected) { goalPick = null; lastCollected = game.collected; }
          const live = game.caches.filter((c) => !c.collected);
          if (!goalPick || (goalPick.collected)) goalPick = null;
          const goal = objective(game, (cs) => {
            if (!goalPick || !cs.includes(goalPick)) goalPick = cs[rng.int(cs.length)];
            return goalPick;
          });
          if (seesThreat(game)) {
            const tf = threatField(game, nav);
            if (tf) return stepUphill(game.map, tf, game.player.x, game.player.y, rng);
          }
          const field = nav.fieldTo(game.map, goal);
          if (rng.float() < 0.22) return rng.int(4);    // deliberate noise injection
          return stepDownhill(game.map, field, game.player.x, game.player.y, rng);
        }

        default:
          throw new Error(`unknown bot policy: ${name}`);
      }
    },
  };
  return bot;
}

export function allBots() { return BOT_NAMES.map((n) => makeBot(n)); }
