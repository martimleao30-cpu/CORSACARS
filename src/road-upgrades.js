import * as THREE from 'three';

// A road is a cambered 3D deck with a measurable side wall, not a flat decal.
// Top-surface triangles are also used by cannon-es, preserving actual contact.
export const ROAD_SECTION = Object.freeze([-1, -.96, -.58, 0, .58, .96, 1]);
const metresPerTile = 5;
const seedRandom = seed => {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296);
};
const centerOf = sample => sample.center || sample;
const tangentOf = (samples, i) => {
  const item = samples[i];
  if (item.tangent) return new THREE.Vector3(item.tangent.x, 0, item.tangent.z).normalize();
  const prev = centerOf(samples[Math.max(0, i-1)]);
  const next = centerOf(samples[Math.min(samples.length-1, i+1)]);
  return new THREE.Vector3(next.x-prev.x, 0, next.z-prev.z).normalize();
};
const tint = (metres, lateral, width, seed) => {
  const slow = Math.sin(metres*.024 + seed*.13)*.035 +
    Math.cos(metres*.083 - seed*.11)*.018;
  const wheelZone = Math.abs(lateral) < width*.30 ? -.025 : 0;
  const edge = Math.max(0, (Math.abs(lateral)/width-.37)*2.3);
  return THREE.MathUtils.clamp(.87+slow+wheelZone-edge*.10,.62,1);
};
export const roadDeckHeight = (terrainY, x, z, lateral, width) =>
  terrainY(x,z) + .205 + .052*(1-Math.pow(2*lateral/width,2));

export function createRoadBed(samples, width, terrainY, seed=31, surface='dry') {
  if (samples.length < 2 || width <= 0) throw new Error('Estrada sem pontos ou largura');
  const vertices=[], uvs=[], colors=[], indices=[];
  const sideVertices=[], sideUvs=[], sideIndices=[];
  const stride=ROAD_SECTION.length;
  let progress=0;
  for (let i=0; i<samples.length; i++) {
    const p=centerOf(samples[i]);
    const previous=i>0?centerOf(samples[i-1]):p;
    progress += i>0 ? Math.hypot(p.x-previous.x,p.z-previous.z) : 0;
    const t=tangentOf(samples,i);
    const sideX=-t.z, sideZ=t.x;
    for (const f of ROAD_SECTION) {
      const offset=width*.5*f;
      const x=p.x+sideX*offset,z=p.z+sideZ*offset;
      const uneven=(surface==='dirt'||surface==='gravel')?
        (.035*Math.sin(progress*.27+f*4.3)+.017*Math.sin(progress*.74-f*7.9)):0;
      vertices.push(x,roadDeckHeight(terrainY,x,z,offset,width)+uneven,z);
      uvs.push((offset+width*.5)/metresPerTile,progress/metresPerTile);
      const shade=tint(progress,offset,width,surface==='dry'?29:seed);
      colors.push(shade,shade*(.994+Math.sin(progress*.019)*.006),shade*.987);
    }
    for (const sign of [-1,1]) {
      const lateral=sign*width*.5;
      const x=p.x+sideX*lateral,z=p.z+sideZ*lateral;
      const top=roadDeckHeight(terrainY,x,z,lateral,width);
      sideVertices.push(x,top,z,x,top-.27,z);
      sideUvs.push(progress/metresPerTile,0,progress/metresPerTile,.27/metresPerTile);
    }
    if(i===samples.length-1)continue;
    for(let j=0;j<stride-1;j++){
      const a=i*stride+j,b=(i+1)*stride+j;
      indices.push(a,a+1,b,a+1,b+1,b);
    }
    for(let side=0;side<2;side++){
      const a=i*4+side*2,b=(i+1)*4+side*2;
      sideIndices.push(a,b,a+1,a+1,b,b+1);
    }
  }
  const top=new THREE.BufferGeometry();
  top.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  top.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  top.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  top.setIndex(indices);
  top.computeVertexNormals();
  top.userData.corsaRoadSurface=true;
  const sides=new THREE.BufferGeometry();
  sides.setAttribute('position',new THREE.Float32BufferAttribute(sideVertices,3));
  sides.setAttribute('uv',new THREE.Float32BufferAttribute(sideUvs,2));
  sides.setIndex(sideIndices);
  sides.computeVertexNormals();
  return {top,sides};
}

const sideMaterial = new THREE.MeshStandardMaterial({
  color:0x3d3d39,roughness:.97,metalness:0,side:THREE.DoubleSide
});
export function addRoadSides(scene, geometry, name) {
  const mesh=new THREE.Mesh(geometry,sideMaterial);
  mesh.name=name+' · Camada lateral de asfalto';
  mesh.receiveShadow=true;
  scene.add(mesh);
  return mesh;
}

