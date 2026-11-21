// web3d/art/belts.js -- the art direction of each belt, as data. Pure: no three.js, no
// DOM, so the palette check (criterion 3D-16) runs under Node.
//
// N4 (spec-3d-next.md). Each belt is a place; inside a belt, the ten districts go from dusk
// (depth k = 0) to midnight (k = 9): the sky darkens, the sun sets and the moon rises, the
// light cools and the weather thickens. artFor(district) resolves a belt's dusk and
// midnight ends to the concrete values for one district.
//
// N4.1 art-directed RUST, TIDE and MOSS; N4.3 the other seven. world.js's fallback (the
// 2D palette with the same sky and light) is now only for a district outside 1-100.
//
// THE LEGIBILITY RULE: red aliens, gold keys, coins by value and the teal portal are the
// game's vocabulary. No large-area colour here -- walls, floors, sky, fog, props -- may sit
// within 25 degrees of hue AND 0.25 of lightness of one of them (largeAreaColours()).

import { HD_STYLES } from './hdstyles.js';

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
    grade: { tint: '#fff8f0', sat: 1.05, gain: 1.02, bloom: 0.9 },
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
    grade: { tint: '#f2f8fc', sat: 0.88, bloom: 0.8 },
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
    grade: { tint: '#f6fbf2', sat: 0.95, bloom: 1.0 },
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
  EMBER: {
    grade: { tint: '#fff4ec', sat: 1.08, gain: 1.04, bloom: 1.1 },
    wall: { style: 'scorchedBrick', base: '#3a2420', detail: '#6e2a12', roughness: 0.9, metalness: 0 },
    floor: { style: 'cinders', base: '#2a2422', detail: '#4a2a1c', roughness: 0.95 },
    rubble: '#33282a', water: '#2b2a2c',
    props: { kind: 'beams', base: '#2a2220', accent: '#5a3a28', density: 0.16 },
    weather: { kind: 'embers', color: '#d8692a', rate: [0.35, 0.8], size: 0.06, speed: 0.5, slant: 0.4 },
    dusk: {
      zenith: '#1c1418', horizon: '#4a2a26', clouds: 0.6, cloud: '#3a2626', stars: 0,
      body: { kind: 'sun', az: 250, elev: 6, color: '#ff9a5a', size: 0.07, glow: 0.5 },
      hemiSky: '#c09080', hemiGround: '#24140e', hemi: 1.9, key: '#ffa070', keyI: 2.0,
    },
    night: {
      zenith: '#0a0708', horizon: '#24161a', clouds: 0.7, cloud: '#1e1416', stars: 0.15,
      body: { kind: 'moon', az: 115, elev: 30, color: '#d8b8a8', size: 0.024, glow: 0.1 },
      hemiSky: '#6a5a6a', hemiGround: '#0c0808', hemi: 1.15, key: '#b0a0b8', keyI: 0.6,
    },
  },
  VIOLET: {
    grade: { tint: '#f8f4ff', sat: 1.1, bloom: 1.2 },
    allNight: true,
    wall: { style: 'darkTile', base: '#2a2733', detail: '#4a4560', roughness: 0.4, metalness: 0.1 },
    floor: { style: 'darkTile', base: '#24222b', detail: '#38344a', roughness: 0.35 },
    rubble: '#2e2b36', water: '#1e2433',
    props: { kind: 'neon', base: '#3a3a44', accent: '#4a7dff', second: '#ff5ad2', density: 0.1 },
    weather: { kind: 'drizzle', color: '#a8b4d8', rate: [0.4, 0.85], size: 0.26, speed: 7, slant: 0.12 },
    dusk: {
      zenith: '#14132a', horizon: '#353a5c', clouds: 0.4, cloud: '#2a2a44', stars: 0.3,
      body: { kind: 'moon', az: 120, elev: 18, color: '#c8ccee', size: 0.026, glow: 0.2 },
      aurora: { a: '#5a8cff', b: '#7a6cff', strength: 0.45 },
      hemiSky: '#7a80b8', hemiGround: '#100e18', hemi: 1.55, key: '#a8b0ff', keyI: 0.95,
    },
    night: {
      zenith: '#07061a', horizon: '#1c1a33', clouds: 0.35, cloud: '#151428', stars: 0.7,
      body: { kind: 'moon', az: 135, elev: 40, color: '#c8ccee', size: 0.026, glow: 0.15 },
      aurora: { a: '#5a8cff', b: '#7a6cff', strength: 1.0 },
      hemiSky: '#5a6090', hemiGround: '#08070e', hemi: 1.1, key: '#9aa4e8', keyI: 0.55,
    },
  },
  ASH: {
    grade: { tint: '#fbfbfa', sat: 0.8, lift: 0.006, bloom: 0.7 },
    wall: { style: 'brutalist', base: '#4a4a48', detail: '#2f2f2e', roughness: 0.92, metalness: 0 },
    floor: { style: 'concrete', base: '#3c3c3a', detail: '#2a2a29', roughness: 0.9 },
    rubble: '#3e3e3c', water: '#2c3236',
    props: { kind: 'lamps', base: '#3a3c40', accent: '#d8dde6', density: 0.08 },
    weather: { kind: 'ash', color: '#b8b8b4', rate: [0.5, 1.0], size: 0.09, speed: 0.6, slant: 0.25 },
    dusk: {
      zenith: '#8a8c90', horizon: '#b4b6b8', clouds: 0.9, cloud: '#9a9c9e', stars: 0,
      body: { kind: 'sun', az: 240, elev: 12, color: '#f0f0ea', size: 0.05, glow: 0.15 },
      hemiSky: '#d8dade', hemiGround: '#262626', hemi: 2.1, key: '#f2f2ee', keyI: 1.3,
    },
    night: {
      zenith: '#101112', horizon: '#2a2b2c', clouds: 0.9, cloud: '#1e1f20', stars: 0,
      body: { kind: 'moon', az: 125, elev: 30, color: '#c8ccd2', size: 0.022, glow: 0.06 },
      hemiSky: '#70747c', hemiGround: '#0a0a0a', hemi: 1.15, key: '#a8aeb8', keyI: 0.45,
    },
  },
  CORAL: {
    grade: { tint: '#fff6f8', sat: 1.0, bloom: 0.9 },
    wall: { style: 'deco', base: '#5c4752', detail: '#7a5f6e', roughness: 0.75, metalness: 0 },
    floor: { style: 'terrazzo', base: '#4a4248', detail: '#6a5a64', roughness: 0.6 },
    rubble: '#4a3f45', water: '#2f3a48',
    props: { kind: 'railings', base: '#2a2a2e', accent: '#8a8f9a', density: 0.14 },
    weather: null,
    dusk: {
      zenith: '#2a2440', horizon: '#8a5a7a', clouds: 0.35, cloud: '#6a4a64', stars: 0,
      body: { kind: 'sun', az: 255, elev: 4, color: '#ffb0a0', size: 0.07, glow: 0.6 },
      hemiSky: '#d8b0c8', hemiGround: '#1e1418', hemi: 1.9, key: '#ffc0b0', keyI: 1.9,
    },
    night: {
      zenith: '#0c0a14', horizon: '#2a1e2c', clouds: 0.3, cloud: '#1e1622', stars: 0.5,
      body: { kind: 'moon', az: 120, elev: 34, color: '#d8c8e0', size: 0.024, glow: 0.12 },
      hemiSky: '#6a6080', hemiGround: '#0a080c', hemi: 1.1, key: '#b0a8c8', keyI: 0.55,
    },
  },
  JADE: {
    grade: { tint: '#f4fbf6', sat: 0.95, bloom: 1.0 },
    wall: { style: 'carved', base: '#3e4a44', detail: '#2e5a40', roughness: 0.88, metalness: 0 },
    floor: { style: 'flagstones', base: '#36403a', detail: '#2a4a38', roughness: 0.85 },
    rubble: '#38413c', water: '#24342e',
    props: { kind: 'lanterns', base: '#2a2a26', accent: '#dfe8d4', density: 0.1 },
    weather: { kind: 'mist', color: '#c8d4cc', rate: [0.4, 0.9], size: 1.8, speed: 0.05, slant: 0.1 },
    dusk: {
      zenith: '#1a2620', horizon: '#3e4a44', clouds: 0.3, cloud: '#2e3a34', stars: 0,
      body: { kind: 'sun', az: 230, elev: 10, color: '#e0f0d8', size: 0.045, glow: 0.35 },
      hemiSky: '#a8c0b0', hemiGround: '#141a16', hemi: 1.8, key: '#e0ecd8', keyI: 1.6,
    },
    night: {
      zenith: '#050a08', horizon: '#141e1a', clouds: 0.25, cloud: '#101814', stars: 0.5,
      body: { kind: 'moon', az: 110, elev: 32, color: '#d0e0d8', size: 0.055, glow: 0.2 },
      body2: { az: 140, elev: 22, color: '#c8d0e8', size: 0.035, glow: 0.14 },
      hemiSky: '#5a6a64', hemiGround: '#060908', hemi: 1.1, key: '#a0b8b0', keyI: 0.6,
    },
  },
  SOLAR: {
    grade: { tint: '#fffaf0', sat: 1.05, gain: 1.04, bloom: 0.9 },
    wall: { style: 'sandstone', base: '#5a5249', detail: '#7a6a54', roughness: 0.9, metalness: 0 },
    floor: { style: 'paving', base: '#4f4840', detail: '#6a5c48', roughness: 0.85 },
    rubble: '#504840', water: '#2a3a40',
    props: { kind: 'awnings', base: '#3a3530', accent: '#3d6a9a', second: '#d8d4c8', density: 0.14 },
    weather: { kind: 'haze', color: '#e8dcc0', rate: [0.3, 0.6], size: 0.08, speed: 0.25, slant: 0.5 },
    dusk: {
      zenith: '#3a4660', horizon: '#9a9488', clouds: 0.15, cloud: '#8a8478', stars: 0,
      body: { kind: 'sun', az: 245, elev: 14, color: '#fff0d0', size: 0.22, glow: 0.9 },
      hemiSky: '#e8dcc8', hemiGround: '#2a241c', hemi: 2.2, key: '#fff0d8', keyI: 2.6,
    },
    night: {
      zenith: '#080a14', horizon: '#1e1c1a', clouds: 0.1, cloud: '#141310', stars: 0.8,
      body: { kind: 'moon', az: 120, elev: 36, color: '#e0d8c8', size: 0.03, glow: 0.12 },
      hemiSky: '#6a6a74', hemiGround: '#0a0908', hemi: 1.1, key: '#b8b0a0', keyI: 0.55,
    },
  },
  COBALT: {
    grade: { tint: '#f2f6ff', sat: 0.95, bloom: 1.1 },
    allNight: true,
    wall: { style: 'alloy', base: '#3a4250', detail: '#5a6a80', roughness: 0.45, metalness: 0.6 },
    floor: { style: 'plates', base: '#30353e', detail: '#22262c', roughness: 0.6 },
    rubble: '#363c46', water: '#1e2836',
    props: { kind: 'antennas', base: '#4a505a', accent: '#9ab0d0', density: 0.12 },
    weather: null,
    dusk: {
      zenith: '#0c1020', horizon: '#26304a', clouds: 0.2, cloud: '#1a2236', stars: 0.5,
      body: { kind: 'moon', az: 115, elev: 25, color: '#c8d4f0', size: 0.025, glow: 0.15 },
      ship: 0.6,
      hemiSky: '#7a8ab0', hemiGround: '#0c0e14', hemi: 1.5, key: '#a8b8e0', keyI: 0.9,
    },
    night: {
      zenith: '#04060c', horizon: '#121828', clouds: 0.15, cloud: '#0c1220', stars: 0.75,
      body: { kind: 'moon', az: 140, elev: 40, color: '#c8d4f0', size: 0.025, glow: 0.12 },
      ship: 1.0,
      hemiSky: '#5a6890', hemiGround: '#05060a', hemi: 1.05, key: '#98a8d8', keyI: 0.5,
    },
  },
};

