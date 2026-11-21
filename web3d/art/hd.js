// web3d/art/hd.js -- the N4.4 detail prototype (district 1). Browser only.
//
// The user asked for the look of Amnesia and Silent Hill at about ten times the detail,
// tried on one district first. Chosen with the antialgorithm skill: no gore and no
// motel sign -- this street shows how its people tried to be quiet before they were
// taken, because the aliens hunt by sound:
//
//   windows   real frames, sills and lintels round the brick texture's windows; behind
//             them dark glass that catches the torch, or a mattress, carpet or foam
//             nailed over, or boards, or nothing (broken), a few lit behind a curtain
//   doors     frames and a step; shoes left in pairs on some of them
//   roofs     cornices on every wall top, chimneys on the tenements
//   walls     a dark plinth at the foot, drainpipes on the corners
//   overhead  cables sagging across the streets between facing walls
//   lamps     street lamps against the walls, most dead, a few burning (world.js lights
//             the nearest four)
//   ground    leaves and grit, paper, oil, rags, drains at the wall foot, manholes
//
// Everything stands on wall cells or flat on the ground, so walking, sight and shots are
// the sim's as before. Merged into one mesh per material: about seven draw calls.

import * as THREE from 'three';
import { TILE } from '../../sim/grid.js';
import { Rng, hashString } from '../../sim/prng.js';
import { merger } from './landmarks.js';

const DIR4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const QUAD = new THREE.PlaneGeometry(1, 1);

// ------------------------------------------------------------------ grime

/** A tileable 512 x 512 map: R fine dirt, G stains, B wet. Value noise, seeded. */
export function grimeTexture(seed) {
  const N = 512, img = new ImageData(N, N), r = new Rng(seed, 'grime');
  const lattice = (period) => {
    const v = new Float32Array(period * period);
    for (let i = 0; i < v.length; i++) v[i] = r.float();
    return (x, y) => {
      const fx = x * period, fy = y * period, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const g = (a, b) => v[((b % period + period) % period) * period + ((a % period + period) % period)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      return (g(ix, iy) * (1 - sx) + g(ix + 1, iy) * sx) * (1 - sy) + (g(ix, iy + 1) * (1 - sx) + g(ix + 1, iy + 1) * sx) * sy;
    };
  };
  const fineL = [8, 16, 32, 64, 128].map(lattice), stainL = [3, 6, 12].map(lattice), wetL = [4, 8].map(lattice);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      let f = 0, a = 0.5;
      for (const L of fineL) { f += L(u, v) * a; a *= 0.5; }
      const st = stainL[0](u, v) * 0.55 + stainL[1](u, v) * 0.3 + stainL[2](u, v) * 0.15;
      const wet = wetL[0](u, v) * 0.7 + wetL[1](u, v) * 0.3;
      const i = (y * N + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, (f - 0.25) * 340));
      img.data[i + 1] = Math.max(0, Math.min(255, (st - 0.45) * 620));
      img.data[i + 2] = Math.max(0, Math.min(255, wet * 255));
      img.data[i + 3] = 255;
    }
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  cv.getContext('2d').putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ ground clutter atlas

