// web3d/art/kit.js -- artist-made models for district 1. Browser only. N4.4, build 41.
//
// The user, after build 40: the walls still look like AI slop. Code-drawn boxes and
// planes had reached their ceiling, so district 1 is now built from models people made:
// Poly Haven's CC0 modular facade kits and street props (assets3d/models/, credited in
// assets3d/CREDITS.md). This file loads them and hands out pieces by name; art/kitbuild.js
// decides where each goes.
//
//   the kits     "Modular Urban Apartments Facade" (plaster, 3 x 3 m wall bays with
//                holes, the windows and doors that fit them, sill bands, string
//                courses, crowns, plinths, pilasters) and "Modular Factory Facade"
//                (the same in brick, with shopfront-sized windows and garage doors)
//   the props    downpipes, roller shutters (some sprayed), air conditioners, bins, bags,
//                barrels, tyres, crates, a utility box, manholes, benches, wall lamps
//
// Two things make them affordable in a whole district:
//
//   walls        the kits' walls are flat planes tessellated into a 6 cm grid (4,608
//                triangles for one blank bay). Their UVs are planar, so each flat part
//                is re-meshed here into the few rectangles that cover it, with the UVs
//                carried over exactly (simplifyPlanar): a blank bay becomes 2 triangles,
//                a bay with a window hole about 10
//   batching     one BatchedMesh per material for the whole district: every piece's
//                geometry is stored once, every placement is an instance, culled one by
//                one against the camera and the sun's shadow box. So ~2,000 windows cost
//                a draw call per material, not per window

import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/0.185.1/addons/loaders/GLTFLoader.js';

const MODELS = {
  apart: 'modular_urban_apartments_facade',
  factory: 'modular_factory_facade',
  gutter: 'modular_metal_gutter',
  shutterwin: 'rollershutter_window_01',
  can: 'metal_trash_can',
  aircon: 'exterior_aircon_unit',
  tyre: 'old_tyre',
  ubox: 'utility_box_01',
  manhole: 'water_manhole_cover',
  bag: 'trashbag',
  barrel: 'barrel_03',
  walllamp: 'industrial_wall_lamp',
  bench: 'painted_wooden_bench',
  crate: 'wooden_crate_01',
};

// models whose separate nodes are one object (kept in place, relative to the first named node)
const WHOLE = {
  can: { clean: /^metal_trash_can(_lid|_handle_left|_handle_right)?$/, rusty: /^metal_trash_can_rust/ },
  manhole: { cover: /./ },
  crate: { crate: /./ },
};

/** What a material is, for tinting: the facade colour, the joinery, glass, the rest. */
function roleOf(name) {
  if (/glass|bulb/.test(name)) return 'glass';
  if (/plaster|brick$/.test(name)) return 'wall';
  if (/objects|windows$|brick_doors|garage/.test(name)) return 'frame';
  if (/trim/.test(name)) return 'trim';
  return 'prop';
}

// ------------------------------------------------------------------ simplification

const V = () => new THREE.Vector3();

/**
 * Re-mesh the flat parts of a geometry into rectangles. Triangles are grouped by plane;
 * each plane's vertices give a grid (their distinct coordinates in the plane), each grid
 * cell is kept if a triangle covers its centre, and the kept cells are merged greedily
 * into rectangles. UVs come from the plane's own linear fit, so they match the original
 * exactly; a plane whose UVs are not linear, or that does not get smaller, is kept as it was.
 */
