import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorldDetails } from '../src/world-details.js';

// Real geometry/LOD/wetness tests without requiring a graphics card or browser.
const scene=new THREE.Scene();
const points=[];
for(let i=0;i<=96;i++){
  const a=i/96*Math.PI*2;
  const tangent=new THREE.Vector3(-Math.sin(a),0,Math.cos(a));
  const side=new THREE.Vector3(-tangent.z,0,tangent.x);
  points.push({center:new THREE.Vector3(Math.cos(a)*190,0,Math.sin(a)*190),side,tangent});
}
const trees={
  leaves:new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),
    new THREE.MeshStandardMaterial({color:0x618842}),8),
  conifers:new THREE.InstancedMesh(new THREE.ConeGeometry(1,4,7),
    new THREE.MeshStandardMaterial({color:0x345b39}),8)
};
const details=new WorldDetails(scene,points,13.5,()=>0,'medium',trees);
assert.ok(scene.children.length>15,'Roadside objects are real scene meshes');
assert.ok(details.grassPatches.length>0,'3D grass LOD regions must exist');
assert.ok(details.winds.length>=3,'Grass and both tree species must use GPU wind');
assert.ok(details.puddles.isInstancedMesh,'Reflective puddles must be instanced geometry');
assert.ok(details.shrubs.count>0,'Instanced bushes must exist');
assert.ok(details.clouds.count>0,'3D clouds must exist');
assert.equal(details.puddles.visible,false);
const originalGrass=details.grassPatches.reduce((total,p)=>total+p.mesh.count,0);
details.setDensity(.3);
const reducedGrass=details.grassPatches.reduce((total,p)=>total+p.mesh.count,0);
assert.ok(reducedGrass<originalGrass/2,'Vegetation quality setting must reduce rendering');
details.update(.05,new THREE.Vector3(0,1,190),'rain',15,false);
assert.ok(details.wetness>0&&details.wetness<.2,'Rain must make puddles wetter gradually');
const wetnessAfterRain=details.wetness;
details.update(.05,new THREE.Vector3(0,1,190),'clear',15,false);
assert.ok(details.wetness<wetnessAfterRain,'Asphalt must dry gradually');
assert.ok(details.winds.every(u=>u.value>.0),'Wind must advance with simulation time');
const oldTime=details.elapsed;
details.update(.05,new THREE.Vector3(0,1,190),'clear',15,true);
assert.equal(details.elapsed,oldTime,'Wind and weather should pause with the game');
console.log('PASS: 3D grass, tree wind, shrub/flower instances, guardrails, clouds, puddles and gradual wetness.');
