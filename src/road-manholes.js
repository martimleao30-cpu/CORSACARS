import * as THREE from 'three';
import {roadDeckHeight} from './road-upgrades.js';

// Inspection covers belong on the carriageway service network, NEVER on
// motorways, motorway ramps, dirt roads or the dedicated test track.
export function manholeRoadEligible(road){
  return !!road?.points&&road.points.length>1&&
    road.surface==='dry'&&road.width>=5 &&
    (road.id==='circular'||['urban','rural','mountain'].includes(road.category));
}
const junctionConflict=(network,x,z,road)=>{
  for(const j of network.junctions||[]){
    const radius=Math.max(road.width*.6,Math.max(j.halfU||0,j.halfV||0))+8;
    if((j.x-x)**2+(j.z-z)**2<radius*radius)return true;
  }
  return false;
};
const stepFor=road=>road.category==='urban'?52:
  road.id==='circular'?86:road.category==='mountain'?128:112;

export function planRoadManholes(network,terrainY,river=null){
  const placements=[];
  for(const road of network.roads||[]){
    if(!manholeRoadEligible(road))continue;
    const points=road.points.map(p=>p.center||p);
    const cumulative=[0];
    for(let i=1;i<points.length;i++)
      cumulative.push(cumulative[i-1]+Math.hypot(points[i].x-points[i-1].x,
        points[i].z-points[i-1].z));
    const total=cumulative.at(-1),step=stepFor(road);
    let segment=0,index=0;
    for(let distance=step*.55;distance<total-step*.4;distance+=step){
      while(segment<points.length-2&&cumulative[segment+1]<distance)segment++;
      const a=points[segment],b=points[segment+1];
      const along=cumulative[segment+1]-cumulative[segment];
      if(along<1e-4)continue;
      const t=(distance-cumulative[segment])/along;
      const dx=(b.x-a.x)/along,dz=(b.z-a.z)/along;
      const lateral=(index++%2===0?1:-1)*Math.min(road.width*.22,1.6);
      const x=a.x+(b.x-a.x)*t-dz*lateral;
      const z=a.z+(b.z-a.z)*t+dx*lateral;
      if(junctionConflict(network,x,z,road)||
        river?.contains(x,z,road.width*.55+3))continue;
      // The covers follow the existing cambered and height-mapped asphalt.
      const deckY=roadDeckHeight(terrainY,x,z,lateral,road.width);
      placements.push({roadId:road.id,category:road.category,
        distance,x,z,y:deckY+.015,yaw:Math.atan2(dx,dz),deckY});
    }
  }
  return placements;
}

// One true 3D steel cover, with a recessed circular frame, raised perimeter,
// embossed traction slots and centre boss. No per-cover draw calls.
export function createManholeCoverGeometry(){
  const disk=new THREE.CylinderGeometry(.43,.43,.020,32);
  disk.userData.corsaManhole='cast-iron-inspection-cover';
  return disk;
}
export class RoadManholes{
  constructor(scene,network,terrainY,river=null){
    this.scene=scene;
    this.placements=planRoadManholes(network,terrainY,river);
    this.meshes=[];this.geometries=[];this.materials=[];
    this.statistics={
      total:this.placements.length,
      motorway:0,
      byRoad:Object.fromEntries([...new Set(this.placements.map(p=>p.roadId))]
        .map(id=>[id,this.placements.filter(p=>p.roadId===id).length]))
    };
    if(!this.placements.length)return;
    const iron=new THREE.MeshStandardMaterial({color:0x3b4140,roughness:.78,
      metalness:.62,side:THREE.DoubleSide});
    const rim=new THREE.MeshStandardMaterial({color:0x5b6462,roughness:.67,
      metalness:.65});
    this.materials.push(iron,rim);
    const plate=createManholeCoverGeometry();
    const outerRim=new THREE.TorusGeometry(.443,.027,7,32);
    outerRim.rotateX(Math.PI/2);
    const boss=new THREE.CylinderGeometry(.095,.095,.008,16);
    const ribs=new THREE.BoxGeometry(.35,.009,.025);
    this.geometries.push(plate,outerRim,boss,ribs);
    const batch=(label,geo,mat,count,placement)=>{
      const mesh=new THREE.InstancedMesh(geo,mat,count);
      mesh.name=label;
      const obj=new THREE.Object3D();
      for(let i=0;i<count;i++){
        const p=placement(i);
        obj.position.set(p.x,p.y,p.z);
        obj.rotation.set(0,p.yaw||0,0);
        obj.scale.set(1,1,1);obj.updateMatrix();
        mesh.setMatrixAt(i,obj.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();mesh.receiveShadow=true;
      scene.add(mesh);this.meshes.push(mesh);
      return mesh;
    };
    const p=this.placements;
    this.coverMesh=batch('Tampas de saneamento · ferro fundido embutido',
      plate,iron,p.length,i=>({...p[i],y:p[i].deckY+.009}));
    this.frameMesh=batch('Tampas de saneamento · aro circular',
      outerRim,rim,p.length,i=>({...p[i],y:p[i].deckY+.020}));
    this.bossMesh=batch('Tampas de saneamento · centro gravado',
      boss,rim,p.length,i=>({...p[i],y:p[i].deckY+.024}));
    this.ribMesh=batch('Tampas de saneamento · relevo antiderrapante',
      ribs,rim,p.length*4,i=>{
        const cover=p[Math.floor(i/4)],n=i%4;
        return {...cover,y:cover.deckY+.022,yaw:cover.yaw+n*Math.PI/4};
      });
    // Asphalt already provides exact driving collision beneath the flush lid.
    // Adding raised rigid bodies would make wheels bounce on every manhole.
  }
  dispose(){
    for(const mesh of this.meshes)this.scene.remove(mesh);
    for(const geometry of this.geometries)geometry.dispose();
    for(const material of this.materials)material.dispose();
    this.meshes.length=0;
  }
}
