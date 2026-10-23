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
  wallAffinity:        { mean: 0.5966, sd: 0.1825 },  // n=600
  corridorPreference:  { mean: 0.2074, sd: 0.1316 },  // n=600
  junctionAffinity:    { mean: 0.7926, sd: 0.1316 },  // n=600
  openGroundTolerance: { mean: 0.1392, sd: 0.1632 },  // n=600
  coverDwell:          { mean: 0.5490, sd: 1.0384 },  // n=600
  coverSeeking:        { mean: 0.1313, sd: 0.1020 },  // n=600
  headingPersistence:  { mean: 0.4173, sd: 0.1967 },  // n=600
  turnRate:            { mean: 0.3305, sd: 0.1313 },  // n=600
  backtrackRate:       { mean: 0.2521, sd: 0.1739 },  // n=600
  motionRate:          { mean: 0.9020, sd: 0.1222 },  // n=600
  pauseMean:           { mean: 1.3221, sd: 0.9186 },  // n=600
  pauseVar:            { mean: 1.9632, sd: 13.1179 },  // n=600
  revisitRate:         { mean: 0.4224, sd: 0.2363 },  // n=600
  regionDwell:         { mean: 13.3086, sd: 15.5881 },  // n=600
  objectiveDirectness: { mean: 2.1012, sd: 2.4477 },  // n=424
  cacheOrdering:       { mean: 0.0812, sd: 0.2103 },  // n=424
  dropRush:            { mean: 2.0274, sd: 2.7533 },  // n=141
  threatDistance:      { mean: 4.0883, sd: 0.7152 },  // n=568
  threatTurnAway:      { mean: 0.2182, sd: 0.1596 },  // n=568
  postAlertFlee:       { mean: 0.1743, sd: 0.3339 },  // n=567
  postAlertFreeze:     { mean: 0.0053, sd: 0.0726 },  // n=567
};
// PRIORS-END

/** Fallback for a trait with no prior entry: treat it as already at the mean. */
export const DEFAULT_PRIOR = { mean: 0, sd: 1 };

export function priorFor(key) {
  return TRAIT_PRIORS[key] || DEFAULT_PRIOR;
}
