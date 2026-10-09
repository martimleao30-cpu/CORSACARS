import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {createAsphaltMaterial,createGravelMaterial} from './materials.js';

// First expandable playable region: each link begins and ends on the legacy
// ring. Keeping the old road preserves saved spawn positions and old sessions.
// All geometry is collision-enabled, not simply drawn over the terrain.
export const REGIONAL_LINKS = Object.freeze([
  {id:'nacional',name:'EN 201 · Vale Central',surface:'dry',width:10,
    from:35,to:260,
    via:[[-290,-125],[-115,-70],[35,-115],[200,-105],[335,-60]]},
  {id:'autoestrada',name:'A1 · Corredor Central',surface:'dry',width:16,
    from:116,to:240,
    via:[[-160,205],[-45,115],[55,85],[180,90],[310,125]]},
  {id:'montanha',name:'Serra Alta · Miradouro',surface:'dry',width:8,
    from:165,to:215,
    via:[[-70,505],[-95,595],[80,680],[215,600],[360,385]]},
  {id:'rural',name:'Caminho do Pinhal',surface:'dirt',width:7,
    from:337,to:30,
    via:[[35,-480],[-165,-525],[-385,-465],[-455,-320]]},
  {id:'gravilha',name:'Acesso à Pedreira',surface:'gravel',width:8,
    from:65,to:115,
    via:[[-470,-130],[-580,-25],[-525,150],[-375,235]]}
]);

function materialFor(surface,quality) {
  if(surface==='gravel'||surface==='dirt'){
    const mat=createGravelMaterial();
    if(surface==='dirt')mat.color.set(0xbca17d);
    return mat;
  }
  return createAsphaltMaterial(quality);
}
function terrainRoadCurve(p,geometryHeight) {
  const point=p.clone();
  point.y=geometryHeight(point.x,point.z)+.21;
  return point;
}
const sqDistanceToSegment=(x,z,a,b)=>{
  const vx=b.x-a.x,vz=b.z-a.z,denom=vx*vx+vz*vz;
  const t=denom>0?Math.max(0,Math.min(1,((x-a.x)*vx+(z-a.z)*vz)/denom)):0;
  const dx=x-a.x-vx*t,dz=z-a.z-vz*t;
  return dx*dx+dz*dz;
};

export class RoadNetwork {
  constructor(scene,physics,terrainY,ringPoints,ringWidth,quality='high') {
    this.scene=scene;this.physics=physics;this.terrainY=terrainY;
    this.quality=quality;
    this.roads=[{id:'circular',name:'Estrada Circular',surface:'dry',
      width:ringWidth,points:ringPoints.map(p=>p.center)}];
    this.cells=new Map();
    this.materials=new Map();
    this.buildLinks(ringPoints);
    this.buildSurfaceIndex();
  }

  buildLinks(ringPoints) {
    for(const route of REGIONAL_LINKS){
      const [from,to]=[ringPoints[route.from],ringPoints[route.to]];
      if(!from||!to)throw new Error('Ligação à estrada circular inválida: '+route.id);
      const corners=[
        from.center.clone(),
        ...route.via.map(([x,z])=>new THREE.Vector3(x,0,z)),
        to.center.clone()
      ];
      const curve=new THREE.CatmullRomCurve3(corners,false,'centripetal',.4);
      const count=route.id==='montanha'?175:route.id==='rural'?140:130;
      const points=[],vertices=[],uv=[],indices=[];
      for(let i=0;i<=count;i++){
        const u=i/count;
        const p=terrainRoadCurve(curve.getPoint(u),this.terrainY);
        const t=curve.getTangent(u).normalize();
        const side=new THREE.Vector3(-t.z,0,t.x).normalize();
        points.push(p);
        for(const sign of [1,-1]){
          const edge=p.clone().addScaledVector(side,route.width*.5*sign);
          // Follow actual terrain at each edge to prevent floating roads.
          edge.y=this.terrainY(edge.x,edge.z)+.21;
          vertices.push(edge.x,edge.y,edge.z);
        }
        uv.push(0,u*90,1,u*90);
        if(i<count){
          const v=i*2;
          indices.push(v,v+2,v+1,v+1,v+2,v+3);
        }
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mat=materialFor(route.surface,this.quality);
      mat.side=THREE.DoubleSide;
      const road=new THREE.Mesh(geometry,mat);
      road.name=route.name;
      road.receiveShadow=true;
      this.scene.add(road);
      const collider=new CANNON.Body({mass:0,material:new CANNON.Material(route.surface)});
      collider.addShape(new CANNON.Trimesh(vertices,indices));
      this.physics.addBody(collider);
      this.roads.push({...route,points,mesh:road,body:collider});
      this.materials.set(route.id,mat);
      if(route.surface==='dry') {
        const stripe=new THREE.InstancedMesh(new THREE.BoxGeometry(.11,.025,3.2),
          new THREE.MeshStandardMaterial({color:0xe8d9b8,roughness:.91}),Math.ceil(count/5));
        const dummy=new THREE.Object3D();let n=0;
        for(let i=4;i<count;i+=5){
          const p=points[i],next=points[Math.min(count,i+1)];
          dummy.position.copy(p);dummy.position.y+=.08;
          dummy.rotation.set(0,Math.atan2(next.x-p.x,next.z-p.z),0);
          dummy.scale.set(1,1,1);dummy.updateMatrix();
          stripe.setMatrixAt(n++,dummy.matrix);
        }
        stripe.count=n;stripe.instanceMatrix.needsUpdate=true;this.scene.add(stripe);
      }
    }
  }

  buildSurfaceIndex(){
    // Grid accelerator avoids scanning 1000+ road segments at every fixed tick.
    const cellSize=65;
    this.cellSize=cellSize;
    for(const road of this.roads) {
      for(let i=0;i<road.points.length-1;i++) {
        const a=road.points[i],b=road.points[i+1];
        const margin=road.width/2+8;
        const minX=Math.floor((Math.min(a.x,b.x)-margin)/cellSize);
        const maxX=Math.floor((Math.max(a.x,b.x)+margin)/cellSize);
        const minZ=Math.floor((Math.min(a.z,b.z)-margin)/cellSize);
        const maxZ=Math.floor((Math.max(a.z,b.z)+margin)/cellSize);
        for(let cx=minX;cx<=maxX;cx++)for(let cz=minZ;cz<=maxZ;cz++){
          const key=cx+','+cz;
          if(!this.cells.has(key))this.cells.set(key,[]);
          this.cells.get(key).push({road,a,b});
        }
      }
    }
  }

  query(x,z,weather='clear'){
    const key=Math.floor(x/this.cellSize)+','+Math.floor(z/this.cellSize);
    const candidates=this.cells.get(key)||[];
    let road=null, min=Infinity;
    for(const link of candidates){
      const distanceSq=sqDistanceToSegment(x,z,link.a,link.b);
      if(distanceSq<min) {min=distanceSq;road=link.road;}
    }
    if(!road)return {surface:'grass',road:null,distance:Infinity};
    const distance=Math.sqrt(min);
    if(distance<=road.width*.5+.65){
      const type=(road.surface==='dry'&&weather==='rain')?'wet':road.surface;
      return {surface:type,road:road.name,distance};
    }
    if(distance<=road.width*.5+3.1){
      return {surface:'gravel',road:road.name,distance};
    }
    return {surface:'grass',road:null,distance};
  }
}
