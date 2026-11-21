// web3d/art/hdstyles.js -- the first district of each belt, each in its own style. Pure data.
// N4.4, 3D build 42.
//
// The user, after build 41 (district 1 in daylight): "the art style now looks perfect",
// but the sky is too bright for a sombre story, and every belt must change style
// completely, "rather than just changing the colour palette and calling it a day". So
// each belt's first district gets its own *light* -- what lights the street, from where,
// and what the air does with it -- tied to the belt's own alien and character, and with
// it its own buildings, ground, weather and grade. Chosen with the antialgorithm skill:
// the default was one grey fog in ten tints; each belt moved off it for a reason of its
// own (said at each entry).
//
// Every belt is sombre: the sun is low, behind cloud, or not there; exposure is held
// down; saturation is low except where the light itself is coloured. What must stay
// readable stays: red aliens, gold keys, coins, the teal portal -- no facade, ground or
// fog colour comes near them (bench3d 3D-16 lints these tables too).
//
// Fields (all optional except sky, fog, grade):
//   sky       { photo, env, gain, dim, tint, haze, drift } -- a photographed sky, assets3d/sky/
//             { proc: {...art/sky.js fields} } -- a drawn sky; its light is made from it
//   sun       { dir, color, intensity, shadow } -- a directional light with shadows
//   moon2     a second shadow-casting light (JADE)
//   env       how strongly the sky lights the scene (scene.environmentIntensity)
//   hemi      { sky, ground, i } a little fill
//   fog       { color, near, far }
//   grade     post.js: tint, sat, lift, gain, bloom, grain, ca, vignette, aces, exposure,
//             ao, mono (keep only the entity colours), shimmer (heat haze)
//   weather   art/weather.js kinds
//   ground    art/ground.js: a texture per kind of floor, a tint, wetness 0-1
//   town      art/kitbuild.js: plaster share, storeys, facade, brick and joinery colours,
//             damage, burnt, lit rooms, broken, boarded, shutters, air-con, balconies,
//             awnings, pitched roofs
//   lamps     wall lamps: colour, strength, reach, share still burning
//   effects   canopy (MOSS), fires (EMBER), searchlight (COBALT)

