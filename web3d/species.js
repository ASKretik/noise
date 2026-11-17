// web3d/species.js -- what the aliens look like, one parameter set per belt. Pure data.
//
// One shared skeleton (web3d/alien.js), a different species in each of the ten belts.
// Every species is the Greys' parameter set with overrides (`species()` below merges them),
// plus optional FEATURES -- gills, webbing, growths, a third eye, a collar, a crest,
// armour plates, mechanical augments -- each drawn as one more instanced part, and a
// MOTION style.
//
// What never changes between species: the threat colour. However the skin looks, the eye
// slits, the markings and the rim light on the silhouette are red (or a red-orange, for
// the Cinders), because red is what an alien is in this game's vocabulary -- the 2D board,
// the rings, the minimap all say so. Criterion 3D-26 checks every species keeps to it.

const GREYS = {
  id: 'greys',
  name: 'Greys',
  belt: 'RUST',
  // skin: the tint per state multiplies a mottled albedo
  skin: { calm: 0x7c8a7e, hunting: 0x8a9384, stunned: 0x55575f },
  // bioluminescent markings and rim light; glow per state
  glowColor: 0xff2a3c,
  glow: { calm: 0.45, hunting: 1.0, stunned: 0 },
  rim: 0.9,
  markings: 'veins',                       // veins | cracks | spots | stripes | ribs | circuits | sigils | rings
  material: { roughness: 0.58, metalness: 0.02, opacity: 1, emissiveIntensity: 1.5 },
  // the head: a lathe profile (radius, height) from chin to crown, in metres, tipped
  // back so the dome sits behind the neck and the chin comes forward
  cranium: [
    [0.0, -0.14], [0.045, -0.13], [0.09, -0.1], [0.135, -0.05], [0.18, 0.02],
    [0.225, 0.1], [0.265, 0.19], [0.285, 0.28], [0.278, 0.36], [0.245, 0.43],
    [0.18, 0.485], [0.09, 0.515], [0.0, 0.525],
  ],
  craniumTip: 0.42,                        // radians the lathe is tipped back
  craniumScale: [1, 1, 0.9],               // x, y, z
  // enormous almond eyes, slanted 20 degrees, wrapped round the face and set into it at
  // the widest part of the head, where a Grey's eyes are
  eye: { x: 0.122, y: 0.17, z: -0.152, w: 0.125, h: 0.064, d: 0.055, slant: 0.35, wrap: 0.5 },
  slit: { w: 0.012, h: 0.044, d: 0.006 },
  thirdEye: null,                          // { y, scale } for the Watchers (depth is measured)
  // body proportions, metres
  pelvisY: 0.9,
  chest: { y: 1.37, z: -0.07 },            // hunched forward of the pelvis
  neckTop: { y: 1.53, z: -0.13 },
  // a lathe ribcage: narrow shoulders, a wider chest, a pinched waist (radius x height, 0 = neck)
  torso: { r: 0.16, depth: 0.74, profile: [[0.45, 0], [0.8, -0.08], [0.98, -0.22], [1.0, -0.38], [0.86, -0.56], [0.58, -0.74], [0.62, -0.88], [0.5, -0.97], [0.0, -1.0]] },
  neckR: 0.042,
  shoulderX: 0.2,
  hipX: 0.1,
  upperArm: { len: 0.34, r: 0.042 },
  forearm: { len: 0.37, r: 0.034 },
  finger: { len: 0.17, r: 0.012, spread: 0.26 },
  thigh: { len: 0.36, r: 0.06 },
  shin: { len: 0.36, r: 0.042 },
  foot: { len: 0.2, r: 0.03 },
  jointR: 1.12,                            // joints only a little fatter than the bone
  segmented: false,                        // extra joints mid-limb (the Architects)
  features: [],                            // see web3d/alien.js FEATURE_BUILDERS
  // movement
  motion: { sway: 0, jerk: false, flicker: 0, shimmer: 0 },
  twitchEvery: [2, 5],                     // seconds between idle twitches
  hearTilt: 0.31,                          // 18 degrees, when it hears you
};

/** Deep-merge overrides onto the Greys (arrays replace, objects merge). */
function species(over) {
  const merge = (a, b) => {
    if (b === undefined) return a;
    if (Array.isArray(b) || b === null || typeof b !== 'object') return b;
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = merge(a?.[k], b[k]);
    return out;
  };
  const freeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };
  return freeze(merge(GREYS, over));
}

