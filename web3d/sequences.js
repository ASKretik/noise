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
  // The capture is an ATTACK: about six seconds of it, then black. Distances are metres
  // from your eyes to its face; the face is pinned to the camera (web3d/play3d.js) and the
  // body hangs off it.
  //   0.0  the lights die: two flickers, a buzz, then black. Your heart.
  //   1.0  it is there, 2.6 m off in the dark, eyes burning. It comes at you in jerks --
  //        lurch, stop, lurch -- jaw slowly dropping, claws rising. You back away.
  //   2.2  it rears up at arm's length, claws spread, hissing.
  //   2.6  the lunge, claws raking in, smeared;
  //   2.75 impact: a flash, a bass hit, the scream, three gashes torn across the screen,
  //        and you are knocked flat, looking up at it leaning over you.
  //   3.35 it bites at your face, three times, head thrashing, screaming between bites.
  //   5.3  it draws back. Stillness, silence, its breath; the jaw opens impossibly wide.
  //   5.8  one last lunge into the lens -- 6.0 black and silence -- 6.15 a crunch.
  // skipAfter: nothing skips it before then (a held key auto-repeats; see play3d.js).
  jumpscare: Object.freeze({
    full: Object.freeze({
      duration: 7.0, skippable: true, skipAfter: 2.5,
      lunge: true, instant: true, attack: true,  // in front of wherever you were looking
      snap: 0.06, blend: 0.4,                    // your view eases from where it was
      flashes: [
        { t: 2.75, dur: 0.08, color: '#f4f0ff', alpha: 0.8 },      // the impact
        { t: 3.35, dur: 0.06, color: '#ff1a2e', alpha: 0.22 },     // the bites
        { t: 3.8, dur: 0.06, color: '#ff1a2e', alpha: 0.22 },
        { t: 4.4, dur: 0.06, color: '#ff1a2e', alpha: 0.25 },
      ],
      tracks: {
        // its face, relative to your view
        dist: [[0, 2.6], [0.9, 2.6], [1.15, 2.2], [1.3, 2.15], [1.55, 1.75], [1.7, 1.7], [1.95, 1.35], [2.2, 1.05],
          [2.6, 0.95], [2.75, 0.42], [3.1, 0.8], [3.25, 0.78], [3.35, 0.45], [3.5, 0.8], [3.7, 0.78], [3.8, 0.42],
          [3.95, 0.8], [4.3, 0.78], [4.4, 0.4], [4.55, 0.8], [5.3, 0.78], [5.75, 1.0], [5.8, 1.0], [6.0, 0.05], [7.0, 0.05]],
        yOff: [[0, 0.1], [2.2, 0.1], [2.6, 0.14], [2.75, 0], [3.1, -0.02], [5.3, -0.02], [5.75, 0.1], [6.0, 0], [7.0, 0]],
        xOff: [[0, 0], [2.75, 0.04], [3.1, -0.02], [7.0, -0.02]],
        // its body
        lean: [[0, 0.05], [2.2, 0.05], [2.6, -0.18], [2.75, 0.35], [3.1, 0.62], [5.3, 0.62], [5.75, 0.45], [6.0, 0.7], [7.0, 0.7]],
        claw: [[0, 0.15], [1.0, 0.2], [2.2, 0.55], [2.4, 1], [7.0, 1]],
        swipe: [[0, 0], [2.6, 0], [2.75, 1], [3.1, 0.1], [3.35, 0.35], [3.5, 0.1], [3.8, 0.4], [3.95, 0.1], [4.4, 0.45],
          [4.55, 0.1], [5.3, 0.1], [5.75, 0], [6.0, 0.8], [7.0, 0.8]],
        jaw: [[0, 0.05], [1.0, 0.1], [1.6, 0.4], [2.2, 0.7], [2.6, 1.1], [2.75, 1.45], [3.25, 1.5], [3.35, 0.5], [3.48, 1.55],
          [3.7, 1.5], [3.8, 0.5], [3.93, 1.55], [4.3, 1.5], [4.4, 0.45], [4.55, 1.6], [5.3, 1.55], [5.75, 1.85], [7.0, 1.85]],
        dilate: [[0, 0.4], [1.0, 0.6], [2.2, 1], [7.0, 1]],
        thrash: [[0, 0.05], [1.0, 0.15], [1.3, 0.05], [1.55, 0.2], [2.2, 0.1], [2.75, 0.5], [3.1, 0.3], [3.35, 0.6], [3.5, 0.3],
          [3.8, 0.6], [3.95, 0.3], [4.4, 0.6], [4.55, 0.35], [5.3, 0.3], [5.4, 0], [5.8, 0], [6.0, 0.4], [7.0, 0.4]],
        // you: backing away, then knocked flat on the impact, looking up at it
        camY: [[0, 0], [2.75, 0], [2.97, -1.08], [3.05, -0.98], [3.13, -1.02], [7.0, -1.02]],
        back: [[0, 0], [1.0, 0], [2.2, 0.25], [2.75, 0.3], [3.01, 0.75], [7.0, 0.75]],
        pitch: [[0, 0.05], [2.2, 0.08], [2.75, 0.06], [2.95, 0.62], [3.09, 0.5], [7.0, 0.5]],
        roll: [[0, 0], [0.5, 0.02], [1.0, -0.02], [2.75, 0], [2.97, -0.34], [3.15, -0.24], [3.35, -0.3], [3.8, -0.2],
          [4.4, -0.3], [5.3, -0.22], [7.0, -0.22]],
        yawK: [[0, 0], [2.75, 0], [2.81, 0.16], [3.15, 0.07], [7.0, 0.07]],
        // the picture
        shake: [[0, 0], [0.12, 0.015], [0.3, 0], [0.42, 0.015], [0.6, 0], [2.6, 0.01], [2.75, 0.13], [2.95, 0.05],
          [3.15, 0.02], [3.35, 0.09], [3.45, 0.02], [3.8, 0.1], [3.9, 0.02], [4.4, 0.11], [4.5, 0.03], [5.3, 0.02],
          [5.35, 0], [5.8, 0], [6.0, 0.08], [6.01, 0]],
        smear: [[0, 0], [1.0, 0], [1.15, 0.3], [1.3, 0], [1.55, 0.3], [1.7, 0], [2.6, 0.2], [2.73, 0.85], [2.95, 0.6],
          [3.15, 0.2], [3.35, 0.5], [3.45, 0.2], [3.8, 0.55], [3.9, 0.2], [4.4, 0.55], [4.5, 0.2], [5.3, 0.2], [5.4, 0],
          [5.8, 0], [5.98, 0.8], [6.01, 0]],
        glitch: [[0, 0], [0.12, 0.3], [0.18, 0], [0.42, 0.35], [0.48, 0], [2.6, 0.05], [2.75, 0.6], [2.9, 0.15],
          [3.35, 0.45], [3.42, 0.08], [3.8, 0.5], [3.88, 0.08], [4.4, 0.5], [4.48, 0.08], [5.3, 0.05], [5.35, 0],
          [5.85, 0], [5.95, 0.6], [6.01, 0]],
        fov: [[0, 0], [1.0, -3], [2.2, -6], [2.6, -2], [2.75, -14], [3.1, -6], [5.3, -8], [5.75, -4], [6.0, -24], [7.0, -24]],
        gash: [[0, 0], [2.77, 0], [2.81, 1], [7.0, 1]],
        drip: [[0, 0], [2.81, 0], [6.0, 1], [7.0, 1]],
        vignette: [[0, 0.2], [1.0, 0.35], [2.2, 0.5], [2.75, 0.9], [2.95, 0.55], [3.25, 0.85], [3.5, 0.55], [3.8, 0.85],
          [4.1, 0.55], [4.4, 0.9], [4.8, 0.6], [5.3, 0.8], [5.8, 0.95], [7.0, 0.95]],
        // the lights die in two flickers (two in a second: inside WCAG 2.3.1), then black
        dark: [[0, 0.2], [0.12, 0.85], [0.22, 0.35], [0.42, 0.95], [0.52, 0.6], [1.0, 1], [7.0, 1]],
        fogFar: [[0, 9], [1.0, 6.5], [2.2, 4.5], [2.75, 3.4], [7.0, 3.4]],
        fade: [[0, 0], [6.0, 0], [6.01, 1], [7.0, 1]],             // a hard cut, then held black
      },
      // every sound, in order; play3d fires each once (web3d/audio3d.js)
      sounds: [
        { at: 0, kind: 'buzz', level: 1 },
        { at: 0.3, kind: 'beat', level: 0.8 },
        { at: 0.42, kind: 'buzz', level: 0.7 },
        { at: 1.0, kind: 'beat', level: 0.9 },
        { at: 1.15, kind: 'breath', level: 0.7 },
        { at: 1.6, kind: 'beat', level: 1 },
        { at: 1.95, kind: 'breath', level: 0.9 },
        { at: 2.05, kind: 'beat', level: 1 },
        { at: 2.2, kind: 'hiss', level: 1 },
        { at: 2.55, kind: 'swipe', level: 1 },
        { at: 2.75, kind: 'grab', level: 1 },
        { at: 2.75, kind: 'shriek', level: 1, dur: 1.0 },
        { at: 3.33, kind: 'snap', level: 1 },
        { at: 3.78, kind: 'snap', level: 1 },
        { at: 3.9, kind: 'shriek', level: 0.85, dur: 0.45 },
        { at: 4.38, kind: 'snap', level: 1 },
        { at: 4.5, kind: 'shriek', level: 0.9, dur: 0.75 },
        { at: 5.32, kind: 'breath', level: 1 },
        { at: 5.8, kind: 'swipe', level: 1 },
        { at: 5.82, kind: 'shriek', level: 1, dur: 0.18 },
        { at: 6.0, kind: 'cut' },
        { at: 6.15, kind: 'crunch', level: 1 },
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
export function variantFor(setting) {
  // The Jumpscares setting, and nothing else. Until R50 reduce motion also turned full into
  // mild, silently -- including when it was inherited from the operating system -- so a
  // player could get the gentle version without ever having chosen it.
  return ['full', 'mild', 'off'].includes(setting) ? setting : 'full';
}
