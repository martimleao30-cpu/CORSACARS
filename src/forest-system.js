import * as THREE from 'three';

// Procedural forest: geometry prototypes shared across spatially culled, instanced
// batches. High-detail meshes are created ONLY when a chunk enters the near LOD.
export const FOREST_LOD = Object.freeze([125, 300, 570, 1020]);
export const TREE_SPECIES = Object.freeze(['oak', 'birch', 'pine']);
export const TREE_AGES = Object.freeze(['young', 'adult', 'ancient']);
const TAU = 2*Math.PI;
const cap = (x,a,b)=>Math.max(a,Math.min(b,x));
function rng(seed) {
  let s=seed>>>0;
  return ()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);
}
function mix(a,b,t){return a+(b-a)*t;}
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);

function geometryBuffer(pos,uv,col,weights,index){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.setAttribute('aWindWeight',new THREE.Float32BufferAttribute(weights,1));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function builder(){
  const p=[],u=[],c=[],w=[],ix=[];
  return {
    append(vertices,uvs,colors,weights,indices){
      const base=p.length/3;
      p.push(...vertices);u.push(...uvs);c.push(...colors);w.push(...weights);
      for(const j of indices)ix.push(base+j);
    },
    build(){return geometryBuffer(p,u,c,w,ix);}
  };
}

// Longitudinal ridges produce irregular bark and a tapered, rooted trunk.
// Each independent branch has a meaningful tube cross-section and joins a
// further generation of secondary twigs.
function woodTube(out,a,b,r0,r1,detail,seed,height,baseTint){
  const axis=b.clone().sub(a),length=axis.length();
  if(length<.02)return;
  const direction=axis.normalize();
  const tangent=V(0,1,0);
  if(Math.abs(tangent.dot(direction))>.93)tangent.set(1,0,0);
  const side=V().crossVectors(direction,tangent).normalize();
  const other=V().crossVectors(direction,side).normalize();
  const radial=Math.max(4,detail),rings=detail>=10?5:detail>=7?3:2;
  const pos=[],uv=[],colors=[],weights=[],indices=[];
  for(let ring=0;ring<=rings;ring++){
    const t=ring/rings,center=a.clone().lerp(b,t);
    const width=mix(r0,r1,t);
    for(let k=0;k<=radial;k++){
      const theta=(k/radial)*TAU;
      const ridge=1+.075*Math.sin(theta*7+seed*3.7+t*2.4)+
        .035*Math.cos(theta*13+t*5.3+seed);
      const bark=width*ridge*(1+.018*Math.sin(t*19+theta*5));
      const point=center.clone().addScaledVector(side,Math.cos(theta)*bark)
        .addScaledVector(other,Math.sin(theta)*bark);
      pos.push(point.x,point.y,point.z);
      uv.push(k/radial*(1+r0),t*length/2.1);
      const brightness=baseTint*(.86+.13*Math.sin(theta*8+seed)+.065*Math.cos(t*22+theta*2));
      colors.push(brightness,brightness*.94,brightness*.85);
      weights.push(cap((center.y-1.2)/Math.max(3,height)*.24,0,.23));
      if(ring<rings&&k<radial){
        const first=ring*(radial+1)+k,next=first+radial+1;
        indices.push(first,next,first+1,first+1,next,next+1);
      }
    }
  }
  out.append(pos,uv,colors,weights,indices);
}

function leafCluster(out,center,radius,number,random,colors,kind='oak',intensity=1){
  const positions=[],uv=[],colorsOut=[],wind=[],indices=[];
  for(let i=0;i<number;i++){
    const angle=random()*TAU;
    const phi=Math.acos(mix(-1,1,random()));
    const nx=Math.sin(phi)*Math.cos(angle),ny=Math.cos(phi),nz=Math.sin(phi)*Math.sin(angle);
    const cx=center.x+nx*radius.x*(.42+.61*random());
    const cy=center.y+ny*radius.y*(.45+.62*random());
    const cz=center.z+nz*radius.z*(.43+.63*random());
    const size=(kind==='birch'?.18:kind==='pine'?.28:.29)*(.65+random()*.9)*intensity;
    const normal=V(nx+(random()-.5)*.48,ny+(random()-.5)*.45,nz+(random()-.5)*.48).normalize();
    const tangent=V().crossVectors(normal,V(0,1,0));
    if(tangent.lengthSq()<.02)tangent.set(1,0,0);
    tangent.normalize();
    const vertical=V().crossVectors(normal,tangent).normalize();
    const base=positions.length/3;
    const centerColor=colors[Math.floor(random()*colors.length)];
    // A leaf has its own 3D midrib, with two raised wings: six triangles.
    const vertices=[
      [-.10,-.98,0],[-.64,-.19,-.04],[0,.02,.14],
      [.64,-.19,-.04],[-.54,.63,0],[.53,.63,0],[.04,1.05,.07]
    ];
    for(let j=0;j<vertices.length;j++){
      const [sx,sy,bend]=vertices[j];
      const pos=V(cx,cy,cz).addScaledVector(tangent,sx*size)
        .addScaledVector(vertical,sy*size*1.55)
        .addScaledVector(normal,bend*size);
      positions.push(pos.x,pos.y,pos.z);
      uv.push(.5+sx*.5,(sy+1)/2.1);
      const shade=.78+.22*(sy+1)*.5+.075*(random()-.5);
      colorsOut.push(centerColor[0]*shade,centerColor[1]*shade,centerColor[2]*shade);
      wind.push(.7+Math.max(0,cy)*.085+Math.max(0,sy)*.25);
    }
    indices.push(base,base+1,base+2,base,base+2,base+3,
      base+1,base+4,base+2,base+3,base+2,base+5,
      base+2,base+4,base+6,base+2,base+6,base+5);
  }
  out.append(positions,uv,colorsOut,wind,indices);
}

function lowCrown(out,height,radius,species,random,lod){
  const positions=[],uv=[],colors=[],weights=[],indices=[];
  const levels=lod===3?2:4,sections=lod===3?5:8;
  const green=species==='pine'?[.18,.27,.13]:species==='birch'?[.29,.44,.19]:[.27,.40,.17];
  const canopyTop=height*(species==='pine'?.97:1.04);
  const canopyBase=species==='pine'?height*.22:height*.43;
  for(let ring=0;ring<=levels;ring++){
    const t=ring/levels;
    const y=canopyBase+(canopyTop-canopyBase)*t;
    const radial=species==='pine'? radius*(1-t*.91) :
      radius*Math.pow(Math.max(.05,Math.sin(Math.PI*(t*.85+.09))),.58);
    for(let j=0;j<=sections;j++){
      const theta=j/sections*TAU;
      const irregular=.9+.14*Math.sin(theta*3+height)+.06*Math.sin(theta*7+height);
      positions.push(Math.cos(theta)*radial*irregular,y,Math.sin(theta)*radial*irregular);
      uv.push(j/sections,t);
      const shade=.77+.23*Math.sin(theta*.8+height)+.1*random();
      colors.push(...green.map(v=>v*shade));
      weights.push(.4+t*.73);
      if(ring<levels&&j<sections){
        const a=ring*(sections+1)+j,b=a+sections+1;
        indices.push(a,b,a+1,a+1,b,b+1);
      }
    }
  }
  out.append(positions,uv,colors,weights,indices);
}

function prototype(species,age,lod){
  const random=rng(412+TREE_SPECIES.indexOf(species)*735+TREE_AGES.indexOf(age)*163);
  const ageScale={young:.66,adult:1,ancient:1.39}[age];
  const height=(species==='pine'?11:species==='birch'?9.7:8.9)*ageScale;
  const crownRadius=(species==='pine'?2.8:species==='birch'?2.75:3.65)*ageScale;
  const width=(species==='birch'?.26:species==='pine'?.34:.47)*ageScale;
  const woody=builder(),foliage=builder();
  if(lod===3){
    woodTube(woody,V(0,-.08,0),V(0,height*.68,0),width,width*.17,5,4,height,species==='birch'?.88:.65);
    lowCrown(foliage,height,crownRadius,species,random,3);
  }else if(lod===2){
    woodTube(woody,V(0,-.08,0),V(0,height*.8,0),width,width*.09,6,8,height,species==='birch'?.88:.65);
    lowCrown(foliage,height,crownRadius,species,random,2);
  }else{
    const barkSides=lod===0?14:8;
    const barkColor=species==='birch'?.95:species==='pine'?.52:.58;
    const top=V((random()-.5)*.52,height*.91,(random()-.5)*.52);
    woodTube(woody,V(0,-.15,0),top,width,width*.055,barkSides,19,height,barkColor);
    const bigBranches=lod===0?(species==='pine'?13:11):(species==='pine'?7:6);
    const ends=[];
    for(let b=0;b<bigBranches;b++){
      const angle=b*2.399+random()*.38;
      const origin=height*(.31+(b%5)*.105+random()*.052);
      const start=V(0,origin,0);
      const spread=(species==='pine'?1.2:1.75)*(origin/height<.48?1.15:.87);
      const dir=V(Math.cos(angle),0,Math.sin(angle));
      const tip=V(dir.x*crownRadius*spread*(.4+.3*random()),
        origin+height*(species==='pine'?.11:.17)+random()*height*.07,
        dir.z*crownRadius*spread*(.4+.3*random()));
      if(tip.y>height*1.02)tip.y=height*.99;
      woodTube(woody,start,tip,width*(.33+(1-origin/height)*.16),
        width*.065,lod===0?8:5,b+3,height,barkColor*.87);
      const subCount=lod===0?3:1;
      for(let s=0;s<subCount;s++){
        const mid=start.clone().lerp(tip,.59+s*.11);
        const twig=tip.clone().add(V(
          (random()-.5)*crownRadius*.48,
          height*(.045+random()*.08),
          (random()-.5)*crownRadius*.48
        ));
        woodTube(woody,mid,twig,width*.07,width*.019,lod===0?5:4,b*5+s,height,barkColor*.92);
        ends.push(twig);
      }
      ends.push(tip);
    }
    if(lod===0){
      for(let i=0;i<6;i++){
        const t=i*TAU/6+random()*.2;
        woodTube(woody,V(Math.cos(t)*width*.58,-.01,Math.sin(t)*width*.58),
          V(Math.cos(t)*width*2.5,.17,Math.sin(t)*width*2.5),
          width*.29,.015,6,20+i,height,barkColor*.8);
      }
    }
    const leafPalette=species==='oak'?[[.28,.48,.19],[.37,.51,.24],[.21,.39,.17],[.48,.55,.26]]:
      species==='birch'?[[.37,.53,.21],[.44,.58,.26],[.25,.44,.19]]:
      [[.17,.33,.19],[.22,.37,.18],[.26,.4,.2]];
    const perEnd=lod===0?(species==='pine'?10:12):(species==='pine'?5:6);
    for(const e of ends){
      const scales=species==='pine'?V(.64,.94,.64):V(.87,.74,.88);
      const rad=scales.multiplyScalar(crownRadius*(lod===0?.37:.47));
      leafCluster(foliage,e,rad,perEnd,random,leafPalette,species);
    }
    leafCluster(foliage,V(0,height*.86,0),V(crownRadius*.63,height*.19,crownRadius*.63),
      lod===0?100:32,random,leafPalette,species);
  }
  const wood=woody.build(),leaves=foliage.build();
  // Flexible young shoots, moderately rigid adult crowns and comparatively
  // stable old trunks. Pines additionally resist sway more than broadleaf.
  const ageResponse=age==='young'?1.23:age==='ancient'?.62:1;
  const speciesResponse=species==='pine'?.76:species==='birch'?1.12:1;
  const response=ageResponse*speciesResponse;
  for(const geometry of [wood,leaves]){
    const weights=geometry.getAttribute('aWindWeight');
    for(let i=0;i<weights.count;i++)weights.setX(i,weights.getX(i)*response);
    weights.needsUpdate=true;
  }
  return {wood,leaves,height,crownRadius};
}

function canvasTexture(kind){
  if(typeof document==='undefined'||!document.createElement)return null;
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=256;
  const context=canvas.getContext('2d');
  if(!context?.createImageData||!context?.putImageData)return null;
  const image=context.createImageData(256,256),random=rng(kind==='bark'?11987:7238);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const n=random(),p=(y*256+x)*4;
    if(kind==='bark'){
      const seam=Math.sin(x*.24+Math.sin(y*.018)*3)+.45*Math.sin(x*.87+y*.018);
      const groove=seam<-.77?-.42:0;
      const value=cap(113+36*seam+groove*75+(n-.5)*32,27,195);
      image.data[p]=value;image.data[p+1]=value*.84;image.data[p+2]=value*.69;
      image.data[p+3]=255;
    }else{
      const u=(x-128)/128,v=(y-128)/128;
      const width=(.87-Math.abs(v)*.56)*(1+.08*Math.sin(v*17));
      const edge=1-Math.abs(u)/Math.max(.02,width);
      const allowed=Math.abs(v)<.94&&edge>.025;
      const veins=Math.abs(u-.15*Math.sin(v*7))<.018 ? .2 : 0;
      const shade=cap(.6+.4*(1-v)*.5+veins+.08*n,0,1);
      image.data[p]=Math.round(190*shade);
      image.data[p+1]=Math.round(223*shade);
      image.data[p+2]=Math.round(151*shade);
      image.data[p+3]=allowed?255:0;
    }
  }
  context.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.anisotropy=4;
  return texture;
}

