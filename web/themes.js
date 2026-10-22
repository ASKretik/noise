// web/themes.js -- the city's palettes, and nothing else.
//
// Separate from districts.js on purpose: that file is a page controller and boots itself
// on import, so anything that just wants the constants -- the benchmark harness, say --
// cannot import it without running a whole page. Constants do not belong in a module with
// side effects.

/** The whole city. Ten belts of ten, every one of them visible from the start. */
export const TOTAL_DISTRICTS = 100;
export const BLOCK_SIZE = 10;

/**
 * One palette per belt of ten districts, so where you are in the city is legible at a
 * glance rather than only from the number.
 *
 * Ten hand-picked schemes rather than a rotated hue: a generated hue lands on muddy olive
 * or near-black somewhere around belt seven and reads as a bug. Each belt also carries its
 * NAME in the heading, so the grouping never rests on colour alone -- which matters for
 * the roughly one in twelve players who would not separate CORAL from EMBER.
 */
export const DISTRICT_THEMES = Object.freeze([
  { name: 'RUST',   accent: '#ffc93b', glow: 'rgba(255,201,59,0.30)',  tint: '#2a1f14' },
  { name: 'TIDE',   accent: '#4fb6da', glow: 'rgba(79,182,218,0.30)',  tint: '#102530' },
  { name: 'MOSS',   accent: '#7fc96b', glow: 'rgba(127,201,107,0.30)', tint: '#152415' },
  { name: 'EMBER',  accent: '#ff7a59', glow: 'rgba(255,122,89,0.30)',  tint: '#2d1812' },
  { name: 'VIOLET', accent: '#c87bff', glow: 'rgba(200,123,255,0.30)', tint: '#231a2e' },
  { name: 'ASH',    accent: '#9aa7b8', glow: 'rgba(154,167,184,0.26)', tint: '#1b1e23' },
  { name: 'CORAL',  accent: '#ff6f91', glow: 'rgba(255,111,145,0.30)', tint: '#2d1520' },
  { name: 'JADE',   accent: '#2fd4a7', glow: 'rgba(47,212,167,0.30)',  tint: '#0f2a24' },
  { name: 'SOLAR',  accent: '#ffe066', glow: 'rgba(255,224,102,0.30)', tint: '#2a2512' },
  { name: 'COBALT', accent: '#6c8cff', glow: 'rgba(108,140,255,0.30)', tint: '#161c33' },
]);

export const blockOf = (level) => Math.floor((Math.max(1, level) - 1) / BLOCK_SIZE);

export const themeFor = (level) =>
  DISTRICT_THEMES[blockOf(level) % DISTRICT_THEMES.length];
