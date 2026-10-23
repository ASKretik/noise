// sim/difficulty.js -- the curve and the controller.
//
// Two separate things live here on purpose:
//   levelParams(level)  -- the authored curve: what level 7 is meant to feel like.
//   adaptDifficulty()   -- the proportional controller: what *this* player needs.
// The curve is open loop and caps at CURVE_CAP so late levels stay playable rather
// than becoming a wall. The controller is closed loop around a survival-time band and
// is the only thing allowed to move tau and lambda at runtime.

export const TICKS_PER_SECOND = 8;
export const CURVE_CAP = 10;

/**
 * Speed cap applied to the three ordinary tiers. ULTRA is deliberately exempt.
 *
 * EASY, MEDIUM and HARD are defined relative to each other and all sit under this cap, so
 * EASY stays half of HARD and MEDIUM stays three-quarters of it. ULTRA runs uncapped at
 * the full base speed, which is the clearest statement of what that tier is: it is not
 * "HARD but they also know things", it is the only setting where nothing is held back.
 *
 * Because an alien's tick period is the base period divided by its speed factor, this
 * cascades to every district automatically -- there is no second table of per-district
 * speeds to keep in sync.
 */
export const ALIEN_SPEED_CAP = 0.75;

/**
 * The four difficulty tiers, chosen once when a save file is created and never editable.
 *
 * Permanence is the point: the dossier, the settled per-district difficulty and every
 * logged score are all measured against the tier they were produced under, and letting
 * someone drop to EASY for one district would quietly corrupt all three. It also makes
 * the choice mean something.
 *
 * `speedFactor` scales how fast an alien MOVES, so it divides the tick period: 0.5 is
 * half speed (twice as long between steps), 0.75 is three-quarters.
 *
 * `knowsKeys` is the ultra tier's whole content. Below it the aliens model where you are
 * going from how you move and nothing else -- they do not know which keys you have
 * already taken, so the predictor's objective features treat every key as still out
 * there. At ULTRA they are told, and the interception gets noticeably sharper near the
 * keys you have left.
 */
export const DIFFICULTIES = Object.freeze({
  easy: {
    id: 'easy', label: 'EASY', order: 0,
    speedFactor: 0.5 * ALIEN_SPEED_CAP, knowsKeys: false, scoreMult: 0.75,
    blurb: 'Aliens move at half speed. They learn how you move, but not which keys you have taken.',
  },
  medium: {
    id: 'medium', label: 'MEDIUM', order: 1,
    speedFactor: 0.75 * ALIEN_SPEED_CAP, knowsKeys: false, scoreMult: 1.0,
    blurb: 'Aliens move at three-quarter speed. They learn how you move, but not which keys you have taken.',
  },
  hard: {
    id: 'hard', label: 'HARD', order: 2,
    speedFactor: 1.0 * ALIEN_SPEED_CAP, knowsKeys: false, scoreMult: 1.3,
    blurb: 'Aliens move at full speed. They learn how you move, but not which keys you have taken.',
  },
  ultra: {
    id: 'ultra', label: 'ULTRA', order: 3,
    // Uncapped on purpose -- the only tier that is.
    speedFactor: 1.0, knowsKeys: true, scoreMult: 3.0,
    blurb: 'Uncapped speed, and they know exactly which keys you have taken. Every route you have left is modelled. Scores triple.',
  },
});

export const DIFFICULTY_IDS = Object.freeze(Object.keys(DIFFICULTIES));
export const DEFAULT_DIFFICULTY = 'medium';

export function difficultyOf(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}

/** Survival-time band the controller steers toward, in ticks. */
export const SURVIVAL_BAND = Object.freeze({
  lo: 30 * TICKS_PER_SECOND,
  hi: 75 * TICKS_PER_SECOND,
});

/**
 * Survival time is censored data: a run that was WON never ended in a capture, so its
 * survival time is a lower bound rather than a measurement. Scoring a fast win as a
 * short survival would make the controller relax for the strongest players, which is
 * backwards. A win is therefore treated as right-censored at the horizon.
 */
export const WIN_HORIZON = SURVIVAL_BAND.hi * 2;

export function effectiveSurvival(run) {
  if (!run) return 0;
  return run.won ? Math.max(run.ticks || 0, WIN_HORIZON) : (run.ticks || 0);
}

/**
 * The movement target: normalised visit entropy the curve assumes of an average player.
 * Below it the player is legible and the system leans harder on prediction; above it
 * prediction has little left to exploit and the temperature relaxes.
 */
export const ENTROPY_TARGET = 0.55;

export const CONTROLLER = Object.freeze({
  gain: 0.45,         // proportional gain on normalised band error
  entropyGain: 0.40,  // proportional gain on how predictable the player's movement is
  window: 5,          // runs averaged, per the spec
  tauMin: 0.25,
  tauMax: 3.0,
  lambdaScaleMin: 0.5,
  lambdaScaleMax: 2.0,
});

