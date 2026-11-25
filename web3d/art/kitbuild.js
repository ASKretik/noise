// web3d/art/kitbuild.js -- district 1's buildings, from the Poly Haven kits. Browser only.
// N4.4, build 41.
//
// The plan (art/buildings.js planBuildings: every block cut into buildings, each with a
// purpose that differs from its neighbours') is kept; what stands on it is new. Each
// building is laid out the way the kits were made to be used -- 3 m bays, 3 m storeys --
// and gets, never the same as the building next door:
//
//   a kit        plaster (the apartments kit) or brick (the factory kit); a garage is
//                always brick, a hotel always plaster
//   a colour     limewash and distemper for plaster (ochre, salmon, sage, grey-blue...),
//                and its own joinery colour (white, bottle green, oxblood, navy...)
//   a window     small, large, double or offset windows, a smaller attic row on top,
//                French windows behind railings on a hotel
//   a front      by purpose: a house's panelled door, an apartment block's double door,
//                a shop's glazed front (or its shutters, half of them sprayed with
//                graffiti), a garage's roller door, a bank's and a hotel's large doors
//   trim         sill bands, a string course over the ground floor, a crown on the
//                parapet, a plinth, pilasters between the bays on some
//
// Behind every window and door is a room: dark, or -- in a few -- a lamp still burning.
// Some glass is gone, some windows are boarded, some shops shuttered; air conditioners
// hang under windows and downpipes run to the street. Signs, awnings, stoops, canopies
// and the roofs are drawn as before (art/buildings.js).

import * as THREE from 'three';
import { TILE } from '../../sim/grid.js';
import { Rng, hashString } from '../../sim/prng.js';
import { DIR4, TYPES, SURFACES, surface, batch, BOX, PLANE, CYL, PRISM, signAtlas, canvasTex } from './buildings.js';
import { KitBatch, setWallLook } from './kit.js';
import { ground2k } from './ground.js';

const ST = 3;   // the kits' storey and bay, metres
/** Wall lamps at least this far apart, walking the grid (7.5 m and 10.5 m: 5 and 7 cells of 1.5 m). */
const LAMP_GAP_M = 7.5, LAMP_GAP_DARK_M = 10.5;

const PLASTER = ['#e6d6b6', '#dbb98a', '#d29c84', '#b7c3a3', '#a7b6c3', '#dcc9c0', '#c9a467', '#c2baab', '#d8aea4', '#9db19f', '#ebe3d2', '#c78c69', '#b8a2c0'];
const JOINERY = ['#ece7dc', '#2c4a38', '#5c2320', '#24314a', '#1c1c1e', '#4b3425', '#7e8386', '#6d5a3c', '#3d5f6e'];
const BRICK = ['#ffffff', '#efdccd', '#d6cec6', '#f4e2d0', '#cdbcb2', '#e0d4c4'];
// fixed kits; everything else draws plaster or brick by the belt's plaster share plus a lean
const KIT_FIXED = { garage: 'factory', laundry: 'factory', warehouse: 'factory', yardwall: 'factory', parkwall: 'factory' };
const PLASTER_LEAN = { house: 0.3, cafe: 0.25, pharmacy: 0.25, cinema: 0.3, bank: 0.3, hotel: 0.4, clinic: 0.25, apartments: 0.1, shop: 0.05, bar: -0.1, stall: 0.05, ruin: 0 };
const FAMILIES = {
  apart: ['centered_small', 'centered_large', 'centered_double', 'offset_small'],
  factory: ['centered_small', 'centered_medium', 'centered_large', 'centered_double', 'offset_small'],
};
const CROWN_H = { apart: 0.75, factory: 0.32 };

/**
 * Give each planned building its kit, window family, colours and height. Runs right after
 * planBuildings, before anything reads the heights.
 */
export function planKit(plan, seed, town = {}) {
  const PAL = town.palette || PLASTER, BR = town.brick || BRICK, JO = town.joinery || JOINERY;
  const [d0, d1] = town.damage || [0.25, 0.95];
  const nb = new Map(plan.list.map((b) => [b, new Set()]));
  for (const b of plan.list) for (const [x, y] of b.cells) for (const [dx, dy] of DIR4) {
    const o = plan.at(x + dx, y + dy);
    if (o && o !== b) nb.get(b).add(o);
  }
  for (const b of plan.list) {
    const r = new Rng(hashString(`${seed}:kit:${b.id}`), 'kit');
    const near = [...nb.get(b)].filter((o) => o.kit);
    b.kit = KIT_FIXED[b.type] || (r.bool(Math.max(0, Math.min(1, (town.plaster ?? 0.6) + (PLASTER_LEAN[b.type] ?? 0)))) ? 'apart' : 'factory');
    const fams = FAMILIES[b.kit].filter((f) => !near.some((o) => o.kit === b.kit && o.family === f));
    b.family = (fams.length ? fams : FAMILIES[b.kit])[r.int((fams.length ? fams : FAMILIES[b.kit]).length)];
    const pal = b.kit === 'apart' ? PAL : BR;
    const cols = pal.filter((c) => !near.some((o) => o.colour === c));
    b.colour = (cols.length ? cols : pal)[r.int((cols.length ? cols : pal).length)];
    const joins = JO.filter((c) => !near.some((o) => o.joinery === c));
    b.joinery = (joins.length ? joins : JO)[r.int((joins.length ? joins : JO).length)];
    b.piers = b.kit === 'apart' && r.bool(town.piers ?? 0.4);
    // build 42: the belt's own height, damage and roofs
    if (!['stall', 'yardwall', 'parkwall'].includes(b.type)) b.storeys = Math.max(1, Math.min(8, b.storeys + (town.storeys || 0)));
    b.damage = d0 + (d1 - d0) * r.float();
    b.burnt = r.bool(town.burnt ?? 0.22);
    b.pitched = TYPES[b.type].roof === 'pitched' || (town.pitched != null && b.storeys <= 3 && !['garage', 'warehouse', 'yardwall', 'parkwall', 'stall'].includes(b.type) && r.bool(town.pitched));
    b.balconies = b.kit === 'apart' && b.storeys >= 2 && r.bool(town.balconies || 0);
    b.awning = r.bool(town.awnings || 0);
    if (b.type === 'ruin') { b.damage = 1; b.burnt = true; }
    b.gH = ST; b.sH = ST;
    // a yard wall is a brick wall, 2.4 m; a park's is a hedge as high (never lower than the
    // eye: a wall blocks shots and sight at any height, so you must not see over one)
    b.top = b.type === 'yardwall' || b.type === 'parkwall' ? 2.4 : b.storeys * ST;
    b.H = b.top + (b.pitched ? 0 : CROWN_H[b.kit]);
  }
  return plan;
}

