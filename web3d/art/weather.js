// web3d/art/weather.js -- dust, rain and spores round the camera. Browser only.
//
// One THREE.Points cloud. Every particle has a fixed seed position in a box; the vertex
// shader moves it with time and wraps it into a box centred on the camera, so the weather
// is always round you and costs nothing on the CPU per frame. Thicker deeper into a belt
// (art.weather.rate). Part of the world group, so the capture hides it with the world.
//
//   dust    RUST: slow warm motes drifting on the wind
//   rain    TIDE: fast slanted streaks
//   spores  MOSS: pale glowing specks floating and bobbing

import * as THREE from 'three';
import { Rng } from '../../sim/prng.js';

const KINDS = {
  dust: { count: 1800, box: [36, 9, 36], floor: 0.2, kind: 0 },
  rain: { count: 5200, box: [34, 14, 34], floor: 0.0, kind: 1 },
  spores: { count: 1100, box: [30, 7, 30], floor: 0.3, kind: 2 },
};

const VERT = `
uniform float time, size, speed, slant, kind, scale;
uniform vec3 eye, box;
uniform float floorY;
attribute vec3 seed;
attribute float rnd;
varying float vA;
void main() {
  vec3 p = seed;
  if (kind < 0.5) {            // dust: drifting sideways, a slow sway
    p += vec3(slant, 0.02 * sin(time * 0.7 + rnd * 6.28), slant * 0.4) * speed * time;
    p.y += 0.25 * sin(time * 0.4 + rnd * 12.0);
  } else if (kind < 1.5) {     // rain: falling, slanted
    p += vec3(slant, -1.0, slant * 0.5) * speed * time * (0.85 + 0.3 * rnd);
  } else {                     // spores: floating up, bobbing
    p += vec3(0.3 * sin(time * 0.5 + rnd * 9.0), 0.4 + 0.6 * rnd, 0.3 * cos(time * 0.43 + rnd * 7.0)) * speed * time;
  }
  vec3 hb = box * 0.5;          // ('half' is a reserved word in GLSL)
  vec3 rel = mod(p - vec3(eye.x, 0.0, eye.z) + vec3(hb.x, 0.0, hb.z), box) - vec3(hb.x, 0.0, hb.z);
  vec3 world = vec3(eye.x, 0.0, eye.z) + rel;
  world.y = floorY + mod(p.y, box.y);
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  gl_PointSize = size * scale / max(dist, 0.5);
  // (GLSL leaves smoothstep undefined when edge0 >= edge1: always 1 - smoothstep(near, far))
  vA = (1.0 - smoothstep(box.x * 0.3, box.x * 0.5, length(rel.xz))) * smoothstep(0.1, 1.5, dist);
}`;

const FRAG = `
uniform vec3 colour;
uniform float kind, alpha;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a;
  if (kind > 0.5 && kind < 1.5) a = (1.0 - smoothstep(0.0, 0.035, abs(c.x))) * (1.0 - smoothstep(0.1, 0.5, abs(c.y)));
  else a = 1.0 - smoothstep(0.0, 0.5, length(c));
  if (kind > 1.5) a = pow(a, 1.6) * 1.6;
  gl_FragColor = vec4(colour, a * vA * alpha);
  #include <colorspace_fragment>
}`;

/**
 * @param {object|null} weather  art.weather: kind, color, rate, size, speed, slant
 * @returns {{object: THREE.Points, update(t, eye, heightPx)}|null}
 */
export function makeWeather(weather, seed, track = (x) => x) {
  if (!weather || !KINDS[weather.kind]) return null;
  const K = KINDS[weather.kind];
  const n = Math.round(K.count * weather.rate);
  const rng = new Rng(seed, `weather:${weather.kind}`);
  const seeds = new Float32Array(n * 3), rnd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    seeds[i * 3] = rng.float() * K.box[0];
    seeds[i * 3 + 1] = rng.float() * K.box[1];
    seeds[i * 3 + 2] = rng.float() * K.box[2];
    rnd[i] = rng.float();
  }
  const geo = track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
  geo.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
  const mat = track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: weather.kind === 'spores' ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      time: { value: 0 }, eye: { value: new THREE.Vector3() }, box: { value: new THREE.Vector3(...K.box) },
      floorY: { value: K.floor }, size: { value: weather.size }, speed: { value: weather.speed },
      slant: { value: weather.slant }, kind: { value: K.kind }, scale: { value: 600 },
      colour: { value: new THREE.Color(weather.color) },
      alpha: { value: weather.kind === 'rain' ? 0.5 : weather.kind === 'dust' ? 0.7 : 0.85 },
    },
    vertexShader: VERT, fragmentShader: FRAG,
  }));
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 4;
  pts.name = 'weather';
  return {
    object: pts,
    /** @param {number} heightPx  the canvas height in device pixels: keeps sizes in metres */
    update(t, eye, heightPx = 1000) {
      mat.uniforms.time.value = t;
      if (eye) mat.uniforms.eye.value.copy(eye);
      mat.uniforms.scale.value = heightPx * 0.9;
    },
  };
}
