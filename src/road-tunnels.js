import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// A real covered, driveable gallery rather than a decorative portal placed
// against intact mountainside. The tunnel and the heightfield are excavated
// from the same aligned road. Lining + roof have their own collision meshes.
export const TUNNEL_ROAD_ID='tunel-serra';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
const getPoint=p=>p.center||p;

export function tunnelRange(road){
  if(!road?.tunnel||road.points.length<3)return null;
  const pts=road.points.map(getPoint),chain=[0];
  for(let i=1;i<pts.length;i++)
    chain[i]=chain[i-1]+Math.hypot(pts[i].x-pts[i-1].x,
      pts[i].z-pts[i-1].z);
  const first=road.tunnel.start*chain.at(-1);
  const last=road.tunnel.end*chain.at(-1);
  let start=chain.findIndex(v=>v>=first);
  let end=chain.findIndex(v=>v>=last);
  start=Math.max(3,start);
  end=Math.min(pts.length-4,Math.max(start+5,end));
  return {start,end,pts,chain,length:chain[end]-chain[start],
    halfWidth:road.tunnel.halfWidth||6.6,
    height:road.tunnel.clearance||7.3};
}
const normal=(points,index)=>{
  const a=points[Math.max(0,index-1)],b=points[Math.min(points.length-1,index+1)];
  const dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz)||1;
  return {x:-dz/dist,z:dx/dist,tx:dx/dist,tz:dz/dist};
};

