// web3d/changes3d.js -- what changed in each 3D build, newest first.
//
// Shown in the "in development" banner on every 3D page, and the same text as the review
// note posted after each update. `npm run stamp3d` refuses to bump the build without an
// entry for the new number, so the banner can never be blank or behind.
//
// { build, date, phase, changed: [], tryThis: [], unverified: [] }

export const CHANGES = [
  {
    build: 44,
    date: '2026-11-25',
    phase: 'N4.4 prototype',
    changed: [
      'District 1 only, to test: the place names (Zinc Wreck, Mirror Canal...) are now real enamel street plates, with rounded corners, a white border, condensed lettering, chipped enamel over rusty iron, rust run down from the bolts, grime along the bottom and a sun-bleached top. They hang a little off the wall on modelled bolts, or are clamped to round steel posts at park gates. They no longer glow, and never cover a door, a shop window, a downpipe, a lamp or an awning.',
      'District 1 only: coins are minted metal with their value struck large on both faces, a raised rim, a beaded ring, "CITY · TOKEN" round the top and a reeded edge. Copper 1, nickel 2, brass 5, and a bimetallic 10 with a violet core. Polished where the relief stands up, darker in the recesses.',
      'District 1 only: when a key or the portal is behind you or beside you, its marker stays on screen, held at the left or right edge on the side you would turn to face it, with an arrow and its distance.',
      'All model-kit districts: neighbouring puddles run together into one uneven sheet instead of a row of separate pools.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R) and play district 1. Walk to a park gate and read its sign; find a coin and look at both faces; turn your back on a key and watch the screen edges.',
    ],
    unverified: [
      'The plates use fonts on this Mac ("DIN Condensed"); another computer without it shows the nearest condensed sans-serif. District 1 has no 10-coin; the 10 was checked on a test coin.',
      'Frame time unchanged at 1080p (High 22 ms at the start square, 19-21 ms in the streets).',
    ],
  },
  {
    build: 43,
    date: '2026-11-25',
    phase: 'N4.4 prototype',
    changed: [
      'District 1 only, to test: its buildings, props and ground now use 2K textures instead of 1K, compressed into a GPU format so they take about a quarter of the graphics memory of plain images.',
      'The ground has real relief: cobbles, paving joints and cracks read as depth when you look across them (parallax from height maps).',
      'District 1\'s walls are weathered: dirt splashed up the base, rain streaks running down, damp patches. They are placed by position, so no two bays repeat. The plaster keeps a little of its photo\'s own colour again, and the shade picks up a warm bounce from the street.',
      'Every belt: the old round trees in parks are now clipped hedge blocks; all hedges have a ragged edge of leaves; puddles are uneven dark pools instead of bright squares.',
      'Fixed: the dark-alley shading on the model buildings was being read from the wrong place since build 41.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R) and play district 1. Look along a cobbled street, at the foot of a plaster wall, and at a brick wall up close; then compare district 11, which is still 1K.',
      'Or locally: npm run serve, then http://localhost:8123/3d/play.html?d=1',
    ],
    unverified: [
      'Download: about 180 MB the first time district 1 loads (from the website; instant from disk). Measured at 1080p on this Mac: Medium 19-20 ms a frame, High 19-21 ms, about 1 ms more than at 1K. Not tried on a weaker laptop.',
      'Only district 1 is 2K. The other nine first districts stay at 1K until you approve this.',
    ],
  },
  {
    build: 42,
    date: '2026-11-21',
    phase: 'N4.4 prototype',
    changed: [
      'Running into something small, like a stoop, a bin, a crate, a bag or rubble, catches your foot: the view pitches forward, drops and rolls, then recovers within a second, with a scuff and a knock. Your speed is not changed and the aliens hear nothing extra. Reduce motion keeps a third of it.',
      'The first district of every belt now has its own style, built from the same models but lit by a different kind of light, with its own buildings, ground, weather and grade. All of them are sombre.',
      'RUST (1): the sun going down under a roof of cloud, the light catching only the top storeys; grey terraces, a few candles.',
      'TIDE (11): a storm at noon, rain, everything wet and reflecting, sea fog, storm shutters down.',
      'MOSS (21): a canopy of leaves closed over the district, so it is gloomy at noon and the sun comes through in patches; leaf litter, pitched roofs.',
      'EMBER (31): night after the fire, burnt shells, the only light from fires still burning inside some buildings; embers drifting.',
      'VIOLET (41): power out under an aurora; violet light on tall dark blocks and wet streets.',
      'ASH (51): ash falling like snow and the picture in black and white, except aliens, keys, coins and the portal, which keep their colour.',
      'CORAL (61): morning sea mist, pale pastel fronts with balconies, checkered pavements.',
      'JADE (71): two moons, so everything casts two shadows; mossy cobbles, stone-grey fronts.',
      'SOLAR (81): a dust storm at noon, the sun a dull coin, heat shimmer, sand streets, low sand-coloured houses.',
      'COBALT (91): the alien ship fills the sky, and its searchlight sweeps the streets.',
      'Park walls are now hedges made from a leaf photograph. Rubble heaps are broken concrete. Facade colours now come out as designed (the plaster photo was making every colour salmon).',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R). From the hub, play districts 1, 11, 21 ... 91 (dev mode can jump straight there), and walk from an open street into an alley in each.',
      'Sprint into a house\'s front steps or a bin.',
    ],
    unverified: [
      'Measured at 1080p Medium on this Mac: RUST, TIDE, MOSS, EMBER, ASH, CORAL and SOLAR take 12-21 ms a frame; the three night belts take 25-29 ms (VIOLET, JADE with its two shadows, COBALT), about 35-40 fps. Not tried on a weaker laptop.',
      'Nothing is decided for districts 2-10, 12-20 and so on: they keep their old look until you approve a belt\'s style.',
      'The single-cell trees in parks are still the old round ones. No interiors.',
    ],
  },
  {
    build: 41,
    date: '2026-11-21',
    phase: 'N4.4 prototype',
    changed: [
      'District 1 has a new art style, after your two reference images: daylight in the open streets (the Halo concept art: blue sky, big clouds, a hard sun, haze), and black alleys with warm pools of lamplight (Amnesia). The smog is gone.',
      'The sky is a photograph (Poly Haven, CC0), and the same sky lights the whole district: blue light from above, the sun where it is in the photo, real shadows from every building (now at Medium too), haze that turns the far end of a street pale blue. Film tone mapping and ambient occlusion in the corners.',
      'The buildings are no longer drawn by code. They are built from two artist-made modular kits (Poly Haven, CC0): plaster apartment facades and brick factory facades, in 3 m bays, with real window frames and glazing bars, panelled doors, sill bands, cornices, crowns, plinths and pilasters. Each building still has its own purpose, and now its own kit, colour, joinery colour and window type, never the same as its neighbour\'s.',
      'Shops have glazed fronts or roller shutters, some sprayed with graffiti; garages and warehouses have roller doors; behind every window and door is a dark room, and in a few a lamp is still on. Air conditioners hang under windows, downpipes run to the street, some glass is gone, some windows are boarded.',
      'The markets, yards, depots, canal sides and ruins are built the same way: brick yard walls with piers and copings, warehouses, market stalls, burnt-out shells.',
      'The ground is photographed too: asphalt roads, slab pavements with kerb stones, cobbled squares and markets, cracked concrete yards, grass in the parks. Puddles are dark mirrors of the sky.',
      'The streets are dressed with modelled bins, rubbish bags, barrels, tyres, crates, benches, utility boxes and manholes, and wall lamps in the narrow alleys, most still burning.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R) and play district 1. The first load downloads about 80 MB of models and textures; there is a percentage on the start screen.',
      'Walk from a sunny street into a narrow alley, then press F there. Compare a pharmacy, a cafe and a garage side by side.',
    ],
    unverified: [
      'Measured at 1080p on this Mac: Medium 17-22 ms a frame (about 50 fps), High 21-26 ms. Build 40 was 11-15 ms. The sun\'s shadows are about 6 ms of that. Not tried on a weaker laptop.',
      'The parks still have the old hedges and round trees: the free tree and hedge models are 50,000-280,000 triangles each, too heavy to plant dozens of.',
      'Interiors are not built: you see a dark room through the glass, but cannot go in. The roofs are still drawn by code.',
      'Only district 1 has any of this. The other 99 are unchanged.',
    ],
  },
  {
    build: 40,
    date: '2026-11-21',
    phase: 'N4.4 prototype',
    changed: [
      'District 1 only: every solid block is now cut into separate buildings, 4.5-9 m of street front each, and every building is its own. There are 254 of them.',
      'Each has a purpose: house, apartments, shop (a trade and an owner), bar, cafe, pharmacy, launderette, garage, and one each of cinema, bank, hotel and clinic. No building has the same purpose or the same walls as the one next to it.',
      'Real materials: 15 photographed surfaces (brick, painted brick, plaster, render, weatherboard, corrugated steel, concrete, painted wood, rusty metal, tiles; CC0, from ambientCG), laid by world position so they never stretch.',
      'Every building has an entrance, and its ground floor says what it is. Shops have tiled stall risers, display glass, a lettered fascia and a glazed door, sometimes a roller shutter stuck half way. A pub has black panelling and small-paned windows; a cafe has an awning, some torn. A garage has a roller door, the cinema a double door and poster frames, the bank pilasters and steps, the hotel a canopy, a house a stoop with railings.',
      'Upper floors in each building\'s own style: sash windows, steel grids, or tall windows with balconies. Apartments have fire escapes and a water tank on the roof, houses pitched slate roofs and chimneys, the hotel its name on the roof. Every storey height, cornice and roof line differs.',
      'Each building has its own damage: windows broken, boarded, or with a mattress nailed over; soot over the ones that burned; letters fallen off the signs; brick on the pavement in front of the worst. The random graffiti and posters are gone from district 1.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R), play district 1 and walk the streets reading the signs. Compare with district 2.',
    ],
    unverified: [
      '1080p Medium 11-14 ms a frame; High 14-15 ms with slow frames up to 23 ms. Every building is drawn at once in district 1, so before the bigger districts get this it needs cutting into chunks. The textures add 44 MB to the download.',
      'Interiors are not built: doors and windows are shut, boarded or dark.',
    ],
  },
  {
    build: 39,
    date: '2026-11-21',
    phase: 'N4.4 prototype',
    changed: [
      'A stunned alien now falls flat on its back and lies on the street. It used to tip over and sink half into the ground.',
      'District 1: the torch is off until you press F. Open streets and squares are lit by the smoggy sky and readable without it; the fog starts further out and lifts at 72 m.',
      'Narrow alleys and courtyards between tall buildings are nearly black. How dark each spot is comes from how much sky it sees past the walls around it. The torch and the burning lamps still light them, so that is where you need F. Under the crosshair it says when it is too dark to see.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R), play district 1, walk from a square into a tenement alley, then press F. Stun an alien (dev mode) and look at it lying there.',
    ],
    unverified: [
      'The buildings themselves are unchanged in this build; see the note about real assets.',
    ],
  },
  {
    build: 38,
    date: '2026-11-21',
    phase: 'N4.4 prototype',
    changed: [
      'District 1 only, as a prototype of a horror look in the direction of Amnesia and Silent Hill, with far more detail. Every other district is unchanged, so you can compare.',
      'The light: brown foundry smog instead of a sky, thick from about 2 m and solid by 38 m; a torch in your hand; most street lamps smashed and a few still burning, flickering. Film grain, colour drained to about 60 %, colour fringing towards the edges, a heavy vignette.',
      'The surfaces: grime laid over every wall and floor by world position, so it no longer repeats with the 1.5 m grid: dirt gathering at the foot of walls, long stains, wet patches on the ground that catch the torch.',
      'The detail: real window frames, sills and lintels on the tenements; behind them dark glass, or a mattress or foam nailed over, or boards, or a broken pane, or a lamp behind a curtain. Door frames and steps, with shoes left in pairs on some. Cornices on every wall top, chimneys, drainpipes on the corners, a dark plinth at the foot of walls, cables sagging across the streets, street lamps, and leaves, paper, oil, rags, drains and manholes on the ground.',
      'Chosen with the antialgorithm skill: no gore and no motel sign. The street shows how its people tried to be quiet before they were taken, because the aliens hunt by sound.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R) and play district 1, then district 2 to compare with the old look. Walk the tenement rows and look at the windows; find a burning lamp.',
      'Glow and colour grade must be on (Settings) for the grain and the grade.',
    ],
    unverified: [
      'Measured at 1080p: Medium 9-12 ms a frame (district 2, unchanged, 9.5-10 ms), High 11.6-13.5 ms with p95 up to 22 ms. Not tried on a weaker laptop.',
      'The smog makes aliens visible only within about 30 m in district 1, so it plays harder; the stun gun\'s 72 m reach does not matter there.',
      'This is the look to judge; if you want it everywhere, the detail layer needs cutting into chunks for the big cities, and each belt its own version of these choices.',
    ],
  },
  {
    build: 37,
    date: '2026-11-18',
    phase: 'N6.1 throws',
    changed: [
      'The noise maker and the EMP have no range limit now: they land wherever you aim, as far as you can see.',
      'Where they land is ray-traced through the city: the line from your eye through the crosshair runs until it meets the ground, which is where the item lands, or meets a wall or a rubble heap, in which case it drops just in front of it. Aim at the sky and nothing lands.',
      'While one is in hand, a dotted arc runs from your hand up and over to the landing ring, and the item flies along it when you throw.',
      'The throw\'s line goes into the run\'s record and the game traces the same line itself, so the ring always shows exactly where it will come down.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R). Take the noise maker, look down a long avenue and lift your aim slowly: the ring walks away up the street. Throw it to the far end, behind a hunting alien.',
    ],
    unverified: [
      'Checked in the browser: landings from 2 m to 53 m down a street, the arc, the flight, an EMP landing in exactly the aimed cell 32 m away. A test traces 4000 random throws against an independent reference. With no range limit the items are stronger; whether that needs a price change is your call.',
    ],
  },
  {
    build: 36,
    date: '2026-11-18',
    phase: 'N6.1',
    changed: [
      'Your inventory: hold Space and a wheel opens round the crosshair, with the stun gun at the top and your items round it. Move the mouse towards one (the view holds still while you choose) and let go of Space to take it in hand. Click uses it.',
      'Noise maker (60 coins, carry 3, up to 3 a district): thrown at the ground under the crosshair, up to 8 cells. Any alien hunting you drops the chase and goes to search where it landed; patrols within 14 cells go to look. It rattles and pulses for 10 seconds. If they see you again, the hunt is back on.',
      'Dampers (120 coins, carry 1, once a district): click to put them on. For the rest of the district they hear you at three quarters of the distance. The stun gun\'s reach does not change.',
      'EMP (150 coins, carry 2, once a district): thrown up to 6 cells. Every awake alien within 3 cells of where it lands, with no wall in between, is stunned as if shot.',
      'While an item is in hand, a ring on the ground shows where it would land: pale where it can, grey where it cannot, with the reason under the crosshair. Once an item is spent the gun comes back to hand. Buy them in the hub\'s shop; what a run does not use comes home with you.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R) the hub and buy one of each (or in dev mode you carry all of them, unlimited). In a district, hold Space, flick the mouse right for the noise maker, let go, aim at the ground across a street from a hunting alien, click.',
      'Try the EMP on a group closing in, and dampers before crossing a busy avenue.',
    ],
    unverified: [
      'Checked in the browser: the wheel on Space, picking each slot with the mouse, the view held still, each item used, the rings and effects. A new test (3D-17) checks each item against its rule and that runs with items replay exactly. Not checked: how strong the items are against real play (no bot uses them yet), and phones have no wheel.',
    ],
  },
  {
    build: 35,
    date: '2026-11-18',
    phase: 'glow setting',
    changed: [
      'New setting: Glow and colour grade. Automatic (the default) keeps it as it was: on at High and Medium, off at Low. On turns it on at any quality, Off turns it off at any quality.',
      'It switches the moment you change it, without a reload, and is remembered like the other settings. Off saves about 3-4 ms a frame at 1080p Medium on this Mac.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R). In a night district (VIOLET 48-50 is the clearest), press Esc, open Settings, and flip Glow and colour grade between on and off to compare.',
      'If EMBER or VIOLET stutters, try Off there before lowering Quality.',
    ],
    unverified: [
      'Checked in the browser: all three choices at High and at Low, switching live, the choice saved, no shader errors. Not tried on a weaker laptop.',
    ],
  },
  {
    build: 34,
    date: '2026-11-18',
    phase: 'N4.3 (3 of 3)',
    changed: [
      'Bright things glow now: neon, lanterns, street lamps that still burn, the mast\'s light, the crashed ship\'s vents, the sun, and anything else brighter than white bleeds a soft halo into the dark around it.',
      'Each belt has its own colour grade, kept subtle so the aliens stay red and the keys gold: RUST and SOLAR a little warm, TIDE cool and grey, ASH drained, VIOLET richer, COBALT cool. A soft vignette darkens the corners.',
      'JADE\'s mist was a crowd of grey puffs; it is a faint low haze now.',
      'That completes N4.3: all ten belts are art-directed, with places, landmarks, signs, glow and grade.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R). Night districts show the glow best: VIOLET 48-50 for the neon, JADE 78-80 for the lanterns, COBALT 98-100 for the mast and the ship.',
      'If a district stutters, Settings > Quality: Low draws without glow and grade, as before.',
    ],
    unverified: [
      'Glow and grade cost about 3-4 ms a frame at 1080p Medium on this Mac: districts 40 and 50 run at 11-14 ms on average (inside 60 fps), but their slowest 5 % of frames reach 16-19 ms. On a weaker laptop this is the first thing to turn off. Tell me if you want it as its own setting rather than tied to Quality.',
    ],
  },
  {
    build: 33,
    date: '2026-11-18',
    phase: 'N4.3 (2 of 3)',
    changed: [
      'Every district has one skyline landmark on the roof of its biggest tenement block, taller than everything else, so you can steer by it: a 30 m broadcast mast with a light at the top, or a crashed ship half buried in the roof with its vents still lit.',
      'Every plaza has a centrepiece on its monument: a statue with one arm raised, an obelisk, or a tiered fountain on the plinth in its pool.',
      'Every avenue has its name on plates along it, every 27 m or so, with the district number underneath, e.g. QUILL AVENUE / DISTRICT 30.',
      'Rubble heaps in plazas, streets and ruins now have what is left of a building front in them: a ground storey with its window or door, or a burnt shell in the ruins. Each is exactly as tall as the heap was, so the stun gun still hits exactly what you see.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R). From any open street, look up and around for the mast or the ship. Walk an avenue and read its plates. Find a plaza for its statue, obelisk or fountain.',
    ],
    unverified: [
      'Measured at 1080p Medium: districts 20, 40 and 100 at 4.6-9.7 ms a frame, 123-139 draw calls. The mast is thin and dark at night until bloom lands in build 34.',
    ],
  },
  {
    build: 32,
    date: '2026-11-18',
    phase: 'N4.3 (1 of 3)',
    changed: [
      'The other seven belts have their own art, each running from dusk to midnight, with every kind of place built in from the start:',
      'EMBER (31-40): soot-black brick with smouldering cracks, burnt beams against the walls, sparks rising, a smoky maroon sky. VIOLET (41-50): always night; dark glossy tile, blue and magenta neon, drizzle, and an aurora that grows towards midnight.',
      'ASH (51-60): board-marked concrete, dead street lamps with a few still burning, falling ash, a pale white overcast. CORAL (61-70): art-deco plaster with fluted pilasters, terrazzo floors, small balconies, a rose sunset.',
      'JADE (71-80): carved stone, hanging lanterns, low mist, and two moons by midnight. SOLAR (81-90): bedded sandstone, canvas awnings, warm haze, and a giant sun. COBALT (91-100): always night; alloy panels, masts and dishes on the roofs, and the mothership overhead, ringed with lights.',
      'None of the new colours shares a hue and lightness with the aliens, keys, coins or portal: EMBER\'s sky is a dark maroon and CORAL\'s sunset a rose-magenta for that reason (3D-16 checks all 100 districts).',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R). In dev mode, visit the first and last district of each belt (31, 40, 41, 50 ... 91, 100) and look up: the aurora in 48-50, the two moons in 76-80, the giant sun in 81-84, the mothership in 91-100.',
    ],
    unverified: [
      'Measured at 1080p Medium in districts 40, 50, 60, 90 and 100: 5-11 ms a frame, worst p95 15.7 ms (EMBER), 123-136 draw calls. COBALT is the slowest at about 10.5 ms. Not tried on a weaker laptop.',
      'Still to come in N4.3: landmarks, district and avenue signs and building fronts (build 33), then bloom and a colour grade per belt (build 34).',
    ],
  },
  {
    build: 31,
    date: '2026-11-18',
    phase: 'N4.2',
    changed: [
      'Every place in a district now looks like what it is, in its belt\'s colours. Tenements are two-storey brick blocks (5.4 m) with windows, doors and a few lit rooms. Plazas are paved, with stone monuments. Markets have chequered tiles and roll-down shutters, and their stalls are kiosks. Yards have gravel, corrugated fences, and stacks of containers and crates. Parks have grass, clipped hedges and trees. Canals have granite setts. Depots are taller halls of ribbed metal with loading doors and a hazard band. Ruins are burnt and cracked, on ash and broken brick.',
      'Each place also gets a shade of its own, so two markets side by side are still two.',
      'Every place has its name on an enamel plate where you walk in, on the wall beside a gate or an alley mouth. Open plazas and canals have it on a post. The plate\'s colour tells you the kind of place.',
      'The walls facing the streets have old posters, graffiti, stencils, warning plates and peeling paint: most in markets and tenements, none in parks, more deeper into a belt. None of it is story yet; that comes with the story phase.',
      'Streets and avenues keep the plain belt look, so places stand out against them. Belts 4-10 keep their old look until N4.3.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R). In districts 1-30, walk down an avenue and look into each place you pass, then open the Tab map: the names on the plates are the names on the map.',
      'Look at a tenement block at district 9 or 10, at night, for the lit windows.',
    ],
    unverified: [
      'Checked in the browser on districts 1, 5, 12 and 20: every kind of place, the signs and the wall art. A frame at 1080p Medium costs about 1 ms more than before (6.4-8.5 ms at districts 20 and 30, against 5.9-7.5 ms at the unchanged district 100 in the same session), and the most draw calls is 143. Not checked on a weaker laptop. The texture arrays need about 26 MB more graphics memory.',
      'Whether each kind of place is the right look is your call. Each one is a few lines of data in web3d/art/belts.js and one drawing function in web3d/art/places.js.',
    ],
  },
  {
    build: 30,
    date: '2026-11-18',
    phase: 'stun gun',
    changed: [
      'The stun gun now hits whatever you can see. If the crosshair is on an alien\'s body and nothing stands between your eye and that spot, the bracket goes red and the shot lands.',
      'Range went from about 7-8 m (the alien\'s own detection radius) to 72 m, about as far as the fog lets you make one out. Between 72 m and 82 m the bracket goes grey: you can see it, but it is too far.',
      'Rubble no longer blocks a shot you can see past: aim at a head above a low heap and it lands; aim at the legs behind it and it does not. Walls still block everything.',
      'An alien hidden behind a wall no longer shows a bracket when the crosshair passes over where it is, so the crosshair cannot be used to find aliens through walls.',
      'The beam now ends at the exact spot you hit. The shot\'s aim is saved with the run, so replays still match exactly.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R). Find a long street and shoot an alien at the far end; then try one with only its head showing over a rubble heap.',
    ],
    unverified: [
      'This makes the gun much stronger: you can now stun an alien long before it reaches you. If the game gets too easy, the range is one number (STUN_RANGE_M in sim3d/units.js), or charges could cost more.',
      'Checked in the browser: locks at 15-70 m down a street, a grey bracket at 75 m, nothing at 90 m, a head over a 1.3 m heap but not its legs, no bracket behind a wall, a real 54 m shot through the game loop, touch aim-assist. Not played with a mouse by a person.',
    ],
  },
  {
    build: 29,
    date: '2026-11-18',
    phase: 'N4.1',
    changed: [
      'The first three belts have their own look. RUST (districts 1-10) is rusted riveted steel and iron deck plates, with pipe runs along the walls, valve wheels, and dust drifting on the wind. TIDE (11-20) is wet concrete with puddles, mooring bollards along the walls, buoys in the water, steady rain and a lighthouse beam sweeping the horizon. MOSS (21-30) is mossy stone and flagstones, with vines hanging from the walls, a canopy of leaves overhead, and pale spores floating up.',
      'Every district now has a sky: a gradient, clouds, the sun or the moon with a glow, and stars once it is dark. The sky\'s horizon is also the fog colour, so the city fades into it.',
      'Inside each belt, the ten districts run from dusk to midnight: the sun sets over the first five, the moon is up for the last five, the light cools and dims, and the weather gets heavier. The light now comes from the sun or the moon you can see, so shadows on High point the right way.',
      'Belts 4-10 keep their old colours for now (N4.2), but already get the sky, the dusk-to-midnight light and the fog.',
      'Red aliens, gold keys, coins and the teal portal stay the only things in those colours. A new test (3D-16) checks every art colour in every district against them.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R). In dev mode, walk through districts 1, 10, 11, 20, 21 and 30 with ] to see each belt at dusk and at midnight.',
      'Look up in TIDE at night for the lighthouse beam, and up in MOSS for the canopy.',
    ],
    unverified: [
      'Checked on this Mac at 1080p Medium: district 20 runs at about 3.7 ms a frame, district 30 at 3-6 ms, district 100 at 5-6.5 ms, all under the 60 fps budget. Not tried on a weaker laptop: rain is the heaviest weather. If it stutters, tell me which district.',
      'How it looks is your call. The colours, the amount of rain and dust, and the pipe and vine density are each one number in web3d/art/belts.js.',
    ],
  },
  {
    build: 28,
    date: '2026-11-18',
    phase: 'N8.5',
    changed: [
      'The Dispatch now learns your habits, not your favourite rooms. Five of them, measured every run and kept in your save file: whether you hide when they are near, stop at corners, get lost, stand still reading the map, or run when seen.',
      'Each habit it is sure of gets a counter-tactic. Hide, and once you have gone to ground they search the water where you were last seen, and wait outside your black box. Stop at corners, and they wait just round the next corner on your route. Get lost, and they cut you off between you and the key you need. Stand still over the map, and the nearest ones walk to you. Run, and they flank the side you run to.',
      'A tactic only exists once a habit is clearly yours, and grows as the file backs it up. If you do not have the habit, nothing changes: tested tick for tick.',
      'The intercepted chatter now says what it has on you, for example: File note: subject stops at corners. Units, hold just round the next corner on its route.',
      'Its guess of where you will be in five seconds now comes only from where you can physically get to, so it no longer learns which rooms you like.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R). Play a few districts with one habit on purpose (stand still with Tab held, or hide in water whenever they come near) and watch the chatter and where they turn up.',
      'In dev mode, tick "they can\'t catch me" to watch the tactics play out without dying.',
    ],
    unverified: [
      'Tested with bots that exaggerate each habit. Whether the tactics feel clever or unfair to a person is your call. Each one\'s strength is a single number in the code.',
    ],
  },
  {
    build: 27,
    date: '2026-11-18',
    phase: 'dev mode',
    changed: [
      'Developer mode, for testing: on the 3D hub, open Dev pages, then Developer mode, and enter your developer code. You get every district 1-100 one click away, any tier, city or classic maps, and two switches: they cannot catch you, and an empty city with no aliens.',
      'Dev runs are unsaved: they never touch the MAIN or GUEST file, scores, unlocks or the file the aliens keep on you. Every shop item comes unlimited: the stun gun stays full of charges and the lightning never runs out. In a district, [ and ] jump to the previous and next one. A gold strip at the bottom says when a run is a dev run.',
      'Only a scrambled fingerprint (a salted SHA-256) of the code is in the repository; the code itself is in DEV-MODE-CODE.txt on your machine, which git ignores. npm run devcode -- "your code" changes it.',
      'When the game is finished, npm run remove-devmode takes the whole thing out in one step. A new test (3D-31) rehearses that removal on every run, so it keeps working.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R) the hub, enter the code from DEV-MODE-CODE.txt, tick "they can\'t catch me", and walk through a few belts with ].',
    ],
    unverified: [
      'It is a convenience lock, not security: the site is static, so anyone who reads the source can switch it on, for their own browser only.',
    ],
  },
  {
    build: 26,
    date: '2026-11-18',
    phase: 'N8.4',
    changed: [
      'Big cities run much lighter. At district 100 a frame now costs about 8 ms on Medium (was 12.4) and 5 ms on High (was 10.8), and the slowest frames dropped from 17 ms to about 10 ms on Medium and 8 ms on High.',
      'The city is now drawn in 48 m chunks, and anything behind you or past the fog is skipped. The fog is solid there, so you never see the difference. Nothing is built or loaded while you play, so nothing can pop in.',
      'The biggest single saving was the minimap: every frame it was copying the whole district\'s map image to show the few metres around you, which cost more than drawing the entire 3D city. It now draws only the window it shows.',
      'Shadows (High quality) now follow you: a sharp 90 m box just ahead of where you look, instead of one blurry map stretched over the whole district.',
      'Walls buried inside solid blocks are no longer drawn, since no face of them can be seen. Their roofs stay, so the killcam\'s view from above looks the same.',
      'New setting: Frame rate, automatic (your display\'s rate), 60, or 30. A cap draws nothing sooner, it just makes every frame take the same time; on a weak laptop a steady 30 can feel smoother than an uneven 40-60.',
    ],
    tryThis: [
      'Hard-reload (Cmd+Shift+R) and play district 100. Turn on High in Settings (it applies on the next load) and look at the shadows.',
      'If any frame stutters, try Frame rate: 60 or 30 in Settings and tell me which feels better.',
    ],
    unverified: [
      'Measured on an M3 Mac in a hidden browser pane, where GPU timings swing by about a third between runs. Not measured on a weaker laptop.',
      'The frame-rate cap was checked by feeding the frame loop timestamps from a 60, 75, 120 and 144 Hz display, not by watching a real one.',
    ],
  },
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
