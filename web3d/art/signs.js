// web3d/art/signs.js -- place-name signs and wall art. Browser only.
//
// N4.2. A name is only worth having if you can read it where you are:
//
//   SIGNS     every place gets its name on an enamel plate where you walk in -- on the
//             wall beside a gate or an alley mouth, facing the street; open places
//             (plazas, canals) on a post at the edge. At most two per place, on
//             different sides. The plate's colour is its kind of place's.
//   WALL ART  posters, graffiti, stencils and warnings on the walls that face the
//             streets: more in markets and tenements than in parks, more deeper into a
//             belt. None of it carries the story (that is N5's, spec-3d-next.md); it
//             is the city as it was left.
//
// Both are one merged mesh each over a canvas atlas: two draw calls for the whole city.
// Everything is placed by a seeded Rng per wall face, so a district always looks the same.

import * as THREE from 'three';
import { TILE } from '../../sim/grid.js';
import { Rng, hashString } from '../../sim/prng.js';
import { SIGN_COLOURS, DECAL_INKS, POSTER_PAPERS } from './belts.js';
import { rgba } from './textures.js';

const DIR4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const SIGN_W = 256, SIGN_H = 64, SIGN_COLS = 8;
const DECAL_T = 128, DECAL_COLS = 8;

/** Quads in world space, merged: { pos, nrm, uv, idx }. */
function quadBuffer() {
  const pos = [], nrm = [], uv = [], idx = [];
  return {
    /** centre c, outward normal n (horizontal), width w, height h, uv rect [u0, v0, u1, v1] */
    add(c, n, w, h, [u0, v0, u1, v1]) {
      const rx = n.z, rz = -n.x;        // the viewer's right, facing the wall
      const b = pos.length / 3;
      for (const [sx, sy, u, v] of [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]]) {
        pos.push(c.x + rx * sx * w / 2, c.y + sy * h / 2, c.z + rz * sx * w / 2);
        nrm.push(n.x, 0, n.z);
        uv.push(u, v);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    },
    /** an upright box (a post), all of it in one uv texel */
    post(x, z, w, h, [u, v]) {
      for (const [nx, nz] of DIR4.map(([a, b]) => [a, b])) {
        const n = { x: nx, z: nz };
        this.add({ x: x + nx * w / 2, y: h / 2, z: z + nz * w / 2 }, n, w, h, [u, v, u, v]);
      }
    },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      return g;
    },
    get count() { return idx.length / 6; },
  };
}

// ------------------------------------------------------------------ signs

/** entries: [{ text, plate, sub? }] -- a place's name, or an avenue's with the district below */
function signAtlas(entries) {
  const rows = Math.ceil((entries.length + 1) / SIGN_COLS);
  const cv = document.createElement('canvas');
  cv.width = SIGN_W * SIGN_COLS; cv.height = SIGN_H * rows;
  const g = cv.getContext('2d');
  // tile 0: post metal
  g.fillStyle = '#2c2e31'; g.fillRect(0, 0, SIGN_W, SIGN_H);
  entries.forEach((en, i) => {
    const k = i + 1, x = (k % SIGN_COLS) * SIGN_W, y = Math.floor(k / SIGN_COLS) * SIGN_H;
    const plate = en.plate;
    g.fillStyle = '#0c0c0d'; g.fillRect(x, y, SIGN_W, SIGN_H);
    g.fillStyle = plate; g.fillRect(x + 4, y + 4, SIGN_W - 8, SIGN_H - 8);
    g.strokeStyle = rgba(SIGN_COLOURS.lettering, 0.8); g.lineWidth = 2; g.strokeRect(x + 9, y + 9, SIGN_W - 18, SIGN_H - 18);
    const text = en.text;
    let size = en.sub ? 22 : 30;
    g.font = `bold ${size}px Georgia, 'Times New Roman', serif`;
    while (g.measureText(text).width > SIGN_W - 34 && size > 12) { size--; g.font = `bold ${size}px Georgia, 'Times New Roman', serif`; }
    g.fillStyle = SIGN_COLOURS.lettering; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, x + SIGN_W / 2, y + (en.sub ? SIGN_H * 0.38 : SIGN_H / 2 + 1));
    if (en.sub) { g.font = 'bold 13px sans-serif'; g.fillText(en.sub, x + SIGN_W / 2, y + SIGN_H * 0.72); }
    // wear: chips in the enamel, rust from the screws
    const r = new Rng(hashString(`sign:${en.text}`), 'wear');
    for (let j = 0; j < 14; j++) { g.fillStyle = rgba('#141210', 0.3 + r.float() * 0.5); g.fillRect(x + 6 + r.int(SIGN_W - 12), y + 6 + r.int(SIGN_H - 12), 1 + r.int(4), 1 + r.int(3)); }
    for (const sx of [x + 14, x + SIGN_W - 18]) { g.fillStyle = '#6b6a66'; g.fillRect(sx, y + SIGN_H / 2 - 2, 4, 4); }
  });
  return { cv, rows, tile(k) { const u0 = (k % SIGN_COLS) / SIGN_COLS, row = Math.floor(k / SIGN_COLS); const v1 = 1 - row / rows; return [u0 + 0.5 / cv.width, v1 - 1 / rows + 0.5 / cv.height, u0 + 1 / SIGN_COLS - 0.5 / cv.width, v1 - 0.5 / cv.height]; } };
}

