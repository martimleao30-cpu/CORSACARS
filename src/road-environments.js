import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {roadDeckHeight} from './road-upgrades.js';

// Route-specific, real Three.js scenery. Shared mesh geometries and instanced
// markings keep the extra road infrastructure affordable for WebGL / Electron.
const materials={
  white:new THREE.MeshStandardMaterial({color:0xeae6d6,roughness:.9}),
  yellow:new THREE.MeshStandardMaterial({color:0xe4bb5c,roughness:.88}),
  cement:new THREE.MeshStandardMaterial({color:0x898d88,roughness:.94,side:THREE.DoubleSide}),
  kerb:new THREE.MeshStandardMaterial({color:0xc2c4bd,roughness:.93}),
  steel:new THREE.MeshStandardMaterial({color:0x89949a,metalness:.73,roughness:.4}),
  tar:new THREE.MeshStandardMaterial({color:0x35312c,roughness:.95}),
  grate:new THREE.MeshStandardMaterial({color:0x26282a,metalness:.68,roughness:.52}),
  earth:new THREE.MeshStandardMaterial({color:0x806848,roughness:1}),
  rock:new THREE.MeshStandardMaterial({color:0x81847e,roughness:.98}),
  wood:new THREE.MeshStandardMaterial({color:0x69523c,roughness:.96})
};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const normal=(road,i)=>{
  const p=road.points;
  const a=p[Math.max(0,i-1)],b=p[Math.min(p.length-1,i+1)];
  const t=b.clone().sub(a).setY(0);
  return t.lengthSq()>1e-8?t.normalize():new THREE.Vector3(0,0,1);
};
const position=(road,index,lateral,terrainY,height=0)=>{
  const p=road.points[index],t=normal(road,index);
  const x=p.x-t.z*lateral,z=p.z+t.x*lateral;
  const roadHeight=roadDeckHeight(terrainY,x,z,lateral,road.width);
  return {x,z,y:roadHeight+height,yaw:Math.atan2(t.x,t.z),t};
};
const deterministic=seed=>{
  let n=seed>>>0;
  return ()=>((n=(Math.imul(1664525,n)+1013904223)>>>0)/4294967296);
};

export const ROAD_CATEGORIES=Object.freeze(['urban','highway','mountain','rural','dirt']);

export class RoadEnvironment {
  constructor(scene,physics,network,terrainY,quality='high'){
    this.scene=scene;this.physics=physics;this.network=network;
    this.terrainY=terrainY;this.quality=quality;
    this.objects=[];this.bodies=[];this.trafficLights=[];
    this.statistics={urban:0,highway:0,mountain:0,rural:0,dirt:0,
      sidewalks:0,crosswalks:0,parkingSpaces:0,manholes:0,drains:0,ruralVegetation:0,
      highwayBarriers:0,mountainBarriers:0,roadSigns:0,stones:0,
      dirtRuts:0,physicalJunctions:network.connectors?.length||0};
    for(const road of network.roads){
      if(road.category==='urban')this.urban(road);
      if(road.category==='highway')this.highway(road);
      if(road.category==='mountain')this.mountain(road);
      if(road.category==='rural')this.rural(road);
      if(road.category==='dirt')this.dirt(road);
      if(ROAD_CATEGORIES.includes(road.category))this.statistics[road.category]++;
    }
    this.elapsed=0;
  }

  add(mesh,name=''){
    if(name)mesh.name=name;
    this.scene.add(mesh);this.objects.push(mesh);
    return mesh;
  }

