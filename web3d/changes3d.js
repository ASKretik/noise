// web3d/changes3d.js -- what changed in each 3D build, newest first.
//
// Shown in the "in development" banner on every 3D page, and the same text as the review
// note posted after each update. `npm run stamp3d` refuses to bump the build without an
// entry for the new number, so the banner can never be blank or behind.
//
// { build, date, phase, changed: [], tryThis: [], unverified: [] }

export const CHANGES = [
  {
    build: 5,
    date: '2026-11-17',
    phase: 5,
    changed: [
      'A full HUD: a minimap that turns with you (it is the 2D game\'s own board), a compass with key markers, waypoints over every key with the distance in metres.',
      'Hold Tab or M for the tactical map: the whole district from above. H adds the prediction heatmap, V where you have been, I where the aliens are heading.',
      'Red arcs around the crosshair point at every alien that can hear you; a noise meter says how deep inside its range you are, and when water or a black box is hiding you.',
      'The surveillance system narrates as intercepted radio subtitles, from its live prediction of you.',
      'Settings in the pause menu: sensitivity, invert Y, field of view, reduce motion, sound, quality. Subtle head bob and a sprint FOV kick, both off under reduce motion.',
    ],
    tryThis: [
      'Play a district without holding Tab once. Is the minimap plus waypoints enough?',
      'Get spotted and turn on the spot: do the red arcs tell you where to look?',
      'Press H, then hold Tab: the red tint is where the system expects you next.',
    ],
    unverified: [
      'HUD layout checked at one window size only; small laptop screens may crowd it.',
      'The narration uses the templated path only on this page (no language model here, by design).',
    ],
  },
  {
    build: 4,
    date: '2026-11-17',
    phase: 4,
    changed: [
      'Aliens are creatures now: hunched red bodies, big white eyes, long arms. They glide between cells at their real speed instead of hopping.',
      'A detection ring on the floor around every alien, red when it can hear you, shrinking when you step into water.',
      'Proper keys, coins (colour is value, bigger glows more) and lightning bolts; collected things fly to you.',
      'When you are caught the camera turns to face what caught you; the portal is a beam of light visible over every wall.',
      'Sound: each alien has its own growl placed in 3D, so you can hear one behind a wall; footsteps go quiet in water and silent in a black box.',
    ],
    tryThis: [
      'Headphones on. District 3 at Medium: listen for an alien before you see it.',
      'Step into water near an alien and watch its ring shrink.',
      'Get caught on purpose: is it always clear which alien did it?',
    ],
    unverified: [
      'The sound has only been checked for errors, never actually listened to.',
      'Rings are faint on the darkest belts (TIDE, SOLAR): say if you lose track of them.',
      'Aliens walk through rubble, so a capture can come from inside a heap; the camera turns to it but it may be half hidden.',
    ],
  },
  {
    build: 3,
    date: '2026-11-17',
    phase: 3,
    changed: [
      'Districts look like places: each of the ten belts has its own ground, walls, rubble, water, fog and sky, taken from the 2D palettes.',
      'Procedural textures drawn at load (paving with cell seams, weathered walls, rippling water) -- still no image files.',
      'Rubble is a seeded heap per cell; black boxes are translucent with scanlines, and stepping inside dims your view.',
      'Quality tiers (High adds shadows) picked automatically per device.',
      'You now start facing the most open corridor instead of a wall or a heap.',
    ],
    tryThis: [
      'Visit a district in several belts: 1, 21, 41, 71, 91. Does each feel like a different part of the city?',
      'Step into a black box (dark translucent block) and out again.',
      'Dev page: /noise/3d/belts.html shows all ten belts side by side with an alien, a key, coins and a bolt in each.',
    ],
    unverified: [
      'Aliens, keys and coins are still placeholder shapes; coins are hard to see. Phase 4.',
      'Shadows (High tier) not yet checked on a real GPU at full frame rate.',
      'Movement feel from phase 2 still open: say if it feels off.',
    ],
  },
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