/** How high a name plate sits on each kind of place's walls, in metres (its centre). */
const SIGN_Y = { tenements: 2.45, market: 2.85, depot: 3.7, yards: 2.4, park: 2.3, ruins: 2.2, plaza: 2.3, canal: 2.3 };

// ------------------------------------------------------------------ wall art

const WORDS = ['TO LET', 'TRAM 4', 'NO PARKING', 'CINEMA', 'SALE', 'LAUNDRY', 'TAXI', 'DANCE HALL', 'FERRY', 'NIGHT BUS', 'BOXING', 'CLOSED', 'RADIO', 'HOTEL', 'DENTIST', 'BAKERY'];

/** 64 tiles: 0-15 posters, 16-35 graffiti, 36-47 stencils, 48-55 warnings, 56-63 peeling paint. */
function decalAtlas(seed) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = DECAL_T * DECAL_COLS;
  const g = cv.getContext('2d');
  const r = new Rng(seed, 'decals');
  const ink = () => DECAL_INKS[r.int(DECAL_INKS.length)];
  for (let k = 0; k < 64; k++) {
    const x0 = (k % DECAL_COLS) * DECAL_T, y0 = Math.floor(k / DECAL_COLS) * DECAL_T, T = DECAL_T;
    g.save(); g.beginPath(); g.rect(x0 + 2, y0 + 2, T - 4, T - 4); g.clip();
    if (k < 16) {
      // a poster: paper, a block of colour, a headline, lines of small print, a torn corner
      const pw = T * 0.62, ph = T * 0.86, px = x0 + (T - pw) / 2, py = y0 + (T - ph) / 2;
      g.fillStyle = POSTER_PAPERS[r.int(POSTER_PAPERS.length)]; g.fillRect(px, py, pw, ph);
      g.fillStyle = rgba(ink(), 0.85); g.fillRect(px + 6, py + 8, pw - 12, ph * 0.38);
      g.fillStyle = '#26282c'; g.font = `bold ${11 + r.int(4)}px sans-serif`; g.textAlign = 'center';
      g.fillText(WORDS[k % WORDS.length], px + pw / 2, py + ph * 0.58, pw - 8);
      for (let l = 0; l < 4; l++) g.fillRect(px + 8, py + ph * 0.66 + l * 7, (pw - 16) * (0.5 + r.float() * 0.5), 2);
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.moveTo(px + pw, py + ph); g.lineTo(px + pw - 12 - r.int(20), py + ph); g.lineTo(px + pw, py + ph - 14 - r.int(20)); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(20,18,15,0.25)'; g.fillRect(px + r.int(pw), py + r.int(ph), 1 + r.int(3), 1 + r.int(6)); }
    } else if (k < 36) {
      // graffiti: a tag in loops and strokes, sometimes outlined
      const c = ink();
      g.lineCap = 'round'; g.lineJoin = 'round';
      const pts = []; let x = x0 + 14, y = y0 + T / 2 + r.range(-10, 10);
      for (let i = 0; i < 9; i++) { pts.push([x, y]); x += 8 + r.int(12); y += r.range(-22, 22); y = Math.max(y0 + 20, Math.min(y0 + T - 20, y)); }
      for (const [w, col] of (r.bool(0.4) ? [[11, '#1c1d20'], [6, c]] : [[6, c]])) {
        g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(...pts[0]);
        for (let i = 1; i < pts.length; i++) g.quadraticCurveTo(pts[i - 1][0] + 6, pts[i - 1][1] - 18, ...pts[i]);
        g.stroke();
      }
      for (let i = 0; i < 3; i++) streak(g, x0 + 20 + r.int(T - 40), y0 + T / 2, 2, 10 + r.int(24), c);
    } else if (k < 48) {
      // a stencil: a number, an arrow, a grid code
      g.fillStyle = rgba(ink(), 0.9); g.textAlign = 'center'; g.textBaseline = 'middle';
      if (k % 3 === 0) { g.font = 'bold 54px monospace'; g.fillText(String(r.int(90) + 10), x0 + T / 2, y0 + T / 2); }
      else if (k % 3 === 1) { g.beginPath(); const cx = x0 + T / 2, cy = y0 + T / 2; g.moveTo(cx - 40, cy - 9); g.lineTo(cx + 10, cy - 9); g.lineTo(cx + 10, cy - 24); g.lineTo(cx + 42, cy); g.lineTo(cx + 10, cy + 24); g.lineTo(cx + 10, cy + 9); g.lineTo(cx - 40, cy + 9); g.closePath(); g.fill(); }
      else { g.font = 'bold 30px monospace'; g.fillText(`${'ABCDEFGH'[r.int(8)]}-${r.int(9)}${r.int(9)}`, x0 + T / 2, y0 + T / 2); }
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 6; i++) g.fillRect(x0 + r.int(T), y0, 3, T);   // stencil bridges
      g.globalCompositeOperation = 'source-over';
    } else if (k < 56) {
      // a warning plate: white, a black border and a black mark
      const cx = x0 + T / 2, cy = y0 + T / 2;
      g.fillStyle = '#e4e4e2'; g.fillRect(cx - 34, cy - 34, 68, 68);
      g.strokeStyle = '#141414'; g.lineWidth = 5; g.strokeRect(cx - 30, cy - 30, 60, 60);
      g.fillStyle = '#141414'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(k % 2 ? '✕' : '!', cx, cy + 2);   // (never a lightning mark: that is the bolt pickup's)
    } else {
      // a patch of old paint peeling off in flakes
      const c = DECAL_INKS[(k * 3) % DECAL_INKS.length];
      for (let i = 0; i < 26; i++) {
        g.fillStyle = rgba(c, 0.55 + r.float() * 0.3);
        g.beginPath(); const cx = x0 + 20 + r.int(T - 40), cy = y0 + 20 + r.int(T - 40);
        g.moveTo(cx, cy); for (let j = 0; j < 5; j++) g.lineTo(cx + r.range(-16, 16), cy + r.range(-16, 16)); g.closePath(); g.fill();
      }
    }
    g.restore();
  }
  return { cv, tile(k) { const u0 = (k % DECAL_COLS) / DECAL_COLS, v1 = 1 - Math.floor(k / DECAL_COLS) / DECAL_COLS; return [u0, v1 - 1 / DECAL_COLS, u0 + 1 / DECAL_COLS, v1]; } };
}

