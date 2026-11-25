// web3d/world.js -- level -> meshes. Browser only.
//
// Everything here is built from primitives and canvas-drawn textures at load: no model
// files, no image files, the same rule as the 2D board. Every irregular thing -- rubble
// heaps, wall wear, floor variation -- draws from a seeded Rng keyed on the level and the
// cell, so a district looks identical every time it is entered. Nothing calls Math.random.
//
// Instanced per tile type, so a district is about a dozen draw calls however it is laid
// out (the budget is 150).
//
// The ten belt palettes are the 2D game's (web/themes.js). They were tuned as dark,
// low-chroma grounds for a top-down board; under 3D lighting the same albedos read as
// near-black, so each colour keeps its hue and is lifted to a floor lightness here.

import * as THREE from 'three';
import { TILE } from '../sim/grid.js';
import { Rng, hashString } from '../sim/prng.js';
import { themeFor } from '../web/themes.js';
import { WALL_M, RUBBLE_MIN_M, RUBBLE_MAX_M } from '../sim3d/units.js';
import { worldSeed, rubbleRng, rubblePeak } from '../sim3d/solid.js';
import { artFor, depthOf, beltOf, placeLook, PLACE_TYPE_ORDER, mixHex } from './art/belts.js';
import { surfaceTextures, styleCanvases } from './art/textures.js';
import { PLACE_PATTERNS } from './art/places.js';
import './art/beltstyles.js';   // registers belts 4-10's surfaces (N4.3)
import { layerTextures, layeredMaterial, setLayers, patchDark } from './art/layered.js';
import { buildSigns } from './art/signs.js';
import { buildLandmarks } from './art/landmarks.js';
import { buildHD, grimeTexture } from './art/hd.js';
import { makePhotoSky } from './art/daylight.js';
import { planBuildings, buildBuildings, surface } from './art/buildings.js';
import { planKit, buildKitBuildings } from './art/kitbuild.js';
import { buildKitGround } from './art/ground.js';
import { cullDetail } from './art/kit.js';
import { buildProps } from './art/props.js';
import { makeSky, skyDir } from './art/sky.js';
import { makeWeather } from './art/weather.js';

/**
 * Fog: clear to FOG_NEAR, solid colour from FOG_FAR on. The camera's far plane sits just
 * past FOG_FAR (scene.js), so nothing that could still be seen is ever clipped: three's
 * fog is by view depth, and so is the far plane.
 */
export const FOG_NEAR = 26;
export const FOG_FAR = 90;

/**
 * Render chunks (N8.4): every instanced layer is cut into squares of CHUNK_M metres, each
 * its own InstancedMesh with its own bounds, so three's frustum culling -- which tests one
 * bounding sphere per mesh -- skips whatever is behind you or past the fog. One mesh per
 * tile type for the whole district is never culled at all. (32 cells until build 45,
 * when a cell grew to 2.5 m: kept at 48 m so the culling stays as fine.)
 */
export const CHUNK_M = 48;

/** The shadow box that follows you: half its width in metres (N8.4). */
export const SHADOW_HALF_M = 45;

/** Split an instanced layer into per-chunk meshes sharing its geometry and material. */
function chunked(mesh, cellM, track = (x) => x) {
  const size = Math.max(1, Math.round(CHUNK_M / cellM)) * cellM;
  const buckets = new Map();
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    const key = Math.floor(m.elements[12] / size) + Math.floor(m.elements[14] / size) * 4096;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(i);
  }
  const out = [];
  const c = new THREE.Color();
  const layer = mesh.geometry.getAttribute('aLayer');
  for (const idx of buckets.values()) {
    let geo = mesh.geometry;
    if (layer) {
      // N4.2: each part needs its own slice of the per-instance layer; the shape is shared
      geo = track(new THREE.BufferGeometry());
      geo.setIndex(mesh.geometry.index);
      for (const [k, a] of Object.entries(mesh.geometry.attributes)) if (k !== 'aLayer') geo.setAttribute(k, a);
      geo.setAttribute('aLayer', new THREE.InstancedBufferAttribute(Float32Array.from(idx, (src) => layer.getX(src)), 1));
    }
    const part = new THREE.InstancedMesh(geo, mesh.material, idx.length);
    idx.forEach((src, j) => {
      mesh.getMatrixAt(src, m);
      part.setMatrixAt(j, m);
      if (mesh.instanceColor) { mesh.getColorAt(src, c); part.setColorAt(j, c); }
    });
    part.castShadow = mesh.castShadow;
    part.receiveShadow = mesh.receiveShadow;
    part.renderOrder = mesh.renderOrder;
    part.name = mesh.name;
    part.computeBoundingSphere();
    out.push(part);
  }
  mesh.dispose();
  return out;
}

/** Keep the hue, lift the lightness to at least `minL`, optionally saturate. */
export function lift(hex, minL, satMul = 1) {
  // In sRGB terms, the space the palettes were picked in. three.js's default for HSL is
  // its linear working space, where these dark grounds have a lightness near 0.04 and a
  // "lift" lands twice as bright as intended -- the first belt check came out pastel.
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h, Math.min(1, hsl.s * satMul), Math.max(minL, hsl.l), THREE.SRGBColorSpace);
  return c;
}

/** 3D palette for a district, derived from its 2D belt palette. */
export function palette3d(district) {
  const th = themeFor(district);
  const t = th.terrain;
  const horizon = lift(th.tint, 0.22, 1.2).lerp(new THREE.Color(th.accent), 0.12);
  return {
    name: th.name,
    accent: new THREE.Color(th.accent),
    ground: lift(t.ground, 0.3),
    groundAlt: lift(t.groundAlt, 0.33),
    wall: lift(t.wallEdge, 0.24, 1.1),
    wallCap: lift(t.wallEdge, 0.4, 1.15),
    rubble: lift(t.building, 0.22, 1.25),
    rubbleTop: lift(t.buildingTop, 0.32, 1.25),
    water: lift(t.water, 0.34, 1.3),
    waterDeep: lift(t.waterDeep, 0.24, 1.3),
    horizon,
    zenith: horizon.clone().multiplyScalar(0.35),
  };
}

/**
 * The art of a belt N4 has not yet directed: its 2D palette, with the same sky, light and
 * dusk-to-midnight progression as the art-directed belts (art/belts.js), and no weather.
 */
export function fallbackArt(district, pal) {
  const k = depthOf(district), t = k / 9;
  const hex = (c) => `#${c.getHexString()}`;
  const horizon = pal.horizon.clone().lerp(pal.horizon.clone().multiplyScalar(0.38), t);
  const zenith = pal.zenith.clone().lerp(pal.zenith.clone().multiplyScalar(0.25), t);
  const body = t < 0.5
    ? { kind: 'sun', az: 250, elev: 10 - 12 * t * 2, color: '#ffe4c4', size: 0.05, glow: 0.4 * (1 - t) }
    : { kind: 'moon', az: 115, elev: 22 + 14 * (t - 0.5) * 2, color: '#d0d8ea', size: 0.022, glow: 0.12 };
  const white = new THREE.Color(0xffffff), moonSky = new THREE.Color('#5f6a86'), cool = new THREE.Color('#a9b8d8');
  return {
    belt: beltOf(district), name: pal.name, k, t, styled: false,
    wall: null, floor: null, rubble: null, props: null, weather: null,
    sky: {
      zenith: hex(zenith), horizon: hex(horizon), clouds: 0.3, cloud: hex(horizon.clone().lerp(zenith, 0.35)),
      stars: t > 0.5 ? (t - 0.5) * 1.2 : 0, canopy: 0, body, beam: null,
    },
    light: {
      hemiSky: hex(pal.horizon.clone().lerp(white, 0.6).lerp(moonSky, t)),
      hemiGround: hex(pal.ground.clone().multiplyScalar(0.6 - 0.4 * t)),
      hemi: 1.9 + (1.1 - 1.9) * t,
      key: hex(new THREE.Color('#fff4e6').lerp(cool, t)), keyI: 2.2 + (0.7 - 2.2) * t,
      keyAz: body.az, keyElev: Math.max(6, body.elev),
    },
    fog: { color: hex(horizon) },
  };
}

