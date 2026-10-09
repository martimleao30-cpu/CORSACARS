import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// A first region of reachable named locations. The static geometry and its
// rigid-body colliders enter/leave memory with the nearest sector, not at boot.
const DESCRIPTORS = [
  {id:'service',name:'Área de Serviço Vale',kind:'service',road:'autoestrada',at:.49,side:-1},
  {id:'town',name:'Vila Nova · Praça Central',kind:'town',road:'nacional',at:.55,side:1},
  {id:'mountain',name:'Miradouro Serra Alta',kind:'lookout',road:'montanha',at:.46,side:-1},
  {id:'farm',name:'Quinta do Pinhal',kind:'farm',road:'rural',at:.54,side:1},
  {id:'quarry',name:'Zona Industrial · Pedreira',kind:'industrial',road:'gravilha',at:.57,side:-1}
];
const mat=(c,roughness=.75,metalness=0)=>new THREE.MeshStandardMaterial({
  color:c,roughness,metalness
});
const STEEL=mat(0x8a989d,.35,.79),CONCRETE=mat(0xa6a8a2,.92),
  GLASS=mat(0x567d8f,.23,.18),MARKING=mat(0xeed69c,.8),
  BLUE=mat(0x2c5267,.61,.12),RED=mat(0x79483e,.85),
  ROOF=mat(0x464e59,.58,.38),GREEN=mat(0x66815c,1);

function box(group,physics,bodies,x,y,z,w,h,d,material,collider=true){
  const geom=new THREE.BoxGeometry(w,h,d);
  const mesh=new THREE.Mesh(geom,material);
  mesh.position.set(x,y+h*.5,z);
  mesh.castShadow=h>1;mesh.receiveShadow=true;
  group.add(mesh);
  if(collider){
    const body=new CANNON.Body({mass:0});
    body.addShape(new CANNON.Box(new CANNON.Vec3(w*.5,h*.5,d*.5)));
    body.position.set(x,y+h*.5,z);
    physics.addBody(body);bodies.push(body);
  }
  return mesh;
}

export class WorldSectors {
  constructor(scene,physics,network,groundHeight){
    this.scene=scene;this.physics=physics;this.network=network;
    this.groundHeight=groundHeight;this.regions=[];this.active=new Map();
    this.lastUpdate=-Infinity;
    for(const definition of DESCRIPTORS){
      const road=network.roads.find(r=>r.id===definition.road);
      if(!road)continue;
      const n=Math.min(road.points.length-3,
        Math.max(2,Math.floor(definition.at*(road.points.length-1))));
      const p=road.points[n],q=road.points[n+1];
      const tangent=q.clone().sub(road.points[n-1]).normalize();
      const side=new THREE.Vector3(-tangent.z,0,tangent.x).normalize()
        .multiplyScalar(definition.side);
      // The parking area is adjacent to a drivable surface rather than isolated.
      const xy=p.clone().addScaledVector(side,road.width*.5+15);
      xy.y=groundHeight(xy.x,xy.z);
      this.regions.push({...definition,point:xy,roadPoint:p.clone(),
        tangent,side});
    }
  }

