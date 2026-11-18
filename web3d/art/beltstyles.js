// web3d/art/beltstyles.js -- the surfaces of belts 4-10. Browser only.
//
// N4.3. Registered into textures.js STYLES on import, beside RUST, TIDE and MOSS's.
// Same contract: (rng, surface, wall) -> { c, h, r?, e?, strength }, walls 256 x 512
// (one 1.5 x 3.2 m face), floors 256 x 256.
//
//   scorchedBrick  EMBER: soot-black brick, cracks that still smoulder (in `e`)
//   cinders        EMBER floors: cracked burnt ground, clinker
//   darkTile       VIOLET walls and floors: small glossy tiles, pale grout (in `r`)
//   brutalist      ASH: board-marked concrete, tie holes, rain stains
//   deco           CORAL: smooth plaster, fluted pilasters, a stepped frieze
//   terrazzo       CORAL floors: chips in a polished ground, brass strips
//   carved         JADE: big stone blocks with carved rings and key patterns
//   sandstone      SOLAR: bedded sandstone, wind-scoured, sand at the foot
//   alloy          COBALT: large alloy panels, seams, vents and service hatches
// (ASH and SOLAR floors reuse the places' concrete and paving; JADE and COBALT floors
// reuse flagstones and plates.)

import { STYLES, canvas, grey, rgba, speckle, blotch, streak } from './textures.js';
import { PLACE_PATTERNS } from './places.js';
import { mixHex } from './belts.js';

function base([w, h], fill, height = 128) {
  const c = canvas(w, h), hc = canvas(w, h);
  const g = c.getContext('2d'), hg = hc.getContext('2d');
  g.fillStyle = fill; g.fillRect(0, 0, w, h);
  hg.fillStyle = grey(height); hg.fillRect(0, 0, w, h);
  return { c, hc, g, hg, w, h };
}
const foot = (g, w, h, colour, from, a) => {
  const grd = g.createLinearGradient(0, h * from, 0, h);
  grd.addColorStop(0, rgba(colour, 0)); grd.addColorStop(1, rgba(colour, a));
  g.fillStyle = grd; g.fillRect(0, h * from, w, h * (1 - from));
};

