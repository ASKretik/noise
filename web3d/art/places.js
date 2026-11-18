// web3d/art/places.js -- what each kind of place is built of. Browser only.
//
// N4.2. Every pattern is drawn on canvases from a seeded Rng in the colours belts.js
// placeLook() hands it (the belt's own, pulled toward the place's tint), so a pattern
// reads the same in every belt and a belt's places still look like that belt.
//
//   walls, 256 x 512 for one cell face (1.5 m wide, the place's wall height tall)
//     brick, brickDoor   tenements: brick courses, two storeys of windows; a door below
//     ashlar             plaza monuments, canal walls: big dressed stone blocks
//     shutters           market: a painted signboard over a roll-down shutter
//     corrugated         yards: corrugated sheet fencing, rust running down
//     hedge              park: clipped foliage
//     cladding, ...Door  depot: ribbed metal with a hazard band; a loading door below
//     scorched           ruins: the belt's wall, burnt and cracked
//   floors, 256 x 256 for one cell (1.5 x 1.5 m)
//     cobbles, setts, paving, chequer, gravel, grass, concrete, ash
//
// Each returns { c: colour, h: height (for the normal map), e?: emission, strength }.
// Tenement windows are lit, a few of them, in the emission canvas: someone is still in
// there, and at midnight the blocks read from far off.

import { canvas, rgba, grey, speckle, blotch, streak } from './textures.js';
import { mixHex } from './belts.js';

const WALL = [256, 512], FLOOR = [256, 256];

function surfaces([w, h], base, height = 128) {
  const c = canvas(w, h), hc = canvas(w, h);
  const g = c.getContext('2d'), hg = hc.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  hg.fillStyle = grey(height); hg.fillRect(0, 0, w, h);
  return { c, hc, g, hg, w, h };
}

function grimeFoot(g, w, h, colour, from = 0.75, alpha = 0.5) {
  const grd = g.createLinearGradient(0, h * from, 0, h);
  grd.addColorStop(0, rgba(colour, 0)); grd.addColorStop(1, rgba(colour, alpha));
  g.fillStyle = grd; g.fillRect(0, h * from, w, h * (1 - from));
}

/** Rows of bricks: offset courses, mortar sunk, each brick its own shade. */
function brickCourses(S, rng, s, y0, y1) {
  const { g, hg, w } = S;
  const bh = 9, bw = 24;
  for (let y = y0, row = 0; y < y1; y += bh, row++) {
    for (let x = -(row % 2) * (bw / 2); x < w; x += bw) {
      g.fillStyle = mixHex(s.base, s.detail, rng.float() * 0.6);
      g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      hg.fillStyle = grey(150 + rng.int(30)); hg.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, w, 1);
  }
}

function windowAt(S, e, rng, x, y, ww, wh, lit) {
  const { g, hg } = S;
  // stone lintel and sill, a dark recessed pane, a cross of glazing bars
  g.fillStyle = 'rgba(205,200,190,0.55)'; g.fillRect(x - 6, y - 8, ww + 12, 8); g.fillRect(x - 6, y + wh, ww + 12, 7);
  hg.fillStyle = grey(200); hg.fillRect(x - 6, y - 8, ww + 12, 8); hg.fillRect(x - 6, y + wh, ww + 12, 7);
  const glass = g.createLinearGradient(x, y, x + ww, y + wh);
  glass.addColorStop(0, '#20262c'); glass.addColorStop(0.5, '#0d1013'); glass.addColorStop(1, '#171b20');
  g.fillStyle = glass; g.fillRect(x, y, ww, wh);
  hg.fillStyle = grey(40); hg.fillRect(x, y, ww, wh);
  if (lit) {
    // a lamp somewhere inside: brightest low in the middle, a curtain half drawn
    const ec = e.getContext('2d');
    const warm = rng.bool(0.7) ? '#d8b98e' : '#9fb0c8';
    const grd = ec.createRadialGradient(x + ww / 2, y + wh * 0.65, 2, x + ww / 2, y + wh * 0.65, wh * 0.7);
    grd.addColorStop(0, rgba(warm, 0.8)); grd.addColorStop(1, rgba(warm, 0.18));
    ec.fillStyle = grd; ec.fillRect(x, y, ww, wh);
    ec.fillStyle = 'rgba(0,0,0,0.85)'; ec.fillRect(rng.bool(0.5) ? x : x + ww * 0.62, y, ww * 0.38, wh);
    g.fillStyle = rgba(warm, 0.18); g.fillRect(x, y, ww, wh);
  } else if (rng.bool(0.25)) {
    // broken: a jagged hole and glass on the sill
    g.fillStyle = '#050607';
    g.beginPath(); g.moveTo(x + ww * 0.2, y + wh * 0.1); g.lineTo(x + ww * 0.8, y + wh * 0.3); g.lineTo(x + ww * 0.5, y + wh * 0.9); g.closePath(); g.fill();
  }
  g.fillStyle = '#2c2a27'; g.fillRect(x + ww / 2 - 2, y, 4, wh); g.fillRect(x, y + wh * 0.42, ww, 4);
  hg.fillStyle = grey(120); hg.fillRect(x + ww / 2 - 2, y, 4, wh); hg.fillRect(x, y + wh * 0.42, ww, 4);
}

