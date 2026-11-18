// web3d/art/textures.js -- surfaces for the art-directed belts. Browser only.
//
// Every texture is drawn on a canvas from a seeded Rng, as before (no image files, nothing
// calls Math.random). Each style draws a colour canvas and a height canvas side by side;
// the normal map is the height canvas's Sobel gradient, so seams sink, rivets stand proud
// and stone blocks have edges. TIDE's wet concrete also draws a roughness map: the wet
// parts shine.
//
//   riveted      RUST walls: steel panels, rivet rows, rust running down from every rivet
//   plates       RUST floors: tread plates with bolts and oil stains
//   wetConcrete  TIDE walls and floors: form-work seams, water stains, a wet foot, puddles
//   mossyStone   MOSS walls: coursed stone blocks with moss in the joints and at the foot
//   flagstones   MOSS floors: uneven flags with moss growing between them

import * as THREE from 'three';
import { Rng } from '../../sim/prng.js';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function texture(cv, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A tangent-space normal map from a height canvas (red channel = height), by Sobel. */
export function normalFrom(heightCv, strength) {
  const w = heightCv.width, h = heightCv.height;
  const src = heightCv.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h), g = out.getContext('2d'), img = g.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      img.data[i] = 128 + nx * 127; img.data[i + 1] = 128 + ny * 127; img.data[i + 2] = 128 + nz * 127; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

export const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
export const grey = (v, a = 1) => `rgba(${v},${v},${v},${a})`;

export function speckle(g, rng, w, h, n, colour, alpha, size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rgba(colour, alpha * (0.4 + rng.float() * 0.6));
    g.fillRect(rng.int(w), rng.int(h), 1 + rng.int(size), 1 + rng.int(size));
  }
}

export function blotch(g, rng, x, y, r, colour, alpha) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, rgba(colour, alpha));
  grd.addColorStop(1, rgba(colour, 0));
  g.fillStyle = grd;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

export function streak(g, x, y, wdt, len, colour, alpha) {
  const grd = g.createLinearGradient(0, y, 0, y + len);
  grd.addColorStop(0, rgba(colour, alpha));
  grd.addColorStop(1, rgba(colour, 0));
  g.fillStyle = grd;
  g.fillRect(x, y, wdt, len);
}

// ------------------------------------------------------------------ styles

function riveted(rng, s) {
  const W = 256, Hh = 512, c = canvas(W, Hh), h = canvas(W, Hh);
  const g = c.getContext('2d'), hg = h.getContext('2d');
  g.fillStyle = s.base; g.fillRect(0, 0, W, Hh);
  hg.fillStyle = grey(128); hg.fillRect(0, 0, W, Hh);
  speckle(g, rng, W, Hh, 2600, s.detail, 0.25);
  speckle(g, rng, W, Hh, 1400, '#000000', 0.18);
  for (let i = 0; i < 18; i++) blotch(g, rng, rng.int(W), rng.int(Hh), 12 + rng.int(40), s.detail, 0.25);
  const cols = [0, 128], rows = [0, 128, 256, 384];
  // panel seams: sunk, dark, with a bright lip
  for (const x of cols) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, 0, 3, Hh); hg.fillStyle = grey(40); hg.fillRect(x, 0, 3, Hh); g.fillStyle = 'rgba(255,220,190,0.08)'; g.fillRect(x + 3, 0, 1, Hh); }
  for (const y of rows) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, y, W, 3); hg.fillStyle = grey(40); hg.fillRect(0, y, W, 3); g.fillStyle = 'rgba(255,220,190,0.08)'; g.fillRect(0, y + 3, W, 1); }
  // rivets along every seam, rust running down from each
  const rivet = (x, y) => {
    const hgrd = hg.createRadialGradient(x, y, 0, x, y, 4);
    hgrd.addColorStop(0, grey(240)); hgrd.addColorStop(1, grey(128));
    hg.fillStyle = hgrd; hg.beginPath(); hg.arc(x, y, 4, 0, Math.PI * 2); hg.fill();
    g.fillStyle = 'rgba(20,12,8,0.6)'; g.beginPath(); g.arc(x + 0.7, y + 0.7, 3.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = rgba(s.detail, 0.9); g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill();
    if (rng.float() < 0.55) streak(g, x - 1 - rng.int(2), y + 2, 2 + rng.int(3), 20 + rng.int(70), s.detail, 0.55);
  };
  for (const y of rows) for (let x = 10; x < W; x += 21) rivet(x, y + 9);
  for (const x of cols) for (let y = 14; y < Hh; y += 24) rivet(x + 10, y);
  // grime and rust at the foot
  const foot = g.createLinearGradient(0, Hh * 0.72, 0, Hh);
  foot.addColorStop(0, rgba(s.detail, 0)); foot.addColorStop(1, rgba('#1a0f0a', 0.55));
  g.fillStyle = foot; g.fillRect(0, Hh * 0.72, W, Hh * 0.28);
  return { c, h, strength: 2.2 };
}

