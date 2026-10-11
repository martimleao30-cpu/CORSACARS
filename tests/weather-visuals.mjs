import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VolumetricMist,WetRoadPuddles} from '../src/weather-visuals.js';
const scene=new THREE.Scene(),terrain=()=>3;
const fog=new VolumetricMist(scene,terrain,'low');
assert.equal(fog.mesh.visible,false);
assert.ok(fog.mesh.isInstancedMesh);
assert.ok(fog.mesh.instanceColor,'Fog instances have an injected color attribute');
assert.doesNotMatch(fog.material.vertexShader,/attribute\\s+vec3\\s+instanceColor\\s*;/,
  'Do not redeclare Three.js supplied instanceColor in ShaderMaterial');
assert.match(fog.material.vertexShader,/vTint=instanceColor/);
assert.match(fog.material.fragmentShader,/layered|noise\(p/);
fog.update(.2,{fog:.75},{fogColor:new THREE.Color(0xaabacc)});
assert.equal(fog.mesh.visible,true);
assert.equal(fog.material.uniforms.uDensity.value,.75);
const before=fog.time;
fog.update(.5,{fog:.75},null,true);
assert.equal(fog.time,before,'Pausing must freeze mist advection');
fog.update(.1,{fog:0});
assert.equal(fog.mesh.visible,false);
const pts=Array.from({length:140},(_,i)=>new THREE.Vector3(20,3,2.4*i));
const network={roads:[{id:'nacional',width:7,surface:'dry',points:pts}],
  junctions:[]};
const puddles=new WetRoadPuddles(scene,network,terrain,'medium');
assert.ok(puddles.mesh.count>2,'Regional road puddles need actual 3D instances');
assert.equal(puddles.mesh.visible,false);
puddles.update(.94,{horizon:new THREE.Color(0x789aaa)});
assert.equal(puddles.mesh.visible,true);
assert.ok(puddles.material.opacity>.35);
assert.equal(puddles.material.clearcoat,1);
puddles.update(0);
assert.equal(puddles.mesh.visible,false);
const excluded=new WetRoadPuddles(scene,{
  roads:[{id:'terra',width:4,surface:'dirt',points:pts}],junctions:[]
},terrain,'high');
assert.equal(excluded.mesh.count,0,'Earth tracks must not display asphalt puddles');
excluded.dispose();puddles.dispose();fog.dispose();
console.log('PASS: GPU fog layers and collision-free reflective road puddles follow wetness.');
