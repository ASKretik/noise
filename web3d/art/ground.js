// web3d/art/ground.js -- district 1's ground, photographed. Browser only. N4.4, build 41.
//
// The old floor was a code-drawn pattern per place, which read as a patchwork of tiles.
// Here every open cell gets a real surface (Poly Haven, CC0, assets3d/textures/), laid
// by world position at its true size so nothing stretches or lines up with the grid:
//
//   street      asphalt; the cells along a building or wall are pavement slabs, with a
//               kerb stone where pavement meets road
//   plaza       cobbles          market      cobbles
//   park        grass with a worn path      yards, depot   cracked concrete
//   ruins       dirt             canal       pavement
//
// One merged mesh per surface. Each cell's colour is nudged by a slow hash, so a long
// road does not show its 3 m repeat.

import * as THREE from 'three';
import { TILE } from '../../sim/grid.js';
import { hashString } from '../../sim/prng.js';
import { ktx2Loader } from './kit.js';

/** id -> metres one repeat covers (Poly Haven's own dimensions) */
const SURF = {
  asphalt_02: 3.0, concrete_pavement: 1.8, cobblestone_floor_04: 1.5, grass_path_2: 2.0,
  damaged_concrete_floor: 4.5, dirt: 2.0,
  // build 42: the other belts' first districts
  leaves_forest_ground: 1.26, forest_leaves_02: 3.0, burned_ground_01: 1.0, dense_sand: 1.8,
  checkered_pavement_tiles: 2.0, metal_plate: 1.0, mossy_cobblestone: 2.0, granite_tile: 2.3,
};
const BY_PLACE = {
  plaza: 'cobblestone_floor_04', market: 'cobblestone_floor_04', park: 'grass_path_2',
  yards: 'damaged_concrete_floor', depot: 'damaged_concrete_floor', ruins: 'dirt', canal: 'concrete_pavement',
};

// ------------------------------------------------------------------ 2K (build 43)

/**
 * District 1's surfaces at 2K, GPU-compressed (assets3d/textures2k/, KTX2), each with its
 * height map for parallax: the relief (metres) is how deep the stones and slab joints
 * read when you look across them.
 */
