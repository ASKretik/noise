// web3d/art/props.js -- what hangs on a belt's walls. Browser only.
//
// Props sit on the street-facing faces of walls (or float in water), never on a cell
// anyone walks through the middle of, so walkability -- the sim's business -- does not
// change. Each prop kind is one InstancedMesh; buildWorld cuts it into chunks with the
// rest of the world. Every choice comes from a seeded Rng keyed on the cell or the wall
// line, so a district always looks the same.
//
//   pipes    RUST: pipe runs along whole straight walls at one height per wall line,
//            drops to the ground, valve wheels on some drops
//   harbour  TIDE: mooring bollards at the foot of walls; buoys out in open water
//   vines    MOSS: strands hanging from the tops of walls

import * as THREE from 'three';
import { TILE } from '../../sim/grid.js';
import { Rng, hashString } from '../../sim/prng.js';
import { WALL_M } from '../../sim3d/units.js';

const DIR4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Every wall face that looks onto open ground: { x, y, dx, dy }. */
function openFaces(map, skip = null) {
  const out = [];
  const { w, h, tiles } = map;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (tiles[y * w + x] !== TILE.WALL || skip?.(x, y)) continue;
    for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (tiles[ny * w + nx] !== TILE.WALL) out.push({ x, y, dx, dy });
    }
  }
  return out;
}

/**
 * @param {object} [o]
 * @param {Function} [o.heightAt]  (x, y) => how tall that wall cell is drawn (N4.2)
 * @param {Function} [o.skip]      (x, y) => true for walls that take no props (hedges, monuments)
 * @returns {THREE.Object3D[]} instanced meshes to add to the world group
 */
export function buildProps(level, art, cellM, seed, track, { heightAt = () => WALL_M, skip = null } = {}) {
  const props = art.props;
  if (!props) return [];
  const { map } = level;
  const rngOf = (label) => new Rng(hashString(`${seed}:props:${label}`), label);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const col = new THREE.Color();
  const base = new THREE.Color(props.base), accent = new THREE.Color(props.accent);
  const out = [];
  const make = (geo, mat, list, colour) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(track(geo), track(mat), list.length);
    list.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      if (colour) mesh.setColorAt(i, it.c || colour);
    });
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    out.push(mesh);
  };
  // the point on a wall face, `off` metres out, `along` metres along it, at height y
  const onFace = (f, along, y, off) => {
    const cx = (f.x + 0.5) * cellM + f.dx * (cellM / 2 + off);
    const cz = (f.y + 0.5) * cellM + f.dy * (cellM / 2 + off);
    return new THREE.Vector3(cx + -f.dy * along, y, cz + f.dx * along);
  };

  if (props.kind === 'pipes') {
    const runs = [], drops = [], valves = [];
    for (const f of openFaces(map, skip)) {
      // one height per straight wall line, so pipes run the whole length of a wall
      const line = f.dy !== 0 ? `h${f.y}:${f.dy}` : `v${f.x}:${f.dx}`;
      const lr = rngOf(line);
      if (lr.float() > 0.35 + props.density) continue;
      const hgt = 1.9 + lr.float() * 0.7, r = 0.07 + lr.float() * 0.05;
      const p = onFace(f, 0, hgt, r + 0.04);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-f.dy, 0, f.dx));
      runs.push({ m: m4.clone().compose(p, q, sc.set(r, cellM * 1.002, r)) });
      const cr = rngOf(`d${f.x},${f.y},${f.dx},${f.dy}`);
      if (cr.float() < 0.1) {
        const along = (cr.float() - 0.5) * cellM * 0.6;
        const dp = onFace(f, along, hgt / 2, r + 0.04);
        drops.push({ m: m4.clone().compose(dp, q.identity(), sc.set(r * 0.85, hgt, r * 0.85)) });
        if (cr.float() < 0.45) {
          const vp = onFace(f, along, 1.15, r + 0.08);
          q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(f.dx, 0, f.dy));
          valves.push({ m: m4.clone().compose(vp, q, sc.set(1, 1, 1)) });
        }
      }
    }
    const pipeMat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.55, metalness: 0.55 });
    make(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), pipeMat, runs);
    make(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), pipeMat.clone(), drops);
    make(new THREE.TorusGeometry(0.17, 0.03, 6, 14), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, metalness: 0.4 }), valves);
  } else if (props.kind === 'harbour') {
    const posts = [], caps = [], buoys = [], bands = [];
    for (const f of openFaces(map, skip)) {
      const r = rngOf(`b${f.x},${f.y},${f.dx},${f.dy}`);
      if (r.float() > props.density) continue;
      const along = (r.float() - 0.5) * cellM * 0.5;
      posts.push({ m: m4.clone().compose(onFace(f, along, 0.28, 0.18), q.identity(), sc.set(0.14, 0.56, 0.14)) });
      caps.push({ m: m4.clone().compose(onFace(f, along, 0.58, 0.18), q.identity(), sc.set(0.19, 0.08, 0.19)) });
    }
    const { w, h, tiles } = map;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (tiles[y * w + x] !== TILE.COVER) continue;
      let wet = 0;
      for (const [dx, dy] of DIR4) if (tiles[(y + dy) * w + x + dx] === TILE.COVER) wet++;
      if (wet < 3) continue;
      const r = rngOf(`y${x},${y}`);
      if (r.float() > 0.05) continue;
      const p = new THREE.Vector3((x + 0.3 + r.float() * 0.4) * cellM, 0.16, (y + 0.3 + r.float() * 0.4) * cellM);
      buoys.push({ m: m4.clone().compose(p, q.identity(), sc.set(0.24, 0.24, 0.24)) });
      bands.push({ m: m4.clone().compose(p.clone().setY(0.2), q.identity(), sc.set(0.25, 0.07, 0.25)) });
    }
    const iron = new THREE.MeshStandardMaterial({ color: base, roughness: 0.45, metalness: 0.6 });
    make(new THREE.CylinderGeometry(1, 1.15, 1, 10), iron, posts);
    make(new THREE.CylinderGeometry(1, 1, 1, 10), iron.clone(), caps);
    make(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4 }), buoys);
    make(new THREE.CylinderGeometry(1, 1, 1, 12), new THREE.MeshStandardMaterial({ color: new THREE.Color(props.band), roughness: 0.5 }), bands);
  } else if (props.kind === 'vines') {
    const strands = [];
    for (const f of openFaces(map, skip)) {
      const r = rngOf(`v${f.x},${f.y},${f.dx},${f.dy}`);
      if (r.float() > props.density) continue;
      const n = 3 + r.int(5);
      for (let k = 0; k < n; k++) {
        const len = 0.5 + r.float() * r.float() * 2.3;
        const along = (r.float() - 0.5) * cellM * 0.9;
        const p = onFace(f, along, heightAt(f.x, f.y) - len / 2, 0.03);
        q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(f.dx, 0, f.dy));
        strands.push({
          m: m4.clone().compose(p, q, sc.set(0.04 + r.float() * 0.05, len, 0.02)),
          c: col.copy(base).lerp(accent, r.float()).multiplyScalar(0.8 + r.float() * 0.35).clone(),
        });
      }
    }
    make(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), strands, base);
  }
  return out;
}
