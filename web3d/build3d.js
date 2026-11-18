// web3d/build3d.js -- the 3D build stamp.
//
// GENERATED. `npm run stamp3d` bumps it. It is the 3D game's own counter, separate from
// web/build.js on purpose: it namespaces the 3D save database (`noise3d-<BUILD3D>`) and
// the 3D pages' stylesheet cache-buster, so a 3D update resets 3D saves and leaves every
// 2D save alone. It is also the number in the in-development banner, which is how a
// reviewer knows they are looking at the newest build and not a cached one.
//
// BUILD3D-BEGIN
export const BUILD3D = 27;
// BUILD3D-END