export const GROUND_2K = Object.freeze({
  asphalt_02: 0.008, concrete_pavement: 0.012, cobblestone_floor_04: 0.045, grass_path_2: 0.03,
  damaged_concrete_floor: 0.015, dirt: 0.035, forest_leaves_02: 0.03,
});
const cache2k = new Map();
/** Load every 2K set once (resolves when all are on the GPU-side loader's hands). */
export function loadGround2k() {
  const K = ktx2Loader();
  if (!K) return Promise.reject(new Error('ground: the KTX2 decoder is not set up'));
  return Promise.all(Object.keys(GROUND_2K).map(async (id) => {
    if (cache2k.has(id)) return;
    const url = (n) => new URL(`../../assets3d/textures2k/${id}/${n}.ktx2`, import.meta.url).href;
    const [map, normalMap, roughnessMap, disp] = await Promise.all(['diff', 'nor_gl', 'arm', 'disp'].map((n) => K.loadAsync(url(n))));
    for (const t of [map, normalMap, roughnessMap, disp]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
    cache2k.set(id, { map, normalMap, roughnessMap, disp });
  }));
}
export const ground2kReady = () => cache2k.size === Object.keys(GROUND_2K).length;
/** one loaded 2K set ({ map, normalMap, roughnessMap, disp }), or undefined */
export const ground2k = (id) => cache2k.get(id);

/**
 * Parallax occlusion on a flat, upward ground: the height map is marched along the view
 * ray (8-24 steps, fewer when you look straight down), and every map is read where the
 * ray meets the surface. Only on faces that point up -- the kerbs keep their plain look.
 */
function addParallax(mat, disp, depthUv) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.pomMap = { value: disp };
    shader.uniforms.pomDepth = { value: depthUv };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPomW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vPomW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    const C = THREE.ShaderChunk;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPomW;\nuniform sampler2D pomMap;\nuniform float pomDepth;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  vec2 pomUv = vMapUv;
  {
    vec3 fn = normalize( cross( dFdx( vPomW ), dFdy( vPomW ) ) );
    if ( abs( fn.y ) > 0.9 ) {
      vec3 V = normalize( cameraPosition - vPomW );
      vec3 Vt = vec3( V.x, -V.z, V.y );          // u along +x, v along -z, up
      float layers = mix( 24.0, 8.0, abs( Vt.z ) );
      float dl = 1.0 / layers;
      vec2 duv = Vt.xy / max( Vt.z, 0.25 ) * pomDepth / layers;
      vec2 gx = dFdx( vMapUv ), gy = dFdy( vMapUv );
      vec2 uv = vMapUv;
      float cur = 0.0;
      float h = 1.0 - textureGrad( pomMap, uv, gx, gy ).r;
      for ( int i = 0; i < 24; i++ ) {
        if ( cur >= h ) break;
        uv -= duv;
        h = 1.0 - textureGrad( pomMap, uv, gx, gy ).r;
        cur += dl;
      }
      vec2 prev = uv + duv;
      float after = h - cur;
      float before = ( 1.0 - textureGrad( pomMap, prev, gx, gy ).r ) - cur + dl;
      pomUv = mix( uv, prev, clamp( after / ( after - before + 1e-5 ), 0.0, 1.0 ) );
    }
  }`)
      .replace('#include <map_fragment>', C.map_fragment.replace(/vMapUv/g, 'pomUv'))
      .replace('#include <normal_fragment_maps>', C.normal_fragment_maps.replace(/vNormalMapUv/g, 'pomUv'))
      .replace('#include <roughnessmap_fragment>', C.roughnessmap_fragment.replace(/vRoughnessMapUv/g, 'pomUv'));
  };
  mat.customProgramCacheKey = () => 'ground-pom';
}

// ------------------------------------------------------------------ 1K

const cache = new Map();
function surfaceSet(id) {
  if (cache.has(id)) return cache.get(id);
  const L = new THREE.TextureLoader();
  const t = (name, srgb) => {
    const tex = L.load(new URL(`../../assets3d/textures/${id}/${name}.jpg`, import.meta.url).href);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const set = { map: t('diff', true), normalMap: t('nor_gl', false), roughnessMap: t('arm', false) };
  cache.set(id, set);
  return set;
}

// a smooth value per cell from a coarse hashed lattice: big, soft variations
function slow(seed, x, y, scale = 7) {
  const h = (i, j) => (hashString(`${seed}:g:${i},${j}`) % 1000) / 1000;
  const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * @param {object} o { map, cellM, seed, lookAt(x, y), track }
 * @returns {THREE.Mesh[]}
 */
export function buildKitGround({ map, cellM: C, seed, lookAt, track, style = {} }) {
  // build 42: a belt's style picks its own surface for each kind of ground, tints it, and
  // wets it (wet ground is darker and glossy, and mirrors the sky)
  const pick = (kind, dflt) => style[kind] || dflt;
  const tint = new THREE.Color(style.tint || '#ffffff');
  const wet = style.wet || 0;
  const { w, h, tiles } = map;
  const isWall = (x, y) => x < 0 || y < 0 || x >= w || y >= h || tiles[y * w + x] === TILE.WALL;
  const parts = new Map();
  const P = (id) => {
    if (!parts.has(id)) parts.set(id, { pos: [], nrm: [], uv: [], col: [], idx: [] });
    return parts.get(id);
  };
  const quad = (id, x0, z0, x1, z1, y, shade) => {
    const g = P(id), tile = SURF[id] ?? 2, base = g.pos.length / 3;
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
      g.pos.push(x, y, z); g.nrm.push(0, 1, 0); g.uv.push(x / tile, -z / tile); g.col.push(shade, shade, shade);
    }
    g.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  const box = (id, cx, cy, cz, sx, sy, sz, shade) => {
    // a kerb stone: the top and the two long faces are enough
    const g = P(id), tile = SURF[id] ?? 2;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const faces = [
      [[0, 1, 0], [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]]],
      [[0, 0, 1], [[-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz], [hx, -hy, hz]]],
      [[0, 0, -1], [[hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, -hz]]],
      [[1, 0, 0], [[hx, -hy, hz], [hx, hy, hz], [hx, hy, -hz], [hx, -hy, -hz]]],
      [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, hy, -hz], [-hx, hy, hz], [-hx, -hy, hz]]],
    ];
    for (const [n, vs] of faces) {
      const base = g.pos.length / 3;
      for (const [x, y, z] of vs) {
        g.pos.push(cx + x, cy + y, cz + z); g.nrm.push(...n);
        g.uv.push(n[0] ? (cz + z) / tile : (cx + x) / tile, n[1] ? -(cz + z) / tile : (cy + y) / tile);
        g.col.push(shade, shade, shade);
      }
      g.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  };

  const PLACE_KIND = { plaza: 'plaza', market: 'plaza', park: 'park', yards: 'yards', depot: 'yards', ruins: 'ruins', canal: 'pavement' };
  const STREET = pick('street', 'asphalt_02'), PAVE = pick('pavement', 'concrete_pavement');
  const kind = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h || isWall(x, y)) return null;
    const L = lookAt(x, y);
    const pk = L && PLACE_KIND[L.type];
    if (pk) return pk === 'pavement' ? PAVE : pick(pk, BY_PLACE[L.type]);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isWall(x + dx, y + dy)) return PAVE;
    return STREET;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = kind(x, y);
    if (!k) continue;
    const shade = 0.82 + slow(seed, x, y) * 0.3;
    quad(k, x * C, y * C, (x + 1) * C, (y + 1) * C, 0, shade);
    if (k !== PAVE || PAVE === STREET) continue;
    // the kerb, where this pavement meets road
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (kind(x + dx, y + dy) !== STREET) continue;
      const cx = (x + 0.5 + dx * 0.44) * C, cz = (y + 0.5 + dy * 0.44) * C;
      box('concrete_pavement', cx, 0.05, cz, dx ? 0.18 : C, 0.1, dx ? C : 0.18, 0.78);
    }
  }

  const out = [];
  for (const [id, g] of parts) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
    geo.setIndex(g.idx);
    geo.computeBoundingSphere();
    const hi = style.res === '2k' && cache2k.get(id);
    const S = hi ? { map: hi.map, normalMap: hi.normalMap, roughnessMap: hi.roughnessMap } : surfaceSet(id);
    const mat = new THREE.MeshStandardMaterial({
      ...S, vertexColors: true, roughness: 1 - wet * 0.78, metalness: 0, side: THREE.DoubleSide, name: `ground-${id}`,
      color: tint.clone().multiplyScalar(1 - wet * 0.3),
    });
    if (hi) addParallax(mat, hi.disp, GROUND_2K[id] / (SURF[id] ?? 2));
    const mesh = new THREE.Mesh(track(geo), track(mat));
    mesh.name = `ground-${id}`;
    mesh.receiveShadow = true;
    out.push(mesh);
  }
  return out;
}
