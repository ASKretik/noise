// sim/predictor/combine.js -- how the two tiers become one distribution.
//
//   p   = tier 1's k-step-ahead distribution over regions (geometry of THIS map)
//   s_r = exp(beta * confidence * SUM_terms sign * z_trait * z_feature(r))   (tier 2)
//   q   = normalise(p * s)
//   out = softmax(ln q / tau)   ==   q^(1/tau) / SUM q^(1/tau)
//
// Tier 2 modulates rather than replaces, which is the only arrangement that works: the
// chain knows where the corridors are and nothing about you, the dossier knows you and
// nothing about the corridors. The reweighting is a dot product between a number about
// the player (trait deviation) and the matching number about a place (region feature).
//
// Temperature tau is the single difficulty knob. tau -> 0 collapses onto the modal
// region and is brutal; tau large flattens to uniform and IS the random baseline, which
// is what makes "uniform" a mode of this same code path rather than separate code.

import { UNREACHABLE } from '../pathfind.js';
import { REWEIGHT_TERMS } from './couplings.js';

export { REWEIGHT_TERMS };

export const SPAWNER_MODES = Object.freeze(['uniform', 'chain', 'chainDossier', 'full']);

export const MODE_LABEL = Object.freeze({
  uniform: 'uniform (baseline)',
  chain: 'chain only (tier 1)',
  chainDossier: 'chain + dossier (tier 1+2)',
  full: 'full + controller',
});

/** Global strength of the tier-2 reweighting before confidence scales it. */
export const BETA = 0.55;
/** The exponent is clamped so one extreme trait cannot produce a degenerate spike. */
export const EXP_CLAMP = 4;

export const DYNAMIC_FEATURES = Object.freeze([
  'cacheProximity', 'cacheRank', 'dropProximity', 'visitedFrac',
  'isCurrent', 'headingAlign', 'reachInK', 'threatProximity',
]);

/** Region features that depend only on the map, so they are computed once per level. */
export const STATIC_FEATURES = Object.freeze([
  'wallAdjFrac', 'corridorFrac', 'junctionFrac', 'openGroundFrac',
  'coverFrac', 'areaFrac', 'deadEndFrac',
]);

export const ALL_FEATURES = Object.freeze([...DYNAMIC_FEATURES, ...STATIC_FEATURES]);

const proximity = (d, scale) => (d === UNREACHABLE || d == null || d < 0 ? 0 : 1 / (1 + d / scale));

/**
 * Per-region features that depend on live run state rather than on the map alone.
 * Static features (wallAdjFrac, coverFrac, ...) come from regions.features.
 */
export function regionDynamics(view) {
  const { map, regions, player, caches, drop, dropUnlocked, visited, fields, kAhead } = view;
  const R = regions.count;
  const out = [];

  // Rank each uncollected cache by the player's own path distance, so "nearest-first"
  // versus "furthest-first" becomes a per-region number.
  const live = caches.filter((c) => !c.collected);
  const ranked = live
    .map((c) => ({ c, d: fields.player ? fields.player[c.y * map.w + c.x] : 0 }))
    .filter((e) => e.d !== UNREACHABLE)
    .sort((a, b) => a.d - b.d);
  const rankOfCache = new Map();
  ranked.forEach((e, i) => rankOfCache.set(e.c, ranked.length > 1 ? i / (ranked.length - 1) : 0.5));

  const heading = player.dir >= 0
    ? [[0, -1], [1, 0], [0, 1], [-1, 0]][player.dir]
    : null;

  for (let r = 0; r < R; r++) {
    const cells = regions.cells[r];
    const feat = regions.features[r];
    let minPlayer = Infinity, minThreat = Infinity, minCache = Infinity, minDrop = Infinity;
    let visitedCells = 0;
    let cacheRankSum = 0, cacheRankN = 0;

    for (const i of cells) {
      if (fields.player) {
        const d = fields.player[i];
        if (d !== UNREACHABLE && d < minPlayer) minPlayer = d;
      }
      if (fields.patrols) {
        const d = fields.patrols[i];
        if (d !== UNREACHABLE && d < minThreat) minThreat = d;
      }
      if (fields.caches) {
        const d = fields.caches[i];
        if (d !== UNREACHABLE && d < minCache) minCache = d;
      }
      if (fields.drop) {
        const d = fields.drop[i];
        if (d !== UNREACHABLE && d < minDrop) minDrop = d;
      }
      if (visited && visited[i]) visitedCells++;
    }
    for (const c of live) {
      if (regions.regionOf[c.y * map.w + c.x] === r && rankOfCache.has(c)) {
        cacheRankSum += rankOfCache.get(c); cacheRankN++;
      }
    }

    let headingAlign = 0;
    if (heading) {
      const dx = feat.centroid.x - player.x;
      const dy = feat.centroid.y - player.y;
      const len = Math.hypot(dx, dy);
      headingAlign = len > 0.5 ? (dx / len) * heading[0] + (dy / len) * heading[1] : 0;
    }

    out.push({
      cacheProximity: proximity(minCache === Infinity ? UNREACHABLE : minCache, 8),
      cacheRank: cacheRankN > 0 ? cacheRankSum / cacheRankN : 0.5,
      dropProximity: dropUnlocked ? proximity(minDrop === Infinity ? UNREACHABLE : minDrop, 10) : 0,
      visitedFrac: cells.length ? visitedCells / cells.length : 0,
      isCurrent: regions.regionOf[player.y * map.w + player.x] === r ? 1 : 0,
      headingAlign,
      reachInK: minPlayer === Infinity ? 0 : Math.max(0, 1 - minPlayer / Math.max(1, kAhead)),
      threatProximity: proximity(minThreat === Infinity ? UNREACHABLE : minThreat, 10),
      playerDist: minPlayer === Infinity ? -1 : minPlayer,
      threatDist: minThreat === Infinity ? -1 : minThreat,
    });
  }
  return out;
}