const deg = (az, elev) => {
  const a = (az * Math.PI) / 180, e = (elev * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};

export const HD_STYLES = Object.freeze({
  // RUST, the foundry belt (the Greys). Default: a sunset glow on everything. Here the sun
  // is already under a roof of cloud: one band of light low in the west, the rest of the
  // sky slate; the light reaches the top storeys and the ends of streets that face it and
  // nothing else. Brick terraces, soot, and a few candles where people are still hiding.
  RUST: {
    sky: { photo: 'belfast_sunset_sky_4k.jpg', env: 'belfast_sunset_puresky_1k.hdr', gain: 1 / 0.09, dim: 0.55, haze: '#56545c', drift: 0.0003 },
    sun: { dir: [0.79, 0.09, 0.61], color: '#ffb27a', intensity: 2.2, shadow: true },
    env: 0.55,
    hemi: { sky: '#7a7f8c', ground: '#2a2522', i: 0.15 },
    fog: { color: '#56545c', near: 14, far: 170 },
    grade: { tint: '#f6f2f0', sat: 0.82, lift: 0.004, gain: 1.0, bloom: 0.45, grain: 0.05, ca: 0.0008, vignette: 0.42, aces: true, exposure: 0.78, ao: 0.9 },
    weather: { kind: 'dust', color: '#8a8580', rate: 0.25, size: 0.025, speed: 0.25, slant: 0.5 },
    ground: { tint: '#c8c4c0', wet: 0 },
    town: {
      brickSat: 0.85,
      plaster: 0.4, storeys: 0,
      palette: ['#8f918c', '#7d8580', '#8a8f99', '#6f6a66', '#a3a09b', '#5f6b73', '#94988f', '#7a7570'],
      brick: ['#a89e97', '#8c847e', '#b3aaa4', '#7a716c', '#9b948f'],
      joinery: ['#2c3a30', '#3a2420', '#232a38', '#1c1c1e', '#4a4440', '#5a6066'],
      damage: [0.35, 0.95], burnt: 0.3, lit: 0.06, litColor: [1.9, 1.25, 0.7],
    },
    lamps: { color: '#ffb46b', intensity: 12, distance: 12, burn: 0.3 },
  },

  // TIDE, the harbour belt (the Deep ones). Default: a blue rainy night with a lighthouse.
  // Here it is the middle of a storm day -- grey, no shadows, rain driven across, sea fog
  // at the end of every street -- and the water is the light: every street is wet and
  // throws back the sky. The harbour town has its storm shutters down, so most of what you
  // see of a building is shut; the few open windows are black.
  TIDE: {
    sky: { photo: 'overcast_soil_sky_4k.jpg', env: 'overcast_soil_puresky_1k.hdr', gain: 1 / 0.31, dim: 0.42, haze: '#5c6668', drift: 0.0012 },
    sun: null,
    env: 0.62,
    hemi: { sky: '#8a98a0', ground: '#1e2426', i: 0.2 },
    fog: { color: '#5c6668', near: 6, far: 80 },
    grade: { tint: '#eef4f4', sat: 0.62, lift: 0.006, gain: 1.0, bloom: 0.3, grain: 0.04, ca: 0.0006, vignette: 0.35, aces: true, exposure: 0.85, ao: 0.8 },
    weather: { kind: 'rain', color: '#b4c6d6', rate: 1.0, size: 0.34, speed: 10, slant: 0.3 },
    ground: { tint: '#9aa0a2', wet: 0.85 },
    town: {
      brickSat: 0.6,
      plaster: 0.85, storeys: 0,
      palette: ['#c9d2d6', '#a8b7c0', '#b9c4bf', '#8d9ca6', '#d8dcdc', '#9eb0ad', '#7f8f9a', '#c4cbd4'],
      brick: ['#9aa0a4', '#868c90'],
      joinery: ['#ece9e2', '#24314a', '#2e4a4a', '#1c1c1e', '#556066'],
      damage: [0.25, 0.7], burnt: 0.05, lit: 0.02, shutters: 0.45,
    },
    lamps: { color: '#e8f0ff', intensity: 8, distance: 10, burn: 0.15 },
    props: { harbour: true },
  },

  // MOSS, the overgrown belt (the Sporelings). Default: green jungle over everything. Here
  // the growth is overhead -- a canopy has closed over the district at the height of the
  // roofs -- so it is noon and nearly dark, and the sun comes through in coins and shafts
  // that move as you walk. Leaf litter in the streets, damp pitched-roof houses, spores.
  MOSS: {
    sky: { photo: 'kloofendal_48d_sky_4k.jpg', env: 'kloofendal_48d_partly_cloudy_puresky_1k.hdr', gain: 2.857, dim: 0.5, tint: '#c8d6b8', haze: '#323a2e', drift: 0.0002 },
    sun: { dir: [0.5547, 0.7415, 0.3775], color: '#f0f4d8', intensity: 3.2, shadow: true },
    env: 0.32,
    hemi: { sky: '#6a7a5a', ground: '#1a1d14', i: 0.15 },
    fog: { color: '#323a2e', near: 8, far: 75 },
    grade: { tint: '#f2f6ea', sat: 0.85, lift: 0.004, gain: 1.0, bloom: 0.55, grain: 0.05, ca: 0.0007, vignette: 0.45, aces: true, exposure: 1.1, ao: 0.95 },
    weather: { kind: 'spores', color: '#d4f2a2', rate: 0.6, size: 0.05, speed: 0.12, slant: 0.2 },
    ground: { street: 'leaves_forest_ground', pavement: 'forest_leaves_02', plaza: 'forest_leaves_02', park: 'grass_path_2', tint: '#b8bcae', wet: 0.3 },
    town: {
      brickSat: 0.7,
      plaster: 0.8, storeys: -1, pitched: 0.55,
      palette: ['#9aa38f', '#8c9a8a', '#a6ad9c', '#7f8a7a', '#b4b8a8', '#8f9b96', '#6f7a6a'],
      brick: ['#8a8c80', '#767a6e'],
      joinery: ['#2c3a28', '#3a3a30', '#1e2420', '#55604a', '#ece7dc'],
      damage: [0.5, 1.0], burnt: 0.05, lit: 0.01, broken: 1.5,
    },
    lamps: { color: '#d8f0b0', intensity: 6, distance: 9, burn: 0.1 },
    effects: { canopy: { height: 15.5, cover: 0.62 } },
  },

  // EMBER, the burned belt (the Cinders). Default: a city on fire, orange everywhere --
  // and too near the aliens' red and the keys' gold. Here the fire has passed: it is night,
  // the district is black shells, and the only light is what still burns inside a few of
  // them, flickering on the street through empty windows. Embers drift; smoke hides the sky.
  EMBER: {
    sky: { proc: { zenith: '#0a0807', horizon: '#1c1512', clouds: 0.85, cloud: '#1a1412', stars: 0, canopy: 0, body: { kind: 'sun', az: 0, elev: -20, color: '#000000', size: 0, glow: 0 }, beam: null, body2: null, aurora: null, ship: 0 } },
    sun: null,
    env: 0.35,
    hemi: { sky: '#3a3230', ground: '#0c0808', i: 0.18 },
    fog: { color: '#1c1512', near: 6, far: 70 },
    grade: { tint: '#fff2e8', sat: 0.9, lift: 0.006, gain: 1.0, bloom: 0.75, grain: 0.06, ca: 0.0009, vignette: 0.5, aces: true, exposure: 1.1, ao: 0.85 },
    weather: { kind: 'embers', color: '#d8692a', rate: 0.7, size: 0.05, speed: 0.5, slant: 0.4 },
    ground: { street: 'burned_ground_01', pavement: 'burned_ground_01', plaza: 'burned_ground_01', yards: 'burned_ground_01', tint: '#9a9490', wet: 0 },
    town: {
      brickSat: 0.45,
      plaster: 0.25, storeys: 0,
      palette: ['#6a6664', '#5a5654', '#7a7470', '#4e4a48'],
      brick: ['#6e6460', '#5c5450', '#7c726c', '#4a4442'],
      joinery: ['#141210', '#1c1a18', '#2a2624'],
      damage: [0.8, 1.0], burnt: 1.0, lit: 0, broken: 3,
    },
    lamps: { color: '#ff8a3a', intensity: 0, distance: 0, burn: 0 },
    effects: { fires: { share: 0.14, color: '#ff8c3c', intensity: 26, distance: 15 } },
  },

  // VIOLET, the neon belt (the Watchers). Default: cyberpunk -- neon signs in the rain.
  // Here the power is out; there is no neon. The sky is the only light: an aurora, violet
  // and blue, over tall dark blocks, and the wet streets carry it.
  VIOLET: {
    sky: { proc: { zenith: '#07061a', horizon: '#1c1a33', clouds: 0.2, cloud: '#151428', stars: 0.8, canopy: 0, body: { kind: 'moon', az: 135, elev: 40, color: '#c8ccee', size: 0.022, glow: 0.12 }, beam: null, body2: null, aurora: { a: '#5a6cff', b: '#7a6cff', strength: 1.4 }, ship: 0 } },
    moonLight: { dir: deg(135, 40), color: '#9aa4e8', intensity: 0.9, shadow: true },
    env: 5.0,
    hemi: { sky: '#5a50a0', ground: '#08070e', i: 0.9 },
    fog: { color: '#141228', near: 10, far: 90 },
    grade: { tint: '#f6f2ff', sat: 1.0, lift: 0.006, gain: 1.0, bloom: 0.9, grain: 0.05, ca: 0.001, vignette: 0.45, aces: true, exposure: 1.35, ao: 0.85 },
    weather: { kind: 'drizzle', color: '#a8b4d8', rate: 0.6, size: 0.26, speed: 7, slant: 0.12 },
    ground: { pavement: 'granite_tile', plaza: 'granite_tile', tint: '#a8a8b4', wet: 0.75 },
    town: {
      brickSat: 0.5,
      plaster: 0.6, storeys: 2,
      palette: ['#8a8fa8', '#7a7f96', '#9a9cb0', '#6a6e86', '#a4a6b8', '#80869e'],
      brick: ['#8a8496', '#76727f'],
      joinery: ['#1c1c24', '#2a2a36', '#3a3a48', '#ece7dc'],
      damage: [0.2, 0.6], burnt: 0.05, lit: 0, shutters: 0.1,
    },
    lamps: { color: '#b8c0ff', intensity: 0, distance: 0, burn: 0 },
  },

  // ASH, the grey belt (the Husks). Default: Silent Hill's white fog. Here the ash itself
  // is the style: it falls like snow and has settled on everything, and the film has lost
  // its colour -- all but the colours that matter. A red alien, a gold key, a coin and
  // the teal portal are the only colour left in the frame (post.js `mono`), which is the
  // game's legibility rule made into the look.
  ASH: {
    sky: { photo: 'kloofendal_overcast_sky_4k.jpg', env: 'kloofendal_overcast_puresky_1k.hdr', gain: 1 / 0.26, dim: 0.62, haze: '#8a8a88', drift: 0.0004 },
    sun: null,
    env: 0.75,
    hemi: { sky: '#b8b8b4', ground: '#3a3a38', i: 0.2 },
    fog: { color: '#8a8a88', near: 8, far: 95 },
    grade: { tint: '#ffffff', sat: 1.0, lift: 0.01, gain: 1.0, bloom: 0.25, grain: 0.07, ca: 0.0005, vignette: 0.38, aces: true, exposure: 0.95, ao: 0.9, mono: 1 },
    weather: { kind: 'ash', color: '#d8d8d4', rate: 1.0, size: 0.07, speed: 0.55, slant: 0.25 },
    ground: { street: 'concrete_pavement', yards: 'concrete_pavement', tint: '#e4e4e0', wet: 0 },
    town: {
      brickSat: 0.08,
      plaster: 0.35, storeys: 1,
      palette: ['#b8b8b4', '#a0a09c', '#c8c8c4', '#8c8c88'],
      brick: ['#a8a4a0', '#94908c', '#b8b4b0'],
      joinery: ['#2a2a2a', '#3a3a3a', '#1c1c1c'],
      damage: [0.5, 1.0], burnt: 0.2, lit: 0, broken: 4, boarded: 0.3,
    },
    lamps: { color: '#e8e8e8', intensity: 5, distance: 9, burn: 0.1 },
  },

  // CORAL, the deco seaside belt (the Choristers). Default: a pink sunset over a resort.
  // Here it is morning and the sea mist has come in: the sun is a pale disc you can look
  // at, everything is backlit and soft, shadows are blue. Faded pastel fronts with
  // balconies and checkered pavements -- a promenade nobody walks.
  CORAL: {
    sky: { photo: 'kloofendal_28d_misty_sky_4k.jpg', env: 'kloofendal_28d_misty_puresky_1k.hdr', gain: 1 / 0.14, dim: 0.5, tint: '#f0e8ec', haze: '#8c8890', drift: 0.0002 },
    sun: { dir: [0.8632, 0.4775, -0.1641], color: '#ffe8e0', intensity: 2.0, shadow: true, softShadow: 0.55 },
    env: 0.6,
    hemi: { sky: '#c0b4c4', ground: '#2a2428', i: 0.15 },
    fog: { color: '#8c8890', near: 8, far: 90 },
    grade: { tint: '#fff6f8', sat: 0.8, lift: 0.012, gain: 0.98, bloom: 0.6, grain: 0.04, ca: 0.0006, vignette: 0.3, aces: true, exposure: 0.88, ao: 0.75 },
    weather: { kind: 'mist', color: '#c8c0c8', rate: 0.5, size: 1.6, speed: 0.05, slant: 0.1 },
    ground: { pavement: 'checkered_pavement_tiles', plaza: 'checkered_pavement_tiles', tint: '#c4c0c4', wet: 0.2 },
    town: {
      brickSat: 0.55,
      plaster: 0.95, storeys: 1, balconies: 0.45, piers: 0.7,
      palette: ['#d6c4d0', '#c8d8cc', '#d4d8dc', '#bcd0d0', '#dcd8dc', '#d0bccb', '#b8c8d8', '#e0dce0'],
      brick: ['#b4a8b0'],
      joinery: ['#ece9e2', '#3d5f6e', '#24314a', '#5a4a5e', '#2c4a38'],
      damage: [0.2, 0.6], burnt: 0.05, lit: 0.01,
    },
    lamps: { color: '#ffe0d0', intensity: 6, distance: 10, burn: 0.15 },
    props: { benches: 2.5 },
  },

  // JADE, the stone belt (the Wardens). Default: lanterns in the mist. Here there are two
  // moons, so everything casts two shadows that cross -- the one thing in the game that
  // tells you, without a word, that this is not Earth any more. Mist lies on the ground;
  // heavy grey-green stone fronts; mossy cobbles.
  JADE: {
    sky: { proc: { zenith: '#050a08', horizon: '#141e1a', clouds: 0.2, cloud: '#101814', stars: 0.6, canopy: 0, body: { kind: 'moon', az: 110, elev: 32, color: '#d0e0d8', size: 0.055, glow: 0.2 }, body2: { az: 160, elev: 24, color: '#c8d0e8', size: 0.035, glow: 0.14 }, beam: null, aurora: null, ship: 0 } },
    moonLight: { dir: deg(110, 32), color: '#c4dccf', intensity: 1.1, shadow: true },
    moon2: { dir: deg(160, 24), color: '#b4c0e0', intensity: 0.75, shadow: true },
    env: 1.4,
    hemi: { sky: '#4a5a54', ground: '#060908', i: 0.25 },
    fog: { color: '#18221e', near: 8, far: 80 },
    grade: { tint: '#f2faf6', sat: 0.7, lift: 0.008, gain: 1.0, bloom: 0.6, grain: 0.05, ca: 0.0007, vignette: 0.45, aces: true, exposure: 1.3, ao: 0.85 },
    weather: { kind: 'mist', color: '#9aaaa2', rate: 0.9, size: 1.9, speed: 0.04, slant: 0.05 },
    ground: { street: 'mossy_cobblestone', pavement: 'mossy_cobblestone', plaza: 'mossy_cobblestone', tint: '#a8b0ac', wet: 0.35 },
    town: {
      brickSat: 0.25,
      plaster: 0.2, storeys: 0,
      palette: ['#8a948e', '#7a8680', '#98a09a'],
      brick: ['#8c9690', '#7c8680', '#9aa49e', '#6e7872'],
      joinery: ['#1e2a24', '#2a3a32', '#1c1c1e'],
      damage: [0.3, 0.8], burnt: 0.05, lit: 0.03, litColor: [1.2, 1.5, 1.3],
    },
    lamps: { color: '#d8f0e4', intensity: 7, distance: 10, burn: 0.35 },
  },

  // SOLAR, the desert belt (the Mirages). Default: hard sun, blue sky, heat. Here a dust
  // storm has turned noon brown: the sun is a dull coin, you see forty metres, and the air
  // ripples (post.js `shimmer`) -- the Mirages' belt, where you cannot trust what you see
  // at the end of a street. Low flat-roofed sand-coloured houses, awnings, sand in drifts.
  SOLAR: {
    sky: { photo: 'kloofendal_48d_sky_4k.jpg', env: 'kloofendal_48d_partly_cloudy_puresky_1k.hdr', gain: 2.857, dim: 0.35, tint: '#c8a888', haze: '#7e7468', drift: 0.003, veil: 0.88, disc: 1.4, sunDir: [0.5547, 0.7415, 0.3775] },
    sun: { dir: [0.5547, 0.7415, 0.3775], color: '#ffe0b8', intensity: 1.4, shadow: true, softShadow: 0.45 },
    env: 0.5,
    hemi: { sky: '#a08a70', ground: '#2a2218', i: 0.25 },
    fog: { color: '#7e7468', near: 3, far: 52 },
    grade: { tint: '#fff4e4', sat: 0.75, lift: 0.01, gain: 1.0, bloom: 0.4, grain: 0.06, ca: 0.0009, vignette: 0.4, aces: true, exposure: 0.9, ao: 0.8, shimmer: 1 },
    weather: { kind: 'haze', color: '#c8b494', rate: 1.0, size: 0.05, speed: 2.2, slant: 0.9 },
    ground: { street: 'dense_sand', pavement: 'dense_sand', plaza: 'dense_sand', yards: 'dense_sand', park: 'dense_sand', tint: '#b8aea4', wet: 0 },
    town: {
      brickSat: 0.5,
      plaster: 0.9, storeys: -1, awnings: 0.6,
      palette: ['#b4ada4', '#a8a198', '#c0bab2', '#9c958c', '#b8b0a8'],
      brick: ['#a49c94'],
      joinery: ['#2a3a4a', '#3d6a9a', '#ece7dc', '#4a3426'],
      damage: [0.3, 0.8], burnt: 0.05, lit: 0, shutters: 0.25,
    },
    lamps: { color: '#ffd8a8', intensity: 5, distance: 9, burn: 0.1 },
  },

  // COBALT, the last belt (the Architects). Default: a flying saucer with blue lights.
  // Here the ship *is* the sky -- a hull from edge to edge, no stars -- and its light is a
  // searchlight that sweeps the streets: a white circle crossing the district, everything
  // stark while it passes, black again after. Tall cold blocks; the pavements have been
  // plated over; the only lamps are emergency lights.
  COBALT: {
    sky: { proc: { zenith: '#04060c', horizon: '#0c1220', clouds: 0, cloud: '#0c1220', stars: 0, canopy: 0, body: { kind: 'moon', az: 0, elev: -20, color: '#000000', size: 0, glow: 0 }, beam: null, body2: null, aurora: null, ship: 1.0 } },
    env: 3.5,
    hemi: { sky: '#3a4a70', ground: '#04050a', i: 0.6 },
    fog: { color: '#0a0e18', near: 10, far: 85 },
    grade: { tint: '#f2f6ff', sat: 0.75, lift: 0.006, gain: 1.0, bloom: 0.8, grain: 0.05, ca: 0.001, vignette: 0.5, aces: true, exposure: 1.25, ao: 0.85 },
    weather: null,
    ground: { pavement: 'metal_plate', plaza: 'metal_plate', yards: 'metal_plate', tint: '#a0a4ac', wet: 0.2 },
    town: {
      brickSat: 0.3,
      plaster: 0.4, storeys: 2,
      palette: ['#8a909c', '#7a808c', '#9aa0ac', '#6a707c'],
      brick: ['#7c8088', '#6a6e76', '#8c9098'],
      joinery: ['#1c1e24', '#2a2e36', '#3a404a'],
      damage: [0.3, 0.8], burnt: 0.1, lit: 0, shutters: 0.15,
    },
    lamps: { color: '#cfe0ff', intensity: 9, distance: 10, burn: 0.7 },
    effects: { searchlight: { height: 70, radius: 9, intensity: 60000, color: '#e8f0ff', period: 46 } },
  },
});
