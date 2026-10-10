import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Road-dependent electrical distribution. Seven consecutive 34m spans
// out of each ten are eligible (70%), then a gap is left for visual variety
// and future settlements. Junctions, BUS bays, railway and accesses win.
const SPAN=34, SAG=.42;
const chooseSide=id=>{
  let hash=2166136261;
  for(const c of id)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
  return hash%2?1:-1;
};
const sample=(road,distance,along)=>{
  const total=along[along.length-1];
  let lo=0,hi=along.length-1;
  const d=Math.max(0,Math.min(total,distance));
  while(hi-lo>1){
    const mid=(hi+lo)>>1;
    if(along[mid]<d)lo=mid;else hi=mid;
  }
  const a=road.points[lo],b=road.points[hi];
  const fraction=(d-along[lo])/Math.max(.00001,along[hi]-along[lo]);
  const tangent=new THREE.Vector3(b.x-a.x,0,b.z-a.z).normalize();
  const normal=new THREE.Vector3(-tangent.z,0,tangent.x);
  const position=a.clone().lerp(b,fraction);
  return {position,tangent,normal};
};
export function planRoadsidePowerLines(network,terrainY,clearance=null,railway=null){
  const poles=[],spans=[];
  let possible=0;
  for(const road of network.roads){
    // Long-distance motorways, farm tracks and test circuits normally use
    // distant transmission corridors rather than poles at their shoulder.
    if(!['urban','rural','mountain','ring'].includes(road.category) &&
      road.id!=='circular')continue;
    const along=[0];
    for(let i=1;i<road.points.length;i++)
      along.push(along[i-1]+road.points[i].distanceTo(road.points[i-1]));
    const length=along[along.length-1],count=Math.floor(length/SPAN);
    if(count<7)continue;
    const side=chooseSide(road.id);
    const positions=new Map();
    const pole=index=>{
      if(positions.has(index))return positions.get(index);
      const p=sample(road,index*SPAN,along),offset=road.width*.5+7.2;
      const world=p.position.clone().addScaledVector(p.normal,offset*side);
      world.y=terrainY(world.x,world.z);
      const point={x:world.x,y:world.y,z:world.z,
        tangent:p.tangent,normal:p.normal,side,roadId:road.id,
        wooden:road.category!=='urban'&&road.id!=='circular'};
      positions.set(index,point);
      return point;
    };
    const clear=p=>{
      if(Math.abs(p.x)>1975||Math.abs(p.z)>1975)return false;
      if(railway&&railway.nearestTrack(p.x,p.z)<15)return false;
      if(!clearance)return true;
      return !clearance.insideService(p.x,p.z,6)&&
        !clearance.insideBusBay(p.x,p.z,5)&&
        !clearance.nearJunction(p.x,p.z,6)&&
        !clearance.nearAccess(p.x,p.z,5)&&
        clearance.roadProximity(p.x,p.z,road).edge>3.6;
    };
    const accepted=new Set();
    for(let i=1;i<count;i++){
      possible++;
      if(i%10>=7)continue;
      const a=pole(i),b=pole(i+1);
      const mid={x:(a.x+b.x)*.5,z:(a.z+b.z)*.5};
      if(!clear(a)||!clear(b)||!clear(mid))continue;
      if(Math.hypot(b.x-a.x,b.z-a.z)>SPAN*1.48)continue;
      spans.push({a,b,roadId:road.id,length:Math.hypot(b.x-a.x,b.z-a.z)});
      accepted.add(i);accepted.add(i+1);
    }
    for(const index of accepted)poles.push(pole(index));
  }
  return {poles,spans,spanCount:possible,
    ratio:possible?spans.length/possible:0};
}

