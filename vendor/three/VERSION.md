# Vendored three.js

| | |
|---|---|
| Package | `three` (npm), MIT licence — see `0.185.1/LICENSE` |
| Version | **0.185.1** (published 2026-07-01) |
| Source | `https://cdn.jsdelivr.net/npm/three@0.185.1/` |
| Fetched | 2026-11-17 |

Unmodified upstream files. 0.185.1 is the newest release that still ships minified builds;
0.186.x and 0.187.0 publish only unminified `three.core.js` + `three.module.js`
(about 2.1 MB together, against 0.75 MB here).

| File | Bytes | SHA-256 (base64, matches jsDelivr's published hash) |
|---|---|---|
| `build/three.module.min.js` | 365,552 | `hrzuJItk9EvPwjwzGudGGQYZV9WcqwQBcdy2+1kAvrY=` |
| `build/three.core.min.js` | 385,386 | `BbJgkzjHbNZdr3TzrFFbyaUEXhs7M+3AfYyb1VJQ+pA=` |
| `LICENSE` | 1,081 | `izeOvmDi/lABWMsKxxy16LfZKVPCq8xjoOuQSZZTtbw=` |

Build 41 (district 1's models and sky) adds four unmodified files from the same release's
`examples/jsm/`, under `0.185.1/addons/` with the same relative layout (GLTFLoader imports
the two utils by relative path; all four import `three` through the import map):

| File | Bytes | SHA-256 (base64, matches jsDelivr's published hash) |
|---|---|---|
| `addons/loaders/GLTFLoader.js` | 114,959 | `l2Qtcg8WzJoMmESTQZjk0MAjvqjolXbQ91RdA7LRA9I=` |
| `addons/loaders/HDRLoader.js` | 12,079 | `CYa1ePms0UzsdOXuheB/ReaBtAvNIppgGgORIB+bX/E=` |
| `addons/utils/BufferGeometryUtils.js` | 37,621 | `XFUiI6kwmIN0O4BTjW6c20XjIn8w0+xW+yw5tG541ZU=` |
| `addons/utils/SkeletonUtils.js` | 11,535 | `sWMqcDIGw9gw3p/L5RVpZ3DQS3GhXua1CvptLDKYyG8=` |

`three.module.min.js` imports `./three.core.min.js`, so the two must stay side by side.
The 3D pages reach it through an import map: `"three": "../vendor/three/0.185.1/three.module.min.js"`.

Upgrading is a deliberate change: new directory, new table, update every import map,
re-run `npm run test3d` (criterion 3D-0 checks these hashes).
