import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {ModernRoadLighting,sampleLampStations,lampNightFactor} from '../src/modern-road-lighting.js';
import {ROAD_LAMP_SPACING_METRES} from '../src/road-standards.js';

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
assert.ok(lighting.stats.rural>=2,'Villages and rural junctions need new LEDs');
assert.equal(lighting.stats.mountain,0,
  'Removed mountain roads must not generate light poles');
assert.equal(lampNightFactor(12),0);
assert.equal(lampNightFactor(18.99),0);
assert.equal(lampNightFactor(19),1);
assert.equal(lampNightFactor(5.99),1);
assert.equal(lampNightFactor(6),0);
const uniform=sampleLampStations(network.roads.find(r=>r.id==='circular'));
assert.ok(uniform.length>20);
for(let i=1;i<uniform.length;i++)
  assert.ok(Math.abs(uniform[i].distance-uniform[i-1].distance-
    ROAD_LAMP_SPACING_METRES)<1e-7,
    'Lamp cadence follows actual road length, not triangle density');
for(const p of lighting.placements){
  assert.equal(p.spacingM,ROAD_LAMP_SPACING_METRES);
  assert.ok(Math.abs(p.stationM/ROAD_LAMP_SPACING_METRES-
    (Math.floor(p.stationM/ROAD_LAMP_SPACING_METRES)+.5))<.00001,
    'Every pole must be on the same 34-metre road chainage grid');
}
assert.ok(lighting.meshes.length>=15,
  'Architectural posts require detailed instanced bases, curved arms and optics');
assert.ok(lighting.stats.details.diode>=lighting.stats.total*12,
  'Every LED head must contain individual optical modules');
assert.ok(lighting.stats.details.bolt>=lighting.stats.total*4,
  'Each mast must visibly be anchored with a four-bolt plinth');
assert.ok(lighting.meshes.some(mesh=>mesh.name.includes('housing')&&
  mesh.geometry.type==='ExtrudeGeometry'),
  'Aerodynamic LED heads must be physically bevelled, not stretched spheres');
assert.ok(lighting.meshes.some(mesh=>mesh.name.includes('arm')&&
  mesh.geometry.type==='TubeGeometry'),
  'Lighting arms must be curved 3D metal tubing, not rigid rectangular sticks');
assert.ok(lighting.meshes.every(m=>m.isInstancedMesh),'Fixture should use GPU instancing');
assert.ok(lighting.lights.every(l=>l.isSpotLight),
  'Luminaires must illuminate the tarmac with downward LED beams');
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
assert.equal(urban.architecture,'city-led');
assert.ok(lighting.placements.some(p=>p.kind==='highway'&&
  p.architecture==='dual-led'),
  'Motorway fixtures should have separate dual-head architecture');
const player=new THREE.Vector3(urban.x,1,urban.z);
lighting.update(.2,22,player);
assert.ok(lighting.lights.some(l=>l.visible&&l.intensity>0),
  'Nearby real lights must come on at night');
assert.ok(lighting.materials.lens.emissiveIntensity>1,'LED lens glows at night');
assert.ok(lighting.materials.optic.emissiveIntensity>1,
  'Individual LED modules must illuminate at night');
lighting.update(.2,18.8,player);
assert.ok(lighting.lights.every(l=>!l.visible)&&
  lighting.materials.lens.emissiveIntensity===0&&
  lighting.materials.optic.emissiveIntensity===0,
  'LEDs must not switch on before true night');
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