function plates(rng, s) {
  const S = 256, c = canvas(S, S), h = canvas(S, S);
  const g = c.getContext('2d'), hg = h.getContext('2d');
  g.fillStyle = s.base; g.fillRect(0, 0, S, S);
  hg.fillStyle = grey(128); hg.fillRect(0, 0, S, S);
  speckle(g, rng, S, S, 2400, '#000000', 0.16);
  // tread: short raised diagonal bars in a staggered grid
  for (let y = 6; y < S; y += 16) for (let x = 6 + ((y / 16) % 2) * 8; x < S; x += 16) {
    hg.save(); hg.translate(x, y); hg.rotate(((x + y) / 16) % 2 ? 0.7 : -0.7);
    hg.fillStyle = grey(170); hg.fillRect(-5, -1.2, 10, 2.4); hg.restore();
    g.save(); g.translate(x, y); g.rotate(((x + y) / 16) % 2 ? 0.7 : -0.7);
    g.fillStyle = 'rgba(255,240,220,0.06)'; g.fillRect(-5, -1.2, 10, 2.4); g.restore();
  }
  for (let i = 0; i < 5; i++) blotch(g, rng, rng.int(S), rng.int(S), 14 + rng.int(36), s.detail, 0.55);   // oil
  for (const [x0, y0] of [[0, 0], [128, 0], [0, 128], [128, 128]]) {
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x0, y0, 128, 2); g.fillRect(x0, y0, 2, 128);
    hg.fillStyle = grey(50); hg.fillRect(x0, y0, 128, 2); hg.fillRect(x0, y0, 2, 128);
    for (const [bx, by] of [[8, 8], [120, 8], [8, 120], [120, 120]]) {
      const hgrd = hg.createRadialGradient(x0 + bx, y0 + by, 0, x0 + bx, y0 + by, 3.5);
      hgrd.addColorStop(0, grey(235)); hgrd.addColorStop(1, grey(128));
      hg.fillStyle = hgrd; hg.beginPath(); hg.arc(x0 + bx, y0 + by, 3.5, 0, Math.PI * 2); hg.fill();
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(x0 + bx, y0 + by, 2.5, 0, Math.PI * 2); g.fill();
    }
  }
  return { c, h, strength: 1.6 };
}

