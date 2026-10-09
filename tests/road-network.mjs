import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Geometry data can be verified without WebGL or downloading photographic assets.
globalThis.document={
  createElement(name) {
    if(name!=='canvas')throw new Error('Canvas expected');
    return {width:256,height:256,
      getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
        putImageData(){},fillRect(){},fillText(){}})};
  }
};
const {RoadNetwork,REGIONAL_LINKS}=await import('../src/road-network.js');
const {WorldSectors}=await import('../src/world-sectors.js');
const {DrivingTestArea}=await import('../src/driving-test-area.js');
const scene=new THREE.Scene(),physics=new CANNON.World();
const ring=[];
for(let i=0;i<=420;i++){
  const angle=i/420*Math.PI*2;
  ring.push({center:new THREE.Vector3(Math.cos(angle)*400,.2,Math.sin(angle)*400)});
}
const network=new RoadNetwork(scene,physics,()=>0,ring,13.5,'low');
assert.equal(REGIONAL_LINKS.length,6);
assert.equal(network.roads.length,7);
assert.equal(physics.bodies.length,6,'All new roads need real collision bodies');
assert.ok(network.cells.size>30,'Surface lookups should use spatial hashing');
for(const road of network.roads){
  if(road.id==='circular')continue;
  assert.equal(road.points[0].x,ring[road.from].center.x);
  assert.ok(road.mesh.geometry.index.count>30);
  const middle=road.points[Math.floor(road.points.length*.57)];
  const queried=network.query(middle.x,middle.z,'clear');
  assert.notEqual(queried.surface,'grass','Road should be drivable: '+road.id);
  if(road.id==='montanha'||road.id==='autoestrada'){
    assert.ok(['wet','dry'].includes(network.query(middle.x,middle.z,'rain').surface));
  }
}
assert.equal(network.query(4000,4000).surface,'grass');
const testRoad=network.roads.find(r=>r.id==='provas');
assert.ok(testRoad,'Physics test area must join the road network');
const testPosition=testRoad.points[Math.floor(testRoad.points.length*.64)];
assert.equal(network.query(testPosition.x,testPosition.z).surface,'wet',
  'Wet grip test must work in clear weather');
const testTrack=new DrivingTestArea(scene,physics,network,()=>0);
assert.equal(testTrack.samples.length,7,'Physical driving test markers should exist');
assert.equal(testTrack.obstacleBodies.length,4,'Speed bump and slalom need solid colliders');
const sectors=new WorldSectors(scene,physics,network,()=>0);
assert.equal(sectors.regions.length,5);
const spot=sectors.regions[0];
const initial=physics.bodies.length;
sectors.update(spot.point,3);
assert.ok(sectors.active.has(spot.id),'Accessible service station must stream in');
assert.ok(physics.bodies.length>initial,'Shop walls need real collision');
const near=sectors.nearby(spot.point);
assert.equal(near.id,spot.id);
sectors.update(new THREE.Vector3(3500,0,3500),6);
assert.equal(sectors.active.size,0,'Out-of-range sectors must unload');
assert.equal(physics.bodies.length,initial,'Sector collider objects must be removed');
console.log('PASS: 6 interconnected routes, collision-backed surfaces, road lookup, and dynamic loading/unloading of POI sectors.');
