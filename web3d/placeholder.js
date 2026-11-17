// web3d/placeholder.js -- phase 0's page: proves three.js loads from the vendored copy,
// that WebGL works on this device, and that the banner and the deploy are wired. Replaced
// by the real hub in phase 7.

import * as THREE from 'three';
import { DISTRICT_THEMES } from '../web/themes.js';
import { install as installTheme } from '../web/theme.js';
import { mountBanner } from './banner.js';

installTheme();
mountBanner(document.body);

const canvas = document.getElementById('stage');
const caption = document.getElementById('caption');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  caption.textContent = `WebGL is not available here (${err?.message || err}). The 3D game will need it.`;
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
camera.position.set(0, 1.2, 4.2);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x1a1410, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(3, 5, 2);
scene.add(sun);

const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.1 });
const cube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), mat);
scene.add(cube);

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

const SECONDS_PER_BELT = 1.6;
let belt = -1;
function frame(ms) {
  resize();
  const t = ms / 1000;
  cube.rotation.set(t * 0.5, t * 0.8, 0);
  const b = Math.floor(t / SECONDS_PER_BELT) % DISTRICT_THEMES.length;
  if (b !== belt) {
    belt = b;
    const theme = DISTRICT_THEMES[b];
    mat.color.set(theme.accent);
    scene.background = new THREE.Color(theme.terrain.wall);
    caption.innerHTML = `three.js <span class="p3-mono">r${THREE.REVISION}</span> is running on this device. ` +
      `Belt <span class="p3-mono">${b + 1}/10</span>: <b>${theme.name}</b>. ` +
      'The playable graybox arrives in phase 2.';
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