function scorchedBrick(rng, s) {
  const S = base([256, 512], '#0e0a09', 60);
  const e = canvas(256, 512), eg = e.getContext('2d');
  eg.fillStyle = '#000'; eg.fillRect(0, 0, 256, 512);
  for (let y = 0, row = 0; y < 512; y += 10, row++) {
    for (let x = -(row % 2) * 13; x < 256; x += 26) {
      S.g.fillStyle = mixHex(s.base, '#0a0807', rng.float() * 0.6); S.g.fillRect(x + 1, y + 1, 24, 8);
      S.hg.fillStyle = grey(150 + rng.int(40)); S.hg.fillRect(x + 1, y + 1, 24, 8);
    }
  }
  const soot = S.g.createLinearGradient(0, 0, 0, 512);
  soot.addColorStop(0, 'rgba(5,4,4,0.7)'); soot.addColorStop(0.5, 'rgba(5,4,4,0.2)'); soot.addColorStop(1, 'rgba(5,4,4,0.6)');
  S.g.fillStyle = soot; S.g.fillRect(0, 0, 256, 512);
  // cracks: dark in the colour, sunk in the height, a dull smoulder in the emission
  for (let k = 0; k < 5; k++) {
    let x = rng.int(256), y = rng.int(200);
    const pts = [[x, y]];
    for (let i = 0; i < 14; i++) { x += rng.range(-12, 12); y += rng.range(6, 22); pts.push([x, y]); }
    for (const [ctx, col, w] of [[S.g, '#050303', 3], [S.hg, grey(20), 3], [eg, s.detail, 2]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(...pts[0]);
      for (const p of pts.slice(1)) ctx.lineTo(...p);
      ctx.stroke();
    }
  }
  return { c: S.c, h: S.hc, e, strength: 1.5 };
}

function cinders(rng, s) {
  const S = base([256, 256], s.base, 120);
  for (let i = 0; i < 7; i++) blotch(S.g, rng, rng.int(256), rng.int(256), 30 + rng.int(40), '#0a0808', 0.6);
  for (let i = 0; i < 300; i++) {
    const x = rng.int(256), y = rng.int(256), r = 2 + rng.int(5);
    S.g.fillStyle = mixHex(s.detail, '#151110', rng.float()); S.g.fillRect(x, y, r, r);
    S.hg.fillStyle = grey(160 + rng.int(80)); S.hg.fillRect(x, y, r, r);
  }
  for (let k = 0; k < 6; k++) {
    let x = rng.int(256), y = rng.int(256);
    S.g.strokeStyle = 'rgba(0,0,0,0.75)'; S.hg.strokeStyle = grey(30); S.g.lineWidth = S.hg.lineWidth = 2;
    S.g.beginPath(); S.hg.beginPath(); S.g.moveTo(x, y); S.hg.moveTo(x, y);
    for (let i = 0; i < 8; i++) { x += rng.range(-20, 20); y += rng.range(-20, 20); S.g.lineTo(x, y); S.hg.lineTo(x, y); }
    S.g.stroke(); S.hg.stroke();
  }
  return { c: S.c, h: S.hc, strength: 1.6 };
}

function darkTile(rng, s, wall) {
  const W = 256, H = wall ? 512 : 256, T = wall ? 32 : 32;
  const S = base([W, H], mixHex(s.detail, '#9a98a8', 0.25), 70);
  const r = canvas(W, H), rg = r.getContext('2d');
  rg.fillStyle = grey(235); rg.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) {
    S.g.fillStyle = mixHex(s.base, '#0b0a10', rng.float() * 0.35); S.g.fillRect(x + 2, y + 2, T - 4, T - 4);
    const shine = S.g.createLinearGradient(x, y, x + T, y + T);
    shine.addColorStop(0, 'rgba(255,255,255,0.08)'); shine.addColorStop(0.5, 'rgba(255,255,255,0)');
    S.g.fillStyle = shine; S.g.fillRect(x + 2, y + 2, T - 4, T - 4);
    S.hg.fillStyle = grey(170); S.hg.fillRect(x + 2, y + 2, T - 4, T - 4);
    rg.fillStyle = grey(55 + rng.int(30)); rg.fillRect(x + 2, y + 2, T - 4, T - 4);
    if (rng.bool(0.05)) { S.g.fillStyle = 'rgba(0,0,0,0.7)'; S.g.fillRect(x + 2, y + 2, T - 4, T - 4); rg.fillStyle = grey(240); rg.fillRect(x + 2, y + 2, T - 4, T - 4); }
  }
  if (wall) for (let i = 0; i < 6; i++) streak(S.g, rng.int(W), rng.int(H / 2), 2 + rng.int(4), 80 + rng.int(160), '#0a0910', 0.4);
  return { c: S.c, h: S.hc, r, strength: 1.2 };
}

function brutalist(rng, s) {
  const S = base([256, 512], s.base, 128);
  // board marks: every plank a slightly different shade and grain
  for (let y = 0; y < 512; y += 22) {
    S.g.fillStyle = mixHex(s.base, rng.bool(0.5) ? s.detail : '#7a7a76', rng.float() * 0.25); S.g.fillRect(0, y, 256, 22);
    for (let i = 0; i < 30; i++) { S.g.fillStyle = 'rgba(0,0,0,0.08)'; S.g.fillRect(rng.int(256), y + rng.int(22), 20 + rng.int(60), 1); }
    S.g.fillStyle = 'rgba(0,0,0,0.25)'; S.g.fillRect(0, y, 256, 1);
    S.hg.fillStyle = grey(110); S.hg.fillRect(0, y, 256, 1);
  }
  for (const y of [96, 288, 448]) for (const x of [40, 128, 216]) {   // tie holes
    S.g.fillStyle = 'rgba(0,0,0,0.6)'; S.g.beginPath(); S.g.arc(x, y, 4, 0, Math.PI * 2); S.g.fill();
    S.hg.fillStyle = grey(30); S.hg.beginPath(); S.hg.arc(x, y, 4, 0, Math.PI * 2); S.hg.fill();
  }
  speckle(S.g, rng, 256, 512, 2600, '#000000', 0.12);
  for (let i = 0; i < 10; i++) streak(S.g, rng.int(256), rng.int(200), 6 + rng.int(14), 120 + rng.int(240), '#1a1a19', 0.3);
  foot(S.g, 256, 512, '#141414', 0.8, 0.45);
  return { c: S.c, h: S.hc, strength: 1.1 };
}