export function simplifyPlanar(geo) {
  const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
  const I = geo.index ? geo.index.array : null;
  const nt = (I ? I.length : P.count) / 3;
  const vi = (t, k) => (I ? I[t * 3 + k] : t * 3 + k);
  const a = V(), b = V(), c = V(), n = V(), e1 = V(), e2 = V();
  const groups = new Map();
  for (let t = 0; t < nt; t++) {
    a.fromBufferAttribute(P, vi(t, 0)); b.fromBufferAttribute(P, vi(t, 1)); c.fromBufferAttribute(P, vi(t, 2));
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    const len = n.length();
    if (len < 1e-10) continue;
    n.divideScalar(len);
    const d = n.dot(a);
    const key = `${Math.round(n.x * 60)},${Math.round(n.y * 60)},${Math.round(n.z * 60)},${Math.round(d * 500)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { tris: [], n: V(), d: 0 }));
    g.tris.push(t); g.n.add(n); g.d += d;
  }
  const pos = [], nrm = [], uv = [], idx = [];
  const keep = (t) => {
    const base = pos.length / 3;
    for (let k = 0; k < 3; k++) {
      const i = vi(t, k);
      pos.push(P.getX(i), P.getY(i), P.getZ(i)); nrm.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(U.getX(i), U.getY(i));
      idx.push(base + k);
    }
  };
  const p = V();
  for (const g of groups.values()) {
    const nn = g.n.normalize(), d0 = g.d / g.tris.length;
    if (g.tris.length < 4) { g.tris.forEach(keep); continue; }
    const ua = Math.abs(nn.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0).cross(nn).normalize();
    const va = new THREE.Vector3().crossVectors(nn, ua);
    // the plane's vertices in (s, t), and a least-squares fit uv = A (s, t, 1)
    const verts = new Map();
    for (const t of g.tris) for (let k = 0; k < 3; k++) { const i = vi(t, k); if (!verts.has(i)) { p.fromBufferAttribute(P, i); verts.set(i, [p.dot(ua), p.dot(va), U.getX(i), U.getY(i)]); } }
    const fit = (col) => {
      const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
      for (const q of verts.values()) { const w = [q[0], q[1], 1]; for (let i = 0; i < 3; i++) { r[i] += w[i] * q[col]; for (let j = 0; j < 3; j++) S[i][j] += w[i] * w[j]; } }
      const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const D = det(S);
      if (Math.abs(D) < 1e-12) return null;
      const sol = [0, 1, 2].map((cc) => det(S.map((row, i) => row.map((v, j) => (j === cc ? r[i] : v)))) / D);
      for (const q of verts.values()) if (Math.abs(sol[0] * q[0] + sol[1] * q[1] + sol[2] - q[col]) > 2e-3) return null;
      return sol;
    };
    const fu = fit(2), fv = fit(3);
    const uniq = (k) => {
      const vals = [...verts.values()].map((q) => q[k]).sort((x, y) => x - y);
      const out = [];
      for (const v of vals) if (!out.length || v - out[out.length - 1] > 1e-3) out.push(v);
      return out;
    };
    const xs = fu && fv ? uniq(0) : [], ys = fu && fv ? uniq(1) : [];
    const nx = xs.length - 1, ny = ys.length - 1;
    if (!fu || !fv || nx < 1 || ny < 1 || nx * ny > 250000) { g.tris.forEach(keep); continue; }
    const filled = new Uint8Array(nx * ny);
    const lower = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo; };
    for (const t of g.tris) {
      const q = [0, 1, 2].map((k) => verts.get(vi(t, k)));
      const x0 = Math.min(q[0][0], q[1][0], q[2][0]), x1 = Math.max(q[0][0], q[1][0], q[2][0]);
      const y0 = Math.min(q[0][1], q[1][1], q[2][1]), y1 = Math.max(q[0][1], q[1][1], q[2][1]);
      const i0 = Math.max(0, lower(xs, x0 - 1e-3) - 1), i1 = Math.min(nx, lower(xs, x1 + 1e-3));
      const j0 = Math.max(0, lower(ys, y0 - 1e-3) - 1), j1 = Math.min(ny, lower(ys, y1 + 1e-3));
      const [A, B, C] = q;
      const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
      if (Math.abs(den) < 1e-14) continue;
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
        const l1 = ((B[1] - C[1]) * (cx - C[0]) + (C[0] - B[0]) * (cy - C[1])) / den;
        const l2 = ((C[1] - A[1]) * (cx - C[0]) + (A[0] - C[0]) * (cy - C[1])) / den;
        if (l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6) filled[j * nx + i] = 1;
      }
    }
    // greedy rectangles
    const rects = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (filled[j * nx + i] !== 1) continue;
      let i2 = i;
      while (i2 + 1 < nx && filled[j * nx + i2 + 1] === 1) i2++;
      let j2 = j;
      grow: while (j2 + 1 < ny) { for (let k = i; k <= i2; k++) if (filled[(j2 + 1) * nx + k] !== 1) break grow; j2++; }
      for (let jj = j; jj <= j2; jj++) for (let k = i; k <= i2; k++) filled[jj * nx + k] = 2;
      rects.push([xs[i], ys[j], xs[i2 + 1], ys[j2 + 1]]);
    }
    if (rects.length * 2 >= g.tris.length) { g.tris.forEach(keep); continue; }
    for (const [s0, t0, s1, t1] of rects) {
      const base = pos.length / 3;
      for (const [s, t] of [[s0, t0], [s1, t0], [s1, t1], [s0, t1]]) {
        p.copy(ua).multiplyScalar(s).addScaledVector(va, t).addScaledVector(nn, d0);
        pos.push(p.x, p.y, p.z); nrm.push(nn.x, nn.y, nn.z);
        uv.push(fu[0] * s + fu[1] * t + fu[2], fv[0] * s + fv[1] * t + fv[2]);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

// ------------------------------------------------------------------ loading

/** Only position, normal and uv, indexed: what every geometry in one BatchedMesh must share. */
function clean(geo) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = geo.getAttribute(k);
    g.setAttribute(k, a ? a.clone() : new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count * (k === 'uv' ? 2 : 3)), k === 'uv' ? 2 : 3));
  }
  g.setIndex(geo.index ? geo.index.clone() : [...Array(geo.getAttribute('position').count).keys()]);
  return g;
}

const url = (id) => new URL(`../../assets3d/models/${id}/${id}.gltf`, import.meta.url).href;

let loading = null, loaded = null;

/** The kit, if it has finished loading (else null: world.js falls back to the drawn buildings). */
export const kitReady = () => loaded;

/**
 * Load every model once. Resolves to the kit: piece(name) -> { parts: [{ geo, mat, role }], box },
 * where name is '<model>/<node>' ('apart/wall_window_centered_small_02') or, for the props
 * kept whole, '<model>/<variant>' ('car/car', 'can/rusty').
 */
export function loadKit(onProgress = () => {}) {
  if (loading) return loading;
  const loader = new GLTFLoader();
  let done = 0;
  const ids = Object.entries(MODELS);
  loading = Promise.all(ids.map(([key, id]) => loader.loadAsync(url(id)).then((gltf) => { onProgress(++done / ids.length); return [key, gltf]; })))
    .then((list) => {
      const pieces = new Map();
      const m = new THREE.Matrix4(), inv = new THREE.Matrix4(), rot = new THREE.Matrix4();
      for (const [key, gltf] of list) {
        const root = gltf.scene;
        root.updateMatrixWorld(true);
        const meshesOf = (node) => { const out = []; node.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
        for (const mesh of meshesOf(root)) {
          let mat = mesh.material;
          // the wall lamp's glass asks for transmission, which makes three re-draw the whole
          // scene behind it every frame (17 ms at 1080p): plain see-through glass instead
          if (mat.isMeshPhysicalMaterial && mat.transmission > 0) {
            const g = new THREE.MeshStandardMaterial({ name: mat.name, color: mat.color, map: mat.map, normalMap: mat.normalMap, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
            mat.dispose();
            mesh.material = mat = g;
          }
          if (mat.transparent) mat.forceSinglePass = true;   // one pass, not back faces then front
          for (const t of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (mat[t]) mat[t].anisotropy = 8;
          mat.userData.kitRole = roleOf(mat.name);
        }
        const addPart = (name, mesh, matrix, simplify) => {
          let p = pieces.get(name);
          if (!p) pieces.set(name, (p = { name, parts: [], box: new THREE.Box3() }));
          let geo = clean(mesh.geometry).applyMatrix4(matrix);
          if (simplify) { const s = simplifyPlanar(geo); geo.dispose(); geo = s; }
          geo.computeBoundingBox();
          p.box.union(geo.boundingBox);
          p.parts.push({ geo, mat: mesh.material, role: mesh.material.userData.kitRole });
        };
        if (WHOLE[key]) {
          for (const [variant, re] of Object.entries(WHOLE[key])) {
            const nodes = root.children.filter((nd) => re.test(nd.name));
            if (!nodes.length) continue;
            inv.makeTranslation(-nodes[0].position.x, -nodes[0].position.y, -nodes[0].position.z);
            for (const nd of nodes) for (const mesh of meshesOf(nd)) addPart(`${key}/${variant}`, mesh, m.multiplyMatrices(inv, mesh.matrixWorld), false);
          }
          continue;
        }
        // one piece per node, at its own origin (the kits lay their pieces out in a showroom)
        for (const nd of root.children) {
          rot.compose(new THREE.Vector3(), nd.quaternion, nd.scale);
          inv.copy(nd.matrixWorld).invert();
          for (const mesh of meshesOf(nd)) {
            m.multiplyMatrices(rot, inv).multiply(mesh.matrixWorld);
            addPart(`${key}/${nd.name}`, mesh, m, /^wall_/.test(nd.name) && mesh.material.userData.kitRole === 'wall');
          }
        }
      }
      loaded = {
        piece(name) {
          const p = pieces.get(name);
          if (!p) throw new Error(`kit: no piece ${name}`);
          return p;
        },
        has: (name) => pieces.has(name),
        /** add a piece made here (kitbuild's rooms behind the glass) */
        define(name, parts) {
          const p = { name, parts, box: new THREE.Box3() };
          for (const pt of parts) { pt.geo.computeBoundingBox(); p.box.union(pt.geo.boundingBox); }
          pieces.set(name, p);
        },
        names: () => [...pieces.keys()],
      };
      return loaded;
    });
  loading.catch(() => { loading = null; });
  return loading;
}

// ------------------------------------------------------------------ placing

const WHITE = new THREE.Color(1, 1, 1);

/**
 * Collects placements, then builds one BatchedMesh per material. put() takes a piece
 * name, a world matrix and colours by role ({ wall, frame, trim, glass, prop, all }).
 */
export class KitBatch {
  constructor(kit) { this.kit = kit; this.items = []; this.skipGlass = new Set(); }

  put(name, matrix, colours = {}, { glass = true } = {}) {
    for (const part of this.kit.piece(name).parts) {
      if (part.role === 'glass' && !glass) continue;
      const c = colours[part.role] ?? colours.all ?? WHITE;
      this.items.push({ part, m: matrix.clone(), c: c.isColor ? c : new THREE.Color(c) });
    }
  }

  /** @returns {THREE.BatchedMesh[]} */
  build(track = (x) => x) {
    const byMat = new Map();
    for (const it of this.items) {
      let l = byMat.get(it.part.mat);
      if (!l) byMat.set(it.part.mat, (l = []));
      l.push(it);
    }
    const out = [];
    for (const [mat, items] of byMat) {
      const geos = [...new Set(items.map((it) => it.part.geo))];
      const nv = geos.reduce((s, g) => s + g.attributes.position.count, 0);
      const ni = geos.reduce((s, g) => s + g.index.count, 0);
      const bm = new THREE.BatchedMesh(items.length, nv, ni, mat);
      const ids = new Map(geos.map((g) => [g, bm.addGeometry(g)]));
      for (const it of items) {
        const id = bm.addInstance(ids.get(it.part.geo));
        bm.setMatrixAt(id, it.m);
        bm.setColorAt(id, it.c);
      }
      bm.name = `kit-${mat.name}`;
      bm.sortObjects = !!mat.transparent;   // opaque pieces need no per-frame sort
      // glass, the rooms behind it, and the small fittings cast nothing worth a shadow pass
      const glass = mat.userData.kitRole === 'glass';
      bm.castShadow = !glass && !/room|aircon|gutter|shutter/.test(mat.name);
      bm.receiveShadow = true;
      bm.computeBoundingBox();
      bm.computeBoundingSphere();
      track(bm);
      out.push(bm);
    }
    return out;
  }
}
