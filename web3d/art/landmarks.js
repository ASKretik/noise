// web3d/art/landmarks.js -- what you steer by. Browser only.
//
// N4.3. Two kinds of landmark, both standing only on wall cells (solid to the sim at any
// height, sim3d/solid.js), so where you can walk and what you can shoot do not change:
//
//   CENTREPIECES  on every plaza: its lone monument cell carries a statue or an obelisk,
//                 its 2 x 2 fountain plinth a tiered fountain.
//   ONE SKYLINE   per district, on the roof of its biggest tenement block: a broadcast
//                 mast 30 m tall with a light at the top, or a crashed ship half buried
//                 in the roof. Taller than everything, so it shows over the roofs from
//                 most of the district -- a fixed point to steer by.
//
// All of it is merged into two meshes (solid, vertex-coloured; and lights): two draw
// calls for the whole district.

import * as THREE from 'three';
import { TILE } from '../../sim/grid.js';
import { Rng, hashString } from '../../sim/prng.js';

function merger() {
  const pos = [], nrm = [], col = [], idx = [];
  const v = new THREE.Vector3(), nm = new THREE.Matrix3(), c = new THREE.Color();
  return {
    add(geo, matrix, hex) {
      const p = geo.attributes.position, n = geo.attributes.normal, base = pos.length / 3;
      nm.getNormalMatrix(matrix);
      c.set(hex);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(matrix); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nrm.push(v.x, v.y, v.z);
        col.push(c.r, c.g, c.b);
      }
      if (geo.index) for (const i of geo.index.array) idx.push(base + i);
      else for (let i = 0; i < p.count; i++) idx.push(base + i);
    },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      return g;
    },
    get empty() { return idx.length === 0; },
  };
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const CONE4 = new THREE.ConeGeometry(0.71, 1, 4).rotateY(Math.PI / 4);
const BALL = new THREE.SphereGeometry(1, 12, 8);
const HULL = new THREE.SphereGeometry(1, 20, 10);

const M = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/**
 * @param {object} level  map and places
 * @param {object} o      { cellM, seed, art, looks, heightAt(x, y), track }
 * @returns {THREE.Object3D[]}
 */
