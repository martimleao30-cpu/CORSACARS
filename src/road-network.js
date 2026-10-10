import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {createAsphaltMaterial,createGravelMaterial} from './materials.js';
import {createRoadBed,addRoadSides,addRoadWear,addRoadShoulders} from './road-upgrades.js';
import {resolveRoadJunctions} from './road-junctions.js';

// First expandable playable region: each link begins and ends on the legacy
// ring. Keeping the old road preserves saved spawn positions and old sessions.
// All geometry is collision-enabled, not simply drawn over the terrain.
export const REGIONAL_LINKS = Object.freeze([
  {id:'nacional',name:'EN 201 · Vale Central',category:'urban',surface:'dry',width:10,
    from:35,to:260,
    via:[[-290,-125],[-115,-70],[35,-115],[200,-105],[335,-60]]},
  {id:'autoestrada',name:'A1 · Corredor Central',category:'highway',surface:'dry',width:16,
    from:116,to:240,
    via:[[-160,205],[-45,115],[55,85],[180,90],[310,125]]},
  {id:'montanha',name:'Serra Alta · Miradouro',category:'mountain',surface:'dry',width:8,
    from:165,to:215,
    via:[[-70,505],[-95,595],[80,680],[215,600],[360,385]]},
  {id:'rural',name:'Caminho do Pinhal',category:'rural',surface:'dry',width:7,
    from:337,to:30,
    via:[[35,-480],[-165,-525],[-385,-465],[-455,-320]]},
  {id:'gravilha',name:'Acesso à Pedreira',category:'dirt',surface:'gravel',width:8,
    from:65,to:115,
    via:[[-470,-130],[-580,-25],[-525,150],[-375,235]]},
  {id:'terra',name:'Trilho de Terra do Vale',category:'dirt',surface:'dirt',width:6,
    from:290,to:270,
    via:[[295,-415],[440,-505],[570,-445],[510,-310]]},
  {id:'provas',name:'Centro de Testes Físicos',category:'test',surface:'dry',width:13,
    from:343,to:20,
    via:[[125,-470],[-65,-620],[-260,-650],[-440,-550],[-415,-375]]},
  // Road expansion: three connected excursions beyond the former 2 km map.
  // Old ring indices and spawn positions are stable for existing saves.
  {id:'serra-norte',name:'Estrada da Serra Norte',category:'mountain',surface:'dry',
    width:8,from:165,to:215,
    via:[[-220,720],[-540,990],[-790,1260],[-1090,1120],
      [-1040,820],[-750,600],[-360,480]]},
  {id:'planicie-sul',name:'Estrada das Herdades',category:'rural',surface:'dry',
    width:8,from:337,to:30,
    via:[[-550,-620],[-850,-920],[-1190,-1210],[-1390,-1000],
      [-1280,-680],[-920,-550],[-650,-410]]},
  {id:'vale-leste',name:'Estrada da Ribeira Leste',category:'rural',surface:'dry',
    width:8,from:245,to:295,
    via:[[440,-400],[700,-700],[1070,-1040],[1390,-920],
      [1410,-540],[1050,-260],[690,-280]]},
  // Outer western agricultural loop stays within the 4.1 km terrain.
  {id:'campos-oeste',name:'Estrada dos Campos do Oeste',
    category:'rural',surface:'dry',width:7.8,from:67,to:143,
    via:[[-650,80],[-1080,200],[-1520,320],[-1800,430],
      [-1710,780],[-1270,830],[-720,620]]}
]);

