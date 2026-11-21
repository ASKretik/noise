// web3d/art/buildings.js -- every building its own. Browser only. N4.4, district 1.
//
// The user: the buildings all look the same, have no entrances, and you cannot tell a
// hotel from a house from a bar -- "that is primarily what makes it look like slop". So
// in district 1 each solid block is cut into separate buildings along its street front,
// and each building gets:
//
//   a purpose     house, apartments, shop (a trade and an owner), bar, cafe, pharmacy,
//                 laundry, garage, cinema, bank, hotel, clinic -- never the same as the
//                 building next door, and never the same wall either
//   a material    photographed CC0 surfaces from ambientCG (assets3d/CREDITS.md), laid
//                 by world position so they never stretch
//   a ground floor that says what it is: shopfronts with stall risers, display glass,
//                 a lettered fascia and a door; a pub's black panelling and hanging sign;
//                 a garage's roller door; a cinema's marquee; a bank's steps and
//                 pilasters; a hotel's canopy; a house's stoop
//   upper floors  in its own window style -- sash, grid, tall with balconies -- and its
//                 own height, storey height, cornice and roof (pitched, parapet, a water
//                 tank, a rooftop sign)
//   damage        its own: broken and boarded windows, mattresses nailed over (the
//                 aliens hunt by sound), soot over the ones that burned, shutters stuck
//                 half way, torn awnings, letters fallen off the sign, brick on the kerb
//
// Everything stands on the building's own wall cells (solid to the sim at any height,
// sim3d/solid.js) or overhangs the pavement above head height, or lies low against the
// wall. One merged mesh per material.

import * as THREE from 'three';
import { TILE } from '../../sim/grid.js';
import { Rng, hashString } from '../../sim/prng.js';

const DIR4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ materials

/** Real surfaces (ambientCG, CC0), and how many metres one repeat covers. */
const SURFACES = {
  Bricks097: 1.5, Bricks051: 1.7, Bricks042: 1.6, Bricks005: 1.6, PaintedBricks001: 1.6, PaintedBricks003: 1.6,
  Plaster001: 2.6, Ground107: 2.3, WoodSiding009: 2.0, CorrugatedSteel007A: 1.8, Concrete042C: 2.8,
  PaintedWood007B: 1.3, PaintedWood005: 1.3, Metal041B: 1.5, Tiles143: 0.9,
};
const cache = new Map();
function surface(id) {
  if (cache.has(id)) return cache.get(id);
  const L = new THREE.TextureLoader();
  const url = (m) => new URL(`../../assets3d/materials/${id}/${m}.jpg`, import.meta.url).href;
  const t = (m, srgb) => {
    const tex = L.load(url(m));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const set = { map: t('color', true), normalMap: t('normal', false), roughnessMap: t('rough', false) };
  cache.set(id, set);
  return set;
}

// A batch: geometry merged from transformed pieces, UVs from world position on whichever
// axis the surface faces, so a brick is the same size on every wall, sill and step.
function batch(tile) {
  const pos = [], nrm = [], uv = [], col = [], idx = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3(), c = new THREE.Color();
  return {
    tile,
    add(geo, m, colour = '#ffffff', uvRect = null) {
      nm.getNormalMatrix(m);
      c.set(colour);
      const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, base = pos.length / 3;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m);
        n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        pos.push(v.x, v.y, v.z); nrm.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b);
        if (uvRect) {
          const [u0, v0, u1, v1] = uvRect;
          uv.push(u0 + U.getX(i) * (u1 - u0), v0 + U.getY(i) * (v1 - v0));
        } else {
          const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
          if (ay >= ax && ay >= az) uv.push(v.x / tile, v.z / tile);
          else if (ax >= az) uv.push(v.z / tile, v.y / tile);
          else uv.push(v.x / tile, v.y / tile);
        }
      }
      if (geo.index) for (const i of geo.index.array) idx.push(base + i);
      else for (let i = 0; i < P.count; i++) idx.push(base + i);
    },
    get empty() { return idx.length === 0; },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      return g;
    },
  };
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const CONE = new THREE.ConeGeometry(1, 1, 12);
// a pitched roof: a triangular prism 1 x 1 x 1, ridge along x, eaves at z = +-0.5
const PRISM = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  return g;
})();

// ------------------------------------------------------------------ what each kind is

const SURNAMES = ['Okafor', 'Marchetti', 'Kowalczyk', 'Haddad', 'Nguyen', 'Fischer', 'Delgado', 'Brennan', 'Sato', 'Ivanova',
  'Mensah', 'Lindqvist', 'Petrovic', 'Duarte', 'Achterberg', 'Szabo', 'Rahman', 'Moreau', 'Kaur', 'Dlamini', 'Novak', 'Esposito'];
const TRADES = ['BAKERY', 'HARDWARE', 'BUTCHER', 'GROCER', 'BOOKS', 'TAILOR', 'PAWNBROKER', 'RADIO REPAIR', 'SHOES', 'TOBACCO', 'BARBER', 'FISH'];
const PAINT = ['#2f3b2c', '#283447', '#4b4f54', '#d6d4cc', '#5a4636', '#1f1f22', '#6b7a6a', '#7c8a96', '#8a7d6b'];

