// web3d/changes3d.js -- what changed in each 3D build, newest first.
//
// Shown in the "in development" banner on every 3D page, and the same text as the review
// note posted after each update. `npm run stamp3d` refuses to bump the build without an
// entry for the new number, so the banner can never be blank or behind.
//
// { build, date, phase, changed: [], tryThis: [], unverified: [] }

export const CHANGES = [
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
