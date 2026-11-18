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

const COMPOSITE = `uniform sampler2D src, b1, b2; uniform float strength, sat, lift, gain, vignette;
uniform vec3 tint; varying vec2 vUv;
void main() {
  vec3 c = texture2D(src, vUv).rgb;
  c += (texture2D(b1, vUv).rgb * 0.6 + texture2D(b2, vUv).rgb * 0.8) * strength;
  c = c * gain + lift;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, sat), 0.0) * tint;
  vec2 d = vUv - 0.5;
  c *= 1.0 - vignette * dot(d, d) * 2.0;
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
  const scene = target({ depthBuffer: true, samples });
  const a1 = target(), b1 = target(), a2 = target(), b2 = target();
  const bright = material(BRIGHT, { src: { value: null }, threshold: { value: 0.92 }, knee: { value: 0.3 } });
  const blur = material(BLUR, { src: { value: null }, dir: { value: new THREE.Vector2() } });
  const comp = material(COMPOSITE, {
    src: { value: scene.texture }, b1: { value: b1.texture }, b2: { value: a2.texture },
    strength: { value: 0.9 }, sat: { value: 1 }, lift: { value: 0 }, gain: { value: 1 },
    vignette: { value: 0.22 }, tint: { value: new THREE.Color(1, 1, 1) },
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
      }
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(scene);
      renderer.render(sceneObj, camera);
      const info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
      bright.uniforms.src.value = scene.texture;
      pass(bright, a1);
      blurPass(a1, b1, a1, a1.width, a1.height);          // a1: the first level, blurred
      blur.uniforms.src.value = a1.texture; blur.uniforms.dir.value.set(1 / a2.width, 0); pass(blur, b2);
      blur.uniforms.src.value = b2.texture; blur.uniforms.dir.value.set(0, 1 / a2.height); pass(blur, a2);
      blurPass(a2, b2, a2, a2.width, a2.height);          // a2: the second level, wider
      comp.uniforms.b1.value = a1.texture;
      comp.uniforms.b2.value = a2.texture;
      pass(comp, prev);
      return info;
    },
    /** The belt's grade: { tint, sat, lift, gain, bloom } */
    setGrade(g = {}) {
      comp.uniforms.tint.value.set(g.tint || '#ffffff');
      comp.uniforms.sat.value = g.sat ?? 1;
      comp.uniforms.lift.value = g.lift ?? 0;
      comp.uniforms.gain.value = g.gain ?? 1;
      comp.uniforms.strength.value = g.bloom ?? 0.9;
    },
    dispose() {
      for (const t of [scene, a1, b1, a2, b2]) t.dispose();
      for (const m of [bright, blur, comp]) m.dispose();
      geo.dispose();
    },
  };
}