  // One draw call for multiple road lines, drains, posts or stones.
  instances(name,geometry,material,placements,shadows=false){
    if(!placements.length)return null;
    const mesh=new THREE.InstancedMesh(geometry,material,placements.length);
    const dummy=new THREE.Object3D();
    for(let i=0;i<placements.length;i++){
      const p=placements[i];
      dummy.position.set(p.x,p.y,p.z);
      dummy.rotation.set(p.rx||0,p.yaw||0,p.rz||0);
      dummy.scale.set(p.sx||1,p.sy||1,p.sz||1);
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      if(p.color)mesh.setColorAt(i,new THREE.Color(p.color));
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.castShadow=shadows;mesh.receiveShadow=true;
    mesh.computeBoundingSphere();
    return this.add(mesh,name);
  }

  markings(road,indices,laterals,color=materials.white,length=2,width=.14){
    const placements=[];
    for(const i of indices)for(const lateral of laterals){
      if(i<1||i>=road.points.length-1)continue;
      const p=position(road,i,lateral,this.terrainY,.035);
      placements.push({...p,sx:width,sy:.017,sz:length});
    }
    return this.instances('Marcas · '+road.name,
      new THREE.BoxGeometry(1,1,1),color,placements);
  }

  // Pavement is thick, connected to the terrain and has real Cannon triangles.
  pavement(road,side,start,end){
    const vertices=[],faces=[],uv=[];
    const first=clamp(start,0,road.points.length-2);
    const last=clamp(end,first+1,road.points.length-1);
    for(let i=first;i<=last;i++){
      const near=position(road,i,side*(road.width*.5+.16),this.terrainY);
      const far=position(road,i,side*(road.width*.5+3.1),this.terrainY);
      // The visible inner vertical surface forms a physical kerb (17 cm).
      vertices.push(near.x,near.y+.17,near.z,
        far.x,far.y+.17,far.z,
        near.x,near.y,near.z);
      uv.push(0,(i-first)*.65,1,(i-first)*.65,0,(i-first)*.65);
      if(i!==last){
        const a=(i-first)*3,b=a+3;
        faces.push(a,b,a+1,a+1,b,b+1);
        faces.push(a,a+2,b,a+2,b+2,b);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(faces);geometry.computeVertexNormals();
    this.add(new THREE.Mesh(geometry,materials.cement),'Passeio 3D · '+road.name);
    const body=new CANNON.Body({mass:0,material:new CANNON.Material('pavement')});
    body.addShape(new CANNON.Trimesh(vertices,faces));
    this.physics.addBody(body);this.bodies.push(body);
    this.statistics.sidewalks++;
  }

  urban(road){
    const n=road.points.length-1;
    // Gaps at junction / parking entrance make these paved areas accessible.
    if(road.id==='nacional'){
      for(const side of [-1,1]){
        this.pavement(road,side,9,62);
        this.pavement(road,side,78,n-9);
      }
    }
    const zebra=[],manholes=[],drains=[],parking=[],parkTics=[];
    const crossings=road.id==='nacional'?[26,68,106]:[Math.floor(n*.48)];
    for(const k of crossings){
      if(k>=n-2)continue;
      for(let v=-road.width*.43;v<=road.width*.43;v+=.85){
        const p=position(road,k,v,this.terrainY,.047);
        zebra.push({...p,sx:.52,sy:.016,sz:2.5});
      }
      this.statistics.crosswalks++;
      this.trafficLight(road,k,-1);
      this.trafficLight(road,k,1);
    }
    this.instances('Passadeiras · '+road.name,new THREE.BoxGeometry(1,1,1),
      materials.white,zebra);
    for(let i=18;i<n-15;i+=18){
      const p=position(road,i,road.width*.16,this.terrainY,.052);
      manholes.push({...p});
      this.statistics.manholes++;
    }
    this.instances('Tampas de saneamento',new THREE.CylinderGeometry(.42,.42,.025,16),
      materials.steel,manholes);
    for(let i=15;i<n-12;i+=11){
      for(const side of [-1,1]){
        const p=position(road,i,side*(road.width*.5-.27),this.terrainY,.057);
        drains.push({...p,sx:.4,sy:.025,sz:.7});
        this.statistics.drains++;
      }
    }
    this.instances('Sarjetas',new THREE.BoxGeometry(1,1,1),
      materials.grate,drains);
    if(road.id==='nacional'){
      // Marked parking bays parallel to a deliberately interrupted pavement.
      for(let i=65;i<=75;i+=2){
        const p=position(road,i,-(road.width*.5+1.75),this.terrainY,.024);
        parking.push({...p,sx:2.8,sy:.04,sz:4.3});
        const mark=position(road,i,-(road.width*.5+.32),this.terrainY,.071);
        parkTics.push({...mark,sx:2.6,sy:.022,sz:.12});
        this.statistics.parkingSpaces++;
      }
      this.instances('Estacionamento · pavimento',new THREE.BoxGeometry(1,1,1),
        materials.tar,parking);
      this.instances('Estacionamento · delimitação',new THREE.BoxGeometry(1,1,1),
        materials.white,parkTics);
    }
    this.sign(road,clamp(Math.round(n*.31),3,n-3),road.width*.5+4.2,
      'ZONA URBANA','50');
  }

  trafficLight(road,index,side){
    const p=position(road,index,side*(road.width*.5+2.7),this.terrainY);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.073,.094,4.2,8),materials.steel);
    pole.position.set(p.x,p.y+2.1,p.z);pole.castShadow=true;
    this.add(pole,'Semáforo · poste');
    const head=new THREE.Mesh(new THREE.BoxGeometry(.53,1.5,.42),materials.grate);
    head.position.set(p.x,p.y+3.84,p.z);head.rotation.y=p.yaw;
    this.add(head,'Semáforo · corpo');
    const lamps=[];
    for(let i=0;i<3;i++){
      const mat=new THREE.MeshStandardMaterial({
        color:[0xdb2b27,0xf7bd2f,0x29c65a][i],
        emissive:[0x8f1111,0x97770c,0x12882e][i],emissiveIntensity:.06,
        roughness:.27
      });
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(.15,10,8),mat);
      // Orient lenses toward approaching cars (opposite directions).
      const facing=new THREE.Vector3(Math.sin(p.yaw),0,Math.cos(p.yaw))
        .multiplyScalar(side>.0?.25:-.25);
      lamp.position.set(p.x+facing.x,p.y+4.26-i*.43,p.z+facing.z);
      this.add(lamp,'Semáforo · '+['vermelho','amarelo','verde'][i]);
      lamps.push(mat);
    }
    this.trafficLights.push({lamps,index,side});
  }

