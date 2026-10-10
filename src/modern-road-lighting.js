import * as THREE from 'three';

// Contemporary road luminaires for the Portuguese-style road network.
// One shared model per fixture part, with a small pool of real nearby lights.
const UP=new THREE.Vector3(0,1,0);
const TAU=Math.PI*2;
const LAMP_TYPES={
  urban:{height:8.4,arm:2.45,range:33},
  highway:{height:11.6,arm:3.2,range:41},
  access:{height:9.1,arm:2.5,range:34},
  ring:{height:8.8,arm:2.55,range:34}
};
function normal(road,index){
  const a=road.points[Math.max(0,index-1)];
  const b=road.points[Math.min(road.points.length-1,index+1)];
  const dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz)||1;
  return {x:-dz/dist,z:dx/dist};
}
const lineGeometry=new THREE.BoxGeometry(1,1,1);
function rotationFor(inward){
  return Math.atan2(-inward.z,inward.x);
}
export class ModernRoadLighting{
  constructor(scene,network,terrainY,clearance=null,quality='high'){
    this.scene=scene;this.network=network;this.terrainY=terrainY;
    this.clearance=clearance;this.quality=quality;
    this.placements=[];this.fixtures=[];this.meshes=[];
    this.timer=0;
    this.stats={total:0,urban:0,highway:0,ring:0,access:0,excluded:0};
    this.materials={
      pole:new THREE.MeshStandardMaterial({color:0x747f86,roughness:.45,metalness:.82}),
      head:new THREE.MeshStandardMaterial({color:0x454f57,roughness:.52,metalness:.69}),
      trim:new THREE.MeshStandardMaterial({color:0x9fa9ab,roughness:.38,metalness:.71}),
      lens:new THREE.MeshStandardMaterial({
        color:0xe7f0ed,emissive:0xd6eeeb,emissiveIntensity:.08,
        roughness:.21,metalness:.03,side:THREE.DoubleSide
      })
    };
    this.glowMaterial=this.materials.lens;
    this.buildPlacements();
    this.buildGeometry();
    const maxReal=quality==='ultra'?8:quality==='low'?4:6;
    this.lights=[];
    for(let i=0;i<maxReal;i++){
      const light=new THREE.PointLight(0xeaf0e8,0,42,2);
      light.castShadow=false;
      light.visible=false;
      scene.add(light);this.lights.push(light);
    }
    this.stats.total=this.placements.length;
  }
  tryPlace(road,index,side,kind){
    if(index<2||index>=road.points.length-2)return;
    const point=road.points[index];
    const n=normal(road,index);
    const offset=road.width*.5+(kind==='highway'?5.4:kind==='ring'?4.7:4.2);
    const x=point.x+n.x*side*offset,z=point.z+n.z*side*offset;
    if(this.clearance){
      if(this.clearance.insideService(x,z,2)||
        this.clearance.nearAccess(x,z,2.2)){
        this.stats.excluded++;return;
      }
      const other=this.clearance.roadProximity(x,z,road);
      if(other.road&&other.edge<2.4){
        this.stats.excluded++;return;
      }
      // No mast immediately on an intersection; the next safe locations
      // illuminate both approaches instead.
      if(this.clearance.nearJunction(x,z,3.5)){
        this.stats.excluded++;return;
      }
    }
    for(const p of this.placements){
      if((p.x-x)**2+(p.z-z)**2<13*13)return;
    }
    const inward={x:-n.x*side,z:-n.z*side};
    const type=LAMP_TYPES[kind];
    this.placements.push({x,y:this.terrainY(x,z),z,
      kind,roadId:road.id,side,height:type.height,arm:type.arm,
      range:type.range,yaw:rotationFor(inward)});
    this.stats[kind]++;
  }
  buildPlacements(){
    const ring=this.network.roads.find(r=>r.id==='circular');
    const urban=this.network.roads.filter(r=>r.category==='urban');
    for(const road of urban){
      // Approximately 30–40 m spacing along both urban pavements.
      for(let i=7;i<road.points.length-7;i+=5){
        this.tryPlace(road,i,-1,'urban');
        this.tryPlace(road,i,1,'urban');
      }
      // Keep passadeiras and junction approaches illuminated.
      for(const i of [20,25,32,61,67,74,99,105,113])
        for(const side of [-1,1])this.tryPlace(road,i,side,'urban');
    }
    if(ring){
      for(let i=8;i<ring.points.length-8;i+=15)
        this.tryPlace(ring,i,i%2===0?-1:1,'ring');
    }
    for(const road of this.network.roads.filter(r=>r.category==='highway')){
      const center=Math.floor(road.points.length*.49);
      for(let i=6;i<road.points.length-6;i+=7){
        // Most motorway stretches remain unlit; prioritize ramps/rest stops.
        if(Math.abs(i-center)>45&&i>23&&i<road.points.length-24)continue;
        for(const side of [-1,1])this.tryPlace(road,i,side,'highway');
      }
    }
    for(const road of this.network.roads){
      if(!/ram(p|pa)|acesso|ligação|ligacao/i.test(road.id)&&
         !/ram(p|pa)|acesso|ligação|ligacao/i.test(road.name))continue;
      for(let i=4;i<road.points.length-4;i+=7)
        this.tryPlace(road,i,-1,'access');
    }
  }
  buildGeometry(){
    // All posts share a single frustum, arms share one cube, housings share
    // another, reducing hundred-plus detailed poles to a few GPU draw calls.
    const geometries={
      pole:new THREE.CylinderGeometry(.6,1,1,10),
      foot:new THREE.CylinderGeometry(1,1,1,10),
      arm:lineGeometry.clone(),
      clamp:new THREE.CylinderGeometry(1,1,1,9),
      housing:lineGeometry.clone(),
      lens:lineGeometry.clone(),
      cap:lineGeometry.clone()
    };
    this.geometries=Object.values(geometries);
    const batches={pole:[],foot:[],arm:[],clamp:[],housing:[],lens:[],cap:[]};
    const temp=new THREE.Object3D();
    for(const p of this.placements){
      const co=Math.cos(p.yaw),si=Math.sin(p.yaw);
      const part=(kind,x,y,z,sx,sy,sz,rx=0,rz=0)=>{
        // Proper THREE Y rotation: x'=cos*x + sin*z, z'=-sin*x + cos*z.
        temp.position.set(p.x+co*x+si*z,p.y+y,p.z-si*x+co*z);
        temp.rotation.order='YXZ';
        temp.rotation.set(rx,p.yaw,rz);
        temp.scale.set(sx,sy,sz);
        temp.updateMatrix();
        batches[kind].push(temp.matrix.clone());
      };
      const H=p.height,L=p.arm;
      // Tapered mast, proper footing, elbow collar and gently rising arm.
      part('pole',0,H*.5,0,.165,H,.165);
      part('foot',0,.14,0,.31,.28,.31);
      part('clamp',0,H-.56,0,.21,.20,.21);
      part('arm',L*.5,H-.14,0,L,.13,.13,0,.12);
      part('housing',L+.36,H-.38,0,1.14,.23,.40,0,-.07);
      part('cap',L+.36,H-.27,0,.98,.055,.44);
      part('lens',L+.36,H-.512,0,.90,.035,.30);
      p.lampX=p.x+co*(L+.36);
      p.lampY=p.y+H-.56;
      p.lampZ=p.z-si*(L+.36);
    }
    const materialFor={pole:this.materials.pole,foot:this.materials.head,
      arm:this.materials.pole,clamp:this.materials.trim,
      housing:this.materials.head,lens:this.materials.lens,cap:this.materials.trim};
    for(const [kind,mats] of Object.entries(batches)){
      if(!mats.length)continue;
      const batch=new THREE.InstancedMesh(geometries[kind],materialFor[kind],mats.length);
      batch.name='Candeeiro LED moderno · '+kind;
      for(let i=0;i<mats.length;i++)batch.setMatrixAt(i,mats[i]);
      batch.instanceMatrix.needsUpdate=true;
      batch.castShadow=kind==='pole'&&this.quality!=='low';
      batch.receiveShadow=true;
      batch.computeBoundingSphere();
      this.scene.add(batch);this.meshes.push(batch);
    }
  }
  update(dt,hour,carPosition){
    this.timer+=Math.max(0,Math.min(.12,dt||0));
    const sun=(hour>=6.4&&hour<=18.7);
    // Maintain visible emissive LED strips after dusk, without hundreds of
    // real point/spot lights running far away.
    this.materials.lens.emissiveIntensity=sun?.08:2.8;
    if(sun||!carPosition){
      for(const light of this.lights){light.intensity=0;light.visible=false;}
      return;
    }
    if(this.timer<.16)return;
    this.timer=0;
    const nearby=[];
    for(const p of this.placements){
      const d2=(p.lampX-carPosition.x)**2+(p.lampZ-carPosition.z)**2;
      if(d2<125*125)nearby.push({p,d2});
    }
    nearby.sort((a,b)=>a.d2-b.d2);
    for(let i=0;i<this.lights.length;i++){
      const light=this.lights[i],nearest=nearby[i];
      if(!nearest){light.visible=false;light.intensity=0;continue;}
      const {p,d2}=nearest;
      light.position.set(p.lampX,p.lampY,p.lampZ);
      light.distance=p.range;
      light.intensity=115*Math.min(1,Math.max(.25,1-d2/(125*125)));
      light.visible=true;
    }
  }
  dispose(){
    for(const object of [...this.meshes,...this.lights])this.scene.remove(object);
    for(const geometry of this.geometries)this.geometries&&geometry.dispose();
    for(const material of Object.values(this.materials))material.dispose();
    this.meshes.length=this.lights.length=0;
  }
}