function wetConcrete(rng, s, wall) {
  const W = 256, Hh = wall ? 512 : 256, c = canvas(W, Hh), h = canvas(W, Hh), r = canvas(W, Hh);
  const g = c.getContext('2d'), hg = h.getContext('2d'), rg = r.getContext('2d');
  g.fillStyle = s.base; g.fillRect(0, 0, W, Hh);
  hg.fillStyle = grey(128); hg.fillRect(0, 0, W, Hh);
  rg.fillStyle = grey(Math.round(s.roughness * 255)); rg.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 30; i++) blotch(g, rng, rng.int(W), rng.int(Hh), 10 + rng.int(50), rng.bool(0.5) ? '#000000' : '#ffffff', 0.07);
  speckle(g, rng, W, Hh, 3000, '#000000', 0.14);
  for (let i = 0; i < 1500; i++) { hg.fillStyle = grey(110 + rng.int(40)); hg.fillRect(rng.int(W), rng.int(Hh), 1 + rng.int(2), 1 + rng.int(2)); }
  if (wall) {
    for (const y of [0, 170, 340]) {                    // form-work seams and tie holes
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, W, 2); hg.fillStyle = grey(70); hg.fillRect(0, y, W, 2);
      for (const x of [40, 128, 216]) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(x, y + 30, 3, 0, Math.PI * 2); g.fill(); hg.fillStyle = grey(40); hg.beginPath(); hg.arc(x, y + 30, 3, 0, Math.PI * 2); hg.fill(); }
    }
    for (let i = 0; i < 16; i++) {                       // water running down, darker and wet
      const x = rng.int(W), len = 60 + rng.int(260), wd = 3 + rng.int(8);
      streak(g, x, rng.int(40), wd, len, s.detail, 0.45);
      const rgr = rg.createLinearGradient(0, 0, 0, len);
      rgr.addColorStop(0, grey(60, 0.9)); rgr.addColorStop(1, grey(60, 0));
      rg.fillStyle = rgr; rg.fillRect(x, 0, wd, len);
    }
    const foot = g.createLinearGradient(0, Hh * 0.8, 0, Hh);   // the wet foot of the wall
    foot.addColorStop(0, rgba(s.detail, 0)); foot.addColorStop(1, rgba(s.detail, 0.75));
    g.fillStyle = foot; g.fillRect(0, Hh * 0.8, W, Hh * 0.2);
    rg.fillStyle = grey(70); rg.fillRect(0, Hh * 0.86, W, Hh * 0.14);
  } else {
    g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(0, 0, W, 2); g.fillRect(0, 0, 2, Hh);   // the cell's joint
    hg.fillStyle = grey(60); hg.fillRect(0, 0, W, 2); hg.fillRect(0, 0, 2, Hh);
    for (let i = 0; i < 2; i++) {                        // puddles: a little darker, flat, glossy
      const x = rng.int(W), y = rng.int(Hh), rx = 14 + rng.int(34), ry = 10 + rng.int(22);
      g.fillStyle = rgba(s.detail, 0.28); g.beginPath(); g.ellipse(x, y, rx, ry, rng.float() * 3, 0, Math.PI * 2); g.fill();
      rg.fillStyle = grey(18); rg.beginPath(); rg.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); rg.fill();
      hg.fillStyle = grey(118); hg.beginPath(); hg.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); hg.fill();
    }
  }
  return { c, h, r, strength: 1.4 };
}

