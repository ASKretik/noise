// sim3d/next/game.js -- the game districts play from N8.2 on. Pure.
//
// Game3DNext extends Game3D, which extends the 2D Game. Everything here is an override,
// and only the `next` ruleset constructs it: `classic` stays Game3D, bit for bit with the
// 2D sim (criterion 3D-3). What changes (spec-3d-next.md, N8.2):
//
//   population  arrivals stop at round(4 sqrt A) (rules.js) instead of the 2D 3-5, and
//               divisions stop at twice that; the 2D game lets division run unbounded
//   speed       each alien moves at a rate in cells per tick -- its hunting or patrol rate,
//               or TRAVEL speed while it is far from you and out of your line of sight, so
//               a few aliens can cover a big map and still slow down before you see them
//   fields      distance fields come from FastFields (identical numbers, 12-15x faster);
//               target fields are cached by target cell, so every searcher heading for
//               your last known position shares one, and at most `fieldsPerTick` new
//               ones are built in a tick: an alien whose turn has not come keeps walking
//               its old route for a tick or two instead of the whole squad stalling a frame
//
// Arrivals are chosen by sim3d/next/spawn.js, handed in as the spawn policy.

import { Game3D } from '../game3d.js';
import { DIRS, euclid } from '../../sim/grid.js';
import { stepDownhill, UNREACHABLE, HUMAN, ALIEN } from '../../sim/pathfind.js';
import { lineOfSight } from '../raycast.js';
import { FastFields } from './field.js';
import { timeLimitTicks } from './rules.js';
import { cornerMask } from '../dispatch/habits.js';
import { tacticTargets, TACTIC_ALIENS } from '../dispatch/tactics.js';

/** Target fields kept: enough for every alien's route plus the shared search targets. */
export const FIELD_CACHE = 80;
/**
 * A patrolling alien holds a destination at least this long (6 s) unless it gets there.
 * The squad re-plans every 6 ticks and the prediction moves every tick, so without this
 * the region an alien is sent to reshuffles at nearly every re-plan: a new full field
 * per alien several times a second at district 100, and aliens that never commit.
 */
export const COMMIT_TICKS = 24;

/** Stand still with the map open this long (ticks, at full strength 1.5 s) and they come. */
export const MAP_STILL_TICKS = 6;

export class Game3DNext extends Game3D {
  /**
   * @param {object} o  Game3D's options, plus
   * @param {import('../dispatch/habits.js').HabitFile} [o.habits]  the file on your habits
   *   (N8.5); its tactic strengths are fixed for the run
   */
  constructor(o) {
    super(o);
    // The time limit follows this run's own route (N8.3); see timeLimitTicks.
    if (o.maxTicks == null) this.maxTicks = timeLimitTicks(this.par);
    this.habits = o.habits || null;
    this.tacticStrength = this.habits ? this.habits.strengths() : null;
    this.mapOpen = false;
    this.mapStill = 0;
    // The habit measure reads the map state off the view, like everything else it reads.
    Object.defineProperty(this._view, 'mapOpen', { get: () => this.mapOpen, enumerable: true });
    this.tacticMoves = 0;          // aliens sent by a tactic, for the bench
  }

  /**
   * One tick, as in Game3D, plus whether the Tab map was open: it is part of the input
   * record, because the "map" tactic acts on it, so replays must see it.
   */
  step(inputDir = -1, actions = null) {
    this.mapOpen = !!actions?.mapOpen;
    const before = this.player.x * 65536 + this.player.y;
    const live = super.step(inputDir, actions);
    if (!live) return live;
    const still = this.player.x * 65536 + this.player.y === before;
    this.mapStill = this.mapOpen && still && this.started ? this.mapStill + 1 : 0;
    const s = this.tacticStrength?.map || 0;
    if (s > 0 && this.alertTicks === 0 && this.mapStill >= Math.round(MAP_STILL_TICKS / s) && this.mapStill % 8 === Math.round(MAP_STILL_TICKS / s) % 8) {
      this._closeIn(Math.max(1, Math.round(TACTIC_ALIENS * s)));
    }
    return live;
  }

