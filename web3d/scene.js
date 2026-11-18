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

  return {
    THREE, renderer, scene, camera, resize,
    /** Horizontal field of view, the way shooters specify it. */
    setHFov(deg) { hfov = deg; applyFov(); },
    get hfov() { return hfov; },
    render() { renderer.render(scene, camera); },
  };
}
