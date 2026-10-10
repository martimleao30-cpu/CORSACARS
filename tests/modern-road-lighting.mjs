import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {ModernRoadLighting} from '../src/modern-road-lighting.js';

globalThis.document={createElement(){return {
  width:192,height:192,getContext(){return {
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
    putImageData(){},fillRect(){},strokeRect(){},fillText(){}
  };}};}};
const {RoadNetwork}=await import('../src/road-network.js');
const {RoadsideClearance}=await import('../src/roadside-clearance.js');
const {WorldSectors}=await import('../src/world-sectors.js');
const scene=new THREE.Scene(),physics=new CANNON.World(),ring=[];
for(let i=0;i<=420;i++){
  const theta=i/420*2*Math.PI;
  ring.push({center:new THREE.Vector3(Math.cos(theta)*400,0,Math.sin(theta)*400),
    tangent:new THREE.Vector3(-Math.sin(theta),0,Math.cos(theta))});
}
const network=new RoadNetwork(scene,physics,()=>0,ring,13.5,'low');
const sectors=new WorldSectors(scene,physics,network,()=>0);
const clearance=new RoadsideClearance(network,sectors.regions);
const before=scene.children.length;
const lighting=new ModernRoadLighting(scene,network,()=>0,clearance,'high');
assert.ok(lighting.stats.total>45,'City, ring and motorway should gain lighting');
assert.ok(lighting.stats.urban>16,'Urban streets must have higher pole density');
assert.ok(lighting.stats.highway>=6,'Motorway access and services require LEDs');
assert.ok(lighting.stats.ring>6,'Original ring should still be illuminated');
assert.ok(lighting.stats.access>=2,'Motorway ramps need their own masts');
assert.ok(lighting.meshes.length>=7,'Detailed posts use seven instanced parts');
assert.ok(lighting.meshes.every(m=>m.isInstancedMesh),'Fixture should use GPU instancing');
assert.ok(lighting.lights.length<=8 && lighting.lights.length>=4,
  'Only a small pool of realtime lights may exist');
for(const fixture of lighting.placements){
  assert.ok(fixture.height>=8,'Light pole must look like a realistic street luminaire');
  const road=network.roads.find(r=>r.id===fixture.roadId);
  assert.ok(road);
  assert.ok(clearance.roadProximity(fixture.x,fixture.z,road).edge>=2.4 ||
    clearance.roadProximity(fixture.x,fixture.z,road).road===null,
    'Poles must not sit on another carriageway');
  assert.equal(clearance.insideService(fixture.x,fixture.z,2),false,
    'No duplicated poles inside the highway service area');
}
const urban=lighting.placements.find(p=>p.kind==='urban');
assert.ok(urban);
const player=new THREE.Vector3(urban.x,1,urban.z);
lighting.update(.2,22,player);
assert.ok(lighting.lights.some(l=>l.visible&&l.intensity>0),
  'Nearby real lights must come on at night');
assert.ok(lighting.materials.lens.emissiveIntensity>1,'LED lens glows at night');
lighting.update(.2,13,player);
assert.ok(lighting.lights.every(l=>!l.visible&&l.intensity===0),
  'Lights must be disabled during the day');
assert.ok(lighting.materials.lens.emissiveIntensity<.2);
lighting.update(.2,23,new THREE.Vector3(9000,0,9000));
assert.ok(lighting.lights.every(l=>!l.visible&&l.intensity===0),
  'Faraway illumination must use emissive-only geometry');
const count=lighting.stats.total;
lighting.dispose();
assert.equal(lighting.placements.length,count,'Fixture statistics remain stable');
assert.equal(scene.children.length,before,'Dispose must remove all road lamp meshes/lights');
console.log('PASS: modern LED masts, urban and interchange coverage, clearance and pooled night lighting.');
