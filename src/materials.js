import * as THREE from 'three';

// Authored textures are deterministic and generated locally; no copyrighted assets or remote downloads.
function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function wrap(texture, repeatX = 1, repeatY = 1, srgb = false) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 16;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function canvasTexture(canvas, color = false) {
  const texture = new THREE.CanvasTexture(canvas);
  return wrap(texture, 1, 1, color);
}

const asphaltCache = new Map();

// Reuse the same procedural PBR textures between routes instead of regenerating
// 3 canvases per road. Each road still gets its own material for wetness control.
export function createAsphaltMaterial(quality = 'high', variant = 'aged') {
  if (!['fresh','aged','worn'].includes(variant)) variant='aged';
  const key=quality+':'+variant;
  let maps=asphaltCache.get(key);
  if(!maps){
    const size=quality==='ultra'?1536:quality==='high'?768:
      quality==='low'?256:512;
    const diffuse=document.createElement('canvas');
    const normal=document.createElement('canvas');
    const roughness=document.createElement('canvas');
    for(const canvas of [diffuse,normal,roughness])canvas.width=canvas.height=size;
    const rng=randomGenerator(98789+(['fresh','aged','worn'].indexOf(variant)*317));
    const heights=new Float32Array(size*size);
    const scale=256/size;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const px=x*scale,py=y*scale;
      const granular=(rng()-.5)*.49;
      const aggregate=Math.sin(px*.31+Math.cos(py*.12))*
        Math.cos(py*.27+Math.sin(px*.11))*.15;
      const broad=Math.sin(px*.035+Math.sin(py*.023)*.7)*
        Math.cos(py*.04+Math.sin(px*.027))*.20;
      const crackA=Math.abs(Math.sin(px*.044+Math.sin(py*.025)*.95));
      const crackB=Math.abs(Math.sin(py*.061+Math.cos(px*.045)*.8));
      const damaged=variant==='worn' ? 1 : variant==='aged' ? .65 : .2;
      const cracked=(crackA<.014&&py>16&&py<232)||
        (crackB<.009&&px>31&&px<215);
      heights[y*size+x]=granular+aggregate+broad-(cracked?.64*damaged:0);
    }
    const d=diffuse.getContext('2d').createImageData(size,size);
    const n=normal.getContext('2d').createImageData(size,size);
    const r=roughness.getContext('2d').createImageData(size,size);
    const baseline=variant==='fresh'?64:variant==='aged'?76:86;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=y*size+x,j=i*4,h=heights[i];
      const value=Math.max(22,Math.min(142,baseline+h*57));
      d.data[j]=value;d.data[j+1]=value+1;d.data[j+2]=value+3;d.data[j+3]=255;
      const dx=heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size];
      const dy=heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x];
      const inv=1/Math.hypot(dx*1.6,dy*1.6,1);
      n.data[j]=Math.round(127.5*(1-dx*1.6*inv));
      n.data[j+1]=Math.round(127.5*(1-dy*1.6*inv));
      n.data[j+2]=Math.round(127.5*(1+inv));n.data[j+3]=255;
      const roughValue=Math.round(variant==='fresh'?175+h*20:205+h*25);
      r.data[j]=r.data[j+1]=r.data[j+2]=Math.max(125,Math.min(245,roughValue));
      r.data[j+3]=255;
    }
    diffuse.getContext('2d').putImageData(d,0,0);
    normal.getContext('2d').putImageData(n,0,0);
    roughness.getContext('2d').putImageData(r,0,0);
    maps={map:canvasTexture(diffuse,true),
      normalMap:canvasTexture(normal),roughnessMap:canvasTexture(roughness)};
    for(const texture of Object.values(maps))texture.userData.corsaShared=true;
    asphaltCache.set(key,maps);
  }
  const material=new THREE.MeshPhysicalMaterial({
    color:0xf2f2f2,
    ...maps,vertexColors:true,
    roughness:variant==='fresh'?.91:variant==='aged'?.96:.99,
    metalness:.012,clearcoat:0,clearcoatRoughness:.25,
    side:THREE.DoubleSide
  });
  material.normalScale.set(.55,.55);
  material.userData.roadAsphalt=true;
  material.userData.variant=variant;
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
  const size = 512;
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
    // Rich granular soil, dry leaves and stone chips; broad colour comes
    // from slope/altitude vertex colours instead of one solid green texture.
    const fleck=Math.sin(x*.49+Math.sin(y*.19))*Math.cos(y*.53-x*.1);
    const value = Math.min(255,Math.max(100,Math.round(170+n*62+fleck*13)));
    const mineral=n>.75?7:0;
    rgb.data[p]=Math.min(255,value+mineral+3);
    rgb.data[p+1]=Math.max(0,value-5);
    rgb.data[p+2]=Math.max(0,value-14+mineral);
    rgb.data[p+3]=255;
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
  map.repeat.set(145,145);
  normalMap.repeat.set(145,145);
  const m=new THREE.MeshStandardMaterial({
    vertexColors:true,map,normalMap,roughness:.96,metalness:0
  });
  m.normalScale.set(.28,.28);
  return m;
}