  load(region) {
    const group=new THREE.Group();
    group.name=region.name;
    const bodies=[];
    const base=region.point;
    const x=base.x,z=base.z,y=this.groundHeight(x,z);
    // Access strip joins the side of the road to this real parking apron.
    // Ground mesh collision already exists everywhere beneath the driveway.
    const direction=region.side.clone().normalize();
    const length=17;
    const access=new THREE.Mesh(new THREE.PlaneGeometry(8,length),
      mat(region.kind==='farm'?0x695945:0x646968,.93));
    access.rotation.x=-Math.PI/2;
    access.rotation.z=Math.atan2(direction.x,direction.z);
    access.position.set((base.x+region.roadPoint.x)*.5,
      this.groundHeight((base.x+region.roadPoint.x)*.5,
        (base.z+region.roadPoint.z)*.5)+.13,
      (base.z+region.roadPoint.z)*.5);
    access.receiveShadow=true;group.add(access);
    const apron=new THREE.Mesh(new THREE.PlaneGeometry(28,26),
      mat(region.kind==='farm'?0x797055:0x686d70,.91));
    apron.rotation.x=-Math.PI/2;
    apron.position.set(x,y+.14,z);apron.receiveShadow=true;group.add(apron);
    // Functional colliders prevent driving straight through the shop walls.
    if(region.kind==='service'){
      box(group,this.physics,bodies,x+12,y,z+7,15,4.2,9,CONCRETE);
      box(group,this.physics,bodies,x+12,y+4.2,z+7,17,.6,10,ROOF,false);
      for(const side of [-1,1]){
        box(group,this.physics,bodies,x+side*5,y,z,1.2,1.4,.85,BLUE);
      }
      box(group,this.physics,bodies,x,y+3,z,14,.38,9,ROOF,false);
      for(const offset of [-6,6]){
        box(group,this.physics,bodies,x+offset,y,z-3,.22,3,.25,STEEL,false);
      }
    }else if(region.kind==='town'){
      for(const [dx,dz,w,h] of [[-10,-11,8,7],[10,-12,7,10],[14,8,8,6]]){
        box(group,this.physics,bodies,x+dx,y,z+dz,w,h,6,
          h>7?BLUE:CONCRETE);
        box(group,this.physics,bodies,x+dx,y+h,z+dz,w+.8,.6,7,ROOF,false);
      }
    }else if(region.kind==='lookout'){
      for(const dz of [-11,11]){
        box(group,this.physics,bodies,x-9,y,z+dz,16,.9,.22,STEEL,false);
      }
      box(group,this.physics,bodies,x-15,y,z,2,1.7,2,CONCRETE);
      box(group,this.physics,bodies,x-15,y+1.8,z,3,.2,3,ROOF,false);
    }else if(region.kind==='industrial'){
      box(group,this.physics,bodies,x+14,y,z,18,7,13,ROOF);
      box(group,this.physics,bodies,x+14,y+7,z,19,.65,14,STEEL,false);
      for(const dz of [-6,1,8]){
        box(group,this.physics,bodies,x-9,y,z+dz,2.4,2.2,2.3,
          dz===1?RED:CONCRETE);
      }
    }else if(region.kind==='farm'){
      box(group,this.physics,bodies,x+13,y,z+4,13,5,9,RED);
      box(group,this.physics,bodies,x+13,y+5,z+4,15,.9,10,ROOF,false);
      for(const dz of [-11,-7,-3]){
        box(group,this.physics,bodies,x-10,y,z+dz,.2,1.05,3,STEEL,false);
      }
    }
    // Signpost with an actual world location.
    box(group,this.physics,bodies,x-9,y,z+10,.15,2.4,.14,STEEL,false);
    box(group,this.physics,bodies,x-9,y+2.2,z+10,4,.75,.15,
      region.kind==='farm'?GREEN:BLUE,false);
    box(group,this.physics,bodies,x+8,y+.02,z-5,6,.04,.15,MARKING,false);
    this.scene.add(group);
    this.active.set(region.id,{group,bodies});
  }

  unload(id){
    const record=this.active.get(id);
    if(!record)return;
    this.scene.remove(record.group);
    record.group.traverse(obj=>{if(obj.isMesh)obj.geometry?.dispose();});
    for(const body of record.bodies)this.physics.removeBody(body);
    this.active.delete(id);
  }

  update(carPosition,elapsed=0){
    if(elapsed-this.lastUpdate<.85)return;
    this.lastUpdate=elapsed;
    const nearSq=470*470,farSq=600*600;
    for(const region of this.regions){
      const dist=region.point.distanceToSquared(carPosition);
      if(dist<nearSq&&!this.active.has(region.id))this.load(region);
      if(dist>farSq&&this.active.has(region.id))this.unload(region.id);
    }
  }

  nearby(carPosition,maxDistance=48){
    let result=null,dist=maxDistance*maxDistance;
    for(const region of this.regions){
      const d=region.point.distanceToSquared(carPosition);
      if(d<dist){dist=d;result=region;}
    }
    return result;
  }

  dispose(){for(const id of [...this.active.keys()])this.unload(id);}
}