// ------------------------------------------------------------------ walls

function brick(rng, s, door) {
  const S = surfaces(WALL, s.base, 128);
  const e = canvas(...WALL);
  e.getContext('2d').fillStyle = '#000'; e.getContext('2d').fillRect(0, 0, ...WALL);
  brickCourses(S, rng, s, 0, 512);
  // a stone string course between the storeys, and under the eaves
  for (const y of [0, 252]) { S.g.fillStyle = 'rgba(200,195,185,0.4)'; S.g.fillRect(0, y, 256, 10); S.hg.fillStyle = grey(190); S.hg.fillRect(0, y, 256, 10); }
  windowAt(S, e, rng, 92, 62, 72, 120, rng.bool(0.22));
  if (door) {
    // a door with a fanlight, a step
    S.g.fillStyle = '#231a14'; S.g.fillRect(84, 330, 88, 182);
    S.hg.fillStyle = grey(70); S.hg.fillRect(84, 330, 88, 182);
    for (const x of [92, 130]) { S.g.fillStyle = 'rgba(0,0,0,0.35)'; S.g.fillRect(x, 352, 34, 60); S.g.fillRect(x, 428, 34, 70); }
    S.g.fillStyle = '#0d1013'; S.g.fillRect(84, 314, 88, 14);
    S.g.fillStyle = 'rgba(205,200,190,0.5)'; S.g.fillRect(76, 500, 104, 12);
  } else {
    windowAt(S, e, rng, 92, 318, 72, 120, rng.bool(0.15));
  }
  for (let i = 0; i < 6; i++) streak(S.g, rng.int(256), rng.int(200), 3 + rng.int(4), 60 + rng.int(160), '#0d0b0a', 0.35);
  grimeFoot(S.g, 256, 512, '#120e0c', 0.8, 0.55);
  return { c: S.c, h: S.hc, e, strength: 1.4 };
}

function ashlar(rng, s) {
  const S = surfaces(WALL, s.base, 140);
  for (let y = 0, row = 0; y < 512; y += 80, row++) {
    for (let x = -(row % 2) * 64; x < 256; x += 128) {
      S.g.fillStyle = mixHex(s.base, '#9a968c', 0.12 + rng.float() * 0.18);
      S.g.fillRect(x + 2, y + 2, 124, 76);
      const grd = S.hg.createLinearGradient(x, y, x, y + 80);
      grd.addColorStop(0, grey(190)); grd.addColorStop(0.15, grey(165)); grd.addColorStop(0.85, grey(160)); grd.addColorStop(1, grey(120));
      S.hg.fillStyle = grd; S.hg.fillRect(x + 2, y + 2, 124, 76);
      speckle(S.g, rng, 256, 512, 30, s.detail, 0.25);
    }
    S.g.fillStyle = 'rgba(0,0,0,0.45)'; S.g.fillRect(0, y, 256, 2);
  }
  speckle(S.g, rng, 256, 512, 2200, '#000000', 0.12);
  for (let i = 0; i < 8; i++) streak(S.g, rng.int(256), rng.int(300), 4 + rng.int(6), 80 + rng.int(160), '#151310', 0.3);
  grimeFoot(S.g, 256, 512, '#141210', 0.78, 0.45);
  return { c: S.c, h: S.hc, strength: 1.3 };
}