function makeMaterials(wind){
  const barkTexture=canvasTexture('bark'),leafTexture=canvasTexture('leaves');
  const bark=new THREE.MeshStandardMaterial({
    color:0xd0c7b6,roughness:.98,metalness:0,map:barkTexture||null,
    vertexColors:true,side:THREE.DoubleSide
  });
  // Bark normal relief without loading any external image.
  if(barkTexture){bark.bumpMap=barkTexture;bark.bumpScale=.045;}
  const leaves=new THREE.MeshStandardMaterial({
    color:0xffffff,roughness:.82,metalness:0,vertexColors:true,
    map:leafTexture||null,alphaTest:.48,transparent:false,
    side:THREE.DoubleSide,depthWrite:true
  });
  const windShader=(material,flutter)=>{
    material.onBeforeCompile=shader=>{
      shader.uniforms.uForestTime=wind.time;
      shader.uniforms.uForestWind=wind.strength;
      shader.uniforms.uForestFlutter=wind.flutter;
      shader.vertexShader=shader.vertexShader.replace('#include <common>',
        '#include <common>\nattribute float aWindWeight;\nuniform float uForestTime;\nuniform float uForestWind;\nuniform float uForestFlutter;');
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        'float forestPhase = instanceMatrix[3].x * .033 + instanceMatrix[3].z * .041;\n' +
        'float sway = sin(uForestTime * 1.18 + forestPhase + position.y * .19);\n' +
        'transformed.x += sway * aWindWeight * uForestWind;\n' +
        'transformed.z += cos(uForestTime * .88 + forestPhase) * aWindWeight * uForestWind * .58;\n' +
        (flutter ? 'transformed.y += sin(uForestTime * 3.7 + forestPhase * 1.3 + position.x * 8.1) * uForestFlutter * aWindWeight;\n':''));
    };
    material.customProgramCacheKey=()=>flutter?'corsaforest-foliage-v1':'corsaforest-branches-v1';
  };
  // Far silhouettes have their own opaque vertex-coloured material: the
  // detailed leaf alpha stamp must not perforate the coarsened LOD2/LOD3 mesh.
  const distantLeaves=new THREE.MeshStandardMaterial({
    color:0xffffff,roughness:.93,metalness:0,vertexColors:true,
    side:THREE.DoubleSide
  });
  windShader(bark,false);
  windShader(leaves,true);
  windShader(distantLeaves,false);
  return {bark,leaves,distantLeaves,barkTexture,leafTexture};
}