// The tunnel is represented by a huge ellipse with straight footings at
// both edges: 6.5m carriageway, ~13m interior width and 7.3m clearance.
export class RoadTunnels{
  constructor(scene,physics,network,terrainY,quality='high'){
    this.scene=scene;this.physics=physics;this.network=network;
    this.terrainY=terrainY;this.quality=quality;
    this.roads=network.roads.filter(r=>r.id===TUNNEL_ROAD_ID&&r.tunnel);
    this.meshes=[];this.bodies=[];this.materials=[];this.geometries=[];
    this.lights=[];this.positions=[];
    this.portals=[];this.ranges=new Map();
    this.statistics={count:0,lengthM:0,portals:0,liningSegments:0,
      collisionBodies:0,lamps:0,ventilationUnits:0,emergencyStations:0,
      earthworkVertices:0};
    this.concrete=new THREE.MeshStandardMaterial({color:0x9a9c92,roughness:.92,
      metalness:.015,side:THREE.DoubleSide});
    this.outerStone=new THREE.MeshStandardMaterial({color:0x70786d,roughness:.98,
      metalness:0,side:THREE.DoubleSide});
    this.portalConcrete=new THREE.MeshStandardMaterial({color:0xb8bab2,
      roughness:.82,metalness:.015,side:THREE.DoubleSide});
    this.panel=new THREE.MeshStandardMaterial({color:0x4f5c62,roughness:.67,
      metalness:.42,side:THREE.DoubleSide});
    this.reflector=new THREE.MeshStandardMaterial({color:0xe6e3ce,
      roughness:.32,metalness:.22,emissive:0xc9d7cf,emissiveIntensity:.38});
    this.lamp=new THREE.MeshStandardMaterial({color:0xfff0ca,roughness:.28,
      emissive:0xfff0d8,emissiveIntensity:3.6,side:THREE.DoubleSide});
    this.emergency=new THREE.MeshStandardMaterial({color:0x325c57,roughness:.68,
      emissive:0x24675e,emissiveIntensity:.6});
    this.materials.push(this.concrete,this.outerStone,this.portalConcrete,
      this.panel,this.reflector,this.lamp,this.emergency);
    for(const road of this.roads){
      const range=tunnelRange(road);
      if(!range)continue;
      this.ranges.set(road.id,range);
      this.buildLining(road,range);
      this.buildCover(road,range);
      this.buildPortal(road,range,range.start,-1);
      this.buildPortal(road,range,range.end,1);
      this.buildFixtures(road,range);
      this.statistics.count++;
      this.statistics.lengthM+=Math.round(range.length);
    }
    // Only a small pool of movable, true realtime spotlights is active.
    // Hundreds of visible fluorescent strips remain GPU-batched emissive.
    const n=this.statistics.count?6:0;
    for(let i=0;i<n;i++){
      const light=new THREE.PointLight(0xffead3,0,24,2);
      light.name='Túnel · iluminação real próxima do condutor';
      scene.add(light);this.lights.push(light);
    }
  }
  addGeometry(geometry,material,name,{collide=false}={}){
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=name;mesh.receiveShadow=true;
    if(collide)mesh.castShadow=this.quality==='ultra';
    this.scene.add(mesh);
    this.meshes.push(mesh);this.geometries.push(geometry);
    if(collide&&geometry.index?.count){
      const body=new CANNON.Body({mass:0,
        material:new CANNON.Material('tunnel-concrete')});
      body.addShape(new CANNON.Trimesh(
        Array.from(geometry.getAttribute('position').array),
        Array.from(geometry.index.array)));
      this.physics.addBody(body);this.bodies.push(body);
      this.statistics.collisionBodies++;
    }
    return mesh;
  }
  buildLining(road,r){
    // Physical shell in 50–70m chunks for efficient Cannon broadphase.
    const across=this.quality==='low'?12:20;
    const span=12;
    for(let start=r.start;start<r.end;start+=span){
      const end=Math.min(r.end,start+span);
      const positions=[],uv=[],indices=[],inner=[];
      for(let i=start;i<=end;i++){
        const p=r.pts[i],n=normal(r.pts,i);
        const station=r.chain[i]-r.chain[r.start];
        for(let j=0;j<=across;j++){
          const u=j/across,theta=Math.PI*(1-u);
          const bank=Math.cos(theta);
          const raised=Math.sin(theta);
          // 80cm of reinforced lining in a real curved arch.
          for(const thickness of [0,.77]){
            const w=r.halfWidth+thickness;
            const h=r.height+thickness;
            const x=p.x+n.x*w*bank,z=p.z+n.z*w*bank;
            const y=p.y-.26+h*raised;
            positions.push(x,y,z);
            uv.push(station/5,u*3);
          }
        }
        if(i===end)continue;
        const begin=(i-start)*(across+1)*2;
        const next=begin+(across+1)*2;
        for(let j=0;j<across;j++){
          const a=begin+j*2,b=next+j*2;
          // Two separate concentric layers and thickness side-walls.
          indices.push(a,b,a+2,a+2,b,b+2);
          indices.push(a+1,a+3,b+1,a+3,b+3,b+1);
        }
        // Flat footings close the lining below the shoulder.
        const left=begin,right=begin+across*2;
        const nextLeft=next,nextRight=next+across*2;
        indices.push(left,left+1,nextLeft,nextLeft,left+1,nextLeft+1);
        indices.push(right,nextRight,right+1,right+1,nextRight,nextRight+1);
      }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      geo.setIndex(indices);
      geo.userData.corsaTunnel='drivable-arched-lined-gallery';
      this.addGeometry(geo,this.concrete,
        'Túnel Monumental · abóbada e paredes com colisão',{collide:true});
      this.statistics.liningSegments+=end-start;
    }
  }
  buildCover(road,r){
    // Build a closed, realistic soil-covered roof. The whole excavated trench
    // is sealed with surface contours blending back into untouched mountain
    // beyond 30m; no daylight gap between the road and tunnel roof.
    const pos=[],uv=[],indices=[];
    const rings=[-31,-24,-17,-10,-6,0,6,10,17,24,31];
    for(let i=r.start;i<=r.end;i++){
      const p=r.pts[i],n=normal(r.pts,i);
      const along=r.chain[i]-r.chain[r.start];
      const fade=smooth(Math.min((along+1)/26,
        (r.length-along+1)/26));
      for(const offset of rings){
        const x=p.x+n.x*offset,z=p.z+n.z*offset;
        const outer=this.terrainY(x,z);
        const roof=p.y+r.height+.58;
        // The central crown always covers the ceiling, with a blended
        // shoulder of natural rubble/sod that hides the trench cut.
        const closeness=1-smooth((Math.abs(offset)-7.3)/23.7);
        const y=lerp(outer,Math.max(roof,outer),closeness*fade);
        pos.push(x,y+.02,z);
        uv.push(offset*.12,along*.12);
      }
      if(i===r.end)continue;
      const a=(i-r.start)*rings.length,b=a+rings.length;
      for(let j=0;j<rings.length-1;j++)
        indices.push(a+j,b+j,a+j+1,a+j+1,b+j,b+j+1);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.setIndex(indices);
    geo.userData.corsaTunnel='earth-covered-roof';
    this.addGeometry(geo,this.outerStone,
      'Cobertura montanhosa do túnel · terra e rocha');
  }
  buildPortal(road,r,index,sign){
    const p=r.pts[index],n=normal(r.pts,index);
    const back={x:n.tx*sign,z:n.tz*sign},half=r.halfWidth;
    const positions=[],indices=[],uv=[],across=26;
    // Two nested arched front and back walls, with a genuine open aperture:
    // no planar wall blocking the drivable entrance.
    for(let j=0;j<=across;j++){
      const theta=Math.PI*(1-j/across),co=Math.cos(theta),si=Math.sin(theta);
      for(const outer of [false,true]){
        const w=half+(outer?1.25:0),h=r.height+(outer?1.2:0);
        const x=p.x+n.x*w*co,z=p.z+n.z*w*co;
        const y=p.y-.23+h*si;
        for(const depth of [0,1.5]){
          positions.push(x+back.x*depth,y,z+back.z*depth);
          uv.push(j/across,depth);
        }
      }
      if(j===across)continue;
      const k=j*4,next=k+4;
      // Extruded face, outer cap and inside soffit with real arch opening.
      for(const a of [0,1]){
        indices.push(k+a,next+a,k+2+a,k+2+a,next+a,next+2+a);
      }
      indices.push(k,k+1,next,k+1,next+1,next);
      indices.push(k+2,next+2,k+3,k+3,next+2,next+3);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.setIndex(indices);
    geo.userData.corsaTunnel='open-road-portal';
    this.addGeometry(geo,this.portalConcrete,'Portal do Túnel · pórtico monumental',
      {collide:true});
    this.portals.push({x:p.x,y:p.y,z:p.z,index,sign});
    this.statistics.portals++;
  }
  buildFixtures(road,r){
    // Multi-component architecture without a mesh per metre.
    const lights=[],ribs=[],guides=[],emergencies=[],ventilation=[];
    const points=r.pts;
    for(let i=r.start+2;i<r.end-2;i+=3){
      const p=points[i],n=normal(points,i);
      const distance=r.chain[i]-r.chain[r.start];
      const yaw=Math.atan2(n.tx,n.tz);
      const station=Math.floor((i-r.start-2)/3);
      const part=(out,x,y,z,sx,sy,sz)=>{
        out.push({x,y,z,sx,sy,sz,yaw});
      };
      if(station%2===0){
        part(lights,p.x,p.y+r.height-.37,p.z,2.6,.085,.34);
        this.positions.push(new THREE.Vector3(p.x,p.y+r.height-.62,p.z));
        this.statistics.lamps++;
      }
      if(station%3===0){
        for(const side of [-1,1]){
          part(guides,p.x+n.x*side*(r.halfWidth-.14),p.y+.77,
            p.z+n.z*side*(r.halfWidth-.14),.04,.1,.34);
        }
      }
      if(station%6===0){
        part(ribs,p.x,p.y+r.height-.42,p.z,r.halfWidth*1.45,.12,.25);
      }
      if(station%9===0){
        part(ventilation,p.x,p.y+r.height-.95,p.z,1.7,.37,1.7);
        this.statistics.ventilationUnits++;
      }
      if(station%10===0){
        const x=p.x+n.x*(r.halfWidth-.16),z=p.z+n.z*(r.halfWidth-.16);
        part(emergencies,x,p.y+1.37,z,.17,1.38,.78);
        this.statistics.emergencyStations++;
      }
    }
    const cube=new THREE.BoxGeometry(1,1,1);
    this.geometries.push(cube);
    const addInstances=(name,mat,locations)=>{
      if(!locations.length)return;
      const mesh=new THREE.InstancedMesh(cube,mat,locations.length);
      const dummy=new THREE.Object3D();
      for(let i=0;i<locations.length;i++){
        const p=locations[i];
        dummy.position.set(p.x,p.y,p.z);
        dummy.rotation.set(0,p.yaw,0);
        dummy.scale.set(p.sx,p.sy,p.sz);
        dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
      mesh.name=name;mesh.receiveShadow=true;
      this.scene.add(mesh);this.meshes.push(mesh);
    };
    addInstances('LEDs brancos do teto · luzes de segurança',this.lamp,lights);
    addInstances('Túnel · juntas de dilatação e reforços',this.panel,ribs);
    addInstances('Túnel · refletores nas paredes',this.reflector,guides);
    addInstances('Túnel · ventoinhas e galerias de ventilação',this.panel,ventilation);
    addInstances('Túnel · postos de emergência iluminados',this.emergency,emergencies);
  }
  carveTerrain(geometry){
    const attribute=geometry.getAttribute('position');
    let affected=0;
    const cellSize=48,cells=new Map();
    for(const r of this.ranges.values()){
      for(let i=r.start;i<r.end;i++){
        const a=r.pts[i],b=r.pts[i+1],reach=31;
        const minX=Math.floor((Math.min(a.x,b.x)-reach)/cellSize);
        const maxX=Math.floor((Math.max(a.x,b.x)+reach)/cellSize);
        const minZ=Math.floor((Math.min(a.z,b.z)-reach)/cellSize);
        const maxZ=Math.floor((Math.max(a.z,b.z)+reach)/cellSize);
        for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
          const key=x+','+z;
          if(!cells.has(key))cells.set(key,[]);
          cells.get(key).push([a,b,r]);
        }
      }
    }
    for(let i=0;i<attribute.count;i++){
      const x=attribute.getX(i),z=attribute.getZ(i);
      const near=cells.get(Math.floor(x/cellSize)+','+Math.floor(z/cellSize))||[];
      let closest=Infinity,target=null,roadWidth=0;
      for(const [a,b,r] of near){
        const dx=b.x-a.x,dz=b.z-a.z,d=dx*dx+dz*dz;
        const t=d?clamp(((x-a.x)*dx+(z-a.z)*dz)/d,0,1):0;
        const dist=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
        if(dist<closest){closest=dist;target=lerp(a.y,b.y,t);
          roadWidth=r.halfWidth;}
      }
      if(target===null||closest>roadWidth+24)continue;
      const old=attribute.getY(i);
      const floor=target-.76;
      const spread=closest<=roadWidth+5?1:
        1-smooth((closest-roadWidth-5)/19);
      const newHeight=Math.min(old,lerp(old,floor,spread));
      if(newHeight>=old-.006)continue;
      attribute.setY(i,newHeight);affected++;
    }
    if(affected){
      attribute.needsUpdate=true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();geometry.computeBoundingBox();
    }
    this.statistics.earthworkVertices=affected;
    return affected;
  }
  update(vehiclePosition){
    if(!vehiclePosition)return;
    const ranked=this.positions.map(p=>({
      p,dist2:(p.x-vehiclePosition.x)**2+
        (p.y-vehiclePosition.y)**2+(p.z-vehiclePosition.z)**2
    })).filter(x=>x.dist2<180*180).sort((a,b)=>a.dist2-b.dist2);
    for(let i=0;i<this.lights.length;i++){
      const light=this.lights[i],chosen=ranked[i];
      light.intensity=chosen?2.2:0;
      if(chosen)light.position.copy(chosen.p);
    }
  }
  dispose(){
    for(const light of this.lights)this.scene.remove(light);
    for(const body of this.bodies)this.physics.removeBody(body);
    for(const mesh of this.meshes)this.scene.remove(mesh);
    for(const geometry of this.geometries)geometry.dispose();
    for(const material of this.materials)material.dispose();
    this.meshes.length=0;this.bodies.length=0;this.lights.length=0;
  }
}
