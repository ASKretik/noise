// web3d/art/sky.js -- the sky dome of a district. Browser only.
//
// One shader, driven by a district's art (belts.js artFor, or world.js's fallback for
// belts not yet art-directed): a horizon-to-zenith gradient; the sun or the moon, with a
// glow; stars once it is dark; fbm clouds; for MOSS a canopy of leaves overhead; for TIDE
// a lighthouse beam sweeping the horizon. The horizon colour is also the fog colour, so
// the city fades into it.
//
// The dome sits inside the camera's far plane and follows the camera (world.js); it is
// named 'sky' because the capture sequence hides it by that name.

import * as THREE from 'three';

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
uniform vec3 zenith, horizon, cloudCol, bodyCol, beamCol, bodyDir;
uniform float bodySize, bodyGlow, clouds, stars, canopy, beam, beamAz, beamSpeed, time;
varying vec3 vDir;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }

void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.62, up));

  // sun or moon: a disc and a soft glow, only above the horizon
  float c = dot(d, normalize(bodyDir));
  float disc = smoothstep(cos(bodySize), cos(bodySize * 0.75), c);   // cos falls with angle: edge0 < edge1
  float glow = (pow(max(c, 0.0), 28.0) + 0.25 * pow(max(c, 0.0), 5.0)) * bodyGlow;
  float above = smoothstep(-0.03, 0.03, up);
  col += bodyCol * (disc + glow) * above;

  // stars, once it is dark
  if (stars > 0.0) {
    vec3 cell = floor(d * 260.0);
    float s = hash(cell);
    col += vec3(step(0.9965, s) * stars * (0.5 + 0.5 * hash(cell + 3.1))) * smoothstep(0.08, 0.45, up);
  }

  // clouds: fbm on a plane overhead, thinning to the horizon
  if (clouds > 0.0) {
    vec2 uv = d.xz / (up + 0.18) * 1.6 + vec2(time * 0.006, time * 0.002);
    float n = fbm(vec3(uv, time * 0.01));
    float cover = smoothstep(1.0 - clouds * 0.9, 1.15 - clouds * 0.75, n) * smoothstep(0.0, 0.25, up);
    col = mix(col, cloudCol, cover * 0.9);
  }

  // canopy: leaves overhead, dark against the light
  if (canopy > 0.0) {
    vec2 uv = d.xz / (up + 0.12) * 5.0;
    float leaf = fbm(vec3(uv, 1.7));
    float m = smoothstep(0.2, 0.85, up) * smoothstep(0.42, 0.62, leaf) * canopy;
    col = mix(col, zenith * 0.4, m);
  }

  // lighthouse: a narrow beam sweeping round the horizon
  if (beam > 0.0) {
    float az = atan(d.x, -d.z);
    float a = beamAz + time * beamSpeed;
    float dd = abs(mod(az - a + 3.14159265, 6.2831853) - 3.14159265);
    float band = exp(-dd * dd * 140.0) * (1.0 - smoothstep(0.0, 0.32, up)) * smoothstep(-0.02, 0.04, up);
    col += beamCol * band * 0.55 * beam;
  }

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** Unit direction for an azimuth (0 = grid north = -z, 90 = east = +x) and an elevation. */
export function skyDir(azDeg, elevDeg) {
  const az = (azDeg * Math.PI) / 180, el = (elevDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

/**
 * @param {object} sky     art.sky: zenith, horizon, clouds, cloud, stars, canopy, body, beam
 * @param {number} radius  inside the far plane
 * @param {Function} track register for disposal
 */
export function makeSky(sky, radius, track = (x) => x) {
  const C = (hex) => new THREE.Color(hex);
  const beam = sky.beam;
  const mat = track(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: C(sky.zenith) }, horizon: { value: C(sky.horizon) }, cloudCol: { value: C(sky.cloud) },
      bodyCol: { value: C(sky.body.color) }, bodyDir: { value: skyDir(sky.body.az, sky.body.elev) },
      bodySize: { value: sky.body.size }, bodyGlow: { value: sky.body.glow },
      clouds: { value: sky.clouds }, stars: { value: sky.stars }, canopy: { value: sky.canopy || 0 },
      beam: { value: beam ? beam.strength : 0 }, beamCol: { value: C(beam ? beam.color : '#000000') },
      beamAz: { value: beam ? (beam.az * Math.PI) / 180 : 0 }, beamSpeed: { value: beam ? beam.speed : 0 },
      time: { value: 0 },
    },
    vertexShader: VERT, fragmentShader: FRAG,
  }));
  const mesh = new THREE.Mesh(track(new THREE.SphereGeometry(radius, 32, 16)), mat);
  mesh.renderOrder = -1;
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  return { mesh, update(t) { mat.uniforms.time.value = t; } };
}
