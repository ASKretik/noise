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
/**
 * Each belt carries a TERRAIN scheme as well as a hub accent. The accent colours the
 * cards; the terrain colours the district you actually walk around in, which is what
 * makes belt seven look like somewhere else rather than belt one with a different label.
 *
 * What never changes, in any belt: coins (their colour is their VALUE), lightning, keys,
 * aliens, the portal and the player. Those are vocabulary -- the moment gold stops meaning
 * five the player has to relearn the board every ten districts. Only the place changes.
 *
 * Buildings are pitched roughly halfway between the ground and the wall, with a clearly
 * lighter top edge. They were originally a shade off the ground and effectively invisible,
 * which is unacceptable for the one piece of terrain the player cannot walk through but
 * the aliens can -- not seeing it means not understanding why something reached you.
 *
 * Every ground here is dark and low-chroma on purpose: the entities sitting on it are a
 * red alien, a gold key, a white human and a teal portal, and all four have to stay
 * obvious on all ten. That rules out the strongly red terrain EMBER and CORAL might
 * otherwise suggest -- they are a warm charcoal and a dusty rose instead.
 */
export const DISTRICT_THEMES = Object.freeze([
  {
    name: 'RUST', accent: '#ffc93b', glow: 'rgba(255,201,59,0.30)', tint: '#2a1f14',
    terrain: { ground: '#4a3a2a', groundAlt: '#514032', wall: '#16100b', wallEdge: '#2b2018',
      water: '#1b4a5e', waterDeep: '#143a4b', building: '#2a2219', buildingTop: '#3f362b' },
  },
  {
    name: 'TIDE', accent: '#4fb6da', glow: 'rgba(79,182,218,0.30)', tint: '#102530',
    terrain: { ground: '#2e3f4a', groundAlt: '#344754', wall: '#0d151b', wallEdge: '#1e2e38',
      water: '#14544e', waterDeep: '#0e3f3a', building: '#1b262d', buildingTop: '#2d3e49' },
  },
  {
    name: 'MOSS', accent: '#7fc96b', glow: 'rgba(127,201,107,0.30)', tint: '#152415',
    terrain: { ground: '#37422c', groundAlt: '#3d4a31', wall: '#121710', wallEdge: '#212d1c',
      water: '#1c4a52', waterDeep: '#143940', building: '#20281a', buildingTop: '#333e28' },
  },
  {
    name: 'EMBER', accent: '#ff7a59', glow: 'rgba(255,122,89,0.30)', tint: '#2d1812',
    terrain: { ground: '#3b332f', groundAlt: '#423935', wall: '#150f0d', wallEdge: '#2e211c',
      water: '#1e4452', waterDeep: '#16343f', building: '#241d1a', buildingTop: '#3a2f28' },
  },
  {
    name: 'VIOLET', accent: '#c87bff', glow: 'rgba(200,123,255,0.30)', tint: '#231a2e',
    terrain: { ground: '#3a3346', groundAlt: '#40394e', wall: '#14101c', wallEdge: '#271f33',
      water: '#243f63', waterDeep: '#1a3050', building: '#221d2b', buildingTop: '#372f44' },
  },
  {
    name: 'ASH', accent: '#9aa7b8', glow: 'rgba(154,167,184,0.26)', tint: '#1b1e23',
    terrain: { ground: '#3b3d40', groundAlt: '#424548', wall: '#131416', wallEdge: '#272a2d',
      water: '#1f4654', waterDeep: '#173642', building: '#232528', buildingTop: '#383b3f' },
  },
  {
    name: 'CORAL', accent: '#ff6f91', glow: 'rgba(255,111,145,0.30)', tint: '#2d1520',
    terrain: { ground: '#4a3640', groundAlt: '#523c47', wall: '#190f14', wallEdge: '#2e1f27',
      water: '#1d4a5a', waterDeep: '#153946', building: '#2b1f26', buildingTop: '#40303a' },
  },
  {
    name: 'JADE', accent: '#2fd4a7', glow: 'rgba(47,212,167,0.30)', tint: '#0f2a24',
    terrain: { ground: '#27423c', groundAlt: '#2c4a43', wall: '#0c1715', wallEdge: '#1a2f2a',
      water: '#16506b', waterDeep: '#103d53', building: '#16271f', buildingTop: '#2a4038' },
  },
  {
    name: 'SOLAR', accent: '#ffe066', glow: 'rgba(255,224,102,0.30)', tint: '#2a2512',
    terrain: { ground: '#554c38', groundAlt: '#5d5440', wall: '#1b170f', wallEdge: '#332c1f',
      water: '#1d4d5e', waterDeep: '#153b49', building: '#332d20', buildingTop: '#4d4433' },
  },
  {
    name: 'COBALT', accent: '#6c8cff', glow: 'rgba(108,140,255,0.30)', tint: '#161c33',
    terrain: { ground: '#2c3650', groundAlt: '#313c59', wall: '#0c1020', wallEdge: '#1d2540',
      water: '#16475f', waterDeep: '#103648', building: '#191f31', buildingTop: '#2b3450' },
  },
]);

export const blockOf = (level) => Math.floor((Math.max(1, level) - 1) / BLOCK_SIZE);

export const themeFor = (level) =>
  DISTRICT_THEMES[blockOf(level) % DISTRICT_THEMES.length];
