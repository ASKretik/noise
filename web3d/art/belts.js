// web3d/art/belts.js -- the art direction of each belt, as data. Pure: no three.js, no
// DOM, so the palette check (criterion 3D-16) runs under Node.
//
// N4 (spec-3d-next.md). Each belt is a place; inside a belt, the ten districts go from dusk
// (depth k = 0) to midnight (k = 9): the sky darkens, the sun sets and the moon rises, the
// light cools and the weather thickens. artFor(district) resolves a belt's dusk and
// midnight ends to the concrete values for one district.
//
// N4.1 art-directs RUST, TIDE and MOSS. The other seven keep their 2D palettes (world.js
// derives them) with the same sky, light and depth progression, until N4.2.
//
// THE LEGIBILITY RULE: red aliens, gold keys, coins by value and the teal portal are the
// game's vocabulary. No large-area colour here -- walls, floors, sky, fog, props -- may sit
// within 25 degrees of hue AND 0.25 of lightness of one of them (largeAreaColours()).

export const ENTITY_COLOURS = Object.freeze({
  alien: '#ff4d5e', alienGlow: '#ff2a3c', alienGlowOrange: '#ff4a24', alienCalm: '#c9414f',
  key: '#ffc93b', bolt: '#ffe66d', coin1: '#c8803c', coin10: '#c87bff', portal: '#19e0c8',
});

/**
 * Per belt: surface styles, colours, props, weather, and a sky and light at dusk and at
 * midnight. Azimuths in degrees round the compass (0 = grid north, 90 = east), elevations
 * in degrees above the horizon.
 */
const ART = {
  RUST: {
    wall: { style: 'riveted', base: '#4b3326', detail: '#7d4a2b', roughness: 0.78, metalness: 0.35 },
    floor: { style: 'plates', base: '#3a3631', detail: '#26221e', roughness: 0.85 },
    rubble: '#4a3a30', water: '#34433c',
    props: { kind: 'pipes', base: '#4a4744', accent: '#6e3524', density: 0.22 },
    weather: { kind: 'dust', color: '#c9a27a', rate: [0.45, 0.9], size: 0.1, speed: 0.35, slant: 0.6 },
    dusk: {
      zenith: '#1f1a2c', horizon: '#4a2c22', clouds: 0.35, cloud: '#50342b', stars: 0,
      body: { kind: 'sun', az: 250, elev: 8, color: '#ffb067', size: 0.06, glow: 0.55 },
      hemiSky: '#caa587', hemiGround: '#2a1c14', hemi: 2.0, key: '#ffb26e', keyI: 2.5,
    },
    night: {
      zenith: '#07070e', horizon: '#18121a', clouds: 0.25, cloud: '#221a20', stars: 0.6,
      body: { kind: 'moon', az: 110, elev: 38, color: '#c9d4ee', size: 0.025, glow: 0.18 },
      hemiSky: '#5f6a86', hemiGround: '#0d0a0c', hemi: 1.25, key: '#9fb2d9', keyI: 0.8,
    },
  },
  TIDE: {
    wall: { style: 'wetConcrete', base: '#46525a', detail: '#2a3238', roughness: 0.55, metalness: 0.05 },
    floor: { style: 'wetConcrete', base: '#353d42', detail: '#252b2f', roughness: 0.5 },
    rubble: '#3c454b', water: '#26404f',
    props: { kind: 'harbour', base: '#2c3034', accent: '#e4e7ea', band: '#2b3a55', density: 0.12 },
    weather: { kind: 'rain', color: '#b4c6d6', rate: [0.5, 1.0], size: 0.32, speed: 9, slant: 0.18 },
    dusk: {
      zenith: '#2a333c', horizon: '#56636b', clouds: 0.85, cloud: '#6d7a82', stars: 0,
      body: { kind: 'sun', az: 240, elev: 6, color: '#e9dcc4', size: 0.05, glow: 0.2 },
      beam: { color: '#fff1c9', az: 80, speed: 0.35 },
      hemiSky: '#b4c2cc', hemiGround: '#1e2428', hemi: 1.85, key: '#d9dde2', keyI: 1.2,
    },
    night: {
      zenith: '#080c11', horizon: '#1a2329', clouds: 0.9, cloud: '#232d34', stars: 0,
      body: { kind: 'moon', az: 130, elev: 30, color: '#b9c6da', size: 0.02, glow: 0.08 },
      beam: { color: '#fff1c9', az: 80, speed: 0.35 },
      hemiSky: '#56677a', hemiGround: '#0a0d10', hemi: 1.1, key: '#8ea2be', keyI: 0.5,
    },
  },
  MOSS: {
    wall: { style: 'mossyStone', base: '#4a4f45', detail: '#4f6b2e', roughness: 0.92, metalness: 0 },
    floor: { style: 'flagstones', base: '#383d34', detail: '#3f5a28', roughness: 0.9 },
    rubble: '#3e463a', water: '#27392c',
    props: { kind: 'vines', base: '#3b5a29', accent: '#5f8a3a', density: 0.3 },
    weather: { kind: 'spores', color: '#d4f2a2', rate: [0.3, 0.75], size: 0.07, speed: 0.12, slant: 0.2 },
    dusk: {
      zenith: '#18231b', horizon: '#3b4b3d', clouds: 0.2, cloud: '#2b3a2c', stars: 0, canopy: 0.75,
      body: { kind: 'sun', az: 230, elev: 14, color: '#e6f0c4', size: 0.045, glow: 0.35 },
      hemiSky: '#a9c2a0', hemiGround: '#1a2116', hemi: 1.7, key: '#e2ecc6', keyI: 1.7,
    },
    night: {
      zenith: '#05080a', horizon: '#131b16', clouds: 0.15, cloud: '#121a14', stars: 0.25, canopy: 0.75,
      body: { kind: 'moon', az: 120, elev: 35, color: '#c4d6c8', size: 0.022, glow: 0.12 },
      hemiSky: '#55675a', hemiGround: '#080b09', hemi: 1.05, key: '#9bb2a2', keyI: 0.6,
    },
  },
};