function shutters(rng, s) {
  const S = surfaces(WALL, s.base, 128);
  // a painted signboard, faded, a stripe of the stall's colour
  const board = mixHex(s.detail, '#3a4654', 0.5);
  S.g.fillStyle = board; S.g.fillRect(0, 0, 256, 110);
  S.g.fillStyle = rgba(mixHex(board, '#c9c4b8', 0.5), 0.5); S.g.fillRect(0, 70, 256, 10);
  S.hg.fillStyle = grey(170); S.hg.fillRect(0, 0, 256, 110);
  speckle(S.g, rng, 256, 110, 900, '#000000', 0.25);
  // the shutter: horizontal ribs, a bottom bar, a padlock
  for (let y = 120; y < 500; y += 9) {
    S.g.fillStyle = mixHex(s.base, '#7d828a', 0.25 + 0.1 * Math.sin(y)); S.g.fillRect(8, y, 240, 7);
    S.g.fillStyle = 'rgba(0,0,0,0.45)'; S.g.fillRect(8, y + 7, 240, 2);
    S.hg.fillStyle = grey(165); S.hg.fillRect(8, y, 240, 7); S.hg.fillStyle = grey(70); S.hg.fillRect(8, y + 7, 240, 2);
  }
  S.g.fillStyle = '#1c1d1f'; S.g.fillRect(0, 110, 8, 402); S.g.fillRect(248, 110, 8, 402);
  S.g.fillStyle = '#2a2b2e'; S.g.fillRect(8, 490, 240, 14);
  S.g.fillStyle = '#5b5e63'; S.g.fillRect(122, 478, 12, 14);
  for (let i = 0; i < 5; i++) streak(S.g, 10 + rng.int(236), 120 + rng.int(100), 2 + rng.int(3), 80 + rng.int(200), s.detail, 0.4);
  grimeFoot(S.g, 256, 512, '#121212', 0.82, 0.5);
  return { c: S.c, h: S.hc, strength: 1.5 };
}

function corrugated(rng, s) {
  const S = surfaces(WALL, s.base, 128);
  for (let x = 0; x < 256; x++) {
    const v = Math.sin((x / 16) * Math.PI * 2);
    S.hg.fillStyle = grey(128 + v * 70); S.hg.fillRect(x, 0, 1, 512);
    S.g.fillStyle = v > 0 ? `rgba(255,255,255,${0.06 * v})` : `rgba(0,0,0,${-0.18 * v})`; S.g.fillRect(x, 0, 1, 512);
  }
  // two sheets, overlapping at a seam, screwed to rails
  S.g.fillStyle = 'rgba(0,0,0,0.5)'; S.g.fillRect(0, 254, 256, 3);
  for (const y of [40, 300]) for (let x = 8; x < 256; x += 32) { S.g.fillStyle = '#2b2b2b'; S.g.fillRect(x, y, 4, 4); }
  for (let i = 0; i < 14; i++) streak(S.g, rng.int(256), rng.int(400), 4 + rng.int(10), 40 + rng.int(140), s.detail, 0.55);
  for (let i = 0; i < 6; i++) blotch(S.g, rng, rng.int(256), 380 + rng.int(132), 20 + rng.int(40), s.detail, 0.45);
  grimeFoot(S.g, 256, 512, '#16110d', 0.7, 0.6);
  return { c: S.c, h: S.hc, strength: 1.8 };
}

function hedge(rng, s) {
  const S = surfaces(WALL, mixHex(s.base, '#000000', 0.35), 90);
  for (let i = 0; i < 2600; i++) {
    const x = rng.int(256), y = rng.int(512), r = 3 + rng.int(6);
    const t = rng.float();
    S.g.fillStyle = mixHex(s.base, t < 0.5 ? s.detail : '#9fb88a', t < 0.5 ? t : (t - 0.5) * 0.35);
    S.g.beginPath(); S.g.ellipse(x, y, r, r * 0.6, rng.float() * 3.14, 0, Math.PI * 2); S.g.fill();
    S.hg.fillStyle = grey(110 + rng.int(120));
    S.hg.beginPath(); S.hg.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); S.hg.fill();
  }
  // a clipped top edge and a dark root line
  S.g.fillStyle = 'rgba(0,0,0,0.25)'; S.g.fillRect(0, 0, 256, 6);
  grimeFoot(S.g, 256, 512, '#0b0d08', 0.85, 0.6);
  return { c: S.c, h: S.hc, strength: 2.4 };
}