  sign(road,index,offset,title,speed=''){
    const p=position(road,index,offset,this.terrainY,.1);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.065,.072,3.6,8),materials.steel);
    pole.position.set(p.x,p.y+1.8,p.z);this.add(pole);
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=192;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#22516b';ctx.fillRect(0,0,512,192);
    ctx.strokeStyle='#ebf0e7';ctx.lineWidth=9;ctx.strokeRect(12,12,488,168);
    ctx.fillStyle='#f8f7ed';ctx.font='bold 41px sans-serif';
    ctx.textAlign='center';ctx.fillText(title,256,83);
    if(speed){ctx.font='bold 37px sans-serif';ctx.fillText(speed+' km/h',256,141);}
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    const board=new THREE.Mesh(new THREE.BoxGeometry(3.9,1.5,.13),
      [materials.steel,materials.steel,materials.steel,materials.steel,
        new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}),materials.steel]);
    board.position.set(p.x,p.y+3.55,p.z);
    board.rotation.y=p.yaw;
    this.add(board,'Placa · '+title);
    this.statistics.roadSigns++;
  }

  // Continuous crash barrier visual + a compound static Cannon body.
  barrier(road,offset,first,last,step,kind='metal'){
    const placements=[],body=new CANNON.Body({mass:0});
    const height=kind==='median'?.77:.58;
    const thick=kind==='median'?.48:.19;
    for(let i=first;i+step<=last;i+=step){
      const a=position(road,i,offset,this.terrainY);
      const b=position(road,i+step,offset,this.terrainY);
      const dx=b.x-a.x,dz=b.z-a.z;
      const length=Math.hypot(dx,dz);
      if(length<.1||length>55)continue;
      const yaw=Math.atan2(dx,dz);
      const mid={x:(a.x+b.x)*.5,y:(a.y+b.y)*.5+height*.6,z:(a.z+b.z)*.5,
        yaw,sx:thick,sy:height,sz:length+.18};
      placements.push(mid);
      const orientation=new CANNON.Quaternion();
      orientation.setFromAxisAngle(new CANNON.Vec3(0,1,0),yaw);
      body.addShape(new CANNON.Box(new CANNON.Vec3(thick*.5,height*.5,(length+.18)*.5)),
        new CANNON.Vec3(mid.x,mid.y,mid.z),orientation);
    }
    if(!placements.length)return;
    this.instances(kind==='median'?'Separador central':'Barreira de proteção',
      new THREE.BoxGeometry(1,1,1),kind==='median'?materials.cement:materials.steel,
      placements,false);
    this.physics.addBody(body);this.bodies.push(body);
    if(kind==='median')this.statistics.highwayBarriers+=placements.length;
    else this.statistics.mountainBarriers+=placements.length;
  }

  highway(road){
    const n=road.points.length-1;
    const indices=Array.from({length:Math.floor((n-8)/5)},(_,i)=>i*5+4);
    this.markings(road,indices,[-road.width*.245,road.width*.245],materials.white,4,.12);
    this.markings(road,Array.from({length:n-12},(_,i)=>i+6),
      [-road.width*.445,road.width*.445],materials.white,2,.14);
    this.barrier(road,0,7,n-9,3,'median');
    for(const side of [-1,1])
      this.barrier(road,side*(road.width*.5+2),9,n-9,4,'metal');
    this.sign(road,clamp(Math.round(n*.29),3,n-3),road.width*.5+6.5,'AUTOESTRADA A1','120');
    this.sign(road,clamp(Math.round(n*.78),3,n-3),-road.width*.5-6.5,'SAÍDA / EXIT','');
  }

  mountain(road){
    const n=road.points.length-1;
    for(const side of [-1,1])
      this.barrier(road,side*(road.width*.5+1),9,n-9,4,'metal');
    const rocks=[],rng=deterministic(7712),count=this.quality==='low'?24:70;
    for(let i=0;i<count;i++){
      const index=clamp(Math.floor(rng()*n),2,n-2);
      const side=rng()>.5?1:-1;
      const p=position(road,index,side*(road.width*.5+4+rng()*12),this.terrainY);
      const size=.32+rng()*1.7;
      rocks.push({...p,y:this.terrainY(p.x,p.z)+size*.24,
        sx:size,sy:size*.67,sz:size*.92,yaw:rng()*Math.PI*2});
    }
    this.instances('Rochas · Serra',new THREE.DodecahedronGeometry(1,0),
      materials.rock,rocks);
    this.statistics.stones+=rocks.length;
    this.sign(road,clamp(Math.floor(n*.43),3,n-3),road.width*.5+5.6,
      'CURVAS DE SERRA','40');
  }

  rural(road){
    const n=road.points.length-1,posts=[];
    for(let i=7;i<n-7;i+=7){
      for(const side of [-1,1]){
        const p=position(road,i,side*(road.width*.5+3.25),this.terrainY);
        posts.push({...p,y:this.terrainY(p.x,p.z)+.64,sx:.13,sy:1.28,sz:.13});
      }
    }
    this.instances('Vedação rural · postes',
      new THREE.BoxGeometry(1,1,1),materials.wood,posts);
    // Native shrubs follow the actual rural route, with enough distance from
    // the outer lane to keep the driving corridor accessible.
    const shrubs=[],rng=deterministic(77117);
    for(let i=6;i<n-6;i+=3){
      for(const side of [-1,1]){
        if(rng()<.23)continue;
        const offset=side*(road.width*.5+4.7+rng()*6.5);
        const p=position(road,i,offset,this.terrainY);
        const scale=.38+rng()*.93;
        shrubs.push({...p,y:this.terrainY(p.x,p.z)+scale*.38,
          sx:scale*.88,sy:scale*.54,sz:scale,
          yaw:rng()*Math.PI*2,
          color:rng()>.5?0x567047:0x718054});
      }
    }
    this.instances('Vegetação junto à estrada rural',
      new THREE.IcosahedronGeometry(1,1),
      new THREE.MeshStandardMaterial({color:0xffffff,roughness:.97}),
      shrubs);
    this.statistics.ruralVegetation+=shrubs.length;
    this.sign(road,clamp(Math.round(n*.24),3,n-3),road.width*.5+4.8,
      'ESTRADA RURAL','60');
  }

  dirt(road){
    const rng=deterministic(1400+(road.id==='terra'?71:3));
    const n=road.points.length-1,tracks=[],stones=[];
    for(let i=3;i<n-4;i+=3){
      for(const side of [-1,1]){
        const p=position(road,i,side*.86,this.terrainY,.049);
        tracks.push({...p,sx:.36,sy:.019,sz:4.5});
      }
    }
    const limit=this.quality==='low'?45:120;
    for(let i=0;i<limit;i++){
      const idx=clamp(Math.floor(rng()*n),1,n-1);
      const lane=rng()>.5?1:-1;
      const lateral=lane*(road.width*.29+rng()*road.width*.26);
      const p=position(road,idx,lateral,this.terrainY,.067);
      const size=.06+rng()*.21;
      stones.push({...p,y:p.y+size*.15,sx:size,sy:size*.42,sz:size*.75,
        yaw:rng()*Math.PI*2});
    }
    this.instances('Rastos no piso de terra',new THREE.BoxGeometry(1,1,1),
      materials.earth,tracks);
    this.instances('Pedras soltas · Caminho',new THREE.DodecahedronGeometry(1,0),
      materials.rock,stones);
    this.statistics.dirtRuts+=tracks.length;
    this.statistics.stones+=stones.length;
    this.sign(road,clamp(Math.round(n*.16),3,n-3),
      road.width*.5+3.9,'PISTA DE TERRA','30');
  }

  update(dt,paused=false){
    if(!paused)this.elapsed+=Math.max(0,Math.min(dt,.12));
    // Working lights cycle red / amber / green; AI traffic rules are separate work.
    const phase=this.elapsed%24;
    const selected=phase<9?2:phase<11?1:0;
    for(const signal of this.trafficLights){
      for(let i=0;i<3;i++)signal.lamps[i].emissiveIntensity=
        i===selected?2.9:.045;
    }
  }
  dispose(){
    for(const body of this.bodies)this.physics.removeBody(body);
    for(const mesh of this.objects)this.scene.remove(mesh);
  }
}
