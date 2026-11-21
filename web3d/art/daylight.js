// web3d/art/daylight.js -- district 1's daylight. Browser only. N4.4, build 41.
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
uniform float gain, drift, time;
uniform vec3 haze;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec2 uv = vec2(fract(atan(d.z, d.x) * 0.15915494 + 0.5 + time * drift), clamp(el / 1.5707963, 0.001, 0.999));
  vec3 c = texture2D(map, uv).rgb * gain;
  c = mix(haze, c, smoothstep(-0.01, 0.16, d.y));
  gl_FragColor = vec4(c, 1.0);
}`;

/** The photographed sky dome; same contract as art/sky.js makeSky. */
export function makePhotoSky(day, radius, track = (x) => x) {
  const tex = track(new THREE.TextureLoader().load(asset(day.sky)));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;               // magnified everywhere; no seam where u wraps
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  const mat = track(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      map: { value: tex }, gain: { value: day.skyGain }, drift: { value: day.drift ?? 0 }, time: { value: 0 },
      haze: { value: new THREE.Color(day.haze) },
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
export function loadDayEnv(renderer, day) {
  let byUrl = envCache.get(renderer);
  if (!byUrl) envCache.set(renderer, (byUrl = new Map()));
  if (!byUrl.has(day.env)) {
    byUrl.set(day.env, new HDRLoader().loadAsync(asset(day.env)).then((hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pm = new THREE.PMREMGenerator(renderer);
      const env = pm.fromEquirectangular(hdr).texture;
      hdr.dispose();
      pm.dispose();
      return env;
    }));
  }
  return byUrl.get(day.env);
}