  /** "Map" tactic: the nearest aliens walk to where you are standing reading the map. */
  _closeIn(n) {
    const near = this.patrols
      .filter((p) => !this._isInert(p) && p.mode !== 'hunt' && p.mode !== 'cutoff')
      .map((p) => ({ p, d: euclid(p.x, p.y, this.player.x, this.player.y) }))
      .filter((e) => e.d <= 60)
      .sort((a, b) => a.d - b.d || a.p.id - b.p.id)
      .slice(0, n);
    const at = { x: this.player.x, y: this.player.y, region: this.regions.regionOf[this.player.y * this.map.w + this.player.x] };
    for (const { p } of near) {
      this._setTarget(p, at, 'intercept');
      p.tactic = 'map';
      this.tacticMoves++;
    }
  }

  /**
   * Which aliens the habit tactics take this re-plan, and where they go: id -> target.
   * The rest follow the squad plan. Chasers are never taken, and at least one alien is
   * always left to the plan.
   */
  _tacticPlan(plan, hunting) {
    const out = new Map();
    const S = this.tacticStrength;
    if (!S) return out;
    const keys = hunting ? ['run'] : ['hide', 'corner', 'lost'];
    if (!keys.some((k) => S[k] > 0)) return out;
    const corners = this._corners || (this._corners = cornerMask(this.map));
    const free = this.patrols.filter((p) => !this._isInert(p) && plan.get(p.id)?.role !== 'chase');
    let left = free.length - 1;
    for (const key of keys) {
      const s = S[key] || 0;
      if (!(s > 0) || left <= 0) continue;
      const targets = tacticTargets(this, key, corners);
      if (!targets.length) continue;
      let n = Math.min(left, Math.max(1, Math.round(TACTIC_ALIENS * s)));
      for (let k = 0; n > 0 && k < n * 2; k++) {
        const t = targets[k % targets.length];
        let best = null, bd = Infinity;
        for (const p of free) {
          if (out.has(p.id)) continue;
          const d = euclid(p.x, p.y, t.x, t.y);
          if (d < bd || (d === bd && best && p.id < best.id)) { bd = d; best = p; }
        }
        if (!best) break;
        out.set(best.id, { ...t, key, region: this.regions.regionOf[t.y * this.map.w + t.x], role: hunting ? 'cutoff' : 'intercept' });
        n--; left--;
      }
    }
    return out;
  }

  // Built lazily: the 2D constructor already asks for fields before this one returns.
  get ff() { return this._ff || (this._ff = new FastFields(this.map)); }

  /** New target fields allowed per tick: about 400,000 cells of search, at least 2. */
  get fieldsPerTick() {
    return this.params.fieldsPerTick ?? Math.max(2, Math.min(16, Math.round(400000 / this.map.tiles.length)));
  }

  // ---------------------------------------------------------------- per-tick fields

  fieldPlayer() {
    const m = this._memo.player;
    if (m.tick !== this.tick) { this.ff.run([this.player.y * this.map.w + this.player.x], m.arr, HUMAN); m.tick = this.tick; }
    return m.arr;
  }

  fieldAlienToPlayer() {
    const m = this._memo.alienToPlayer;
    if (m.tick !== this.tick) { this.ff.run([this.player.y * this.map.w + this.player.x], m.arr, ALIEN); m.tick = this.tick; }
    return m.arr;
  }

  fieldPatrols() {
    const m = this._memo.patrols;
    if (m.tick !== this.tick) { this.ff.run(this.patrols.map((p) => p.y * this.map.w + p.x), m.arr, ALIEN); m.tick = this.tick; }
    return m.arr;
  }

  fieldCaches() {
    const m = this._memo.caches;
    if (m.stamp !== this.collected) {
      this.ff.run(this.caches.filter((c) => !c.collected).map((c) => c.y * this.map.w + c.x), m.arr, HUMAN);
      m.stamp = this.collected;
    }
    return m.arr;
  }

  // ---------------------------------------------------------------- target fields