function cladding(rng, s, door) {
  const S = surfaces(WALL, s.base, 128);
  for (let y = 0; y < 512; y += 28) {
    S.g.fillStyle = 'rgba(255,255,255,0.05)'; S.g.fillRect(0, y, 256, 3);
    S.g.fillStyle = 'rgba(0,0,0,0.35)'; S.g.fillRect(0, y + 24, 256, 4);
    S.hg.fillStyle = grey(190); S.hg.fillRect(0, y, 256, 4); S.hg.fillStyle = grey(70); S.hg.fillRect(0, y + 24, 256, 4);
  }
  S.g.fillStyle = 'rgba(0,0,0,0.5)'; S.g.fillRect(0, 0, 3, 512); S.g.fillRect(253, 0, 3, 512);
  if (door) {
    // a loading door: slatted, between two steel posts, its number stencilled above
    S.g.fillStyle = '#1d2024'; S.g.fillRect(16, 140, 224, 372);
    for (let y = 146; y < 506; y += 12) { S.g.fillStyle = mixHex(s.base, '#6f757c', 0.3); S.g.fillRect(20, y, 216, 9); S.hg.fillStyle = grey(150); S.hg.fillRect(20, y, 216, 9); S.hg.fillStyle = grey(80); S.hg.fillRect(20, y + 9, 216, 3); }
    S.g.fillStyle = 'rgba(225,225,220,0.75)'; S.g.font = 'bold 44px monospace'; S.g.textAlign = 'center';
    S.g.fillText(String(1 + rng.int(24)).padStart(2, '0'), 128, 118);
  }
  // a hazard band at the foot: black and white, never the keys' gold
  for (let x = -40; x < 296; x += 28) {
    S.g.fillStyle = '#d6d6d0';
    S.g.beginPath(); S.g.moveTo(x, 512); S.g.lineTo(x + 14, 512); S.g.lineTo(x + 34, 470); S.g.lineTo(x + 20, 470); S.g.closePath(); S.g.fill();
  }
  S.g.fillStyle = 'rgba(0,0,0,0.55)'; S.g.fillRect(0, 466, 256, 4);
  for (let i = 0; i < 8; i++) streak(S.g, rng.int(256), rng.int(300), 3 + rng.int(5), 60 + rng.int(160), s.detail, 0.35);
  grimeFoot(S.g, 256, 512, '#101214', 0.85, 0.4);
  return { c: S.c, h: S.hc, strength: 1.6 };
}

function scorched(rng, s) {
  const S = surfaces(WALL, s.base, 128);
  speckle(S.g, rng, 256, 512, 3000, '#000000', 0.25);
  for (let i = 0; i < 10; i++) blotch(S.g, rng, rng.int(256), rng.int(512), 30 + rng.int(70), '#0a0807', 0.55);
  const soot = S.g.createLinearGradient(0, 512, 0, 0);
  soot.addColorStop(0, 'rgba(8,6,5,0.75)'); soot.addColorStop(0.6, 'rgba(8,6,5,0.25)'); soot.addColorStop(1, 'rgba(8,6,5,0.55)');
  S.g.fillStyle = soot; S.g.fillRect(0, 0, 256, 512);
  // cracks: random walks, sunk
  for (let k = 0; k < 7; k++) {
    let x = rng.int(256), y = rng.int(512);
    S.g.strokeStyle = 'rgba(0,0,0,0.8)'; S.hg.strokeStyle = grey(30); S.g.lineWidth = S.hg.lineWidth = 2;
    S.g.beginPath(); S.hg.beginPath(); S.g.moveTo(x, y); S.hg.moveTo(x, y);
    for (let i = 0; i < 12; i++) { x += rng.range(-14, 14); y += rng.range(4, 26); S.g.lineTo(x, y); S.hg.lineTo(x, y); }
    S.g.stroke(); S.hg.stroke();
  }
  // a burnt-out window hole
  if (rng.bool(0.6)) { S.g.fillStyle = '#040404'; S.g.fillRect(90, 120 + rng.int(60), 76, 110); S.hg.fillStyle = grey(20); S.hg.fillRect(90, 150, 76, 110); }
  return { c: S.c, h: S.hc, strength: 1.7 };
}

