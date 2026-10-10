import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {SERVICE_LAYOUT,serviceFrame,buildHighwayService} from '../src/highway-services.js';

globalThis.document={
  createElement(name){
    assert.equal(name,'canvas');
    return {width:512,height:176,getContext(){
      return {fillStyle:'',font:'',textAlign:'',textBaseline:'',
        fillRect(){},fillText(){},strokeRect(){},
        createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
        putImageData(){}};
    }};
  }
};
const ground=(x,z)=>Math.sin(x*.017)*1.2+Math.cos(z*.014)*.9;
const points=[];
for(let i=0;i<=420;i++){
  const angle=i/420*Math.PI*2;
  const x=Math.cos(angle)*400,z=Math.sin(angle)*400;
  points.push({center:new THREE.Vector3(x,ground(x,z),z),
    tangent:new THREE.Vector3(-Math.sin(angle),0,Math.cos(angle))});
}
const scene=new THREE.Scene(),physics=new CANNON.World();
const {RoadNetwork}=await import('../src/road-network.js');
const {WorldSectors}=await import('../src/world-sectors.js');
const {RoadsideClearance}=await import('../src/roadside-clearance.js');
const network=new RoadNetwork(scene,physics,ground,points,13.5,'low');
const sectors=new WorldSectors(scene,physics,network,ground);
const service=sectors.regions.find(r=>r.kind==='service');
assert.ok(service);
assert.equal(service.road,'autoestrada');
assert.ok(service.roadWidth>=15);
const frame=serviceFrame(service,ground);
const origin=frame.world(0,0);
assert.ok(Math.hypot(origin.x-service.roadPoint.x,origin.z-service.roadPoint.z)<1e-7);
const outside=frame.world(40,0);
const dx=outside.x-service.roadPoint.x,dz=outside.z-service.roadPoint.z;
assert.ok(dx*frame.outward.x+dz*frame.outward.z>39.9);
assert.ok(SERVICE_LAYOUT.near>service.roadWidth*.5);
const mask=new RoadsideClearance(network,sectors.regions);
assert.equal(mask.serviceZones.length,1);
for(const [v,z] of [[42,-21],[73,9],[41,39]]){
  const p=frame.world(v,z);
  assert.equal(mask.insideService(p.x,p.z),true);
  assert.equal(mask.plantAllowed(p.x,p.z,'grass'),false,
    'Fuel station and car park must be free of meadow grass');
  assert.equal(mask.fenceAllowed(p.x,p.z,network.roads[1]),false);
}
const initialBodies=physics.bodies.length;
sectors.update(service.point,1,13);
const active=sectors.active.get(service.id);
assert.ok(active,'Service station must stream in');
const station=active.group.userData.service;
assert.ok(station,'Detailed station must be used instead of legacy boxes');
assert.equal(station.stats.fuelPumps,4);
assert.equal(station.stats.canopyColumns,4);
assert.equal(station.stats.parkingSpaces,10);
assert.equal(station.stats.accessRoads,2);
assert.equal(station.stats.lights,4);
assert.equal(station.stats.buildings,1);
assert.ok(station.stats.collisionBodies>15);
assert.ok(physics.bodies.length>=initialBodies+station.stats.collisionBodies);
const meshes=[];
active.group.traverse(obj=>{if(obj.isMesh)meshes.push(obj);});
for(const label of ['Área de serviço · canopy',
    'Área de serviço · bomba de combustível',
    'Área de serviço · loja café',
    'Área de serviço · lugar de estacionamento',
    'Área de serviço · acesso de entrada',
    'Área de serviço · acesso de saída',
    'Área de serviço · mangueira',
    'Área de serviço · painel LED']){
  assert.ok(meshes.some(m=>m.name===label),'Missing station feature: '+label);
}
const accessBodies=active.bodies.filter(body=>
  body.shapes.some(shape=>shape instanceof CANNON.Trimesh));
assert.equal(accessBodies.length,3,'Forecourt and both driveway decks need collision meshes');
assert.ok(station.lights.every(l=>l.intensity===0),'Service should be dark at midday');
sectors.update(service.point,2.2,22);
assert.ok(station.lights.every(l=>l.intensity>0),'Nearby night lighting should turn on');
sectors.update(new THREE.Vector3(3500,0,3500),3.4,22);
assert.ok(!sectors.active.has(service.id),'Service streams out');
assert.equal(physics.bodies.length,initialBodies,'All stationary colliders must be removed');
assert.equal(scene.children.some(child=>child.name===service.name),false);
console.log('PASS: full drivable service station, four pumps, canopy, café, 10 spaces, highway access, night lights and clean unload.');
