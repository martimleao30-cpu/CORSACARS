import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
const labels=[];
globalThis.document={createElement(tag){
  assert.equal(tag,'canvas');
  return {width:512,height:256,getContext(){
    return {fillStyle:'',strokeStyle:'',lineWidth:0,font:'',textAlign:'',
      textBaseline:'',fillRect(){},strokeRect(){},
      fillText(text){labels.push(String(text));},
      createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
      putImageData(){}};
  }};
}};
const {RoadNetwork}=await import('../src/road-network.js');
const {RoadsideClearance}=await import('../src/roadside-clearance.js');
const {WorldSectors}=await import('../src/world-sectors.js');
const {RoadEnvironment}=await import('../src/road-environments.js');
const ring=[];
for(let i=0;i<=420;i++){
  const a=i/420*Math.PI*2;
  ring.push({center:new THREE.Vector3(400*Math.cos(a),0,400*Math.sin(a)),
    tangent:new THREE.Vector3(-Math.sin(a),0,Math.cos(a))});
}
const scene=new THREE.Scene(),physics=new CANNON.World();
const network=new RoadNetwork(scene,physics,()=>0,ring,13.5,'low');
const sectors=new WorldSectors(scene,physics,network,()=>0);
const mask=new RoadsideClearance(network,sectors.regions);
const initial=physics.bodies.length;
const env=new RoadEnvironment(scene,physics,network,()=>0,'low',mask);
const architecture=env.infrastructure,stats=architecture.stats;
assert.ok(stats.stops>=1,'Accessible glass-and-steel bus shelters should exist');
const stops=architecture.groups.filter(g=>g.name.startsWith('Paragem de autocarro'));
assert.ok(stops.length>=2,'There should be stops for actual urban and rural settlements');
assert.equal(stats.busBays,stops.length,
  'Every shelter must have its own full pullout bay');
assert.equal(stats.busPainted,stops.length,
  'Every bay must have a visible BUS road marking');
assert.ok(mask.busBays.length>=stops.length,
  'The clearances must be planned before barriers and buildings');
for(const stop of stops){
  assert.ok(Number.isFinite(stop.position.x)&&Number.isFinite(stop.position.z),
    'Bus stop position must be finite, not a Vector3 multiplied by a number');
  assert.ok(['town','aldeia','aldeia-sul','aldeia-leste'].includes(stop.userData.servesPOI),
    'Stop must serve a named settlement, not arbitrary roadside space');
  assert.ok(Number.isFinite(stop.userData.poiDistance)&&
    stop.userData.poiDistance>=27&&stop.userData.poiDistance<=127,
    'Stop must remain within walking range: '+JSON.stringify({
      poi:stop.userData.servesPOI,d:stop.userData.poiDistance,
      position:stop.position.toArray()
    }));
  assert.equal(stop.userData.pedestrianAccess,true,
    'A shelter should have terrain-following pedestrian access');
  assert.ok(stop.children.filter(x=>x.name==='Acesso pedonal · paragem').length>=4,
    'Stop must be connected to the edge of its road');
  const settlement=sectors.regions.find(r=>r.id===stop.userData.servesPOI);
  assert.ok(settlement&&stop.userData.roadId===settlement.road);
  assert.equal(stop.userData.busBay,true);
  assert.equal(stop.userData.bayLengthM,44);
  assert.ok(stop.userData.bayWidthM>=3.5);
  assert.ok(stop.children.some(mesh=>mesh.name==='BUS · inscrição branca no pavimento'),
    'The word BUS must be painted on each stop bay');
  const bay=stop.children.find(mesh=>
    mesh.name==='Baía de autocarro · asfalto transitável');
  assert.ok(bay?.geometry.userData.corsaBusBay,
    'A bus stop needs a real drivable asphalt surface');
  assert.ok(bay.geometry.index.count>200,
    'The pullout must use smooth tapered triangles, not a single flat box');
  assert.ok(stop.userData.bayBody?.shapes.some(shape=>shape instanceof CANNON.Trimesh),
    'Each BUS bay needs matching driveable collision geometry');
  const reservation=mask.busBays.find(b=>
    b.regionId===stop.userData.servesPOI&&b.roadId===stop.userData.roadId&&
      Math.hypot(b.x-stop.position.x,b.z-stop.position.z)<.01);
  assert.ok(reservation,'A stop must match a named settlement and reserved roadside space');
  assert.equal(mask.nearAccess(stop.position.x,stop.position.z,2),false);
  assert.equal(mask.nearJunction(stop.position.x,stop.position.z,2),false);
}
assert.ok(stats.emergencyCabinets>=1,'Motorway needs emergency SOS cabinets');
assert.ok(stats.directionBoards>=5,'Direction signs must be legible');
assert.ok(stats.delineators>20,'Modern roadside reflectors along several roads');
assert.ok(stats.wayfindingSigns>=5,'Every zone should receive direction signs');
assert.ok(stats.informationKiosks>=1,'Country routes need information buildings');
assert.ok(stats.colliders>0,'Structures must have collision');
assert.ok(physics.bodies.length>initial);
for(const group of architecture.groups){
  if(!group.isGroup||group.name.startsWith('Pórtico'))continue;
  const point=group.position;
  assert.equal(mask.insideService(point.x,point.z,1),false,
    'Street structure must never occupy the petrol station');
  assert.equal(mask.nearAccess(point.x,point.z,1),false,
    'Street structure cannot obstruct driveways');
  assert.equal(mask.nearJunction(point.x,point.z,1),false,
    'Street structure cannot obstruct intersections');
  assert.ok(mask.roadProximity(point.x,point.z).edge>=1,
    'Street structure should be outside road surface');
}
const stop=architecture.groups.find(g=>g.name==='Paragem de autocarro · urbana');
assert.ok(stop.children.some(m=>m.name==='Paragem · vidro lateral'));
assert.ok(stop.children.some(m=>m.name==='Paragem · banco'));
assert.ok(architecture.groups.some(g=>g.name.includes('Sinal direcional')));
assert.ok(architecture.groups.some(g=>g.isInstancedMesh&&g.count>20));
assert.ok(!labels.includes('500 m km/h'),'Distances must never show speed units');
assert.ok(labels.includes('500 m'),'Motorway distance must retain metres');
assert.ok(architecture.textures.length>=5);
const tex=architecture.textures[0];let discarded=false;
tex.addEventListener('dispose',()=>discarded=true);
const sign=env.objects.find(m=>m.name.startsWith('Placa ·'));
assert.ok(sign);
let signDisposed=false;sign.geometry.addEventListener('dispose',()=>signDisposed=true);
env.dispose();
assert.equal(physics.bodies.length,initial,'All new colliders must be removed');
assert.equal(discarded,true,'New sign textures must be disposed');
assert.equal(signDisposed,true,'Old sign geometry must be disposed');
env.dispose();
console.log('PASS: shelters, SOS, directional signage, safety clearance, correct distance labels, GPU cleanup.');
