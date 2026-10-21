// sim/entropy.js -- the score.
//
// The run score is the Shannon entropy of the player's own visit histogram over the
// level's regions. Win condition and evaluation metric are deliberately the same
// quantity: the system wins by turning you into signal, you win by staying noise.

/** Shannon entropy in bits of a count vector. Empty vector -> 0. */
export function entropyBits(counts) {
  let total = 0;
  for (let i = 0; i < counts.length; i++) total += counts[i];
  if (total <= 0) return 0;
  let h = 0;
  for (let i = 0; i < counts.length; i++) {
    const p = counts[i] / total;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

/** Entropy as a fraction of the maximum achievable over `n` bins, in [0,1]. */
export function normalisedEntropy(counts, n = counts.length) {
  if (n <= 1) return 0;
  return entropyBits(counts) / Math.log2(n);
}

/** The number shown on the HUD. Normalised entropy times a thousand, rounded. */
export function entropyScore(counts, n = counts.length) {
  return Math.round(normalisedEntropy(counts, n) * 1000);
}

/** Cross entropy of the truth under a predicted distribution, in bits. Bench only. */
export function crossEntropy(predicted, trueIndex) {
  const p = Math.max(predicted[trueIndex] ?? 0, 1e-12);
  return -Math.log2(p);
}

/** Kullback-Leibler divergence D(p||q) in bits. Bench only. */
export function klDivergence(p, q) {
  let d = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i] <= 0) continue;
    d += p[i] * Math.log2(p[i] / Math.max(q[i], 1e-12));
  }
  return d;
}