// ------------------------------------------------------------------ textures

function canvasTexture(size, draw, { repeat = 1, srgb = true } = {}) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Paving: speckle and a seam on every cell edge, so a cell is legible underfoot. */
function floorTexture(seed) {
  const rng = new Rng(seed, 'floor-tex');
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const v = 200 + rng.int(56);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(rng.int(s), rng.int(s), 1 + rng.int(3), 1 + rng.int(3));
    }
    for (let i = 0; i < 6; i++) {           // hairline cracks
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
      g.beginPath();
      let x = rng.int(s), y = rng.int(s);
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += rng.int(40) - 20; y += rng.int(40) - 20; g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.fillRect(0, 0, s, 3); g.fillRect(0, 0, 3, s);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(0, 3, s, 1); g.fillRect(3, 0, 1, s);
  });
}

/** Concrete panels with grime running down from the top. */
function wallTexture(seed) {
  const rng = new Rng(seed, 'wall-tex');
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1800; i++) {
      const v = 205 + rng.int(50);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(rng.int(s), rng.int(s), 2, 2);
    }
    for (let i = 0; i < 14; i++) {            // streaks
      const x = rng.int(s), len = 30 + rng.int(120);
      const grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, 'rgba(0,0,0,0.22)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x, 0, 2 + rng.int(5), len);
    }
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, s / 2 - 1, s, 2);           // panel joint
    g.fillRect(s - 2, 0, 2, s);
  });
}

/** A slowly scrolling ripple normal map for the water. */
function waterNormal(seed) {
  const rng = new Rng(seed, 'water-tex');
  const tex = canvasTexture(128, (g, s) => {
    const img = g.createImageData(s, s);
    const waves = Array.from({ length: 5 }, () => ({ kx: (rng.int(5) + 1) * 2 * Math.PI / s, ky: (rng.int(5) + 1) * 2 * Math.PI / s, p: rng.float() * 6.28, a: 0.3 + rng.float() * 0.5 }));
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        let nx = 0, ny = 0;
        for (const w of waves) {
          const c = Math.cos(w.kx * x + w.ky * y + w.p) * w.a;
          nx += c * w.kx * 12; ny += c * w.ky * 12;
        }
        const i = (y * s + x) * 4;
        img.data[i] = 128 + nx * 60; img.data[i + 1] = 128 + ny * 60; img.data[i + 2] = 255; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
  return tex;
}

/** Faint horizontal scanlines for the black boxes. */
function scanTexture() {
  return canvasTexture(64, (g, s) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 4) { g.fillStyle = 'rgba(150,170,200,0.35)'; g.fillRect(0, y, s, 1); }
  });
}

// ------------------------------------------------------------------ the world

// the heap heights live in sim3d (units.js, solid.js): the stun gun shoots over them
export { RUBBLE_MIN_M, RUBBLE_MAX_M };

/**
 * @param {object} level   generated level
 * @param {object} o
 * @param {number} o.cellM
 * @param {boolean} [o.shadows]
 */
