// web3d/changes3d.js -- what changed in each 3D build, newest first.
//
// Shown in the "in development" banner on every 3D page, and the same text as the review
// note posted after each update. `npm run stamp3d` refuses to bump the build without an
// entry for the new number, so the banner can never be blank or behind.
//
// { build, date, phase, changed: [], tryThis: [], unverified: [] }

export const CHANGES = [
  {
    build: 25,
    date: '2026-11-18',
    phase: 'N8.3',
    changed: [
      'Holding Tab (or M) now keeps the map up for as long as you hold it. Before, it only flashed: once your keyboard started repeating Tab, each repeat did the browser\'s own Tab and moved focus off the page, and losing focus closed the map.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R), hold Tab for a few seconds, scroll to zoom and drag around while holding it.',
    ],
    unverified: [
      'Tested with simulated key repeats (every one is now swallowed); a real held key could not be pressed from here.',
    ],
  },
  {
    build: 24,
    date: '2026-11-18',
    phase: 'N8.3',
    changed: [
      'More keys deeper in: 4 at district 1, 5 at 10, 7 at 50, 8 at 75 and 10 at district 100. They are spread across the city: each in its own block, at least 25 m apart, never all on one side.',
      'The portal now opens far from the keys (about 50 m from the nearest at district 1 and 100 m at district 100), so the last stretch after your last key is a real crossing.',
      'The Tab map zooms and pans. Scroll to zoom in (it closes in on you), and hold the mouse button and drag to move around. It opens centred on you, at the zoom you left it. Clicking while it is open no longer fires the stun gun.',
      'The Tab map names the blocks (Cable Sidings, Glass Bazaar...) wherever there is room, and the avenues once you zoom in. Keys off the edge of a zoomed map stay pinned to the edge with their distance.',
      'The time limit is now six times the run\'s par route (never under 6 minutes): about 7 minutes at district 1 and 36 at district 100. In its last minute the clock turns red and counts down, so it never takes you by surprise.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R). In district 100, hold Tab, scroll in, drag around and find the keys by name.',
      'Collect all the keys in district 1 and see how far the portal makes you go.',
    ],
    unverified: [
      'Measured with bots only: walking the key route takes about 1 minute at district 1 and 4.5 at district 100; with aliens a real run will be longer. Tell me if it drags.',
      'Zoom and drag were tested with synthetic mouse events, not a real mouse or trackpad.',
    ],
  },
  {
    build: 23,
    date: '2026-11-18',
    phase: 'N8.2',
    changed: [
      'Aliens are built for the big cities now: few, and fast where you cannot see them. Up to about 9 arrive in district 1 and 31 in district 100 (they still divide, up to twice that). The city fills over the first two minutes or so.',
      'Far from you and out of your line of sight they travel at up to twice your walking speed on HARD (scaled by tier), so a few of them can cross the whole city to where the Dispatch thinks you are going. They slow down before you can see them: nothing ever moves unfairly fast in front of you.',
      'New aliens arrive 25 to 60 m away and always out of sight, mostly where the Dispatch predicts you will be. The ones already on the map when you start are 60 to 120 m out.',
      'They get faster deeper in (up to x1.4 by district 100), but a hunting alien is never faster than 70% of your walking speed on HARD, so you can always break away by running. On ULTRA that ceiling is 91%: hide instead.',
      'A patrolling alien now commits to where it is going for at least 6 s instead of changing its mind every second and a half.',
      'Under the hood: path-finding on city maps is 12-15 times faster, so a district full of aliens costs about 2.5 ms of a frame at worst instead of stuttering.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R). Play district 1, then play.html?d=50 and ?d=100 and stay alive for a few minutes: watch the alien count climb and listen for where they come from.',
      'Get spotted on HARD and run: you should be able to break away. Then try the same on ULTRA.',
    ],
    unverified: [
      'Only bots have played it. Whether the city feels tense rather than empty, or swarmed, is your call. The numbers are easy to turn: arrival cap, travel speed, the 70% ceiling.',
      'The Dispatch still uses the 2D game\'s prediction constants; it learns behaviour in N8.5.',
    ],
  },
  {
    build: 22,
    date: '2026-11-18',
    phase: 'N8.1',
    changed: [
      'Keys are easy to find on the Tab map: each one has a gold beacon with rings pulsing out about once a second, a breathing marker and its distance. When the portal opens it gets a teal one. Your own arrow stays the same size however big the map is.',
      'Alien speed per tier is now 0.5x (EASY), 0.75x (MEDIUM), 1x (HARD) and 1.3x (ULTRA) of full speed. Before, the first three were held to three-quarters of that (0.375x, 0.56x, 0.75x) and ULTRA was 1x. Every tier is about a third faster.',
      'In practice a hunting alien now runs at 29-33% of your walking speed on EASY, 43-50% on MEDIUM, 57-67% on HARD and 74-87% on ULTRA, rising over districts 1-10. On ULTRA, outrunning one rarely works: hide.',
      'The tier picker in the hub shows the new speeds.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R), hold Tab and find the keys. Then get spotted on your usual tier and see whether you can still break away.',
    ],
    unverified: [
      'The new speeds have only been played by bots (they still win district 1 on EASY). Whether HARD still feels fair is your call.',
    ],
  },
  {
    build: 21,
    date: '2026-11-18',
    phase: 'N8.1',
    changed: [
      'Districts are big now, and every one is bigger than the last. District 1 is 5 times the old area (108 x 67 m), district 10 is 10 times, 50 is 30 times, 75 is 45 times and district 100 is 60 times (372 x 232 m).',
      'Each district is a city built for the 3D game. Avenues cross it, and streets and alleys cut it into blocks. Every block is a neighbourhood: tenements threaded with alleys, walled yards and gardens with gates, arcades full of stalls, plazas with fountains, canals, depots full of columns, and ruins you have to walk round (they walk straight through).',
      'Every block and avenue has a name (Pike Market, Cobble Courts, Slate Works...). Nothing shows them yet; they are there for the story and the Tab map.',
      'Keys are spread across the city, far from where you start and from each other. There are still 3 to 5 keys, and the aliens are unchanged; those are the next steps (N8.2 aliens, N8.3 keys and the Tab map).',
      'The time limit grows with the map (13 minutes at district 1, 46 at district 100), so a careful run never times out.',
    ],
    tryThis: [
      'Hard-reload once (Cmd+Shift+R). Play district 1, then open play.html?d=50 and play.html?d=100 to walk the bigger cities.',
      'Hold Tab: the whole city fits on screen, but at district 100 it is small. Zoom and pan come in N8.3.',
    ],
    unverified: [
      'The aliens are as few and as slow as before, on maps up to 60 times bigger, so deep districts may feel empty until N8.2.',
      'Measured on an M3 Mac only: district 100 runs at about 78 fps at 1080p on High. Not tested on a weaker laptop.',
    ],
  },
  {
    build: 20,
    date: '2026-11-19',
    phase: 'N3',
    changed: [
      'Why you never saw the attack: your game had Jumpscares set to "mild" (the build 15 note asked you to try it), and that setting is kept in your browser across builds. Every capture since played the gentle 2.4 s version. My screenshots were the full one.',
      'Fixed: settings are reset once so Jumpscares is back to full (sensitivity, FOV and the rest are kept). Reduce motion no longer quietly swaps the scare for the mild one; only the Jumpscares setting decides. If a capture is ever not the full version, the end card now says so.',
      'The attack is now 7 s: about 6 s of scene, then black. The lights die in two flickers. It stands in the dark and comes at you in jerks while your heart pounds. It rears up, lunges and knocks you flat.',
      'Then it bites at your face three times, screaming between bites. It draws back in silence with its jaw stretched wide, and lunges into the lens. Black, then a crunch.',
    ],
    tryThis: [
      'Hard-reload the page once (Cmd+Shift+R) so your browser does not run yesterday\'s files, then get caught with headphones on.',
    ],
    unverified: [
      'Tested here with sound on, through the real capture, starting from your old "mild" setting. Still never watched at full speed or heard.',
    ],
  },
  {
    build: 19,
    date: '2026-11-19',
    phase: 'N3',
    changed: [
      'Getting caught is now an attack, not a face. It rears up over you in the dark, claws spread, hissing. Then it lunges across a metre in an instant with its claws raking in, and knocks you flat on your back.',
      'From the floor you look up at it leaning over you. It bites at your face twice, head thrashing, and the screen shakes and smears with every snap. Three claw gashes are torn across the screen and bleed down it.',
      'It is lit like a horror film: the whole world goes black, and a single cold light from above catches its face and every wet tooth. Two rows of long teeth with fangs, strands of saliva between them, slit pupils burning at you.',
      'A last lunge into the lens, a hard cut to black and silence, and in the black a crunch. About 1.8 s of attack, held black to 2.8 s.',
    ],
    tryThis: [
      'Get caught with headphones on, full screen, lights off. Then in a few other belts (11, 41) to see other species do it.',
      'Settings -> Jumpscares: mild is still the gentle version for anyone who needs it.',
    ],
    unverified: [
      'Checked frame by frame in screenshots on three species. Never watched at full speed, and the new hiss, snaps and crunch have never been heard.',
    ],
  },
  {
    build: 18,
    date: '2026-11-19',
    phase: 'N3',
    changed: [
      'Your recording confirmed it: build 16 got as far as turning you to face the alien, and 0.1 s later the end card was up. That is the skip fixed in build 17.',
      'It also showed a second fault: when you are caught the game lets go of the mouse, and a moment later the minimap, keys and debug panel came back on top of the scene. They now stay off until the end card.',
    ],
    tryThis: [
      'Get caught in district 1 again, holding W: you should get the full face, teeth and scream with nothing over it, then black, then the card.',
    ],
    unverified: [
      'The mouse release was simulated in the browser here, not done by a real browser, and nothing has been heard.',
    ],
  },
  {
    build: 17,
    date: '2026-11-19',
    phase: 'N3',
    changed: [
      'Why you never saw the jaw: holding W when you got caught auto-repeated the key, and any key skipped the scene in its first few milliseconds. Now nothing skips it for the first second, and holding a key never skips it. Only a fresh Space, Enter, Escape or click does.',
      'Getting caught is a real jumpscare now. The alien is instantly in your face, right where you were looking. The world goes dark, and a flickering red light comes on under its chin. Its jaw tears open over a ring of needle teeth, and its pupils pinch to burning slits staring straight at you.',
      'A bass hit, a flash, a new scream (everything else goes silent under it), violent shake and tearing. Then a hard cut to black and silence at 1.4 s.',
    ],
    tryThis: [
      'Walk into an alien while holding W, with headphones on, full screen, lights off.',
      'Try it in a few belts. Each species has its own face (district 37 is the Cinders).',
    ],
    unverified: [
      'Checked frame by frame in screenshots. Never watched at full speed or heard.',
    ],
  },
  {
    build: 16,
    date: '2026-11-19',
    phase: 'N3',
    changed: [
      'You can no longer run through an alien. An awake alien is solid now: you bump into it, and it gets you. (A stunned one can still be walked through.)',
      'Getting caught is a short game-over cutscene: the alien lunges in with its arms out, grabs you (the view jolts toward it), drags you face to face, its jaw unhinges and it screams while the picture shakes and tears, then a hard cut to black and silence before the end card.',
      'It lasts about 2.6 seconds. Any key or click still skips it, and Settings -> Jumpscares still offers mild and off.',
    ],
    tryThis: [
      'Walk straight at an alien and try to slip past it.',
      'Get caught with headphones on, full screen, in a dark room.',
    ],
    unverified: [
      'Checked frame by frame in screenshots, never watched at full speed or heard. Say if it still does not land.',
    ],
  },
  {
    build: 15,
    date: '2026-11-19',
    phase: 'N3',
    changed: [
      'Getting caught is a jumpscare now: the alien that got you is pulled right up to your face, its jaw drops into a screaming maw, the picture tears and glitches, and a shriek cuts through, then black.',
      'Before it happens: when a hunting alien gets within two cells, a heartbeat swells and the background drone fades toward silence.',
      'Reaching the portal lifts you into the sky: you rise forty metres turning slowly as the district shrinks below, light streams upward round you, and everything goes white.',
      'Any key or click skips either one. Settings now has Jumpscares: full, mild (no lunge, quiet) or off. Reduce motion always plays the mild one.',
    ],
    tryThis: [
      'Get caught on purpose with headphones on. Then try Jumpscares: mild.',
      'Clear district 1 and ride the portal up.',
      'Let a hunting alien close in slowly and listen for the heartbeat.',
    ],
    unverified: [
      'Every frame was checked in screenshots; nothing has been watched at full speed or heard.',
      'Whether it is actually scary is your call.',
    ],
  },
  {
    build: 14,
    date: '2026-11-18',
    phase: 'N2',
    changed: [
      'Every belt has its own alien species now. RUST: Greys. TIDE: Deep ones, wet and wide-headed, with gills and webbed hands. MOSS: Sporelings, fungus sprouting from their heads, swaying.',
      'EMBER: Cinders, charcoal skin cracked and glowing from inside. VIOLET: Watchers, a third eye and a long neck. ASH: Husks, pale and emaciated, moving in jerks.',
      'CORAL: Choristers, with a frilled ruff that fans open round the head when they hunt. JADE: Wardens, horned and armour-plated. SOLAR: Mirages, translucent and shimmering. COBALT: Architects, with metal bands and segmented limbs.',
      'Every species still glows red where it matters (eyes, markings, the rim of its silhouette), so red still means alien in every belt.',
    ],
    tryThis: [
      'Visit one district in each belt (1, 11, 21 ... 91) and meet each species.',
      'In CORAL (61+), get spotted and watch the ruff open. In SOLAR (81+), see whether the Mirages are too hard to spot.',
      'Dev page: /noise/3d/species.html shows all ten side by side (?b=0..9 for one up close).',
    ],
    unverified: [
      'Seen in screenshots, not in motion: the Sporelings\' sway, the Husks\' jerks and the Cinders\' flicker have only been checked as numbers.',
      'The heaviest belt (COBALT, many coins) runs at about 75-84 fps on a laptop; its slowest frames sit right at 60.',
    ],
  },
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
