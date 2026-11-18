// web3d/art/layered.js -- many surfaces, one material. Browser only.
//
// N4.2 gives every kind of place its own walls and floors. Drawn as one material per
// kind, a city chunk would cost up to nine draw calls per layer instead of one. Instead
// every surface of a layer (the street's and each place's) goes into ONE array texture --
// colour, normal, roughness+metalness, emission -- and each instance carries `aLayer`,
// the slice it shows. The material is a MeshStandardMaterial whose map lookups are
// swapped for array lookups (onBeforeCompile), so lighting, fog and shadows are three's.
//
// Draw calls do not change; texture memory goes up: about 26 MB for walls and floors,
// with mipmaps.

import * as THREE from 'three';
import { canvas, normalFrom } from './textures.js';

/** Same-sized canvases into one array texture; canvas rows run top-down, texture rows bottom-up. */
function arrayTexture(cvs, { srgb = true, post = null } = {}) {
  const w = cvs[0].width, h = cvs[0].height, n = cvs.length;
  const data = new Uint8Array(w * h * 4 * n);
  cvs.forEach((cv, i) => {
    if (cv.width !== w || cv.height !== h) throw new Error(`layer ${i} is ${cv.width}x${cv.height}, not ${w}x${h}`);
    const img = cv.getContext('2d').getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) data.set(img.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), (i * h + y) * w * 4);
    if (post) post(data.subarray(i * w * h * 4, (i + 1) * w * h * 4), i);
  });
  const t = new THREE.DataArrayTexture(data, w, h, n);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * @param {Array<{c, h, r?, e?, strength, rough, metal}>} layers  same-sized canvases
 * @returns {{map, normal, rm, emissive: THREE.DataArrayTexture|null, count}}
 */
export function layerTextures(layers) {
  const w = layers[0].c.width, h = layers[0].c.height;
  const blank = (v) => { const cv = canvas(w, h), g = cv.getContext('2d'); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, 0, w, h); return cv; };
  const map = arrayTexture(layers.map((l) => l.c));
  const normal = arrayTexture(layers.map((l) => normalFrom(l.h, l.strength)), { srgb: false });
  // roughness in G (three reads .g), metalness in B (three reads .b)
  const rm = arrayTexture(layers.map((l) => l.r || blank(Math.round(255 * l.rough))), {
    srgb: false,
    post: (px, i) => {
      // a drawn map is the roughness already (TIDE's wet patches); a blank is filled with it
      const m = Math.round(255 * (layers[i].metal || 0));
      for (let k = 0; k < px.length; k += 4) { px[k + 1] = px[k]; px[k + 2] = m; }
    },
  });
  const emissive = layers.some((l) => l.e) ? arrayTexture(layers.map((l) => l.e || blank(0))) : null;
  return { map, normal, rm, emissive, count: layers.length };
}

let dummy = null;
const placeholder = () => {
  if (!dummy) { dummy = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); dummy.needsUpdate = true; }
  return dummy;
};

const swap = (chunk, from, to) => {
  const src = THREE.ShaderChunk[chunk];
  if (!src.includes(from)) throw new Error(`three.js chunk ${chunk} no longer samples ${from}`);
  return src.replace(from, to);
};

/**
 * A MeshStandardMaterial that reads its maps from layer arrays by the instance's `aLayer`.
 * @param {object} tex  layerTextures()
 * @param {object} [params]  more MeshStandardMaterial parameters
 */
export function layeredMaterial(tex, params = {}) {
  const p = placeholder();
  const mat = new THREE.MeshStandardMaterial({
    ...params, map: p, normalMap: p, roughnessMap: p, metalnessMap: p, roughness: 1, metalness: 1,
    ...(tex.emissive ? { emissiveMap: p, emissive: 0xffffff, emissiveIntensity: params.emissiveIntensity ?? 1 } : {}),
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      layerMap: { value: tex.map }, layerNormal: { value: tex.normal }, layerRM: { value: tex.rm },
      layerEmissive: { value: tex.emissive || tex.map },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLayer;\nflat varying float vLayer;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvLayer = aLayer;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nflat varying float vLayer;\nuniform sampler2DArray layerMap;\nuniform sampler2DArray layerNormal;\nuniform sampler2DArray layerRM;\nuniform sampler2DArray layerEmissive;')
      .replace('#include <map_fragment>', swap('map_fragment', 'texture2D( map, vMapUv )', 'texture( layerMap, vec3( vMapUv, vLayer ) )'))
      .replace('#include <normal_fragment_maps>', swap('normal_fragment_maps', 'texture2D( normalMap, vNormalMapUv )', 'texture( layerNormal, vec3( vNormalMapUv, vLayer ) )'))
      .replace('#include <roughnessmap_fragment>', swap('roughnessmap_fragment', 'texture2D( roughnessMap, vRoughnessMapUv )', 'texture( layerRM, vec3( vRoughnessMapUv, vLayer ) )'))
      .replace('#include <metalnessmap_fragment>', swap('metalnessmap_fragment', 'texture2D( metalnessMap, vMetalnessMapUv )', 'texture( layerRM, vec3( vMetalnessMapUv, vLayer ) )'))
      .replace('#include <emissivemap_fragment>', swap('emissivemap_fragment', 'texture2D( emissiveMap, vEmissiveMapUv )', 'texture( layerEmissive, vec3( vEmissiveMapUv, vLayer ) )'));
  };
  mat.customProgramCacheKey = () => `layered:${tex.emissive ? 'e' : '-'}`;
  return mat;
}

/** The per-instance layer attribute for an InstancedMesh's geometry. */
export function setLayers(mesh, layers) {
  mesh.geometry.setAttribute('aLayer', new THREE.InstancedBufferAttribute(Float32Array.from(layers), 1));
}
