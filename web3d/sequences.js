// web3d/sequences.js -- the capture jumpscare and the portal ascension, as data. Pure.
//
// Each sequence is a timeline: a duration, a list of FLASHES (short luminance spikes) and
// keyframed TRACKS sampled every frame by web3d/play3d.js. Keeping them as data, not code,
// is what lets criterion 3D-15 check the safety rules in Node: no sequence flashes more
// than three times in any one second (WCAG 2.3.1), every sequence can be skipped, and
// each comes in full, mild and off.
//
// Times are real seconds from the moment of capture (or of reaching the portal).

/** WCAG 2.3.1: no more than three flashes in any one-second period. */
export const FLASH_MAX_PER_SECOND = 3;

export const SEQUENCES = Object.freeze({
  // The capture is a short game-over cutscene, not a flash: the alien lunges in with its
  // arms out, GRABS (the view jolts toward it), drags you face to face, its jaw unhinges
  // and it screams while the frame shakes and tears -- then a hard cut to black and
  // silence before the end card. Distances are metres from your eyes to its face.
  jumpscare: Object.freeze({
    full: Object.freeze({
      duration: 2.6, skippable: true, lunge: true,
      snap: 0.12,                  // seconds for the camera to whip round to it
      flashes: [
        { t: 0.35, dur: 0.08, color: '#ff1a2e', alpha: 0.35 },     // the grab
        { t: 0.9, dur: 0.12, color: '#ff1a2e', alpha: 0.6 },       // the scream
      ],
      tracks: {
        approach: [[0, 0], [0.3, 1]],                                // from where it was to arm's length
        // ends at 0.58 m, minus the grab's 0.1 m pull: eyes and the screaming mouth fill the view
        dist: [[0, 0.9], [0.35, 0.9], [0.5, 0.72], [0.95, 0.58], [2.6, 0.58]],
        reach: [[0, 0.2], [0.3, 1], [2.6, 1]],
        pull: [[0, 0], [0.35, 0], [0.42, 0.14], [0.9, 0.1], [2.6, 0.1]],
        jaw: [[0, 0], [0.8, 0.1], [1.0, 1], [2.6, 1]],
        shake: [[0, 0], [0.35, 0.03], [0.6, 0.01], [0.9, 0.07], [1.8, 0.05], [1.85, 0]],
        glitch: [[0, 0], [0.35, 0.4], [0.5, 0.1], [0.9, 1], [1.7, 0.8], [1.85, 0]],
        fov: [[0, 0], [0.8, 0], [1.0, -10], [2.6, -10]],
        fade: [[0, 0], [1.84, 0], [1.86, 1], [2.6, 1]],             // a hard cut, then held black
      },
      grab: { at: 0.35, level: 1 },
      shriek: { at: 0.85, level: 1, dur: 1.0 },
      cut: { at: 1.85 },
    }),
    mild: Object.freeze({
      duration: 2.4, skippable: true, lunge: true, snap: 0.3,
      flashes: [{ t: 0.9, dur: 0.2, color: '#ff1a2e', alpha: 0.2 }],
      tracks: {
        approach: [[0, 0], [0.3, 1]],
        dist: [[0, 0.9], [2.4, 0.9]],
        reach: [[0, 0.2], [0.3, 1], [2.4, 1]],
        pull: [[0, 0]], shake: [[0, 0]], glitch: [[0, 0]], fov: [[0, 0]],
        jaw: [[0, 0], [0.9, 0], [1.2, 0.55], [2.4, 0.55]],
        fade: [[0, 0], [1.6, 0], [2.0, 1], [2.4, 1]],
      },
      grab: { at: 0.35, level: 0.4 },
      shriek: { at: 0.9, level: 0.3, dur: 0.8 },
      cut: null,
    }),
    off: Object.freeze({
      duration: 0.9, skippable: true, lunge: false, snap: 0.45,
      flashes: [],
      tracks: { jaw: [[0, 0]], shake: [[0, 0]], glitch: [[0, 0]], fade: [[0, 0]] },
      grab: null, shriek: null, cut: null,
    }),
  }),

  ascension: Object.freeze({
    full: Object.freeze({
      duration: 2.4, skippable: true,
      flashes: [],
      tracks: {
        beam: [[0, 0], [0.4, 1], [2.4, 1]],
        // eye height to 40 m, easing in: slow off the ground, fast at the top
        lift: [[0, 0], [0.4, 0], [0.8, 0.05], [1.2, 0.18], [1.6, 0.45], [2.0, 1], [2.4, 1]],
        spin: [[0, 0], [0.4, 0], [2.0, Math.PI / 2], [2.4, Math.PI / 2]],
        fov: [[0, 0], [0.4, 0], [2.0, 15], [2.4, 15]],
        pitch: [[0, 0], [0.4, 0], [2.0, -0.95], [2.4, -0.95]],
        particles: [[0, 0], [0.35, 1], [2.4, 1]],
        whiteout: [[0, 0], [2.0, 0], [2.4, 1]],
      },
      rise: { level: 1 },
    }),
    mild: Object.freeze({
      duration: 2.4, skippable: true,
      flashes: [],
      tracks: {
        beam: [[0, 0], [0.4, 1], [2.4, 1]],
        lift: [[0, 0], [0.4, 0], [1.2, 0.15], [2.0, 0.6], [2.4, 0.7]],
        spin: [[0, 0]], fov: [[0, 0]],
        pitch: [[0, 0], [0.4, 0], [2.0, -0.6], [2.4, -0.6]],
        particles: [[0, 0], [0.35, 0.6], [2.4, 0.6]],
        whiteout: [[0, 0], [1.9, 0], [2.4, 1]],
      },
      rise: { level: 0.5 },
    }),
    off: Object.freeze({
      duration: 0.65, skippable: true, flashes: [],
      tracks: { beam: [[0, 0]], lift: [[0, 0]], spin: [[0, 0]], fov: [[0, 0]], pitch: [[0, 0]], particles: [[0, 0]], whiteout: [[0, 0]] },
      rise: null,
    }),
  }),
});

/** Linear interpolation through [t, value] keys; held flat before the first and after the last. */
export function sample(track, t) {
  if (!track || track.length === 0) return 0;
  if (t <= track[0][0]) return track[0][1];
  for (let i = 1; i < track.length; i++) {
    const [t1, v1] = track[i];
    if (t <= t1) {
      const [t0, v0] = track[i - 1];
      return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-9, t1 - t0);
    }
  }
  return track[track.length - 1][1];
}

/** Opacity of the flash layer at time t (flashes are rectangular pulses). */
export function flashAt(seq, t) {
  let a = 0, color = null;
  for (const f of seq.flashes) if (t >= f.t && t < f.t + f.dur) { a = Math.max(a, f.alpha * (1 - (t - f.t) / f.dur)); color = f.color; }
  return { a, color };
}

/** The most flashes that start within any one-second window. */
export function maxFlashesPerSecond(seq) {
  const ts = seq.flashes.map((f) => f.t).sort((x, y) => x - y);
  let most = 0;
  for (let i = 0; i < ts.length; i++) {
    let n = 0;
    for (let j = i; j < ts.length && ts[j] < ts[i] + 1; j++) n++;
    most = Math.max(most, n);
  }
  return most;
}

/** Which variant plays: the setting, except that "reduce motion" turns full into mild. */
export function variantFor(setting, reduceMotion) {
  const v = ['full', 'mild', 'off'].includes(setting) ? setting : 'full';
  return reduceMotion && v === 'full' ? 'mild' : v;
}