export const SPECIES = Object.freeze({
  greys: species({}),

  /** TIDE. Wet, glossy, wide-headed, with gills and webbed hands. */
  deepOnes: species({
    id: 'deepOnes', name: 'Deep ones', belt: 'TIDE',
    skin: { calm: 0x4f7c84, hunting: 0x5a8a8e, stunned: 0x46525a },
    markings: 'stripes',
    material: { roughness: 0.16, metalness: 0.12, emissiveIntensity: 1.4 },
    craniumScale: [1.16, 0.84, 0.96],
    craniumTip: 0.32,
    eye: { x: 0.14, y: 0.12, w: 0.105, h: 0.08, slant: 0.14, wrap: 0.62, z: -0.16 },
    finger: { spread: 0.34 },
    neckR: 0.06,
    features: [{ type: 'gills' }, { type: 'web' }],
  }),

  /** MOSS. Fungal growths on the head, a slow drunken sway. */
  sporelings: species({
    id: 'sporelings', name: 'Sporelings', belt: 'MOSS',
    skin: { calm: 0x86975e, hunting: 0x93a368, stunned: 0x5a604e },
    glow: { calm: 0.6, hunting: 1.15 },
    markings: 'spots',
    material: { roughness: 0.8 },
    features: [{ type: 'growths', count: 13 }],
    motion: { sway: 0.1 },
    twitchEvery: [3, 7],
  }),

  /** EMBER. Charcoal skin, cracked, lit from inside. */
  cinders: species({
    id: 'cinders', name: 'Cinders', belt: 'EMBER',
    skin: { calm: 0x3a3330, hunting: 0x433a35, stunned: 0x2e2c2c },
    glowColor: 0xff4a24,
    glow: { calm: 0.85, hunting: 1.35 },
    rim: 1.1,
    markings: 'cracks',
    material: { roughness: 0.9, emissiveIntensity: 2.2 },
    motion: { flicker: 0.35 },
  }),

  /** VIOLET. A third eye, a long neck, a tall head. */
  watchers: species({
    id: 'watchers', name: 'Watchers', belt: 'VIOLET',
    skin: { calm: 0x857a9a, hunting: 0x928aa6, stunned: 0x55525f },
    markings: 'rings',
    craniumScale: [0.92, 1.18, 0.92],
    neckTop: { y: 1.72, z: -0.16 },
    neckR: 0.036,
    thirdEye: { y: 0.34, scale: 0.62 },
  }),

  /** ASH. Pale, emaciated, moves in jerks. */
  husks: species({
    id: 'husks', name: 'Husks', belt: 'ASH',
    skin: { calm: 0xb9b6aa, hunting: 0xc4c0b2, stunned: 0x77756f },
    glow: { calm: 0.3, hunting: 0.9 },
    markings: 'ribs',
    craniumScale: [0.88, 1.02, 0.86],
    torso: { r: 0.12, depth: 0.62 },
    upperArm: { r: 0.03 }, forearm: { r: 0.024, len: 0.4 }, thigh: { r: 0.042 }, shin: { r: 0.03 },
    finger: { len: 0.2, r: 0.009 },
    motion: { jerk: true },
    twitchEvery: [0.6, 1.8],
  }),

  /** CORAL. A frilled collar that flares when it hunts. */
  choristers: species({
    id: 'choristers', name: 'Choristers', belt: 'CORAL',
    skin: { calm: 0xa98990, hunting: 0xb6939a, stunned: 0x645a5e },
    markings: 'sigils',
    features: [{ type: 'collar', fins: 13, color: 0xc96a7c }],
  }),

  /** JADE. Bulkier, crested, armour-plated. */
  wardens: species({
    id: 'wardens', name: 'Wardens', belt: 'JADE',
    skin: { calm: 0x5e8676, hunting: 0x6a9282, stunned: 0x485550 },
    markings: 'sigils',
    craniumScale: [1.06, 0.96, 1.0],
    torso: { r: 0.2, depth: 0.82 },
    upperArm: { r: 0.052 }, forearm: { r: 0.044 }, thigh: { r: 0.075 }, shin: { r: 0.054 },
    neckTop: { y: 1.5, z: -0.12 },
    neckR: 0.055,
    shoulderX: 0.25,
    features: [{ type: 'crest', fins: 5, color: 0x3f6656 }, { type: 'plates', color: 0x34574a }],
  }),

  /** SOLAR. Translucent, edges shimmering like heat haze; only the eyes are solid. */
  mirages: species({
    id: 'mirages', name: 'Mirages', belt: 'SOLAR',
    skin: { calm: 0xd8c38e, hunting: 0xe2cd98, stunned: 0x8a8070 },
    glow: { calm: 0.6, hunting: 1.2 },
    rim: 2.1,
    markings: 'rings',
    // ghostly, not invisible: at 0.42 a Mirage nine metres away was two eyes and a faint
    // outline, and the 3D player must never see less than the 2D player does
    material: { opacity: 0.62, roughness: 0.3 },
    motion: { shimmer: 0.4 },
  }),

  /** COBALT. Mechanical augments, segmented limbs, circuit markings. */
  architects: species({
    id: 'architects', name: 'Architects', belt: 'COBALT',
    skin: { calm: 0x6e7a8e, hunting: 0x7a8698, stunned: 0x50555f },
    markings: 'circuits',
    material: { roughness: 0.4, metalness: 0.25 },
    segmented: true,
    features: [{ type: 'augments', color: 0x9aa3b4 }],
  }),
});

/** Which species lives in each belt, RUST to COBALT. */
export const BELT_SPECIES = Object.freeze([
  'greys', 'deepOnes', 'sporelings', 'cinders', 'watchers',
  'husks', 'choristers', 'wardens', 'mirages', 'architects',
]);

export const FEATURE_TYPES = Object.freeze(['gills', 'web', 'growths', 'collar', 'crest', 'plates', 'augments']);
export const MARKING_STYLES = Object.freeze(['veins', 'cracks', 'spots', 'stripes', 'ribs', 'circuits', 'sigils', 'rings']);

export function speciesFor(district = 1) {
  const belt = Math.floor((Math.max(1, district) - 1) / 10) % 10;
  return SPECIES[BELT_SPECIES[belt]] || SPECIES.greys;
}
