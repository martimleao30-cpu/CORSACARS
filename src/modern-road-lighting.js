import * as THREE from 'three';
import {ROAD_LAMP_SPACING_METRES} from './road-standards.js';

// Contemporary road luminaires for the Portuguese-style road network.
// One shared model per fixture part, with a small pool of real nearby lights.
const UP=new THREE.Vector3(0,1,0);
const TAU=Math.PI*2;
const LAMP_TYPES={
  urban:{height:8.4,arm:2.45,range:33},
  highway:{height:11.6,arm:3.2,range:41},
  access:{height:9.1,arm:2.5,range:34},
  ring:{height:9.5,arm:2.75,range:38},
  rural:{height:9.0,arm:2.35,range:35},
  mountain:{height:8.8,arm:2.35,range:34}
};
function normal(road,index){
  const a=road.points[Math.max(0,index-1)];
  const b=road.points[Math.min(road.points.length-1,index+1)];
  const dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz)||1;
  return {x:-dz/dist,z:dx/dist};
}
// Use actual path length, not vertex indices. This keeps 34 m between
// stations when curved-road tessellation becomes denser on mountain bends.
export function sampleLampStations(road,spacing=ROAD_LAMP_SPACING_METRES){
  const chain=[0],points=road.points;
  for(let i=1;i<points.length;i++)
    chain.push(chain[i-1]+Math.hypot(points[i].x-points[i-1].x,
      points[i].z-points[i-1].z));
  const total=chain.at(-1),stations=[];
  let segment=0;
  for(let distance=spacing*.5;distance<total-spacing*.5;distance+=spacing){
    while(segment<chain.length-2&&chain[segment+1]<distance)segment++;
    const a=points[segment],b=points[segment+1];
    const length=Math.max(1e-6,chain[segment+1]-chain[segment]);
    const fraction=(distance-chain[segment])/length;
    const dx=b.x-a.x,dz=b.z-a.z,norm=Math.hypot(dx,dz)||1;
    stations.push({distance,index:segment,
      point:{x:a.x+(b.x-a.x)*fraction,
        y:a.y+(b.y-a.y)*fraction,z:a.z+(b.z-a.z)*fraction},
      n:{x:-dz/norm,z:dx/norm}});
  }
  return stations;
}
export function lampNightFactor(hour){
  return hour>=19||hour<6?1:0;
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
    // Allow the nearest lamps to illuminate on the very first night frame.
    this.timer=.2;
    this.stats={total:0,urban:0,highway:0,ring:0,access:0,rural:0,mountain:0,excluded:0};
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
      const light=new THREE.SpotLight(0xf0f3ec,0,46,Math.PI/2.9,.65,1.5);
      light.castShadow=false;
      light.visible=false;
      scene.add(light,light.target);this.lights.push(light);
    }
    this.stats.total=this.placements.length;
  }
  tryPlace(road,station,side,kind){
    const point=station.point,n=station.n;
    const offset=road.width*.5+
      (kind==='highway'?4.6:kind==='ring'?3.9:kind==='urban'?3.7:3.1);
    const x=point.x+n.x*side*offset,z=point.z+n.z*side*offset;
    if(this.clearance){
      if(this.clearance.river?.contains(x,z,10)||
        this.clearance.insideService(x,z,1.6)||
        this.clearance.insideBusBay(x,z,3)||
        this.clearance.nearAccess(x,z,1.7)){
        this.stats.excluded++;return;
      }
      const other=this.clearance.roadProximity(x,z,road);
      if(other.road&&other.edge<2.5){
        this.stats.excluded++;return;
      }
      // Do not plant masts inside actual T/X junctions, but light the
      // approaches on the next regular 34 m station.
      if(this.clearance.nearJunction(x,z,3)){
        this.stats.excluded++;return;
      }
    }
    if(this.placements.some(p=>(p.x-x)**2+(p.z-z)**2<14*14))return;
    const inward={x:-n.x*side,z:-n.z*side},type=LAMP_TYPES[kind];
    this.placements.push({x,y:this.terrainY(x,z),z,
      kind,roadId:road.id,side,stationM:station.distance,
      spacingM:ROAD_LAMP_SPACING_METRES,height:type.height,arm:type.arm,
      range:type.range,yaw:rotationFor(inward)});
    this.stats[kind]++;
  }
  buildPlacements(){
    const regions=this.clearance?.regions||[];
    const samplePosition=station=>station.point;
    const nearRegion=(road,p,range)=>{
      return regions.some(region=>region.road===road.id&&
        Math.hypot(region.roadPoint.x-p.x,region.roadPoint.z-p.z)<range);
    };
    const nearIntersection=(p,range)=>{
      return (this.clearance?.junctions||[]).some(j=>
        Math.hypot(j.x-p.x,j.z-p.z)<range);
    };
    for(const road of this.network.roads){
      const kind=road.id==='circular'?'ring':
        road.category==='highway'?'highway':
        road.category==='urban'?'urban':
        road.category==='highway-ramp'?'access':
        road.category==='mountain'?'mountain':
        road.category==='rural'?'rural':null;
      if(!kind)continue;
      for(const station of sampleLampStations(road)){
        const p=samplePosition(station);
        if(kind==='highway'){
          // Motorways should not have random lamps in every rural kilometre:
          // concentrate regular lighting around the interchange/rest-area.
          const service=nearRegion(road,p,300);
          const interchange=nearIntersection(p,120);
          if(!service&&!interchange)continue;
          for(const side of [-1,1])this.tryPlace(road,station,side,kind);
        }else if(kind==='rural'||kind==='mountain'){
          // More light at settlements, rural access roads, mountain bends and
          // actual intersections; leave remote forest sections naturally dark.
          if(!nearRegion(road,p,240)&&!nearIntersection(p,90))continue;
          this.tryPlace(road,station,kind==='mountain'?1:-1,kind);
        }else if(kind==='ring'){
          this.tryPlace(road,station,-1,kind);
        }else if(kind==='urban'){
          for(const side of [-1,1])this.tryPlace(road,station,side,kind);
        }else this.tryPlace(road,station,-1,kind);
      }
    }
  }
  buildGeometry(){
    // All posts share a single frustum, arms share one cube, housings share
    // another, reducing hundred-plus detailed poles to a few GPU draw calls.
    const segments=this.quality==='ultra'?24:this.quality==='high'?18:12;
    const geometries={
      pole:new THREE.CylinderGeometry(.6,1,1,segments),
      foot:new THREE.CylinderGeometry(1,1,1,segments),
      arm:lineGeometry.clone(),
      clamp:new THREE.CylinderGeometry(1,1,1,segments),
      housing:new THREE.SphereGeometry(.6,segments,8),
      lens:new THREE.SphereGeometry(.52,segments,8),
      cap:new THREE.SphereGeometry(.57,segments,8)
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
      part('housing',L+.36,H-.38,0,1.18,.23,.42,0,-.07);
      part('cap',L+.36,H-.265,0,1.02,.10,.44);
      part('lens',L+.36,H-.52,0,.97,.05,.32);
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
    const night=lampNightFactor(hour);
    this.materials.lens.emissiveIntensity=night?3.3:0;
    // Real downward-directed SpotLights illuminate only the nearest road.
    // Hundreds of remote fixture meshes remain inexpensive GPU instances.
    if(!night||!carPosition){
      for(const light of this.lights){light.intensity=0;light.visible=false;}
      return;
    }
    if(this.timer<.16)return;
    this.timer=0;
    const nearby=[];
    for(const p of this.placements){
      const d2=(p.lampX-carPosition.x)**2+(p.lampZ-carPosition.z)**2;
      if(d2<145*145)nearby.push({p,d2});
    }
    nearby.sort((a,b)=>a.d2-b.d2);
    for(let i=0;i<this.lights.length;i++){
      const light=this.lights[i],nearest=nearby[i];
      if(!nearest){light.visible=false;light.intensity=0;continue;}
      const {p,d2}=nearest;
      light.position.set(p.lampX,p.lampY,p.lampZ);
      light.target.position.set(p.lampX,p.y+.1,p.lampZ);
      light.target.updateMatrixWorld();
      light.distance=p.range;
      light.intensity=185*Math.min(1,Math.max(.35,1-d2/(145*145)));
      light.visible=true;
    }
  }
  dispose(){
    for(const object of [...this.meshes,...this.lights,...this.lights.map(l=>l.target)])this.scene.remove(object);
    for(const geometry of this.geometries)this.geometries&&geometry.dispose();
    for(const material of Object.values(this.materials))material.dispose();
    this.meshes.length=this.lights.length=0;
  }
}