const TYPES = {
  house: { weight: 4, storeys: [2, 3], walls: ['Bricks005', 'WoodSiding009', 'Ground107', 'Bricks097'], ground: 'house', upper: 'sash', roof: 'pitched' },
  apartments: { weight: 4, storeys: [3, 5], walls: ['Bricks042', 'Bricks097', 'Ground107', 'Bricks051'], ground: 'lobby', upper: 'grid', roof: 'tank', fireEscape: true },
  shop: { weight: 4, storeys: [2, 3], walls: ['Bricks051', 'Plaster001', 'Bricks005', 'PaintedBricks003', 'Bricks042'], ground: 'shopfront', upper: 'sash', roof: 'parapet' },
  bar: { weight: 2, storeys: [2, 3], walls: ['PaintedBricks001', 'Bricks097', 'Ground107'], ground: 'pub', upper: 'sash', roof: 'parapet' },
  cafe: { weight: 2, storeys: [2, 3], walls: ['PaintedBricks003', 'Plaster001', 'Bricks005'], ground: 'cafe', upper: 'sash', roof: 'parapet' },
  pharmacy: { weight: 1, storeys: [2, 3], walls: ['Plaster001', 'Bricks051'], ground: 'pharmacy', upper: 'grid', roof: 'parapet' },
  laundry: { weight: 1, storeys: [2, 2], walls: ['Ground107', 'Bricks042'], ground: 'laundry', upper: 'grid', roof: 'parapet' },
  garage: { weight: 2, storeys: [1, 2], walls: ['CorrugatedSteel007A', 'Bricks042', 'Concrete042C'], ground: 'garage', upper: 'grid', roof: 'flat' },
  cinema: { weight: 1, unique: true, storeys: [2, 2], walls: ['Concrete042C', 'Plaster001'], ground: 'cinema', upper: 'blind', roof: 'parapet' },
  bank: { weight: 1, unique: true, storeys: [3, 3], walls: ['Plaster001', 'Concrete042C'], ground: 'bank', upper: 'tall', roof: 'cornice' },
  hotel: { weight: 1, unique: true, storeys: [4, 6], walls: ['Bricks051', 'Plaster001', 'Bricks097'], ground: 'hotel', upper: 'balcony', roof: 'sign' },
  clinic: { weight: 1, unique: true, storeys: [2, 3], walls: ['Plaster001', 'Ground107'], ground: 'clinic', upper: 'grid', roof: 'parapet' },
};

function signText(type, r) {
  const sur = SURNAMES[r.int(SURNAMES.length)];
  switch (type) {
    case 'shop': { const t = TRADES[r.int(TRADES.length)]; return { text: t, sub: `${sur.toUpperCase()} & SONS`.slice(0, 22) }; }
    case 'bar': return { text: r.bool(0.5) ? `${sur.toUpperCase()}'S` : `BAR ${sur.toUpperCase()}`, sub: 'ALES · SPIRITS' };
    case 'cafe': return { text: `CAFE ${sur.toUpperCase()}`, sub: 'COFFEE · TEA · SANDWICHES' };
    case 'pharmacy': return { text: 'PHARMACY', sub: `${sur.toUpperCase()} DISPENSING CHEMIST` };
    case 'laundry': return { text: 'LAUNDERETTE', sub: 'SERVICE WASH' };
    case 'garage': return { text: `${sur.toUpperCase()} MOTORS`, sub: 'TYRES · REPAIRS · MOT' };
    case 'cinema': return { text: 'CINEMA', sub: ['CLOSED UNTIL FURTHER NOTICE', 'LAST SHOWING SATURDAY', 'DOORS 7.30'][r.int(3)] };
    case 'bank': return { text: 'SAVINGS BANK', sub: 'EST. 1904' };
    case 'hotel': return { text: `HOTEL ${sur.toUpperCase()}`, sub: 'ROOMS' };
    case 'clinic': return { text: 'CLINIC', sub: 'NIGHT DOOR AT SIDE' };
    case 'apartments': return { text: `${[2, 4, 7, 9, 11, 14, 16, 21][r.int(8)]}-${[3, 5, 8, 12, 18, 23][r.int(6)]}`, sub: null };
    default: return null;
  }
}

// ------------------------------------------------------------------ the plan

/**
 * Cut every solid tenement block into buildings. Returns { list, at(x, y) }, each building
 * { id, cells, main: [dx, dy], front: [[x, y]...], type, storeys, gH, sH, H, wall, paint, ... }.
 */
