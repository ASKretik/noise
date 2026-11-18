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
import { artFor, depthOf, beltOf } from './art/belts.js';
import { surfaceTextures } from './art/textures.js';
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
 * Render chunks (N8.4): every instanced layer is cut into squares of CHUNK_CELLS cells
 * (48 m), each its own InstancedMesh with its own bounds, so three's frustum culling --
 * which tests one bounding sphere per mesh -- skips whatever is behind you or past the
 * fog. One mesh per tile type for the whole district is never culled at all.
 */
export const CHUNK_CELLS = 32;

/** The shadow box that follows you: half its width in metres (N8.4). */
export const SHADOW_HALF_M = 45;

/** Split an instanced layer into per-chunk meshes sharing its geometry and material. */
function chunked(mesh, cellM) {
  const size = CHUNK_CELLS * cellM;
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
  for (const idx of buckets.values()) {
    const part = new THREE.InstancedMesh(mesh.geometry, mesh.material, idx.length);
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
export function buildWorld(level, { cellM, shadows = false }) {
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

  // ---- floor: one tile per non-wall cell, ground / groundAlt, seams in the texture
  const floorArt = styled ? surfaceTextures(art.floor, seed, false) : null;
  if (floorArt) track(floorArt.map, floorArt.normalMap, ...(floorArt.roughnessMap ? [floorArt.roughnessMap] : []));
  const floorTex = floorArt ? floorArt.map : track(floorTexture(seed));
  const floorCells = [];
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (map.tiles[y * map.w + x] !== TILE.WALL) floorCells.push([x, y]);
  const floorGeo = track(new THREE.PlaneGeometry(cellM, cellM).rotateX(-Math.PI / 2));
  const floorMat = track(new THREE.MeshStandardMaterial(floorArt
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
    if (styled) floor.setColorAt(i, col.setRGB(1, 1, 1).multiplyScalar(0.86 + r.float() * 0.22));
    else floor.setColorAt(i, col.copy(r.bool(0.5) ? pal.ground : pal.groundAlt).multiplyScalar(0.92 + r.float() * 0.16));
  });
  floor.receiveShadow = shadows;
  group.add(floor);

  // ---- walls: body + a lighter cap, per-instance wear. A wall cell with wall on all four
  // sides shows no face to anyone at street level, so it gets a cap (the killcam looks
  // down on the roofs) but no body: on a city map that is about a third of all walls.
  const isWall = (x, y) => x < 0 || y < 0 || x >= map.w || y >= map.h || map.tiles[y * map.w + x] === TILE.WALL;
  const walls = cellsOf(TILE.WALL);
  const faced = walls.filter(([x, y]) => !isWall(x - 1, y) || !isWall(x + 1, y) || !isWall(x, y - 1) || !isWall(x, y + 1));
  const wallArt = styled ? surfaceTextures(art.wall, seed, true) : null;
  if (wallArt) track(wallArt.map, wallArt.normalMap, ...(wallArt.roughnessMap ? [wallArt.roughnessMap] : []));
  const wallTex = wallArt ? wallArt.map : track(wallTexture(seed));
  const wallGeo = track(new THREE.BoxGeometry(cellM, WALL_M, cellM));
  const wallMat = track(new THREE.MeshStandardMaterial(wallArt
    ? { map: wallTex, normalMap: wallArt.normalMap, roughnessMap: wallArt.roughnessMap, roughness: wallArt.roughnessMap ? 1 : art.wall.roughness, metalness: art.wall.metalness }
    : { map: wallTex, roughness: 0.88 }));
  const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, Math.max(1, faced.length));
  wallMesh.count = faced.length;
  const capGeo = track(new THREE.BoxGeometry(cellM * 1.02, 0.12, cellM * 1.02));
  const capMat = track(new THREE.MeshStandardMaterial({
    color: styled ? new THREE.Color(art.wall.base).lerp(new THREE.Color(0xffffff), 0.12) : pal.wallCap, roughness: 0.7,
  }));
  const capMesh = new THREE.InstancedMesh(capGeo, capMat, walls.length);
  faced.forEach(([x, y], i) => {
    const r = cellRng(x, y, 'wall');
    m4.makeTranslation((x + 0.5) * cellM, WALL_M / 2, (y + 0.5) * cellM);
    wallMesh.setMatrixAt(i, m4);
    if (styled) wallMesh.setColorAt(i, col.setRGB(1, 1, 1).multiplyScalar(0.84 + r.float() * 0.24));
    else wallMesh.setColorAt(i, col.copy(pal.wall).multiplyScalar(0.88 + r.float() * 0.24));
  });
  walls.forEach(([x, y], i) => {
    m4.makeTranslation((x + 0.5) * cellM, WALL_M + 0.06, (y + 0.5) * cellM);
    capMesh.setMatrixAt(i, m4);
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
    const n = 5 + r.int(4);
    for (let k = 0; k < n; k++) {
      const big = k === 0;
      const sx = (big ? 0.7 : 0.25 + r.float() * 0.4) * cellM;
      const sz = (big ? 0.7 : 0.25 + r.float() * 0.4) * cellM;
      const sy = big ? peak : 0.2 + r.float() * peak * 0.6;
      blocks.push({
        x: (x + 0.5 + (big ? 0 : (r.float() - 0.5) * 0.7)) * cellM,
        z: (y + 0.5 + (big ? 0 : (r.float() - 0.5) * 0.7)) * cellM,
        sx, sy, sz,
        ry: r.float() * Math.PI,
        tilt: big ? (r.float() - 0.5) * 0.15 : (r.float() - 0.5) * 0.7,
        top: k === 0 || r.bool(0.4),
        shade: 0.85 + r.float() * 0.3,
      });
    }
  }
  const rubbleGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const rubbleMat = track(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.97, flatShading: true }));
  const rubble = new THREE.InstancedMesh(rubbleGeo, rubbleMat, Math.max(1, blocks.length));
  rubble.count = blocks.length;
  blocks.forEach((b, i) => {
    q.setFromEuler(new THREE.Euler(b.tilt, b.ry, b.tilt * 0.5));
    m4.compose(v.set(b.x, b.sy / 2 - 0.05, b.z), q, sc.set(b.sx, b.sy, b.sz));
    rubble.setMatrixAt(i, m4);
    if (styled) rubble.setColorAt(i, col.set(art.rubble).multiplyScalar(b.top ? b.shade * 1.3 : b.shade));
    else rubble.setColorAt(i, col.copy(b.top ? pal.rubbleTop : pal.rubble).multiplyScalar(b.shade));
  });
  rubble.castShadow = rubble.receiveShadow = shadows;
  group.add(rubble);

  // ---- water: a shallow sheet with a scrolling ripple normal map
  const waterCells = cellsOf(TILE.COVER);
  const waterNorm = track(waterNormal(seed));
  const waterGeo = track(new THREE.PlaneGeometry(cellM, cellM).rotateX(-Math.PI / 2));
  const waterMat = track(new THREE.MeshStandardMaterial({
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

  // ---- the belt's props on the walls (N4.1), chunked with the rest
  for (const prop of buildProps(level, art, cellM, seed, track)) group.add(prop);

  // ---- cut every instanced layer into chunks (N8.4)
  const layers = group.children.filter((ch) => ch.isInstancedMesh);
  let chunkCount = 0;
  for (const layer of layers) {
    group.remove(layer);
    if (layer.count === 0) { layer.dispose(); continue; }
    const parts = chunked(layer, cellM);
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
  const skyDome = makeSky(art.sky, FOG_FAR * 0.98, track);
  const sky = skyDome.mesh;
  sky.position.set(W / 2, 0, H / 2);
  group.add(sky);
  // and its weather, round the camera
  const weather = makeWeather(art.weather, seed, track);
  if (weather) group.add(weather.object);

  return {
    group,
    palette: pal,
    chunkCount,
    art,
    /**
     * Per-frame animation: the water drifts, clouds and the lighthouse move, the weather
     * falls round you, and the sky dome stays centred on you (on a city map you can walk
     * 200 m from the middle, outside a dome fixed there). `px` is the canvas height in
     * device pixels, which keeps weather particles their size in metres.
     */
    animate(t, eye = null, px = 1000) {
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
  const sun = new THREE.DirectionalLight(new THREE.Color(L.key), L.keyI);
  const toLight = skyDir(L.keyAz, L.keyElev).multiplyScalar(54);
  const cx = (mapW * cellM) / 2, cz = (mapH * cellM) / 2;
  sun.position.set(cx + toLight.x, toLight.y, cz + toLight.z);
  sun.target.position.set(cx, 0, cz);
  const r = follow ? SHADOW_HALF_M : Math.max(mapW, mapH) * cellM * 0.62;
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 140 });
    sun.shadow.bias = -0.0008;
  }
  g.add(sun, sun.target);
  scene.add(g);
  const fogColour = new THREE.Color(art.fog.color);
  scene.fog = new THREE.Fog(fogColour, FOG_NEAR, FOG_FAR);
  scene.background = fogColour;
  const texel = (2 * r) / 2048;
  const fwd = new THREE.Vector3();
  return {
    sun,
    /** Centre the shadow box a little ahead of the camera, snapped to whole texels. */
    follow(camera) {
      if (!follow) return;
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() > 1e-6) fwd.normalize();
      const x = Math.round((camera.position.x + fwd.x * r * 0.45) / texel) * texel;
      const z = Math.round((camera.position.z + fwd.z * r * 0.45) / texel) * texel;
      sun.target.position.set(x, 0, z);
      sun.position.set(x + toLight.x, toLight.y, z + toLight.z);
      sun.target.updateMatrixWorld();
    },
  };
}
