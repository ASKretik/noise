// web3d/launch3d.js -- the 3D launcher, phase 2 edition: pick a district and a tier.
// Replaced by the full hub (profiles, permanent tiers, shop) in phase 7.

import { DISTRICT_THEMES, themeFor } from '../web/themes.js';

const sel = document.getElementById('l3-district');
const tier = document.getElementById('l3-tier');
const go = document.getElementById('l3-go');
for (let d = 1; d <= 100; d++) {
  const o = document.createElement('option');
  o.value = String(d);
  o.textContent = `${d} · ${themeFor(d).name}`;
  sel.append(o);
}
const update = () => { go.href = `play.html?d=${sel.value}&t=${tier.value}`; };
sel.addEventListener('change', update);
tier.addEventListener('change', update);
update();
void DISTRICT_THEMES;