export function planBuildings({ map, lookAt, seed }) {
  const { w, h, tiles } = map;
  const inBlock = (x, y) => x >= 0 && y >= 0 && x < w && y < h && tiles[y * w + x] === TILE.WALL && lookAt(x, y)?.type === 'tenements';
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && tiles[y * w + x] !== TILE.WALL && tiles[y * w + x] !== TILE.BUILDING;
  const owner = new Int32Array(w * h).fill(-1);
  const seen = new Uint8Array(w * h);
  const list = [];
  let bi = 0;
  for (let y0 = 0; y0 < h; y0++) for (let x0 = 0; x0 < w; x0++) {
    if (!inBlock(x0, y0) || seen[y0 * w + x0]) continue;
    const block = [], stack = [[x0, y0]];
    seen[y0 * w + x0] = 1;
    while (stack.length) {
      const [x, y] = stack.pop();
      block.push([x, y]);
      for (const [dx, dy] of DIR4) if (inBlock(x + dx, y + dy) && !seen[(y + dy) * w + x + dx]) { seen[(y + dy) * w + x + dx] = 1; stack.push([x + dx, y + dy]); }
    }
    if (block.length < 2) continue;
    const r = new Rng(hashString(`${seed}:block:${bi++}`), 'block');
    // street fronts, cut into runs of 3-6 cells: each run is a building's face to the street
    const front = block.filter(([x, y]) => DIR4.some(([dx, dy]) => open(x + dx, y + dy)))
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [x, y] of front) {
      if (owner[y * w + x] >= 0) continue;
      const [dx, dy] = DIR4.find(([ddx, ddy]) => open(x + ddx, y + ddy));
      const tx = -dy, ty = dx, len = 3 + r.int(4);   // 4.5-9 m of street front: a real building's width
      const b = { id: list.length, cells: [], main: [dx, dy], front: [] };
      for (let k = 0; k < len; k++) {
        const cx = x + tx * k, cy = y + ty * k;
        if (!inBlock(cx, cy) || owner[cy * w + cx] >= 0 || !open(cx + dx, cy + dy)) break;
        owner[cy * w + cx] = b.id; b.front.push([cx, cy]);
      }
      list.push(b);
    }
    // the rest of the block goes to the nearest building
    let wave = block.filter(([x, y]) => owner[y * w + x] >= 0);
    while (wave.length) {
      const next = [];
      for (const [x, y] of wave) for (const [dx, dy] of DIR4) {
        const nx = x + dx, ny = y + dy;
        if (inBlock(nx, ny) && owner[ny * w + nx] < 0) { owner[ny * w + nx] = owner[y * w + x]; next.push([nx, ny]); }
      }
      wave = next;
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (owner[y * w + x] >= 0) list[owner[y * w + x]].cells.push([x, y]);

  // a purpose, a wall and a height for each, never the same as a neighbour's
  const neighbours = list.map(() => new Set());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = owner[y * w + x];
    if (o < 0) continue;
    for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const p = owner[ny * w + nx];
      if (p >= 0 && p !== o) neighbours[o].add(p);
    }
  }
  const used = new Set();
  for (const b of list) {
    const r = new Rng(hashString(`${seed}:bld:${b.id}`), 'bld');
    const near = [...neighbours[b.id]].map((i) => list[i]).filter((n) => n.type);
    let types = Object.keys(TYPES).filter((t) => !near.some((n) => n.type === t) && !(TYPES[t].unique && used.has(t)));
    if (b.front.length >= 4) types = types.filter((t) => !['pharmacy', 'laundry', 'clinic'].includes(t));
    if (!types.length) types = ['house'];
    const wsum = types.reduce((s, t) => s + TYPES[t].weight, 0);
    let pick = r.float() * wsum;
    b.type = types.find((t) => (pick -= TYPES[t].weight) < 0) || types[0];
    used.add(b.type);
    const T = TYPES[b.type];
    const walls = T.walls.filter((m) => !near.some((n) => n.wall === m));
    b.wall = (walls.length ? walls : T.walls)[r.int((walls.length ? walls : T.walls).length)];
    b.storeys = T.storeys[0] + r.int(T.storeys[1] - T.storeys[0] + 1);
    b.gH = b.type === 'cinema' ? 4.8 : b.type === 'garage' ? 4.2 : 3.6 + r.float() * 0.5;
    b.sH = 3.0 + r.float() * 0.45;
    b.H = b.gH + (b.storeys - 1) * b.sH + (T.roof === 'parapet' || T.roof === 'sign' ? 0.6 : 0);
    b.paint = PAINT[r.int(PAINT.length)];
    b.paint2 = PAINT[r.int(PAINT.length)];
    b.damage = 0.25 + r.float() * 0.7;
    b.burnt = r.bool(0.22);
    b.sign = signText(b.type, r);
    b.font = ['Georgia', 'Helvetica Neue', 'Futura', 'Gill Sans', 'Didot', 'Courier New', 'Baskerville', 'Rockwell', 'Copperplate', 'Avenir Next Condensed'][r.int(10)];
  }
  return { list, at: (x, y) => (x < 0 || y < 0 || x >= w || y >= h || owner[y * w + x] < 0 ? null : list[owner[y * w + x]]) };
}

// ------------------------------------------------------------------ the sign atlas

