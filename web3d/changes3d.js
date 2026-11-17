// web3d/changes3d.js -- what changed in each 3D build, newest first.
//
// Shown in the "in development" banner on every 3D page, and the same text as the review
// note posted after each update. `npm run stamp3d` refuses to bump the build without an
// entry for the new number, so the banner can never be blank or behind.
//
// { build, date, phase, changed: [], tryThis: [], unverified: [] }

export const CHANGES = [
  {
    build: 13,
    date: '2026-11-18',
    phase: 'N2',
    changed: [
      'New aliens: classic big-headed Greys. A huge domed head, enormous black almond eyes with glowing red slits, a narrow chin, a thin hunched body, long three-fingered hands, and backward-bending legs.',
      'They still read as the threat: red markings glow along their skin and a red rim of light traces their silhouette, brighter when they hunt.',
      'When an alien can hear you, its head turns to stare at you and tilts. Watch the heads: they tell you who has you before the HUD does.',
      'Idle aliens twitch now and then. A stunned one convulses, then collapses with its eyes gone dark.',
    ],
    tryThis: [
      'Walk into an alien\'s ring and watch its head snap round to you.',
      'With a gun (?kit=1 on a district link), stun one and watch it fall.',
      'Every belt has Greys for now; the other nine species are listed in spec-3d-next.md for later.',
    ],
    unverified: [
      'Close-ups were checked in screenshots, not in motion at full frame rate.',
      'Whether they are scary enough is your call; the jumpscare (N3) builds on these heads and jaws.',
    ],
  },
  {
    build: 12,
    date: '2026-11-18',
    phase: 'N1',
    changed: [
      'Fewer lightning bolts the deeper you go into each belt: a belt\'s first district keeps all of its bolts (about 18), its tenth keeps about a third (about 6), and the next belt starts full again.',
      'Which bolts remain is fixed per district, so a district always looks the same each time you play it.',
      'Bought lightning from the shop is now the way to keep sprinting late in a belt.',
    ],
    tryThis: [
      'Compare district 1 and district 10 of your save: count the bolts on the Tab map.',
      'Late in a belt, notice whether you ration your sprint differently.',
    ],
    unverified: [
      'Balance with a person playing: the test bots never sprint, so their win rates cannot show what fewer bolts does.',
    ],
  },
  {
    build: 11,
    date: '2026-11-18',
    phase: 'N0',
    changed: [
      'The sound stops when the game stops: pausing (Esc), switching tabs, and the end card all go silent, and it comes back when you resume.',
      'On a phone, switching away from the tab now pauses the game as well as the sound.',
    ],
    tryThis: [
      'Play, press Esc: silence. Click to resume: the sound returns.',
      'Switch to another tab mid-run: silence, and nothing moved while you were away.',
      'Get caught: the sound carries through the capture and stops when the end card appears.',
    ],
    unverified: [
      'Checked through the browser\'s audio state, not by ear.',
    ],
  },
  {
    build: 10,
    date: '2026-11-18',
    phase: 9,
    changed: [
      'Movement no longer stutters. Off-axis your body kept slamming into an invisible limit and stopping: at 20 degrees it stalled on a quarter of all frames, on an exact diagonal it froze outright, and sprinting stalled on up to half.',
      'Your speed is now capped to what the grid underneath can follow, with more slack behind you, so the body never hits that limit in normal movement. Measured: zero stalled frames at every heading, walking and sprinting.',
      'The trade-off, stated plainly: moving diagonally is slower than straight (about 64% walking, 53% sprinting on a pure diagonal), because the game underneath cannot step diagonally.',
    ],
    tryThis: [
      'Hold W+D and sweep the mouse slowly through a full turn: the motion should stay smooth the whole way round.',
      'Sprint along a corridor and then across an open room at an angle.',
      'Say whether the slower diagonals bother you: a fully free, shooter-style movement is possible but means a bigger change to the engine underneath.',
    ],
    unverified: [
      'Measured by script, frame by frame; not yet felt by a person with a real mouse.',
      'Aliens still glide-and-pause slightly between cells (they move on the 4 Hz grid). Say if that reads as choppy too.',
    ],
  },
  {
    build: 9,
    date: '2026-11-17',
    phase: 9,
    changed: [
      'Killcam: when you are caught, "killcam" on the end card replays the last three seconds from above and behind, with you, the alien and its ring.',
      'spec-3d.md now describes the 3D game as built, including what nobody has checked yet.',
      'All 13 of the 3D acceptance criteria pass; the 2D game\'s own suites are unchanged.',
    ],
    tryThis: [
      'Get caught, then watch the killcam: does it make clear how they got you?',
      'Then the open questions in spec-3d.md: does the movement feel right, is 4 ticks a second the right speed, should the minimap show every alien?',
      'Send back anything that feels off -- every suggestion is either done in the next update or written down with the reason it was not.',
    ],
    unverified: [
      'Nobody has played it with a real mouse, listened to the sound, or run it on a real phone.',
      'The foresight overlay (each alien\'s predicted path on the floor) was not built.',
    ],
  },
  {
    build: 8,
    date: '2026-11-17',
    phase: 8,
    changed: [
      'Phones: left thumb is a floating analog stick, right thumb drags to look, and RUN, STUN and MAP buttons sit under your right thumb. Pause sits at the top.',
      'A touch-only aim assist: STUN locks the alien nearest the centre of the screen within a small cone, because a thumb is not a mouse.',
      'Phones get the Low quality tier automatically; portrait shows a "turn sideways" card. Tapping play asks for full screen and landscape where the browser allows it.',
      'Coins are now drawn in four batches instead of one each: a busy district went from 97 to 59 draw calls.',
      'Measured on a laptop at 1080p Medium: about 82-92 frames per second on average.',
    ],
    tryThis: [
      'Open /noise/3d/ on your phone, sideways. Play district 1: can you steer and look at the same time?',
      'With a gun (?kit=1 on a district link), tap STUN with an alien roughly ahead.',
      'Rotate to portrait and back.',
    ],
    unverified: [
      'Never run on a real phone: tested in a desktop browser emulating a 740x360 touch screen. Your phone is the first real device.',
      'Full-screen and landscape lock depend on the browser; iPhone Safari does not allow either for a web page.',
    ],
  },
  {
    build: 7,
    date: '2026-11-17',
    phase: 7,
    changed: [
      'The 3D game is a whole game now: MAIN and GUEST save files, a permanent tier chosen once, a district grid by belt, and the shop.',
      'Scores, coin payouts, replay decay, best scores and unlocking the next district all work exactly as in 2D.',
      'The file on you builds across districts: the aliens\' model of how you move follows you, just as in 2D.',
      'The 3D saves are separate from your 2D saves and cannot touch them. MAIN districts are the same maps as 2D MAIN.',
      'Lightning bought here is labelled in real seconds: one bought second lasts two in the 3D city.',
    ],
    tryThis: [
      'Open /noise/3d/, make a MAIN file, pick a tier, clear district 1, then come back and buy something.',
      'Hand it to someone as GUEST: their run must not change your MAIN file.',
      'Your 2D save on the main page should be exactly where you left it.',
    ],
    unverified: [
      'This build starts every 3D save fresh (new build number), as every update does.',
      'The shop sells lightning in blocks of ten; say if single seconds would be better.',
    ],
  },
  {
    build: 6,
    date: '2026-11-17',
    phase: 6,
    changed: [
      'The stun gun, aimed: it stuns the one alien under your crosshair, if that alien is within its hearing range of you and nothing solid is in the way.',
      'The crosshair locks (red brackets) only when a shot would land, and a locked shot always lands. No lock, no charge spent: just a dry click.',
      'A gun in your hand, with its six charge cells lit along the top; recoil, a beam, and an electric zap.',
      'Until the shop arrives (phase 7), add ?kit=1 to a district link to carry a full gun and 10 s of lightning.',
    ],
    tryThis: [
      'Open /noise/3d/play.html?d=5&t=medium&kit=1, find an alien and lock it.',
      'Try locking one behind rubble, and one far away: the brackets go dashed, and clicking costs nothing.',
      'Stun one and walk straight through it: a stunned alien is harmless for 5 seconds (10 real seconds here).',
    ],
    unverified: [
      'The stun lands on the next sim tick, up to a quarter of a second after the click. Say if that feels laggy.',
      'Gun size and position were checked in one window size only.',
    ],
  },
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