const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * The authored difficulty curve. `t` runs 0 at level 1 to 1 at CURVE_CAP and then stops.
 */
/**
 * @param {number} level
 * @param {string} [difficultyId] one of DIFFICULTY_IDS; shapes alien speed and what they know
 */
export function levelParams(level, difficultyId = DEFAULT_DIFFICULTY) {
  const capped = clamp(level, 1, CURVE_CAP);
  const t = (capped - 1) / (CURVE_CAP - 1);
  const tier = difficultyOf(difficultyId);
  return {
    level,
    difficulty: tier.id,
    difficultyLabel: tier.label,
    /** Aliens are told which keys are already collected. ULTRA only. */
    aliensKnowKeys: tier.knowsKeys,
    scoreMult: tier.scoreMult,
    curveT: t,
    rooms: Math.round(lerp(6, 10, t)),
    /**
     * Caches drive run length, and run length is exposure, which makes this the single
     * strongest difficulty term in the game -- stronger than patrol count, radius or
     * temperature. The spec's ceiling of six made level 10 unwinnable for all five bot
     * policies (2% across the board, every death inside thirty ticks), so the curve
     * tops out at five. Raising it back is a one-character change and bench/run.js
     * reports the win rate per level, so the cost of doing so is visible.
     */
    caches: Math.round(lerp(3, 5, t)),
    maxPatrols: Math.round(lerp(3, 5, t)),
    /**
     * Base arrival rate of the Poisson process, aliens per tick.
     *
     * Arrivals stop at maxPatrols and aliens never leave, so this governs how fast the
     * district fills to its cap rather than a steady-state population. There used to be
     * a matching departure rate here; it is gone, because retiring an alien on a map
     * that is entirely on screen just makes it vanish in front of the player. See the
     * note where _retirePatrols used to live in sim/game.js.
     */
    lambdaBase: lerp(0.0075, 0.0115, t),
    /**
     * Patrols already walking the district when you arrive. Without these a competent
     * player clears level 1 in about seventy ticks, which is inside the arrival grace
     * period plus one mean inter-arrival time -- they win having never seen a patrol,
     * and the whole predictor never gets to say anything. These are placed through the
     * ordinary spawner, so the 8-cell minimum distance still holds and a run still
     * cannot die before it starts.
     *
     * Exactly one, at every level. Two was tested and is a cliff rather than a step: a
     * pair of patrols converging from different sides leaves no escape direction, and
     * win rates fell from roughly a quarter to two per cent between level 3 and level 6.
     * Pressure at higher levels comes from arrival rate, radius, chase speed and
     * temperature instead, all of which the player can read and respond to.
     */
    initialPatrols: 1,
    /** Detection radius in cells, halved when the player stands in cover. */
    /**
     * Detection radius, halved while the player stands in water.
     *
     * Pulled down from 5.0-6.0 when the aliens learned to cross rubble: they now reach
     * you through buildings, so the same radius buys them appreciably more.
     */
    detectRadius: lerp(4.6, 5.6, t),
    coverDensity: lerp(0.15, 0.09, t),
    /** Broken buildings: rubble the human walks around and the aliens walk through. */
    buildings: Math.round(lerp(3, 7, t)),
    /** Lightning bolts per district, [min, max]. */
    boltsPerDistrict: [1, 2],
    /** Ticks of double speed a bolt picked up off the map grants. 3 seconds at 8 ticks/s. */
    boostTicks: 24,
    /** Ticks an alien stays stunned when shot. 5 seconds. */
    stunTicks: 5 * TICKS_PER_SECOND,
    /** Translucent black boxes: aliens cannot enter, and lose your trail when you do. */
    safeBoxes: 3,
    /**
     * Total coin VALUE scattered per district, 10 to 15 times the district number.
     * Denominations are 1, 2, 5 and 10, so the count is well below the value.
     */
    coinValuePerLevel: [10 * level, 15 * level],
    /** Flat coin award for clearing the district. */
    clearBonusCoins: 5 * level,
    /** Cells per tick while boosted. */
    boostSpeed: 2,
    /**
     * A randomly chosen alien splits in two somewhere in this window, then the window
     * is redrawn. Random rather than a fixed metronome so the player cannot simply
     * count to ten, and seeded so a run is still reproducible.
     */
    splitIntervalTicks: [10 * TICKS_PER_SECOND, 15 * TICKS_PER_SECOND],
    /** Retry delay when no alien can divide without crowding the player. */
    splitDeferTicks: 16,
    /** Softmax temperature before the controller touches it. Lower = sharper interception. */
    tauBase: lerp(1.40, 0.55, t),
    /** Ticks of immunity at the start of a run so a run never dies before it starts. */
    spawnGraceTicks: 40,
    /** How far ahead tier 1 projects the chain, in ticks. */
    kAhead: 20,
    /** Alert memory: ticks for which every patrol receives the live player position. */
    alertTicks: 20,
    /**
     * Patrol cadence, in ticks per move. Fractional on purpose and the single most
     * important balance number in the project.
     *
     * At 1.0 a hunting patrol moves exactly as fast as the player, which means that the
     * instant it is adjacent the run is over: the player steps, the patrol steps into
     * the cell they just left, the distance stays at one forever, and the only thing
     * that ever ends the chase is a corner. Running is not a strategy, cover does not
     * help at distance one, and every capture feels scripted.
     *
     * At 1.75 a fleeing player gains a cell roughly every two and a half ticks, so a
     * twenty-tick alert can be outrun by about six cells -- just past the detection
     * radius, which is what makes "break contact and the alert lapses" a real mechanic
     * rather than a sentence in a design document. The level-10 value is tighter but
     * still beatable.
     *
     * These are the numbers BEFORE the tier's speed factor divides them, and that factor
     * now carries ALIEN_SPEED_CAP, so the fastest alien in the game sits at 2.33 ticks
     * per move at district 1 and 2.00 at district 10.
     */
    chaseMovePeriod: lerp(1.75, 1.5, t) / tier.speedFactor,
    patrolMovePeriod: 2.5 / tier.speedFactor,
    /** How often the squad re-plans who covers which district. */
    coordEvery: 6,
    /** Spawner rejection-sampling constraints. */
    /**
     * Minimum arrival distance, measured as the ALIEN travels. Raised from the spec's 8
     * for the same reason as the radius: eight cells through a building is a much shorter
     * walk than eight cells around one.
     */
    spawnMinDist: 11,
    spawnMaxDist: 20,
    spawnTries: 30,
  };
}