// ------------------------------------------------------------------ the room behind a window

function roomTexture(lit) {
  return canvasTex(128, (g, n) => {
    const grd = g.createLinearGradient(0, 0, 0, n);
    if (lit) { grd.addColorStop(0, '#6a4a2c'); grd.addColorStop(0.55, '#c8915a'); grd.addColorStop(1, '#3a2616'); }
    else { grd.addColorStop(0, '#26221e'); grd.addColorStop(0.6, '#1b1815'); grd.addColorStop(1, '#0d0b0a'); }
    g.fillStyle = grd; g.fillRect(0, 0, n, n);
    // a doorway at the back, a wardrobe, a picture: shapes, not detail
    g.fillStyle = lit ? 'rgba(40,24,12,0.55)' : 'rgba(0,0,0,0.35)';
    g.fillRect(n * 0.62, n * 0.3, n * 0.2, n * 0.7);
    g.fillRect(n * 0.08, n * 0.42, n * 0.22, n * 0.58);
    g.fillStyle = lit ? 'rgba(255,220,170,0.25)' : 'rgba(255,255,255,0.04)';
    g.fillRect(n * 0.36, n * 0.28, n * 0.14, n * 0.1);
  });
}

// ------------------------------------------------------------------ the builder

/**
 * @param {object} plan  planBuildings() after planKit()
 * @param {object} o     { map, cellM, seed, heightAt(x, y) for walls that are not buildings, kit, track }
 * @returns {THREE.Object3D[]}
 */