function streak(g, x, y, w, len, colour) {
  const grd = g.createLinearGradient(0, y, 0, y + len);
  grd.addColorStop(0, rgba(colour, 0.8)); grd.addColorStop(1, rgba(colour, 0));
  g.fillStyle = grd; g.fillRect(x, y, w, len);
}

/** What goes on a wall by its kind of place: [chance per face, kinds]. */
const ART_BY_TYPE = {
  street: [0.1, ['poster', 'graffiti', 'graffiti', 'stencil', 'paint']],
  tenements: [0.2, ['graffiti', 'graffiti', 'poster', 'paint']],
  market: [0.3, ['poster', 'poster', 'graffiti', 'graffiti']],
  yards: [0.16, ['stencil', 'graffiti', 'warning', 'paint']],
  depot: [0.16, ['stencil', 'stencil', 'warning', 'graffiti']],
  ruins: [0.14, ['graffiti', 'paint', 'paint']],
  plaza: [0.08, ['poster', 'graffiti']],
  canal: [0.1, ['graffiti', 'stencil', 'paint']],
  park: [0, []],
};
const KIND_TILES = { poster: [0, 16], graffiti: [16, 36], stencil: [36, 48], warning: [48, 56], paint: [56, 64] };

/**
 * @param {object} level   with map and places
 * @param {object} o       { cellM, seed, art, lookAt(x, y), heightAt(x, y), track }
 * @returns {THREE.Object3D[]}
 */