let stamps;
function stamp(kind) {
  if(!stamps)stamps=new Map();
  if(stamps.has(kind))return stamps.get(kind);
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d');
  const bytes=ctx.createImageData(64,64),rng=seedRandom(kind==='skid'?721:kind==='dirt'?231:913);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const u=Math.abs((x-31.5)/31.5),v=Math.abs((y-31.5)/31.5),noise=rng();
    const edge=kind==='skid' ? Math.max(u*1.9,v*.78) :
      kind==='dirt' ? Math.max(u*.74,v*.92) : Math.max(u,v);
    const irregular=.13*Math.sin(x*.66+y*.23)+.075*Math.sin(y*.55-x*.29);
    const alpha=Math.max(0,Math.min(1,(1-edge+irregular)*4));
    const p=(y*64+x)*4;
    bytes.data[p]=bytes.data[p+1]=bytes.data[p+2]=255;
    bytes.data[p+3]=Math.round(255*alpha*(kind==='skid'?.34+.45*noise:.42+.55*noise));
  }
  ctx.putImageData(bytes,0,0);
  const tex=new THREE.CanvasTexture(canvas);
  tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  stamps.set(kind,tex);
  return tex;
}
function stampMesh(kind,count,color) {
  const geometry=new THREE.PlaneGeometry(1,1);
  geometry.rotateX(-Math.PI/2);
  const material=new THREE.MeshStandardMaterial({
    color,map:stamp(kind),transparent:true,opacity:kind==='skid'?.72:.79,
    roughness:.97,metalness:0,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    side:THREE.DoubleSide
  });
  const mesh=new THREE.InstancedMesh(geometry,material,count);
  mesh.receiveShadow=true;
  mesh.frustumCulled=true;
  return mesh;
}
export function addRoadWear(scene,samples,width,terrainY,quality='high',seed=21) {
  const rng=seedRandom(seed),n=samples.length-1;
  const low=quality==='low';
  const patchCount=Math.max(1,Math.floor(n/(low?118:47)));
  const skidGroups=Math.max(1,Math.floor(n/(low?136:83)));
  const dustGroups=Math.max(2,Math.floor(n/(low?28:13)));
  const patches=stampMesh('patch',patchCount,0x626362);
  const skids=stampMesh('skid',skidGroups*2,0x2c302e);
  const dirt=stampMesh('dirt',dustGroups*2,0x82745c);
  const transform=new THREE.Object3D();
  const put=(mesh,k,index,lateral,wide,long)=>{
    const p=centerOf(samples[index]);
    const t=tangentOf(samples,index);
    const dx=-t.z,dz=t.x;
    const x=p.x+dx*lateral,z=p.z+dz*lateral;
    transform.position.set(x,roadDeckHeight(terrainY,x,z,lateral,width)+.016,z);
    transform.rotation.set(0,Math.atan2(t.x,t.z),0);
    transform.scale.set(wide,1,long);
    transform.updateMatrix();
    mesh.setMatrixAt(k,transform.matrix);
  };
  for(let i=0;i<patchCount;i++){
    const index=Math.min(n-1,Math.floor((i+.38)*n/patchCount));
    put(patches,i,index,(rng()-.5)*width*.36,
      1.4+rng()*Math.min(3.9,width*.5),2.8+rng()*6.8);
  }
  for(let i=0;i<skidGroups;i++){
    const index=Math.min(n-1,Math.floor((i+.68)*n/skidGroups));
    const center=(rng()-.5)*width*.13;
    for(let side=0;side<2;side++)
      put(skids,i*2+side,index,center+(side?1:-1)*.73,
        .16+rng()*.05,5+rng()*9);
  }
  for(let i=0;i<dustGroups;i++){
    const index=Math.min(n-1,Math.floor((i+.31)*n/dustGroups));
    for(let side=0;side<2;side++)
      put(dirt,i*2+side,index,(side?1:-1)*(width*.5-.36),
        .85+rng()*.64,3.6+rng()*5);
  }
  for(const mesh of [patches,skids,dirt]){
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
  return {patches,skids,dirt};
}

// Three softly graded verge materials occupy the same mesh: dusty compacted
// gravel at the road, mixed mineral soil, and an irregular grass/earth edge.
// Vertex colours don't require extra draw calls; geometry follows terrain.
export function addRoadShoulders(scene,samples,width,terrainY,material) {
  const shoulders=[],bands=[.025,.68,1.50,2.35];
  const palette=[
    [.77,.76,.72], [.90,.85,.75], [.70,.65,.51], [.60,.63,.48]
  ];
  for(const sign of [-1,1]){
    const positions=[],uv=[],colors=[],indices=[];
    let distance=0;
    for(let i=0;i<samples.length;i++){
      const p=centerOf(samples[i]),t=tangentOf(samples,i);
      if(i>0){
        const prev=centerOf(samples[i-1]);
        distance+=Math.hypot(p.x-prev.x,p.z-prev.z);
      }
      const ripple=Math.sin(distance*.29+sign*3)*.10+
        Math.sin(distance*.74-sign*4)*.055;
      for(let j=0;j<bands.length;j++){
        const shift=j===3?ripple:j===2?ripple*.35:0;
        const off=sign*(width*.5+bands[j]+shift);
        const x=p.x-t.z*off,z=p.z+t.x*off;
        const lift=[.11,.085,.05,.018][j];
        const micro=Math.sin(distance*.34+j*2.3)*.012;
        positions.push(x,terrainY(x,z)+lift+micro,z);
        // Physical 2.2m/metre tiling instead of a smeared single texture
        // across the entire shoulder length.
        uv.push(distance/2.2,(bands[j]+shift)/2.2);
        const color=palette[j],shade=.95+.045*Math.sin(distance*.17+j*1.7);
        colors.push(color[0]*shade,color[1]*shade,color[2]*shade);
      }
      if(i<samples.length-1){
        const row=i*bands.length,next=row+bands.length;
        for(let j=0;j<bands.length-1;j++){
          // Both signs use the same double-sided material; winding is kept
          // consistent so computed normals face the sky.
          indices.push(row+j,next+j,row+j+1,
            row+j+1,next+j,next+j+1);
        }
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const shoulderMaterial=material.clone();
    shoulderMaterial.vertexColors=true;
    const shoulder=new THREE.Mesh(geometry,shoulderMaterial);
    shoulder.name='Berma natural · gravilha, terra e vegetação';
    shoulder.receiveShadow=true;
    scene.add(shoulder);shoulders.push(shoulder);
  }
  return shoulders;
}

// Gentle cut/fill of the actual visual + physics heightfield.
// The carriageway retains at least 14cm of separation from the soil.
export function roadsideTerrainDelta(distance,width){
  const edge=Math.max(0,distance-width*.5);
  const ease=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x);};
  if(edge<=1.4)return .065;
  if(edge<=4.5)return .065-.195*ease((edge-1.4)/3.1);
  if(edge<=9.5)return -.13*(1-ease((edge-4.5)/5));
  return 0;
}

// Natural roadside swales and cut/fill slopes. A draped five-band ribbon
// follows the road and reconnects to the real terrain at both outside edges.
// No separate terrain collider or invisible vertical concrete wall is added.
export function addRoadDrainage(scene,samples,width,terrainY,quality='high'){
  const channels=[];
  const bands=[2.2,3.15,4.1,5.35,7.2,9.1];
  const elevations=[.025,.10,.025,.012,.11,.015];
  const palette=[
    [.72,.68,.54],[.75,.71,.57],[.49,.46,.36],
    [.39,.43,.32],[.61,.61,.46],[.54,.60,.43]
  ];
  for(const sign of [-1,1]){
    const coords=[],uvs=[],colors=[],triangles=[];
    let progress=0;
    for(let i=0;i<samples.length;i++){
      const p=centerOf(samples[i]),t=tangentOf(samples,i);
      if(i>0){
        const previous=centerOf(samples[i-1]);
        progress+=Math.hypot(p.x-previous.x,p.z-previous.z);
      }
      const irregular=.12*Math.sin(progress*.12+sign*3.8)+
        .065*Math.sin(progress*.53+sign*2);
      for(let j=0;j<bands.length;j++){
        const spread=j===0?0:irregular*(j/5);
        const lateral=sign*(width*.5+bands[j]+spread);
        const x=p.x-t.z*lateral,z=p.z+t.x*lateral;
        // All levels remain on or above the underlying world collider. The
        // lowered centre relative to the banks reads as a shallow ditch.
        const height=elevations[j]+
          (j===4?.028*Math.sin(progress*.18+sign):0);
        coords.push(x,terrainY(x,z)+height,z);
        uvs.push((bands[j]+spread)/2.8,progress/2.8);
        const tint=.93+.05*Math.sin(progress*.19+j*2.1);
        colors.push(...palette[j].map(value=>value*tint));
      }
      if(i<samples.length-1){
        const a=i*bands.length,b=a+bands.length;
        for(let j=0;j<bands.length-1;j++){
          triangles.push(a+j,b+j,a+j+1,a+j+1,b+j,b+j+1);
        }
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.setIndex(triangles);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.userData.corsaDrainage=true;
    const mat=new THREE.MeshStandardMaterial({
      color:0xffffff,vertexColors:true,roughness:.98,
      side:THREE.DoubleSide
    });
    const mesh=new THREE.Mesh(geometry,mat);
    mesh.name='Valeta natural · talude e drenagem '+(sign>0?'direita':'esquerda');
    mesh.receiveShadow=true;
    scene.add(mesh);channels.push(mesh);
  }
  return channels;
}