export const BELT_NAMES = Object.freeze(['RUST', 'TIDE', 'MOSS', 'EMBER', 'VIOLET', 'ASH', 'CORAL', 'JADE', 'SOLAR', 'COBALT']);
export const beltOf = (district) => Math.floor((Math.max(1, Math.min(100, district)) - 1) / 10);
export const depthOf = (district) => (Math.max(1, Math.min(100, district)) - 1) % 10;

// ------------------------------------------------------------------ colour arithmetic

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
/** Mix two sRGB hex colours. */
export function mixHex(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}
const lerp = (a, b, t) => a + (b - a) * t;

/** HSL of an sRGB hex colour: h in degrees, s and l in [0,1]. */
export function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

// ------------------------------------------------------------------ one district

/**
 * The resolved art of one district, or null for a belt not yet art-directed (world.js
 * then derives one from the 2D palette).
 */
export function artFor(district) {
  const belt = beltOf(district), k = depthOf(district), t = k / 9;
  const def = ART[BELT_NAMES[belt]];
  if (!def) return null;
  const a = def.dusk, b = def.night;
  // the sun sets over the first half of the belt; the moon has risen by the second
  const body = t < 0.5
    ? { ...a.body, elev: lerp(a.body.elev, -2, t * 2), glow: a.body.glow * (1 - t) }
    : { ...b.body, elev: lerp(b.body.elev * 0.6, b.body.elev, (t - 0.5) * 2) };
  const beam = a.beam ? { ...a.beam, strength: lerp(0.35, 1, t) } : null;
  return {
    belt, name: BELT_NAMES[belt], k, t, styled: true,
    wall: def.wall, floor: def.floor, rubble: def.rubble, water: def.water, props: def.props,
    weather: def.weather ? { ...def.weather, rate: lerp(def.weather.rate[0], def.weather.rate[1], t) } : null,
    sky: {
      zenith: mixHex(a.zenith, b.zenith, t), horizon: mixHex(a.horizon, b.horizon, t),
      clouds: lerp(a.clouds, b.clouds, t), cloud: mixHex(a.cloud, b.cloud, t),
      stars: lerp(a.stars, b.stars, t), canopy: lerp(a.canopy || 0, b.canopy || 0, t),
      body, beam,
    },
    light: {
      hemiSky: mixHex(a.hemiSky, b.hemiSky, t), hemiGround: mixHex(a.hemiGround, b.hemiGround, t),
      hemi: lerp(a.hemi, b.hemi, t),
      key: t < 0.5 ? mixHex(a.key, b.key, t) : mixHex(a.key, b.key, t),
      keyI: lerp(a.keyI, b.keyI, t), keyAz: body.az, keyElev: Math.max(6, body.elev),
    },
    fog: { color: mixHex(a.horizon, b.horizon, t) },
  };
}

// ------------------------------------------------------------------ places (N4.2)

/** The eight kinds of place the city builder makes (sim3d/next/city.js PLACE_TYPES). */
export const PLACE_TYPE_ORDER = Object.freeze(['tenements', 'plaza', 'market', 'yards', 'park', 'canal', 'depot', 'ruins']);

/**
 * What each kind of place is built of. The PATTERN is the place's own (brick and windows
 * for tenements, a hedge for a park); the COLOURS are the belt's, pulled `mix` of the way
 * toward the place's tint, so RUST tenements are rusty brick and TIDE's are wet. Streets
 * and avenues keep the belt's plain look, so every place stands out against them.
 *
 *   walls     one or two wall patterns (a second one varies the cells: a door, a gap)
 *   height    how tall its walls are drawn, in metres (the sim treats every wall as solid)
 *   goods     colours of what fills it (crates, containers, stalls), small areas
 */