function mossyStone(rng, s) {
  const W = 256, Hh = 512, c = canvas(W, Hh), h = canvas(W, Hh);
  const g = c.getContext('2d'), hg = h.getContext('2d');
  g.fillStyle = '#1c1f1a'; g.fillRect(0, 0, W, Hh);       // mortar
  hg.fillStyle = grey(40); hg.fillRect(0, 0, W, Hh);
  const course = 64;
  for (let y = 0, row = 0; y < Hh; y += course, row++) {
    let x = row % 2 ? -rng.int(60) : 0;
    while (x < W) {
      const bw = 70 + rng.int(70);
      const tone = 0.82 + rng.float() * 0.3;
      g.fillStyle = s.base; g.fillRect(x + 3, y + 3, bw - 6, course - 6);
      g.fillStyle = tone > 1 ? `rgba(255,255,255,${(tone - 1) * 0.5})` : `rgba(0,0,0,${(1 - tone) * 0.9})`;
      g.fillRect(x + 3, y + 3, bw - 6, course - 6);
      hg.fillStyle = grey(150); hg.fillRect(x + 3, y + 3, bw - 6, course - 6);
      hg.fillStyle = grey(185); hg.fillRect(x + 7, y + 7, bw - 14, course - 14);   // a bevelled face
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(0,0,0,${0.06 + rng.float() * 0.1})`; g.fillRect(x + 3 + rng.int(Math.max(1, bw - 8)), y + 3 + rng.int(course - 8), 2, 2); }
      x += bw;
    }
  }
  // moss: thick at the foot, in the joints and along the top
  for (let i = 0; i < 70; i++) {
    const y = rng.float() < 0.5 ? Hh - rng.int(110) : rng.float() < 0.5 ? rng.int(50) : Math.floor(rng.int(Hh) / course) * course;
    const x = rng.int(W), r = 6 + rng.int(26);
    blotch(g, rng, x, y, r, s.detail, 0.8);
    const hgrd = hg.createRadialGradient(x, y, 0, x, y, r);
    hgrd.addColorStop(0, grey(170, 0.8)); hgrd.addColorStop(1, grey(170, 0));
    hg.fillStyle = hgrd; hg.beginPath(); hg.arc(x, y, r, 0, Math.PI * 2); hg.fill();
  }
  speckle(g, rng, W, Hh, 900, s.detail, 0.5, 3);
  return { c, h, strength: 1.5 };
}

function flagstones(rng, s) {
  const S = 256, c = canvas(S, S), h = canvas(S, S);
  const g = c.getContext('2d'), hg = h.getContext('2d');
  g.fillStyle = s.detail; g.fillRect(0, 0, S, S);         // moss between the flags
  hg.fillStyle = grey(70); hg.fillRect(0, 0, S, S);
  const cut = (x0, y0, w, h0, depth) => {
    if (depth > 0 && (w > 110 || h0 > 110) && rng.float() < 0.9) {
      if (w >= h0) { const m = Math.floor(w * (0.35 + rng.float() * 0.3)); cut(x0, y0, m, h0, depth - 1); cut(x0 + m, y0, w - m, h0, depth - 1); }
      else { const m = Math.floor(h0 * (0.35 + rng.float() * 0.3)); cut(x0, y0, w, m, depth - 1); cut(x0, y0 + m, w, h0 - m, depth - 1); }
      return;
    }
    const tone = 0.85 + rng.float() * 0.25;
    g.fillStyle = s.base; g.fillRect(x0 + 4, y0 + 4, w - 8, h0 - 8);
    g.fillStyle = tone > 1 ? `rgba(255,255,255,${(tone - 1) * 0.5})` : `rgba(0,0,0,${(1 - tone) * 0.9})`;
    g.fillRect(x0 + 4, y0 + 4, w - 8, h0 - 8);
    hg.fillStyle = grey(140 + rng.int(30)); hg.fillRect(x0 + 4, y0 + 4, w - 8, h0 - 8);
    for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(0,0,0,${0.05 + rng.float() * 0.1})`; g.fillRect(x0 + 4 + rng.int(Math.max(1, w - 9)), y0 + 4 + rng.int(Math.max(1, h0 - 9)), 2, 2); }
  };
  cut(0, 0, S, S, 3);
  for (let i = 0; i < 10; i++) blotch(g, rng, rng.int(S), rng.int(S), 6 + rng.int(14), s.detail, 0.7);
  return { c, h, strength: 1.8 };
}

export const STYLES = {
  riveted: (rng, s) => riveted(rng, s),
  plates: (rng, s) => plates(rng, s),
  wetConcrete: (rng, s, wall) => wetConcrete(rng, s, wall),
  mossyStone: (rng, s) => mossyStone(rng, s),
  flagstones: (rng, s) => flagstones(rng, s),
};

/** The raw canvases of a belt style ({c, h, r?, strength}), for the place layers (N4.2). */
export function styleCanvases(surface, seed, wall) {
  const make = STYLES[surface.style];
  return make ? make(new Rng(seed, `art:${surface.style}`), surface, wall) : null;
}

/**
 * Textures for a surface of an art-directed belt.
 * @param {object} surface  art.wall or art.floor: { style, base, detail, roughness }
 * @param {boolean} wall    walls are drawn 1:2 for a 1.5 x 3.2 m face
 * @returns {{map, normalMap, roughnessMap}|null}
 */
export function surfaceTextures(surface, seed, wall) {
  const make = STYLES[surface.style];
  if (!make) return null;
  const rng = new Rng(seed, `art:${surface.style}`);
  const out = make(rng, surface, wall);
  return {
    map: texture(out.c),
    normalMap: texture(normalFrom(out.h, out.strength), { srgb: false }),
    roughnessMap: out.r ? texture(out.r, { srgb: false }) : null,
  };
}