export class ForestSystem {
  constructor(scene,options={}){
    this.scene=scene;
    this.quality=options.quality||'high';
    this.terrainY=options.terrainY||(()=>0);
    this.distanceToRoad=options.distanceToRoad||(()=>Infinity);
    this.isNearRoad=options.isNearRoad||(()=>false);
    this.density=1;
    this.cellSize=190;
    this.chunks=new Map();
    this.prototypes=new Map();
    this.wind={time:{value:0},strength:{value:0},flutter:{value:0}};
    this.materials=makeMaterials(this.wind);
    this.statistics={planted:0,species:{oak:0,birch:0,pine:0},
      ages:{young:0,adult:0,ancient:0},active:0,lod:[0,0,0,0],loadedDetailChunks:0};
    this.generate(options.seed??4812);
    this.frustum=new THREE.Frustum();
    this.projection=new THREE.Matrix4();
    this.testSphere=new THREE.Sphere();
    this.elapsedSinceCull=100;
    this.weather='clear';
  }

  generate(seed){
    const random=rng(seed);
    const extent=optionsExtent(this.quality);
    const max={low:300,medium:480,high:770,ultra:1020}[this.quality]||770;
    const spacing=this.quality==='ultra'?32:36;
    let planted=0;
    for(let x=-extent;x<extent&&planted<max;x+=spacing){
      for(let z=-extent;z<extent&&planted<max;z+=spacing){
        const px=x+(random()-.5)*spacing*.84,pz=z+(random()-.5)*spacing*.84;
        const patch=.57+.34*Math.sin(px*.0083+Math.cos(pz*.0071))*
          Math.cos(pz*.0103+Math.sin(px*.012));
        if(random()>patch)continue;
        if(this.distanceToRoad(px,pz)<23||this.isNearRoad(px,pz))continue;
        if(px>34&&px<285&&pz>-95&&pz<230)continue; // inhabited town
        const altitude=this.terrainY(px,pz);
        const incline=Math.abs(this.terrainY(px+3,pz)-this.terrainY(px-3,pz))+
          Math.abs(this.terrainY(px,pz+3)-this.terrainY(px,pz-3));
        if(incline>6.5&&random()<.75)continue;
        const species=altitude>17?random()<.66?'pine':'birch':
          random()<.31?'pine':random()<.57?'oak':'birch';
        const roll=random();
        const age=roll<.24?'young':roll<.81?'adult':'ancient';
        const scale=(.82+.32*random())*(species==='pine'?1.12:1);
        const id=species+':'+age;
        const ix=Math.floor(px/this.cellSize),iz=Math.floor(pz/this.cellSize);
        const key=ix+','+iz;
        if(!this.chunks.has(key)){
          const centerX=(ix+.5)*this.cellSize,centerZ=(iz+.5)*this.cellSize;
          const chunk={key,x:centerX,z:centerZ,centerY:this.terrainY(centerX,centerZ),
            items:[],cache:new Map(),lod:-1};
          this.chunks.set(key,chunk);
        }
        this.chunks.get(key).items.push({x:px,y:altitude,z:pz,yaw:random()*TAU,scale,id});
        planted++;
        this.statistics.species[species]++;
        this.statistics.ages[age]++;
      }
    }
    this.statistics.planted=planted;
  }

