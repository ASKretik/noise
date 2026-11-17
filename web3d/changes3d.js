// web3d/changes3d.js -- what changed in each 3D build, newest first.
//
// Shown in the "in development" banner on every 3D page, and the same text as the review
// note posted after each update. `npm run stamp3d` refuses to bump the build without an
// entry for the new number, so the banner can never be blank or behind.
//
// { build, date, phase, changed: [], tryThis: [], unverified: [] }

export const CHANGES = [
  {
    build: 2,
    date: '2026-11-17',
    phase: 2,
    changed: [
      'Playable graybox: the real game in first person on the unmodified sim -- grey walls, brown rubble, blue water, dark black boxes, red aliens, gold keys.',
      'Mouse look with pointer lock, WASD, Shift to sprint (once you have charge), Esc pauses, R restarts.',
      'The "leash": your body moves smoothly while the sim still steps one cell at a time underneath, so every rule of the 2D game holds exactly.',
      'Tuning panel on the backquote key (`): cell size, tick rate, acceleration, field of view, mouse sensitivity, plus a leash debug readout.',
    ],
    tryThis: [
      'Launcher: pick district 1 at Medium, enter, click to take the mouse. Walk, turn, slide along a wall, cut a corner diagonally.',
      'Press ` and try a few values. "copy values" puts the ones you like on the clipboard to send back.',
      'District 5 and 10 at Hard: does a capture feel earned or arbitrary?',
    ],
    unverified: [
      'Nobody has played this with a real mouse yet; the browser checks drove it by script. Feel is the open question of this phase.',
      'Placeholder art, no sound, no minimap, no stun gun yet -- phases 3 to 6.',
      'Mouse and keyboard only; phones arrive in phase 8.',
      'Progress is not saved yet (phase 7). Every visit starts a fresh, cold file.',
    ],
  },
  {
    build: 1,
    date: '2026-11-17',
    phase: 0,
    changed: [
      'The 3D game has a home: this page, reached from "3D · in development" on the main page.',
      'three.js 0.185.1 is vendored into the repository and loads from it, not from a CDN.',
      'Placeholder scene: a spinning cube in each belt colour, to prove the renderer works on your device.',
    ],
    tryThis: [
      'Open the main page and click "3D · in development" in the header.',
      'Check this banner reads build 1, then open it on your phone too.',
    ],
    unverified: [
      'Nothing to play yet. The playable graybox arrives in phase 2.',
    ],
  },
];