/** z-score one feature across the regions. Flat features contribute nothing. */
function zAcross(values) {
  const n = values.length;
  if (n === 0) return values;
  let m = 0;
  for (const v of values) m += v;
  m /= n;
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  const sd = Math.sqrt(s / n);
  if (!(sd > 1e-9)) return values.map(() => 0);
  return values.map((v) => (v - m) / sd);
}

/**
 * Per-region z-scored feature matrix. Split out of predict() so that
 * bench/couplings.js can score candidate coupling sets against a recorded corpus using
 * this same arithmetic -- if the selector optimised a different formula from the one
 * that ships, its output would be worthless.
 */
export function featureZ(view) {
  const dyn = regionDynamics(view);
  const zFeat = {};
  for (const f of DYNAMIC_FEATURES) zFeat[f] = zAcross(dyn.map((d) => d[f]));
  for (const f of STATIC_FEATURES) zFeat[f] = zAcross(view.regions.features.map((d) => d[f]));
  return { zFeat, dyn };
}

/** The dossier's deviation vector, as a plain object. */
export function dossierZ(dossier) {
  const out = {};
  if (!dossier) return out;
  for (const term of REWEIGHT_TERMS) {
    if (out[term.trait] === undefined) out[term.trait] = dossier.z(term.trait);
  }
  return out;
}

/**
 * Tier 2's multiplicative scores over regions.
 * @returns {{scores:Float64Array, drivers:Array}}
 */
export function applyTerms({ zFeat, dz, R, strength, terms = REWEIGHT_TERMS }) {
  const scores = new Float64Array(R).fill(1);
  const drivers = [];
  if (!(strength > 0)) return { scores, drivers };
  const exps = new Float64Array(R);
  for (const term of terms) {
    const zt = dz[term.trait] ?? 0;
    if (zt === 0) continue;
    const col = zFeat[term.feature];
    if (!col) continue;
    let contribution = 0;
    for (let r = 0; r < R; r++) {
      const c = term.sign * term.w * zt * col[r];
      exps[r] += c;
      contribution += Math.abs(c);
    }
    drivers.push({ trait: term.trait, feature: term.feature, z: zt, why: term.why, strength: contribution / R });
  }
  for (let r = 0; r < R; r++) {
    scores[r] = Math.exp(Math.max(-EXP_CLAMP, Math.min(EXP_CLAMP, strength * exps[r])));
  }
  drivers.sort((a, b) => b.strength - a.strength);
  return { scores, drivers };
}

/** Normalised entropy of a distribution, in [0,1]. This is tier 1's "how little I know". */
export function normalisedEntropyOf(p) {
  const R = p.length;
  if (R <= 1) return 0;
  let h = 0;
  for (let r = 0; r < R; r++) if (p[r] > 0) h -= p[r] * Math.log2(p[r]);
  return { gate: Math.min(1, h / Math.log2(R)), bits: h };
}

