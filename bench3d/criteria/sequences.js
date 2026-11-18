// bench3d/criteria/sequences.js -- 3D-15: the jumpscare and ascension timelines are safe.

import { SEQUENCES, FLASH_MAX_PER_SECOND, maxFlashesPerSecond, variantFor, sample } from '../../web3d/sequences.js';

const BOUND = { jumpscare: 1.2, ascension: 2.5 };

export const criteria = [{
  n: 15,
  text: 'Sequences: no more than 3 flashes in any second (WCAG 2.3.1), all skippable, within their length, full/mild/off variants, reduce motion never plays the full one',
  async fn() {
    const problems = [];
    const seen = [];
    for (const [name, variants] of Object.entries(SEQUENCES)) {
      for (const v of ['full', 'mild', 'off']) {
        const seq = variants[v];
        if (!seq) { problems.push(`${name}: no ${v} variant`); continue; }
        const f = maxFlashesPerSecond(seq);
        if (f > FLASH_MAX_PER_SECOND) problems.push(`${name}/${v}: ${f} flashes in one second`);
        if (!seq.skippable) problems.push(`${name}/${v}: not skippable`);
        if (!(seq.duration > 0 && seq.duration <= BOUND[name])) problems.push(`${name}/${v}: ${seq.duration}s exceeds ${BOUND[name]}s`);
        for (const [tn, tr] of Object.entries(seq.tracks)) {
          if (tr.some(([t]) => t < 0 || t > seq.duration + 1e-9)) problems.push(`${name}/${v}/${tn}: key outside the timeline`);
          for (let i = 1; i < tr.length; i++) if (tr[i][0] < tr[i - 1][0]) problems.push(`${name}/${v}/${tn}: keys out of order`);
        }
        for (const fl of seq.flashes) if (fl.dur > 0.25) problems.push(`${name}/${v}: a ${fl.dur}s "flash" is a fade, not a flash`);
        seen.push(`${name}/${v} ${seq.duration}s, ${f} flash${f === 1 ? '' : 'es'}`);
      }
      if (sample(variants.off.tracks.fade ?? variants.off.tracks.whiteout, 99) !== 0 && name === 'jumpscare') problems.push('jumpscare/off fades to black');
    }
    if (variantFor('full', true) !== 'mild') problems.push('reduce motion still plays the full sequence');
    if (variantFor('off', true) !== 'off' || variantFor('mild', false) !== 'mild') problems.push('variantFor ignores the setting');
    return problems.length ? ['FAIL', problems.join('; ')] : ['PASS', seen.join(' · ')];
  },
}];
