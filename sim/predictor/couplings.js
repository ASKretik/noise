// sim/predictor/couplings.js -- how a trait about the player becomes a score about a place.
//
// Each line reads: "a player whose <trait> deviates from the population is more
// (sign +1) or less (sign -1) likely to be found in a region whose <feature> is high."
// The reweighting in combine.js is the dot product of the player's deviation vector with
// the region's feature vector.
//
// GENERATED BLOCK. `npm run couplings` rewrites everything between the markers by greedy
// forward selection against a recorded corpus of (chain projection, region features,
// dossier deviation, true region 20 ticks later) tuples, macro-averaged over the five bot
// policies. Selection runs on one set of seeds and the result is reported on a disjoint
// set, so the printed accuracy is not the accuracy the weights were chosen on.
//
// This is not model training: no gradients, no loss, nothing learned at runtime. It is
// offline constant selection, the same category of thing as choosing k = 20. It exists
// because the hand-authored couplings were guesses, and the measured consequence of
// guessing was a dossier that improved the three goal-driven bots by 8-10 points of
// top-1 accuracy while costing the cover-dwelling bot 18 points -- open question 2 in
// the spec, answered with numbers instead of intuition.
//
// COUPLINGS-BEGIN
export const REWEIGHT_TERMS = Object.freeze([
  { trait: 'revisitRate',         feature: 'visitedFrac',      sign: +1, w: 0.7, why: 'retreads old ground' },
  { trait: 'postAlertFlee',       feature: 'threatProximity',  sign: -1, w: 0.7, why: 'flees contact' },
  { trait: 'objectiveDirectness', feature: 'cacheProximity',   sign: -1, w: 1.4, why: 'runs straight at caches' },
  { trait: 'openGroundTolerance', feature: 'buildingEdgeFrac', sign: -1, w: 0.7, why: 'keeps clear of rubble' },
  { trait: 'headingPersistence',  feature: 'headingAlign',     sign: +1, w: 0.4, why: 'holds a heading' },
  { trait: 'revisitRate',         feature: 'isCurrent',        sign: +1, w: 1.0, why: 'circles one district' },
  { trait: 'cacheOrdering',       feature: 'cacheProximity',   sign: -1, w: 0.7, why: 'takes the near cache' },
  { trait: 'coverDwell',          feature: 'isCurrent',        sign: +1, w: 0.7, why: 'sits still in cover' },
  { trait: 'regionDwell',         feature: 'reachInK',         sign: -1, w: 0.7, why: 'does not travel far' },
  { trait: 'backtrackRate',       feature: 'visitedFrac',      sign: +1, w: 0.4, why: 'doubles back' },
  { trait: 'corridorPreference',  feature: 'areaFrac',         sign: -1, w: 0.4, why: 'avoids big rooms' },
  { trait: 'openGroundTolerance', feature: 'coverFrac',        sign: -1, w: 0.4, why: 'ignores cover' },
]);
// COUPLINGS-END

/**
 * The pool the selector draws from: the authored couplings above plus alternates for the
 * dwell-shaped traits, whose natural counterpart is "the region they are already in"
 * rather than a global ranking of cover density. Candidates only; whether any of them
 * survives is decided by measurement.
 */
export const CANDIDATE_TERMS = Object.freeze([
  { trait: 'wallAffinity',        feature: 'wallAdjFrac',     sign: +1, why: 'hugs walls' },
  { trait: 'wallAffinity',        feature: 'openGroundFrac',  sign: -1, why: 'avoids open ground' },
  { trait: 'corridorPreference',  feature: 'corridorFrac',    sign: +1, why: 'favours corridors' },
  { trait: 'corridorPreference',  feature: 'areaFrac',        sign: -1, why: 'avoids big rooms' },
  { trait: 'junctionAffinity',    feature: 'junctionFrac',     sign: +1, why: 'works junctions' },
  { trait: 'turnRate',            feature: 'junctionFrac',     sign: +1, why: 'turns often' },
  { trait: 'turnRate',            feature: 'corridorFrac',     sign: -1, why: 'needs room to turn' },
  { trait: 'openGroundTolerance', feature: 'openGroundFrac',   sign: +1, why: 'crosses open ground' },
  { trait: 'openGroundTolerance', feature: 'coverFrac',        sign: -1, why: 'ignores cover' },
  { trait: 'coverSeeking',        feature: 'coverFrac',        sign: +1, why: 'routes through cover' },
  { trait: 'coverDwell',          feature: 'coverFrac',        sign: +1, why: 'holds in cover' },
  { trait: 'coverDwell',          feature: 'isCurrent',        sign: +1, why: 'sits still in cover' },
  { trait: 'objectiveDirectness', feature: 'cacheProximity',   sign: -1, why: 'runs straight at caches' },
  { trait: 'objectiveDirectness', feature: 'reachInK',         sign: -1, why: 'wastes no steps' },
  { trait: 'cacheOrdering',       feature: 'cacheRank',        sign: +1, why: 'cache ordering' },
  { trait: 'cacheOrdering',       feature: 'cacheProximity',   sign: -1, why: 'takes the near cache' },
  { trait: 'dropRush',            feature: 'dropProximity',    sign: -1, why: 'beelines for the drop' },
  { trait: 'revisitRate',         feature: 'visitedFrac',      sign: +1, why: 'retreads old ground' },
  { trait: 'revisitRate',         feature: 'isCurrent',        sign: +1, why: 'circles one district' },
  { trait: 'backtrackRate',       feature: 'visitedFrac',      sign: +1, why: 'doubles back' },
  { trait: 'regionDwell',         feature: 'isCurrent',        sign: +1, why: 'settles in a district' },
  { trait: 'regionDwell',         feature: 'reachInK',         sign: -1, why: 'does not travel far' },
  { trait: 'pauseMean',           feature: 'isCurrent',        sign: +1, why: 'pauses long' },
  { trait: 'pauseVar',            feature: 'isCurrent',        sign: +1, why: 'pauses erratically' },
  { trait: 'postAlertFreeze',     feature: 'isCurrent',        sign: +1, why: 'freezes when seen' },
  { trait: 'headingPersistence',  feature: 'headingAlign',     sign: +1, why: 'holds a heading' },
  { trait: 'headingPersistence',  feature: 'reachInK',         sign: +1, why: 'keeps moving outward' },
  { trait: 'motionRate',          feature: 'reachInK',         sign: +1, why: 'covers ground' },
  { trait: 'motionRate',          feature: 'isCurrent',        sign: -1, why: 'never lingers' },
  { trait: 'threatDistance',      feature: 'threatProximity',  sign: -1, why: 'gives patrols room' },
  { trait: 'threatTurnAway',      feature: 'threatProximity',  sign: -1, why: 'breaks away on contact' },
  { trait: 'postAlertFlee',       feature: 'threatProximity',  sign: -1, why: 'flees contact' },
  // Rubble is where aliens arrive from a direction the human cannot retreat into, so
  // "ground that touches a broken building" is a distinct piece of geometry from "ground
  // that touches a wall" -- the first is permeable to the hunter and the second is not.
  { trait: 'wallAffinity',        feature: 'buildingEdgeFrac', sign: +1, why: 'sticks to structures' },
  { trait: 'openGroundTolerance', feature: 'buildingEdgeFrac', sign: -1, why: 'keeps clear of rubble' },
  { trait: 'threatDistance',      feature: 'buildingEdgeFrac', sign: -1, why: 'avoids blind corners' },
]);