  /**
   * The alien field toward a target cell: from the cache, or built if this tick's budget
   * allows (or `force`, for an alien with no route at all). Null means "next tick".
   */
  _targetField(t, force) {
    const key = t.y * this.map.w + t.x;
    const cache = this._fieldCache || (this._fieldCache = new Map());
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key); cache.set(key, hit);           // most recently used last
      this.fieldHits = (this.fieldHits || 0) + 1;
      return hit;
    }
    if (this._budgetTick !== this.tick) { this._budgetTick = this.tick; this._budgetLeft = this.fieldsPerTick; }
    // An alien with no route at all may overdraw the budget, but only to twice it.
    if (this._budgetLeft <= (force ? -this.fieldsPerTick : 0)) { this.fieldsDeferred = (this.fieldsDeferred || 0) + 1; return null; }
    this._budgetLeft--;
    const f = this.ff.run([key], new Int16Array(this.map.tiles.length), ALIEN);
    cache.set(key, f);
    if (cache.size > FIELD_CACHE) cache.delete(cache.keys().next().value);
    this.fieldsBuilt = (this.fieldsBuilt || 0) + 1;
    return f;
  }

  _setTarget(p, target, mode) {
    p.target = { x: target.x, y: target.y, region: target.region ?? -1 };
    p.targetAt = this.tick;
    p.mode = mode;
    p.role = target.role || mode;
    const f = this._targetField(p.target, !p.field);
    if (f) { p.field = f; p.fieldPending = false; } else p.fieldPending = true;
  }

  /**
   * The squad re-plan, as in 2D, with two changes for patrolling (intercept) aliens. The
   * squad draws a fresh random cell in an alien's region at every re-plan, and re-deals
   * the regions as the prediction moves; on a city map each change is a new full field.
   * So a patrolling alien keeps its route while it is bound for the same region, and for
   * COMMIT_TICKS after it chose a destination whatever the plan says, unless it arrived.
   * Hunting roles (chase, cutoff) are re-planned exactly as in 2D.
   */
  _coordinate(force = false) {
    if (!this.spawnPolicy?.assign || this.patrols.length === 0) return;
    const every = this.params.coordEvery || 6;
    if (!force && this.tick % every !== 0) return;
    const plan = this.spawnPolicy.assign(this.view, this.rngSpawn, this.patrols);
    if (!plan) return;
    const tactics = this._tacticPlan(plan, this.alertTicks > 0);
    for (const p of this.patrols) {
      // N8.5: an alien a habit tactic takes goes where the tactic says. It keeps its route
      // if it is already on that tactic and the target has moved less than 4 cells.
      const tt = tactics.get(p.id);
      if (tt) {
        p.role = tt.role;
        const same = p.tactic === tt.key && p.target && p.field && Math.abs(p.target.x - tt.x) + Math.abs(p.target.y - tt.y) < 4;
        if (same) { p.mode = tt.role; continue; }
        this._setTarget(p, tt, tt.role);
        p.tactic = tt.key;
        this.tacticMoves++;
        continue;
      }
      if (p.tactic !== 'map') p.tactic = null;
      const t = plan.get(p.id);
      if (!t) continue;
      p.role = t.role;
      // A chaser rides the shared live field. Unlike 2D it keeps its old route: when the
      // alert ends every chaser would otherwise need a new full field on the same tick.
      if (t.role === 'chase') { p.mode = 'hunt'; p.fieldPending = false; continue; }
      if (p.target && p.target.x === t.x && p.target.y === t.y && p.field) { p.mode = t.role; continue; }
      if (t.role === 'intercept' && p.mode === 'intercept' && p.target && p.field
        && !(p.x === p.target.x && p.y === p.target.y)
        && (p.target.region === t.region || this.tick - (p.targetAt ?? -Infinity) < COMMIT_TICKS)) continue;
      this._setTarget(p, t, t.role);
    }
  }

  /** Par, as in 2D (greedy nearest key, then the portal, with slack), on fast fields. */
  _computePar() {
    const N = this.map.tiles.length, w = this.map.w;
    const field = new Int16Array(N);
    let cx = this.player.x, cy = this.player.y, total = 0;
    const left = this.caches.map((c) => ({ x: c.x, y: c.y }));
    while (left.length) {
      this.ff.run([cy * w + cx], field, HUMAN);
      let best = -1, bestD = Infinity;
      for (let i = 0; i < left.length; i++) {
        const d = field[left[i].y * w + left[i].x];
        if (d !== UNREACHABLE && d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) break;
      total += bestD;
      cx = left[best].x; cy = left[best].y;
      left.splice(best, 1);
    }
    this.ff.run([cy * w + cx], field, HUMAN);
    const toPortal = field[this.portal.y * w + this.portal.x];
    if (toPortal !== UNREACHABLE) total += toPortal;
    return Math.max(20, Math.round(total * this.constructor.PAR_SLACK));
  }

  /** The objective leg the directness traits measure, as in 2D, on a fast field. */
  _startLeg() {
    const field = this.ff.run([this.player.y * this.map.w + this.player.x], new Int16Array(this.map.tiles.length), HUMAN);
    const candidates = this.caches
      .filter((c) => !c.collected)
      .map((c) => ({ c, d: field[c.y * this.map.w + c.x] }))
      .filter((e) => e.d !== UNREACHABLE)
      .sort((a, b) => a.d - b.d);
    this._leg = { field, moves: 0, candidates, from: { x: this.player.x, y: this.player.y } };
  }

  /**
   * This run's portal (N8.3). The city builder lists every place's centre by how far it
   * is to walk from the nearest key; the portal is drawn from the furthest quarter,
   * weighted by that distance, fresh every run as in 2D. (2D draws from the half furthest
   * from the spawn.) So the last stretch is a real crossing wherever the keys were.
   */
  _choosePortal(level) {
    const sites = level.portalCandidates;
    if (!sites || sites.length === 0) return { x: level.spawn.x, y: level.spawn.y };
    const far = sites.slice(0, Math.max(1, Math.ceil(sites.length / 4)));
    const pick = far[this.rng.fork('portal').categorical(far.map((p) => Math.max(1, p.dist)))];
    return { x: pick.x, y: pick.y };
  }

  // ---------------------------------------------------------------- population

  /** Division, as in 2D, until the population reaches the ceiling. */
  _maybeSplit() {
    const ceiling = this.params.splitCeiling ?? Infinity;
    if (this.splitAt !== null && this.tick >= this.splitAt && this.patrols.length >= ceiling) {
      this._scheduleSplit();
      return false;
    }
    return super._maybeSplit();
  }

  // ---------------------------------------------------------------- movement

  /** Far from you and out of your line of sight: free to travel fast. */
  _unseenAndFar(p) {
    if (euclid(p.x, p.y, this.player.x, this.player.y) < this.params.travelMinCells) return false;
    return !lineOfSight(this.map, this.player.x + 0.5, this.player.y + 0.5, p.x + 0.5, p.y + 0.5);
  }

  /**
   * The 2D _movePatrols, with rates instead of periods: an alien banks `rate` moves a tick
   * and takes the whole ones, so a travelling alien can take two or three steps in a
   * tick. Steps are spent even when blocked, as in 2D.
   */
  _movePatrols() {
    // routes owed from earlier ticks, within this tick's budget
    for (const p of this.patrols) {
      if (!p.fieldPending || !p.target) continue;
      const f = this._targetField(p.target, false);
      if (!f) break;
      p.field = f; p.fieldPending = false;
    }
    this._coordinate();
    const P = this.params;
    const hunting = this.alertTicks > 0;
    const chaseField = hunting ? this.fieldAlienToPlayer() : null;

    for (const p of this.patrols) {
      p.prevX = p.x; p.prevY = p.y;
      p.rate = 0;
      p.travelling = false;
      if (this._isInert(p)) continue;

      let field = null;
      if (hunting) {
        if (p.role === 'cutoff' && p.field && !p.fieldPending) { p.mode = 'cutoff'; field = p.field; }
        else { p.mode = 'hunt'; field = chaseField; }
      } else if (p.mode === 'hunt' || p.mode === 'cutoff') {
        const lk = this.lastKnown || this.portal;
        this._setTarget(p, { x: lk.x, y: lk.y, region: this.regions.regionOf[lk.y * this.map.w + lk.x] }, 'search');
        field = p.field;
      } else {
        if (!p.field || !p.target) this._assignIntercept(p);
        if (p.x === p.target.x && p.y === p.target.y) {
          this._coordinate(true);
          if (!p.target || (p.x === p.target.x && p.y === p.target.y)) this._assignIntercept(p);
        }
        field = p.field;
      }

      let rate = (p.mode === 'hunt' || p.mode === 'cutoff') ? 1 / P.chaseMovePeriod : 1 / P.patrolMovePeriod;
      if ((P.travelRate || 0) > rate && this._unseenAndFar(p)) { rate = P.travelRate; p.travelling = true; }
      p.rate = rate;
      p.moveAcc += rate;
      const steps = Math.floor(p.moveAcc);
      p.moveAcc -= steps;
      if (!field || steps === 0) continue;
      const occupied = (nx, ny) => this.patrols.some((q) => q !== p && q.x === nx && q.y === ny);
      for (let s = 0; s < steps; s++) {
        const d = stepDownhill(this.map, field, p.x, p.y, this.rngPatrol, occupied, ALIEN);
        if (d < 0) break;
        p.x += DIRS[d].dx; p.y += DIRS[d].dy;
        p.dir = d;
      }
    }
    if (this.patrols.length) this._memo.patrols.tick = -1;
  }
}
