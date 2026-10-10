import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

globalThis.document={
  createElement(name){
    assert.equal(name,'canvas');
    return {width:512,height:256,getContext(){return {
      createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
      putImageData(){},fillRect(){},strokeRect(){},fillText(){}
    };}};
  }
};
const {RoadNetwork}=await import('../src/road-network.js');
const {WorldSectors}=await import('../src/world-sectors.js');
const {RoadsideClearance,segmentDistance}=await import('../src/roadside-clearance.js');
assert.equal(segmentDistance(3,4,{x:0,z:0},{x:10,z:0}).distance,4);
assert.equal(segmentDistance(-2,0,{x:0,z:0},{x:10,z:0}).distance,2);
const scene=new THREE.Scene(),physics=new CANNON.World();
const ring=[];
for(let i=0;i<=420;i++){
  const t=i/420*Math.PI*2;
  ring.push({center:new THREE.Vector3(Math.cos(t)*400,0,Math.sin(t)*400),
    tangent:new THREE.Vector3(-Math.sin(t),0,Math.cos(t))});
}
const network=new RoadNetwork(scene,physics,()=>0,ring,13.5,'low');
const sectors=new WorldSectors(scene,physics,network,()=>0);
const mask=new RoadsideClearance(network,sectors.regions);
assert.ok(mask.segments.length>1000,'All connected roads indexed');
assert.ok(mask.junctions.length>=12,'Endpoints and crossings cut fence gaps');
assert.equal(mask.openings.length,5,'Every named POI has a driveway');
assert.equal(mask.serviceZones.length,1,'The entire station apron is reserved');
const serviceRegion=sectors.regions.find(r=>r.kind==='service');
const fuelCenter=serviceRegion.roadPoint.clone()
  .addScaledVector(serviceRegion.side,42)
  .addScaledVector(serviceRegion.tangent, -21);
assert.equal(mask.insideService(fuelCenter.x,fuelCenter.z),true);
assert.equal(mask.plantAllowed(fuelCenter.x,fuelCenter.z,'grass'),false);

for(const road of network.roads){
  const mid=road.points[Math.floor(road.points.length*.52)];
  assert.equal(mask.plantAllowed(mid.x,mid.z,'grass'),false,
    'No plants on '+road.name);
  assert.equal(mask.plantAllowed(mid.x,mid.z,'tree'),false);
  const first=road.points[0];
  if(road.id!=='circular')
    assert.ok(mask.nearJunction(first.x,first.z,0),'All road entries need gates');
}
for(const region of sectors.regions){
  const a=region.roadPoint,b=region.point;
  const x=(a.x+b.x)*.5,z=(a.z+b.z)*.5;
  assert.equal(mask.plantAllowed(x,z,'shrub'),false,
    'No shrubs in actual driveways');
  const parent=network.roads.find(r=>r.id===region.road);
  assert.equal(mask.fenceAllowed(x,z,parent,1),false,
    'Fence must not block POI entrance');
}
const rural=network.roads.find(r=>r.id==='rural');
const roadside=rural.points[Math.floor(rural.points.length*.35)];
assert.equal(mask.plantAllowed(roadside.x,roadside.z,'flower'),false);
const crossing={roads:[
  {id:'north',width:8,points:[new THREE.Vector3(0,0,-50),new THREE.Vector3(0,0,50)]},
  {id:'east',width:7,points:[new THREE.Vector3(-50,0,0),new THREE.Vector3(50,0,0)]}
]};
const joined=new RoadsideClearance(crossing);
assert.ok(joined.junctions.some(j=>Math.hypot(j.x,j.z)<2),
  'Detect middle-of-road perpendicular crossing');
assert.equal(joined.fenceAllowed(3,0,crossing.roads[1]),false,
  'Never place a barrier across intersecting road');
const allowed=joined.fenceSegmentAllowed({x:3,z:-24},{x:3,z:24},crossing.roads[1]);
assert.equal(allowed,false,'Full segment must not bridge crossroads');
assert.equal(joined.plantAllowed(0,19,'grass'),false,
  'Roadside foliage must stay out of the shoulder');
assert.equal(joined.plantAllowed(35,35,'shrub'),true,
  'Vegetation must still be allowed away from roads');
console.log('PASS: all road decks, junctions, side streets, driveway gaps and safe vegetation margins.');