  getPrototype(id,lod){
    const key=id+':'+lod;
    if(!this.prototypes.has(key)){
      const [species,age]=id.split(':');
      this.prototypes.set(key,prototype(species,age,lod));
    }
    return this.prototypes.get(key);
  }

  makeChunkLod(chunk,lod){
    if(chunk.cache.has(lod))return chunk.cache.get(lod);
    const group=new THREE.Group();
    group.name='Forest '+chunk.key+' LOD '+lod;
    const batches=new Map();
    for(const item of chunk.items){
      if(!batches.has(item.id))batches.set(item.id,[]);
      batches.get(item.id).push(item);
    }
    const object=new THREE.Object3D();
    for(const [id,items] of batches){
      const model=this.getPrototype(id,lod);
      for(const kind of ['wood','leaves']){
        const geometry=model[kind];
        const material=kind==='wood'?this.materials.bark:(lod>=2?this.materials.distantLeaves:this.materials.leaves);
        const mesh=new THREE.InstancedMesh(geometry,material,items.length);
        mesh.name=id+' '+kind+' LOD '+lod;
        mesh.castShadow=this.quality!=='low'&&lod<=1;
        mesh.receiveShadow=lod<=1;
        for(let i=0;i<items.length;i++){
          const p=items[i];
          object.position.set(p.x,p.y,p.z);
          object.rotation.set(0,p.yaw,0);
          object.scale.setScalar(p.scale);
          object.updateMatrix();
          mesh.setMatrixAt(i,object.matrix);
        }
        mesh.instanceMatrix.needsUpdate=true;
        mesh.computeBoundingSphere();
        mesh.frustumCulled=true;
        group.add(mesh);
      }
    }
    group.visible=false;
    this.scene.add(group);
    chunk.cache.set(lod,group);
    if(lod===0)this.statistics.loadedDetailChunks++;
    return group;
  }

