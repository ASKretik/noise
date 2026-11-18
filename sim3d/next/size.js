// sim3d/next/size.js -- how big each district is. Pure.
//
// The user's curve, and not a tuned number: area as a multiple of the 2D game's 32 x 20,
// along straight lines between five fixed points. Every district is larger than the one
// before it, inside a belt and across belts (spec-3d-next.md, N8; decisions.md R51).
//
//   district    1    10    50    75    100
//   area       x5   x10   x30   x45   x60
//
// The 2D board's 8 : 5 shape is kept, so width and height each grow with the square root.

export const BASE_W = 32;
export const BASE_H = 20;

/** [district, area multiple]. Fixed by the user; criterion 3D-21 checks the table. */
export const SIZE_POINTS = Object.freeze([[1, 5], [10, 10], [50, 30], [75, 45], [100, 60]]);

/** Area as a multiple of 640 cells, for any district (clamped to 1..100). */
export function areaMultiple(district) {
  const d = Math.min(100, Math.max(1, Number(district) || 1));
  for (let i = 1; i < SIZE_POINTS.length; i++) {
    const [d1, a1] = SIZE_POINTS[i];
    if (d <= d1) {
      const [d0, a0] = SIZE_POINTS[i - 1];
      return a0 + ((a1 - a0) * (d - d0)) / (d1 - d0);
    }
  }
  return SIZE_POINTS[SIZE_POINTS.length - 1][1];
}

/** Grid size of a district on the `next` ruleset. */
export function sizeFor(district) {
  const a = areaMultiple(district);
  const k = Math.sqrt(a);
  return { w: Math.round(BASE_W * k), h: Math.round(BASE_H * k), area: a };
}
