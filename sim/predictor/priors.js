// sim/predictor/priors.js -- population reference values for trait z-scoring.
//
// A raw trait value is meaningless on its own: 0.85 wall affinity sounds high and is
// actually average, because these maps are corridor-heavy and almost every cell touches
// a wall. Tier 2 therefore reweights on DEVIATION from a population, not on raw values.
//
// GENERATED BLOCK. `npm run priors` rewrites everything between the markers from the
// five bot policies in /bots across levels 1-10. The checked-in numbers below are the
// generated ones; edit the generator, not this file.
//
// PRIORS-BEGIN
export const TRAIT_PRIORS = {
  wallAffinity:        { mean: 0.4575, sd: 0.1620 },  // n=600
  corridorPreference:  { mean: 0.1635, sd: 0.0821 },  // n=600
  junctionAffinity:    { mean: 0.8365, sd: 0.0821 },  // n=600
  openGroundTolerance: { mean: 0.1267, sd: 0.1519 },  // n=600
  coverDwell:          { mean: 0.5517, sd: 1.3771 },  // n=600
  coverSeeking:        { mean: 0.1220, sd: 0.0873 },  // n=600
  headingPersistence:  { mean: 0.5525, sd: 0.2196 },  // n=600
  turnRate:            { mean: 0.3329, sd: 0.1281 },  // n=600
  backtrackRate:       { mean: 0.1145, sd: 0.1272 },  // n=600
  motionRate:          { mean: 0.9092, sd: 0.0970 },  // n=600
  pauseMean:           { mean: 1.2486, sd: 0.7235 },  // n=600
  pauseVar:            { mean: 1.2767, sd: 10.7648 },  // n=600
  revisitRate:         { mean: 0.3011, sd: 0.2589 },  // n=600
  regionDwell:         { mean: 13.6533, sd: 20.9277 },  // n=600
  objectiveDirectness: { mean: 1.5128, sd: 1.7572 },  // n=420
  cacheOrdering:       { mean: 0.0904, sd: 0.2193 },  // n=420
  dropRush:            { mean: 1.0930, sd: 0.7422 },  // n=181
  threatDistance:      { mean: 4.5633, sd: 0.7293 },  // n=519
  threatTurnAway:      { mean: 0.1615, sd: 0.1467 },  // n=519
  postAlertFlee:       { mean: 0.0880, sd: 0.2706 },  // n=519
  postAlertFreeze:     { mean: 0.0019, sd: 0.0439 },  // n=519
};
// PRIORS-END

/** Fallback for a trait with no prior entry: treat it as already at the mean. */
export const DEFAULT_PRIOR = { mean: 0, sd: 1 };

export function priorFor(key) {
  return TRAIT_PRIORS[key] || DEFAULT_PRIOR;
}
