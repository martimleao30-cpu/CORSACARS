import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

globalThis.document={
  createElement(name){
    assert.equal(name,'canvas');
    return {width:512,height:192,getContext(){
      return {
        fillStyle:'',strokeStyle:'',lineWidth:0,font:'',textAlign:'',
        fillRect(){},strokeRect(){},fillText(){},
        createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
        putImageData(){}
      };
    }};
  }
};
const {RoadNetwork}=await import('../src/road-network.js');
const {RoadEnvironment,ROAD_CATEGORIES}=await import('../src/road-environments.js');
const {RoadsideClearance}=await import('../src/roadside-clearance.js');
const {WorldSectors}=await import('../src/world-sectors.js');
const scene=new THREE.Scene(),physics=new CANNON.World();
const ring=[];
for(let i=0;i<=420;i++){
  const angle=i/420*2*Math.PI;
  const center=new THREE.Vector3(Math.cos(angle)*400,.2,Math.sin(angle)*400);
  const tangent=new THREE.Vector3(-Math.sin(angle),0,Math.cos(angle));
  ring.push({center,tangent});
}
const network=new RoadNetwork(scene,physics,()=>0,ring,13.5,'low');
const physicalRoadBodies=physics.bodies.length;
const sectors=new WorldSectors(scene,physics,network,()=>0);
const clearance=new RoadsideClearance(network,sectors.regions);
const environment=new RoadEnvironment(scene,physics,network,()=>0,'low',clearance);
assert.deepEqual(ROAD_CATEGORIES,['urban','highway','mountain','rural','dirt']);
for(const category of ['urban','highway','mountain','rural','dirt'])
  assert.ok(environment.statistics[category]>0,'Missing 3D road type: '+category);
assert.ok(environment.statistics.sidewalks>=2,'Physical urban pavements required');
assert.ok(environment.statistics.crosswalks>=3,'Zebra crossings required');
assert.ok(environment.statistics.manholes>0 && environment.statistics.drains>0);
const covers=environment.manholeNetwork;
assert.ok(covers.statistics.total>28,
  'Build many visible manhole covers on paved local roads');
assert.ok(covers.coverMesh?.isInstancedMesh&&
  covers.coverMesh.geometry.userData.corsaManhole==='cast-iron-inspection-cover');
assert.equal(covers.statistics.motorway,0);
assert.ok(covers.placements.every(p=>p.roadId!=='autoestrada'&&
  p.category!=='highway'&&p.category!=='highway-ramp'));
assert.ok(covers.placements.some(p=>p.roadId==='circular'),
  'Ring road needs occasional service covers too');
for(const p of covers.placements){
  assert.ok(Math.abs(p.y-p.deckY-.015)<1e-6,
    'Covers must be flush with the real crowned road deck');
  assert.ok(!network.junctions.some(j=>
    Math.hypot(j.x-p.x,j.z-p.z)<
      Math.max(Math.max(j.halfU||0,j.halfV||0),4)+6),
    'Manholes must not cover junction markings');
}
assert.ok(environment.statistics.parkingSpaces>0);
assert.ok(environment.statistics.highwayBarriers>0);
assert.ok(environment.statistics.mountainBarriers>0);
assert.ok(environment.statistics.mountainMarkers>10,'Mountain reflectors should exist');
const wBeams=environment.objects.filter(m=>m.name==='Barreira de proteção');
const posts=environment.objects.filter(m=>m.name==='Barreira metálica · suportes');
const spacers=environment.objects.filter(m=>m.name==='Barreira metálica · afastadores');
assert.ok(wBeams.length>0 && wBeams.every(m=>
  m.geometry.userData.corsaGuardrail==='corrugated-W-beam'),
  'Metal rails must use a curved W-beam instead of solid rectangular strips');
assert.ok(posts.length>0&&spacers.length===posts.length,
  'Real guardrails need separate vertical posts and distance brackets');
assert.ok(posts.reduce((n,m)=>n+m.count,0)>wBeams.reduce((n,m)=>n+m.count,0),
  'Posts must be regularly spaced along long road sections');
assert.ok(environment.statistics.woodFencePosts>5,'Rural fences have tangible posts');
assert.ok(environment.statistics.woodFenceRails>5,'Rural fence must have two longitudinal rails');
assert.ok(environment.statistics.skippedFenceSegments>0,
  'Guardrails and fences must leave gaps at crossings/entries');