/** 8 tiles of 128 px: leaves, grit, paper, oil, rag, drain grate, manhole, glass. */
function clutterAtlas(seed) {
  const T = 128, cv = document.createElement('canvas');
  cv.width = T * 4; cv.height = T * 2;
  const g = cv.getContext('2d'), r = new Rng(seed, 'clutter');
  const at = (k) => [(k % 4) * T, Math.floor(k / 4) * T];
  // 0 leaves
  { const [x0, y0] = at(0); for (let i = 0; i < 70; i++) { g.fillStyle = ['#4a3a22', '#5c4628', '#3a2e1c', '#6a5230'][r.int(4)]; g.save(); g.translate(x0 + 14 + r.int(T - 28), y0 + 14 + r.int(T - 28)); g.rotate(r.float() * 6.28); g.beginPath(); g.ellipse(0, 0, 3 + r.int(4), 1.5 + r.int(2), 0, 0, 6.28); g.fill(); g.restore(); } }
  // 1 grit and small stones
  { const [x0, y0] = at(1); for (let i = 0; i < 260; i++) { const v = 40 + r.int(60); g.fillStyle = `rgba(${v},${v - 4},${v - 8},${0.5 + r.float() * 0.5})`; g.fillRect(x0 + 8 + r.int(T - 16), y0 + 8 + r.int(T - 16), 1 + r.int(3), 1 + r.int(3)); } }
  // 2 a sheet of paper, sodden and torn
  { const [x0, y0] = at(2); g.save(); g.translate(x0 + 64, y0 + 64); g.rotate(0.3); g.fillStyle = '#8a8676'; g.fillRect(-34, -44, 68, 88); g.fillStyle = 'rgba(40,38,34,0.5)'; for (let l = 0; l < 9; l++) g.fillRect(-28, -36 + l * 8, 30 + r.int(26), 2); g.fillStyle = 'rgba(30,28,24,0.35)'; g.beginPath(); g.arc(14, 20, 22, 0, 6.28); g.fill(); g.restore(); }
  // 3 oil
  { const [x0, y0] = at(3); const grd = g.createRadialGradient(x0 + 64, y0 + 64, 4, x0 + 64, y0 + 64, 56); grd.addColorStop(0, 'rgba(8,8,10,0.85)'); grd.addColorStop(0.7, 'rgba(12,12,14,0.5)'); grd.addColorStop(1, 'rgba(12,12,14,0)'); g.fillStyle = grd; g.fillRect(x0, y0, T, T); }
  // 4 a rag
  { const [x0, y0] = at(4); g.fillStyle = '#4e463c'; g.beginPath(); g.moveTo(x0 + 20, y0 + 40); for (let i = 0; i < 10; i++) g.lineTo(x0 + 20 + r.int(90), y0 + 20 + r.int(90)); g.closePath(); g.fill(); g.strokeStyle = 'rgba(20,18,16,0.6)'; g.lineWidth = 2; g.stroke(); }
  // 5 a drain grate
  { const [x0, y0] = at(5); g.fillStyle = '#1c1b1a'; g.fillRect(x0 + 14, y0 + 40, 100, 48); g.fillStyle = '#3a3836'; for (let i = 0; i < 9; i++) g.fillRect(x0 + 18 + i * 11, y0 + 44, 5, 40); g.strokeStyle = '#4a4744'; g.lineWidth = 3; g.strokeRect(x0 + 14, y0 + 40, 100, 48); }
  // 6 a manhole cover
  { const [x0, y0] = at(6); g.fillStyle = '#2a2826'; g.beginPath(); g.arc(x0 + 64, y0 + 64, 56, 0, 6.28); g.fill(); g.strokeStyle = '#46423e'; g.lineWidth = 4; g.stroke(); g.lineWidth = 2; for (let i = -40; i <= 40; i += 10) { g.beginPath(); g.moveTo(x0 + 64 + i, y0 + 64 - Math.sqrt(48 * 48 - i * i)); g.lineTo(x0 + 64 + i, y0 + 64 + Math.sqrt(48 * 48 - i * i)); g.stroke(); } }
  // 7 broken glass
  { const [x0, y0] = at(7); for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(170,180,190,${0.25 + r.float() * 0.4})`; g.beginPath(); const cx = x0 + 20 + r.int(88), cy = y0 + 20 + r.int(88); g.moveTo(cx, cy); g.lineTo(cx + r.range(-9, 9), cy + r.range(-9, 9)); g.lineTo(cx + r.range(-9, 9), cy + r.range(-9, 9)); g.fill(); } }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const uv = (k) => { const [x, y] = at(k); return [x / cv.width, 1 - (y + T) / cv.height, (x + T) / cv.width, 1 - y / cv.height]; };
  return { tex, uv };
}

// ------------------------------------------------------------------ the builder

/**
 * @param {object} level
 * @param {object} o  { cellM, seed, art, lookAt(x,y), heightAt(x,y), doorAt(x,y), track }
 * @returns {{ meshes: THREE.Object3D[], lamps: {x, y, z}[] }}
 */
export function buildHD(level, { cellM, seed, art, lookAt, heightAt, doorAt, track }) {
  const { map } = level;
  const { w, h } = map;
  const tile = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? TILE.WALL : map.tiles[y * w + x]);
  const isWall = (x, y) => tile(x, y) === TILE.WALL;
  const open = (x, y) => { const t = tile(x, y); return t !== TILE.WALL && t !== TILE.BUILDING; };
  const rngAt = (label) => new Rng(hashString(`${seed}:hd:${label}`), label);
  const trim = merger(), metal = merger(), cloth = merger(), wood = merger(), glass = merger(), lit = merger();
  const lamps = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), m = new THREE.Matrix4();
  // a box on wall face f: `along` metres along it, centre height y, standing `out` metres proud
  const onFace = (f, along, y, out) => v.set(
    (f.x + 0.5) * cellM + f.dx * (cellM / 2 + out) + -f.dy * along, y, (f.y + 0.5) * cellM + f.dy * (cellM / 2 + out) + f.dx * along);
  const faceBox = (dst, f, along, y, out, bw, bh, bd, colour, tilt = 0) => {
    e.set(tilt, Math.atan2(f.dx, f.dy), 0, 'YXZ');
    m.compose(onFace(f, along, y, out), q.setFromEuler(e), s.set(bw, bh, bd));
    dst.add(BOX, m, colour);
  };
  const stoneTrim = new THREE.Color(art.wall.base).lerp(new THREE.Color('#8a857c'), 0.45).getHexString();
  const darkTrim = new THREE.Color(art.wall.base).multiplyScalar(0.55).getHexString();

  // every wall face onto open ground
  const faces = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isWall(x, y)) continue;
    for (const [dx, dy] of DIR4) if (open(x + dx, y + dy)) faces.push({ x, y, dx, dy });
  }

  for (const f of faces) {
    const L = lookAt(f.x, f.y), type = L?.type, top = heightAt(f.x, f.y);
    const r = rngAt(`f${f.x},${f.y},${f.dx},${f.dy}`);
    // a plinth at the foot and a cornice at the top, on every wall
    if (type !== 'park') {
      faceBox(trim, f, 0, 0.17, 0.025, cellM + 0.01, 0.34, 0.05, `#${darkTrim}`);
      faceBox(trim, f, 0, top - 0.11, 0.08, cellM + 0.04, 0.22, 0.16, `#${stoneTrim}`);
      if (top > 4) faceBox(trim, f, 0, top - 0.32, 0.04, cellM + 0.02, 0.08, 0.08, `#${stoneTrim}`);
    }
    if (type === 'tenements') {
      // the brick texture's windows: 0.42 m wide, upper storey 3.48-4.75 m, lower 0.78-2.05 m
      const door = doorAt(f.x, f.y);
      const storeys = door ? [[4.115, 1.27]] : [[4.115, 1.27], [1.415, 1.27]];
      for (const [cy, wh] of storeys) {
        const ww = 0.42;
        faceBox(trim, f, 0, cy + wh / 2 + 0.05, 0.05, ww + 0.16, 0.1, 0.1, `#${stoneTrim}`);   // lintel
        faceBox(trim, f, 0, cy - wh / 2 - 0.035, 0.07, ww + 0.14, 0.07, 0.16, `#${stoneTrim}`);   // sill
        for (const side of [-1, 1]) faceBox(trim, f, side * (ww / 2 + 0.025), cy, 0.03, 0.05, wh, 0.06, '#2e2a26');   // jambs
        const roll = r.float();
        if (roll < 0.34) faceBox(glass, f, 0, cy, 0.004, ww, wh, 0.01, '#0f1215');
        else if (roll < 0.58) faceBox(cloth, f, r.range(-2, 2) * 0.01, cy - 0.02, 0.05, ww + 0.1, wh + 0.06, 0.09, ['#6b6456', '#5a5448', '#776d5c', '#4e4a44'][r.int(4)], (r.float() - 0.5) * 0.06);   // mattress
        else if (roll < 0.66) faceBox(cloth, f, 0, cy, 0.035, ww + 0.02, wh, 0.06, '#3c3f44');   // foam
        else if (roll < 0.8) for (let k = 0; k < 3; k++) faceBox(wood, f, 0, cy - wh * 0.32 + k * wh * 0.32, 0.06, ww + 0.22, 0.12, 0.03, ['#4a3a2a', '#3e3226', '#56442f'][r.int(3)], 0);
        else if (roll < 0.86) faceBox(lit, f, 0, cy, 0.006, ww - 0.02, wh - 0.04, 0.01, ['#a87a4a', '#8c6a46'][r.int(2)]);
        // else: broken, the texture's dark hole
      }
      if (door) {
        faceBox(trim, f, 0, 1.98, 0.05, 0.66, 0.12, 0.1, `#${stoneTrim}`);
        for (const side of [-1, 1]) faceBox(trim, f, side * 0.29, 0.96, 0.03, 0.07, 1.92, 0.07, '#2a2420');
        faceBox(trim, f, 0, 0.06, 0.2, 0.8, 0.12, 0.36, `#${stoneTrim}`);   // step
        if (r.bool(0.35)) {
          // a pair of shoes left on the step
          const off = (r.float() - 0.5) * 0.3, c = ['#2a2420', '#3a3028', '#4a4038', '#2c2c30'][r.int(4)];
          for (const k of [-0.06, 0.06]) faceBox(cloth, f, off + k, 0.16, 0.26 + r.float() * 0.04, 0.09, 0.07, 0.25, c);
        }
      }
      // a chimney on some roofs
      if (r.bool(0.08)) {
        e.set(0, 0, 0); m.compose(v.set((f.x + 0.5) * cellM, top + 0.55, (f.y + 0.5) * cellM), q.setFromEuler(e), s.set(0.55, 1.1, 0.7));
        trim.add(BOX, m, `#${darkTrim}`);
        m.compose(v.set((f.x + 0.5) * cellM, top + 1.2, (f.y + 0.5) * cellM), q.identity(), s.set(0.09, 0.22, 0.09));
        trim.add(CYL, m, '#5a4a3e');
      }
    }
    // a cut cord hanging from a bracket by some doors and walls: what held a bell or a chime
    if ((type === 'tenements' || !type) && r.bool(0.05)) {
      faceBox(metal, f, 0.5, 2.6, 0.12, 0.04, 0.04, 0.24, '#2a2826');
      m.compose(onFace(f, 0.5, 2.3, 0.22), q.identity(), s.set(0.008, 0.6, 0.008));
      cloth.add(CYL, m, '#6a604e');
    }
  }

  // drainpipes on convex corners of tall walls
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isWall(x, y)) continue;
    const top = heightAt(x, y), L = lookAt(x, y);
    if (L?.type === 'park') continue;
    for (const [ax, ay, bx, by] of [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0]]) {
      if (!open(x + ax, y + ay) || !open(x + bx, y + by)) continue;
      const r = rngAt(`p${x},${y},${ax},${ay}`);
      if (!r.bool(0.45)) continue;
      const px = (x + 0.5) * cellM + (ax + bx) * (cellM / 2 - 0.02) + (ax + bx) * 0.06;
      const pz = (y + 0.5) * cellM + (ay + by) * (cellM / 2 - 0.02) + (ay + by) * 0.06;
      m.compose(v.set(px, top / 2, pz), q.identity(), s.set(0.055, top, 0.055));
      metal.add(CYL, m, '#2c2a28');
      for (let k = 1; k < top / 1.5; k++) { m.compose(v.set(px, k * 1.5, pz), q.identity(), s.set(0.075, 0.04, 0.075)); metal.add(CYL, m, '#3a3633'); }
      m.compose(v.set(px, top - 0.15, pz), q.identity(), s.set(0.18, 0.22, 0.18));
      metal.add(BOX, m, '#2c2a28');
    }
  }

  // cables across the streets, between walls that face each other 2-7 cells apart
  const cable = (a, b, sag) => {
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -sag, 0));
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const geo = new THREE.TubeGeometry(curve, 12, 0.014, 4, false);
    metal.add(geo, new THREE.Matrix4(), '#141414');
    geo.dispose();
  };
  for (const f of faces) {
    const r = rngAt(`c${f.x},${f.y},${f.dx},${f.dy}`);
    if (f.dx + f.dy < 0 || !r.bool(0.09)) continue;   // one direction only, so each pair once
    let k = 1;
    while (k < 8 && open(f.x + f.dx * k, f.y + f.dy * k)) k++;
    if (k < 3 || k >= 8 || !isWall(f.x + f.dx * k, f.y + f.dy * k)) continue;
    const ha = heightAt(f.x, f.y) - 0.5, hb = heightAt(f.x + f.dx * k, f.y + f.dy * k) - 0.5;
    const along = (r.float() - 0.5) * 0.8;
    const a = onFace(f, along, ha, 0.05).clone();
    const fb = { x: f.x + f.dx * k, y: f.y + f.dy * k, dx: -f.dx, dy: -f.dy };
    const b = onFace(fb, -along + (r.float() - 0.5) * 0.6, hb, 0.05).clone();
    cable(a, b, 0.35 + r.float() * 0.5);
    if (r.bool(0.4)) cable(a.clone().add(new THREE.Vector3(0, -0.25, 0)), b.clone().add(new THREE.Vector3(0, -0.3, 0)), 0.5 + r.float() * 0.5);
  }

  // street lamps against the walls, never two within 6 cells; most dead
  const taken = [];
  for (const f of faces) {
    const L = lookAt(f.x, f.y);
    if (L && L.type !== 'plaza' && L.type !== 'canal') continue;
    const r = rngAt(`l${f.x},${f.y},${f.dx},${f.dy}`);
    if (!r.bool(0.18)) continue;
    if (taken.some((t) => Math.abs(t.x - f.x) + Math.abs(t.y - f.y) < 5)) continue;
    taken.push({ x: f.x, y: f.y });
    const along = (r.float() - 0.5) * 0.6, H = 4.4 + r.float() * 0.5;
    const base = onFace(f, along, H / 2, 0.22).clone();
    m.compose(base, q.identity(), s.set(0.065, H, 0.065));
    metal.add(CYL, m, '#24221f');
    m.compose(onFace(f, along, 0.35, 0.22), q.identity(), s.set(0.12, 0.7, 0.12));
    metal.add(CYL, m, '#24221f');
    faceBox(metal, f, along, H - 0.05, 0.6, 0.06, 0.06, 0.8, '#24221f');
    const burning = r.bool(0.45), broken = !burning && r.bool(0.4);
    const head = onFace(f, along, H - 0.18, 0.95).clone();
    e.set(broken ? 0.5 : 0, Math.atan2(f.dx, f.dy), broken ? 0.3 : 0, 'YXZ');
    m.compose(head, q.setFromEuler(e), s.set(0.34, 0.16, 0.5));
    metal.add(BOX, m, '#2a2724');
    if (burning) {
      m.compose(head.clone().add(new THREE.Vector3(0, -0.1, 0)), q.setFromEuler(e), s.set(0.26, 0.05, 0.4));
      lit.add(BOX, m, '#f2c58e');
      lamps.push({ x: head.x, y: head.y - 0.4, z: head.z });
    }
  }

  // ground clutter: leaves, grit, paper, oil, rags, glass in the open; drains at the wall
  // foot; manholes out in the street
  const atlas = clutterAtlas(seed);
  const pos = [], nrm = [], uvs = [], idx = [];
  const decal = (cx, cz, size, rot, k) => {
    const [u0, v0, u1, v1] = atlas.uv(k), b = pos.length / 3, c = Math.cos(rot), sn = Math.sin(rot);
    for (const [sx, sz, u, vv] of [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]]) {
      const lx = sx * size / 2, lz = sz * size / 2;
      pos.push(cx + lx * c - lz * sn, 0.012, cz + lx * sn + lz * c);
      nrm.push(0, 1, 0); uvs.push(u, vv);
    }
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = tile(x, y);
    if (t !== TILE.FLOOR) continue;
    const r = rngAt(`g${x},${y}`), cx = (x + 0.5) * cellM, cz = (y + 0.5) * cellM;
    const nearWall = DIR4.find(([dx, dy]) => isWall(x + dx, y + dy));
    const roll = r.float();
    if (nearWall && r.bool(0.06)) {
      const [dx, dy] = nearWall;
      decal(cx + dx * 0.55, cz + dy * 0.55, 0.7, Math.atan2(dx, dy), 5);
    } else if (!nearWall && roll < 0.025) decal(cx, cz, 0.9, r.float() * 6.28, 6);
    else if (roll < 0.16) decal(cx + (r.float() - 0.5) * 0.8, cz + (r.float() - 0.5) * 0.8, 0.6 + r.float() * 0.6, r.float() * 6.28, r.bool(0.6) ? 0 : 1);
    else if (roll < 0.2) decal(cx + (r.float() - 0.5) * 0.6, cz + (r.float() - 0.5) * 0.6, 0.45 + r.float() * 0.2, r.float() * 6.28, 2);
    else if (roll < 0.24) decal(cx, cz, 0.8 + r.float() * 0.8, r.float() * 6.28, 3);
    else if (roll < 0.26) decal(cx, cz, 0.6, r.float() * 6.28, 4);
    else if (roll < 0.275) decal(cx, cz, 0.5, r.float() * 6.28, 7);
  }

  const out = [];
  const add = (mg, mat, name, shadow = true) => {
    if (mg.empty) return;
    const mesh = new THREE.Mesh(track(mg.geometry()), track(mat));
    mesh.name = name;
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    out.push(mesh);
  };
  add(trim, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }), 'hd-trim');
  add(metal, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.55 }), 'hd-metal', false);
  add(cloth, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 'hd-cloth', false);
  add(wood, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), 'hd-wood', false);
  add(glass, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.5 }), 'hd-glass', false);
  add(lit, new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.6, 1.6, 1.6), toneMapped: false }), 'hd-lit', false);
  if (idx.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(track(g), track(new THREE.MeshStandardMaterial({
      map: track(atlas.tex), alphaTest: 0.3, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    })));
    mesh.name = 'hd-ground';
    mesh.receiveShadow = true;
    out.push(mesh);
  }
  for (const o of out) o.frustumCulled = false;
  return { meshes: out, lamps };
}
