// web3d/scene.js -- renderer, scene and first-person camera. Browser only.

import * as THREE from 'three';

export function createScene(canvas, { pixelRatio = Math.min(window.devicePixelRatio || 1, 2), antialias = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // Far plane just past the fog's end (world.js FOG_FAR = 90): beyond it everything is
  // the fog colour anyway, and the frustum test then drops whole chunks there (N8.4).
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 100);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  let hfov = 90;
  const applyFov = () => {
    const a = camera.aspect || 1;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfov) / 2) / a));
    camera.updateProjectionMatrix();
  };

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    applyFov();
  }

  let post = null;
  const view = {
    THREE, renderer, scene, camera, resize,
    /** N4.3: bloom and grade (web3d/post.js), or null to draw straight to the screen. */
    setPost(p) { post?.dispose(); post = p; },
    get post() { return post; },
    /** The scene pass's own draw calls and triangles, for the readouts and benchmark(). */
    sceneInfo: { calls: 0, tris: 0 },
    /** Horizontal field of view, the way shooters specify it. */
    setHFov(deg) { hfov = deg; applyFov(); },
    get hfov() { return hfov; },
    render() {
      if (post) { view.sceneInfo = post.render(scene, camera); return; }
      renderer.render(scene, camera);
      view.sceneInfo = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
    },
  };
  return view;
}