/**
 * N4.4 PROTOTYPE: the first district of every belt in its own style (art/hdstyles.js),
 * built from the model kit (art/kit.js, art/kitbuild.js). Builds 38-40 tried a smog
 * horror look on district 1, build 41 daylight; the user kept build 41's craft and asked
 * for a sombre look that changes completely from belt to belt (3D build 42, R72). Once a
 * belt's first district is approved it is carried to the rest of the belt.
 */
export const HD_DISTRICTS = Object.freeze([1, 11, 21, 31, 41, 51, 61, 71, 81, 91]);
/** what every belt's style shares: the torch in your hand */
const HD_TORCH = Object.freeze({ color: '#ffe8c8', intensity: 20, angle: 0.38, penumbra: 0.7, distance: 32, decay: 1.15 });

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
  // the sun sets over the first half of the belt; the moon has risen by the second. A
  // belt that is always night (VIOLET, COBALT) keeps one moon climbing all the way.
  const body = def.allNight
    ? { ...a.body, az: lerp(a.body.az, b.body.az, t), elev: lerp(a.body.elev, b.body.elev, t), glow: lerp(a.body.glow, b.body.glow, t) }
    : t < 0.5
      ? { ...a.body, elev: lerp(a.body.elev, -2, t * 2), glow: a.body.glow * (1 - t) }
      : { ...b.body, elev: lerp(b.body.elev * 0.6, b.body.elev, (t - 0.5) * 2) };
  const beam = a.beam ? { ...a.beam, strength: lerp(0.35, 1, t) } : null;
  // JADE's second moon rises with the first; VIOLET's aurora and COBALT's ship grow by midnight
  const body2 = b.body2 && t >= 0.5 ? { ...b.body2, elev: lerp(b.body2.elev * 0.5, b.body2.elev, (t - 0.5) * 2) } : null;
  const aurora = a.aurora ? { a: a.aurora.a, b: a.aurora.b, strength: lerp(a.aurora.strength, b.aurora.strength, t) } : null;
  const ship = a.ship != null ? lerp(a.ship, b.ship, t) : 0;
  return {
    belt, name: BELT_NAMES[belt], k, t, styled: true, allNight: !!def.allNight,
    grade: def.grade || null,
    wall: def.wall, floor: def.floor, rubble: def.rubble, water: def.water, props: def.props,
    weather: def.weather ? { ...def.weather, rate: lerp(def.weather.rate[0], def.weather.rate[1], t) } : null,
    sky: {
      zenith: mixHex(a.zenith, b.zenith, t), horizon: mixHex(a.horizon, b.horizon, t),
      clouds: lerp(a.clouds, b.clouds, t), cloud: mixHex(a.cloud, b.cloud, t),
      stars: lerp(a.stars, b.stars, t), canopy: lerp(a.canopy || 0, b.canopy || 0, t),
      body, beam, body2, aurora, ship,
    },
    light: {
      hemiSky: mixHex(a.hemiSky, b.hemiSky, t), hemiGround: mixHex(a.hemiGround, b.hemiGround, t),
      hemi: lerp(a.hemi, b.hemi, t),
      key: t < 0.5 ? mixHex(a.key, b.key, t) : mixHex(a.key, b.key, t),
      keyI: lerp(a.keyI, b.keyI, t), keyAz: body.az, keyElev: Math.max(6, body.elev),
    },
    fog: { color: mixHex(a.horizon, b.horizon, t) },
    ...(HD_DISTRICTS.includes(district) && HD_STYLES[BELT_NAMES[belt]] ? hdOverrides(HD_STYLES[BELT_NAMES[belt]], a) : {}),
  };
}