// ------------------------------------------------------------------ floors

function cobbles(rng, s, rect = false) {
  const S = surfaces(FLOOR, '#0c0b0a', 30);
  const ch = rect ? 18 : 16, cw = rect ? 34 : 16;
  for (let y = 0, row = 0; y < 256; y += ch, row++) {
    for (let x = -(row % 2) * (cw / 2); x < 256; x += cw) {
      const cx = x + cw / 2 + rng.range(-1, 1), cy = y + ch / 2 + rng.range(-1, 1);
      S.g.fillStyle = mixHex(s.base, s.detail, rng.float() * 0.7);
      S.g.beginPath(); S.g.ellipse(cx, cy, cw / 2 - 1.5, ch / 2 - 1.5, 0, 0, Math.PI * 2); S.g.fill();
      const grd = S.hg.createRadialGradient(cx, cy, 0, cx, cy, Math.max(cw, ch) / 2);
      grd.addColorStop(0, grey(220)); grd.addColorStop(1, grey(70));
      S.hg.fillStyle = grd; S.hg.beginPath(); S.hg.ellipse(cx, cy, cw / 2 - 1.5, ch / 2 - 1.5, 0, 0, Math.PI * 2); S.hg.fill();
    }
  }
  speckle(S.g, rng, 256, 256, 900, '#000000', 0.2);
  return { c: S.c, h: S.hc, strength: 1.5 };
}

function paving(rng, s) {
  const S = surfaces(FLOOR, '#141311', 60);
  for (const [x0, y0] of [[0, 0], [128, 0], [0, 128], [128, 128]]) {
    S.g.fillStyle = mixHex(s.base, '#8d897f', 0.1 + rng.float() * 0.2); S.g.fillRect(x0 + 2, y0 + 2, 124, 124);
    S.hg.fillStyle = grey(170); S.hg.fillRect(x0 + 2, y0 + 2, 124, 124);
    if (rng.bool(0.3)) { S.g.strokeStyle = 'rgba(0,0,0,0.55)'; S.g.lineWidth = 1.5; S.g.beginPath(); S.g.moveTo(x0 + rng.int(128), y0 + 2); S.g.lineTo(x0 + rng.int(128), y0 + 126); S.g.stroke(); }
  }
  speckle(S.g, rng, 256, 256, 1600, '#000000', 0.15);
  for (let i = 0; i < 3; i++) blotch(S.g, rng, rng.int(256), rng.int(256), 20 + rng.int(30), s.detail, 0.3);
  return { c: S.c, h: S.hc, strength: 1.2 };
}

function chequer(rng, s) {
  const S = surfaces(FLOOR, '#121110', 70);
  const a = mixHex(s.base, '#b9b4a8', 0.3), b = mixHex(s.detail, '#1a1918', 0.5);
  for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) {
    S.g.fillStyle = ((x + y) / 32) % 2 ? a : b; S.g.fillRect(x + 1, y + 1, 30, 30);
    S.hg.fillStyle = grey(165); S.hg.fillRect(x + 1, y + 1, 30, 30);
    if (rng.bool(0.06)) { S.g.fillStyle = 'rgba(0,0,0,0.6)'; S.g.fillRect(x + 1, y + 1, 30, 30); S.hg.fillStyle = grey(90); S.hg.fillRect(x + 1, y + 1, 30, 30); }
  }
  speckle(S.g, rng, 256, 256, 1400, '#000000', 0.18);
  for (let i = 0; i < 4; i++) blotch(S.g, rng, rng.int(256), rng.int(256), 18 + rng.int(30), '#100e0c', 0.4);
  return { c: S.c, h: S.hc, strength: 1.1 };
}

