import * as THREE from 'three';
import {createNaturalShrubGeometry,createNaturalFlowerGeometry} from './natural-assets.js';
import {createMeadowTuftGeometry,createMeadowWindMaterial,meadowProfile} from './meadow-grass.js';

function rng(seed){let s=seed>>>0;return ()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);}
export class WildGroundcover{
  constructor(scene,terrainY,clearance,railway,quality='high'){
    this.scene=scene;this.terrainY=terrainY;this.clearance=clearance;
    this.railway=railway;this.quality=quality;this.chunks=[];
    this.density=1;this.materials=[];this.geometries=[];this.winds=[];
    this.statistics={shrubs:0,flowerPatches:0,meadow:0,tiles:0};
    this.build();
  }
  build(){
    const random=rng(20261018),size=145;
    const max={
      low:{shrub:680,flower:600,grass:4500},
      medium:{shrub:1280,flower:1050,grass:9000},
      high:{shrub:2080,flower:1510,grass:19000},
      ultra:{shrub:2910,flower:2130,grass:32000}
    }[this.quality]||{shrub:2080,flower:1510,grass:19000};
    const shrubGeo=createNaturalShrubGeometry('low');
    const flowerGeo=createNaturalFlowerGeometry();
    const grassGeo=createMeadowTuftGeometry(this.quality==='low'?'low':'medium');
    this.geometries.push(shrubGeo,flowerGeo,grassGeo);
    const shrubMat=new THREE.MeshStandardMaterial({
      color:0xffffff,vertexColors:true,roughness:.96,
      side:THREE.DoubleSide
    });
    const flowerMat=new THREE.MeshStandardMaterial({
      color:0xffffff,vertexColors:true,roughness:.93,
      side:THREE.DoubleSide
    });
    const grassWind=createMeadowWindMaterial();
    this.winds.push(grassWind.wind);
    this.materials.push(shrubMat,flowerMat,grassWind.mat);
    // Seed lush but irregular verges beside every regional road.
    const roadSamples=[];
    for(const road of this.clearance?.network?.roads||[]){
      for(let i=1;i<road.points.length;i+=3){
        const a=road.points[i-1].center||road.points[i-1];
        const b=road.points[Math.min(i+2,road.points.length-1)].center||
          road.points[Math.min(i+2,road.points.length-1)];
        const dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz);
        if(dist>1&&dist<45)roadSamples.push({a,dx,dz,dist,width:road.width});
      }
    }
    const groups=new Map();
    const geometries={shrub:shrubGeo,flower:flowerGeo,grass:grassGeo};
    const materials={shrub:shrubMat,flower:flowerMat,grass:grassWind.mat};
    const palettes={
      shrub:[0x677c55,0x84916c,0x6e795b,0x9a926b],
      flower:[0xe8d9a1,0xbac4a9,0xb0a0ad,0xf3e0ab]
    };
    const scale={shrub:[.68,1.55],flower:[.55,1.23],grass:[.52,1.18]};
    const maxRadius={shrub:1.5,flower:.45,grass:.95};
    for(const kind of Object.keys(max)){
      let planted=0;
      for(let i=0;i<max[kind]*12&&planted<max[kind];i++){
        let x=(random()-.5)*3900,z=(random()-.5)*3900;
        if(kind==='grass'&&roadSamples.length&&random()<.65){
          const segment=roadSamples[Math.floor(random()*roadSamples.length)];
          const u=random(),side=random()<.5?-1:1;
          const offset=side*(segment.width*.5+4.4+random()*23);
          x=segment.a.x+segment.dx*u-segment.dz/segment.dist*offset;
          z=segment.a.z+segment.dz*u+segment.dx/segment.dist*offset;
        }
        if(Math.abs(x)>1940||Math.abs(z)>1940)continue;
        const macro=Math.sin(x*.009+Math.cos(z*.011))*Math.cos(z*.011);
        const local=Math.sin(x*.037-z*.015)*Math.cos(z*.039+x*.014);
        const density=.49+.30*macro+.11*local;
        if(random()>density)continue;
        if(x>32&&x<299&&z>-110&&z<239)continue;
        if(this.railway.nearestTrack(x,z)<(kind==='shrub'?7.5:5.3))continue;
        if(!this.clearance.plantAllowed(x,z,kind==='grass'?'grass':
          kind==='flower'?'flower':'shrub',maxRadius[kind]))continue;
        const y=this.terrainY(x,z);
        const slope=Math.abs(this.terrainY(x+2,z)-this.terrainY(x-2,z))+
          Math.abs(this.terrainY(x,z+2)-this.terrainY(x,z-2));
        if(slope>5.6&&random()<.8)continue;
        const gx=Math.floor(x/size),gz=Math.floor(z/size),key=gx+','+gz+','+kind;
        if(!groups.has(key))groups.set(key,{kind,x:(gx+.5)*size,z:(gz+.5)*size,items:[]});
        const radius=scale[kind][0]+random()*(scale[kind][1]-scale[kind][0]);
        const profile=kind==='grass'?
          meadowProfile(x,z,this.clearance?.roadProximity(x,z).edge??40):null;
        if(profile&&random()>profile.density)continue;
        const color=profile?profile.color.clone().multiplyScalar(.83+random()*.3):
          new THREE.Color(palettes[kind][Math.floor(random()*palettes[kind].length)]);
        groups.get(key).items.push({x,y,z,scale:radius,
          height:profile?radius*profile.height*(.72+random()*.65):radius,
          yaw:random()*Math.PI*2,color});
        planted++;
      }
      if(kind==='shrub')this.statistics.shrubs=planted;
      if(kind==='flower')this.statistics.flowerPatches=planted;
      if(kind==='grass')this.statistics.meadow=planted;
    }
    const dummy=new THREE.Object3D();
    for(const group of groups.values()){
      const mesh=new THREE.InstancedMesh(geometries[group.kind],
        materials[group.kind],group.items.length);
      mesh.name='Vegetação silvestre · '+group.kind;
      for(let i=0;i<group.items.length;i++){
        const p=group.items[i];
        dummy.position.set(p.x,p.y-.02,p.z);
        dummy.rotation.set(0,p.yaw,0);
        dummy.scale.set(p.scale,p.height,p.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,p.color);
      }
      mesh.instanceMatrix.needsUpdate=true;
      mesh.instanceColor.needsUpdate=true;
      mesh.frustumCulled=true;
      mesh.castShadow=false;mesh.receiveShadow=true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.chunks.push({mesh,x:group.x,z:group.z,count:group.items.length});
    }
    this.statistics.tiles=this.chunks.length;
    // A single GPU-instanced meadow near the camera is reused while driving.
    // It can fill any field in the map without rendering millions of far tufts.
    this.localCapacity={
      low:1500,medium:3200,high:6500,ultra:11000
    }[this.quality]||6500;
    this.localGrass=new THREE.InstancedMesh(grassGeo,grassWind.mat,this.localCapacity);
    this.localGrass.name='Relva natural densa · LOD próximo';
    this.localGrass.count=0;
    this.localGrass.frustumCulled=false;
    this.localGrass.castShadow=false;
    this.localGrass.receiveShadow=true;
    this.scene.add(this.localGrass);
    this.localCell=null;
    this.statistics.localMeadow=0;
  }
  updateLocalGrass(position){
    if(!this.localGrass)return;
    const cx=Math.round(position.x/24)*24,cz=Math.round(position.z/24)*24;
    const cell=cx+','+cz;
    if(this.localCell===cell)return;
    this.localCell=cell;
    const dummy=new THREE.Object3D(),mesh=this.localGrass;
    const spacing=12,radius=89;
    const perTile={low:12,medium:25,high:45,ultra:73}[this.quality]||45;
    const amount=Math.ceil(perTile*this.density);
    let planted=0;
    // Each 12m patch is seeded by WORLD coordinates. Moving the streaming
    // window preserves existing nearby tufts and only adds/removes its edges.
    for(let gx=Math.floor((cx-radius)/spacing);gx<=Math.ceil((cx+radius)/spacing);gx++){
      for(let gz=Math.floor((cz-radius)/spacing);gz<=Math.ceil((cz+radius)/spacing);gz++){
        const tileX=gx*spacing,tileZ=gz*spacing;
        if(Math.hypot(tileX-cx,tileZ-cz)>radius+spacing)continue;
        const random=rng(424242^(Math.imul(gx,73856093)^Math.imul(gz,19349663)));
        for(let k=0;k<amount&&planted<this.localCapacity;k++){
          const x=tileX+random()*spacing,z=tileZ+random()*spacing;
          if(Math.hypot(x-cx,z-cz)>radius)continue;
          if(Math.abs(x)>1938||Math.abs(z)>1938)continue;
          if(this.railway?.nearestTrack(x,z)<5.3)continue;
          if(this.clearance&&!this.clearance.plantAllowed(x,z,'grass',.72))continue;
          const edge=this.clearance?.roadProximity(x,z).edge??40;
          const profile=meadowProfile(x,z,edge);
          if(random()>profile.density*.92)continue;
          const breadth=.60+random()*.73;
          const height=profile.height*(.58+random()*1.02);
          dummy.position.set(x,this.terrainY(x,z)-.028,z);
          dummy.rotation.set(0,random()*Math.PI*2,0);
          dummy.scale.set(breadth,height,breadth);
          dummy.updateMatrix();
          mesh.setMatrixAt(planted,dummy.matrix);
          mesh.setColorAt(planted,profile.color.clone().multiplyScalar(.85+random()*.27));
          planted++;
        }
      }
    }
    mesh.count=planted;
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    this.statistics.localMeadow=planted;
  }
  update(cameraPosition,dt,paused=false){
    for(const chunk of this.chunks){
      const dx=chunk.x-cameraPosition.x,dz=chunk.z-cameraPosition.z;
      chunk.mesh.visible=dx*dx+dz*dz<470*470;
    }
    this.updateLocalGrass(cameraPosition);
    if(!paused)for(const wind of this.winds)wind.value+=Math.min(.12,dt||0);
  }
  setDensity(factor){
    this.density=Math.max(.2,Math.min(1,Number(factor)||1));
    for(const chunk of this.chunks)
      chunk.mesh.count=Math.floor(chunk.count*this.density);
    this.localCell=null;
  }
  dispose(){
    for(const chunk of this.chunks)this.scene.remove(chunk.mesh);
    if(this.localGrass)this.scene.remove(this.localGrass);
    for(const geo of this.geometries)geo.dispose();
    for(const mat of this.materials)mat.dispose();
    this.chunks.length=0;
  }
}
