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
  wallAffinity:        { mean: 0.5897, sd: 0.1832 },  // n=600
  corridorPreference:  { mean: 0.2087, sd: 0.1353 },  // n=600
  junctionAffinity:    { mean: 0.7913, sd: 0.1353 },  // n=600
  openGroundTolerance: { mean: 0.1389, sd: 0.1610 },  // n=600
  coverDwell:          { mean: 0.5328, sd: 1.1692 },  // n=600
  coverSeeking:        { mean: 0.1322, sd: 0.1052 },  // n=600
  headingPersistence:  { mean: 0.4342, sd: 0.1949 },  // n=600
  turnRate:            { mean: 0.3332, sd: 0.1329 },  // n=600
  backtrackRate:       { mean: 0.2326, sd: 0.1708 },  // n=600
  motionRate:          { mean: 0.9009, sd: 0.1178 },  // n=600
  pauseMean:           { mean: 1.2800, sd: 0.6956 },  // n=600
  pauseVar:            { mean: 1.2259, sd: 7.1684 },  // n=600
  revisitRate:         { mean: 0.3875, sd: 0.2244 },  // n=600
  regionDwell:         { mean: 11.9234, sd: 12.2940 },  // n=600
  objectiveDirectness: { mean: 2.2661, sd: 3.2505 },  // n=419
  cacheOrdering:       { mean: 0.0751, sd: 0.2023 },  // n=419
  dropRush:            { mean: 1.9705, sd: 2.9044 },  // n=113
  threatDistance:      { mean: 4.0591, sd: 0.7039 },  // n=569
  threatTurnAway:      { mean: 0.1858, sd: 0.1604 },  // n=569
  postAlertFlee:       { mean: 0.1218, sd: 0.2978 },  // n=569
  postAlertFreeze:     { mean: 0.0026, sd: 0.0468 },  // n=569
};
// PRIORS-END

/** Fallback for a trait with no prior entry: treat it as already at the mean. */
export const DEFAULT_PRIOR = { mean: 0, sd: 1 };

export function priorFor(key) {
  return TRAIT_PRIORS[key] || DEFAULT_PRIOR;
}
