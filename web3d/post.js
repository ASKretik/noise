// web3d/post.js -- bloom and a colour grade per belt. Browser only.
//
// N4.3. The scene is drawn into a half-float target, so what is brighter than white --
// alien eyes, neon, lit windows, lanterns, the sun, the mast's light -- keeps its excess.
// That excess is cut out (a soft threshold), blurred at half and quarter resolution
// (Medium: quarter and eighth), and added back: it glows. Then the belt's grade -- a
// tint, a saturation, a little lift and gain, a soft vignette -- and the conversion to
// sRGB. The stun gun's viewmodel is drawn afterwards, straight to the screen.
//
// Written here rather than vendored (three's EffectComposer stack is eight files and a
// tone-mapping pass this game does not use): five small shaders and three targets.
// Low quality draws the scene straight to the screen, as before.
//
// Build 41 (district 1's daylight): a grade may ask for film tone mapping (`aces`, with
// an `exposure`) -- three's ACES fit, so a photographed sky and a real sun keep their
// highlights instead of clipping -- and for ambient occlusion (`ao`, its strength):
// corners, the foot of every wall, the inside of window reveals and the gap under a car
// darken, from the scene's own depth (a scalable ambient obscurance pass at half
// resolution, 12 taps, then a depth-aware blur). Other belts ask for neither and look
// exactly as before.
//
// Build 42 adds two a belt's first district may ask for: `mono` (ASH: the frame loses its
// colour except the hues the player must read -- aliens, keys, coins, the portal) and
// `shimmer` (SOLAR: heat haze rippling the middle of the view).

import * as THREE from 'three';

const VS = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const material = (fs, uniforms) => new THREE.ShaderMaterial({
  uniforms, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false,
});

const BRIGHT = `uniform sampler2D src; uniform float threshold, knee; varying vec2 vUv;
void main() {
  vec3 c = texture2D(src, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float s = clamp((l - threshold + knee) / (2.0 * knee), 0.0, 1.0);
  float w = max(l - threshold, 0.0) + knee * s * s;
  gl_FragColor = vec4(c * (w / max(l, 1e-4)), 1.0);
}`;

// 9 taps in 5 fetches (linear sampling), separable
const BLUR = `uniform sampler2D src; uniform vec2 dir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(src, vUv).rgb * 0.2270270;
  c += (texture2D(src, vUv + dir * 1.3846154).rgb + texture2D(src, vUv - dir * 1.3846154).rgb) * 0.3162162;
  c += (texture2D(src, vUv + dir * 3.2307692).rgb + texture2D(src, vUv - dir * 3.2307692).rgb) * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}`;

// Build 41: ambient obscurance from depth (McGuire's SAO, simplified). Half resolution.
const SAO = `uniform sampler2D depth; uniform vec2 res, proj; uniform float near, far, radius, projScale;
varying vec2 vUv;
float viewZ(vec2 uv) {
  float d = texture2D(depth, uv).x * 2.0 - 1.0;
  return 2.0 * near * far / (far + near - d * (far - near));
}
vec3 viewPos(vec2 uv) { float z = viewZ(uv); return vec3((uv * 2.0 - 1.0) * proj * z, -z); }
void main() {
  float d0 = texture2D(depth, vUv).x;
  if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 p = viewPos(vUv);
  vec2 px = 1.0 / res;
  vec3 r = viewPos(vUv + vec2(px.x, 0.0)), l = viewPos(vUv - vec2(px.x, 0.0));
  vec3 u = viewPos(vUv + vec2(0.0, px.y)), b = viewPos(vUv - vec2(0.0, px.y));
  vec3 dx = abs(r.z - p.z) < abs(p.z - l.z) ? r - p : p - l;
  vec3 dy = abs(u.z - p.z) < abs(p.z - b.z) ? u - p : p - b;
  vec3 n = normalize(cross(dx, dy));
  float z = -p.z;
  float rPx = clamp(projScale * radius / z, 3.0, 80.0);
  // interleaved gradient noise rotates the spiral per pixel; the blur removes the pattern
  float ang = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float sum = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = (float(i) + 0.5) / 12.0;
    float t = ang + float(i) * 2.3999632;   // the golden angle: an even spiral
    vec2 off = vec2(cos(t), sin(t)) * a * rPx * px;
    vec3 q = viewPos(vUv + off);
    vec3 v = q - p;
    float vv = dot(v, v), vn = dot(v, n);
    float f = max(radius * radius - vv, 0.0);
    sum += f * f * f * max((vn - 0.01 * z) / (vv + 0.01), 0.0);
  }
  float r6 = radius * radius; r6 = r6 * r6 * r6;
  float ao = max(0.0, 1.0 - sum * 5.0 / (r6 * 12.0));
  gl_FragColor = vec4(vec3(ao), 1.0);
}`;

