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
  // The capture is a JUMPSCARE: no wind-up. On the frame you are caught the alien is
  // simply there, in your face, dead centre of wherever you were looking -- jaw tearing
  // open over rows of teeth, eye slits flaring, lit from below by a flickering red light
  // while everything else drops into darkness -- with a bass hit, a shriek, a flash and a
  // violent shake all at once. It pushes closer for 1.4 s while the frame tears, then a
  // hard cut to black and silence. Distances are metres from your eyes to its face.
  // skipAfter: nothing skips it before then (a held key auto-repeats; see play3d.js).
  jumpscare: Object.freeze({
    full: Object.freeze({
      duration: 2.2, skippable: true, skipAfter: 1.0,
      lunge: true, instant: true,  // appears in front of your view, no travel, no turn
      snap: 0.06, pitch: -0.24,
      flashes: [
        { t: 0, dur: 0.1, color: '#ffe0e4', alpha: 0.75 },        // the hit
        { t: 0.62, dur: 0.07, color: '#ff1a2e', alpha: 0.45 },     // a second spasm
      ],
      tracks: {
        dist: [[0, 0.7], [0.12, 0.6], [1.4, 0.54], [2.2, 0.54]],
        reach: [[0, 0.3], [2.2, 0.3]],
        pull: [[0, 0.04], [1.4, 0.08], [2.2, 0.08]],
        jaw: [[0, 0.35], [0.14, 1.3], [0.62, 1.15], [0.7, 1.35], [2.2, 1.35]],
        dilate: [[0, 0.5], [0.1, 1], [2.2, 1]],
        shake: [[0, 0.1], [0.4, 0.05], [0.62, 0.08], [1.0, 0.04], [1.4, 0.05], [1.42, 0]],
        glitch: [[0, 1], [0.25, 0.45], [0.62, 1], [0.9, 0.5], [1.3, 0.9], [1.42, 0]],
        fov: [[0, -16], [1.4, -22], [2.2, -22]],
        dark: [[0, 1], [2.2, 1]],                                  // the world drops away
        fade: [[0, 0], [1.42, 0], [1.44, 1], [2.2, 1]],            // a hard cut, then held black
      },
      grab: { at: 0, level: 1 },
      shriek: { at: 0, level: 1, dur: 1.42 },
      cut: { at: 1.42 },
    }),
    mild: Object.freeze({
      duration: 2.4, skippable: true, skipAfter: 0.6, lunge: true, instant: false, snap: 0.3,
      flashes: [{ t: 0.4, dur: 0.2, color: '#ff1a2e', alpha: 0.2 }],
      tracks: {
        approach: [[0, 0], [0.4, 1]],
        dist: [[0, 0.9], [2.4, 0.9]],
        reach: [[0, 0.2], [0.4, 1], [2.4, 1]],
        pull: [[0, 0]], shake: [[0, 0]], glitch: [[0, 0]], fov: [[0, 0]], dilate: [[0, 0], [0.4, 0.6]],
        jaw: [[0, 0], [0.5, 0], [0.9, 0.6], [2.4, 0.6]],
        dark: [[0, 0], [0.5, 0.5], [2.4, 0.5]],
        fade: [[0, 0], [1.6, 0], [2.0, 1], [2.4, 1]],
      },
      grab: { at: 0.4, level: 0.4 },
      shriek: { at: 0.5, level: 0.3, dur: 0.8 },
      cut: null,
    }),
    off: Object.freeze({
      duration: 0.9, skippable: true, skipAfter: 0, lunge: false, snap: 0.45,
      flashes: [],
      tracks: { jaw: [[0, 0]], shake: [[0, 0]], glitch: [[0, 0]], fade: [[0, 0]] },
      grab: null, shriek: null, cut: null,
    }),
  }),

  ascension: Object.freeze({
    full: Object.freeze({
      duration: 2.4, skippable: true, skipAfter: 0.8,
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
      duration: 2.4, skippable: true, skipAfter: 0.8,
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
      duration: 0.65, skippable: true, skipAfter: 0, flashes: [],
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