export function buildSigns(level, { cellM, seed, art, lookAt, heightAt, track, wallArt = true }) {
  const { map } = level;
  const places = level.places || [];
  const out = [];
  const tileAt = (x, y) => (x < 0 || y < 0 || x >= map.w || y >= map.h ? TILE.WALL : map.tiles[y * map.w + x]);
  const open = (x, y) => { const t = tileAt(x, y); return t !== TILE.WALL && t !== TILE.BUILDING; };
  const inside = (pl, x, y) => x >= pl.x && y >= pl.y && x < pl.x + pl.w && y < pl.y + pl.h;
  const faceCentre = (x, y, dx, dy, along, hgt, off = 0.02) => ({
    x: (x + 0.5 + dx * 0.5) * cellM + dx * off + -dy * along, y: hgt, z: (y + 0.5 + dy * 0.5) * cellM + dy * off + dx * along,
  });

  // ---- signs: at the gates
  const avenues = level.avenues || [];
  if (places.length) {
    const atlas = signAtlas([
      ...places.map((pl) => ({ text: pl.name.toUpperCase(), plate: SIGN_COLOURS[pl.type] || SIGN_COLOURS.yards })),
      ...avenues.map((av) => ({ text: av.name.toUpperCase(), sub: `DISTRICT ${level.level}`, plate: SIGN_COLOURS.canal })),
    ]);
    const q = quadBuffer();
    const post = atlas.tile(0);
    places.forEach((pl, i) => {
      const r = new Rng(hashString(`${seed}:sign:${pl.id}`), 'sign');
      // every opening in the place's edge onto the outside: an edge cell that is open,
      // with open ground just outside it
      const gates = [];
      for (let y = pl.y; y < pl.y + pl.h; y++) for (let x = pl.x; x < pl.x + pl.w; x++) {
        if (!open(x, y)) continue;
        for (const [dx, dy] of DIR4) {
          if (inside(pl, x + dx, y + dy) || !open(x + dx, y + dy)) continue;
          // a wall cell along the edge, beside the gate, to hang the plate on
          for (const s of [-1, 1]) {
            const wx = x + -dy * s, wy = y + dx * s;
            if (inside(pl, wx, wy) && tileAt(wx, wy) === TILE.WALL && open(wx + dx, wy + dy)) gates.push({ wx, wy, dx, dy, side: `${dx},${dy}` });
          }
          gates.push({ px: x, py: y, dx, dy, side: `${dx},${dy}` });
        }
      }
      const onWall = gates.filter((gt) => gt.wx !== undefined), loose = gates.filter((gt) => gt.wx === undefined);
      const chosen = [], sides = new Set();
      for (const gt of r.shuffle(onWall.length ? onWall : loose)) {
        if (sides.has(gt.side)) continue;
        sides.add(gt.side); chosen.push(gt);
        if (chosen.length === 2) break;
      }
      const uv = atlas.tile(i + 1);
      for (const gt of chosen) {
        const n = { x: gt.dx, z: gt.dy };
        if (gt.wx !== undefined) {
          const y = Math.min(SIGN_Y[pl.type] || 2.4, heightAt(gt.wx, gt.wy) - 0.35);
          q.add(faceCentre(gt.wx, gt.wy, gt.dx, gt.dy, 0, y), n, 1.3, 0.325, uv);
        } else {
          // an open place: a plate on a post at the edge of the gate cell, both faces
          const px = (gt.px + 0.5 + gt.dx * 0.42) * cellM, pz = (gt.py + 0.5 + gt.dy * 0.42) * cellM;
          const along = { x: -gt.dy, z: gt.dx };
          q.post(px, pz, 0.07, 2.65, [(post[0] + post[2]) / 2, (post[1] + post[3]) / 2]);
          q.add({ x: px + along.x * 0.04, y: 2.3, z: pz + along.z * 0.04 }, along, 1.1, 0.275, uv);
          q.add({ x: px - along.x * 0.04, y: 2.3, z: pz - along.z * 0.04 }, { x: -along.x, z: -along.z }, 1.1, 0.275, uv);
        }
      }
    });
    // N4.3: every avenue's name, with the district's number, on the walls along it
    avenues.forEach((av, j) => {
      const uv = atlas.tile(places.length + 1 + j);
      const len = av.axis === 'x' ? map.h : map.w;
      for (let t = 6, side = 0; t < len - 3; t += 18, side ^= 1) {
        for (const s2 of [side, side ^ 1]) {
          // vertical avenue: walls just west (facing +x) and east (facing -x); horizontal likewise
          const wx = av.axis === 'x' ? (s2 ? av.at + av.w : av.at - 1) : t;
          const wy = av.axis === 'x' ? t : (s2 ? av.at + av.w : av.at - 1);
          const dx = av.axis === 'x' ? (s2 ? -1 : 1) : 0, dy = av.axis === 'x' ? 0 : (s2 ? -1 : 1);
          if (tileAt(wx, wy) !== TILE.WALL || !open(wx + dx, wy + dy)) continue;
          q.add(faceCentre(wx, wy, dx, dy, 0, Math.min(2.95, heightAt(wx, wy) - 0.3)), { x: dx, z: dy }, 1.2, 0.3, uv);
          break;
        }
      }
    });
    if (q.count) {
      const tex = track(new THREE.CanvasTexture(atlas.cv));
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const mesh = new THREE.Mesh(track(q.geometry()), track(new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.12 + 0.3 * art.t,
        roughness: 0.45, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      })));
      mesh.name = 'signs';
      mesh.frustumCulled = false;
      out.push(mesh);
    }
  }

  // ---- wall art: on the faces that look onto the streets and yards
  const atlas = decalAtlas(seed);
  const q = quadBuffer();
  const depth = 0.7 + 0.6 * (art.t || 0);
  // (N4.4: not in district 1, whose buildings carry their own signs, nothing scattered)
  if (wallArt) for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (tileAt(x, y) !== TILE.WALL) continue;
    const L = lookAt(x, y);
    const [chance, kinds] = ART_BY_TYPE[L ? L.type : 'street'];
    if (!chance) continue;
    const top = heightAt(x, y);
    for (const [dx, dy] of DIR4) {
      if (!open(x + dx, y + dy)) continue;
      const r = new Rng(hashString(`${seed}:art:${x},${y},${dx},${dy}`), 'art');
      if (r.float() > chance * depth) continue;
      const kind = kinds[r.int(kinds.length)];
      const [a, b] = KIND_TILES[kind];
      const tile = atlas.tile(a + r.int(b - a));
      // sizes and heights by kind; on tenements, keep clear of the windows and the door
      let size = kind === 'graffiti' ? 0.9 + r.float() * 0.5 : kind === 'poster' ? 0.75 : kind === 'paint' ? 0.7 + r.float() * 0.5 : 0.55;
      let along = (r.float() - 0.5) * (cellM - size) * 0.9;
      let hgt = kind === 'graffiti' ? 0.75 + r.float() * 0.6 : kind === 'poster' ? 1.35 + r.float() * 0.35 : kind === 'warning' ? 1.6 : 0.6 + r.float() * 1.2;
      if (L?.type === 'tenements') {
        if (kind === 'poster') { size = 0.5; along = (r.bool(0.5) ? 1 : -1) * 0.5; } else { hgt = 0.45; }
      }
      hgt = Math.max(size / 2 + 0.05, Math.min(hgt, top - size / 2 - 0.1));
      q.add(faceCentre(x, y, dx, dy, along, hgt, 0.015 + r.float() * 0.004), { x: dx, z: dy }, size, size, tile);
    }
  }
  if (q.count) {
    const tex = track(new THREE.CanvasTexture(atlas.cv));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const mesh = new THREE.Mesh(track(q.geometry()), track(new THREE.MeshStandardMaterial({
      map: tex, alphaTest: 0.4, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    })));
    mesh.name = 'wall-art';
    mesh.frustumCulled = false;
    out.push(mesh);
  }
  return out;
}