// a 9-tap separable blur that does not bleed across depth edges
const AOBLUR = `uniform sampler2D src, depth; uniform vec2 dir; uniform float near, far; varying vec2 vUv;
float lin(vec2 uv) { float d = texture2D(depth, uv).x * 2.0 - 1.0; return 2.0 * near * far / (far + near - d * (far - near)); }
void main() {
  float z0 = lin(vUv), sum = 0.0, wsum = 0.0;
  for (int i = -4; i <= 4; i++) {
    vec2 uv = vUv + dir * float(i);
    float w = exp(-float(i * i) / 8.0) * max(0.0, 1.0 - abs(lin(uv) - z0) / (0.05 * z0 + 0.05));
    sum += texture2D(src, uv).r * w; wsum += w;
  }
  gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);
}`;

const COMPOSITE = `uniform sampler2D src, b1, b2, aoTex; uniform float strength, sat, lift, gain, vignette, grain, ca, time, aces, exposure, ao, mono, shimmer, clock, shock;
uniform vec3 tint; varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// three's ACES filmic fit (tonemapping_pars_fragment), with its exposure convention
vec3 fitRRT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 filmAces(vec3 c) {
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= exposure / 0.6;
  return clamp(OUT * fitRRT(IN * c), 0.0, 1.0);
}
// build 42, ASH: how much a colour is one the player must read -- the reds, oranges and
// golds of aliens, keys and coins, the violet of a 10-coin, the portal's teal
float keepHue(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn;
  if (mx <= 1e-4 || d <= 1e-4) return 0.0;
  float s = d / mx;
  float h = mx == c.r ? mod((c.g - c.b) / d, 6.0) : mx == c.g ? (c.b - c.r) / d + 2.0 : (c.r - c.g) / d + 4.0;
  h /= 6.0;
  float warm = h < 0.5 ? 1.0 - smoothstep(0.15, 0.19, h) : smoothstep(0.93, 0.96, h);   // red round to gold
  float teal = smoothstep(0.42, 0.45, h) * (1.0 - smoothstep(0.52, 0.55, h));
  float viol = smoothstep(0.70, 0.73, h) * (1.0 - smoothstep(0.82, 0.85, h));
  // vivid and lit: an alien's glow, a key, a coin -- not a dull red brick in the shade
  return max(warm, max(teal, viol)) * smoothstep(0.5, 0.72, s) * smoothstep(0.16, 0.3, mx);
}
void main() {
  vec2 uv0 = vUv;
  // build 42, SOLAR: heat shimmer, strongest across the middle of the view where the street ends
  if (shimmer > 0.0) uv0 += vec2(sin(vUv.y * 150.0 + clock * 4.2) * 0.0012, cos(vUv.x * 95.0 + clock * 3.3) * 0.0007) * shimmer * (1.0 - min(1.0, abs(vUv.y - 0.48) * 2.2));
  float fringe = ca + shock * 0.014;
  vec2 off = (uv0 - 0.5) * fringe;   // N4.4: a cheap lens -- colour fringes toward the edges
  vec3 c = fringe > 0.0 ? vec3(texture2D(src, uv0 + off).r, texture2D(src, uv0).g, texture2D(src, uv0 - off).b) : texture2D(src, uv0).rgb;
  // build 47: a stumble's smear, toward the middle of the view
  if (shock > 0.0) { vec2 r = (uv0 - 0.5) * shock * 0.045; c = (c + texture2D(src, uv0 - r).rgb + texture2D(src, uv0 - 2.0 * r).rgb) / 3.0; }
  if (ao > 0.0) c *= mix(1.0, texture2D(aoTex, vUv).r, ao);
  c += (texture2D(b1, vUv).rgb * 0.6 + texture2D(b2, vUv).rgb * 0.8) * strength;
  if (aces > 0.5) c = filmAces(c);
  if (mono > 0.0) { float k = keepHue(c); c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, max(1.0 - mono, k)); }
  c = c * gain + lift;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, sat), 0.0) * tint;
  vec2 d = vUv - 0.5;
  c *= max(0.0, 1.0 - (vignette + shock * 1.1) * dot(d, d) * 2.0) * (1.0 - shock * 0.3);
  // film grain, a new pattern every frame, stronger in the shadows like real stock
  if (grain > 0.0) c *= 1.0 + (hash(vUv * 1024.0 + time) - 0.5) * grain * (2.0 - min(1.0, dot(c, vec3(0.33)) * 4.0));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {object} o
 * @param {number} o.scale    bloom's first level, as a fraction of the screen (0.5 High, 0.25 Medium)
 * @param {number} o.samples  multisampling of the scene target (the canvas's own is bypassed)
 */
export function createPost(renderer, { scale = 0.5, samples = 4 } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quad = new THREE.Mesh(geo);
  quad.frustumCulled = false;
  const cam = new THREE.Camera();
  const target = (o = {}) => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, ...o });
  const depthTex = new THREE.DepthTexture(1, 1);
  depthTex.type = THREE.UnsignedIntType;
  const scene = target({ depthBuffer: true, samples, depthTexture: depthTex });
  const a1 = target(), b1 = target(), a2 = target(), b2 = target();
  const ao1 = target({ type: THREE.UnsignedByteType }), ao2 = target({ type: THREE.UnsignedByteType });
  const sao = material(SAO, {
    depth: { value: depthTex }, res: { value: new THREE.Vector2(1, 1) }, proj: { value: new THREE.Vector2(1, 1) },
    near: { value: 0.05 }, far: { value: 100 }, radius: { value: 0.9 }, projScale: { value: 500 },
  });
  const aoBlur = material(AOBLUR, { src: { value: null }, depth: { value: depthTex }, dir: { value: new THREE.Vector2() }, near: { value: 0.05 }, far: { value: 100 } });
  const bright = material(BRIGHT, { src: { value: null }, threshold: { value: 0.92 }, knee: { value: 0.3 } });
  const blur = material(BLUR, { src: { value: null }, dir: { value: new THREE.Vector2() } });
  const comp = material(COMPOSITE, {
    src: { value: scene.texture }, b1: { value: b1.texture }, b2: { value: a2.texture },
    strength: { value: 0.9 }, sat: { value: 1 }, lift: { value: 0 }, gain: { value: 1 },
    vignette: { value: 0.22 }, shock: { value: 0 }, tint: { value: new THREE.Color(1, 1, 1) },
    grain: { value: 0 }, ca: { value: 0 }, time: { value: 0 },
    aces: { value: 0 }, exposure: { value: 1 }, ao: { value: 0 }, aoTex: { value: ao2.texture },
    mono: { value: 0 }, shimmer: { value: 0 }, clock: { value: 0 },
  });
  const size = new THREE.Vector2();
  let W = 0, H = 0;

  const pass = (mat, out) => { quad.material = mat; renderer.setRenderTarget(out); renderer.render(quad, cam); };
  const blurPass = (from, via, to, w, h) => {
    blur.uniforms.src.value = from.texture; blur.uniforms.dir.value.set(1 / w, 0); pass(blur, via);
    blur.uniforms.src.value = via.texture; blur.uniforms.dir.value.set(0, 1 / h); pass(blur, to);
  };

  return {
    /** Draws the scene through bloom and grade to the screen; returns the scene pass's counters. */
    render(sceneObj, camera) {
      renderer.getDrawingBufferSize(size);
      if (size.x !== W || size.y !== H) {
        W = size.x; H = size.y;
        scene.setSize(W, H);
        const w1 = Math.max(1, Math.round(W * scale)), h1 = Math.max(1, Math.round(H * scale));
        a1.setSize(w1, h1); b1.setSize(w1, h1);
        a2.setSize(Math.max(1, w1 >> 1), Math.max(1, h1 >> 1)); b2.setSize(Math.max(1, w1 >> 1), Math.max(1, h1 >> 1));
        const wa = Math.max(1, W >> 1), ha = Math.max(1, H >> 1);
        ao1.setSize(wa, ha); ao2.setSize(wa, ha);
      }
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(scene);
      renderer.render(sceneObj, camera);
      const info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
      if (comp.uniforms.ao.value > 0) {
        const U = sao.uniforms, ty = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        U.res.value.set(ao1.width, ao1.height);
        U.proj.value.set(ty * camera.aspect, ty);
        U.near.value = aoBlur.uniforms.near.value = camera.near;
        U.far.value = aoBlur.uniforms.far.value = camera.far;
        U.projScale.value = ao1.height / (2 * ty);
        pass(sao, ao1);
        aoBlur.uniforms.src.value = ao1.texture; aoBlur.uniforms.dir.value.set(1 / ao1.width, 0); pass(aoBlur, ao2);
        aoBlur.uniforms.src.value = ao2.texture; aoBlur.uniforms.dir.value.set(0, 1 / ao1.height); pass(aoBlur, ao1);
        comp.uniforms.aoTex.value = ao1.texture;
      }
      bright.uniforms.src.value = scene.texture;
      pass(bright, a1);
      blurPass(a1, b1, a1, a1.width, a1.height);          // a1: the first level, blurred
      blur.uniforms.src.value = a1.texture; blur.uniforms.dir.value.set(1 / a2.width, 0); pass(blur, b2);
      blur.uniforms.src.value = b2.texture; blur.uniforms.dir.value.set(0, 1 / a2.height); pass(blur, a2);
      blurPass(a2, b2, a2, a2.width, a2.height);          // a2: the second level, wider
      comp.uniforms.b1.value = a1.texture;
      comp.uniforms.b2.value = a2.texture;
      comp.uniforms.time.value = (comp.uniforms.time.value + 0.6180339) % 97;
      comp.uniforms.clock.value = (performance.now() / 1000) % 1000;
      pass(comp, prev);
      return info;
    },
    /** The belt's grade: { tint, sat, lift, gain, bloom } */
    /** Build 47: a stumble's hit on the screen, 0-1 (play3d.js stumble). */
    setShock(x) { comp.uniforms.shock.value = x; },
    setGrade(g = {}) {
      comp.uniforms.tint.value.set(g.tint || '#ffffff');
      comp.uniforms.sat.value = g.sat ?? 1;
      comp.uniforms.lift.value = g.lift ?? 0;
      comp.uniforms.gain.value = g.gain ?? 1;
      comp.uniforms.strength.value = g.bloom ?? 0.9;
      comp.uniforms.vignette.value = g.vignette ?? 0.22;
      comp.uniforms.grain.value = g.grain ?? 0;
      comp.uniforms.ca.value = g.ca ?? 0;
      comp.uniforms.aces.value = g.aces ? 1 : 0;
      comp.uniforms.exposure.value = g.exposure ?? 1;
      comp.uniforms.ao.value = g.ao ?? 0;
      comp.uniforms.mono.value = g.mono ?? 0;
      comp.uniforms.shimmer.value = g.shimmer ?? 0;
    },
    dispose() {
      for (const t of [scene, a1, b1, a2, b2, ao1, ao2]) t.dispose();
      depthTex.dispose();
      for (const m of [bright, blur, comp, sao, aoBlur]) m.dispose();
      geo.dispose();
    },
  };
}
