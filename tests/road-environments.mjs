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
const environment=new RoadEnvironment(scene,physics,network,()=>0,'low');
assert.deepEqual(ROAD_CATEGORIES,['urban','highway','mountain','rural','dirt']);
for(const category of ['urban','highway','mountain','rural','dirt'])
  assert.ok(environment.statistics[category]>0,'Missing 3D road type: '+category);
assert.ok(environment.statistics.sidewalks>=2,'Physical urban pavements required');
assert.ok(environment.statistics.crosswalks>=3,'Zebra crossings required');
assert.ok(environment.statistics.manholes>0 && environment.statistics.drains>0);
assert.ok(environment.statistics.parkingSpaces>0);
assert.ok(environment.statistics.highwayBarriers>0);
assert.ok(environment.statistics.mountainBarriers>0);
assert.ok(environment.statistics.roadSigns>=5);
assert.ok(environment.statistics.speedSigns>=4,'Round maximum-speed signs required');
assert.ok(environment.statistics.dangerSigns>=4,'Triangular hazard signs required');
assert.ok(environment.statistics.stones>0 && environment.statistics.dirtRuts>0);
assert.ok(environment.statistics.ruralVegetation>0,'Rural roadside plants must be placed along its own route');
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