function signAtlas(list) {
  const W = 2048, cv = document.createElement('canvas');
  cv.width = W; cv.height = W;
  const g = cv.getContext('2d');
  const wide = new Map(), tall = new Map();
  let wi = 0, ti = 0;
  const panels = ['#1d2a22', '#1f2733', '#2a2a2c', '#3a2e26', '#d8d6d0', '#30383e', '#1b1b1d'];
  const inks = ['#e8e6df', '#cfd8dc', '#b8c7b0', '#d9d4c7', '#1b1b1d'];
  const draw = (b, x0, y0, tw, th, text, sub, vertical) => {
    const r = new Rng(hashString(`sign:${b.id}:${text}`), 'sign');
    const panel = panels[r.int(panels.length)];
    const ink = panel === '#d8d6d0' ? '#1b1b1d' : inks[r.int(4)];
    g.save(); g.beginPath(); g.rect(x0, y0, tw, th); g.clip();
    g.fillStyle = panel; g.fillRect(x0, y0, tw, th);
    // weather: streaks, chips, a dull band of rust from the fixings
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + r.float() * 0.15})`; g.fillRect(x0 + r.int(tw), y0 + r.int(th), 1 + r.int(3), 6 + r.int(th / 2)); }
    g.strokeStyle = 'rgba(200,196,186,0.35)'; g.lineWidth = 3; g.strokeRect(x0 + 8, y0 + 8, tw - 16, th - 16);
    g.fillStyle = ink; g.textBaseline = 'middle'; g.textAlign = 'left';
    const lines = sub ? [[text, 0.42], [sub, 0.78]] : [[text, 0.52]];
    for (const [t, fy] of lines) {
      if (vertical) {
        const size = Math.min(tw * 0.62, (th - 30) / Math.max(1, t.length) * 0.95);
        g.font = `bold ${size}px "${b.font}", Georgia, serif`;
        [...t].forEach((ch, i) => {
          if (b.damage > 0.6 && r.bool(0.12)) return;   // a letter fallen off
          g.textAlign = 'center'; g.fillText(ch, x0 + tw / 2 + r.range(-1, 1), y0 + 20 + size * (i + 0.5));
        });
        break;
      }
      let size = (t === text ? th * 0.42 : th * 0.16);
      g.font = `${t === text ? 'bold ' : ''}${size}px "${b.font}", Georgia, serif`;
      while (g.measureText(t).width > tw - 40 && size > 8) { size--; g.font = `${t === text ? 'bold ' : ''}${size}px "${b.font}", Georgia, serif`; }
      let x = x0 + (tw - g.measureText(t).width) / 2;
      for (const ch of t) {
        const cw = g.measureText(ch).width;
        if (!(t === text && b.damage > 0.6 && r.bool(0.1))) g.fillText(ch, x + r.range(-1, 1) * 0.6, y0 + th * fy + r.range(-1, 1));
        x += cw;
      }
    }
    // paint gone in patches
    for (let i = 0; i < 6 + b.damage * 20; i++) { g.fillStyle = 'rgba(70,64,58,0.55)'; g.beginPath(); g.ellipse(x0 + r.int(tw), y0 + r.int(th), 3 + r.int(14), 2 + r.int(8), r.float() * 3, 0, 6.28); g.fill(); }
    g.restore();
  };
  for (const b of list) {
    if (!b.sign) continue;
    if (wi < 48) { const x0 = (wi % 4) * 512, y0 = Math.floor(wi / 4) * 128; draw(b, x0, y0, 512, 128, b.sign.text, b.sign.sub, false); wide.set(b.id, [x0 / W, 1 - (y0 + 128) / W, (x0 + 512) / W, 1 - y0 / W]); wi++; }
    if (['bar', 'pharmacy', 'hotel', 'cinema', 'cafe'].includes(b.type) && ti < 16) {
      const x0 = ti * 128, y0 = 1536, word = b.type === 'pharmacy' ? '+' : b.type === 'bar' ? b.sign.text.split(' ').pop().replace("'S", '') : b.type === 'cafe' ? 'CAFE' : b.sign.text.split(' ')[0];
      draw(b, x0, y0, 128, 512, word.slice(0, 9), null, true);
      tall.set(b.id, [x0 / W, 1 - (y0 + 512) / W, (x0 + 128) / W, 1 - y0 / W]);
      ti++;
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, wide, tall };
}

function canvasTex(size, paint, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  paint(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ the builder

/**
 * @param {object} plan  planBuildings()
 * @param {object} o     { map, cellM, seed, heightAt(x, y) for walls that are not buildings, track }
 * @returns {THREE.Object3D[]}
 */
export function buildBuildings(plan, { map, cellM: C, seed, heightAt, track }) {
  const { w, h, tiles } = map;
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && tiles[y * w + x] !== TILE.WALL && tiles[y * w + x] !== TILE.BUILDING;
  const batches = new Map();
  const B = (key, tile = 1.5) => { if (!batches.has(key)) batches.set(key, batch(tile)); return batches.get(key); };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  const atlas = signAtlas(plan.list);

  // a point on face f: `along` metres from the face's centre, height y, `out` metres proud
  const P = (f, along, y, out) => v.set((f.x + 0.5) * C + f.dx * (C / 2 + out) - f.dy * along, y, (f.y + 0.5) * C + f.dy * (C / 2 + out) + f.dx * along);
  const yaw = (f) => Math.atan2(f.dx, f.dy);
  const box = (key, f, along, y, out, bw, bh, bd, colour, tilt = 0, roll = 0) => {
    e.set(tilt, yaw(f), roll, 'YXZ');
    m4.compose(P(f, along, y, out), q.setFromEuler(e), s.set(bw, bh, bd));
    B(key, SURFACES[key] || 1.5).add(BOX, m4, colour);
  };
  const plane = (key, f, along, y, out, pw, ph, colour, uvRect = null) => {
    e.set(0, yaw(f), 0, 'YXZ');
    m4.compose(P(f, along, y, out), q.setFromEuler(e), s.set(pw, ph, 1));
    B(key, SURFACES[key] || 1.5).add(PLANE, m4, colour, uvRect);
  };
  const cyl = (key, x, y, z, r, len, colour, rx = 0, rz = 0) => {
    m4.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, 0, rz)), s.set(r, len, r));
    B(key, SURFACES[key] || 1.5).add(CYL, m4, colour);
  };

  // one window, in its building's style, in a state its damage chose
  const windowAt = (b, f, along, y, ww, wh, style, r) => {
    const frame = style === 'grid' ? '#3a3c3e' : b.paint;
    box('paint', f, along, y + wh / 2 + 0.07, 0.05, ww + 0.18, 0.14, 0.1, '#bdb6a8');            // lintel
    box('paint', f, along, y - wh / 2 - 0.04, 0.08, ww + 0.16, 0.08, 0.17, '#bdb6a8');           // sill
    for (const sd of [-1, 1]) box('paint', f, along + sd * (ww / 2 + 0.03), y, 0.035, 0.06, wh, 0.07, frame);
    box('paint', f, along, y + wh / 2 - 0.02, 0.035, ww, 0.05, 0.07, frame);
    const roll = r.float(), d = b.damage;
    if (roll < 0.1 + d * 0.32) {
      plane('void', f, along, y, 0.006, ww, wh, '#ffffff');                                     // broken: black inside
      for (let k = 0; k < 2; k++) { e.set(0, yaw(f), r.float() * 0.6 - 0.3, 'YXZ'); m4.compose(P(f, along + r.range(-2, 2) * 0.08, y - wh * 0.32, 0.012), q.setFromEuler(e), s.set(0.05 + r.float() * 0.12, 0.18 + r.float() * 0.2, 1)); B('glass').add(PLANE, m4, '#ffffff'); }
    } else if (roll < 0.17 + d * 0.45) {
      for (let k = 0; k < 3; k++) box('PaintedWood005', f, along, y - wh * 0.3 + k * wh * 0.3, 0.06, ww + 0.24, 0.13, 0.03, ['#8a7a66', '#6e6052', '#9a8a74'][r.int(3)], 0, (r.float() - 0.5) * 0.12);
    } else if (roll < 0.25 + d * 0.45) {
      box('cloth', f, along, y - 0.03, 0.05, ww + 0.08, wh + 0.04, 0.08, ['#6b6456', '#5a5448', '#776d5c'][r.int(3)], 0, (r.float() - 0.5) * 0.05);   // a mattress
    } else {
      plane('glass', f, along, y, 0.006, ww, wh, '#ffffff');
      if (style === 'sash') { box('paint', f, along, y, 0.03, ww, 0.04, 0.05, frame); box('paint', f, along, y, 0.03, 0.035, wh, 0.05, frame); }
      if (style === 'grid') for (const k of [-1, 1]) box('paint', f, along + k * ww / 6, y, 0.03, 0.03, wh, 0.05, frame);
      const c = r.float();
      if (c < 0.25) plane('cloth', f, along - ww * 0.22, y, 0.009, ww * 0.5, wh * 0.95, ['#5a4636', '#4a5240', '#6a5e52', '#3e4650'][r.int(4)]);   // a curtain half drawn
      else if (c < 0.3) plane('lit', f, along, y, 0.008, ww - 0.04, wh - 0.04, '#9c7650');   // a lamp still on inside
    }
    if (b.burnt && r.bool(0.4)) plane('soot', f, along, y + wh * 0.9, 0.015, ww * 1.8, wh * 1.4, '#ffffff');
  };

  const door = (b, f, along, ground, r, kind = 'panel') => {
    const dw = kind === 'double' ? 1.3 : 0.95, dh = 2.3;
    box('paint', f, along, dh + 0.08, 0.05, dw + 0.24, 0.16, 0.1, b.paint2);
    for (const sd of [-1, 1]) box('paint', f, along + sd * (dw / 2 + 0.05), dh / 2, 0.05, 0.1, dh, 0.1, b.paint2);
    const boarded = r.bool(b.damage * 0.4);
    const wood = r.bool(0.5) ? 'PaintedWood005' : 'PaintedWood007B';
    if (kind === 'double') { for (const sd of [-0.5, 0.5]) { box(wood, f, along + sd * dw / 2, dh / 2, 0.02, dw / 2 - 0.02, dh, 0.05, '#ffffff'); plane('glass', f, along + sd * dw / 2, dh * 0.62, 0.05, dw / 2 - 0.18, dh * 0.5, '#ffffff'); } }
    else { box(wood, f, along, dh / 2, 0.02, dw, dh, 0.05, '#ffffff'); if (kind === 'glazed') plane('glass', f, along, dh * 0.64, 0.05, dw - 0.3, dh * 0.42, '#ffffff'); }
    plane('glass', f, along, dh + 0.3, 0.02, dw, 0.28, '#ffffff');   // fanlight
    if (boarded) for (let k = 0; k < 4; k++) box('PaintedWood005', f, along, 0.4 + k * 0.5, 0.09, dw + 0.3, 0.16, 0.03, '#8a7a66', 0, (r.float() - 0.5) * 0.2);
    if (ground) box('Concrete042C', f, along, 0.09, 0.3, dw + 0.5, 0.18, 0.6, '#9a958c');      // a step
    if (r.bool(0.3)) for (const k of [-0.07, 0.07]) box('cloth', f, along + 0.25 + k, 0.24, 0.5, 0.09, 0.07, 0.25, ['#2a2420', '#3a3028', '#2c2c30'][r.int(3)]);   // shoes left on the step
  };

  // ---- each building
  for (const b of plan.list) {
    const r = new Rng(hashString(`${seed}:draw:${b.id}`), 'draw');
    const T = TYPES[b.type];
    const tintC = new THREE.Color('#ffffff').multiplyScalar(0.82 + r.float() * 0.22);
    const tint = `#${tintC.getHexString()}`;
    const mainFront = new Set(b.front.map(([x, y]) => `${x},${y}`));
    const faces = [];
    for (const [x, y] of b.cells) {
      for (const [dx, dy] of DIR4) {
        const nx = x + dx, ny = y + dy;
        const nb = plan.at(nx, ny);
        if (nb === b) continue;
        const isOpen = open(nx, ny);
        const nh = isOpen ? 0 : nb ? nb.H : (nx < 0 || ny < 0 || nx >= w || ny >= h ? b.H : heightAt(nx, ny));
        if (nh >= b.H - 0.01) continue;
        faces.push({ x, y, dx, dy, from: nh, open: isOpen, main: isOpen && dx === b.main[0] && dy === b.main[1] && mainFront.has(`${x},${y}`) });
      }
      // the roof of this cell
      m4.compose(v.set((x + 0.5) * C, b.H, (y + 0.5) * C), q.identity(), s.set(C, 0.02, C));
      B('Concrete042C', SURFACES.Concrete042C).add(BOX, m4, '#55524c');
    }
    const mains = faces.filter((f) => f.main);
    const mid = mains.length ? mains[Math.floor(mains.length / 2)] : null;

    for (const f of faces) {
      // the wall itself, from what is in front of it up to the top
      const wallH = b.H - f.from;
      plane(b.wall, f, 0, f.from + wallH / 2, 0, C, wallH, tint);
      if (!f.open) continue;
      // string course over the ground floor, cornice at the top
      box('paint', f, 0, b.gH - 0.05, 0.07, C + 0.02, 0.14, 0.14, '#a9a294');
      box('paint', f, 0, b.H - 0.15, 0.12, C + 0.04, 0.3, 0.24, T.roof === 'cornice' ? '#c8c2b4' : '#8f897d');
      if (T.roof === 'parapet' || T.roof === 'sign') box(b.wall, f, 0, b.H + 0.3, -0.12, C, 0.6, 0.22, tint);

      // ---- the ground floor
      const r2 = new Rng(hashString(`${seed}:f:${f.x},${f.y},${f.dx},${f.dy}`), 'face');
      const isDoor = f === mid;
      const gstyle = f.main ? T.ground : 'plain';
      if (gstyle === 'shopfront' || gstyle === 'cafe' || gstyle === 'pharmacy' || gstyle === 'laundry') {
        for (const sd of [-1, 1]) box('paint', f, sd * (C / 2 - 0.08), (b.gH - 0.6) / 2, 0.06, 0.16, b.gH - 0.6, 0.12, b.paint);   // pilasters
        if (isDoor) door(b, f, 0, true, r2, 'glazed');
        else {
          box('Tiles143', f, 0, 0.3, 0.04, C - 0.2, 0.6, 0.08, '#ffffff');                    // stall riser
          plane('glass', f, 0, 0.6 + (b.gH - 1.55) / 2, 0.02, C - 0.3, b.gH - 1.55, '#ffffff');
          box('paint', f, 0, 0.62, 0.06, C - 0.26, 0.06, 0.14, b.paint);
          if (r2.bool(0.3 + b.damage * 0.4)) {
            // a roller shutter, stuck part way
            const down = 0.4 + r2.float() * 0.6, sh = (b.gH - 1.0) * down;
            box('Metal041B', f, 0, b.gH - 0.95 - sh / 2, 0.08, C - 0.3, sh, 0.04, '#9aa2a8');
            box('Metal041B', f, 0, b.gH - 0.85, 0.12, C - 0.2, 0.22, 0.24, '#7a7e82');
          }
        }
        if (gstyle === 'cafe' && r2.bool(0.85)) {
          // a canvas awning; torn ones hang down at one end
          const torn = r2.bool(b.damage * 0.5);
          box('cloth', f, 0, b.gH - 0.95, 0.75, C + 0.02, 0.04, 1.45, b.paint2, torn ? 0.95 : 0.35, torn ? 0.25 : 0);
        }
      } else if (gstyle === 'pub') {
        box('PaintedWood005', f, 0, (b.gH - 0.4) / 2, 0.05, C, b.gH - 0.4, 0.06, '#ffffff');
        if (isDoor) door(b, f, 0, true, r2, 'glazed');
        else {
          plane('glass', f, 0, 1.75, 0.09, C - 0.5, 1.5, '#ffffff');
          for (let k = -1; k <= 1; k++) box('paint', f, k * (C - 0.5) / 3, 1.75, 0.1, 0.03, 1.5, 0.03, '#1b1b1d');
          for (const hy of [1.25, 1.75, 2.25]) box('paint', f, 0, hy, 0.1, C - 0.5, 0.03, 0.03, '#1b1b1d');
        }
      } else if (gstyle === 'garage') {
        if (isDoor || mains.length === 1) {
          box('Concrete042C', f, 0, b.gH * 0.42, 0.05, C, b.gH * 0.84, 0.08, '#8a867e');
          const shut = r2.bool(0.7);
          box('Metal041B', f, 0, shut ? 1.5 : 2.6, 0.1, C - 0.22, shut ? 3.0 : 0.8, 0.05, '#b0b4b0');
          if (!shut) plane('void', f, 0, 1.1, 0.07, C - 0.22, 2.2, '#ffffff');
        } else {
          plane('glass', f, 0, 1.9, 0.02, C - 0.5, 1.3, '#ffffff');
          for (let k = 0; k < 3; k++) cyl('rubber', (f.x + 0.5) * C + f.dx * (C / 2 + 0.45) - f.dy * 0.35, 0.12 + k * 0.2, (f.y + 0.5) * C + f.dy * (C / 2 + 0.45) + f.dx * 0.35, 0.32, 0.18, '#1c1c1c');
        }
      } else if (gstyle === 'cinema') {
        if (isDoor) door(b, f, 0, true, r2, 'double');
        else { box('paint', f, 0, 1.6, 0.05, 0.95, 1.4, 0.06, '#1e1e20'); plane('poster', f, 0, 1.6, 0.085, 0.8, 1.2, ['#7c8a96', '#6b7a6a', '#8a7d6b', '#d6d4cc'][r2.int(4)]); }
      } else if (gstyle === 'bank') {
        for (const sd of [-1, 1]) box('Concrete042C', f, sd * (C / 2 - 0.12), b.gH / 2, 0.15, 0.3, b.gH, 0.3, '#c8c2b4');
        if (isDoor) { door(b, f, 0, false, r2, 'double'); for (let k = 0; k < 3; k++) box('Concrete042C', f, 0, 0.09 + k * 0.18, 0.75 - k * 0.25, C, 0.18, 0.5, '#b0aba0'); }
        else { windowAt(b, f, 0, 1.9, 0.9, 1.9, 'tall', r2); for (let k = -2; k <= 2; k++) box('metal', f, k * 0.17, 1.9, 0.14, 0.025, 1.9, 0.025, '#2a2a2a'); }
      } else if (gstyle === 'hotel') {
        if (isDoor) {
          door(b, f, 0, true, r2, 'double');
          box('paint', f, 0, 2.95, 1.0, C + 0.3, 0.18, 2.0, b.paint);   // canopy
          for (const sd of [-1, 1]) cyl('metal', (f.x + 0.5) * C + f.dx * (C / 2 + 1.9) - f.dy * sd * 0.8, 1.45, (f.y + 0.5) * C + f.dy * (C / 2 + 1.9) + f.dx * sd * 0.8, 0.04, 2.9, '#2a2a2a');
        } else windowAt(b, f, 0, 1.8, 1.0, 1.7, 'tall', r2);
      } else if (gstyle === 'clinic') {
        if (isDoor) door(b, f, 0, true, r2, 'double');
        else windowAt(b, f, 0, 1.7, 1.0, 1.3, 'grid', r2);
      } else if (gstyle === 'house') {
        box('Concrete042C', f, 0, 0.3, 0.03, C, 0.6, 0.06, '#7e7a72');   // plinth
        if (isDoor) {
          door(b, f, 0, false, r2, 'panel');
          for (let k = 0; k < 3; k++) box('Concrete042C', f, 0, 0.1 + k * 0.2, 0.85 - k * 0.27, 1.2, 0.2, 0.55, '#a39e94');   // the stoop
          for (const sd of [-1, 1]) box('metal', f, sd * 0.62, 0.95, 0.6, 0.03, 0.9, 0.9, '#1e1e1e', -0.6);
        } else windowAt(b, f, 0, 1.75, 0.85, 1.35, 'sash', r2);
      } else if (gstyle === 'lobby') {
        if (isDoor) { door(b, f, 0, true, r2, 'glazed'); box('metal', f, 0.72, 1.4, 0.04, 0.16, 0.3, 0.04, '#5a5c5e'); }
        else windowAt(b, f, 0, 1.7, 1.0, 1.3, 'grid', r2);
      } else {
        // a side or back wall: a few small windows, sometimes a back door
        if (r2.bool(0.12)) door(b, f, 0, false, r2, 'panel');
        else if (r2.bool(0.5)) windowAt(b, f, 0, 1.8, 0.7, 1.0, 'grid', r2);
      }

      // ---- the fascia sign over a shop, pub, cafe, garage, cinema, bank, hotel or clinic front
      if (f === mid && b.sign && atlas.wide.has(b.id) && T.ground !== 'lobby' && T.ground !== 'house') {
        const width = Math.min(mains.length * C - 0.2, 6.2);
        plane('sign', f, 0, b.gH - 0.55, 0.13, width, width / 4.2, '#ffffff', atlas.wide.get(b.id));
        box('paint', f, 0, b.gH - 0.55, 0.08, width + 0.12, width / 4.2 + 0.12, 0.08, '#1a1a1a');
      }
      if (f === mid && b.type === 'apartments' && b.sign) {
        plane('sign', f, -0.75 + 0.25, 2.75, 0.02, 0.5, 0.125, '#ffffff', atlas.wide.get(b.id));   // the street number
      }

      // ---- upper storeys
      for (let st = 1; st < b.storeys; st++) {
        const y0 = b.gH + (st - 1) * b.sH;
        const style = b.type === 'cinema' ? 'blind' : T.upper;
        if (style === 'blind') { if (r2.bool(0.4)) plane('poster', f, 0, y0 + b.sH / 2, 0.01, 1.1, 1.6, '#6b7a6a'); continue; }
        const ww = style === 'tall' || style === 'balcony' ? 0.9 : style === 'grid' ? 1.05 : 0.8;
        const wh = style === 'tall' || style === 'balcony' ? 1.85 : 1.4;
        windowAt(b, f, 0, y0 + b.sH * 0.5, ww, wh, style === 'balcony' ? 'tall' : style, r2);
        if (style === 'balcony' && f.main) {
          box('Concrete042C', f, 0, y0 + 0.08, 0.45, C - 0.1, 0.12, 0.9, '#a8a296');
          box('metal', f, 0, y0 + 1.0, 0.88, C - 0.1, 0.04, 0.04, '#222222');
          for (let k = -4; k <= 4; k++) box('metal', f, k * 0.16, y0 + 0.6, 0.88, 0.02, 0.8, 0.02, '#222222');
        }
        if (r2.bool(0.12)) box('metal', f, 0.2, y0 + 0.45, 0.25, 0.72, 0.48, 0.42, '#7f8386');      // an air conditioner
      }

      // ---- fire escape on an apartment block's front: landings, rails, stairs
      if (T.fireEscape && f.main && mains.indexOf(f) % 2 === 0 && mains.indexOf(f) < 4) {
        for (let st = 1; st < b.storeys; st++) {
          const y0 = b.gH + (st - 1) * b.sH;
          box('Metal041B', f, 0, y0 + 0.02, 0.6, C + 0.6, 0.05, 1.15, '#5d5a56');
          box('metal', f, 0, y0 + 0.95, 1.16, C + 0.6, 0.035, 0.035, '#1e1e1e');
          for (let k = -5; k <= 5; k++) box('metal', f, k * 0.19, y0 + 0.48, 1.16, 0.018, 0.95, 0.018, '#1e1e1e');
          if (st < b.storeys - 1) { e.set(0, yaw(f), 0.95, 'YXZ'); m4.compose(P(f, -0.2, y0 + b.sH / 2, 0.6), q.setFromEuler(e).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(b.sH, 1.6))), s.set(1.9, 0.04, 0.6)); B('Metal041B', SURFACES.Metal041B).add(BOX, m4, '#5d5a56'); }
        }
      }

      // ---- the hanging sign of a pub, the blade sign of a pharmacy, hotel, cinema or cafe
      if (f === mid && atlas.tall.has(b.id)) {
        const side = mains.length > 1 ? C * 0.5 : 0;
        const at = P(f, side + 0.62, b.gH + 1.4, 0.55).clone();
        e.set(0, yaw(f) + Math.PI / 2, 0, 'YXZ');
        for (const flip of [0, Math.PI]) {
          m4.compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw(f) + Math.PI / 2 + flip, 0, 'YXZ')), s.set(0.42, 1.65, 1));
          B('sign').add(PLANE, m4, '#ffffff', atlas.tall.get(b.id));
        }
        box('metal', f, side + 0.62, b.gH + 2.3, 0.45, 0.04, 0.04, 0.9, '#1e1e1e');
      }
    }

    // ---- roofs
    const cx = b.cells.reduce((a, c) => a + c[0] + 0.5, 0) / b.cells.length * C, cz = b.cells.reduce((a, c) => a + c[1] + 0.5, 0) / b.cells.length * C;
    if (T.roof === 'pitched') {
      for (const [x, y] of b.cells) {
        e.set(0, b.main[0] !== 0 ? Math.PI / 2 : 0, 0, 'YXZ');   // the ridge runs along the street
        m4.compose(v.set((x + 0.5) * C, b.H, (y + 0.5) * C), q.setFromEuler(e), s.set(C + 0.02, 1.7, C + 0.3));
        B('roofslate', 1.2).add(PRISM, m4, '#4a4b4e');
        if (r.bool(0.18)) { m4.compose(v.set((x + 0.5) * C + 0.3, b.H + 1.4, (y + 0.5) * C), q.identity(), s.set(0.5, 1.4, 0.6)); B(b.wall, SURFACES[b.wall]).add(BOX, m4, tint); }
      }
    } else if (T.roof === 'tank') {
      cyl('WoodSiding009', cx, b.H + 2.0, cz, 0.9, 1.8, '#9a8a74');
      m4.compose(v.set(cx, b.H + 3.15, cz), q.identity(), s.set(1.0, 0.5, 1.0)); B('Metal041B', SURFACES.Metal041B).add(CONE, m4, '#6a6662');
      for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) cyl('metal', cx + ox, b.H + 0.55, cz + oz, 0.05, 1.1, '#2a2a2a');
    } else if (T.roof === 'sign' && b.sign) {
      // HOTEL on a frame on the roof, facing the street
      const f = mid || faces[0];
      if (f) {
        const at = P(f, 0, b.H + 1.3, -0.4).clone();
        m4.compose(at, new THREE.Quaternion().setFromAxisAngle(UP, yaw(f)), s.set(4.2, 1.0, 1));
        B('sign').add(PLANE, m4, '#ffffff', atlas.wide.get(b.id));
        for (const sd of [-1.8, 0, 1.8]) box('metal', f, sd, b.H + 0.6, -0.5, 0.06, 1.4, 0.06, '#1e1e1e');
      }
    }
    // vents and pipes on flat roofs
    if (T.roof !== 'pitched') for (let k = 0; k < 1 + r.int(3); k++) { const [x, y] = b.cells[r.int(b.cells.length)]; cyl('metal', (x + 0.3 + r.float() * 0.4) * C, b.H + 0.35, (y + 0.3 + r.float() * 0.4) * C, 0.12 + r.float() * 0.1, 0.7, '#4a4a4a'); }

    // ---- brick and plaster fallen onto the pavement in front of the worst ones
    if (b.damage > 0.6) for (const f of mains) {
      if (!r.bool(0.5)) continue;
      for (let k = 0; k < 6 + r.int(8); k++) {
        e.set(r.float(), r.float() * 6, r.float(), 'YXZ');
        m4.compose(P(f, (r.float() - 0.5) * 1.3, 0.04, 0.15 + r.float() * 0.55), q.setFromEuler(e), s.set(0.08 + r.float() * 0.18, 0.05 + r.float() * 0.08, 0.1 + r.float() * 0.12));
        B(b.wall, SURFACES[b.wall]).add(BOX, m4, tint);
      }
    }
  }

  // ---- materials
  const soot = canvasTex(64, (g, n) => { const grd = g.createLinearGradient(0, n, 0, 0); grd.addColorStop(0, 'rgba(0,0,0,0.85)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, n, n); }, false);
  const canvasStripe = canvasTex(256, (g, n) => { for (let x = 0; x < n; x += 32) { g.fillStyle = (x / 32) % 2 ? '#d8d4ca' : '#ffffff'; g.fillRect(x, 0, 32, n); } for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(40,30,20,0.08)'; g.fillRect((i * 37) % n, (i * 91) % n, 2, 8); } });
  const slate = canvasTex(256, (g, n) => { g.fillStyle = '#6a6c70'; g.fillRect(0, 0, n, n); for (let y = 0; y < n; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < n; x += 32) { const k = ((x * 7 + y * 13) % 40) - 20; g.fillStyle = `rgb(${90 + k},${92 + k},${98 + k})`; g.fillRect(x + 1, y + 1, 30, 14); } });
  const out = [];
  const add = (key, mat, shadow = true) => {
    const bt = batches.get(key);
    if (!bt || bt.empty) return;
    const mesh = new THREE.Mesh(track(bt.geometry()), track(mat));
    mesh.name = `bld-${key}`;
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    out.push(mesh);
  };
  for (const id of Object.keys(SURFACES)) {
    const S = surface(id);
    add(id, new THREE.MeshStandardMaterial({ ...S, vertexColors: true, roughness: 1, metalness: id === 'Metal041B' || id === 'CorrugatedSteel007A' ? 0.4 : 0 }));
  }
  const plaster = surface('Plaster001');
  add('paint', new THREE.MeshStandardMaterial({ ...plaster, vertexColors: true, roughness: 1 }));
  add('glass', new THREE.MeshStandardMaterial({ color: 0x0c0f12, roughness: 0.06, metalness: 0.6, vertexColors: true }), false);
  add('void', new THREE.MeshBasicMaterial({ color: 0x050506 }), false);
  add('cloth', new THREE.MeshStandardMaterial({ map: canvasStripe, vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  add('metal', new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.6 }));
  add('rubber', new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  add('roofslate', new THREE.MeshStandardMaterial({ map: slate, vertexColors: true, roughness: 0.85 }));
  add('lit', new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.5, 1.5, 1.5), toneMapped: false }), false);
  add('poster', new THREE.MeshStandardMaterial({ ...plaster, vertexColors: true, roughness: 1 }), false);
  add('soot', new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: soot, transparent: true, depthWrite: false, opacity: 0.75 }), false);
  add('sign', new THREE.MeshStandardMaterial({ map: atlas.tex, roughness: 0.6, emissiveMap: atlas.tex, emissive: 0xffffff, emissiveIntensity: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }), false);
  track(soot); track(canvasStripe); track(slate); track(atlas.tex);
  return out;
}