export function buildWorld(level, { cellM, shadows = false, kit = null }) {
  const { map } = level;
  const pal = palette3d(level.level);
  const seed = worldSeed(level);
  // N4: the belt's art direction (art/belts.js), or one derived from its 2D palette
  const art = artFor(level.level) || fallbackArt(level.level, pal);
  pal.art = art;
  const styled = art.styled;
  const group = new THREE.Group();
  const W = map.w * cellM, H = map.h * cellM;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const disposables = [];
  const track = (...o) => { disposables.push(...o); return o[0]; };

  const cellsOf = (t) => {
    const out = [];
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (map.tiles[y * map.w + x] === t) out.push([x, y]);
    return out;
  };
  const cellRng = (x, y, label) => new Rng(hashString(`${seed}:${label}:${x},${y}`), label);

  // ---- N4.2: which place each cell is in, and what each kind of place is built of. On
  // an art-directed belt's city map every place gets its kind's walls and floor and a
  // shade of its own; the streets between keep the belt's plain look.
  const places = styled && level.places ? level.places : [];
  const placeAt = new Int32Array(map.w * map.h).fill(-1);
  places.forEach((pl, k) => {
    for (let y = Math.max(0, pl.y); y < Math.min(map.h, pl.y + pl.h); y++) for (let x = Math.max(0, pl.x); x < Math.min(map.w, pl.x + pl.w); x++) placeAt[y * map.w + x] = k;
  });
  const looks = places.length ? Object.fromEntries(PLACE_TYPE_ORDER.map((t) => [t, placeLook(art, t)])) : null;
  const lookAt = (x, y) => {
    if (!looks || x < 0 || y < 0 || x >= map.w || y >= map.h) return null;
    const k = placeAt[y * map.w + x];
    return k < 0 ? null : looks[places[k].type];
  };
  const placeTint = places.map((pl) => {
    const r = new Rng(hashString(`${seed}:place:${pl.id}`), 'tint');
    const b = 0.92 + r.float() * 0.14;
    return [b * (0.96 + r.float() * 0.08), b * (0.96 + r.float() * 0.08), b * (0.96 + r.float() * 0.08)];
  });
  const shade = (x, y, wear) => {
    const k = placeAt[y * map.w + x];
    return k < 0 || !places.length ? col.setRGB(wear, wear, wear) : col.setRGB(wear * placeTint[k][0], wear * placeTint[k][1], wear * placeTint[k][2]);
  };
  let wallLayers = null, floorLayers = null;
  if (looks) {
    const lr = (label) => new Rng(hashString(`${seed}:layer:${label}`), label);
    const wl = [{ ...styleCanvases(art.wall, seed, true), rough: art.wall.roughness, metal: art.wall.metalness || 0 }];
    const fl = [{ ...styleCanvases(art.floor, seed, false), rough: art.floor.roughness, metal: 0 }];
    const wIdx = {}, fIdx = {};
    for (const t of PLACE_TYPE_ORDER) {
      const L = looks[t];
      wIdx[t] = L.walls.map((sp) => { wl.push({ ...PLACE_PATTERNS[sp.pattern](lr(`${t}:${sp.pattern}`), sp), rough: sp.rough, metal: sp.metal }); return wl.length - 1; });
      fIdx[t] = fl.length;
      fl.push({ ...PLACE_PATTERNS[L.floor.pattern](lr(`${t}:${L.floor.pattern}`), L.floor), rough: L.floor.rough, metal: 0 });
    }
    wallLayers = { tex: layerTextures(wl), index: wIdx };
    floorLayers = { tex: layerTextures(fl), index: fIdx };
    for (const L of [wallLayers, floorLayers]) track(L.tex.map, L.tex.normal, L.tex.rm, ...(L.tex.emissive ? [L.tex.emissive] : []));
  }
  // N4.4 prototype (district 1): world-space grime on every wall and floor
  const grime = art.hd && wallLayers ? { map: track(grimeTexture(seed)), fine: 1 / 1.7, macro: 1 / 11, strength: 1, tint: '#2a2119' } : null;
  // N4.4 prototype: district 1's solid blocks are cut into separate buildings (art/buildings.js)
  // build 41: with the Poly Haven kit loaded, district 1 is built from it (art/kitbuild.js),
  // every place but the parks
  const plan = art.hd && looks ? planBuildings({ map, lookAt, seed, allPlaces: !!kit }) : null;
  const useKit = !!(plan && kit);
  if (useKit) planKit(plan, seed, art.hd.town);
  const baseHeight = (x, y) => lookAt(x, y)?.height ?? WALL_M;
  /** How tall a wall cell is drawn: its building's height, its place's walls (tenements 5.4 m, depots 4.4 m), else WALL_M. */
  const heightAt = (x, y) => plan?.at(x, y)?.H ?? baseHeight(x, y);

  // ---- floor: one tile per non-wall cell, ground / groundAlt, seams in the texture
  const floorArt = styled ? surfaceTextures(art.floor, seed, false) : null;
  if (floorArt) track(floorArt.map, floorArt.normalMap, ...(floorArt.roughnessMap ? [floorArt.roughnessMap] : []));
  const floorTex = floorArt ? floorArt.map : track(floorTexture(seed));
  const floorCells = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (map.tiles[y * map.w + x] !== TILE.WALL) floorCells.push([x, y]);
  const floorGeo = track(new THREE.PlaneGeometry(cellM, cellM).rotateX(-Math.PI / 2));
  const floorMat = track(floorLayers ? layeredMaterial(floorLayers.tex, grime ? { grime } : {}) : new THREE.MeshStandardMaterial(floorArt
    ? { map: floorTex, normalMap: floorArt.normalMap, roughnessMap: floorArt.roughnessMap, roughness: floorArt.roughnessMap ? 1 : art.floor.roughness, metalness: 0 }
    : { map: floorTex, roughness: 0.92, metalness: 0 }));
  const floor = new THREE.InstancedMesh(floorGeo, floorMat, floorCells.length);
  const yAxis = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  floorCells.forEach(([x, y], i) => {
    const r = cellRng(x, y, 'floor');
    // an art-directed floor texture turns a random quarter per cell, so no two neighbours
    // repeat the same stains (N4.1: the first TIDE floor showed its puddles as a grid)
    if (styled) m4.compose(v.set((x + 0.5) * cellM, 0, (y + 0.5) * cellM), q.setFromAxisAngle(yAxis, r.int(4) * Math.PI / 2), one);
    else m4.makeTranslation((x + 0.5) * cellM, 0, (y + 0.5) * cellM);
    floor.setMatrixAt(i, m4);
    if (styled) floor.setColorAt(i, shade(x, y, 0.86 + r.float() * 0.22));
    else floor.setColorAt(i, col.copy(r.bool(0.5) ? pal.ground : pal.groundAlt).multiplyScalar(0.92 + r.float() * 0.16));
  });
  if (floorLayers) setLayers(floor, floorCells.map(([x, y]) => { const L = lookAt(x, y); return L ? floorLayers.index[L.type] : 0; }));
  floor.receiveShadow = shadows;
  // build 41: district 1's ground is photographed surfaces (art/ground.js), not this
  if (useKit) { floor.dispose(); for (const m of buildKitGround({ map, cellM, seed, lookAt, track, style: { ...art.hd.ground, res: art.hd.res } })) group.add(m); }
  else group.add(floor);

  // ---- walls: body + a lighter cap, per-instance wear. A wall cell with wall on all four
  // sides shows no face to anyone at street level, so it gets a cap (the killcam looks
  // down on the roofs) but no body: on a city map that is about a third of all walls.
  const isWall = (x, y) => x < 0 || y < 0 || x >= map.w || y >= map.h || map.tiles[y * map.w + x] === TILE.WALL;
  // (N4.4: in district 1 a building's cells are drawn by art/buildings.js, not here)
  const walls = cellsOf(TILE.WALL).filter(([x, y]) => !plan?.at(x, y));
  // (N4.2: walls differ in height, so a neighbour covers a face only if it is as tall)
  const covers = (x, y, hgt) => isWall(x, y) && heightAt(x, y) >= hgt;
  const faced = walls.filter(([x, y]) => {
    const hh = heightAt(x, y);
    return !covers(x - 1, y, hh) || !covers(x + 1, y, hh) || !covers(x, y - 1, hh) || !covers(x, y + 1, hh);
  });
  const wallArt = styled ? surfaceTextures(art.wall, seed, true) : null;
  if (wallArt) track(wallArt.map, wallArt.normalMap, ...(wallArt.roughnessMap ? [wallArt.roughnessMap] : []));
  const wallTex = wallArt ? wallArt.map : track(wallTexture(seed));
  const wallGeo = track(new THREE.BoxGeometry(cellM, WALL_M, cellM));
  // tenement windows glow faintly at dusk and plainly by midnight
  const wallMat = track(wallLayers ? layeredMaterial(wallLayers.tex, { emissiveIntensity: 0.18 + 0.62 * art.t, ...(grime ? { grime } : {}) }) : new THREE.MeshStandardMaterial(wallArt
    ? { map: wallTex, normalMap: wallArt.normalMap, roughnessMap: wallArt.roughnessMap, roughness: wallArt.roughnessMap ? 1 : art.wall.roughness, metalness: art.wall.metalness }
    : { map: wallTex, roughness: 0.88 }));
  const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, Math.max(1, faced.length));
  wallMesh.count = faced.length;
  const capGeo = track(new THREE.BoxGeometry(cellM * 1.02, 0.12, cellM * 1.02));
  const capMat = track(new THREE.MeshStandardMaterial({
    color: looks ? 0xffffff : styled ? new THREE.Color(art.wall.base).lerp(new THREE.Color(0xffffff), 0.12) : pal.wallCap, roughness: 0.7,
  }));
  const capMesh = new THREE.InstancedMesh(capGeo, capMat, walls.length);
  const wallLayerIdx = [];
  faced.forEach(([x, y], i) => {
    const r = cellRng(x, y, 'wall');
    const hh = heightAt(x, y);
    m4.compose(v.set((x + 0.5) * cellM, hh / 2, (y + 0.5) * cellM), q.identity(), sc.set(1, hh / WALL_M, 1));
    wallMesh.setMatrixAt(i, m4);
    if (styled) wallMesh.setColorAt(i, shade(x, y, 0.84 + r.float() * 0.24));
    else wallMesh.setColorAt(i, col.copy(pal.wall).multiplyScalar(0.88 + r.float() * 0.24));
    if (wallLayers) {
      // a place with two wall patterns (a door, a loading bay) shows the second on some cells
      const L = lookAt(x, y), opts = L ? wallLayers.index[L.type] : [0];
      wallLayerIdx.push(opts.length > 1 && r.float() < 0.3 ? opts[1] : opts[0]);
    }
  });
  if (wallLayers) setLayers(wallMesh, wallLayerIdx);
  const wallLayerAt = new Map();
  if (wallLayers) faced.forEach(([x, y], i) => wallLayerAt.set(y * map.w + x, wallLayerIdx[i]));
  const doorAt = (x, y) => !!wallLayers && wallLayerAt.get(y * map.w + x) === wallLayers.index.tenements[1];
  const white = new THREE.Color(0xffffff), tar = new THREE.Color('#262422');
  walls.forEach(([x, y], i) => {
    m4.makeTranslation((x + 0.5) * cellM, heightAt(x, y) + 0.06, (y + 0.5) * cellM);
    capMesh.setMatrixAt(i, m4);
    if (looks) { const L = lookAt(x, y); capMesh.setColorAt(i, L ? col.set(L.walls[0].base).lerp(tar, L.type === 'park' ? 0 : 0.45) : col.set(art.wall.base).lerp(white, 0.12)); }
  });
  wallMesh.castShadow = wallMesh.receiveShadow = shadows;
  group.add(wallMesh, capMesh);

  // ---- rubble: a seeded heap of 5-8 tumbled blocks per building cell
  const rubbleCells = cellsOf(TILE.BUILDING);
  const blocks = [];
  for (const [x, y] of rubbleCells) {
    // the same Rng and first draw as solid.js, so the heap is as tall as the sim thinks
    const r = rubbleRng(seed, x, y);
    const peak = rubblePeak(r);
    // N4.2: a yard's rubble is containers and crates, a market's is its stalls -- each
    // still exactly as tall as the heap the sim knows (solid.js), so shots agree
    const L = lookAt(x, y);
    if (L?.goods && (L.type === 'yards' || L.type === 'market')) {
      const cxm = (x + 0.5) * cellM, czm = (y + 0.5) * cellM, g = L.goods;
      if (L.type === 'yards') {
        blocks.push({ x: cxm, z: czm, sx: 0.94 * cellM, sy: peak, sz: 0.62 * cellM, ry: (r.bool(0.5) ? 0 : Math.PI / 2) + (r.float() - 0.5) * 0.08, tilt: 0, colour: g[r.int(g.length)], shade: 0.85 + r.float() * 0.25 });
        for (let k = 1 + r.int(3); k > 0; k--) {
          const e = (0.26 + r.float() * 0.16) * cellM;
          blocks.push({ x: cxm + (r.float() - 0.5) * 0.7 * cellM, z: czm + (r.float() - 0.5) * 0.7 * cellM, sx: e, sy: Math.min(peak, e), sz: e, ry: r.float() * Math.PI, tilt: 0, colour: g[r.int(g.length)], shade: 0.7 + r.float() * 0.3 });
        }
      } else {
        const c = g[r.int(g.length)];
        blocks.push({ x: cxm, z: czm, sx: 0.88 * cellM, sy: peak - 0.07, sz: 0.88 * cellM, ry: 0, tilt: 0, colour: c, shade: 0.8 + r.float() * 0.2 });
        blocks.push({ x: cxm, z: czm, y0: peak - 0.07, sx: 1.06 * cellM, sy: 0.07, sz: 1.06 * cellM, ry: 0, tilt: 0.06, colour: mixHex(c, '#c9c4b8', 0.35), shade: 1 });
      }
      continue;
    }
    const scorch = L?.type === 'ruins';
    const n = 5 + r.int(4);
    for (let k = 0; k < n; k++) {
      const big = k === 0;
      const sx = (big ? 0.7 : 0.25 + r.float() * 0.4) * cellM;
      const sz = (big ? 0.7 : 0.25 + r.float() * 0.4) * cellM;
      const sy = big ? peak : 0.2 + r.float() * peak * 0.6;
      blocks.push({
        x: (x + 0.5 + (big ? 0 : (r.float() - 0.5) * 0.7)) * cellM,
        z: (y + 0.5 + (big ? 0 : (r.float() - 0.5) * 0.7)) * cellM,
        sx, sy, sz, big, ruin: scorch,
        ry: r.float() * Math.PI,
        tilt: big ? (r.float() - 0.5) * 0.15 : (r.float() - 0.5) * 0.7,
        top: k === 0 || r.bool(0.4),
        shade: (0.85 + r.float() * 0.3) * (scorch ? 0.6 : 1),
      });
    }
  }
  const rubbleGeo = track(new THREE.BoxGeometry(1, 1, 1));
  // (build 42: in a model-kit district the heaps are broken concrete, photographed)
  const rubbleMat = track(useKit
    ? new THREE.MeshStandardMaterial({ ...surface('Concrete042C'), roughness: 1, color: '#b8b4ae' })
    : new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.97, flatShading: true }));
  // N4.3: with places, each heap's biggest block is what is left of a building front --
  // the ground storey of a tenement, or a burnt shell in the ruins -- still the heap's height
  const fronts = wallLayers ? blocks.filter((b) => !b.colour && b.big) : [];
  const heaps = blocks.filter((b) => !b.colour && !(wallLayers && b.big)), goods = blocks.filter((b) => b.colour);
  const rubble = new THREE.InstancedMesh(rubbleGeo, rubbleMat, Math.max(1, heaps.length));
  rubble.count = heaps.length;
  heaps.forEach((b, i) => {
    q.setFromEuler(new THREE.Euler(b.tilt, b.ry, b.tilt * 0.5));
    m4.compose(v.set(b.x, b.sy / 2 - 0.05, b.z), q, sc.set(b.sx, b.sy, b.sz));
    rubble.setMatrixAt(i, m4);
    if (useKit) rubble.setColorAt(i, col.setRGB(0.8, 0.8, 0.8).multiplyScalar(b.top ? b.shade * 1.1 : b.shade * 0.85));
    else if (styled) rubble.setColorAt(i, col.set(art.rubble).multiplyScalar(b.top ? b.shade * 1.3 : b.shade));
    else rubble.setColorAt(i, col.copy(b.top ? pal.rubbleTop : pal.rubble).multiplyScalar(b.shade));
  });
  rubble.castShadow = rubble.receiveShadow = shadows;
  group.add(rubble);
  if (fronts.length) {
    // a unit box showing the lower 42 % and middle 70 % of a wall texture: one storey, a window or a door
    const fg = track(new THREE.BoxGeometry(1, 1, 1));
    const uv = fg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.15 + uv.getX(i) * 0.7, uv.getY(i) * 0.42);
    const frontMesh = new THREE.InstancedMesh(fg, wallMat, fronts.length);
    const tl = wallLayers.index.tenements, rl = wallLayers.index.ruins;
    fronts.forEach((b, i) => {
      q.setFromEuler(new THREE.Euler(b.tilt, b.ry, b.tilt * 0.5));
      m4.compose(v.set(b.x, b.sy / 2 - 0.05, b.z), q, sc.set(b.sx, b.sy, b.sz));
      frontMesh.setMatrixAt(i, m4);
      frontMesh.setColorAt(i, col.setRGB(1, 1, 1).multiplyScalar(b.shade * (b.ruin ? 0.7 : 0.95)));
    });
    setLayers(frontMesh, fronts.map((b, i) => (b.ruin ? rl[0] : tl[i % tl.length])));
    frontMesh.castShadow = frontMesh.receiveShadow = shadows;
    frontMesh.userData.whole = true;
    group.add(frontMesh);
  }
  // N4.2: containers, crates and stalls, in their own colours over a light ribbed skin
  if (goods.length) {
    const skin = track(canvasTexture(128, (g, n) => {
      g.fillStyle = '#d8d8d4'; g.fillRect(0, 0, n, n);
      for (let x = 0; x < n; x += 8) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, 0, 2, n); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 3, 0, 1, n); }
      const r = new Rng(seed, 'goods');
      for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(30,20,10,${0.05 + r.float() * 0.15})`; g.fillRect(r.int(n), r.int(n), 1 + r.int(3), 1 + r.int(8)); }
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, n, 3); g.fillRect(0, n - 3, n, 3);
    }));
    const goodsMesh = new THREE.InstancedMesh(rubbleGeo, track(new THREE.MeshStandardMaterial({ map: skin, roughness: 0.7, metalness: 0.25 })), goods.length);
    goods.forEach((b, i) => {
      q.setFromEuler(new THREE.Euler(b.tilt, b.ry, 0));
      m4.compose(v.set(b.x, (b.y0 || 0) + b.sy / 2 - 0.05, b.z), q, sc.set(b.sx, b.sy, b.sz));
      goodsMesh.setMatrixAt(i, m4);
      goodsMesh.setColorAt(i, col.set(b.colour).multiplyScalar(b.shade * 1.25));
    });
    goodsMesh.castShadow = goodsMesh.receiveShadow = shadows;
    goodsMesh.userData.whole = true;
    group.add(goodsMesh);
  }

  // ---- water: a shallow sheet with a scrolling ripple normal map
  const waterCells = cellsOf(TILE.COVER);
  const waterNorm = track(waterNormal(seed));
  const waterGeo = track(new THREE.PlaneGeometry(cellM, cellM).rotateX(-Math.PI / 2));
  // (build 41: under district 1's daylight, standing water is a dark mirror of the sky)
  const waterMat = track(new THREE.MeshStandardMaterial(useKit
    ? { color: '#0c1012', roughness: 0.3, envMapIntensity: 0.4, metalness: 0.0, transparent: true, opacity: 0.92, alphaMap: track(puddleShape(seed)), depthWrite: false }   // (build 43: an uneven edge, not a tile; no ripple map -- its stripes showed in the mirror)
    : {
      color: styled ? new THREE.Color(art.water) : pal.water, roughness: styled ? 0.34 : 0.08, metalness: 0.15, normalMap: waterNorm,
      normalScale: styled ? new THREE.Vector2(0.28, 0.28) : new THREE.Vector2(0.6, 0.6), transparent: true, opacity: 0.86,
    }));
  const water = new THREE.InstancedMesh(waterGeo, waterMat, Math.max(1, waterCells.length));
  water.count = waterCells.length;
  waterCells.forEach(([x, y], i) => {
    // like the floor, a quarter turn per cell on an art-directed belt, so the ripples do
    // not tile into a quilt under a low sun
    if (styled) m4.compose(v.set((x + 0.5) * cellM, 0.05, (y + 0.5) * cellM), q.setFromAxisAngle(yAxis, cellRng(x, y, 'water').int(4) * Math.PI / 2), one);
    else m4.makeTranslation((x + 0.5) * cellM, 0.05, (y + 0.5) * cellM);
    water.setMatrixAt(i, m4);
  });
  group.add(water);

  // ---- black boxes: translucent dark cubes, scanlines, faint edges
  const safeCells = cellsOf(TILE.SAFE);
  const scan = track(scanTexture());
  scan.repeat.set(1, 8);
  const safeGeo = track(new THREE.BoxGeometry(cellM, WALL_M, cellM));
  const safeMat = track(new THREE.MeshStandardMaterial({
    color: 0x05060a, emissive: 0x8fa6c8, emissiveMap: scan, emissiveIntensity: 0.18,
    transparent: true, opacity: 0.72, roughness: 0.3, depthWrite: false, side: THREE.DoubleSide,
  }));
  const safe = new THREE.InstancedMesh(safeGeo, safeMat, Math.max(1, safeCells.length));
  safe.count = safeCells.length;
  safe.renderOrder = 3;
  const edgePos = [];
  const edges = new THREE.EdgesGeometry(safeGeo);
  const ep = edges.attributes.position.array;
  safeCells.forEach(([x, y], i) => {
    m4.makeTranslation((x + 0.5) * cellM, WALL_M / 2, (y + 0.5) * cellM);
    safe.setMatrixAt(i, m4);
    for (let k = 0; k < ep.length; k += 3) edgePos.push(ep[k] + (x + 0.5) * cellM, ep[k + 1] + WALL_M / 2, ep[k + 2] + (y + 0.5) * cellM);
  });
  edges.dispose();
  group.add(safe);
  if (edgePos.length) {
    const eg = track(new THREE.BufferGeometry());
    eg.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
    group.add(new THREE.LineSegments(eg, track(new THREE.LineBasicMaterial({ color: 0xb4c4d6, transparent: true, opacity: 0.35 }))));
  }

  // ---- N4.2: a park's lone wall cells are trees: a crown of leaves on the clipped trunk
  if (looks && !useKit) {
    const crowns = walls.filter(([x, y]) => lookAt(x, y)?.type === 'park' && !isWall(x - 1, y) && !isWall(x + 1, y) && !isWall(x, y - 1) && !isWall(x, y + 1));
    if (crowns.length) {
      const leaf = looks.park.walls[0];
      const crown = new THREE.InstancedMesh(track(new THREE.IcosahedronGeometry(1, 1)), track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true })), crowns.length);
      crowns.forEach(([x, y], i) => {
        const r = cellRng(x, y, 'crown');
        const k = 1.15 + r.float() * 0.5;
        m4.compose(v.set((x + 0.5) * cellM, WALL_M + k * 0.45, (y + 0.5) * cellM), q.setFromAxisAngle(yAxis, r.float() * 6.28), sc.set(k, k * (0.7 + r.float() * 0.3), k));
        crown.setMatrixAt(i, m4);
        crown.setColorAt(i, col.set(leaf.base).lerp(new THREE.Color('#4f6b34'), 0.35 + r.float() * 0.3).multiplyScalar(1.3 + r.float() * 0.4));
      });
      crown.castShadow = crown.receiveShadow = shadows;
      crown.userData.whole = true;
      group.add(crown);
    }
  }

  // ---- the belt's props on the walls (N4.1), chunked with the rest; not on a park's
  // hedges or a plaza's monuments, and hung from each wall's real top
  for (const prop of buildProps(level, art, cellM, seed, track, {
    heightAt, skip: (x, y) => { const t = lookAt(x, y)?.type; return t === 'park' || t === 'plaza' || !!plan?.at(x, y); },
  })) group.add(prop);
  // ---- N4.2: every place's name at its gates, and the wall art on the street walls
  // ---- N4.3: a centrepiece on every plaza, and one skyline landmark per district
  if (looks) for (const m of buildLandmarks(level, { cellM, seed, art, looks, heightAt, track })) group.add(m);
  // ---- N4.4 prototype: the detail layer (art/hd.js) and the lamps the torch scene lights
  pal.hdLamps = [];
  let obstacles = [], faceUse = null;
  if (art.hd && looks) {
    const hd = buildHD(level, { cellM, seed, art, lookAt, heightAt, doorAt, track, skip: (x, y) => !!plan?.at(x, y), kit: useKit });
    if (plan && useKit) {
      const kb = buildKitBuildings(plan, { map, cellM, seed, heightAt: baseHeight, kit, track, lookAt, style: art.hd });
      for (const m of kb.meshes) group.add(m);
      pal.hdLamps = kb.lamps;
      obstacles = kb.obstacles;
      faceUse = kb.faceUse;
    } else if (plan) for (const m of buildBuildings(plan, { map, cellM, seed, heightAt: baseHeight, track })) group.add(m);
    for (const m of hd.meshes) group.add(m);
    if (!useKit) pal.hdLamps = hd.lamps;
  }

  // ---- place-name signs (after the buildings: build 44's real plates keep off the kit's
  // doors, tall glazing, downpipes and hedges)
  if (looks) for (const m of buildSigns(level, { cellM, seed, art, lookAt, heightAt, track, wallArt: !plan, real: !!art.hd?.proto?.signs, faceBusy: faceUse ? (x, y, dx, dy) => faceUse.has(`${x},${y},${dx},${dy}`) : null })) group.add(m);

  // ---- cut every instanced layer into chunks (N8.4)
  // (a few small layers -- containers, tree crowns -- cost less drawn whole: one call each)
  for (const ch of group.children) if (ch.isInstancedMesh && ch.userData.whole) ch.computeBoundingSphere();
  const layers = group.children.filter((ch) => ch.isInstancedMesh && !ch.userData.whole);
  let chunkCount = 0;
  for (const layer of layers) {
    group.remove(layer);
    if (layer.count === 0) { layer.dispose(); continue; }
    const parts = chunked(layer, cellM, track);
    chunkCount += parts.length;
    group.add(...parts);
  }

  // ---- beyond the map: a dark apron, and a sky dome in the belt's colours
  const apron = new THREE.Mesh(
    track(new THREE.PlaneGeometry(W * 8, H * 8).rotateX(-Math.PI / 2)),
    track(new THREE.MeshStandardMaterial({ color: pal.wall.clone().multiplyScalar(0.6), roughness: 1 })),
  );
  apron.position.set(W / 2, -0.02, H / 2);
  group.add(apron);

  // N4.1: the belt's sky (art/sky.js), inside the far plane; named 'sky' for the capture
  // (build 41: district 1's sky is a photograph, art/daylight.js)
  const skyDome = art.hd?.sky?.photo ? makePhotoSky(art.hd.sky, (art.fog.far ?? FOG_FAR) * 0.98, track) : makeSky(art.sky, (art.fog.far ?? FOG_FAR) * 0.98, track);
  const sky = skyDome.mesh;
  sky.position.set(W / 2, 0, H / 2);
  group.add(sky);
  // and its weather, round the camera
  const weather = makeWeather(art.weather, seed, track);
  if (weather) group.add(weather.object);
  // build 42, MOSS: a canopy closed over the district at the height of the roofs. The sun
  // comes through its holes, so the street is dark with coins and shafts of light that the
  // shadow map draws (alpha-tested leaves cast alpha-tested shadows)
  if (art.hd?.effects?.canopy) group.add(makeCanopy(art.hd.effects.canopy, W, H, seed, track));

  // ---- N4.4 prototype: how much sky each open cell sees. Walls within 4 cells, weighted by
  // their height and nearness, close it in: an alley between tenements is nearly black, an
  // avenue or a square fully lit. Blurred so the light falls off rather than steps.
  let darkAt = () => 1;
  if (art.hd) {
    const W2 = map.w, H2 = map.h, raw = new Float32Array(W2 * H2);
    if (art.hd.sky) {
      // build 41, daylight: how much of the sky a cell sees (its sky-view factor), from
      // the tallest wall in each of 16 directions within 14 cells. Light from a uniform
      // sky above elevation e is cos^2 e of the whole, so a square sees nearly all of it,
      // a street between four-storey fronts about half, and a one-cell alley between them
      // almost none -- that is where it goes black and the torch is for.
      const dirs = [...Array(16).keys()].map((i) => [Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)]);
      for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
        if (isWall(x, y)) { raw[y * W2 + x] = 0.5; continue; }
        let svf = 0;
        for (const [ux, uy] of dirs) {
          let best = 0;
          for (let d = 0.6; d <= 14; d += 0.5) {
            const cx = Math.floor(x + 0.5 + ux * d), cy = Math.floor(y + 0.5 + uy * d);
            if (cx < 0 || cy < 0 || cx >= W2 || cy >= H2) break;
            if (isWall(cx, cy)) best = Math.max(best, Math.atan2(heightAt(cx, cy) - 1.0, d * cellM));
          }
          svf += Math.cos(best) ** 2;
        }
        svf /= dirs.length;
        const t = Math.max(0, Math.min(1, (svf - 0.1) / 0.42));
        raw[y * W2 + x] = 0.06 + 0.94 * t * t * (3 - 2 * t);
      }
    } else for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      if (isWall(x, y)) { raw[y * W2 + x] = 0.5; continue; }
      let shut = 0;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        if ((dx || dy) && isWall(x + dx, y + dy)) shut += (heightAt(x + dx, y + dy) / 5.4) / (0.6 + Math.hypot(dx, dy));
      }
      raw[y * W2 + x] = Math.max(0.05, Math.min(1, 1.55 - shut / 5.2));
    }
    const blur = (src) => {
      const out = new Float32Array(src.length);
      for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W2 || yy >= H2) continue;
          sum += src[yy * W2 + xx]; n++;
        }
        out[y * W2 + x] = sum / n;
      }
      return out;
    };
    // a wall is as dark as the street it faces
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      if (!isWall(x, y)) continue;
      let sum = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!isWall(x + dx, y + dy) && x + dx >= 0 && y + dy >= 0 && x + dx < W2 && y + dy < H2) { sum += raw[(y + dy) * W2 + x + dx]; n++; }
      raw[y * W2 + x] = n ? sum / n : 0.3;
    }
    const dk = blur(raw);
    const data = new Uint8Array(W2 * H2 * 4);
    for (let i = 0; i < dk.length; i++) { const v = Math.round(dk[i] * 255); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
    const tex = track(new THREE.DataTexture(data, W2, H2));
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const dark = { tex, wM: W2 * cellM, hM: H2 * cellM };
    group.traverse((o) => {
      if (!o.isMesh || o.name === 'sky') return;
      for (const m of [].concat(o.material)) if (m && m.isMeshStandardMaterial) patchDark(m, dark);
    });
    darkAt = (x, y) => (x < 0 || y < 0 || x >= W2 || y >= H2 ? 1 : dk[y * W2 + x]);
  }

  const detailMeshes = group.children.filter((c) => c.isBatchedMesh && c.userData.detailXZ);
  let lastCull = null;
  return {
    group,
    palette: pal,
    /** build 42: the sky dome, for play3d to light a drawn sky's district with (envFromSky) */
    skyMesh: sky,
    /** N4.4: how much sky a cell sees, 0 (black alley) to 1 (open); 1 where there is no map */
    darkAt,
    /** N4.4: district 1's buildings (art/buildings.js planBuildings), or null */
    buildings: plan,
    /**
     * Build 42: the small things on the ground you can catch a foot on -- steps, bins,
     * bags, crates, rubble -- as the nearest one whose footprint (grown by `pad` metres)
     * holds (x, z), or null. Presentation only: the sim walks straight through them.
     */
    obstacleAt: (() => {
      const idx = new Map(), key = (i, j) => i * 65536 + j;
      for (const o of obstacles) {
        const R = o.r + 0.35;   // indexed a little wide, so a padded query finds it from the next cell
        const i0 = Math.floor((o.x - R) / cellM), i1 = Math.floor((o.x + R) / cellM);
        const j0 = Math.floor((o.z - R) / cellM), j1 = Math.floor((o.z + R) / cellM);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); if (!idx.has(k)) idx.set(k, []); idx.get(k).push(o); }
      }
      return (x, z, pad = 0) => {
        let best = null, bd = Infinity;
        for (const o of idx.get(key(Math.floor(x / cellM), Math.floor(z / cellM))) || []) {
          const d = Math.hypot(o.x - x, o.z - z) - o.r - pad;
          if (d < 0 && d < bd) { bd = d; best = o; }
        }
        return best;
      };
    })(),
    chunkCount,
    art,
    /**
     * Per-frame animation: the water drifts, clouds and the lighthouse move, the weather
     * falls round you, and the sky dome stays centred on you (on a city map you can walk
     * 200 m from the middle, outside a dome fixed there). `px` is the canvas height in
     * device pixels, which keeps weather particles their size in metres.
     */
    animate(t, eye = null, px = 1000) {
      // build 42: the kit's small detail near you only, refreshed every 3 m you move
      if (eye && detailMeshes.length && (lastCull == null || Math.hypot(eye.x - lastCull.x, eye.z - lastCull.z) > 3)) {
        lastCull = { x: eye.x, z: eye.z };
        cullDetail(detailMeshes, eye.x, eye.z);
      }
      waterNorm.offset.set(t * 0.03, t * 0.017);
      skyDome.update(t);
      if (eye) sky.position.set(eye.x, 0, eye.z);
      weather?.update(t, eye, px);
    },
    dispose() {
      for (const ch of group.children) if (ch.isInstancedMesh) ch.dispose();
      for (const d of disposables) d.dispose?.();
    },
  };
}

/**
 * Build 43: a puddle's outline -- overlapping soft blobs, so standing water lies in an
 * uneven pool inside its cell instead of filling a square. Still covers most of the
 * cell: a cover cell must read as water.
 */
function puddleShape(seed) {
  const n = 256, cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  const r = new Rng(seed, 'puddle');
  g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
  g.filter = 'blur(5px)';
  g.fillStyle = '#fff';
  // nearly the whole cell, so neighbouring water cells run together into one sheet; the
  // edge is uneven where it frays
  g.fillRect(n * 0.1, n * 0.1, n * 0.8, n * 0.8);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * 6.283 + r.float() * 0.4, d = n * (0.3 + r.float() * 0.12);
    g.beginPath();
    g.ellipse(n / 2 + Math.cos(a) * d, n / 2 + Math.sin(a) * d, n * (0.12 + r.float() * 0.1), n * (0.1 + r.float() * 0.08), r.float() * 3.14, 0, 6.283);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** MOSS's canopy: one big leafy sheet with holes, its own shade from the sun. */
function makeCanopy(c, W, H, seed, track) {
  const n = 512, cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  const r = new Rng(seed, 'canopy');
  g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
  // clusters of single leaves, not blobs: each a few hundred small leaf shapes scattered
  // round a centre, so the holes are big between clusters and fine inside them
  const leaf = (x, y, len, ang, col) => {
    g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col;
    g.beginPath(); g.moveTo(-len, 0); g.quadraticCurveTo(0, -len * 0.42, len, 0); g.quadraticCurveTo(0, len * 0.42, -len, 0); g.fill();
    g.restore();
  };
  const clusters = Math.round(170 * c.cover);
  for (let i = 0; i < clusters; i++) {
    const cx = r.float() * n, cy = r.float() * n, R = 14 + r.float() * 34;
    const count = Math.round(R * R * 0.32);
    for (let j = 0; j < count; j++) {
      const a = r.float() * 6.283, d = R * Math.sqrt(r.float()) * (0.6 + 0.4 * r.float());
      const k = r.float();
      const col = k < 0.55 ? `rgb(${46 + r.int(30)},${70 + r.int(36)},${24 + r.int(20)})` : k < 0.88 ? `rgb(${70 + r.int(30)},${92 + r.int(30)},${30 + r.int(20)})` : `rgb(${98 + r.int(30)},${84 + r.int(24)},${36 + r.int(16)})`;
      for (const [ox, oy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {
        const x = cx + Math.cos(a) * d + ox, y = cy + Math.sin(a) * d + oy;
        if (x < -10 || y < -10 || x > n + 10 || y > n + 10) continue;
        leaf(x, y, 2.2 + r.float() * 3.2, r.float() * 3.14, col);
      }
    }
  }
  const tex = track(new THREE.CanvasTexture(cv));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set((W + 60) / 14, (H + 60) / 14);
  // alpha from brightness: the black between the leaves is open sky
  const alpha = track(tex.clone());
  alpha.colorSpace = THREE.NoColorSpace;
  // seen from under it, a leaf is lit through from above: unlit, and dim
  const mat = track(new THREE.MeshBasicMaterial({ map: tex, alphaMap: alpha, alphaTest: 0.08, side: THREE.DoubleSide, color: new THREE.Color(0.55, 0.62, 0.42) }));
  const mesh = new THREE.Mesh(track(new THREE.PlaneGeometry(W + 60, H + 60).rotateX(-Math.PI / 2)), mat);
  mesh.position.set(W / 2, c.height, H / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.name = 'canopy';
  return mesh;
}

/**
 * Lights and fog for a district, in its belt's colours. With `follow`, the sun's shadow
 * box is SHADOW_HALF_M either side of a point just ahead of you, moved every frame by
 * the returned follow(): one 2048 shadow map stretched over a district-100 city would put
 * 0.22 m in every texel. Without it (the dev pages) the box covers the whole map.
 */
export function lightScene(scene, pal, { cellM, mapW, mapH, shadows = false, follow = false }) {
  const old = scene.getObjectByName('district-lights');
  if (old) scene.remove(old);
  const g = new THREE.Group();
  g.name = 'district-lights';
  // N4.1: the light comes from the belt's art at this depth -- a low warm sun at dusk, a
  // high cool moon by midnight -- from the same direction as the sun or moon in the sky
  const art = pal.art || fallbackArt(1, pal);
  const L = art.light;
  g.add(new THREE.HemisphereLight(new THREE.Color(L.hemiSky), new THREE.Color(L.hemiGround), L.hemi));
  // build 42: a styled district's key light is its own: a sun where its photograph has
  // it, a moon (VIOLET, JADE), or none at all (TIDE's storm, EMBER's smoke, COBALT's hull)
  const hd = art.hd || null;
  const keyDef = hd ? (hd.sun || hd.moonLight || null) : null;
  const day = keyDef;
  const sun = new THREE.DirectionalLight(new THREE.Color(keyDef ? keyDef.color : L.key), hd ? (keyDef ? keyDef.intensity : 0) : L.keyI);
  const toLight = (keyDef ? new THREE.Vector3(...keyDef.dir).normalize() : skyDir(L.keyAz, L.keyElev)).multiplyScalar(keyDef ? 70 : 54);
  const cx = (mapW * cellM) / 2, cz = (mapH * cellM) / 2;
  sun.position.set(cx + toLight.x, toLight.y, cz + toLight.z);
  sun.target.position.set(cx, 0, cz);
  // (build 41: district 1's daylight sun keeps its box tighter -- the shadow pass is a third of the frame)
  const r = follow ? (day ? 32 : SHADOW_HALF_M) : Math.max(mapW, mapH) * cellM * 0.62;
  // (N4.4: under district 1's old smog the sun cast nothing; build 41's daylight sun does)
  if (shadows && (!art.hd || (day && day.shadow))) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: day ? 180 : 140 });
    sun.shadow.bias = day ? -0.0004 : -0.0008;
    if (day) sun.shadow.normalBias = 0.03;
    if (day?.softShadow != null) sun.shadow.intensity = day.softShadow;   // haze lets light into the shade
  }
  g.add(sun, sun.target);
  // JADE: a second moon, a second shadow
  let moon2 = null, toMoon2 = null;
  if (hd?.moon2) {
    moon2 = new THREE.DirectionalLight(new THREE.Color(hd.moon2.color), hd.moon2.intensity);
    toMoon2 = new THREE.Vector3(...hd.moon2.dir).normalize().multiplyScalar(70);
    if (shadows && hd.moon2.shadow) {
      moon2.castShadow = true;
      moon2.shadow.mapSize.set(1024, 1024);
      Object.assign(moon2.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 180 });
      moon2.shadow.bias = -0.0006; moon2.shadow.normalBias = 0.04;
    }
    g.add(moon2, moon2.target);
  }
  // COBALT: the ship's searchlight, sweeping the district from above, and its beam
  let search = null;
  if (hd?.effects?.searchlight) {
    const S = hd.effects.searchlight;
    const spot = new THREE.SpotLight(new THREE.Color(S.color), S.intensity, 0, Math.atan(S.radius / S.height), 0.35, 2);
    if (shadows) { spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004; spot.shadow.camera.near = 20; spot.shadow.camera.far = S.height * 2; }
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, S.radius * 0.95, 1, 32, 1, true).translate(0, -0.5, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(S.color).multiplyScalar(0.15), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    beam.frustumCulled = false;
    g.add(spot, spot.target, beam);
    search = { S, spot, beam, W: mapW * cellM, H: mapH * cellM };
  }
  // N4.4 prototype: a torch in your hand, and the few street lamps still burning (the
  // nearest four get real lights, flickering; a fixed count, so no shader recompiles)
  let torch = null;
  const lampLights = [];
  const lamps = pal.hdLamps || [];
  if (art.hd) {
    const T = art.hd.torch, LP = art.hd.lamp;
    torch = new THREE.SpotLight(new THREE.Color(T.color), T.intensity, T.distance, T.angle, T.penumbra, T.decay);
    if (shadows && !day) {
      torch.castShadow = true;
      torch.shadow.mapSize.set(1024, 1024);
      torch.shadow.bias = -0.0005;
      torch.shadow.camera.near = 0.3;
    }
    g.add(torch, torch.target);
    for (let i = 0; i < 4; i++) {
      const pl = new THREE.PointLight(new THREE.Color(LP.color), 0, LP.distance, 2);
      g.add(pl);
      lampLights.push(pl);
    }
  }
  scene.add(g);
  const fogColour = new THREE.Color(art.fog.color);
  scene.fog = new THREE.Fog(fogColour, art.fog.near ?? FOG_NEAR, art.fog.far ?? FOG_FAR);
  scene.background = fogColour;
  const texel = (2 * r) / 2048;
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), tmp = new THREE.Vector3();
  const flicker = (i, t) => {
    // a lamp mostly holds, dips now and then, and sometimes stutters -- from a hash, never Math.random
    const h = Math.sin(i * 12.9898 + Math.floor(t * 9) * 78.233) * 43758.5453;
    const n = h - Math.floor(h);
    return n < 0.06 ? 0.15 : n < 0.12 ? 0.55 : 0.92 + 0.08 * Math.sin(t * 7 + i);
  };
  const fireFlicker = (i, t) => 0.72 + 0.18 * Math.sin(t * 11 + i * 1.7) + 0.1 * Math.sin(t * 23.3 + i * 4.1);
  return {
    sun,
    torch,
    /** Centre the shadow box a little ahead of the camera, snapped to whole texels; carry the torch; light the nearest lamps. */
    follow(camera) {
      if (torch) {
        camera.getWorldDirection(fwd);
        right.set(1, 0, 0).applyQuaternion(camera.quaternion);
        torch.position.copy(camera.position).addScaledVector(right, 0.22).add(tmp.set(0, -0.18, 0));
        torch.target.position.copy(camera.position).addScaledVector(fwd, 10);
        torch.target.updateMatrixWorld();
      }
      if (lampLights.length) {
        const cx = camera.position.x, cz = camera.position.z, t = performance.now() / 1000;
        const near = lamps.map((l, i) => ({ l, i, d: (l.x - cx) ** 2 + (l.z - cz) ** 2 })).sort((a, b) => a.d - b.d).slice(0, lampLights.length);
        lampLights.forEach((pl, k) => {
          const e = near[k];
          if (!e || e.d > 45 * 45) { pl.intensity = 0; return; }
          pl.position.set(e.l.x, e.l.y, e.l.z);
          // build 42: a lamp may carry its own colour and strength (EMBER's fires flicker harder)
          if (e.l.color) pl.color.set(e.l.color); else pl.color.set(art.hd.lamp.color);
          pl.distance = e.l.distance ?? art.hd.lamp.distance;
          pl.intensity = (e.l.intensity ?? art.hd.lamp.intensity) * (e.l.fire ? fireFlicker(e.i, t) : flicker(e.i, t));
        });
      }
      if (search) {
        // a slow figure of eight over the whole district, out of step with itself
        const { S, spot, beam, W, H } = search, t = performance.now() / 1000;
        const u = (t / S.period) * Math.PI * 2;
        const tx = W * (0.5 + 0.42 * Math.sin(u)), tz = H * (0.5 + 0.42 * Math.sin(u * 1.618 + 1.3));
        spot.target.position.set(tx, 0, tz);
        spot.position.set(tx + S.height * 0.18, S.height, tz - S.height * 0.12);
        spot.target.updateMatrixWorld();
        const dx = tx - spot.position.x, dy = -spot.position.y, dz = tz - spot.position.z, len = Math.hypot(dx, dy, dz);
        beam.position.copy(spot.position);
        beam.scale.set(1, len, 1);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
      }
      if (!follow) return;
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() > 1e-6) fwd.normalize();
      const x = Math.round((camera.position.x + fwd.x * r * 0.45) / texel) * texel;
      const z = Math.round((camera.position.z + fwd.z * r * 0.45) / texel) * texel;
      sun.target.position.set(x, 0, z);
      sun.position.set(x + toLight.x, toLight.y, z + toLight.z);
      sun.target.updateMatrixWorld();
      if (moon2) { moon2.target.position.set(x, 0, z); moon2.position.set(x + toMoon2.x, toMoon2.y, z + toMoon2.z); moon2.target.updateMatrixWorld(); }
    },
  };
}