for(const name of ['Vedação rural · travessa superior','Vedação rural · travessa inferior',
   'Vedação rural · fio metálico']){
  assert.ok(environment.objects.some(m=>m.name===name),
    'Missing realistic rural fence layer: '+name);
}
assert.ok(environment.statistics.roadSigns>=5);
assert.equal(environment.statistics.motorwayServiceSigns,2,'Advance signage for rest area required');
assert.ok(environment.statistics.speedSigns>=4,'Round maximum-speed signs required');
assert.ok(environment.statistics.dangerSigns>=4,'Triangular hazard signs required');
assert.ok(environment.statistics.stones>0 && environment.statistics.dirtRuts>0);
assert.equal(environment.objects.some(o=>o.name==='Rastos no piso de terra'),false,
  'Floating rectangular rut blocks must not be used');
const naturalRuts=environment.objects.filter(o=>
  o.name==='Rastos naturais de pneus · terra');
assert.equal(naturalRuts.length,2,'Every unpaved road needs draped tyre marks');
assert.ok(naturalRuts.every(o=>o.geometry.userData.corsaDirtRuts==='terrain-draped'));
assert.ok(naturalRuts.every(o=>o.material.transparent&&o.geometry.index.count>100));
assert.ok(environment.statistics.ruralVegetation>0,'Rural roadside plants must be placed along its own route');
assert.ok(environment.statistics.powerPoles>12,
  'Eligible roads need a coherent electrical roadside network');
assert.ok(environment.statistics.cableSpans>8);
assert.ok(environment.powerLines.meshes.some(o=>
  o.name==='Três condutores elétricos · cabos suspensos com flecha'));
assert.ok(environment.statistics.coverage<.75,
  'Power lines must not occupy every road segment');
const rural=network.roads.find(r=>r.id==='rural');
const matrix=new THREE.Matrix4(),worldPoint=new THREE.Vector3();
for(const layer of [
  'Vedação rural · postes','Vedação rural · travessa superior',
  'Vedação rural · travessa inferior'
]){
  const mesh=environment.objects.find(m=>m.name===layer);
  assert.ok(mesh?.isInstancedMesh && mesh.count>0,
    'Crossing-aware timber fence component missing: '+layer);
  const stride=Math.max(1,Math.floor(mesh.count/25));
  for(let i=0;i<mesh.count;i+=stride){
    mesh.getMatrixAt(i,matrix);
    worldPoint.setFromMatrixPosition(matrix);
    assert.equal(clearance.fenceAllowed(worldPoint.x,worldPoint.z,rural,0),true,
      'Timber fence may not cross another road, junction or driveway: '+layer);
  }
}
const ruralPostMesh=environment.objects.find(m=>m.name==='Vedação rural · postes');
assert.ok(ruralPostMesh.geometry.parameters.radiusTop>=.9,
  'Instanced timber post must have a real cylinder profile, not a thin wire');

const ruralShrubs=environment.objects.find(m=>m.name==='Vegetação junto à estrada rural');
assert.equal(ruralShrubs.geometry.userData.corsaNatural,'leafy-shrub');
const mountainRocks=environment.objects.find(m=>m.name==='Rochas · Serra');
assert.equal(mountainRocks.geometry.userData.corsaNatural,'weathered-rock');
assert.equal(environment.statistics.physicalJunctions,3);
assert.ok(physics.bodies.length>physicalRoadBodies,'Sidewalks / barriers must collide');
assert.ok(environment.trafficLights.length>=4,'Working traffic lights required');
environment.update(.1);
assert.ok(environment.trafficLights[0].lamps[2].emissiveIntensity>1,
  'Initial green stage');
assert.ok(environment.trafficLights.some(signal=>signal.state==='red'),
  'Conflicting approach must initially be red');
for(let i=0;i<120;i++)environment.update(.1);
assert.ok(environment.trafficLights[0].lamps[0].emissiveIntensity>1,
  'Red stage must replace green after timed cycle');
for(let i=0;i<42;i++)environment.update(.1);
assert.ok(environment.trafficLights.some(signal=>signal.side>0&&signal.state==='green'),
  'Opposite direction must receive green during its phase');
assert.ok(!environment.trafficLights.some(signal=>signal.side<0&&signal.state==='green'),
  'Opposing signals must not show simultaneous green');
const before=physics.bodies.length;
environment.dispose();
assert.equal(physics.bodies.length,physicalRoadBodies,
  'Scene and Cannon traffic fixtures must be reversible');
assert.ok(before>physicalRoadBodies);
console.log('PASS: five kinds of 3D roads, street furniture, signs, timed lights and real physical barriers.');
