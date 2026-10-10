import * as THREE from 'three';

// Small, deterministic procedural scenery pieces. Shapes are shared across
// InstancedMesh batches, avoiding one draw call per flower, bush or stone.
const TAU=Math.PI*2;
function seeded(value){
  let n=value>>>0;
  return ()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);
}
function meshGeometry(positions,indices,colors){
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
export function createNaturalShrubGeometry(detail='medium'){
  const rng=seeded(74219);
  const positions=[],colors=[],indices=[];
  const leaves=detail==='low'?18:detail==='high'?46:30;
  const palette=[[.34,.44,.26],[.26,.40,.24],[.39,.46,.29],[.24,.35,.22],[.45,.46,.30]];
  const vertex=(x,y,z,color)=>{
    positions.push(x,y,z);colors.push(...color);return positions.length/3-1;
  };
  // Small crossing stems are part of the same geometry, not standalone cones.
  for(let b=0;b<9;b++){
    const angle=b*TAU/9+rng()*.27,spread=.19+.23*rng();
    const base=vertex(.015*Math.cos(angle),.02,.015*Math.sin(angle),[.29,.24,.17]);
    const tip=vertex(Math.cos(angle)*spread,.46+.44*rng(),
      Math.sin(angle)*spread,[.40,.34,.21]);
    const breadth=.016;
    const l=vertex(Math.cos(angle)*spread+breadth,.31,
      Math.sin(angle)*spread,[.31,.28,.19]);
    indices.push(base,l,tip);
  }
  for(let leaf=0;leaf<leaves;leaf++){
    const angle=rng()*TAU;
    const elevation=.35+rng()*.66;
    const horizontal=Math.pow(rng(),.58)*(.42+.26*Math.sin(elevation*2.2));
    const center=new THREE.Vector3(Math.cos(angle)*horizontal,elevation,
      Math.sin(angle)*horizontal);
    const size=.12+rng()*.17;
    const az=angle+.18*(rng()-.5);
    const right=new THREE.Vector3(-Math.sin(az),.06+(.22*rng()),Math.cos(az)).normalize();
    const up=new THREE.Vector3(.18*Math.cos(az),.84+.2*rng(),.18*Math.sin(az)).normalize();
    const normal=new THREE.Vector3().crossVectors(right,up).normalize();
    const c=palette[Math.floor(rng()*palette.length)];
    const shade=.82+.22*rng();
    const color=c.map(v=>v*shade);
    // Leaf fans have a central ridge, non-planar tips and individually varied
    // lateral folds. Double-sided foliage stays legible from either side.
    const a=center.clone().addScaledVector(up,-size*.85);
    const mid=center.clone().addScaledVector(normal,size*.22);
    const left=center.clone().addScaledVector(right,-size*.65);
    const rightPoint=center.clone().addScaledVector(right,size*.62);
    const tip=center.clone().addScaledVector(up,size*1.16)
      .addScaledVector(normal,size*.09);
    const begin=positions.length/3;
    for(const p of [a,left,mid,rightPoint,tip])vertex(p.x,p.y,p.z,color);
    indices.push(begin,begin+1,begin+2,begin,begin+2,begin+3,
      begin+1,begin+4,begin+2,begin+2,begin+4,begin+3);
  }
  const g=meshGeometry(positions,indices,colors);
  g.userData.corsaNatural='leafy-shrub';
  return g;
}

export function createNaturalFlowerGeometry(){
  const positions=[],indices=[],colors=[];
  const rng=seeded(9701);
  const green=[.65,.62,.40],pale=[.92,.89,.73];
  function add(x,y,z,c){positions.push(x,y,z);colors.push(...c);return positions.length/3-1;}
  // Five curved, overlapping petals with a slightly raised core, not an
  // icosahedron painted a bright solid colour.
  for(let i=0;i<5;i++){
    const angle=i*TAU/5,ca=Math.cos(angle),sa=Math.sin(angle);
    const tangent=new THREE.Vector3(-sa,0,ca);
    const outward=new THREE.Vector3(ca,0,sa);
    const center=new THREE.Vector3(0,.01,0);
    const pt1=center.clone().addScaledVector(outward,.095)
      .addScaledVector(tangent,.044);
    const pt2=center.clone().addScaledVector(outward,.17)
      .addScaledVector(tangent,-.061);
    const pt3=center.clone().addScaledVector(outward,.205);
    pt1.y=.03;pt2.y=.047;pt3.y=.068;
    const idx=positions.length/3;
    for(const p of [center,pt1,pt3,pt2])add(p.x,p.y,p.z,pale);
    indices.push(idx,idx+1,idx+2,idx,idx+2,idx+3);
  }
  const c=add(0,.105,0,green);
  for(let i=0;i<8;i++){
    const a=i*TAU/8;
    const j=add(Math.cos(a)*.038,.079+.006*rng(),Math.sin(a)*.038,green);
    if(i>0)indices.push(c,j-1,j);
  }
  indices.push(c,positions.length/3-1,c+1);
  const g=meshGeometry(positions,indices,colors);
  g.userData.corsaNatural='flower-petals';
  return g;
}

export function createWeatheredRockGeometry(detail=2){
  const geometry=new THREE.IcosahedronGeometry(1,Math.max(1,Math.min(3,detail)));
  const p=geometry.getAttribute('position');
  const colors=[];
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const strata=Math.sin(y*9.2+z*1.7);
    const surface=Math.sin(x*12.8+Math.sin(z*4.3))*
      Math.cos(z*8.7-y*2.1);
    const chip=Math.abs(Math.sin(x*19+z*13+y*6));
    const displacement=1+.12*strata+.10*surface-.085*chip;
    p.setXYZ(i,x*displacement,y*displacement,z*displacement);
    const band=.68+.12*strata+.09*surface;
    colors.push(band*.84,band*.88,band*.83);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.corsaNatural='weathered-rock';
  return geometry;
}

// A shared façade kit: 3D framed windows with individual glazing, projecting
// window sills, doors and roof parapets. Physics colliders remain on the
// original building shells; these additions are purely visual.
export class UrbanFacadeBatch{
  constructor(scene){
    this.scene=scene;
    this.pending={frame:[],pane:[],sill:[],parapet:[],door:[]};
    this.meshes=[];
    this.materials={
      frame:new THREE.MeshStandardMaterial({color:0xaca9a0,roughness:.83,metalness:.03}),
      pane:new THREE.MeshPhysicalMaterial({color:0x354a52,metalness:.13,roughness:.25,
        clearcoat:.48,clearcoatRoughness:.15,vertexColors:false}),
      sill:new THREE.MeshStandardMaterial({color:0x747b79,roughness:.86}),
      parapet:new THREE.MeshStandardMaterial({color:0x767877,roughness:.97}),
      door:new THREE.MeshStandardMaterial({color:0x343d40,roughness:.7,metalness:.11})
    };
    this.windowCount=0;
    this.buildingCount=0;
  }
  place(kind,x,y,z,w,h,d,rotation=0,color=null){
    this.pending[kind].push({x,y,z,w,h,d,rotation,color});
  }
  building({x,z,baseY,width,height,depth,seed=0}){
    this.buildingCount++;
    const floors=Math.max(1,Math.floor((height-1.8)/3.35));
    const floorSize=(height-1.7)/floors;
    const longColumns=Math.max(2,Math.floor(width/3.2));
    const shortColumns=Math.max(2,Math.floor(depth/3.5));
    const faces=[
      {front:true,depth:depth/2,width,columns:longColumns,rot:0},
      {front:true,depth:-depth/2,width,columns:longColumns,rot:Math.PI},
      {front:false,depth:width/2,width:depth,columns:shortColumns,rot:Math.PI/2},
      {front:false,depth:-width/2,width:depth,columns:shortColumns,rot:-Math.PI/2}
    ];
    for(const face of faces){
      for(let floor=0;floor<floors;floor++){
        const y=baseY+1.9+(floor+.5)*floorSize;
        for(let col=0;col<face.columns;col++){
          // Deterministic 5% variation in glazing to avoid identical towers.
          if((col*17+floor*11+seed*3)%21===0)continue;
          const side=(col+.5-face.columns*.5)*(face.width/face.columns);
          const px=face.front?x+Math.cos(face.rot)*side:
            x+Math.sin(face.rot)*face.depth;
          const pz=face.front?z+Math.cos(face.rot)*face.depth:
            z-Math.sin(face.rot)*side;
          const push=.13;
          const nx=Math.sin(face.rot),nz=Math.cos(face.rot);
          const ww=Math.min(1.45,face.width/face.columns*.6),hh=Math.min(2.05,floorSize*.64);
          this.place('frame',px+nx*push,y,pz+nz*push,ww+.18,hh+.17,.11,face.rot);
          this.place('pane',px+nx*(push+.067),y,pz+nz*(push+.067),ww,hh,.04,face.rot);
          this.place('sill',px+nx*(push+.1),y-hh*.5-.1,pz+nz*(push+.1),
            ww+.36,.10,.28,face.rot);
          this.windowCount++;
        }
      }
    }
    this.place('door',x,baseY+1.18,z+depth*.5+.17,1.6,2.32,.13,0);
    // Flat roofs gain a real silhouette and skylines no longer end in a
    // perfectly smooth cuboid edge.
    const roofY=baseY+height+.24;
    for(const dz of [-depth*.5,depth*.5])
      this.place('parapet',x,roofY,z+dz,width+.45,.48,.32,0);
    for(const dx of [-width*.5,width*.5])
      this.place('parapet',x+dx,roofY,z,.32,.48,depth+.45,0);
  }
  finalize(){
    const geometry=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();
    this.geometry=geometry;
    for(const [kind,placements] of Object.entries(this.pending)){
      if(!placements.length)continue;
      const mesh=new THREE.InstancedMesh(geometry,this.materials[kind],placements.length);
      mesh.name='Fachadas detalhadas · '+kind;
      for(let i=0;i<placements.length;i++){
        const p=placements[i];
        dummy.position.set(p.x,p.y,p.z);
        dummy.rotation.set(0,p.rotation,0);
        dummy.scale.set(p.w,p.h,p.d);
        dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
      mesh.castShadow=kind==='parapet';
      mesh.receiveShadow=true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    return this;
  }
  dispose(){
    for(const mesh of this.meshes)this.scene.remove(mesh);
    this.geometry?.dispose();
    for(const mat of Object.values(this.materials))mat.dispose();
    this.meshes.length=0;
  }
}