function gravel(rng, s) {
  const S = surfaces(FLOOR, s.base, 120);
  for (let i = 0; i < 5200; i++) {
    const x = rng.int(256), y = rng.int(256), r = 1 + rng.int(3);
    S.g.fillStyle = mixHex(s.base, rng.bool(0.5) ? s.detail : '#8a867c', rng.float() * 0.5);
    S.g.fillRect(x, y, r, r);
    S.hg.fillStyle = grey(100 + rng.int(150)); S.hg.fillRect(x, y, r, r);
  }
  // tyre ruts across, rotated with the cell
  for (const x of [60, 180]) { S.g.fillStyle = 'rgba(0,0,0,0.22)'; S.g.fillRect(x, 0, 26, 256); }
  for (let i = 0; i < 3; i++) blotch(S.g, rng, rng.int(256), rng.int(256), 20 + rng.int(30), '#0e0c0a', 0.4);
  return { c: S.c, h: S.hc, strength: 1.6 };
}

function grass(rng, s) {
  const S = surfaces(FLOOR, s.base, 120);
  for (let i = 0; i < 4; i++) blotch(S.g, rng, rng.int(256), rng.int(256), 30 + rng.int(40), '#2a2218', 0.45);   // worn earth
  for (let i = 0; i < 4200; i++) {
    const x = rng.int(256), y = rng.int(256), len = 3 + rng.int(6);
    S.g.strokeStyle = mixHex(s.base, rng.bool(0.6) ? '#7d9a5c' : s.detail, rng.float() * 0.45);
    S.g.lineWidth = 1; S.g.beginPath(); S.g.moveTo(x, y); S.g.lineTo(x + rng.range(-2, 2), y - len); S.g.stroke();
    S.hg.fillStyle = grey(140 + rng.int(100)); S.hg.fillRect(x, y - len, 1, len);
  }
  return { c: S.c, h: S.hc, strength: 1.2 };
}

function concrete(rng, s) {
  const S = surfaces(FLOOR, s.base, 128);
  speckle(S.g, rng, 256, 256, 2400, '#000000', 0.12);
  speckle(S.g, rng, 256, 256, 900, '#9a968e', 0.1);
  // saw cuts on the cell edges; oil and tyre marks
  S.g.fillStyle = 'rgba(0,0,0,0.5)'; S.g.fillRect(0, 0, 256, 2); S.g.fillRect(0, 0, 2, 256);
  S.hg.fillStyle = grey(50); S.hg.fillRect(0, 0, 256, 2); S.hg.fillRect(0, 0, 2, 256);
  for (let i = 0; i < 4; i++) blotch(S.g, rng, rng.int(256), rng.int(256), 16 + rng.int(36), '#0b0a09', 0.5);
  S.g.strokeStyle = 'rgba(0,0,0,0.25)'; S.g.lineWidth = 10;
  S.g.beginPath(); S.g.moveTo(0, 60 + rng.int(40)); S.g.bezierCurveTo(90, 40, 160, 200, 256, 150 + rng.int(40)); S.g.stroke();
  return { c: S.c, h: S.hc, strength: 1.0 };
}

function ash(rng, s) {
  const S = surfaces(FLOOR, s.base, 110);
  for (let i = 0; i < 6; i++) blotch(S.g, rng, rng.int(256), rng.int(256), 30 + rng.int(50), '#080706', 0.6);
  for (let i = 0; i < 260; i++) {   // brick chips and debris
    const x = rng.int(256), y = rng.int(256), w = 2 + rng.int(7), h = 2 + rng.int(5);
    S.g.fillStyle = mixHex(s.detail, '#5a4a40', rng.float()); S.g.fillRect(x, y, w, h);
    S.hg.fillStyle = grey(170 + rng.int(70)); S.hg.fillRect(x, y, w, h);
  }
  speckle(S.g, rng, 256, 256, 2400, '#9c9890', 0.08);
  return { c: S.c, h: S.hc, strength: 1.5 };
}

export const PLACE_PATTERNS = {
  brick: (rng, s) => brick(rng, s, false),
  brickDoor: (rng, s) => brick(rng, s, true),
  ashlar, shutters, corrugated, hedge, scorched,
  cladding: (rng, s) => cladding(rng, s, false),
  claddingDoor: (rng, s) => cladding(rng, s, true),
  cobbles: (rng, s) => cobbles(rng, s, false),
  setts: (rng, s) => cobbles(rng, s, true),
  paving, chequer, gravel, grass, concrete, ash,
};