/**
 * A belt's first district in its own style (art/hdstyles.js). The drawn-sky fields keep
 * the shape art/sky.js wants; a photographed sky keeps a stand-in gradient from its haze.
 * `light` keeps the old keys for the fallbacks; world.js lightScene reads `hd` itself.
 */
function hdOverrides(H, dusk) {
  const P = H.sky.proc;
  const sun = H.sun || H.moonLight;
  const az = sun ? (Math.atan2(sun.dir[0], -sun.dir[2]) * 180) / Math.PI : 250;
  const elev = sun ? (Math.asin(sun.dir[1]) * 180) / Math.PI : -10;
  return {
    hd: {
      ...H,
      torch: HD_TORCH,
      lamp: { color: H.lamps?.color ?? '#ffb46b', intensity: H.lamps?.intensity ?? 10, distance: H.lamps?.distance ?? 12 },
    },
    sky: P ? { ...P } : {
      zenith: H.fog.color, horizon: H.fog.color, clouds: 0, cloud: H.fog.color, stars: 0, canopy: 0,
      body: { kind: elev > 0 ? 'sun' : 'moon', az, elev, color: '#000000', size: 0, glow: 0 }, beam: null, body2: null, aurora: null, ship: 0,
    },
    light: {
      hemiSky: H.hemi?.sky ?? dusk.hemiSky, hemiGround: H.hemi?.ground ?? dusk.hemiGround, hemi: H.hemi?.i ?? 0.2,
      key: sun?.color ?? '#000000', keyI: sun?.intensity ?? 0, keyAz: az, keyElev: Math.max(2, elev),
    },
    fog: { color: H.fog.color, near: H.fog.near, far: H.fog.far },
    grade: H.grade,
    weather: H.weather || null,
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
  tenements: { walls: ['brick', 'brickDoor'], floor: 'cobbles', height: 5.4, wallTint: '#3f2720', floorTint: '#38332f', mix: 0.55, rough: [0.9, 0.85] },
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
  if (art.sky.aurora) out.push(['aurora', art.sky.aurora.a], ['aurora', art.sky.aurora.b]);
  // build 42: a belt's first district in its own style: its facades, brick, fog and haze
  if (art.hd) {
    const T = art.hd.town || {};
    for (const c of T.palette || []) out.push(['facade', c]);
    for (const c of T.brick || []) out.push(['brick', c]);
    if (art.hd.sky?.haze) out.push(['haze', art.hd.sky.haze]);
    if (art.hd.ground?.tint) out.push(['ground tint', art.hd.ground.tint]);
  }
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
