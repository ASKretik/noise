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
  wallAffinity:        { mean: 0.5878, sd: 0.1776 },  // n=600
  corridorPreference:  { mean: 0.2068, sd: 0.1363 },  // n=600
  junctionAffinity:    { mean: 0.7932, sd: 0.1363 },  // n=600
  openGroundTolerance: { mean: 0.1472, sd: 0.1750 },  // n=600
  coverDwell:          { mean: 0.4864, sd: 0.9940 },  // n=600
  coverSeeking:        { mean: 0.1281, sd: 0.0996 },  // n=600
  headingPersistence:  { mean: 0.4336, sd: 0.1990 },  // n=600
  turnRate:            { mean: 0.3335, sd: 0.1326 },  // n=600
  backtrackRate:       { mean: 0.2329, sd: 0.1764 },  // n=600
  motionRate:          { mean: 0.9035, sd: 0.1143 },  // n=600
  pauseMean:           { mean: 1.2244, sd: 0.4524 },  // n=600
  pauseVar:            { mean: 0.5418, sd: 1.7976 },  // n=600
  revisitRate:         { mean: 0.3864, sd: 0.2344 },  // n=600
  regionDwell:         { mean: 12.3500, sd: 14.5420 },  // n=600
  objectiveDirectness: { mean: 1.9919, sd: 2.3382 },  // n=413
  cacheOrdering:       { mean: 0.0762, sd: 0.1991 },  // n=413
  dropRush:            { mean: 1.9762, sd: 2.2758 },  // n=125
  threatDistance:      { mean: 4.0961, sd: 0.7180 },  // n=537
  threatTurnAway:      { mean: 0.1913, sd: 0.1603 },  // n=537
  postAlertFlee:       { mean: 0.0920, sd: 0.2706 },  // n=536
  postAlertFreeze:     { mean: 0.0019, sd: 0.0432 },  // n=536
};
// PRIORS-END

/** Fallback for a trait with no prior entry: treat it as already at the mean. */
export const DEFAULT_PRIOR = { mean: 0, sd: 1 };

export function priorFor(key) {
  return TRAIT_PRIORS[key] || DEFAULT_PRIOR;
}
