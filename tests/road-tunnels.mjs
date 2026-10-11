import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {RoadTunnels,TUNNEL_ROAD_ID,tunnelRange} from '../src/road-tunnels.js';

const scene=new THREE.Scene(),physics=new CANNON.World();
const points=Array.from({length:341},(_,i)=>new THREE.Vector3(i*5,10,0));
const road={id:TUNNEL_ROAD_ID,category:'tunnel',name:'Túnel Monumental',
  width:6.5,points,tunnel:{start:.20,end:.80,halfWidth:6.6,clearance:7.3}};
const network={roads:[road],junctions:[]};
const range=tunnelRange(road);
assert.ok(range.length>1000,
  'The replacement tunnel must exceed one kilometre of covered carriageway');
const original=physics.bodies.length;
const tunnels=new RoadTunnels(scene,physics,network,()=>36,'low');
assert.equal(tunnels.statistics.count,1);
assert.equal(tunnels.statistics.portals,2,
  'A functional mountain tunnel requires two genuine open portals');
assert.ok(tunnels.statistics.lengthM>1000);
assert.ok(tunnels.statistics.collisionBodies>=10,
  'Arched lining and portals must be collidable throughout the tunnel');
assert.ok(tunnels.statistics.lamps>20,
  'A kilometre-long tunnel needs a continuous LED lighting grid');
assert.ok(tunnels.statistics.ventilationUnits>=4);
assert.ok(tunnels.statistics.emergencyStations>=3);
assert.ok(tunnels.meshes.some(m=>m.geometry.userData.corsaTunnel===
  'drivable-arched-lined-gallery'),'Must have an arched 3D lining');
assert.ok(tunnels.meshes.some(m=>m.geometry.userData.corsaTunnel===
  'earth-covered-roof'),'Tunnel cannot have an exposed flat roof');
assert.equal(tunnels.meshes.filter(m=>m.geometry.userData.corsaTunnel===
  'open-road-portal').length,2);
assert.ok(tunnels.bodies.some(b=>b.shapes.some(s=>s instanceof CANNON.Trimesh)),
  'Tunnel walls and ceiling must be real Cannon trimeshes');
const terrain=new THREE.PlaneGeometry(1800,110,170,20);
terrain.rotateX(-Math.PI/2);
const attr=terrain.getAttribute('position');
for(let i=0;i<attr.count;i++)attr.setY(i,36);
const changed=tunnels.carveTerrain(terrain);
assert.ok(changed>200,
  'Terrain must be excavated, not left physically solid inside the tunnel');
const center=points[Math.floor((range.start+range.end)*.5)];
let hole=false;
for(let i=0;i<attr.count;i++){
  if(Math.abs(attr.getX(i)-center.x)<6&&
    Math.abs(attr.getZ(i)-center.z)<6&&attr.getY(i)<center.y-.4){
    hole=true;break;
  }
}
assert.ok(hole,'Tunnel roadway must not be blocked by an invisible mountain');
assert.equal(tunnels.statistics.earthworkVertices,changed);
// Test the portal hole by casting a ray through its actual centre: no arch
// concrete may fill the opening in front of an approaching driver.
const portal=tunnels.meshes.find(m=>m.geometry.userData.corsaTunnel==='open-road-portal');
const entrance=points[range.start];
const ray=new THREE.Raycaster(new THREE.Vector3(
  entrance.x-5,entrance.y+2.4,entrance.z),
  new THREE.Vector3(1,0,0),0,12);
assert.equal(ray.intersectObject(portal).length,0,
  'Tunnel portal must have a driveable open centre, not a solid wall');
tunnels.update(new THREE.Vector3(center.x,center.y,center.z));
assert.ok(tunnels.lights.some(l=>l.intensity>0),
  'Nearby tunnel lamps must give real lighting in the gallery');
tunnels.update(new THREE.Vector3(9000,0,9000));
assert.ok(tunnels.lights.every(l=>l.intensity===0),
  'Only near-player lamps may incur realtime lighting overhead');
assert.ok(physics.bodies.length>original);
tunnels.dispose();terrain.dispose();
assert.equal(physics.bodies.length,original,
  'Tunnel rigid bodies must be correctly removed');
assert.equal(scene.children.length,0,
  'Lighting, portals and roof meshes must be fully disposed');
console.log('PASS: 1km+ drivable arch, open portals, buried roof, excavation, ventilation, LED lights and collision.');