export function buildLandmarks(level, { cellM, seed, art, looks, heightAt, track }) {
  const { map } = level;
  const places = level.places || [];
  const solid = merger(), glow = merger();
  const isWall = (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h && map.tiles[y * map.w + x] === TILE.WALL;
  const stone = looks.plaza.walls[0].base, stoneLight = new THREE.Color(stone).lerp(new THREE.Color('#c8c4bc'), 0.35).getHexString();
  const metal = '#3a3e44', dark = '#1c1f25';

  // ---- centrepieces on the plazas
  for (const pl of places.filter((p) => p.type === 'plaza')) {
    const r = new Rng(hashString(`${seed}:centre:${pl.id}`), 'centre');
    const seen = new Set();
    for (let y = pl.y; y < pl.y + pl.h; y++) for (let x = pl.x; x < pl.x + pl.w; x++) {
      if (!isWall(x, y) || seen.has(y * map.w + x)) continue;
      // the wall cluster this cell is in
      const cluster = [], stack = [[x, y]];
      while (stack.length) {
        const [cx, cy] = stack.pop(), k = cy * map.w + cx;
        if (seen.has(k) || !isWall(cx, cy) || cx < pl.x || cy < pl.y || cx >= pl.x + pl.w || cy >= pl.y + pl.h) continue;
        seen.add(k); cluster.push([cx, cy]);
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      const top = heightAt(x, y) + 0.12;
      const mx = cluster.reduce((s, c) => s + c[0] + 0.5, 0) / cluster.length * cellM;
      const mz = cluster.reduce((s, c) => s + c[1] + 0.5, 0) / cluster.length * cellM;
      if (cluster.length === 1) {
        solid.add(BOX, M(mx, top + 0.12, mz, 1.25, 0.24, 1.25), `#${stoneLight}`);
        if (r.bool(0.6)) {
          // a statue: a figure on the plinth, one arm raised, looking along the plaza
          const turn = r.int(4) * Math.PI / 2, s = 1.5, b = top + 0.24;
          const at = (dx, dy, dz) => new THREE.Vector3(dx, dy, dz).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).add(new THREE.Vector3(mx, b, mz));
          const part = (geo, d, sc, rot = [0, 0, 0]) => { const p = at(...d); solid.add(geo, M(p.x, p.y, p.z, ...sc, rot[0], rot[1] + turn, rot[2]), stone); };
          part(BOX, [-0.12 * s, 0.45 * s, 0], [0.18 * s, 0.9 * s, 0.2 * s]);
          part(BOX, [0.12 * s, 0.45 * s, 0], [0.18 * s, 0.9 * s, 0.2 * s]);
          part(BOX, [0, 1.25 * s, 0], [0.5 * s, 0.75 * s, 0.28 * s]);
          part(BALL, [0, 1.8 * s, 0], [0.15 * s, 0.17 * s, 0.15 * s]);
          part(BOX, [-0.33 * s, 1.2 * s, 0], [0.12 * s, 0.65 * s, 0.12 * s], [0, 0, 0.15]);
          part(BOX, [0.36 * s, 1.85 * s, 0], [0.11 * s, 0.75 * s, 0.11 * s], [0, 0, -0.35]);
          part(CONE4, [0.5 * s, 2.35 * s, 0], [0.18 * s, 0.4 * s, 0.18 * s]);
        } else {
          // an obelisk
          solid.add(BOX, M(mx, top + 0.24 + 2.6, mz, 0.55, 5.2, 0.55), stone);
          solid.add(CONE4, M(mx, top + 0.24 + 5.2 + 0.3, mz, 0.55, 0.6, 0.55), `#${stoneLight}`);
        }
      } else {
        // a fountain: tiered basins on the plinth, a spout of pale water
        solid.add(CYL, M(mx, top + 0.15, mz, 1.45, 0.3, 1.45), `#${stoneLight}`);
        solid.add(CYL, M(mx, top + 0.25, mz, 1.3, 0.12, 1.3), art.water);
        solid.add(CYL, M(mx, top + 0.95, mz, 0.22, 1.3, 0.22), stone);
        solid.add(CYL, M(mx, top + 1.65, mz, 0.75, 0.18, 0.75), `#${stoneLight}`);
        solid.add(BALL, M(mx, top + 1.95, mz, 0.2, 0.3, 0.2), stone);
        glow.add(CYL, M(mx, top + 1.2, mz, 0.08, 1.6, 0.08), '#9fb4c8');
      }
    }
  }

  // ---- one skyline landmark per district, on its biggest tenement block
  const blocks = places.filter((p) => p.type === 'tenements').sort((a, b) => b.w * b.h - a.w * a.h || a.id - b.id);
  for (const pl of blocks.slice(0, 1)) {
    const r = new Rng(hashString(`${seed}:skyline:${pl.id}`), 'skyline');
    // the wall cell nearest the block's middle with walls on every side: a roof, not an edge
    let best = null, bd = Infinity;
    const cx = pl.x + pl.w / 2, cy = pl.y + pl.h / 2;
    for (let y = pl.y + 1; y < pl.y + pl.h - 1; y++) for (let x = pl.x + 1; x < pl.x + pl.w - 1; x++) {
      if (!isWall(x, y) || !isWall(x + 1, y) || !isWall(x - 1, y) || !isWall(x, y + 1) || !isWall(x, y - 1)) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (!best) continue;
    const bx = (best[0] + 0.5) * cellM, bz = (best[1] + 0.5) * cellM, roof = heightAt(...best) + 0.12;
    if (r.bool(0.6)) {
      // a broadcast mast: four legs, cross-bracing, a dish, a white light on top
      const H = 24, w0 = 1.3, w1 = 0.25;
      const half = (t) => (w0 + (w1 - w0) * t) / 2;
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const a = new THREE.Vector3(bx + sx * half(0), roof, bz + sz * half(0)), b = new THREE.Vector3(bx + sx * half(1), roof + H, bz + sz * half(1));
        const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        solid.add(BOX, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(0.09, len, 0.09)), metal);
      }
      for (let k = 0; k < 8; k++) {
        const t = (k + 0.5) / 8, y = roof + t * H, hw = half(t);
        for (const rot of [0, Math.PI / 2]) {
          solid.add(BOX, M(bx + (rot ? hw : 0), y, bz + (rot ? 0 : hw), rot ? 0.05 : hw * 2, 0.05, rot ? hw * 2 : 0.05), metal);
          solid.add(BOX, M(bx - (rot ? hw : 0), y, bz - (rot ? 0 : hw), rot ? 0.05 : hw * 2, 0.05, rot ? hw * 2 : 0.05), metal);
        }
      }
      solid.add(CYL, M(bx + 0.5, roof + H * 0.7, bz, 0.7, 0.08, 0.7, 0, 0, 1.2), '#5a5e66');
      glow.add(BALL, M(bx, roof + H + 0.25, bz, 0.22, 0.22, 0.22), '#e8eef8');
      glow.add(BALL, M(bx, roof + H * 0.5, bz, 0.12, 0.12, 0.12), '#e8eef8');
    } else {
      // a crashed ship, nose down into the roof, its vents still lit
      const ry = r.float() * Math.PI * 2, tilt = 0.32;
      solid.add(HULL, M(bx, roof + 1.2, bz, 7.5, 1.5, 3.2, 0, ry, tilt), dark);
      solid.add(HULL, M(bx, roof + 1.9, bz, 2.6, 1.0, 1.9, 0, ry, tilt), '#2a2f38');
      for (let k = 0; k < 6; k++) {
        const t = (k / 5 - 0.5) * 9;
        const p = new THREE.Vector3(t, 1.25 + -t * Math.sin(tilt) * 0.95, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
        glow.add(BALL, M(bx + p.x, roof + p.y + 0.3, bz + p.z, 0.16, 0.16, 0.16), '#9ec4ff');
      }
      for (let k = 0; k < 9; k++) solid.add(BOX, M(bx + r.range(-5, 5), roof + 0.15, bz + r.range(-5, 5), 0.4 + r.float(), 0.2 + r.float() * 0.4, 0.3 + r.float(), r.float(), r.float() * 3, r.float()), dark);
    }
  }

  const out = [];
  if (!solid.empty) {
    const m = new THREE.Mesh(track(solid.geometry()), track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.15 })));
    m.castShadow = m.receiveShadow = true;
    m.name = 'landmarks';
    out.push(m);
  }
  if (!glow.empty) {
    const m = new THREE.Mesh(track(glow.geometry()), track(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(3, 3, 3), toneMapped: false })));
    m.name = 'landmark-lights';
    out.push(m);
  }
  return out;
}
