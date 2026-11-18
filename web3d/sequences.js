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
  // The capture is an ATTACK, in four beats. Distances are metres from your eyes to its
  // face; the face is pinned to the camera (web3d/play3d.js), the body hangs off it.
  //   0.00  it is there in the dark, rearing over you: arms flung wide, claws spread, jaw
  //         dropping, a hiss. Lit from above by a cold light that catches every wet tooth.
  //   0.26  the lunge: it covers a metre in a seventh of a second, claws raking in, smeared.
  //   0.40  impact: a flash, a bass hit, the scream; three gashes tear across the screen
  //         and you are knocked flat -- the view drops to the floor, rolls, and looks up
  //   0.72  into it, leaning down over you. It bites at you twice, the head thrashing, the
  //   1.62  frame shaking with every snap; then one last lunge into the lens, and at 1.80
  //         black and silence -- and in the black, a crunch.
  // skipAfter: nothing skips it before then (a held key auto-repeats; see play3d.js).
  jumpscare: Object.freeze({
    full: Object.freeze({
      duration: 2.8, skippable: true, skipAfter: 1.2,
      lunge: true, instant: true, attack: true,  // appears in front of your view, no turn
      snap: 0.06,
      flashes: [
        { t: 0.4, dur: 0.08, color: '#f4f0ff', alpha: 0.8 },       // the impact
        { t: 0.95, dur: 0.06, color: '#ff1a2e', alpha: 0.22 },     // first bite
        { t: 1.32, dur: 0.06, color: '#ff1a2e', alpha: 0.25 },     // second bite
      ],
      tracks: {
        // its face, relative to your view
        dist: [[0, 0.95], [0.26, 0.9], [0.4, 0.42], [0.72, 0.8], [0.86, 0.78], [0.95, 0.45], [1.1, 0.8],
          [1.24, 0.78], [1.32, 0.42], [1.47, 0.8], [1.62, 0.78], [1.8, 0.05], [2.8, 0.05]],
        yOff: [[0, 0.08], [0.26, 0.1], [0.4, 0.0], [0.72, -0.02], [2.8, -0.02]],
        xOff: [[0, 0], [0.4, 0.04], [0.72, -0.02], [2.8, -0.02]],
        // its body
        lean: [[0, -0.14], [0.26, -0.18], [0.4, 0.35], [0.72, 0.62], [2.8, 0.62]],
        claw: [[0, 0.6], [0.12, 1], [2.8, 1]],
        swipe: [[0, 0], [0.26, 0], [0.4, 1], [0.72, 0.1], [0.95, 0.35], [1.1, 0.1], [1.32, 0.4], [1.47, 0.1], [1.8, 0.6], [2.8, 0.6]],
        jaw: [[0, 0.3], [0.24, 1.0], [0.4, 1.45], [0.86, 1.5], [0.95, 0.55], [1.08, 1.55], [1.24, 1.5], [1.32, 0.5],
          [1.46, 1.6], [1.8, 1.65], [2.8, 1.65]],
        dilate: [[0, 0.6], [0.1, 1], [2.8, 1]],
        thrash: [[0, 0.1], [0.4, 0.5], [0.72, 0.3], [0.95, 0.6], [1.1, 0.3], [1.32, 0.6], [1.5, 0.35], [2.8, 0.35]],
        // you: knocked flat on the impact, looking up at it
        camY: [[0, 0], [0.4, 0], [0.62, -1.08], [0.7, -0.98], [0.78, -1.02], [2.8, -1.02]],
        back: [[0, 0], [0.4, 0], [0.66, 0.45], [2.8, 0.45]],
        pitch: [[0, 0.1], [0.4, 0.06], [0.6, 0.62], [0.74, 0.5], [2.8, 0.5]],
        roll: [[0, 0], [0.4, 0], [0.62, -0.34], [0.8, -0.24], [0.95, -0.3], [1.32, -0.2], [2.8, -0.22]],
        yawK: [[0, 0], [0.4, 0], [0.46, 0.16], [0.8, 0.07], [2.8, 0.07]],
        // the picture
        shake: [[0, 0.01], [0.4, 0.13], [0.6, 0.05], [0.8, 0.02], [0.95, 0.09], [1.05, 0.02], [1.32, 0.1], [1.42, 0.03],
          [1.62, 0.03], [1.8, 0.07], [1.81, 0]],
        smear: [[0, 0], [0.26, 0.2], [0.38, 0.85], [0.6, 0.6], [0.8, 0.2], [0.95, 0.5], [1.05, 0.2], [1.32, 0.55],
          [1.42, 0.2], [1.62, 0.25], [1.8, 0.8], [1.81, 0]],
        glitch: [[0, 0.05], [0.38, 0.1], [0.4, 0.6], [0.55, 0.15], [0.95, 0.45], [1.02, 0.08], [1.32, 0.5], [1.4, 0.08],
          [1.75, 0.6], [1.81, 0]],
        fov: [[0, -6], [0.3, -2], [0.4, -14], [0.7, -6], [1.62, -8], [1.8, -24], [2.8, -24]],
        gash: [[0, 0], [0.42, 0], [0.46, 1], [2.8, 1]],
        drip: [[0, 0], [0.47, 0], [1.8, 1], [2.8, 1]],
        vignette: [[0, 0.35], [0.4, 0.9], [0.6, 0.55], [0.9, 0.85], [1.1, 0.55], [1.35, 0.9], [1.6, 0.6], [1.8, 0.95], [2.8, 0.95]],
        dark: [[0, 1], [2.8, 1]],                                  // the world drops away
        fade: [[0, 0], [1.8, 0], [1.81, 1], [2.8, 1]],             // a hard cut, then held black
      },
      // every sound, in order; play3d fires each once (web3d/audio3d.js)
      sounds: [
        { at: 0, kind: 'hiss', level: 1 },
        { at: 0.22, kind: 'swipe', level: 1 },
        { at: 0.4, kind: 'grab', level: 1 },
        { at: 0.4, kind: 'shriek', level: 1, dur: 1.4 },
        { at: 0.93, kind: 'snap', level: 1 },
        { at: 1.3, kind: 'snap', level: 1 },
        { at: 1.8, kind: 'cut' },
        { at: 1.95, kind: 'crunch', level: 1 },
      ],
      grab: null, shriek: null, cut: null,
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
