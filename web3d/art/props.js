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
//   beams, neon, lamps, railings, lanterns, awnings, antennas: EMBER to COBALT (N4.3)

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
    // drawn whole, one call per layer: small shapes, and chunking them cost a call per
    // chunk per layer -- COBALT went to 167 calls (N4.3)
    mesh.userData.whole = true;
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
  } else {
    // ---- N4.3: belts 4-10. Each kind is a few instanced shapes on street-facing walls.
    const second = props.second ? new THREE.Color(props.second) : accent;
    const unit = () => new THREE.BoxGeometry(1, 1, 1);
    // glows: brighter than white, which only bloom shows (post.js); without it, plain full colour
    const lit = (c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.4), toneMapped: false });
    const face = (f, along, y, off) => onFace(f, along, y, off);
    const facing = (f) => q.clone().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(f.dx, 0, f.dy));
    const A = [], B = [], C = [];   // up to three layers per kind
    for (const f of openFaces(map, skip)) {
      const r = rngOf(`${props.kind}${f.x},${f.y},${f.dx},${f.dy}`);
      if (r.float() > props.density) continue;
      const top = heightAt(f.x, f.y), qf = facing(f);
      const along = (r.float() - 0.5) * cellM * 0.5;
      if (props.kind === 'beams') {
        // EMBER: a charred beam leaning on the wall, another fallen at its foot
        const len = 2.2 + r.float() * 0.9, lean = 0.3 + r.float() * 0.2;
        const qb = qf.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lean));
        A.push({ m: m4.clone().compose(face(f, along, Math.cos(lean) * len / 2, Math.sin(lean) * len / 2 + 0.1), qb, sc.set(0.17, len, 0.17)) });
        if (r.bool(0.5)) A.push({ m: m4.clone().compose(face(f, -along, 0.09, 0.5), qf.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.3 + r.float())), sc.set(0.16, 0.16, 1.6)) });
      } else if (props.kind === 'neon') {
        // VIOLET: a neon frame or a pair of bars on a dark backing board
        const y = 2.3 + r.float() * 0.6, w = 0.7 + r.float() * 0.4, h = 0.35 + r.float() * 0.25, c = r.bool(0.5) ? accent : second;
        A.push({ m: m4.clone().compose(face(f, along, y, 0.03), qf, sc.set(w + 0.12, h + 0.12, 0.05)) });
        const tube = (dx, dy, tw, th) => B.push({ m: m4.clone().compose(face(f, along + dx, y + dy, 0.08), qf, sc.set(tw, th, 0.035)), c });
        if (r.bool(0.5)) { tube(0, h / 2, w, 0.035); tube(0, -h / 2, w, 0.035); tube(-w / 2, 0, 0.035, h); tube(w / 2, 0, 0.035, h); }
        else { tube(0, h * 0.2, w * 0.9, 0.04); tube(0, -h * 0.2, w * 0.6, 0.04); }
      } else if (props.kind === 'lamps') {
        // ASH: a street lamp against the wall; most are dead, a few still burn
        const pole = face(f, along, 1.9, 0.18);
        A.push({ m: m4.clone().compose(pole, q.identity(), sc.set(0.07, 3.8, 0.07)) });
        A.push({ m: m4.clone().compose(face(f, along, 3.75, 0.45), qf, sc.set(0.06, 0.06, 0.6)) });
        const head = { m: m4.clone().compose(face(f, along, 3.66, 0.72), q.identity(), sc.set(0.3, 0.12, 0.3)) };
        (r.bool(0.35) ? B : C).push(head);
      } else if (props.kind === 'railings') {
        // CORAL: a small balcony with balusters, high on the wall
        const y = Math.min(top - 0.6, 2.7), w = 1.0;
        A.push({ m: m4.clone().compose(face(f, along * 0.4, y, 0.2), qf, sc.set(w, 0.07, 0.4)) });
        A.push({ m: m4.clone().compose(face(f, along * 0.4, y + 0.55, 0.38), qf, sc.set(w, 0.05, 0.05)) });
        for (let k = 0; k < 7; k++) B.push({ m: m4.clone().compose(face(f, along * 0.4 + (k / 6 - 0.5) * (w - 0.08), y + 0.28, 0.38), q.identity(), sc.set(0.035, 0.5, 0.035)) });
      } else if (props.kind === 'lanterns') {
        // JADE: lanterns hanging from brackets under the wall's top
        const y = top - 0.55;
        A.push({ m: m4.clone().compose(face(f, along, top - 0.18, 0.2), qf, sc.set(0.05, 0.05, 0.4)) });
        A.push({ m: m4.clone().compose(face(f, along, y + 0.2, 0.38), q.identity(), sc.set(0.015, 0.3, 0.015)) });
        B.push({ m: m4.clone().compose(face(f, along, y, 0.38), q.identity(), sc.set(0.24, 0.34, 0.24)) });
      } else if (props.kind === 'awnings') {
        // SOLAR: a canvas awning over the wall, sloping out
        const qa = qf.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.38));
        A.push({ m: m4.clone().compose(face(f, along * 0.3, 2.55, 0.5), qa, sc.set(1.25, 0.04, 1.0)), c: r.bool(0.5) ? accent : second });
        for (const s2 of [-1, 1]) B.push({ m: m4.clone().compose(face(f, along * 0.3 + s2 * 0.58, 2.45, 0.85), q.identity(), sc.set(0.03, 0.3, 0.03)) });
      } else if (props.kind === 'antennas') {
        // COBALT: masts and dishes on the roofs, a light at the tip
        const h = 1.2 + r.float() * 2.2, p0 = face(f, along, top + h / 2, -0.35);
        A.push({ m: m4.clone().compose(p0, q.identity(), sc.set(0.05, h, 0.05)) });
        if (r.bool(0.4)) A.push({ m: m4.clone().compose(face(f, along, top + h * 0.6, -0.1), qf.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.5)), sc.set(0.5, 0.5, 0.08)) });
        B.push({ m: m4.clone().compose(face(f, along, top + h + 0.04, -0.35), q.identity(), sc.set(0.08, 0.08, 0.08)) });
      }
    }
    const metal = new THREE.MeshStandardMaterial({ color: base, roughness: 0.6, metalness: 0.4 });
    if (props.kind === 'beams') make(unit(), new THREE.MeshStandardMaterial({ color: base, roughness: 0.95 }), A);
    else if (props.kind === 'neon') { make(unit(), new THREE.MeshStandardMaterial({ color: base, roughness: 0.7 }), A); make(unit(), lit(0xffffff), B, accent); }
    else if (props.kind === 'lamps') { make(unit(), metal, A); make(unit(), lit(accent), B); make(unit(), new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.5 }), C); }
    else if (props.kind === 'railings') { make(unit(), metal, A); make(new THREE.CylinderGeometry(1, 1, 1, 6), metal.clone(), B); }
    else if (props.kind === 'lanterns') { make(unit(), metal, A); make(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), lit(accent), B); }
    else if (props.kind === 'awnings') { make(unit(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }), A, accent); make(unit(), metal, B); }
    else if (props.kind === 'antennas') { make(unit(), metal, A); make(unit(), lit(accent), B); }
  }
  return out;
}
