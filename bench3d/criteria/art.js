// bench3d/criteria/art.js -- 3D-16: the belt art keeps clear of the entity colours.
//
// Red aliens, gold keys, coins by value and the teal portal are how a player reads the
// game. web3d/art/belts.js is pure data, so the check runs here in Node: for every
// district of every art-directed belt (dusk to midnight, k = 0..9), each colour that
// covers a lot of screen -- walls, floors, rubble, water, props, sky, clouds, fog -- must
// sit at least 25 degrees of hue or 0.25 of lightness away from every entity colour.
//
// Alongside it, the shape the renderer relies on: every colour a well-formed hex, the
// light falling (or holding) from dusk to midnight, and the sun under the horizon by the
// time the moon is up. Belts not yet art-directed (artFor returns null) are listed: they
// fall back to their 2D palettes in world.js until N4.2.

const PASS = 'PASS', FAIL = 'FAIL';

export const criteria = [{
  n: 16,
  text: 'Belt art palettes keep clear of the entity colours: no large-area colour within 25° of hue and 0.25 of lightness of an alien, key, coin or portal, dusk to midnight',
  async fn() {
    const { artFor, largeAreaColours, clashes, hexToHsl, BELT_NAMES, ENTITY_COLOURS } = await import('../../web3d/art/belts.js');
    const problems = [];
    const styled = [], fallback = [];
    let checked = 0;
    const isHex = (h) => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);

    for (const e of Object.values(ENTITY_COLOURS)) if (!isHex(e)) problems.push(`entity colour ${e} is not a hex`);

    for (let belt = 0; belt < BELT_NAMES.length; belt++) {
      const first = artFor(belt * 10 + 1);
      if (!first) { fallback.push(BELT_NAMES[belt]); continue; }
      styled.push(BELT_NAMES[belt]);
      let lastL = Infinity;
      for (let k = 0; k < 10; k++) {
        const d = belt * 10 + 1 + k;
        const art = artFor(d);
        if (art.name !== BELT_NAMES[belt] || art.k !== k) problems.push(`district ${d} resolves to ${art.name} k=${art.k}`);
        for (const [what, hex] of largeAreaColours(art)) {
          checked++;
          if (!isHex(hex)) { problems.push(`district ${d} ${what} is not a hex: ${hex}`); continue; }
          const hit = clashes(hex);
          if (hit.length) problems.push(`district ${d} ${what} ${hex} clashes with ${hit.join(', ')}`);
        }
        for (const hex of [art.light.hemiSky, art.light.hemiGround, art.light.key, art.sky.body.color]) {
          if (!isHex(hex)) problems.push(`district ${d} light colour is not a hex: ${hex}`);
        }
        // dusk to midnight: the horizon never brightens going deeper into a belt
        const l = hexToHsl(art.sky.horizon).l;
        if (l > lastL + 1e-9) problems.push(`district ${d} horizon brighter than district ${d - 1}`);
        lastL = l;
        if (art.sky.body.kind === 'moon' && k < 5) problems.push(`district ${d}: moon up before mid-belt`);
        if (art.sky.body.kind === 'sun' && k >= 5) problems.push(`district ${d}: sun still up after mid-belt`);
      }
    }
    if (!styled.length) problems.push('no belt is art-directed');

    return problems.length
      ? [FAIL, problems.slice(0, 6).join('; ')]
      : [PASS, `${styled.length} belts art-directed (${styled.join(', ')}): ${checked} large-area colours over ${styled.length * 10} districts, none within 25°/0.25 of ${Object.keys(ENTITY_COLOURS).length} entity colours; horizons darken dusk to midnight. On 2D palettes until N4.2: ${fallback.join(', ')}`];
  },
}];
