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

export const CONTROLLER = Object.freeze({
  gain: 0.45,         // proportional gain on normalised band error
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
export function levelParams(level) {
  const capped = clamp(level, 1, CURVE_CAP);
  const t = (capped - 1) / (CURVE_CAP - 1);
  return {
    level,
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
     * Base arrival rate of the Poisson process, patrols per tick.
     *
     * Paired with patrolLifetime below, because arrivals without departures is not a
     * balance choice, it is a bug with a plausible-looking parameter. A pure arrival
     * process saturates at maxPatrols within the first minute and stays there for the
     * rest of the run, so "cap concurrent patrols at 3 to 5" stops describing a
     * population and starts describing a floor. With departures this is a birth-death
     * process whose steady state is lambda * lifetime, kept deliberately below the cap
     * so the cap binds only during a bad stretch.
     */
    lambdaBase: lerp(0.0075, 0.0115, t),
    /** Mean ticks a patrol stays on shift. Exponential, so retirement is memoryless. */
    patrolLifetime: lerp(260, 300, t),
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
    detectRadius: lerp(5.0, 6.0, t),
    coverDensity: lerp(0.15, 0.09, t),
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
     */
    chaseMovePeriod: lerp(1.75, 1.5, t),
    patrolMovePeriod: 2.5,
    /** Spawner rejection-sampling constraints. */
    spawnMinDist: 8,
    spawnMaxDist: 18,
    spawnTries: 30,
  };
}

/**
 * Proportional controller over the last `window` runs.
 * Above the band the system gets sharper (lower tau) and busier (higher lambda);
 * below the band it relaxes. Inside the band it does nothing -- the deadband is what
 * stops a player who is exactly on target from being nudged every single run.
 *
 * @param {Array<{ticks:number}>} runs  most recent last
 * @param {object} params               output of levelParams
 */
export function adaptDifficulty(runs = [], params) {
  const recent = runs.slice(-CONTROLLER.window);
  const base = { tau: params.tauBase, lambdaScale: 1, meanSurvival: null, error: 0, acting: false };
  if (recent.length === 0) return base;

  let sum = 0;
  for (const r of recent) sum += effectiveSurvival(r);
  const mean = sum / recent.length;
  const centre = (SURVIVAL_BAND.lo + SURVIVAL_BAND.hi) / 2;

  let error = 0;
  if (mean > SURVIVAL_BAND.hi) error = (mean - SURVIVAL_BAND.hi) / centre;
  else if (mean < SURVIVAL_BAND.lo) error = (mean - SURVIVAL_BAND.lo) / centre;

  const tau = clamp(params.tauBase * (1 - CONTROLLER.gain * error), CONTROLLER.tauMin, CONTROLLER.tauMax);
  const lambdaScale = clamp(1 + CONTROLLER.gain * error, CONTROLLER.lambdaScaleMin, CONTROLLER.lambdaScaleMax);

  return { tau, lambdaScale, meanSurvival: mean, error, acting: error !== 0 };
}

export const ticksToSeconds = (ticks) => ticks / TICKS_PER_SECOND;