function materialFor(surface,quality,routeId='') {
  if(surface==='gravel'||surface==='dirt'){
    const mat=createGravelMaterial();
    if(surface==='dirt')mat.color.set(0xbca17d);
    return mat;
  }
  return createAsphaltMaterial(quality,routeId==='autoestrada'||routeId==='provas'?'fresh':(routeId==='montanha'||routeId==='rural')?'worn':'aged');
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
    this.buildConnectors(ringPoints);
    this.resolveJunctions();
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
      const extended=['serra-norte','planicie-sul','vale-leste','campos-oeste'].includes(route.id);
      const count=extended?240:route.id==='montanha'?175:route.id==='rural'?140:130;
      const points=[];
      for(let i=0;i<=count;i++){
        points.push(terrainRoadCurve(curve.getPoint(i/count),this.terrainY));
      }
      const bed=createRoadBed(points,route.width,this.terrainY,route.from,route.surface);
      const mat=materialFor(route.surface,this.quality,route.id);
      const road=new THREE.Mesh(bed.top,mat);
      road.name=route.name;
      road.receiveShadow=true;
      this.scene.add(road);
      const sides=addRoadSides(this.scene,bed.sides,route.name);
      const shoulderMaterial=createGravelMaterial();
      const shoulders=addRoadShoulders(this.scene,points,route.width,
        this.terrainY,shoulderMaterial);
      const wear=route.surface==='dry'?
        addRoadWear(this.scene,points,route.width,this.terrainY,this.quality,route.to):null;
      const vertices=Array.from(bed.top.getAttribute('position').array);
      const indices=Array.from(bed.top.index.array);
      const collider=new CANNON.Body({mass:0,material:new CANNON.Material(route.surface)});
      collider.addShape(new CANNON.Trimesh(vertices,indices));
      this.physics.addBody(collider);
      this.roads.push({...route,points,mesh:road,body:collider,sides,shoulders,wear});
      this.materials.set(route.id,mat);
      // Curved line and arrow geometry is generated by RoadSignage.

    }
  }

  // Accessible auxiliary roads: a town cross street and real 3D motorway ramps.
  // Their ends overlap the parent decks and the circular road, with Cannon
  // triangles and spatial road lookup, not just painted signs.
  buildConnectors(ringPoints) {
    const definitions=[
      {id:'rua-lateral',name:'Rua da Praça · Cruzamento',category:'urban',
        parent:'nacional',sample:71,side:1,width:6.2,seed:142},
      {id:'rampa-entrada',name:'A1 · Entrada',category:'highway-ramp',
        parent:'autoestrada',sample:29,side:1,width:5.2,seed:203},
      {id:'rampa-saida',name:'A1 · Saída',category:'highway-ramp',
        parent:'autoestrada',sample:100,side:-1,width:5.2,seed:204}
    ];
    this.connectors=[];
    for(const def of definitions){
      const parent=this.roads.find(road=>road.id===def.parent);
      if(!parent)continue;
      const i=Math.min(parent.points.length-2,def.sample);
      const p=parent.points[i];
      const tangent=parent.points[i+1].clone().sub(parent.points[i-1]).setY(0).normalize();
      const lateral=new THREE.Vector3(-tangent.z,0,tangent.x);
      const start=p.clone().addScaledVector(lateral,def.side*parent.width*.34);
      let nearest=0,min=Infinity;
      for(let j=0;j<ringPoints.length-1;j++){
        const target=ringPoints[j].center;
        const d=start.distanceToSquared(target);
        if(d<min){min=d;nearest=j;}
      }
      const finish=ringPoints[nearest].center.clone();
      const ringTangent=ringPoints[nearest].tangent?.clone().setY(0).normalize() ||
        ringPoints[(nearest+1)% (ringPoints.length-1)].center.clone()
          .sub(ringPoints[(nearest+ringPoints.length-2)%(ringPoints.length-1)].center)
          .setY(0).normalize();
      const span=Math.sqrt(min);
      // Avoid tight kinks; tangent handles scale with actual connector length.
      const handle=Math.min(36,Math.max(11,span*.22));
      const bend=[
        start,
        start.clone().addScaledVector(tangent,handle),
        finish.clone().addScaledVector(ringTangent,-handle),
        finish
      ];
      const curve=new THREE.CatmullRomCurve3(bend,false,'centripetal',.4);
      const count=Math.max(34,Math.ceil(span/3.3));
      const points=Array.from({length:count+1},(_,index)=>
        terrainRoadCurve(curve.getPoint(index/count),this.terrainY));
      const bed=createRoadBed(points,def.width,this.terrainY,def.seed,'dry');
      const mat=createAsphaltMaterial(this.quality,def.category==='urban'?'aged':'fresh');
      const mesh=new THREE.Mesh(bed.top,mat);
      mesh.name=def.name;mesh.receiveShadow=true;this.scene.add(mesh);
      const sides=addRoadSides(this.scene,bed.sides,def.name);
      const shoulders=addRoadShoulders(this.scene,points,def.width,this.terrainY,createGravelMaterial());
      const vertices=Array.from(bed.top.getAttribute('position').array);
      const faces=Array.from(bed.top.index.array);
      const body=new CANNON.Body({mass:0,material:new CANNON.Material('dry')});
      body.addShape(new CANNON.Trimesh(vertices,faces));
      this.physics.addBody(body);
      const item={...def,surface:'dry',points,mesh,body,sides,shoulders};
      this.roads.push(item);this.connectors.push(item);
      this.materials.set(def.id,mat);
    }
  }

  resolveJunctions(){
    return resolveRoadJunctions(this,this.physics);
  }

  setWetness(wetness) {
    const w=Math.max(0,Math.min(1,wetness));
    for(const material of this.materials.values()){
      if(!material.userData.roadAsphalt)continue;
      material.clearcoat=.06+.8*w;
      material.clearcoatRoughness=.25-.12*w;
      material.roughness=(material.userData.variant==='fresh'?.91:.97)-.42*w;
      material.color.setRGB(1-.24*w,1-.23*w,1-.20*w);
    }
  }

  buildSurfaceIndex(){
    // Grid accelerator avoids scanning 1000+ road segments at every fixed tick.
    const cellSize=65;
    this.cellSize=cellSize;
    this.junctionCells=new Map();
    for(const j of this.junctions||[]){
      const bound=Math.hypot(j.halfU,j.halfV)+1;
      for(let ix=Math.floor((j.x-bound)/cellSize);ix<=Math.floor((j.x+bound)/cellSize);ix++)
        for(let iz=Math.floor((j.z-bound)/cellSize);iz<=Math.floor((j.z+bound)/cellSize);iz++){
          const key=ix+','+iz;
          if(!this.junctionCells.has(key))this.junctionCells.set(key,[]);
          this.junctionCells.get(key).push(j);
        }
    }
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
          this.cells.get(key).push({road,a,b,index:i});
        }
      }
    }
  }

  query(x,z,weather='clear'){
    const key=Math.floor(x/this.cellSize)+','+Math.floor(z/this.cellSize);
    const candidates=this.cells.get(key)||[];
    let road=null, min=Infinity, closestSegment=null;
    // At junctions the higher-priority road owns the asphalt and its grip.
    // The secondary deck has been physically removed from the overlap.
    // Sample the same ownership rule so traction matches visible geometry.
    const joins=this.junctionCells?.get(key)||[];
    for(const j of joins){
      const dx=x-j.x,dz=z-j.z;
      const u=dx*j.ux+dz*j.uz;
      const v=-dx*j.uz+dz*j.ux;
      if(Math.abs(u)<=j.halfU&&Math.abs(v)<=j.primary.width*.5){
        const road=j.primary;
        let type=road.surface==='dry'&&weather==='rain'?'wet':road.surface;
        return {surface:type,road:road.name,distance:Math.abs(v)};
      }
    }
    for(const link of candidates){
      const distanceSq=sqDistanceToSegment(x,z,link.a,link.b);
      if(distanceSq<min) {min=distanceSq;road=link.road;closestSegment=link;}
    }
    if(!road)return {surface:'grass',road:null,distance:Infinity};
    const distance=Math.sqrt(min);
    if(distance<=road.width*.5+.65){
      let type=(road.surface==='dry'&&weather==='rain')?'wet':road.surface;
      if(road.id==='provas'){
        const u=closestSegment.index/(road.points.length-1);
        if(u>.50&&u<.59)type='dirt';
        if(u>=.59&&u<.72)type='wet';
        if(u>=.72&&u<.80)type='gravel';
      }
      return {surface:type,road:road.name,distance};
    }
    if(distance<=road.width*.5+3.1){
      return {surface:'gravel',road:road.name,distance};
    }
    return {surface:'grass',road:null,distance};
  }
}