/**
 * Proportional controller over the last `window` runs, on two signals.
 *
 * SURVIVAL decides pressure. Above the band the system gets busier (higher lambda);
 * below it, calmer. Inside the band it does nothing -- the deadband is what stops a
 * player who is exactly on target from being nudged every single run.
 *
 * MOVEMENT decides sharpness. The player's own normalised visit entropy says how legible
 * they have been, and temperature is the knob that exploits legibility: a player who
 * walks the same three districts every run gets a system that commits to the modal
 * guess, and a player who genuinely wanders gets one that admits it does not know. This
 * is the half of the controller that reads how someone MOVES rather than how long they
 * lasted, and it is what makes the difficulty curve personal rather than ordinal.
 *
 * IMPORTANT, and this is a design rule rather than an implementation detail: the result
 * is computed ONCE per district and then frozen for every retry of that district (see
 * ProfileStore.rememberDifficulty). Re-running the controller on each attempt means a
 * player who dies twice finds the third attempt harder than the first, which reads as
 * the game punishing them for losing. Tuning applies to districts they have not reached
 * yet.
 *
 * @param {Array<{ticks:number, won:boolean, score:number}>} runs  most recent last
 * @param {object} params                                           output of levelParams
 */
export function adaptDifficulty(runs = [], params) {
  const recent = runs.slice(-CONTROLLER.window);
  const base = {
    tau: params.tauBase, lambdaScale: 1,
    meanSurvival: null, meanEntropy: null,
    error: 0, entropyError: 0, acting: false,
  };
  if (recent.length === 0) return base;

  let sum = 0;
  for (const r of recent) sum += effectiveSurvival(r);
  const meanSurvival = sum / recent.length;
  const centre = (SURVIVAL_BAND.lo + SURVIVAL_BAND.hi) / 2;

  let error = 0;
  if (meanSurvival > SURVIVAL_BAND.hi) error = (meanSurvival - SURVIVAL_BAND.hi) / centre;
  else if (meanSurvival < SURVIVAL_BAND.lo) error = (meanSurvival - SURVIVAL_BAND.lo) / centre;

  // Normalised visit entropy, as the HUD's noise index already reports it.
  const scored = recent.filter((r) => Number.isFinite(r.score));
  const meanEntropy = scored.length
    ? scored.reduce((a, r) => a + r.score / 1000, 0) / scored.length
    : null;
  const entropyError = meanEntropy === null ? 0 : (meanEntropy - ENTROPY_TARGET) / ENTROPY_TARGET;

  const tau = clamp(
    params.tauBase * (1 - CONTROLLER.gain * error + CONTROLLER.entropyGain * entropyError),
    CONTROLLER.tauMin, CONTROLLER.tauMax,
  );
  const lambdaScale = clamp(1 + CONTROLLER.gain * error, CONTROLLER.lambdaScaleMin, CONTROLLER.lambdaScaleMax);

  return {
    tau, lambdaScale,
    meanSurvival, meanEntropy,
    error, entropyError,
    acting: error !== 0 || Math.abs(entropyError) > 0.05,
  };
}

export const ticksToSeconds = (ticks) => ticks / TICKS_PER_SECOND;