export class RoadsidePowerLines {
  constructor(scene,physics,network,terrainY,clearance,railway,quality='high'){
    this.scene=scene;this.physics=physics;this.meshes=[];
    this.bodies=[];this.ownedGeometries=[];this.ownedMaterials=[];
    this.plan=planRoadsidePowerLines(network,terrainY,clearance,railway);
    this.build(quality);
    this.statistics={powerPoles:this.plan.poles.length,
      cableSpans:this.plan.spans.length,coverage:this.plan.ratio};
  }
  build(quality){
    const poles=this.plan.poles,spans=this.plan.spans;
    if(!poles.length)return;
    const cylinder=new THREE.CylinderGeometry(.13,.19,1,8);
    const cube=new THREE.BoxGeometry(1,1,1);
    const insulatorGeo=new THREE.CylinderGeometry(.105,.105,1,8);
    this.ownedGeometries.push(cylinder,cube,insulatorGeo);
    const wood=new THREE.MeshStandardMaterial({color:0x6d5742,roughness:.94});
    const concrete=new THREE.MeshStandardMaterial({color:0xaaa9a0,roughness:.91});
    const steel=new THREE.MeshStandardMaterial({color:0x7c858a,metalness:.76,roughness:.39});
    const ceramic=new THREE.MeshStandardMaterial({color:0xe1ddd0,roughness:.32});
    const cables=new THREE.LineBasicMaterial({color:0x383d40});
    this.ownedMaterials.push(wood,concrete,steel,ceramic,cables);
    const woodList=poles.filter(p=>p.wooden),stoneList=poles.filter(p=>!p.wooden);
    const dummy=new THREE.Object3D();
    const instance=(name,geometry,mat,items,positioner)=>{
      if(!items.length)return null;
      const mesh=new THREE.InstancedMesh(geometry,mat,items.length);
      mesh.name=name;
      for(let i=0;i<items.length;i++){
        positioner(items[i],dummy);
        dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
      mesh.castShadow=quality==='ultra';
      mesh.receiveShadow=true;
      this.scene.add(mesh);this.meshes.push(mesh);
      return mesh;
    };
    const upright=(p,obj)=>{
      obj.position.set(p.x,p.y+3.9,p.z);
      obj.rotation.set(0,0,0);obj.scale.set(1,7.8,1);
    };
    instance('Postes elétricos · madeira',cylinder,wood,woodList,upright);
    instance('Postes elétricos · betão',cylinder,concrete,stoneList,upright);
    instance('Braços metálicos · rede elétrica',cube,steel,poles,(p,obj)=>{
      obj.position.set(p.x,p.y+7.67,p.z);
      obj.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),p.normal);
      obj.scale.set(2.25,.12,.14);
    });
    const insulators=poles.flatMap(p=>[-.72,0,.72].map(offset=>({p,offset})));
    instance('Isoladores elétricos de cerâmica',insulatorGeo,ceramic,
      insulators,({p,offset},obj)=>{
        obj.position.set(p.x+p.normal.x*offset,p.y+7.86,
          p.z+p.normal.z*offset);
        obj.rotation.set(0,0,0);obj.scale.set(1,.30,1);
      });
    const vertices=[];
    for(const {a,b} of spans){
      for(const wire of [-.72,0,.72]){
        const ax=a.x+a.normal.x*wire,az=a.z+a.normal.z*wire;
        const bx=b.x+b.normal.x*wire,bz=b.z+b.normal.z*wire;
        const ay=a.y+7.88,by=b.y+7.88;
        const sections=quality==='low'?5:9;
        for(let j=0;j<sections;j++){
          for(const t of [j/sections,(j+1)/sections]){
            // Catenary sag increases towards the centre of each span.
            const drop=SAG*4*t*(1-t);
            vertices.push(ax+(bx-ax)*t,
              ay+(by-ay)*t-drop,az+(bz-az)*t);
          }
        }
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geo.computeBoundingSphere();
    this.ownedGeometries.push(geo);
    const line=new THREE.LineSegments(geo,cables);
    line.name='Três condutores elétricos · cabos suspensos com flecha';
    this.scene.add(line);this.meshes.push(line);
    // Support collisions are narrow and stay outside the paved carriageway.
    // Static Cannon cylinders would be costlier than these equivalent boxes.
    for(const p of poles){
      const b=new CANNON.Body({mass:0});
      b.addShape(new CANNON.Box(new CANNON.Vec3(.19,3.9,.19)));
      b.position.set(p.x,p.y+3.9,p.z);
      this.physics.addBody(b);this.bodies.push(b);
    }
  }
  dispose(){
    for(const obj of this.meshes)this.scene.remove(obj);
    for(const body of this.bodies)this.physics.removeBody(body);
    for(const geo of this.ownedGeometries)geo.dispose();
    for(const mat of this.ownedMaterials)mat.dispose();
    this.meshes=[];this.bodies=[];
  }
}
