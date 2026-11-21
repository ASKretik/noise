// web3d/art/daylight.js -- photographed skies and their light. Browser only. N4.4, builds 41-42.
//
// (Build 41 wrote this for district 1's daylight; build 42 uses it for every belt whose
// style has a photographed sky, dimmed and tinted by the style, and adds envFromSky for
// the belts whose sky is drawn.)
//
// The user's reference was Halo concept art for the streets: a blue sky with big clouds,
// a strong sun, haze that turns far buildings pale blue. A painted gradient and fbm
// clouds (art/sky.js) do not get there, so the sky here is a photograph:
//
//   the sky      Poly Haven's "Kloofendal 48d Partly Cloudy (Pure Sky)", CC0. Its 4K HDR
//                was cut to the upper half and stored as a JPEG of linear * 0.35
//                (assets3d/sky/, 0.36 MB); the shader multiplies that back out, so the
//                clouds are brighter than white and the sun blooms.
//   its light    the same sky's 1K HDR (1.4 MB), prefiltered by three's PMREM, lights
//                every PBR surface: blue from above, the sun's side warmer
//   the sun      a DirectionalLight from where the sun is in the photograph (its
//                brightest pixel: 47.9 degrees up), casting shadows
//   haze         the photograph's own horizon colour, as fog; the sky fades into it at
//                the horizon, so the far city and the sky meet without a line
//
// Alleys stay dark: world.js's darkness map scales the sky's light down where buildings
// close in, and the sun reaches them only through gaps.

import * as THREE from 'three';
import { HDRLoader } from '../../vendor/three/0.185.1/addons/loaders/HDRLoader.js';

const asset = (p) => new URL(`../../assets3d/sky/${p}`, import.meta.url).href;

const VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// three's equirect convention (u from atan(z, x), v up), on the upper half only
const FRAG = `
uniform sampler2D map;
uniform float gain, drift, time, veil, disc;
uniform vec3 haze, tint, sunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec2 uv = vec2(fract(atan(d.z, d.x) * 0.15915494 + 0.5 + time * drift), clamp(el / 1.5707963, 0.001, 0.999));
  vec3 c = texture2D(map, uv).rgb * gain * tint;
  // build 42: a veil of dust or smoke over the whole sky (SOLAR), and the sun a dull coin in it
  c = mix(c, haze, veil);
  float sd = max(dot(d, sunDir), 0.0);
  c += haze * disc * (smoothstep(0.9993, 0.9996, sd) * 1.6 + pow(sd, 60.0) * 0.5);
  c = mix(haze, c, smoothstep(-0.01, 0.16, d.y));
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * The photographed sky dome; same contract as art/sky.js makeSky. `sky` is a style's
 * (art/hdstyles.js): photo, gain (undoes the JPEG's scale), dim (how sombre), tint, haze.
 */
export function makePhotoSky(sky, radius, track = (x) => x) {
  const tex = track(new THREE.TextureLoader().load(asset(sky.photo)));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;               // magnified everywhere; no seam where u wraps
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  const mat = track(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      map: { value: tex }, gain: { value: sky.gain * (sky.dim ?? 1) }, drift: { value: sky.drift ?? 0 }, time: { value: 0 },
      haze: { value: new THREE.Color(sky.haze) }, tint: { value: new THREE.Color(sky.tint || '#ffffff') },
      veil: { value: sky.veil ?? 0 }, disc: { value: sky.disc ?? 0 },
      sunDir: { value: new THREE.Vector3(...(sky.sunDir || [0, 1, 0])).normalize() },
    },
    vertexShader: VERT, fragmentShader: FRAG,
  }));
  const mesh = new THREE.Mesh(track(new THREE.SphereGeometry(radius, 48, 24)), mat);
  mesh.renderOrder = -1;
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  return { mesh, update(t) { mat.uniforms.time.value = t; } };
}

const envCache = new WeakMap();
/**
 * The sky's light: the HDR prefiltered for PBR. Loaded once per renderer; resolves to a
 * texture for scene.environment.
 */
export function loadDayEnv(renderer, file) {
  let byUrl = envCache.get(renderer);
  if (!byUrl) envCache.set(renderer, (byUrl = new Map()));
  if (!byUrl.has(file)) {
    byUrl.set(file, new HDRLoader().loadAsync(asset(file)).then((hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pm = new THREE.PMREMGenerator(renderer);
      const env = pm.fromEquirectangular(hdr).texture;
      hdr.dispose();
      pm.dispose();
      return env;
    }));
  }
  return byUrl.get(file);
}

/**
 * Build 42: the light of a drawn sky (art/sky.js: EMBER's smoke, VIOLET's aurora, JADE's
 * two moons, COBALT's hull), made the same way as a photograph's: render the dome into a
 * cube round the origin and prefilter it. Once per district, so the aurora's light is the
 * aurora as it stood at the start. The caller disposes the texture.
 */
export function envFromSky(renderer, skyMesh) {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), skyMesh.material);
  scene.add(dome);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02, 0.1, 100);
  dome.geometry.dispose();
  pm.dispose();
  return rt;
}
