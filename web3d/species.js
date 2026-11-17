// web3d/species.js -- what the aliens look like, one parameter set per species.
//
// One shared skeleton (web3d/alien.js), different parameters per belt. Phase N2 ships the
// first species, the Greys, and every belt uses it; the rest of the table in
// spec-3d-next.md (Deep ones for TIDE, Sporelings for MOSS, ...) is added one entry at a
// time, each a new object below plus its row in BELT_SPECIES.
//
// What never changes between species: the threat colour. However the skin looks, the eye
// slits, the markings and the rim light on the silhouette are red, because red is what an
// alien is in this game's vocabulary -- the 2D board, the rings, the minimap all say so.

export const SPECIES = Object.freeze({
  greys: Object.freeze({
    id: 'greys',
    name: 'Greys',
    // skin: grey-green; the tint per state multiplies a mottled albedo
    skin: { calm: 0x7c8a7e, hunting: 0x8a9384, stunned: 0x55575f },
    // bioluminescent markings and rim light, red; glow per state
    glowColor: 0xff2a3c,
    glow: { calm: 0.45, hunting: 1.0, stunned: 0 },
    rim: 0.9,
    // the head: a lathe profile (radius, height) from chin to crown, in metres, tipped
    // back so the dome sits behind the neck and the chin comes forward
    cranium: [
      [0.0, -0.14], [0.045, -0.13], [0.09, -0.1], [0.135, -0.05], [0.18, 0.02],
      [0.225, 0.1], [0.265, 0.19], [0.285, 0.28], [0.278, 0.36], [0.245, 0.43],
      [0.18, 0.485], [0.09, 0.515], [0.0, 0.525],
    ],
    craniumTip: 0.42,          // radians the lathe is tipped back
    craniumDepth: 0.9,         // front-to-back squash
    // enormous almond eyes, slanted 20 degrees, wrapped round the face and set into it at
    // the widest part of the head, where a Grey's eyes are
    eye: { x: 0.122, y: 0.17, z: -0.152, w: 0.125, h: 0.064, d: 0.055, slant: 0.35, wrap: 0.5 },
    slit: { w: 0.012, h: 0.044, d: 0.006 },
    // body proportions, metres
    pelvisY: 0.9,
    chest: { y: 1.37, z: -0.07 },          // hunched forward of the pelvis
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
    jointR: 1.12,                          // joints only a little fatter than the bone
    // movement
    twitchEvery: [2, 5],                   // seconds between idle twitches
    hearTilt: 0.31,                        // 18 degrees, when it hears you
  }),
});

/** Which species lives in each belt. Everything is a Grey until the others are built. */
export const BELT_SPECIES = Object.freeze([
  'greys', 'greys', 'greys', 'greys', 'greys', 'greys', 'greys', 'greys', 'greys', 'greys',
]);

/** Still to build, from spec-3d-next.md N2: belt index -> the planned species. */
export const PLANNED = Object.freeze({
  1: 'Deep ones (gills, webbed fingers, wet skin)',
  2: 'Sporelings (fungal growths, slow sway)',
  3: 'Cinders (cracked skin lit from inside)',
  4: 'Watchers (third eye, longer neck)',
  5: 'Husks (pale, emaciated, jerky)',
  6: 'Choristers (frilled collar that flares when hunting)',
  7: 'Wardens (crested head, armour plates)',
  8: 'Mirages (translucent, shimmering edges)',
  9: 'Architects (mechanical augments, segmented limbs)',
});

export function speciesFor(district = 1) {
  const belt = Math.floor((Math.max(1, district) - 1) / 10) % 10;
  return SPECIES[BELT_SPECIES[belt]] || SPECIES.greys;
}
