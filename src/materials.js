import * as THREE from 'three';

// Authored textures are deterministic and generated locally; no copyrighted assets or remote downloads.
function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function wrap(texture, repeatX = 1, repeatY = 1, srgb = false) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function canvasTexture(canvas, color = false) {
  const texture = new THREE.CanvasTexture(canvas);
  return wrap(texture, 1, 1, color);
}

export function createAsphaltMaterial(quality = 'high') {
  const size = quality === 'ultra' ? 1024 : quality === 'low' ? 256 : 512;
  const diffuse = document.createElement('canvas');
  const normal = document.createElement('canvas');
  const roughness = document.createElement('canvas');
  for (const canvas of [diffuse, normal, roughness]) {
    canvas.width = canvas.height = size;
  }
  const rng = randomGenerator(98789);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = rng();
      const aggregate = Math.sin(x * 0.29 + Math.cos(y * 0.13)) *
        Math.cos(y * 0.27 + Math.sin(x * 0.12));
      const crackA = Math.abs(Math.sin(x * 0.034 + Math.sin(y * 0.021) * 0.7));
      const crackB = Math.abs(Math.sin(y * 0.037 + Math.cos(x * 0.031) * 0.6));
      const crack = (crackA < 0.012 && y > 38 && y < 194) ||
        (crackB < 0.009 && x > 90 && x < 208);
      height[y * size + x] = (grain - 0.5) * 0.35 + aggregate * 0.15 - (crack ? 0.5 : 0);
    }
  }
  const diffuseCtx = diffuse.getContext('2d');
  const normalCtx = normal.getContext('2d');
  const roughCtx = roughness.getContext('2d');
  const d = diffuseCtx.createImageData(size, size);
  const n = normalCtx.createImageData(size, size);
  const r = roughCtx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, j = i * 4;
      const h = height[i];
      const value = Math.max(16, Math.min(125, 67 + h * 52));
      d.data[j] = value;
      d.data[j + 1] = value + 2;
      d.data[j + 2] = value + 4;
      d.data[j + 3] = 255;
      const dx = height[y * size + (x + 1) % size] -
        height[y * size + (x + size - 1) % size];
      const dy = height[((y + 1) % size) * size + x] -
        height[((y + size - 1) % size) * size + x];
      const inv = 1 / Math.hypot(dx * 1.6, dy * 1.6, 1);
      n.data[j] = Math.round(127.5 * (1 - dx * 1.6 * inv));
      n.data[j + 1] = Math.round(127.5 * (1 - dy * 1.6 * inv));
      n.data[j + 2] = Math.round(127.5 * (1 + inv));
      n.data[j + 3] = 255;
      const rough = Math.round(205 + Math.max(-25, Math.min(25, h * 23)));
      r.data[j] = r.data[j + 1] = r.data[j + 2] = rough;
      r.data[j + 3] = 255;
    }
  }
  diffuseCtx.putImageData(d, 0, 0);
  normalCtx.putImageData(n, 0, 0);
  roughCtx.putImageData(r, 0, 0);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xf2f2f2,
    map: canvasTexture(diffuse, true),
    normalMap: canvasTexture(normal),
    roughnessMap: canvasTexture(roughness),
    roughness: 0.97,
    metalness: 0.015,
    clearcoat: 0,
    clearcoatRoughness: 0.2
  });
  material.normalScale.set(0.38, 0.38);
  return material;
}

export function createGravelMaterial() {
  const size = 128, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const data = context.createImageData(size, size);
  const rng = randomGenerator(45213);
  for (let i = 0; i < data.data.length; i += 4) {
    const stone = 115 + Math.round(rng() * 76);
    data.data[i] = stone;
    data.data[i + 1] = stone - 7;
    data.data[i + 2] = stone - 21;
    data.data[i + 3] = 255;
  }
  context.putImageData(data, 0, 0);
  return new THREE.MeshStandardMaterial({
    map: canvasTexture(canvas, true), color: 0xc9c9c9, roughness: 1
  });
}

export function makeCarPaint(color = 0x284b63) {
  return new THREE.MeshPhysicalMaterial({
    color, metalness: 0.72, roughness: 0.29,
    clearcoat: 1, clearcoatRoughness: 0.085,
    envMapIntensity: 1.7
  });
}

export function makeAutomotiveGlass() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x829dab, metalness: 0.05,
    roughness: 0.065, transparent: true, opacity: 0.43,
    clearcoat: 1, clearcoatRoughness: 0.025,
    side: THREE.DoubleSide, envMapIntensity: 1.4,
    depthWrite: false
  });
}


// Tiled ground detail near the player. The vertex colors still control the
// large-scale transition from green lowlands to stony mountain slopes.
export function createTerrainMaterial() {
  const size = 256;
  const noise = document.createElement('canvas');
  const bump = document.createElement('canvas');
  noise.width = noise.height = bump.width = bump.height = size;
  const colorCtx = noise.getContext('2d');
  const bumpCtx = bump.getContext('2d');
  const rgb = colorCtx.createImageData(size, size);
  const normals = bumpCtx.createImageData(size, size);
  const rng = randomGenerator(80126);
  const elevations = new Float32Array(size * size);
  for (let i = 0; i < elevations.length; i++) {
    const px = i % size, py = (i / size) | 0;
    elevations[i] = rng() * .68 +
      .16 * Math.sin(px*.31 + Math.cos(py*.18)) *
      Math.cos(py*.29) + .13;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y*size+x, p=i*4, n=elevations[i];
    const value = Math.min(255, Math.max(105, Math.round(178+n*52)));
    rgb.data[p]=value+2;rgb.data[p+1]=value+1;rgb.data[p+2]=value-3;rgb.data[p+3]=255;
    const right=elevations[y*size+(x+1)%size];
    const left=elevations[y*size+(x+size-1)%size];
    const down=elevations[((y+1)%size)*size+x];
    const up=elevations[((y+size-1)%size)*size+x];
    const dx=(right-left)*.48, dy=(down-up)*.48;
    const z=1/Math.hypot(dx,dy,1);
    normals.data[p]=Math.round((1-dx*z)*127.5);
    normals.data[p+1]=Math.round((1-dy*z)*127.5);
    normals.data[p+2]=Math.round((1+z)*127.5);
    normals.data[p+3]=255;
  }
  colorCtx.putImageData(rgb,0,0);
  bumpCtx.putImageData(normals,0,0);
  const map=canvasTexture(noise,true);
  const normalMap=canvasTexture(bump);
  map.repeat.set(100,100);
  normalMap.repeat.set(100,100);
  const m=new THREE.MeshStandardMaterial({
    vertexColors:true,map,normalMap,roughness:.96,metalness:0
  });
  m.normalScale.set(.17,.17);
  return m;
}