const PLACE_LOOKS = {
  tenements: { walls: ['brick', 'brickDoor'], floor: 'cobbles', height: 5.4, wallTint: '#4f3128', floorTint: '#38332f', mix: 0.55, rough: [0.9, 0.85] },
  plaza: { walls: ['ashlar'], floor: 'paving', height: 3.2, wallTint: '#62615c', floorTint: '#4e4b45', mix: 0.7, rough: [0.8, 0.75] },
  market: { walls: ['shutters'], floor: 'chequer', height: 3.2, wallTint: '#3f4650', floorTint: '#47433d', mix: 0.5, rough: [0.6, 0.7], metal: 0.3, goods: ['#3c5468', '#55623a', '#504048', '#6a6a62'] },
  yards: { walls: ['corrugated'], floor: 'gravel', height: 3.2, wallTint: '#43494d', floorTint: '#3a3833', mix: 0.5, rough: [0.65, 0.95], metal: 0.45, goods: ['#2f4a5c', '#3f5233', '#4f3d2e', '#4a4f55'] },
  park: { walls: ['hedge'], floor: 'grass', height: 3.2, wallTint: '#2a4222', floorTint: '#3a4f2a', mix: 0.8, rough: [0.95, 0.95] },
  canal: { walls: ['ashlar'], floor: 'setts', height: 3.2, wallTint: '#4b4a45', floorTint: '#3d3c38', mix: 0.45, rough: [0.8, 0.7] },
  depot: { walls: ['cladding', 'claddingDoor'], floor: 'concrete', height: 4.4, wallTint: '#3c4247', floorTint: '#3f3f3c', mix: 0.5, rough: [0.55, 0.6], metal: 0.5 },
  ruins: { walls: ['scorched'], floor: 'ash', height: 3.2, wallTint: '#1f1b19', floorTint: '#262321', mix: 0.45, rough: [0.95, 0.97] },
};

/**
 * One kind of place in one district's art: { type, walls: [{pattern, base, detail,
 * rough, metal}], floor: {pattern, base, detail, rough}, height, goods }.
 */
export function placeLook(art, type) {
  const L = PLACE_LOOKS[type];
  if (!L) return null;
  const wallBase = mixHex(art.wall.base, L.wallTint, L.mix), wallDetail = mixHex(art.wall.detail, L.wallTint, L.mix * 0.6);
  const floorBase = mixHex(art.floor.base, L.floorTint, L.mix), floorDetail = mixHex(art.floor.detail, L.floorTint, L.mix * 0.6);
  return {
    type, height: L.height, goods: L.goods || null,
    walls: L.walls.map((pattern) => ({ pattern, base: wallBase, detail: wallDetail, rough: L.rough[0], metal: L.metal || 0 })),
    floor: { pattern: L.floor, base: floorBase, detail: floorDetail, rough: L.rough[1] },
  };
}

/**
 * Name signs (N4.2): an enamel plate per kind of place, cream lettering. And the wall
 * art's inks (posters, graffiti, stencils). Small areas, but there are hundreds of them,
 * so 3D-16 checks these too: no red, gold, copper, violet or teal.
 */
export const SIGN_COLOURS = Object.freeze({
  tenements: '#1d2836', plaza: '#2a2a2e', market: '#1f3326', yards: '#2b2b2b',
  park: '#1e3322', canal: '#1c2a38', depot: '#141414', ruins: '#2a2522', lettering: '#dcdcd6',
});
export const DECAL_INKS = Object.freeze(['#e4e4e2', '#2a2d33', '#4f79c4', '#6e8f3e', '#8c8f96', '#3d5a8a', '#a9b4bf']);
export const POSTER_PAPERS = Object.freeze(['#b8b4aa', '#8a9bb0', '#7f8f6a', '#9a9a94', '#6f7f99']);

/** The colours that cover a lot of screen in a district, for the legibility rule. */
export function largeAreaColours(art) {
  const out = [
    ['wall', art.wall.base], ['floor', art.floor.base], ['rubble', art.rubble], ['water', art.water],
    ['props', art.props.base], ['sky zenith', art.sky.zenith], ['sky horizon', art.sky.horizon],
    ['clouds', art.sky.cloud], ['fog', art.fog.color],
  ];
  // N4.2: every kind of place's walls, floor and goods -- a yard full of containers is a lot of screen
  for (const type of PLACE_TYPE_ORDER) {
    const L = placeLook(art, type);
    out.push([`${type} wall`, L.walls[0].base], [`${type} floor`, L.floor.base]);
    for (const g of L.goods || []) out.push([`${type} goods`, g]);
  }
  return out;
}

/**
 * Does a colour clash with an entity colour? Within 25 degrees of hue and 0.25 of
 * lightness. A colour with almost no saturation has no hue to clash with.
 */
export function clashes(hex) {
  const c = hexToHsl(hex);
  const out = [];
  for (const [name, e] of Object.entries(ENTITY_COLOURS)) {
    const x = hexToHsl(e);
    const dh = Math.min(Math.abs(c.h - x.h), 360 - Math.abs(c.h - x.h));
    if (c.s >= 0.15 && dh < 25 && Math.abs(c.l - x.l) < 0.25) out.push(name);
  }
  return out;
}