export function buildKitBuildings(plan, { map, cellM: C, seed, heightAt, kit, track, lookAt = () => null, style = {} }) {
  const town = style.town || {}, LS = style.lamps || {}, FX = style.effects || {};
  setWallLook({ brickSat: town.brickSat ?? 1, plasterSat: town.plasterSat ?? 0, weather: style.weathering ?? 0 });
  const { w, h, tiles } = map;
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && tiles[y * w + x] !== TILE.WALL && tiles[y * w + x] !== TILE.BUILDING;
  const K = new KitBatch(kit);
  // things on the pavement you can catch a foot on (Play3D trips over them; the sim never sees them)
  const obstacles = [];
  // lamps that are real lights (the nearest four burn as point lights): wall lamps, and fires
  const lamps = [];
  // build 44: which wall faces already carry something a sign must not cover -- a door, a
  // shop's tall glazing, a garage door, a downpipe, a hedge -- by 'x,y,dx,dy'
  const faceUse = new Set();
  const markFace = (F, run, s0, s1) => {
    for (let a = s0 + 0.05; a < s1; a += 0.4) {
      const pt = F.point(Math.min(a, s1 - 0.05), 0, -0.2);
      faceUse.add(`${Math.floor(pt.x / C)},${Math.floor(pt.z / C)},${run.dx},${run.dy}`);
    }
  };
  const batches = new Map();
  const B = (key, tile = 1.5) => { if (!batches.has(key)) batches.set(key, batch(tile)); return batches.get(key); };
  const atlas = signAtlas(plan.list);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  const UP = new THREE.Vector3(0, 1, 0);

  // the rooms behind the glass: pieces of their own in the batch
  // (unlit: a room never sees the sun, and a lit material behind every window was the costliest overdraw)
  const roomDark = track(new THREE.MeshBasicMaterial({ map: track(roomTexture(false)), color: new THREE.Color(0.55, 0.55, 0.55), name: 'room-dark' }));
  const roomLit = track(new THREE.MeshBasicMaterial({ map: track(roomTexture(true)), color: new THREE.Color(...(town.litColor || [1.7, 1.45, 1.15])), name: 'room-lit' }));
  // build 42, EMBER: rooms still burning
  const roomFire = track(new THREE.MeshBasicMaterial({ map: track(roomTexture(true)), color: new THREE.Color(FX.fires?.color || '#ff8c3c').multiplyScalar(3.2), name: 'room-fire' }));
  roomDark.userData.kitRole = 'prop'; roomLit.userData.kitRole = 'prop'; roomFire.userData.kitRole = 'prop';
  const roomGeo = track(new THREE.PlaneGeometry(1, 1));
  kit.define?.('room/dark', [{ geo: roomGeo, mat: roomDark, role: 'prop' }]);
  kit.define?.('room/lit', [{ geo: roomGeo, mat: roomLit, role: 'prop' }]);
  kit.define?.('room/fire', [{ geo: roomGeo, mat: roomFire, role: 'prop' }]);

  const has = (k, name) => kit.has(`${k}/${name}`);
  const boxOf = (k, name) => kit.piece(`${k}/${name}`).box;

  // ---- a run of wall: the faces of one building in one plane, in a row
  const runsOf = (b) => {
    const faces = new Map();
    for (const [x, y] of b.cells) for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy;
      const o = plan.at(nx, ny);
      if (o === b) continue;
      const isOpen = open(nx, ny);
      const out = nx < 0 || ny < 0 || nx >= w || ny >= h;
      const nh = isOpen ? 0 : o ? o.H : out ? b.H : heightAt(nx, ny);
      if (nh >= b.H - 0.01) continue;
      const key = `${dx},${dy},${dx ? x : y},${nh.toFixed(2)},${isOpen ? 1 : 0}`;
      if (!faces.has(key)) faces.set(key, { dx, dy, plane: dx ? x : y, from: nh, open: isOpen, along: [] });
      faces.get(key).along.push(dx ? y : x);
    }
    const runs = [];
    const fronts = new Set(b.front.map(([x, y]) => `${x},${y}`));
    for (const f of faces.values()) {
      f.along.sort((a1, a2) => a1 - a2);
      let a0 = f.along[0];
      for (let i = 1; i <= f.along.length; i++) {
        if (i < f.along.length && f.along[i] === f.along[i - 1] + 1) continue;
        const a1 = f.along[i - 1];
        const cellsIn = [];
        for (let a = a0; a <= a1; a++) cellsIn.push(f.dx ? `${f.plane},${a}` : `${a},${f.plane}`);
        runs.push({ ...f, a0, a1, main: f.open && f.dx === b.main[0] && f.dy === b.main[1] && cellsIn.some((c) => fronts.has(c)) });
        if (i < f.along.length) a0 = f.along[i];
      }
    }
    return runs;
  };

  // ---- where things go on a run: s metres along it, y up, z proud of the wall
  const frame = (run) => {
    const yaw = Math.atan2(run.dx, run.dy);
    const tx = Math.cos(yaw), tz = -Math.sin(yaw);
    const L = (run.a1 - run.a0 + 1) * C;
    let qx, qz;
    if (run.dx) { qx = (run.plane + 0.5 + run.dx * 0.5) * C; qz = tz > 0 ? run.a0 * C : (run.a1 + 1) * C; }
    else { qz = (run.plane + 0.5 + run.dy * 0.5) * C; qx = tx > 0 ? run.a0 * C : (run.a1 + 1) * C; }
    const rot = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    return {
      L, yaw, rot,
      /** a matrix for a piece whose origin is at (s, y), z proud, scaled (sx, sy, sz) */
      at(sAlong, y, z = 0, sx = 1, sy = 1, sz = 1) {
        v.set(qx + tx * sAlong + run.dx * z, y, qz + tz * sAlong + run.dy * z);
        return m4.compose(v, rot, s.set(sx, sy, sz));
      },
      point(sAlong, y, z) { return new THREE.Vector3(qx + tx * sAlong + run.dx * z, y, qz + tz * sAlong + run.dy * z); },
    };
  };

  // ---- one building
  for (const b of plan.list) {
    const r = new Rng(hashString(`${seed}:kitdraw:${b.id}`), 'kitdraw');
    const fire = !!FX.fires && b.type !== 'yardwall' && r.bool(FX.fires.share);
    let fireLit = false;
    const T = TYPES[b.type];
    const k = b.kit;
    const colours = { wall: b.colour, frame: b.joinery, trim: k === 'apart' ? new THREE.Color(b.colour).lerp(new THREE.Color('#f2eee6'), 0.55) : '#e8e2da', glass: '#ffffff' };
    const runs = runsOf(b);
    const mains = runs.filter((rn) => rn.main).sort((x, y) => (y.a1 - y.a0) - (x.a1 - x.a0));
    const doorRun = mains[0] || runs.find((rn) => rn.open) || null;
    const roofY = b.top;
    const dadoY = k === 'apart' ? 2.5 : 2.45;

    for (const run of runs) {
      const F = frame(run);
      const n = Math.max(1, Math.round(F.L / ST));
      const bw = F.L / n, sx = bw / ST;
      const r2 = new Rng(hashString(`${seed}:run:${b.id}:${run.dx},${run.dy},${run.plane},${run.a0}`), 'run');

      if (b.type === 'parkwall') { markFace(F, run, 0, F.L); continue; }   // a hedge: drawn whole with the roofs below
      if (b.type === 'yardwall') {
        // a brick wall round a yard: blank bays 2.4 m high between piers, a coping on top
        const sy = roofY / 3;
        for (let i = 0; i < n; i++) {
          K.put('factory/wall_standard_standard_01', F.at((i + 1) * bw, 0, 0, sx, sy), colours);
          K.put('factory/crown_standard_standard_01', F.at((i + 1) * bw, roofY, 0, sx), colours);
          if (i > 0) K.put('factory/wall_pier_standard_01', F.at(i * bw, 0, 0, 1, sy), colours);
        }
        K.put('factory/crown_end_01', F.at(0, roofY), colours); K.put('factory/crown_end_02', F.at(F.L, roofY), colours);
        continue;
      }
      if (!run.open) {
        // a party wall above a lower neighbour: blank, with the crown along its top
        for (let st = Math.max(0, Math.floor(run.from / ST)); st < b.storeys; st++) for (let i = 0; i < n; i++) K.put(`${k}/wall_standard_standard_01`, F.at((i + 1) * bw, st * ST, 0, sx), colours);
        if (!b.pitched) for (let i = 0; i < n; i++) K.put(`${k}/crown_standard_standard_01`, F.at((i + 1) * bw, roofY, 0, sx), colours);
        continue;
      }

      const isDoorRun = run === doorRun;
      const doorBay = isDoorRun ? Math.floor(n / 2) : -1;
      const side = !run.main;
      // a garage's roller door takes two bays
      const garage = T.ground === 'garage' && isDoorRun && F.L >= 4.4;
      const garageW = garage ? (F.L >= 7.4 ? F.L * 2 / 3 : F.L) : 0;

      // ---- the ground floor
      const ground = (i, s0, wB) => {
        const sxB = wB / ST;
        const at = (y, z = 0, sy = 1) => F.at(s0 + wB, y, z, sxB, sy);
        const gs = side ? 'plain' : T.ground;
        if (i === doorBay) {
          markFace(F, run, s0, s0 + wB);
          let wall, ins, dado;
          if (k === 'apart') {
            if (['lobby', 'bank', 'hotel', 'clinic', 'cinema'].includes(gs)) { wall = 'wall_door_centered_large_01'; ins = 'door_centered_large_01'; dado = 'dado_door_centered_large_01'; }
            else if (gs === 'shopfront' || gs === 'pharmacy' || gs === 'cafe') { const o = 1 + r2.int(2); wall = `wall_door_offset_small_0${o}`; ins = `door_offset_small_0${o}`; dado = `dado_door_offset_small_0${o}`; }
            else { const v2 = 1 + r2.int(2); wall = `wall_door_centered_small_0${v2}`; ins = `door_centered_small_0${v2}`; dado = `dado_door_centered_small_0${v2}`; }
          } else if (['lobby', 'bank', 'hotel'].includes(gs)) { wall = 'wall_door_recessed_large_01'; ins = 'door_recessed_large_01'; dado = 'dado_door_recessed_large_01'; }
          else if (gs === 'shopfront' || gs === 'pub' || gs === 'laundry') { wall = 'wall_door_recessed_small_01'; ins = 'door_recessed_small_01'; dado = 'dado_door_recessed_small_01'; }
          else { const v2 = 1 + r2.int(2); wall = `wall_door_centered_small_01`; ins = `door_centered_small_0${v2}`; dado = 'dado_door_centered_small_01'; }
          K.put(`${k}/${wall}`, at(0), colours);
          K.put(`${k}/${ins}`, at(0), colours);
          room(k, ins, at, r2, 0.04);
          if (has(k, dado)) K.put(`${k}/${dado}`, at(dadoY), colours);
          if (r2.bool(b.damage * 0.35)) planks(F, s0 + wB / 2, k, ins, wB / ST);
          return;
        }
        if (gs === 'shopfront' || gs === 'cafe' || gs === 'pharmacy' || gs === 'laundry') {
          // display glass; a third of them behind a roller shutter, half of those sprayed
          if (k !== 'apart') markFace(F, run, s0, s0 + wB);     // brick shop glazing runs to 3 m
          const wall = k === 'apart' ? 'wall_door_window_small_01' : 'wall_window_tall_large_01';
          const ins = k === 'apart' ? 'door_window_small_01' : 'window_tall_large_01';
          const shut = r2.bool(0.2 + b.damage * 0.35);
          K.put(`${k}/${wall}`, at(0), colours);
          K.put(`${k}/${ins}`, at(0), colours, { glass: !r2.bool(b.damage * 0.25) });
          room(k, ins, at, r2, 0.12);
          if (k === 'apart') K.put('apart/dado_door_window_small_01', at(dadoY), colours);
          if (shut) {
            const bx = boxOf(k, ins);
            const gw = (bx.max.x - bx.min.x) * sxB, gh = bx.max.y - bx.min.y;
            const name = r2.bool(0.5) ? 'shutterwin/rollershutter_window_01_graffiti' : 'shutterwin/rollershutter_window_01';
            const sb = kit.piece(name).box;
            const cx = s0 + wB + ((bx.min.x + bx.max.x) / 2) * sxB;
            K.put(name, F.at(cx - ((sb.min.x + sb.max.x) / 2) * gw / (sb.max.x - sb.min.x), bx.min.y - sb.min.y * gh / (sb.max.y - sb.min.y), 0.14, gw / (sb.max.x - sb.min.x), gh / (sb.max.y - sb.min.y), 0.6), colours);
            markFace(F, run, s0, s0 + wB);   // build 46: the shutter's box stands where a plate would go
          }
          return;
        }
        if (gs === 'garage' && garage) return;   // drawn whole below
        // windows (a back wall: often blank)
        if (side && r2.bool(0.45)) { K.put(`${k}/wall_standard_standard_01`, at(0), colours); return; }
        if (side && r2.bool(0.12)) {
          const wall = k === 'apart' ? 'wall_door_offset_small_02' : 'wall_door_centered_small_02', ins = k === 'apart' ? 'door_offset_small_02' : 'door_centered_small_02';
          K.put(`${k}/${wall}`, at(0), colours); K.put(`${k}/${ins}`, at(0), colours); room(k, ins, at, r2, 0.02);
          return;
        }
        const [wall, ins] = windowNames(k, b.family, 0, b.storeys, i);
        K.put(`${k}/${wall}`, at(0), colours);
        windowState(b, F, k, ins, at, r2, s0 + wB / 2, sxB);
        K.put(`${k}/${k === 'apart' ? 'base_standard_01' : 'base_standard_standard_01'}`, at(0, 0, k === 'apart' ? 0.4 : 0.75), colours);
        K.put(`${k}/dado_standard_standard_01`, at(dadoY), colours);
      };

      // ---- what goes where in one window bay, by the building's damage
      function windowState(bb, FF, kk, ins, at, rr, sMid, sxB, y0 = 0) {
        const roll = rr.float(), d = bb.damage;
        const pb = Math.min(0.95, (0.08 + d * 0.22) * (town.broken ?? 1));
        const broken = roll < pb;
        const boarded = !broken && roll < pb + (0.04 + d * 0.14) * (town.boarded ?? 1);
        K.put(`${kk}/${ins}`, at(0), colours, { glass: !broken });
        room(kk, ins, at, rr, town.lit ?? 0.05);
        if (boarded) planks(FF, sMid, kk, ins, sxB);
        else if (!broken && rr.bool(town.shutters || 0)) shutterOver(FF, kk, ins, sMid, sxB, y0, rr);
        if (bb.burnt && rr.bool(0.35)) {
          const bx = boxOf(kk, ins);
          e.set(0, FF.yaw, 0, 'YXZ');
          m4.compose(FF.point(sMid, 0, 0.02).setY(bx.max.y + 0.55), q.setFromEuler(e), s.set((bx.max.x - bx.min.x) * sxB * 1.4, 1.3, 1));
          B('soot').add(PLANE, m4, '#ffffff');
        }
      }

      // ---- the room behind an opening: dark, or now and then a lamp still on
      function room(kk, ins, at, rr, pLit) {
        const bx = boxOf(kk, ins);
        const burning = fire && rr.bool(0.65);
        const lit = !burning && rr.bool(pLit);
        const wB = bx.max.x - bx.min.x, hB = bx.max.y - bx.min.y;
        // a 1 x 1 plane centred on its origin: shift to the opening's centre, set back
        const mm = at(0).clone();
        const local = new THREE.Matrix4().compose(new THREE.Vector3((bx.min.x + bx.max.x) / 2, (bx.min.y + bx.max.y) / 2, kk === 'apart' ? -0.32 : -0.42), new THREE.Quaternion(), new THREE.Vector3(wB, hB, 1));
        mm.multiply(local);
        K.put(burning ? 'room/fire' : lit ? 'room/lit' : 'room/dark', mm, { prop: burning ? new THREE.Color(0.7 + rr.float() * 0.5, 0.7 + rr.float() * 0.3, 0.7) : lit ? '#ffffff' : new THREE.Color(0.75 + rr.float() * 0.5, 0.75 + rr.float() * 0.5, 0.75 + rr.float() * 0.5) });
        // the fire's light on the street: one real light per burning building, a metre out
        if (burning && !fireLit) {
          fireLit = true;
          const wp = new THREE.Vector3().setFromMatrixPosition(mm);
          const F2 = FX.fires;
          lamps.push({ x: wp.x + run.dx * 1.1, y: Math.min(wp.y, 3.2), z: wp.z + run.dy * 1.1, color: F2.color, intensity: F2.intensity, distance: F2.distance, fire: true });
        }
      }

      // ---- a roller shutter pulled down over an opening (a storm shutter, a shop's)
      function shutterOver(FF, kk, ins, sMid, sxB, y0, rr) {
        const bx = boxOf(kk, ins);
        const gw = (bx.max.x - bx.min.x) * sxB, gh = bx.max.y - bx.min.y;
        const name = rr.bool(0.35) ? 'shutterwin/rollershutter_window_01_graffiti' : 'shutterwin/rollershutter_window_01';
        const sb = kit.piece(name).box;
        const fx2 = gw / (sb.max.x - sb.min.x), fy = gh / (sb.max.y - sb.min.y);
        K.put(name, FF.at(sMid - ((sb.min.x + sb.max.x) / 2) * fx2, y0 + bx.min.y - sb.min.y * fy, 0.14, fx2, fy, 0.6), colours);
        if (y0 < 1) markFace(FF, run, sMid - gw / 2, sMid + gw / 2);   // build 46: its box hid a plate
      }

      // ---- boards nailed over an opening
      function planks(FF, sMid, kk, ins, sxB) {
        const bx = boxOf(kk, ins);
        const wB = (bx.max.x - bx.min.x) * sxB + 0.2, y0 = bx.min.y, hB = bx.max.y - bx.min.y;
        const nP = Math.max(3, Math.round(hB / 0.32));
        for (let j = 0; j < nP; j++) {
          if (r2.bool(0.2)) continue;
          e.set(0, FF.yaw, (r2.float() - 0.5) * 0.12, 'YXZ');
          m4.compose(FF.point(sMid, 0, 0.1).setY(y0 + (j + 0.5) * hB / nP), q.setFromEuler(e), s.set(wB, 0.17, 0.03));
          B('PaintedWood005', SURFACES.PaintedWood005).add(BOX, m4, ['#8a7a66', '#6e6052', '#9a8a74', '#7c6a58'][r2.int(4)]);
        }
      }

      // bays, ground floor first
      for (let i = 0; i < n; i++) {
        const s0 = i * bw;
        if (garage && s0 < garageW - 1e-6) continue;
        ground(i, s0, bw);
      }
      if (garage) {
        markFace(F, run, 0, garageW);
        const gsx = garageW / 6;
        const ins = r2.bool(0.5) ? 'door_garage_door_01' : 'door_garage_door_02';
        K.put('factory/wall_door_garage_door_01', F.at(garageW, 0, 0, gsx), colours);
        K.put(`factory/${ins}`, F.at(garageW, 0, 0, gsx), colours);
        K.put('factory/dado_garage_door_01', F.at(garageW, 2.45, 0, gsx), colours);
        if (k === 'apart') K.put('factory/wall_standard_standard_01', F.at(garageW, 0, -0.01, gsx), colours);
      }

      // the upper storeys
      for (let st = 1; st < b.storeys; st++) {
        for (let i = 0; i < n; i++) {
          const at = (y, z = 0, sy = 1) => F.at((i + 1) * bw, st * ST + y, z, sx, sy);
          if (side && r2.bool(0.4)) { K.put(`${k}/wall_standard_standard_01`, at(0), colours); continue; }
          let wall, ins;
          if ((b.type === 'hotel' || b.balconies) && !side && k === 'apart') { const vv = st === 1 ? 1 : st === 2 ? 5 : 9; wall = `wall_door_window_small_0${vv}`; ins = `door_window_small_0${vv}`; }
          else [wall, ins] = windowNames(k, b.family, st, b.storeys, i);
          if (!has(k, wall) || !has(k, ins)) { wall = 'wall_standard_standard_01'; ins = null; }
          K.put(`${k}/${wall}`, at(0), colours);
          if (ins) windowState(b, F, k, ins, at, r2, i * bw + bw / 2, sx, st * ST);
          if (st < b.storeys - 1 || b.pitched) K.put(`${k}/${ins && /door_window/.test(ins) ? 'dado_door_window_small_01' : 'dado_standard_standard_01'}`, at(dadoY), colours);
          if ((b.type === 'hotel' || b.balconies) && !side && ins && /door_window/.test(ins)) {
            // a railing across each French window
            for (const yy of [0.95]) box('metal', F, i * bw + bw / 2, st * ST + yy, 0.18, bw * 0.8, 0.04, 0.04, '#1e1e1e');
            for (let kk = -4; kk <= 4; kk++) box('metal', F, i * bw + bw / 2 + kk * bw * 0.09, st * ST + 0.48, 0.18, 0.02, 0.95, 0.02, '#1e1e1e');
          }
          // an air conditioner under one window in eight
          if (ins && r2.bool(town.aircon ?? 0.07)) {
            const name = r2.bool(0.5) ? 'aircon/exterior_aircon_unit' : 'aircon/exterior_aircon_unit_rusted';
            const ab = kit.piece(name).box, bx = boxOf(k, ins);
            K.put(name, F.at(i * bw + bw / 2 - (ab.min.x + ab.max.x) / 2, st * ST + Math.max(0.05, bx.min.y - (ab.max.y - ab.min.y) - 0.05) - ab.min.y, 0.03 - ab.min.z), {});
          }
        }
      }

      // trim: string course over the ground floor, crown at the top, ends, pilasters
      const cornice = k === 'apart' ? 'cornice_standard_standard_01' : 'cornice01_standard_standard_01';
      for (let i = 0; i < n; i++) {
        if (b.storeys > 1) K.put(`${k}/${cornice}`, F.at((i + 1) * bw, ST, 0, sx), colours);
        if (!b.pitched) K.put(`${k}/crown_standard_standard_01`, F.at((i + 1) * bw, roofY, 0, sx), colours);
        else K.put(`${k}/${cornice}`, F.at((i + 1) * bw, roofY - 0.2, 0, sx), colours);
      }
      if (!b.pitched) { K.put(`${k}/crown_end_01`, F.at(0, roofY), colours); K.put(`${k}/crown_end_02`, F.at(F.L, roofY), colours); }
      if (b.piers) for (let i = 1; i < n; i++) {
        for (let st = 0; st < b.storeys; st++) K.put('apart/wall_pier_standard_01', F.at(i * bw, st * ST), colours);
        if (!b.pitched) K.put('apart/crown_pier_pedestal_01', F.at(i * bw, roofY), colours);
      }
      // a downpipe from the roof at one end of most fronts
      if (r2.bool(0.4)) {
        const end = r2.bool(0.5) ? 0.22 : F.L - 0.22;
        markFace(F, run, Math.max(0, end - 0.2), Math.min(F.L, end + 0.2));
        const pb = kit.piece('gutter/modular_metal_gutter_section').box;
        K.put('gutter/modular_metal_gutter_section', F.at(end - (pb.min.x + pb.max.x) / 2, 0, 0.1 - pb.min.z, 1, roofY / (pb.max.y - pb.min.y)), {});
      }

      // ---- signs, awnings, canopies, steps: what the street reads the building by
      if (isDoorRun && !side) {
        const mid = doorBay * bw + bw / 2;
        if (b.sign && atlas.wide.has(b.id) && T.ground !== 'lobby' && T.ground !== 'house') {
          const width = Math.min(F.L - 0.4, 4.6), hgt = Math.min(width / 4.2, 0.62);
          e.set(0, F.yaw, 0, 'YXZ');
          m4.compose(F.point(F.L / 2, 2.78, 0.16), q.setFromEuler(e), s.set(width, hgt, 1));
          B('sign').add(PLANE, m4, '#ffffff', atlas.wide.get(b.id));
          box('paint', F, F.L / 2, 2.78, 0.1, width + 0.12, hgt + 0.1, 0.1, '#1a1a1a');
          markFace(F, run, F.L / 2 - width / 2 - 0.1, F.L / 2 + width / 2 + 0.1);   // build 46: a fascia hid a plate
        }
        if (b.type === 'apartments' && b.sign) {
          e.set(0, F.yaw, 0, 'YXZ');
          m4.compose(F.point(mid + 0.95 * sx, 2.2, 0.03), q.setFromEuler(e), s.set(0.42, 0.105, 1));
          B('sign').add(PLANE, m4, '#ffffff', atlas.wide.get(b.id));
        }
        if ((T.ground === 'cafe' && r2.bool(0.85)) || (b.awning && ['shopfront', 'pharmacy', 'laundry', 'pub'].includes(T.ground))) {
          markFace(F, run, 0, F.L);   // a sign would sit under the awning
          const torn = r2.bool(b.damage * 0.5);
          box('cloth', F, F.L / 2, 2.35, 0.75, F.L - 0.2, 0.04, 1.45, b.paint2, torn ? 0.95 : 0.35, torn ? 0.25 : 0);
        }
        if (T.ground === 'hotel') {
          box('paint', F, mid, 2.95, 1.0, 2.6, 0.18, 2.0, b.joinery);
          markFace(F, run, mid - 1.3, mid + 1.3);   // build 46: nor under a hotel's canopy
          for (const sd of [-1, 1]) { const pp = F.point(mid + sd * 1.1, 1.45, 1.9); cyl('metal', pp, 0.04, 2.9, '#2a2a2a'); obstacles.push({ x: pp.x, z: pp.z, r: 0.1, kind: 'metal' }); }
        }
        if (T.ground === 'bank') {
          for (let kk = 0; kk < 3; kk++) box('Concrete042C', F, mid, 0.09 + kk * 0.18, 0.75 - kk * 0.25, bw, 0.18, 0.5, '#b0aba0');
          const sp = F.point(mid, 0, 0.6); obstacles.push({ x: sp.x, z: sp.z, r: Math.min(1.2, bw / 2), kind: 'step' });
        }
        if (T.ground === 'house') {
          for (let kk = 0; kk < 3; kk++) box('Concrete042C', F, mid, 0.1 + kk * 0.2, 0.85 - kk * 0.27, 1.3, 0.2, 0.55, '#a39e94');
          const sp = F.point(mid, 0, 0.7); obstacles.push({ x: sp.x, z: sp.z, r: 0.62, kind: 'step' });
          if (r2.bool(0.4)) for (const kk of [-0.07, 0.07]) box('cloth', F, mid + 0.35 + kk, 0.68, 0.45, 0.09, 0.07, 0.25, ['#2a2420', '#3a3028', '#2c2c30'][r2.int(3)]);
        }
        if (atlas.tall.has(b.id)) {
          const at = F.point(Math.min(F.L - 0.4, mid + bw * 0.5 + 0.2), 4.4, 0.55);
          for (const flip of [0, Math.PI]) {
            m4.compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, F.yaw + Math.PI / 2 + flip, 0, 'YXZ')), s.set(0.42, 1.65, 1));
            B('sign').add(PLANE, m4, '#ffffff', atlas.tall.get(b.id));
          }
          box('metal', F, Math.min(F.L - 0.4, mid + bw * 0.5 + 0.2), 5.3, 0.45, 0.04, 0.04, 0.9, '#1e1e1e');
        }
        // brick and plaster fallen onto the pavement in front of the worst
        if (b.damage > 0.6 && r2.bool(0.6)) for (let kk = 0; kk < 6 + r2.int(8); kk++) {
          e.set(r2.float(), r2.float() * 6, r2.float(), 'YXZ');
          const dp = F.point(r2.float() * F.L, 0.04, 0.15 + r2.float() * 0.55);
          m4.compose(dp, q.setFromEuler(e), s.set(0.08 + r2.float() * 0.18, 0.05 + r2.float() * 0.08, 0.1 + r2.float() * 0.12));
          B(k === 'apart' ? 'Plaster001' : 'Bricks051', 1.6).add(BOX, m4, k === 'apart' ? b.colour : `#${new THREE.Color(b.colour).multiplyScalar(0.8).getHexString()}`);
          if (kk % 3 === 0) obstacles.push({ x: dp.x, z: dp.z, r: 0.18, kind: 'rubble' });
        }
      }
    }

    // ---- a park's hedge: overgrown, a little uneven along the top
    if (b.type === 'parkwall') {
      const mine = new Set(b.cells.map(([x, y]) => `${x},${y}`));
      for (const [x, y] of b.cells) {
        const hh = 2.4 + (r.float() - 0.5) * 0.35;
        m4.compose(v.set((x + 0.5) * C, hh / 2, (y + 0.5) * C), q.identity(), s.set(C * 1.02, hh, C * 1.02));
        B('hedge', 1.4).add(BOX, m4, ['#4f6a3c', '#4a6236', '#567242', '#465c34'][r.int(4)]);
        // build 43: a loose outer layer of leaf cards on every open face and the top, so a
        // hedge has a ragged edge instead of a box's
        for (const [dx, dy] of DIR4) {
          if (mine.has(`${x + dx},${y + dy}`)) continue;
          for (const off of [0.05, 0.12]) {
            e.set(0, Math.atan2(dx, dy), 0, 'YXZ');
            m4.compose(v.set((x + 0.5 + dx * 0.51) * C + dx * off, hh / 2 + off * 0.5, (y + 0.5 + dy * 0.51) * C + dy * off), q.setFromEuler(e), s.set(C * 1.08, hh + 0.12, 1));
            B('leaves').add(PLANE, m4, ['#5d7a44', '#66844a', '#55703e'][r.int(3)]);
          }
        }
        e.set(-Math.PI / 2, 0, 0, 'YXZ');
        m4.compose(v.set((x + 0.5) * C, hh + 0.06, (y + 0.5) * C), q.setFromEuler(e), s.set(C * 1.12, C * 1.12, 1));
        B('leaves').add(PLANE, m4, '#6a8a4e');
      }
      continue;
    }
    // ---- roofs
    for (const [x, y] of b.cells) {
      if (b.pitched) {
        e.set(0, b.main[0] !== 0 ? Math.PI / 2 : 0, 0, 'YXZ');
        m4.compose(v.set((x + 0.5) * C, roofY, (y + 0.5) * C), q.setFromEuler(e), s.set(C + 0.02, 1.8, C + 0.36));
        B('roofslate', 1.2).add(PRISM, m4, '#4a4b4e');
        if (r.bool(0.14)) { m4.compose(v.set((x + 0.5) * C + 0.3, roofY + 1.5, (y + 0.5) * C), q.identity(), s.set(0.5, 1.4, 0.6)); B('Bricks051', SURFACES.Bricks051).add(BOX, m4, '#c8b0a0'); }
      } else {
        m4.compose(v.set((x + 0.5) * C, roofY + 0.05, (y + 0.5) * C), q.identity(), s.set(C, 0.02, C));
        B('Concrete042C', SURFACES.Concrete042C).add(BOX, m4, '#6a665e');
      }
    }
    if (!b.pitched) for (let kk = 0; kk < 1 + r.int(3); kk++) {
      const [x, y] = b.cells[r.int(b.cells.length)];
      cyl('metal', new THREE.Vector3((x + 0.3 + r.float() * 0.4) * C, roofY + 0.4, (y + 0.3 + r.float() * 0.4) * C), 0.12 + r.float() * 0.1, 0.7, '#4a4a4a');
    }
    if (T.roof === 'tank' && r.bool(0.3)) {
      const cx = b.cells.reduce((a, c) => a + c[0] + 0.5, 0) / b.cells.length * C, cz = b.cells.reduce((a, c) => a + c[1] + 0.5, 0) / b.cells.length * C;
      cyl('WoodSiding009', new THREE.Vector3(cx, roofY + 2.0, cz), 0.9, 1.8, '#9a8a74');
      for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) cyl('metal', new THREE.Vector3(cx + ox, roofY + 0.55, cz + oz), 0.05, 1.1, '#2a2a2a');
    }
  }

  // drawn-geometry helpers (art/buildings.js batches)
  function box(key, F, along, y, out, bw2, bh, bd, colour, tilt = 0, roll = 0) {
    e.set(tilt, F.yaw, roll, 'YXZ');
    m4.compose(F.point(along, y, out), q.setFromEuler(e), s.set(bw2, bh, bd));
    B(key, SURFACES[key] || 1.5).add(BOX, m4, colour);
  }
  function cyl(key, p, rad, len, colour) {
    m4.compose(p, q.identity(), s.set(rad, len, rad));
    B(key, SURFACES[key] || 1.5).add(CYL, m4, colour);
  }

  // ---- the street: what was left outside when people went quiet
  const bulbMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.1, 1.5), name: 'bulb' }));
  bulbMat.userData.kitRole = 'prop';
  kit.define?.('x/bulb', [{ geo: track(new THREE.SphereGeometry(0.045, 8, 6)), mat: bulbMat, role: 'prop' }]);
  const isWallT = (x, y) => x < 0 || y < 0 || x >= w || y >= h || tiles[y * w + x] === TILE.WALL;
  const floorT = (x, y) => x >= 0 && y >= 0 && x < w && y < h && tiles[y * w + x] === TILE.FLOOR;
  const pm = new THREE.Matrix4(), pq = new THREE.Quaternion(), pv = new THREE.Vector3(), ps = new THREE.Vector3(), pc = new THREE.Matrix4();
  // a prop standing on the ground, its footprint centred on (x, z), turned by yaw
  const prop = (name, x, z, yaw, sc = 1, colours = {}, y = 0) => {
    const bx = kit.piece(name).box;
    pc.makeTranslation(-(bx.min.x + bx.max.x) / 2, -bx.min.y, -(bx.min.z + bx.max.z) / 2);
    pm.compose(pv.set(x, y, z), pq.setFromAxisAngle(UP, yaw), ps.setScalar(sc)).multiply(pc);
    K.put(name, pm, colours);
    if (!/manhole/.test(name) && y < 0.1) {
      const rr = Math.max(bx.max.x - bx.min.x, bx.max.z - bx.min.z) * sc * 0.42;
      obstacles.push({ x, z, r: rr, kind: /can|ubox|barrel/.test(name) ? 'metal' : /crate|bench/.test(name) ? 'wood' : 'soft' });
    }
  };
  const lampAt = [];
  const PROP_PER_CELL = C / 1.5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!floorT(x, y)) continue;
    const r = new Rng(hashString(`${seed}:street:${x},${y}`), 'street');
    const cx = (x + 0.5) * C, cz = (y + 0.5) * C;
    const walls = DIR4.filter(([dx, dy]) => isWallT(x + dx, y + dy));
    const L = lookAt(x, y), place = L ? L.type : 'street';
    if (!walls.length) {
      if (place === 'street' && r.bool(0.035)) prop('manhole/cover', cx + (r.float() - 0.5) * 0.4, cz + (r.float() - 0.5) * 0.4, r.float() * 6.28, 1, {}, 0.004);
      continue;
    }
    const [dx, dy] = walls[r.int(walls.length)];
    const yawOut = Math.atan2(-dx, -dy);                      // facing away from the wall
    const at = (d) => [cx + dx * (C / 2 - d), cz + dy * (C / 2 - d)];
    // how wide is it here: open cells straight out from the wall
    let width = 0;
    while (width < 5 && !isWallT(x - dx * (width + 1), y - dy * (width + 1))) width++;
    // a lamp on the wall where it is narrow and dark; most still burn, warm (never on a
    // yard wall: it is lower than the lamp)
    const wallB = plan.at(x + dx, y + dy);
    const tallEnough = wallB ? wallB.top >= 3 : heightAt(x + dx, y + dy) >= 3.3;
    if (tallEnough && (width <= 2 && r.bool(0.3) && !lampAt.some(([lx, ly]) => (Math.abs(lx - x) + Math.abs(ly - y)) * C < LAMP_GAP_M) && LS.intensity !== 0 || (LS.intensity === 0 && width <= 2 && r.bool(0.12) && !lampAt.some(([lx, ly]) => (Math.abs(lx - x) + Math.abs(ly - y)) * C < LAMP_GAP_DARK_M)))) {
      lampAt.push([x, y]);
      faceUse.add(`${x + dx},${y + dy},${-dx},${-dy}`);   // no sign under a lamp
      const [lx, lz] = [cx + dx * (C / 2), cz + dy * (C / 2)];
      pm.compose(pv.set(lx, 2.9, lz), pq.setFromAxisAngle(UP, yawOut), ps.setScalar(1.25));
      K.put('walllamp/industrial_wall_lamp', pm, {});
      if (LS.intensity !== 0 && r.bool(LS.burn ?? 0.75)) {
        pm.compose(pv.set(lx - dx * 0.11, 2.83, lz - dy * 0.11), pq.identity(), ps.setScalar(1));
        K.put('x/bulb', pm, {});
        lamps.push({ x: lx - dx * 0.5, y: 2.6, z: lz - dy * 0.5 });
      }
    }
    // things against the wall, by place; the odds are per 1.5 m of wall, so a longer cell
    // gets proportionally more (build 45: the same clutter per metre as at 1.5 m cells)
    const roll = r.float() / PROP_PER_CELL;
    if ((place === 'street' || place === 'tenements') && roll < 0.05) {
      const [px, pz] = at(0.36);
      prop(r.bool(0.55) ? 'can/rusty' : 'can/clean', px, pz, yawOut + (r.float() - 0.5) * 0.5);
      if (r.bool(0.6)) { const [bx2, bz2] = at(0.3); prop('bag/trashbag', bx2 + dy * 0.55, bz2 - dx * 0.55, r.float() * 6.28, 0.9 + r.float() * 0.25); }
    } else if ((place === 'street' || place === 'tenements') && roll < 0.09) {
      for (let k2 = 0; k2 < 1 + r.int(3); k2++) { const [px, pz] = at(0.28 + r.float() * 0.2); prop('bag/trashbag', px + (r.float() - 0.5) * 0.9 * Math.abs(dy), pz + (r.float() - 0.5) * 0.9 * Math.abs(dx), r.float() * 6.28, 0.85 + r.float() * 0.3); }
    } else if ((place === 'yards' || place === 'depot' || place === 'market' || (style.props?.harbour && roll < 0.15)) && roll < 0.15) {
      const [px, pz] = at(0.36);
      const pick = r.int(4);
      if (pick === 0) prop('barrel/barrel_03', px, pz, r.float() * 6.28);
      else if (pick === 1) { prop('crate/crate', px, pz, yawOut + (r.float() - 0.5) * 0.3); if (r.bool(0.4)) prop('crate/crate', px, pz, yawOut + (r.float() - 0.5) * 0.6, 1, {}, 0.32); }
      else if (pick === 2) for (let k2 = 0; k2 < 1 + r.int(2); k2++) prop('tyre/old_tyre', px + dy * (k2 * 0.3 - 0.15), pz - dx * (k2 * 0.3 - 0.15), Math.atan2(-dy, dx) + (r.float() - 0.5) * 0.3);
      else prop('can/rusty', px, pz, r.float() * 6.28);
    } else if ((place === 'plaza' || place === 'park' || place === 'canal') && roll < 0.07 * (style.props?.benches ?? 1) && width >= 2) {
      const [px, pz] = at(0.3);
      prop('bench/painted_wooden_bench', px, pz, yawOut);
    } else if (roll < 0.1 && roll >= 0.095) {
      const [px, pz] = at(0.25);
      prop('ubox/utility_box_01_box', px, pz, yawOut);
    }
  }

  // ---- meshes
  const out = K.build(track);
  const soot = canvasTex(64, (g, nn) => { const grd = g.createLinearGradient(0, nn, 0, 0); grd.addColorStop(0, 'rgba(0,0,0,0.85)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, nn, nn); }, false);
  const canvasStripe = canvasTex(256, (g, nn) => { for (let x = 0; x < nn; x += 32) { g.fillStyle = (x / 32) % 2 ? '#d8d4ca' : '#ffffff'; g.fillRect(x, 0, 32, nn); } });
  const slate = canvasTex(256, (g, nn) => { g.fillStyle = '#6a6c70'; g.fillRect(0, 0, nn, nn); for (let y = 0; y < nn; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < nn; x += 32) { const kk = ((x * 7 + y * 13) % 40) - 20; g.fillStyle = `rgb(${90 + kk},${92 + kk},${98 + kk})`; g.fillRect(x + 1, y + 1, 30, 14); } });
  const add = (key, mat, shadow = true) => {
    const bt = batches.get(key);
    if (!bt || bt.empty) return;
    const mesh = new THREE.Mesh(track(bt.geometry()), track(mat));
    mesh.name = `bld-${key}`;
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    out.push(mesh);
  };
  for (const id of Object.keys(SURFACES)) if (batches.has(id)) add(id, new THREE.MeshStandardMaterial({ ...surface(id), vertexColors: true, roughness: 1 }));
  add('paint', new THREE.MeshStandardMaterial({ ...surface('Plaster001'), vertexColors: true, roughness: 1 }));
  // build 43: the hedges' loose leaves -- clusters of leaf shapes on a transparent card
  if (batches.has('leaves')) {
    const leafTex = canvasTex(256, (g, nn) => {
      const lr = new Rng(hashString(`${seed}:hedgeleaves`), 'leaves');
      for (let i = 0; i < 2600; i++) {
        const x = lr.float() * nn, y = lr.float() * nn, len = 3 + lr.float() * 5, a = lr.float() * 3.14;
        const k = lr.float();
        g.fillStyle = k < 0.6 ? `rgb(${60 + lr.int(40)},${86 + lr.int(40)},${40 + lr.int(24)})` : k < 0.9 ? `rgb(${88 + lr.int(30)},${110 + lr.int(30)},${48 + lr.int(20)})` : `rgb(${110 + lr.int(30)},${96 + lr.int(24)},${50 + lr.int(16)})`;
        for (const [ox, oy] of [[0, 0], [nn, 0], [-nn, 0], [0, nn], [0, -nn]]) {
          g.save(); g.translate(x + ox, y + oy); g.rotate(a);
          g.beginPath(); g.moveTo(-len, 0); g.quadraticCurveTo(0, -len * 0.45, len, 0); g.quadraticCurveTo(0, len * 0.45, -len, 0); g.fill();
          g.restore();
        }
      }
    });
    leafTex.repeat.set(2, 2);
    add('leaves', new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.9 }));
    track(leafTex);
  }
  // the hedges: Poly Haven's leaf photo (assets3d/textures), on every face
  if (batches.has('hedge')) {
    const L = new THREE.TextureLoader();
    const t = (n, srgb) => { const tx = track(L.load(new URL(`../../assets3d/textures/forest_leaves_02/${n}.jpg`, import.meta.url).href)); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 8; if (srgb) tx.colorSpace = THREE.SRGBColorSpace; return tx; };
    const hi = style.res === '2k' && ground2k('forest_leaves_02');   // build 43: district 1's at 2K
    add('hedge', new THREE.MeshStandardMaterial(hi
      ? { map: hi.map, normalMap: hi.normalMap, roughnessMap: hi.roughnessMap, normalScale: new THREE.Vector2(1.6, 1.6), vertexColors: true, roughness: 1 }
      : { map: t('diff', true), normalMap: t('nor_gl', false), roughnessMap: t('arm', false), normalScale: new THREE.Vector2(1.6, 1.6), vertexColors: true, roughness: 1 }));
  }
  add('cloth', new THREE.MeshStandardMaterial({ map: canvasStripe, vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  add('metal', new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.6 }));
  add('roofslate', new THREE.MeshStandardMaterial({ map: slate, vertexColors: true, roughness: 0.85 }));
  add('soot', new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: soot, transparent: true, depthWrite: false, opacity: 0.7 }), false);
  add('sign', new THREE.MeshStandardMaterial({ map: atlas.tex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }), false);
  track(soot); track(canvasStripe); track(slate); track(atlas.tex);
  return { meshes: out, lamps, obstacles, faceUse };
}

/** Wall and window piece names for a storey of a family: a smaller attic row on top. */
function windowNames(k, fam, st, storeys, bay) {
  const top = storeys >= 3 && st === storeys - 1;
  if (fam === 'offset_small') {
    const base = st === 0 ? 1 : top ? 5 : 3;
    const nn = base + (bay % 2);
    return [`wall_window_offset_small_0${nn}`, `window_offset_small_0${nn}`];
  }
  const vv = top ? 3 : st === 0 && k === 'factory' ? 1 : 2;
  return [`wall_window_${fam}_0${vv}`, `window_${fam}_0${vv}`];
}
