// bench3d/criteria/species.js -- 3D-26: the species table (web3d/species.js, pure data).

import { SPECIES, BELT_SPECIES, FEATURE_TYPES, MARKING_STYLES, speciesFor } from '../../web3d/species.js';

/** Hue in degrees and saturation of a 0xRRGGBB colour. */
function hueSat(hex) {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0 };
}

export const criteria = [{
  n: 26,
  text: 'Species: ten distinct species, one per belt; every glow red or red-orange (hue within 25° of red); only known features and marking styles; sane proportions',
  async fn() {
    const problems = [];
    if (BELT_SPECIES.length !== 10) problems.push(`${BELT_SPECIES.length} belts mapped`);
    if (new Set(BELT_SPECIES).size !== 10) problems.push('a species is used by more than one belt');
    const skins = new Set();
    for (const id of BELT_SPECIES) {
      const sp = SPECIES[id];
      if (!sp) { problems.push(`no species ${id}`); continue; }
      const { h, s } = hueSat(sp.glowColor);
      const fromRed = Math.min(h, 360 - h);
      if (fromRed > 25 || s < 0.7) problems.push(`${id}: glow hue ${h.toFixed(0)}° sat ${s.toFixed(2)} is not a threat red`);
      if (!MARKING_STYLES.includes(sp.markings)) problems.push(`${id}: unknown markings ${sp.markings}`);
      for (const f of sp.features) if (!FEATURE_TYPES.includes(f.type)) problems.push(`${id}: unknown feature ${f.type}`);
      for (const part of ['upperArm', 'forearm', 'finger', 'thigh', 'shin', 'foot']) {
        if (!(sp[part].len > 0 && sp[part].r > 0)) problems.push(`${id}: bad ${part}`);
      }
      if (!(sp.glow.hunting > sp.glow.calm && sp.glow.stunned === 0)) problems.push(`${id}: glow must rise when hunting and go dark when stunned`);
      skins.add(sp.skin.calm);
    }
    if (skins.size !== 10) problems.push('two species share a skin colour');
    for (let b = 0; b < 10; b++) if (speciesFor(b * 10 + 5) !== SPECIES[BELT_SPECIES[b]]) problems.push(`speciesFor wrong in belt ${b}`);
    const names = BELT_SPECIES.map((id) => SPECIES[id].name).join(', ');
    return problems.length ? ['FAIL', problems.slice(0, 5).join('; ')] : ['PASS', `${names}`];
  },
}];