function deco(rng, s) {
  const S = base([256, 512], s.base, 128);
  speckle(S.g, rng, 256, 512, 1800, '#000000', 0.08);
  // two fluted pilasters, a stepped frieze under the top, a plinth at the foot
  for (const x0 of [8, 200]) for (let f = 0; f < 6; f++) {
    const x = x0 + f * 8;
    S.g.fillStyle = 'rgba(255,255,255,0.06)'; S.g.fillRect(x, 70, 4, 380);
    S.g.fillStyle = 'rgba(0,0,0,0.18)'; S.g.fillRect(x + 4, 70, 3, 380);
    S.hg.fillStyle = grey(175); S.hg.fillRect(x, 70, 4, 380); S.hg.fillStyle = grey(90); S.hg.fillRect(x + 4, 70, 3, 380);
  }
  for (let k = 0; k < 4; k++) {
    const y = 18 + k * 12, inset = k * 14;
    S.g.fillStyle = mixHex(s.detail, '#d6ccd2', 0.2 + k * 0.05); S.g.fillRect(inset, y, 256 - inset * 2, 8);
    S.hg.fillStyle = grey(200 - k * 15); S.hg.fillRect(inset, y, 256 - inset * 2, 8);
  }
  S.g.fillStyle = mixHex(s.detail, '#1a1418', 0.4); S.g.fillRect(0, 470, 256, 42);
  S.hg.fillStyle = grey(170); S.hg.fillRect(0, 470, 256, 42);
  for (let i = 0; i < 6; i++) streak(S.g, rng.int(256), 60 + rng.int(160), 4 + rng.int(8), 80 + rng.int(200), '#1c1418', 0.25);
  foot(S.g, 256, 512, '#140e12', 0.85, 0.4);
  return { c: S.c, h: S.hc, strength: 1.2 };
}

function terrazzo(rng, s) {
  const S = base([256, 256], s.base, 128);
  for (let i = 0; i < 1600; i++) {
    const x = rng.int(256), y = rng.int(256), r = 1 + rng.int(4);
    S.g.fillStyle = mixHex(s.detail, rng.bool(0.4) ? '#d8d0d4' : '#1a1418', rng.float() * 0.7);
    S.g.beginPath(); S.g.arc(x, y, r, 0, Math.PI * 2); S.g.fill();
  }
  // divider strips on the cell edges, dull metal
  S.g.fillStyle = '#6a6a66'; S.g.fillRect(0, 0, 256, 3); S.g.fillRect(0, 0, 3, 256);
  S.hg.fillStyle = grey(190); S.hg.fillRect(0, 0, 256, 3); S.hg.fillRect(0, 0, 3, 256);
  for (let i = 0; i < 3; i++) blotch(S.g, rng, rng.int(256), rng.int(256), 20 + rng.int(30), '#120e10', 0.35);
  return { c: S.c, h: S.hc, strength: 0.8 };
}

function carved(rng, s) {
  const S = base([256, 512], s.base, 140);
  for (let y = 0; y < 512; y += 128) {
    S.g.fillStyle = 'rgba(0,0,0,0.5)'; S.g.fillRect(0, y, 256, 3); S.hg.fillStyle = grey(50); S.hg.fillRect(0, y, 256, 3);
    const x0 = (y / 128) % 2 ? 0 : 128;
    S.g.fillRect(x0, y, 3, 128); S.hg.fillRect(x0, y, 3, 128);
    // a carved roundel or a band of key pattern in each block
    const cx = (x0 + 64) % 256 + 32, cy = y + 64;
    if (rng.bool(0.5)) {
      for (const [r, v] of [[40, 190], [32, 90], [24, 180], [14, 80]]) { S.hg.fillStyle = grey(v); S.hg.beginPath(); S.hg.arc(cx, cy, r, 0, Math.PI * 2); S.hg.fill(); }
      S.g.strokeStyle = rgba(s.detail, 0.6); S.g.lineWidth = 3; S.g.beginPath(); S.g.arc(cx, cy, 32, 0, Math.PI * 2); S.g.stroke();
    } else {
      for (let x = 10; x < 246; x += 24) {
        S.hg.fillStyle = grey(80); S.hg.fillRect(x, y + 50, 18, 4); S.hg.fillRect(x + 14, y + 50, 4, 24); S.hg.fillRect(x + 4, y + 70, 14, 4); S.hg.fillRect(x + 4, y + 58, 4, 16);
        S.g.fillStyle = 'rgba(0,0,0,0.35)'; S.g.fillRect(x, y + 50, 18, 4); S.g.fillRect(x + 14, y + 50, 4, 24); S.g.fillRect(x + 4, y + 70, 14, 4);
      }
    }
  }
  speckle(S.g, rng, 256, 512, 2400, '#000000', 0.12);
  for (let i = 0; i < 14; i++) blotch(S.g, rng, rng.int(256), 300 + rng.int(212), 14 + rng.int(30), s.detail, 0.35);
  foot(S.g, 256, 512, '#0a100c', 0.82, 0.5);
  return { c: S.c, h: S.hc, strength: 1.6 };
}

