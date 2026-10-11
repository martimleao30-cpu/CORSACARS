import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Engineered retaining walls at severe road cuts and fills. The mountain
// route follows its existing hillside contour; a fake "tunnel" with solid
// terrain blocking the entrance would make the game worse, so steep areas
// get collision-backed reinforced embankments and excavated road corridors.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const center=p=>p.center||p;
const side=(a,b)=>{
  const dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz)||1;
  return {nx:-dz/dist,nz:dx/dist,dx:dx/dist,dz:dz/dist};
};
export class RoadSlopeProtection {
  constructor(scene,physics,network,terrainY,river=null,quality='high'){
    this.scene=scene;this.physics=physics;this.network=network;
    this.terrainY=terrainY;this.river=river;this.quality=quality;
    this.meshes=[];this.bodies=[];this.geometries=[];this.materials=[];
    this.statistics={cutWalls:0,fillWalls:0,wallColliders:0,
      protectedMetres:0,skipped:0};
    this.build();
  }
  build(){
    const panels=[],foundations=[],ribs=[];
    // Shared geometry and GPU batches: neither a mesh nor a draw call per wall.
    const geom=new THREE.BoxGeometry(1,1,1);
    const footing=new THREE.BoxGeometry(1,1,1);
    const rib=new THREE.BoxGeometry(1,1,1);
    this.geometries.push(geom,footing,rib);
    const wallMat=new THREE.MeshStandardMaterial({color:0x8b8d84,
      roughness:.94,metalness:.015});
    const baseMat=new THREE.MeshStandardMaterial({color:0x666b67,
      roughness:.97,metalness:.01});
    const trimMat=new THREE.MeshStandardMaterial({color:0xb1b4a8,
      roughness:.9,metalness:.015});
    this.materials.push(wallMat,baseMat,trimMat);
    for(const road of this.network.roads||[]){
      // Local roads and exposed motorway slopes. No protective walls in
      // low-risk streets, quarry tracks or crossings by default.
      if(!['mountain','rural','highway'].includes(road.category))continue;
      const pts=road.points.map(center);
      const stride=road.category==='mountain'?4:3;
      // Limit Cannon collision bodies to ~100 m sections. One enormous
      // static body covering the whole 4 km map would have an enormous AABB
      // and force the car to test unrelated walls on every physics frame.
      const chunks=new Map();
      for(let i=5;i+stride<pts.length-4;i+=stride){
        const a=pts[i],b=pts[i+stride];
        const length=Math.hypot(b.x-a.x,b.z-a.z);
        if(length<2||length>27)continue;
        const n=side(a,b),y=(a.y+b.y)*.5-.21;
        for(const sign of [-1,1]){
          const offset=road.width*.5+(road.category==='highway'?16:8.6);
          const cx=(a.x+b.x)*.5+n.nx*offset*sign;
          const cz=(a.z+b.z)*.5+n.nz*offset*sign;
          const cut=this.terrainY(cx,cz)-y;
          if(Math.abs(cut)<2.6)continue;
          const closeToJunction=(this.network.junctions||[]).some(j=>
            Math.hypot(j.x-cx,j.z-cz)<Math.max(19,j.halfU||0,j.halfV||0)+6);
          if(closeToJunction||this.river?.contains(cx,cz,15)){
            this.statistics.skipped++;continue;
          }
          const height=clamp(Math.abs(cut)*.45+.8,1.5,5.4);
          const isCut=cut>0;
          const midY=isCut?y-.35+height*.5:y-.30-height*.5;
          const yaw=Math.atan2(n.dx,n.dz);
          const wall={x:cx,y:midY,z:cz,sx:.48,sy:height,sz:length+.22,yaw};
          panels.push(wall);
          foundations.push({...wall,y:isCut?y-.33:y-.3-height+.08,
            sx:.85,sy:.27,sz:length+.34});
          for(const local of [-.48,.48])
            ribs.push({...wall,
              x:cx+n.dx*length*local,z:cz+n.dz*length*local,
              sx:.70,sy:height+.05,sz:.22});
          const rotation=new CANNON.Quaternion();
          rotation.setFromAxisAngle(new CANNON.Vec3(0,1,0),yaw);
          const chunkKey=Math.floor(i/(stride*12))+':'+sign;
          let body=chunks.get(chunkKey);
          if(!body){
            body=new CANNON.Body({mass:0,
              material:new CANNON.Material('reinforced-earthwork')});
            body.position.set(a.x,0,a.z);
            chunks.set(chunkKey,body);
          }
          body.addShape(new CANNON.Box(
            new CANNON.Vec3(.24,height*.5,(length+.22)*.5)),
            new CANNON.Vec3(cx-body.position.x,midY,cz-body.position.z),
            rotation);
          this.statistics[isCut?'cutWalls':'fillWalls']++;
          this.statistics.wallColliders++;
          this.statistics.protectedMetres+=length;
        }
      }
      for(const body of chunks.values()){
        if(!body.shapes.length)continue;
        this.physics.addBody(body);
        this.bodies.push(body);
      }
    }
    const add=(name,geo,mat,items)=>{
      if(!items.length)return;
      const mesh=new THREE.InstancedMesh(geo,mat,items.length);
      mesh.name=name;
      const obj=new THREE.Object3D();
      for(let i=0;i<items.length;i++){
        const p=items[i];
        obj.position.set(p.x,p.y,p.z);
        obj.rotation.set(0,p.yaw,0);
        obj.scale.set(p.sx,p.sy,p.sz);
        obj.updateMatrix();
        mesh.setMatrixAt(i,obj.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow=true;
      mesh.castShadow=this.quality==='ultra';
      this.scene.add(mesh);
      this.meshes.push(mesh);
    };
    add('Contenção de encosta · painéis de betão',geom,wallMat,panels);
    add('Contenção de encosta · fundações',footing,baseMat,foundations);
    add('Contenção de encosta · juntas verticais',rib,trimMat,ribs);
    this.statistics.protectedMetres=Math.round(this.statistics.protectedMetres);
  }
  dispose(){
    for(const body of this.bodies)this.physics.removeBody(body);
    for(const mesh of this.meshes)this.scene.remove(mesh);
    for(const geo of this.geometries)geo.dispose();
    for(const mat of this.materials)mat.dispose();
    this.meshes.length=0;this.bodies.length=0;
  }
}
