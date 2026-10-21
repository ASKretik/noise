// sim/system.js -- the composition root for "the surveillance system".
//
// This is the only module that knows about all of the sim core, the predictor and the
// spawner at once, and it is the module both runtimes use so that the browser and the
// benchmark harness cannot drift apart. The arrows still run one way: game.js does not
// import this file, this file imports game.js's neighbours and hands the game two plain
// objects (an observer and a spawn policy) through dependency injection.

import { LevelChain } from './predictor/chain.js';
import { Dossier } from './predictor/dossier.js';
import { TraitAccumulator } from './predictor/traits.js';
import { predict, SPAWNER_MODES, MODE_LABEL } from './predictor/combine.js';
import { sampleSpawn, sampleIntercept } from './spawner.js';
import { assignSquad } from './squad.js';
import { adaptDifficulty } from './difficulty.js';
import { regionAdjacency } from './regions.js';

export { SPAWNER_MODES, MODE_LABEL };

/**
 * @param {object} o
 * @param {object} o.level              generated level
 * @param {Dossier} [o.dossier]         the persistent tier; a fresh one is cold on purpose
 * @param {string} [o.mode]             one of SPAWNER_MODES
 * @param {number} [o.tau]              temperature; defaults to the level's tauBase
 * @param {LevelChain} [o.chain]        pass one in to carry a chain across runs of one level
 * @param {boolean} [o.perTickChain]
 */
export function createSystem(o) {
  const level = o.level;
  const params = o.params || level.params;
  // Mode is mutable, not captured: switching the spawner live in front of an examiner is
  // the cheapest convincing demo in the project, and it only reads as a demo if the
  // switch takes effect on the same run rather than restarting the level.
  const initialMode = SPAWNER_MODES.includes(o.mode) ? o.mode : 'full';
  // Tier 1 resets at each new level by construction: a chain over THIS map's regions
  // cannot mean anything on the next map. Tier 2 is what crosses the boundary.
  const chain = o.chain || new LevelChain(level.regions.count, {
    perTick: o.perTickChain ?? true,
    // The region graph is a property of the map, so the chain gets it for free rather
    // than having to learn that walls exist.
    adjacency: level.regions.adjacency || (level.regions.adjacency = regionAdjacency(level.map, level.regions)),
  });
  const dossier = o.dossier || new Dossier();
  const accumulator = new TraitAccumulator();

  const state = {
    mode: initialMode,
    tau: o.tau ?? params.tauBase,
    lastPrediction: null,
    lastSpawn: null,
    traits: null,
    prevRegion: -1,
    predictions: 0,
  };

  const observer = {
    onTick(sample) {
      const from = state.prevRegion < 0 ? sample.region : state.prevRegion;
      chain.observe(from, sample.region);
      state.prevRegion = sample.region;
      accumulator.observe(sample);
    },
    onObjective(info) { accumulator.objective(info); },
    onRunEnd(summary, finalLeg) {
      accumulator.finish(finalLeg);
      state.traits = accumulator.values();
    },
  };

  const spawnPolicy = {
    arrive(view, rng) {
      const spawn = sampleSpawn({ view, chain, dossier, tau: state.tau, mode: state.mode, rng, params: view.params });
      if (spawn) {
        state.lastPrediction = spawn.prediction;
        state.lastSpawn = spawn;
        state.predictions++;
      }
      return spawn;
    },
    intercept(view, rng, patrol) {
      const got = sampleIntercept({ view, chain, dossier, tau: state.tau, mode: state.mode, rng, params: view.params });
      if (got?.prediction) { state.lastPrediction = got.prediction; state.predictions++; }
      return got;
    },
    /**
     * Joint assignment for the whole squad. Only the two tier-aware modes coordinate:
     * under 'uniform' the aliens stay independent, which keeps the dev dropdown an
     * honest A/B rather than four labels over the same behaviour.
     */
    assign(view, rng, patrols) {
      if (state.mode === 'uniform') return null;
      const prediction = predict({
        chain, dossier, view, tau: state.tau, mode: state.mode, k: view.params.kAhead,
      });
      state.lastPrediction = prediction;
      state.predictions++;
      return assignSquad({ view, prediction, patrols, rng });
    },
  };

  return {
    get mode() { return state.mode; },
    set mode(v) { if (SPAWNER_MODES.includes(v)) state.mode = v; },
    chain,
    dossier,
    accumulator,
    observer,
    spawnPolicy,
    get tau() { return state.tau; },
    set tau(v) { state.tau = v; },
    get lastPrediction() { return state.lastPrediction; },
    get lastSpawn() { return state.lastSpawn; },
    get traits() { return state.traits; },
    /** A prediction for right now, for the heatmap overlay and the dispatch panel. */
    predictNow(view, overrides = {}) {
      const p = predict({
        chain, dossier, view,
        tau: overrides.tau ?? state.tau,
        mode: overrides.mode ?? state.mode,
        k: overrides.k ?? view.params.kAhead,
      });
      state.lastPrediction = p;
      return p;
    },
    /** Measured traits so far this run, without waiting for the run to end. */
    liveTraits() { return accumulator.values(); },
  };
}

/**
 * Resolve the temperature and arrival multiplier for a run.
 * The controller only engages in 'full' mode: that is what makes the dev dropdown an
 * honest A/B rather than four labels over the same behaviour.
 */
export function resolveDifficulty({ mode, params, runs }) {
  if (mode !== 'full') return { tau: params.tauBase, lambdaScale: 1, controller: null };
  const c = adaptDifficulty(runs, params);
  return { tau: c.tau, lambdaScale: c.lambdaScale, controller: c };
}