function sandstone(rng, s) {
  const S = base([256, 512], s.base, 128);
  for (let y = 0; y < 512;) {
    const h = 12 + rng.int(30);
    S.g.fillStyle = mixHex(s.base, s.detail, rng.float() * 0.7); S.g.fillRect(0, y, 256, h);
    S.hg.fillStyle = grey(120 + rng.int(60)); S.hg.fillRect(0, y, 256, h);
    S.g.fillStyle = 'rgba(0,0,0,0.18)'; S.g.fillRect(0, y + h - 2, 256, 2);
    y += h;
  }
  for (let i = 0; i < 18; i++) blotch(S.g, rng, rng.int(256), rng.int(512), 10 + rng.int(28), '#2a2218', 0.25);   // scour
  speckle(S.g, rng, 256, 512, 2200, '#2a2218', 0.12);
  const sand = S.g.createLinearGradient(0, 430, 0, 512);
  sand.addColorStop(0, rgba(s.detail, 0)); sand.addColorStop(1, rgba(mixHex(s.detail, '#b0a088', 0.3), 0.75));
  S.g.fillStyle = sand; S.g.fillRect(0, 430, 256, 82);
  return { c: S.c, h: S.hc, strength: 1.3 };
}

function alloy(rng, s) {
  const S = base([256, 512], s.base, 128);
  for (const y of [0, 256]) {
    const grd = S.g.createLinearGradient(0, y, 256, y + 256);
    grd.addColorStop(0, rgba(s.detail, 0.25)); grd.addColorStop(1, 'rgba(0,0,0,0.15)');
    S.g.fillStyle = grd; S.g.fillRect(4, y + 4, 248, 248);
    S.g.fillStyle = 'rgba(0,0,0,0.55)'; S.g.fillRect(0, y, 256, 4); S.g.fillRect(0, y, 4, 256);
    S.hg.fillStyle = grey(50); S.hg.fillRect(0, y, 256, 4); S.hg.fillRect(0, y, 4, 256);
  }
  // a vent grille and a service hatch
  for (let x = 40; x < 120; x += 8) { S.g.fillStyle = 'rgba(0,0,0,0.6)'; S.g.fillRect(x, 140, 4, 60); S.hg.fillStyle = grey(40); S.hg.fillRect(x, 140, 4, 60); }
  S.g.strokeStyle = 'rgba(0,0,0,0.6)'; S.g.lineWidth = 3; S.g.strokeRect(150, 330, 70, 90);
  S.hg.strokeStyle = grey(60); S.hg.lineWidth = 3; S.hg.strokeRect(150, 330, 70, 90);
  speckle(S.g, rng, 256, 512, 1400, '#000000', 0.1);
  for (let i = 0; i < 6; i++) streak(S.g, rng.int(256), rng.int(300), 2 + rng.int(4), 60 + rng.int(160), '#0c0f14', 0.3);
  foot(S.g, 256, 512, '#0a0c10', 0.85, 0.4);
  return { c: S.c, h: S.hc, strength: 1.2 };
}

Object.assign(STYLES, {
  scorchedBrick, cinders, darkTile, brutalist, deco, terrazzo, carved, sandstone, alloy,
  concrete: PLACE_PATTERNS.concrete, paving: PLACE_PATTERNS.paving,
});