/**
 * q = normalise(pk * scores), then out = softmax(ln q / tau) = q^(1/tau) / sum q^(1/tau).
 * Separated so the selector and the game share it.
 */
export function temperatureMix(pk, scores, tau) {
  const R = pk.length;
  const q = new Float64Array(R);
  let qsum = 0;
  for (let r = 0; r < R; r++) { q[r] = pk[r] * scores[r]; qsum += q[r]; }
  if (!(qsum > 0)) { q.fill(1 / R); qsum = 1; }
  for (let r = 0; r < R; r++) q[r] /= qsum;

  const t = Math.max(1e-3, tau);
  let maxLogit = -Infinity;
  const logits = new Float64Array(R);
  for (let r = 0; r < R; r++) {
    logits[r] = Math.log(Math.max(q[r], 1e-12)) / t;
    if (logits[r] > maxLogit) maxLogit = logits[r];
  }
  const dist = new Float64Array(R);
  let zsum = 0;
  for (let r = 0; r < R; r++) { dist[r] = Math.exp(logits[r] - maxLogit); zsum += dist[r]; }
  for (let r = 0; r < R; r++) dist[r] /= zsum;

  let top = 0;
  for (let r = 1; r < R; r++) if (dist[r] > dist[top]) top = r;
  let h = 0;
  for (let r = 0; r < R; r++) if (dist[r] > 0) h -= dist[r] * Math.log2(dist[r]);
  return { dist, q, top, entropyBits: h, tau: t };
}

/**
 * The one entry point the spawner calls.
 *
 * @param {object} args
 * @param {import('./chain.js').LevelChain} args.chain
 * @param {import('./dossier.js').Dossier} args.dossier
 * @param {object} args.view        live run state (see regionDynamics)
 * @param {number} args.tau         softmax temperature
 * @param {string} args.mode        one of SPAWNER_MODES
 * @param {number} [args.k]         ticks ahead
 */
export function predict({ chain, dossier, view, tau, mode = 'full', k = null }) {
  const regions = view.regions;
  const R = regions.count;
  const kAhead = k ?? view.kAhead ?? 20;
  const currentRegion = regions.regionOf[view.player.y * view.map.w + view.player.x];

  // --- tier 1 ---
  const pk = new Float64Array(R);
  if (mode === 'uniform') pk.fill(1 / R);
  else chain.kStep(currentRegion, kAhead, pk);

  /**
   * How much tier 1 does not know, in [0,1]: the normalised entropy of its own k-step
   * projection. This gates tier 2's influence, and gating it was not optional.
   *
   * Measured without the gate, the dossier helped exactly the players it was designed
   * for and actively hurt the two random ones, dragging the drunk bot's top-1 from 70%
   * to 64% and the evader's from 37% to 25%. The reason is that for a player who mostly
   * stays put, tier 1's "still there" prediction is already sharp and correct, and
   * reweighting it by geometry can only move the mode off a right answer.
   *
   * So tier 2 speaks in proportion to tier 1's uncertainty. A confident chain is left
   * alone; a vague one gets steered by the dossier. This is a precision-weighted
   * combination and it is still only arithmetic over counts -- no loss, no training.
   */
  const { gate, bits: chainEntropyBits } = normalisedEntropyOf(pk);

  // --- tier 2 ---
  const useDossier = mode === 'chainDossier' || mode === 'full';
  const confidence = useDossier && dossier ? dossier.confidence() : 0;
  const strength = useDossier ? BETA * confidence * gate : 0;
  const { zFeat } = strength > 0 ? featureZ(view) : { zFeat: null };
  const { scores, drivers } = zFeat
    ? applyTerms({ zFeat, dz: dossierZ(dossier), R, strength })
    : { scores: new Float64Array(R).fill(1), drivers: [] };

  // --- combine, then temperature ---
  const mixed = temperatureMix(pk, scores, tau);

  return {
    dist: mixed.dist, pk, scores, q: mixed.q,
    top: mixed.top, topP: mixed.dist[mixed.top],
    currentRegion,
    mode, tau: mixed.tau, k: kAhead,
    confidence, gate, chainEntropyBits,
    drivers: drivers.slice(0, 4),
    entropyBits: mixed.entropyBits,
  };
}
