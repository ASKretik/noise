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

// ------------------------------------------------------------------ real plates (build 44)

const RP_W = 512, RP_H = 128, RP_COLS = 4;

/**
 * Build 44, at the user's request ("make the signboards very realistic, just like the
 * buildings"): vitreous enamel street plates, as cities hung them for a century -- a
 * coloured ground, a white border and condensed white lettering, rounded corners, four
 * fixing holes. And the years: the enamel chipped to black iron, mostly at the edges and
 * round the bolts, each chip with a rust halo; rust run down from the fixings; city grime
 * gathered along the bottom edge; the top bleached; fine scratches. Three maps per plate:
 * colour (alpha cuts the corners), surface relief (the folded rim, raised bolts, chips as
 * pits, a slight warp), and roughness (glossy enamel, rough rust and dirt).
 */
function realPlates(entries) {
  const rows = Math.max(1, Math.ceil(entries.length / RP_COLS));
  const W = RP_W * RP_COLS, H = RP_H * rows;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
  const [colCv, g] = mk(), [hCv, hg] = mk(), [rCv, rg] = mk();
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, W, H);
  rg.fillStyle = '#383838'; rg.fillRect(0, 0, W, H);     // enamel: glossy (roughness ~0.22)
  const rr = (c, x, y, w, h, rad) => { c.beginPath(); c.moveTo(x + rad, y); c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad); c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath(); };
  const FONT = (px) => `bold ${px}px "DIN Condensed", "Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", sans-serif`;
  entries.forEach((en, i) => {
    const x0 = (i % RP_COLS) * RP_W, y0 = Math.floor(i / RP_COLS) * RP_H;
    const r = new Rng(hashString(`realplate:${en.text}`), 'plate');
    const wear = 0.35 + r.float() * 0.65;
    g.save(); hg.save(); rg.save();
    g.beginPath(); g.rect(x0, y0, RP_W, RP_H); g.clip();
    hg.beginPath(); hg.rect(x0, y0, RP_W, RP_H); hg.clip();
    rg.beginPath(); rg.rect(x0, y0, RP_W, RP_H); rg.clip();
    // the plate: enamel ground with a slight mottle, rounded corners (alpha)
    g.clearRect(x0, y0, RP_W, RP_H);
    rr(g, x0 + 2, y0 + 2, RP_W - 4, RP_H - 4, 14); g.fillStyle = en.plate; g.fill();
    for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(${r.bool(0.5) ? '255,255,255' : '0,0,0'},${0.015 + r.float() * 0.03})`; g.beginPath(); g.ellipse(x0 + r.float() * RP_W, y0 + r.float() * RP_H, 10 + r.float() * 40, 6 + r.float() * 20, r.float() * 3, 0, 6.283); g.fill(); }
    // the folded rim: raised in the relief, a darker edge in colour
    rr(hg, x0 + 2, y0 + 2, RP_W - 4, RP_H - 4, 14); hg.lineWidth = 7; hg.strokeStyle = '#b0b0b0'; hg.stroke();
    rr(g, x0 + 4, y0 + 4, RP_W - 8, RP_H - 8, 12); g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.stroke();
    // the white border and the name
    const ink = SIGN_COLOURS.lettering;
    rr(g, x0 + 13, y0 + 13, RP_W - 26, RP_H - 26, 8); g.lineWidth = 4; g.strokeStyle = ink; g.stroke();
    let size = en.sub ? 50 : 64;
    g.font = FONT(size);
    while (g.measureText(en.text).width > RP_W - 92 && size > 24) { size -= 2; g.font = FONT(size); }
    g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(en.text, x0 + RP_W / 2, y0 + (en.sub ? RP_H * 0.4 : RP_H / 2 + 3));
    if (en.sub) { g.font = FONT(22); g.fillText(en.sub, x0 + RP_W / 2, y0 + RP_H * 0.76); }
    // fixing holes and bolt heads (the bolts themselves are modelled)
    const holes = [[26, 26], [RP_W - 26, 26], [26, RP_H - 26], [RP_W - 26, RP_H - 26]];
    // rust run down from each fixing
    for (const [hx, hy] of holes) {
      if (!r.bool(0.35 + wear * 0.55)) continue;
      const len = 20 + r.float() * 70 * wear;
      const grd = g.createLinearGradient(0, y0 + hy, 0, y0 + hy + len);
      grd.addColorStop(0, `rgba(96,48,22,${0.55 * wear})`); grd.addColorStop(1, 'rgba(96,48,22,0)');
      g.fillStyle = grd;
      for (let k = 0; k < 3; k++) g.fillRect(x0 + hx - 4 + r.float() * 8 - 3, y0 + hy, 2 + r.float() * 4, len * (0.5 + r.float() * 0.5));
      rg.fillStyle = 'rgba(200,200,200,0.5)'; rg.fillRect(x0 + hx - 5, y0 + hy, 10, len * 0.7);
    }
    // chips in the enamel: black iron with a rust halo; most at the edges and round the holes
    const nChips = Math.round(4 + wear * 22);
    for (let k = 0; k < nChips; k++) {
      let cx, cy;
      const pick = r.float();
      if (pick < 0.5) { const e = r.int(4); cx = e === 0 ? 6 + r.float() * 14 : e === 1 ? RP_W - 6 - r.float() * 14 : r.float() * RP_W; cy = e === 2 ? 6 + r.float() * 12 : e === 3 ? RP_H - 6 - r.float() * 12 : r.float() * RP_H; }
      else if (pick < 0.75) { const [hx, hy] = holes[r.int(4)]; cx = hx + (r.float() - 0.5) * 26; cy = hy + (r.float() - 0.5) * 22; }
      else { cx = 20 + r.float() * (RP_W - 40); cy = 20 + r.float() * (RP_H - 40); }
      const rad = 2 + r.float() * (5 + wear * 9);
      const poly = (c, scale, fill) => {
        c.beginPath();
        const n = 6 + r.int(4);
        for (let j = 0; j < n; j++) { const a = (j / n) * 6.283, d = rad * scale * (0.55 + r.float() * 0.6); const px = x0 + cx + Math.cos(a) * d, py = y0 + cy + Math.sin(a) * d * 0.8; if (j) c.lineTo(px, py); else c.moveTo(px, py); }
        c.closePath(); c.fillStyle = fill; c.fill();
      };
      poly(g, 1.5, 'rgba(110,56,24,0.55)');     // the rust halo under the enamel's edge
      poly(g, 1.0, '#1b1714');                   // bare iron
      poly(hg, 1.05, '#5a5a5a');                 // a pit in the relief
      poly(rg, 1.3, '#d8d8d8');                  // rough
    }
    // scratches
    for (let k = 0; k < 6 + wear * 10; k++) {
      const sx = x0 + r.float() * RP_W, sy = y0 + r.float() * RP_H, a = (r.float() - 0.5) * 0.8, l = 10 + r.float() * 40;
      g.strokeStyle = `rgba(255,255,255,${0.06 + r.float() * 0.08})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); g.stroke();
    }
    // grime gathered along the bottom, the top bleached by the sun
    let grd = g.createLinearGradient(0, y0 + RP_H * 0.55, 0, y0 + RP_H);
    grd.addColorStop(0, 'rgba(40,34,26,0)'); grd.addColorStop(1, `rgba(40,34,26,${0.25 + wear * 0.35})`);
    g.fillStyle = grd; g.fillRect(x0, y0, RP_W, RP_H);
    grd = g.createLinearGradient(0, y0, 0, y0 + RP_H * 0.45);
    grd.addColorStop(0, `rgba(255,255,255,${0.05 + wear * 0.07})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(x0, y0, RP_W, RP_H);
    grd = rg.createLinearGradient(0, y0 + RP_H * 0.6, 0, y0 + RP_H);
    grd.addColorStop(0, 'rgba(160,160,160,0)'); grd.addColorStop(1, 'rgba(160,160,160,0.6)');
    rg.fillStyle = grd; rg.fillRect(x0, y0, RP_W, RP_H);
    // a slight warp: the plate is not quite flat any more
    grd = hg.createLinearGradient(x0, 0, x0 + RP_W, 0);
    const bend = (r.float() - 0.5) * 30;
    grd.addColorStop(0, `rgba(${128 + bend},${128 + bend},${128 + bend},0.3)`); grd.addColorStop(1, `rgba(${128 - bend},${128 - bend},${128 - bend},0.3)`);
    hg.fillStyle = grd; hg.fillRect(x0 + 8, y0 + 8, RP_W - 16, RP_H - 16);
    for (const [hx, hy] of holes) { hg.fillStyle = '#e0e0e0'; hg.beginPath(); hg.arc(x0 + hx, y0 + hy, 7, 0, 6.283); hg.fill(); }
    g.restore(); hg.restore(); rg.restore();
    en.holes = holes.map(([hx, hy]) => [hx / RP_W, hy / RP_H]);
  });
  // the relief as a normal map
  const hd = hg.getImageData(0, 0, W, H).data, nCv = document.createElement('canvas');
  nCv.width = W; nCv.height = H;
  const ng = nCv.getContext('2d'), nd = ng.createImageData(W, H);
  const hAt = (x, y) => hd[((Math.min(H - 1, Math.max(0, y)) * W) + Math.min(W - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * 3.2, dy = (hAt(x, y + 1) - hAt(x, y - 1)) * 3.2;
    const l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    nd.data[i] = (-dx / l * 0.5 + 0.5) * 255; nd.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; nd.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[i + 3] = 255;
  }
  ng.putImageData(nd, 0, 0);
  return {
    colCv, nCv, rCv, rows,
    tile(k) { const u0 = (k % RP_COLS) / RP_COLS, row = Math.floor(k / RP_COLS); const v1 = 1 - row / rows; return [u0 + 0.5 / W, v1 - 1 / rows + 0.5 / H, u0 + 1 / RP_COLS - 0.5 / W, v1 - 0.5 / H]; },
  };
}

/**
 * The same interface as quadBuffer (add, post, count), for the real plates: each plate
 * a front and a back face a little off the wall, four modelled bolt heads, and posts as
 * round steel tubes with a cap and two clamps.
 */
function realBuffer() {
  const plates = quadBuffer(), backs = quadBuffer();
  const metal = { pos: [], nrm: [], idx: [] };
  const cyl = (x, y, z, rad, h, ax, segs = 10) => {
    // an upright (ax 'y') or wall-facing (ax {x, z}) cylinder, capped at the outer end
    const b = metal.pos.length / 3;
    const up = ax === 'y' ? [0, 1, 0] : [ax.x, 0, ax.z];
    const u = ax === 'y' ? [1, 0, 0] : [-ax.z, 0, ax.x], w = ax === 'y' ? [0, 0, 1] : [0, 1, 0];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const n = [u[0] * c + w[0] * s, u[1] * c + w[1] * s, u[2] * c + w[2] * s];
      for (const t of [0, h]) { metal.pos.push(x + n[0] * rad + up[0] * t, y + n[1] * rad + up[1] * t, z + n[2] * rad + up[2] * t); metal.nrm.push(...n); }
    }
    for (let i = 0; i < segs; i++) { const a = b + i * 2; metal.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const cb = metal.pos.length / 3;
    metal.pos.push(x + up[0] * h, y + up[1] * h, z + up[2] * h); metal.nrm.push(...up);
    for (let i = 0; i <= segs; i++) { const a = (i / segs) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); metal.pos.push(x + (u[0] * c + w[0] * s) * rad + up[0] * h, y + (u[1] * c + w[1] * s) * rad + up[1] * h, z + (u[2] * c + w[2] * s) * rad + up[2] * h); metal.nrm.push(...up); }
    for (let i = 0; i < segs; i++) metal.idx.push(cb, cb + 1 + i, cb + 2 + i);
  };
  const boxM = (x, y, z, sx, sy, sz) => {
    for (const [n, a, b2] of [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]]]) {
      const b = metal.pos.length / 3;
      const c = [x + n[0] * sx / 2, y + n[1] * sy / 2, z + n[2] * sz / 2];
      const ha = [a[0] * sx / 2, a[1] * sy / 2, a[2] * sz / 2], hb = [b2[0] * sx / 2, b2[1] * sy / 2, b2[2] * sz / 2];
      for (const [p, q2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { metal.pos.push(c[0] + ha[0] * p + hb[0] * q2, c[1] + ha[1] * p + hb[1] * q2, c[2] + ha[2] * p + hb[2] * q2); metal.nrm.push(...n); }
      metal.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  };
  let count = 0;
  return {
    standOff: 0.028,
    add(c, n, w, h, uv, holes = [[0.05, 0.2], [0.95, 0.2], [0.05, 0.8], [0.95, 0.8]]) {
      // standing off the wall on its bolts, so it throws a shadow -- on a model-kit front
      // far enough to clear the band it hangs on (the brick kit's projects 10 cm)
      const out = this.standOff;
      const cc = { x: c.x + n.x * out, y: c.y, z: c.z + n.z * out };
      plates.add(cc, n, w, h, uv);
      // the back: plain iron, facing the wall (seen from the side, or on a post)
      backs.add({ x: cc.x - n.x * 0.004, y: cc.y, z: cc.z - n.z * 0.004 }, { x: -n.x, z: -n.z }, w, h, uv);
      const rx = n.z, rz = -n.x;
      for (const [hx, hy] of holes) {
        const px = cc.x + rx * (hx - 0.5) * w, py = cc.y + (0.5 - hy) * h, pz = cc.z + rz * (hx - 0.5) * w;
        cyl(px - n.x * out, py, pz - n.z * out, 0.006, out + 0.006, n, 6);    // the bolt
        cyl(px, py, pz, 0.014, 0.008, n, 8);                                   // its head
      }
      count++;
    },
    post(x, z, wP, hP) {
      cyl(x, 0, z, 0.038, hP, 'y', 14);
      cyl(x, hP, z, 0.045, 0.02, 'y', 14);                      // the cap
      cyl(x, 0, z, 0.06, 0.12, 'y', 14);                        // a collar at the foot
      for (const y of [2.12, 2.44]) boxM(x, y, z, 0.11, 0.035, 0.11);   // clamps for the plate
      count++;
    },
    get count() { return count; },
    meshes(atlas, track) {
      const L = (cv, srgb) => { const t = track(new THREE.CanvasTexture(cv)); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
      const map = L(atlas.colCv, true), normalMap = L(atlas.nCv, false), roughnessMap = L(atlas.rCv, false);
      const out = [];
      const front = new THREE.Mesh(track(plates.geometry()), track(new THREE.MeshStandardMaterial({
        map, normalMap, roughnessMap, roughness: 1, metalness: 0.05, alphaTest: 0.5, normalScale: new THREE.Vector2(1.2, 1.2),
      })));
      front.name = 'signs'; front.castShadow = true; front.receiveShadow = true;
      // (the colour map only for its alpha: the same rounded corners; darkened to iron)
      const back = new THREE.Mesh(track(backs.geometry()), track(new THREE.MeshStandardMaterial({ map, color: '#2e2a26', alphaTest: 0.5, roughness: 0.8, metalness: 0.5 })));
      back.castShadow = true; back.receiveShadow = true;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(metal.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(metal.nrm, 3));
      g.setIndex(metal.idx);
      g.computeBoundingSphere();
      const steel = new THREE.Mesh(track(g), track(new THREE.MeshStandardMaterial({ color: '#3b3d3f', roughness: 0.55, metalness: 0.75 })));
      steel.name = 'sign-steel'; steel.castShadow = true; steel.receiveShadow = true;
      out.push(front, back, steel);
      return out;
    },
  };
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
export function buildSigns(level, { cellM, seed, art, lookAt, heightAt, track, wallArt = true, real = false, faceBusy = null }) {
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
    const entries = [
      ...places.map((pl) => ({ text: pl.name.toUpperCase(), plate: SIGN_COLOURS[pl.type] || SIGN_COLOURS.yards })),
      ...avenues.map((av) => ({ text: av.name.toUpperCase(), sub: `DISTRICT ${level.level}`, plate: SIGN_COLOURS.canal })),
    ];
    // build 44: real enamel plates (realPlates) where the style asks; tile k of the drawn
    // atlas is k + 1 (tile 0 is its post colour), of the real one k
    const atlas = real ? realPlates(entries) : signAtlas(entries);
    const tileOf = (k) => atlas.tile(real ? k - 1 : k);
    const q = real ? realBuffer() : quadBuffer();
    if (real && faceBusy) q.standOff = 0.125;
    const post = real ? [0, 0, 0, 0] : atlas.tile(0);
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
            if (inside(pl, wx, wy) && tileAt(wx, wy) === TILE.WALL && open(wx + dx, wy + dy) && !faceBusy?.(wx, wy, dx, dy)) gates.push({ wx, wy, dx, dy, side: `${dx},${dy}` });
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
      const uv = tileOf(i + 1);
      for (const gt of chosen) {
        const n = { x: gt.dx, z: gt.dy };
        if (gt.wx !== undefined) {
          // (real plates on the model kit's fronts sit on the band over the ground floor)
          // (and on a yard wall, below its coping)
          const top = heightAt(gt.wx, gt.wy);
          const y = real && faceBusy ? (top < 3.4 ? top - 0.62 : 2.76) : Math.min(SIGN_Y[pl.type] || 2.4, top - 0.35);
          q.add(faceCentre(gt.wx, gt.wy, gt.dx, gt.dy, 0, y), n, 1.3, 0.325, uv);
        } else {
          // an open place: a plate on a post at the edge of the gate cell, both faces
          const px = (gt.px + 0.5 + gt.dx * 0.42) * cellM, pz = (gt.py + 0.5 + gt.dy * 0.42) * cellM;
          const along = { x: -gt.dy, z: gt.dx };
          q.post(px, pz, 0.07, 2.65, [(post[0] + post[2]) / 2, (post[1] + post[3]) / 2]);
          const off = real ? 0.02 : 0.04;
          q.add({ x: px + along.x * off, y: 2.3, z: pz + along.z * off }, along, 1.1, 0.275, uv);
          q.add({ x: px - along.x * off, y: 2.3, z: pz - along.z * off }, { x: -along.x, z: -along.z }, 1.1, 0.275, uv);
        }
      }
    });
    // N4.3: every avenue's name, with the district's number, on the walls along it
    avenues.forEach((av, j) => {
      const uv = tileOf(places.length + 1 + j);
      const len = av.axis === 'x' ? map.h : map.w;
      for (let t = 6, side = 0; t < len - 3; t += 18, side ^= 1) {
        for (const s2 of [side, side ^ 1]) {
          // vertical avenue: walls just west (facing +x) and east (facing -x); horizontal likewise
          const wx = av.axis === 'x' ? (s2 ? av.at + av.w : av.at - 1) : t;
          const wy = av.axis === 'x' ? t : (s2 ? av.at + av.w : av.at - 1);
          const dx = av.axis === 'x' ? (s2 ? -1 : 1) : 0, dy = av.axis === 'x' ? 0 : (s2 ? -1 : 1);
          if (tileAt(wx, wy) !== TILE.WALL || !open(wx + dx, wy + dy) || faceBusy?.(wx, wy, dx, dy)) continue;
          const top = heightAt(wx, wy);
          q.add(faceCentre(wx, wy, dx, dy, 0, real && faceBusy ? (top < 3.4 ? top - 0.62 : 2.76) : Math.min(2.95, top - 0.3)), { x: dx, z: dy }, 1.2, 0.3, uv);
          break;
        }
      }
    });
    if (q.count && real) out.push(...q.meshes(atlas, track));
    else if (q.count) {
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
