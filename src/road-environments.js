import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {roadDeckHeight} from './road-upgrades.js';
import {RoadsideInfrastructure} from './roadside-infrastructure.js';
import {createNaturalShrubGeometry,createWeatheredRockGeometry} from './natural-assets.js';

// Route-specific, real Three.js scenery. Shared mesh geometries and instanced
// markings keep the extra road infrastructure affordable for WebGL / Electron.
const materials={
  white:new THREE.MeshStandardMaterial({color:0xeae6d6,roughness:.9}),
  yellow:new THREE.MeshStandardMaterial({color:0xe4bb5c,roughness:.88}),
  cement:new THREE.MeshStandardMaterial({color:0x898d88,roughness:.94,side:THREE.DoubleSide}),
  kerb:new THREE.MeshStandardMaterial({color:0xc2c4bd,roughness:.93}),
  steel:new THREE.MeshStandardMaterial({color:0x89949a,metalness:.73,roughness:.4}),
  galvanised:new THREE.MeshStandardMaterial({color:0xa9b3b8,metalness:.79,roughness:.38,side:THREE.DoubleSide}),
  tar:new THREE.MeshStandardMaterial({color:0x35312c,roughness:.95}),
  grate:new THREE.MeshStandardMaterial({color:0x26282a,metalness:.68,roughness:.52}),
  earth:new THREE.MeshStandardMaterial({color:0x806848,roughness:1}),
  rock:new THREE.MeshStandardMaterial({color:0x81847e,roughness:.98}),
  wood:new THREE.MeshStandardMaterial({color:0x69523c,roughness:.96})
};
// A genuine corrugated W-beam cross-section, rather than two rectangular
// strips. One lightweight extruded shape is shared by each instanced segment.
export function createWBeamGuardrailGeometry(){
  const shape=new THREE.Shape();
  const front=[
    [.01,-.205],[.092,-.145],[-.055,-.065],
    [.09,.042],[-.053,.133],[.01,.205]
  ];
  shape.moveTo(...front[0]);
  for(let i=1;i<front.length;i++)shape.lineTo(...front[i]);
  for(let i=front.length-1;i>=0;i--)
    shape.lineTo(front[i][0]-.04,front[i][1]);
  shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{
    depth:1,steps:1,bevelEnabled:false,curveSegments:1
  });
  geometry.translate(0,0,-.5);
  geometry.computeVertexNormals();
  geometry.userData.corsaGuardrail='corrugated-W-beam';
  return geometry;
}
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
  constructor(scene,physics,network,terrainY,quality='high',clearance=null){
    this.scene=scene;this.physics=physics;this.network=network;
    this.terrainY=terrainY;this.quality=quality;this.clearance=clearance;
    this.objects=[];this.bodies=[];this.trafficLights=[];
    this.statistics={urban:0,highway:0,mountain:0,rural:0,dirt:0,
      sidewalks:0,crosswalks:0,parkingSpaces:0,manholes:0,drains:0,ruralVegetation:0,
      speedSigns:0,dangerSigns:0,
      highwayBarriers:0,mountainBarriers:0,roadSigns:0,stones:0,
      dirtRuts:0,physicalJunctions:network.connectors?.length||0,
      woodFencePosts:0,woodFenceRails:0,metalRailPosts:0,skippedFenceSegments:0,
      motorwayServiceSigns:0,mountainMarkers:0,mountainRockCuts:0,
      mountainRetainingWalls:0};
    for(const road of network.roads){
      if(road.category==='urban')this.urban(road);
      if(road.category==='highway')this.highway(road);
      if(road.category==='mountain')this.mountain(road);
      if(road.category==='rural')this.rural(road);
      if(road.category==='dirt')this.dirt(road);
      if(ROAD_CATEGORIES.includes(road.category))this.statistics[road.category]++;
    }
    // Continuous metal guardrails around the circular road replace the old
    // decorative beams and automatically open at regional-road junctions.
    if(this.clearance){
      const ring=network.roads.find(r=>r.id==='circular');
      if(ring){
        for(const side of [-1,1])
          this.barrier(ring,side*(ring.width*.5+2.9),4,
            ring.points.length-6,5,'metal');
      }
    }
    this.infrastructure=new RoadsideInfrastructure(
      this.scene,this.physics,this.network,this.terrainY,this.clearance,this.quality);
    Object.assign(this.statistics,this.infrastructure.stats);
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
      dummy.rotation.set(p.pitch||p.rx||0,p.yaw||0,p.rz||0,'YXZ');
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

  // Sidewalk runs cannot span road joins or driveways. Split geometry AND its
  // Cannon collider into safe intervals, rather than hiding a visible curb.
  pavementRuns(road,side,start,end){
    let first=-1;
    for(let i=start;i<=end+1;i++){
      const inside=i<=end;
      let free=false;
      if(inside){
        const p=position(road,i,side*(road.width*.5+1.8),this.terrainY);
        free=!this.clearance||(!this.clearance.nearJunction(p.x,p.z,2.5)&&
          !this.clearance.nearAccess(p.x,p.z,2.8)&&
          !this.clearance.insideService(p.x,p.z,3)&&
          this.clearance.roadProximity(p.x,p.z,road).edge>=3.8);
      }
      if(free&&first<0)first=i;
      if(!free&&first>=0){
        if(i-first>=3)this.pavement(road,side,first,i-1);
        first=-1;
      }
    }
  }

  urban(road){
    const n=road.points.length-1;
    // Gaps at junction / parking entrance make these paved areas accessible.
    if(road.id==='nacional'){
      for(const side of [-1,1]){
        this.pavementRuns(road,side,9,62);
        this.pavementRuns(road,side,78,n-9);
      }
    }
    const manholes=[],drains=[],parking=[],parkTics=[];
    const crossings=road.id==='nacional'?[26,68,106]:[Math.floor(n*.48)];
    for(const k of crossings){
      if(k>=n-2)continue;
      // The physical crosswalk paint is now generated from the road deck.
      this.statistics.crosswalks++;
      this.trafficLight(road,k,-1);
      this.trafficLight(road,k,1);
    }
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
    this.speedSign(road,clamp(Math.round(n*.22),3,n-3),road.width*.5+3.4,50);
    this.dangerSign(road,clamp(Math.round(n*.18),3,n-3),-road.width*.5-3.6,'PASSADEIRA');
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
    if(speed){ctx.font='bold 37px sans-serif';
      const detail=/^\d+$/.test(String(speed).trim())?speed+' km/h':speed;
      ctx.fillText(detail,256,141);
    }
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


  // Portuguese-style circular maximum speed limits, including the actual
  // speed number rather than merely a blue informational billboard.
  speedSign(road,index,offset,limit){
    const p=position(road,index,offset,this.terrainY);
    const root=new THREE.Group();
    root.position.set(p.x,this.terrainY(p.x,p.z),p.z);
    root.rotation.y=p.yaw;
    const grey=materials.steel,white=materials.white;
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.056,.075,2.8,9),grey);
    pole.position.y=1.4;pole.castShadow=true;root.add(pole);
    const rim=new THREE.Mesh(new THREE.CircleGeometry(.58,32),
      new THREE.MeshStandardMaterial({color:0xc82123,roughness:.71,side:THREE.DoubleSide}));
    rim.position.set(0,2.9,.064);root.add(rim);
    const inner=new THREE.Mesh(new THREE.CircleGeometry(.44,32),white);
    inner.position.set(0,2.9,.074);root.add(inner);
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d');
    ctx.font='bold 152px sans-serif';ctx.fillStyle='#171717';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(String(limit),128,135);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    const numbers=new THREE.Mesh(new THREE.PlaneGeometry(.79,.79),
      new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,
        transparent:true,alphaTest:.14,depthWrite:false}));
    numbers.position.set(0,2.9,.083);root.add(numbers);
    this.add(root,'Sinal de limite · '+limit+' km/h');
    this.statistics.speedSigns++;
    return root;
  }

  dangerSign(road,index,offset,kind='CURVAS'){
    const p=position(road,index,offset,this.terrainY);
    const root=new THREE.Group();
    root.position.set(p.x,this.terrainY(p.x,p.z),p.z);
    root.rotation.y=p.yaw;
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.055,.075,2.8,8),materials.steel);
    post.position.y=1.4;root.add(post);
    const triangle=(radius)=>{
      const shape=new THREE.Shape();
      shape.moveTo(0,radius);
      shape.lineTo(-radius*.89,-radius*.62);
      shape.lineTo(radius*.89,-radius*.62);
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    };
    const back=new THREE.Mesh(triangle(.68),
      new THREE.MeshStandardMaterial({color:0xc72727,side:THREE.DoubleSide,roughness:.76}));
    back.position.set(0,3.03,.063);root.add(back);
    const face=new THREE.Mesh(triangle(.49),
      new THREE.MeshBasicMaterial({color:0xf4f5ef,side:THREE.DoubleSide}));
    face.position.set(0,2.99,.076);root.add(face);
    const exclaim=new THREE.Mesh(new THREE.BoxGeometry(.085,.36,.035),
      new THREE.MeshBasicMaterial({color:0x101417}));
    exclaim.position.set(0,2.98,.095);root.add(exclaim);
    const dot=new THREE.Mesh(new THREE.SphereGeometry(.055,9,6),
      new THREE.MeshBasicMaterial({color:0x101417}));
    dot.position.set(0,2.72,.1);root.add(dot);
    this.add(root,'Sinal de perigo · '+kind);
    this.statistics.dangerSigns++;
    return root;
  }

  // Galvanised corrugated W-beam on actual steel posts every ~4m.
  // Collision and entrance clearance use the same continuous road segment.
  barrier(road,offset,first,last,step,kind='metal'){
    const beams=[],posts=[],spacers=[],body=new CANNON.Body({mass:0});
    const isMedian=kind==='median';
    for(let i=first;i+step<=last;i+=step){
      const a=position(road,i,offset,this.terrainY);
      const b=position(road,i+step,offset,this.terrainY);
      const aa={x:a.x,y:this.terrainY(a.x,a.z),z:a.z};
      const bb={x:b.x,y:this.terrainY(b.x,b.z),z:b.z};
      if(this.clearance&&!this.clearance.fenceSegmentAllowed(aa,bb,road,isMedian?1.5:1)){
        this.statistics.skippedFenceSegments++;continue;
      }
      const dx=bb.x-aa.x,dz=bb.z-aa.z,dy=bb.y-aa.y;
      const horizontal=Math.hypot(dx,dz);
      if(horizontal<.1||horizontal>55)continue;
      const length=Math.hypot(horizontal,dy);
      const yaw=Math.atan2(dx,dz),pitch=-Math.atan2(dy,horizontal);
      const midpoint={x:(aa.x+bb.x)*.5,y:(aa.y+bb.y)*.5,
        z:(aa.z+bb.z)*.5,yaw,pitch};
      if(isMedian){
        beams.push({...midpoint,y:midpoint.y+.56,sx:.40,sy:.85,sz:length+.08});
      }else{
        beams.push({...midpoint,y:midpoint.y+.76,
          sx:1,sy:1,sz:length+.06});
        // Roadside safety structures are supported at regular 3.6–4.0m
        // spacing, not by a single giant pillar on each long road segment.
        const count=Math.max(1,Math.ceil(horizontal/3.9));
        for(let j=0;j<=count;j++){
          // Avoid duplicate posts at the boundary of adjacent segments.
          if(j===count&&i+step<last)continue;
          const t=j/count,px=aa.x+dx*t,pz=aa.z+dz*t;
          const py=aa.y+dy*t;
          const outside=Math.sign(offset)||1;
          const nx=-dz/horizontal*outside,nz=dx/horizontal*outside;
          posts.push({x:px+nx*.12,y:py+.47,z:pz+nz*.12,
            yaw,sx:.12,sy:.94,sz:.15});
          spacers.push({x:px+nx*.085,y:py+.77,z:pz+nz*.085,
            yaw,sx:.20,sy:.13,sz:.23});
        }
      }
      const orientation=new CANNON.Quaternion();
      orientation.setFromAxisAngle(new CANNON.Vec3(0,1,0),yaw);
      body.addShape(new CANNON.Box(new CANNON.Vec3(
        isMedian?.20:.12,isMedian?.43:.245,(horizontal+.12)*.5)),
        new CANNON.Vec3(midpoint.x,midpoint.y+(isMedian?.56:.76),midpoint.z),
        orientation);
    }
    if(!beams.length)return;
    const label=isMedian?'Separador central':'Barreira de proteção';
    this.instances(label,
      isMedian?new THREE.BoxGeometry(1,1,1):createWBeamGuardrailGeometry(),
      isMedian?materials.cement:materials.galvanised,beams);
    if(posts.length){
      this.instances('Barreira metálica · suportes',
        new THREE.BoxGeometry(1,1,1),materials.steel,posts);
      this.instances('Barreira metálica · afastadores',
        new THREE.BoxGeometry(1,1,1),materials.galvanised,spacers);
      this.statistics.metalRailPosts+=posts.length;
    }
    this.physics.addBody(body);this.bodies.push(body);
    if(isMedian)this.statistics.highwayBarriers+=beams.length;
    else this.statistics.mountainBarriers+=beams.length;
  }

  // Rural post-and-rail fence, with real horizontal timbers following the
  // terrain. Gaps are intentionally left at crossings, ramps and POI accesses.
  woodFence(road,side,start,end,step=3){
    const posts=[],upper=[],lower=[],wire=[];
    const body=new CANNON.Body({mass:0});
    const offset=side*(road.width*.5+3.9);
    const rand=deterministic(7017+(side>0?3:7));
    let previousEnd=-1;
    for(let i=start;i+step<=end;i+=step){
      const a=position(road,i,offset,this.terrainY);
      const b=position(road,i+step,offset,this.terrainY);
      const aa={x:a.x,y:this.terrainY(a.x,a.z),z:a.z};
      const bb={x:b.x,y:this.terrainY(b.x,b.z),z:b.z};
      if(this.clearance&&!this.clearance.fenceSegmentAllowed(aa,bb,road,1.5)){
        previousEnd=-1;
        this.statistics.skippedFenceSegments++;
        continue;
      }
      const dx=bb.x-aa.x,dz=bb.z-aa.z,dy=bb.y-aa.y;
      const horizontal=Math.hypot(dx,dz);
      if(horizontal<.25||horizontal>35)continue;
      const yaw=Math.atan2(dx,dz),pitch=-Math.atan2(dy,horizontal);
      const length=Math.hypot(horizontal,dy);
      const vary=1+(rand()-.5)*.12;
      const post=p=>({x:p.x,y:p.y+.74*vary,z:p.z,
        sx:.13,sy:1.48*vary,sz:.13,rz:(rand()-.5)*.035});
      if(previousEnd!==i)posts.push(post(aa));
      posts.push(post(bb));
      previousEnd=i+step;
      const midpoint={x:(aa.x+bb.x)*.5,y:(aa.y+bb.y)*.5,
        z:(aa.z+bb.z)*.5,yaw,pitch};
      upper.push({...midpoint,y:midpoint.y+1.12*vary,
        sx:.105,sy:.145,sz:length+.12});
      lower.push({...midpoint,y:midpoint.y+.65*vary,
        sx:.095,sy:.13,sz:length+.12});
      wire.push({...midpoint,y:midpoint.y+.37*vary,
        sx:.023,sy:.023,sz:length+.12});
      const rotation=new CANNON.Quaternion();
      rotation.setFromAxisAngle(new CANNON.Vec3(0,1,0),yaw);
      body.addShape(new CANNON.Box(new CANNON.Vec3(.065,.45,(horizontal+.12)*.5)),
        new CANNON.Vec3(midpoint.x,midpoint.y+.87,midpoint.z),rotation);
    }
    if(!upper.length)return;
    // Muted rough timber and very thin fence wire, never flat gold blocks.
    this.instances('Vedação rural · postes',new THREE.CylinderGeometry(1,1,1,7),
      materials.wood,posts,true);
    this.instances('Vedação rural · travessa superior',new THREE.BoxGeometry(1,1,1),
      materials.wood,upper);
    this.instances('Vedação rural · travessa inferior',new THREE.BoxGeometry(1,1,1),
      materials.wood,lower);
    this.instances('Vedação rural · fio metálico',new THREE.BoxGeometry(1,1,1),
      materials.steel,wire);
    this.physics.addBody(body);this.bodies.push(body);
    this.statistics.woodFencePosts+=posts.length;
    this.statistics.woodFenceRails+=upper.length+lower.length;
  }

  highway(road){
    const n=road.points.length-1;
    // All motorway lane lines follow the 3D deck in RoadSignage.
    this.barrier(road,0,7,n-9,3,'median');
    for(const side of [-1,1])
      this.barrier(road,side*(road.width*.5+2),9,n-9,4,'metal');
    this.sign(road,clamp(Math.round(n*.29),3,n-3),road.width*.5+6.5,'AUTOESTRADA A1','120');
    this.sign(road,clamp(Math.round(n*.78),3,n-3),-road.width*.5-6.5,'SAÍDA / EXIT','');
    this.speedSign(road,clamp(Math.round(n*.18),3,n-3),road.width*.5+4.8,120);
    this.dangerSign(road,clamp(Math.round(n*.72),3,n-3),-road.width*.5-4.8,'SAÍDA');
    if(road.id==='autoestrada'){
      // Destination signs belong on the same side as the actual rest area.
      this.sign(road,clamp(Math.round(n*.36),3,n-3),
        -(road.width*.5+8),'ÁREA DE SERVIÇO','500 m');
      this.sign(road,clamp(Math.round(n*.45),3,n-3),
        -(road.width*.5+7.6),'COMBUSTÍVEL / CAFÉ','');
      this.statistics.motorwayServiceSigns+=2;
    }
  }

  mountain(road){
    const n=road.points.length-1;
    for(const side of [-1,1])
      this.barrier(road,side*(road.width*.5+1),9,n-9,4,'metal');

    const rng=deterministic(7712+(road.id==='serra-norte'?47:0));
    const rockCount=this.quality==='low'?95:this.quality==='medium'?170:
      this.quality==='ultra'?390:275;
    const rocks=[],cuts=[],walls=[],posts=[],reflectors=[];
    for(let i=0;i<rockCount;i++){
      const index=clamp(Math.floor(rng()*n),4,n-4);
      const side=rng()>.5?1:-1;
      const offset=side*(road.width*.5+5.0+rng()*19);
      const p=position(road,index,offset,this.terrainY);
      const size=.42+rng()*2.65;
      if(this.clearance&&!this.clearance.plantAllowed(p.x,p.z,'rock',size*.5))
        continue;
      rocks.push({...p,y:this.terrainY(p.x,p.z)+size*.12,
        sx:size,sy:size*(.37+rng()*.52),sz:size*(.58+rng()*.8),
        yaw:rng()*Math.PI*2,
        color:rng()>.6?0xabb0a7:0x898f89});
    }
    // Jagged exposed rock outcrops grow only on the uphill side, and well
    // beyond the carriageway. They visually anchor hairpins in the hillside.
    for(let i=8;i<n-8;i+=this.quality==='low'?11:7){
      const side=i%2===0?1:-1;
      const outside=position(road,i,side*(road.width*.5+8),this.terrainY);
      const near=position(road,i,side*(road.width*.5+3),this.terrainY);
      const rise=this.terrainY(outside.x,outside.z)-
        this.terrainY(near.x,near.z);
      if(rise<.62||rng()<.18)continue;
      const height=Math.min(5.5,Math.max(1.0,rise*1.15));
      if(this.clearance&&!this.clearance.plantAllowed(outside.x,outside.z,
        'rock',height*.5))continue;
      cuts.push({x:outside.x,y:this.terrainY(outside.x,outside.z)+height*.18,
        z:outside.z,sx:2.6+rng()*2.5,sy:height,
        sz:2.2+rng()*3,yaw:rng()*Math.PI*2,
        color:rng()>.5?0x929995:0xaaa99b});
    }
    // Stone retaining walls are placed only where there is a cut slope.
    // They are deliberately discontinuous, avoiding junctions and entrances.
    for(let i=10;i<n-11;i+=5){
      const dx=normal(road,i);
      for(const side of [-1,1]){
        const a=position(road,i,side*(road.width*.5+4),this.terrainY);
        const b=position(road,i+4,side*(road.width*.5+4),this.terrainY);
        const near=position(road,i,side*(road.width*.5+1.9),this.terrainY);
        const far=position(road,i,side*(road.width*.5+8.5),this.terrainY);
        const rise=this.terrainY(far.x,far.z)-this.terrainY(near.x,near.z);
        if(rise<1.6)continue;
        const aa={x:a.x,z:a.z},bb={x:b.x,z:b.z};
        if(this.clearance&&!this.clearance.fenceSegmentAllowed(aa,bb,road,1.5))
          continue;
        const length=Math.hypot(b.x-a.x,b.z-a.z);
        if(length<1||length>35)continue;
        const height=clamp(rise*.65,1.1,2.65);
        walls.push({x:(a.x+b.x)*.5,y:
          (this.terrainY(a.x,a.z)+this.terrainY(b.x,b.z))*.5+height*.46,
          z:(a.z+b.z)*.5,
          yaw:Math.atan2(b.x-a.x,b.z-a.z),
          pitch:0,sx:.48,sy:height,sz:length+.14});
      }
    }
    // White-and-red roadside reflector posts at regular realistic intervals.
    for(let i=9;i<n-9;i+=11){
      for(const side of [-1,1]){
        const p=position(road,i,side*(road.width*.5+2.7),this.terrainY);
        if(this.clearance&&(this.clearance.nearJunction(p.x,p.z,3)||
          this.clearance.nearAccess(p.x,p.z,2)||
          this.clearance.insideService(p.x,p.z,1)||
          this.clearance.roadProximity(p.x,p.z,road).edge<.65))continue;
        const y=this.terrainY(p.x,p.z);
        posts.push({x:p.x,y:y+.44,z:p.z,sx:.115,sy:.88,sz:.13,yaw:p.yaw});
        reflectors.push({x:p.x,y:y+.70,z:p.z,sx:.125,sy:.115,sz:.143,
          yaw:p.yaw,color:side<0?0xf0ddd1:0xe3a1a0});
      }
    }
    this.instances('Rochas · Serra',createWeatheredRockGeometry(1),
      new THREE.MeshStandardMaterial({color:0xa4a6a0,roughness:1,vertexColors:true}),rocks);
    this.instances('Taludes rochosos · Serra',createWeatheredRockGeometry(1),
      new THREE.MeshStandardMaterial({color:0x969b94,roughness:.98,vertexColors:true}),cuts);
    this.instances('Muros de contenção em pedra · Serra',
      new THREE.BoxGeometry(1,1,1),
      new THREE.MeshStandardMaterial({color:0x888982,roughness:1}),walls);
    this.instances('Estacas laterais refletoras · Serra',
      new THREE.BoxGeometry(1,1,1),materials.white,posts);
    this.instances('Refletores vermelhos e brancos · Serra',
      new THREE.BoxGeometry(1,1,1),
      new THREE.MeshStandardMaterial({color:0xffffff,roughness:.65}),reflectors);
    this.statistics.stones+=rocks.length;
    this.statistics.mountainRockCuts+=cuts.length;
    this.statistics.mountainRetainingWalls+=walls.length;
    this.statistics.mountainMarkers+=posts.length;
    this.sign(road,clamp(Math.floor(n*.43),3,n-3),road.width*.5+5.6,
      'CURVAS DE SERRA','40');
    this.dangerSign(road,clamp(Math.floor(n*.24),3,n-3),road.width*.5+3.4,'CURVAS');
    this.speedSign(road,clamp(Math.floor(n*.42),3,n-3),-road.width*.5-3.5,40);
  }

  rural(road){
    const n=road.points.length-1;
    for(const side of [-1,1])this.woodFence(road,side,6,n-6,3);
    // Native shrubs follow the actual rural route, with enough distance from
    // the outer lane to keep the driving corridor accessible.
    const shrubs=[],rng=deterministic(77117);
    for(let i=6;i<n-6;i+=3){
      for(const side of [-1,1]){
        if(rng()<.23)continue;
        const offset=side*(road.width*.5+4.7+rng()*6.5);
        const p=position(road,i,offset,this.terrainY);
        const scale=.38+rng()*.93;
        if(this.clearance&&!this.clearance.plantAllowed(p.x,p.z,
          'roadsideShrub',scale*.6))continue;
        shrubs.push({...p,y:this.terrainY(p.x,p.z)+.012,
          sx:scale*.88,sy:scale*.89,sz:scale,
          yaw:rng()*Math.PI*2,
          color:rng()>.5?0x98a28d:0x879c83});
      }
    }
    this.instances('Vegetação junto à estrada rural',
      createNaturalShrubGeometry(this.quality==='low'?'low':'medium'),
      new THREE.MeshStandardMaterial({color:0xf0f1e8,roughness:.96,vertexColors:true,
        side:THREE.DoubleSide}),
      shrubs);
    this.statistics.ruralVegetation+=shrubs.length;
    this.sign(road,clamp(Math.round(n*.24),3,n-3),road.width*.5+4.8,
      'ESTRADA RURAL','60');
    this.speedSign(road,clamp(Math.round(n*.21),3,n-3),road.width*.5+3.7,60);
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
    this.instances('Pedras soltas · Caminho',createWeatheredRockGeometry(1),
      new THREE.MeshStandardMaterial({color:0x9b9e99,roughness:1,vertexColors:true}),
      stones);
    this.statistics.dirtRuts+=tracks.length;
    this.statistics.stones+=stones.length;
    this.sign(road,clamp(Math.round(n*.16),3,n-3),
      road.width*.5+3.9,'PISTA DE TERRA','30');
    this.dangerSign(road,clamp(Math.round(n*.21),3,n-3),road.width*.5+3.8,'PISO IRREGULAR');
  }

  update(dt,paused=false){
    if(!paused)this.elapsed+=Math.max(0,Math.min(dt,.12));
    // Working lights cycle red / amber / green; AI traffic rules are separate work.
    const phase=this.elapsed%26;
    // 0–9: one approach green, 9–11 amber, 11–13 all red;
    // 13–22: opposite approach green, 22–24 amber, 24–26 all red.
    // Conflicting sides can never show green simultaneously.
    for(const signal of this.trafficLights){
      let selected=0;
      if(signal.side<0){
        if(phase<9)selected=2;
        else if(phase<11)selected=1;
      }else{
        if(phase>=13&&phase<22)selected=2;
        else if(phase>=22&&phase<24)selected=1;
      }
      signal.state=['red','amber','green'][selected];
      for(let i=0;i<3;i++)signal.lamps[i].emissiveIntensity=
        i===selected?2.9:.045;
    }
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;
    this.infrastructure?.dispose();
    for(const body of this.bodies)this.physics.removeBody(body);
    const shared=new Set(Object.values(materials));
    const geometries=new Set(),ownedMaterials=new Set(),ownedMaps=new Set();
    for(const obj of this.objects){
      this.scene.remove(obj);
      obj.traverse(child=>{
        if(child.geometry)geometries.add(child.geometry);
        for(const m of Array.isArray(child.material)?child.material:[child.material]){
          if(!m||shared.has(m))continue;
          ownedMaterials.add(m);
          for(const key of ['map','normalMap','roughnessMap','emissiveMap','alphaMap']){
            if(m[key])ownedMaps.add(m[key]);
          }
        }
      });
    }
    for(const geo of geometries)geo.dispose();
    for(const mat of ownedMaterials)mat.dispose();
    for(const map of ownedMaps)map.dispose();
    this.objects.length=0;this.bodies.length=0;
  }
}