  setDensity(ratio){
    this.density=cap(Number(ratio)||1,.2,1);
    // Chunks retain their original instances; their bounded density is applied
    // to every mesh without rebuilding or reallocating geometry.
    for(const chunk of this.chunks.values())for(const group of chunk.cache.values()){
      for(const mesh of group.children){
        mesh.count=Math.floor(mesh.instanceMatrix.count*this.density);
      }
    }
  }

  update(camera,dt=1/60,weather='clear',paused=false){
    const frame=paused?0:Math.min(Math.max(dt,0),.1);
    this.wind.time.value+=frame;
    this.weather=weather;
    const gust=1+.3*Math.sin(this.wind.time.value*.28)+.15*Math.sin(this.wind.time.value*.73);
    const weatherStrength=weather==='rain'?1.55:weather==='fog'?.45:1;
    this.wind.strength.value=.12*weatherStrength*gust;
    this.wind.flutter.value=.017*weatherStrength*gust;
    const foliageLight=weather==='rain'?.78:weather==='fog'?.89:1;
    this.materials.leaves.color.setScalar(foliageLight);
    this.materials.distantLeaves.color.setScalar(foliageLight);
    if(!camera)return;
    this.elapsedSinceCull+=dt;
    if(this.elapsedSinceCull<.16)return;
    this.elapsedSinceCull=0;
    camera.updateMatrixWorld();
    this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    const factor=this.quality==='low'?.62:this.quality==='medium'?.81:1;
    const maxDistance=FOREST_LOD[3]*factor;
    this.statistics.active=0;
    this.statistics.lod.fill(0);
    for(const chunk of this.chunks.values()){
      const dx=chunk.x-camera.position.x,dz=chunk.z-camera.position.z;
      const distance=Math.max(0,Math.hypot(dx,dz)-this.cellSize*.55);
      this.testSphere.center.set(chunk.x,chunk.centerY+7,chunk.z);
      this.testSphere.radius=this.cellSize*.88+24;
      let desired=-1;
      if(distance<maxDistance&&this.frustum.intersectsSphere(this.testSphere)){
        desired=distance<FOREST_LOD[0]*factor?0:
          distance<FOREST_LOD[1]*factor?1:
          distance<FOREST_LOD[2]*factor?2:3;
      }
      if(chunk.lod===desired)continue;
      if(chunk.lod>=0)chunk.cache.get(chunk.lod).visible=false;
      chunk.lod=desired;
      if(desired>=0){
        const group=this.makeChunkLod(chunk,desired);
        group.visible=true;
        for(const mesh of group.children){
          mesh.count=Math.floor(mesh.instanceMatrix.count*this.density);
        }
      }
    }
    for(const chunk of this.chunks.values())if(chunk.lod>=0){
      this.statistics.active+=chunk.items.length;
      this.statistics.lod[chunk.lod]+=chunk.items.length;
    }
  }

  dispose(){
    for(const chunk of this.chunks.values())
      for(const group of chunk.cache.values())this.scene.remove(group);
    for(const proto of this.prototypes.values()){
      proto.wood.dispose();proto.leaves.dispose();
    }
    for(const material of [this.materials.bark,this.materials.leaves,this.materials.distantLeaves])material.dispose();
    this.materials.barkTexture?.dispose();
    this.materials.leafTexture?.dispose();
    this.chunks.clear();this.prototypes.clear();
  }
}
function optionsExtent(quality){return quality==='low'?690:quality==='medium'?780:875;}
