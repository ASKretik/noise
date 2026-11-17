// web3d/world.js -- level -> meshes. Browser only.
//
// Phase 2: graybox. Grey walls, brown rubble, a blue water sheet, dark translucent black
// boxes, a floor with cell seams. Instanced per tile type, so a district is a handful of
// draw calls however it is laid out. Phase 3 replaces the materials and shapes; the
// layout code stays.

import * as THREE from 'three';
import { TILE } from '../sim/grid.js';
import { WALL_M } from '../sim3d/units.js';

export function buildWorld(level, { cellM }) {
  const { map } = level;
  const group = new THREE.Group();
  const W = map.w * cellM, H = map.h * cellM;

  // floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshStandardMaterial({ color: 0x5b5d66, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, H / 2);
  group.add(floor);

  const grid = new THREE.GridHelper(Math.max(W, H), Math.max(map.w, map.h), 0x3a3c44, 0x3a3c44);
  grid.position.set(Math.max(W, H) / 2, 0.005, Math.max(W, H) / 2);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  group.add(grid);

  const kinds = {
    [TILE.WALL]: { h: WALL_M, mat: new THREE.MeshStandardMaterial({ color: 0x8b8e98, roughness: 0.9 }) },
    [TILE.BUILDING]: { h: 1.6, mat: new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 1 }) },
    [TILE.COVER]: { h: 0.06, mat: new THREE.MeshStandardMaterial({ color: 0x2f7fb0, roughness: 0.2, metalness: 0.1 }) },
    [TILE.SAFE]: {
      h: WALL_M,
      mat: new THREE.MeshStandardMaterial({ color: 0x060608, transparent: true, opacity: 0.62, roughness: 0.4, depthWrite: false }),
    },
  };
  const cells = {};
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const t = map.tiles[y * map.w + x];
      if (kinds[t]) (cells[t] ||= []).push([x, y]);
    }
  }
  const m4 = new THREE.Matrix4();
  for (const [t, list] of Object.entries(cells)) {
    const k = kinds[t];
    const geo = new THREE.BoxGeometry(cellM, k.h, cellM);
    const mesh = new THREE.InstancedMesh(geo, k.mat, list.length);
    list.forEach(([x, y], i) => {
      m4.makeTranslation((x + 0.5) * cellM, k.h / 2, (y + 0.5) * cellM);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (Number(t) === TILE.SAFE) mesh.renderOrder = 2;
    group.add(mesh);
  }

  // A dark ring of wall beyond the map edge, so the horizon is never the void.
  const skirt = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 6, H * 6),
    new THREE.MeshStandardMaterial({ color: 0x1b1c22, roughness: 1 }),
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.set(W / 2, -0.01, H / 2);
  group.add(skirt);

  return {
    group,
    dispose() {
      group.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
    },
  };
}
