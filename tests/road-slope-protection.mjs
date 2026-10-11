import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {RoadSlopeProtection} from '../src/road-slope-protection.js';
const scene=new THREE.Scene(),physics=new CANNON.World();
const road={
  id:'mountain-test',name:'Encosta',
  category:'mountain',width:6,
  points:Array.from({length:60},(_,i)=>new THREE.Vector3(i*5,3.2,0))
};
const terrain=(x,z)=>.92*z+2.0*Math.sin(x*.008);
const guards=new RoadSlopeProtection(scene,physics,{
  roads:[road],junctions:[]
},terrain,null,'medium');
assert.ok(guards.statistics.cutWalls>5,
  'High rock faces need retaining walls on the uphill road side');
assert.ok(guards.statistics.fillWalls>5,
  'Embankments need protection on the downhill road side');
assert.ok(guards.statistics.wallColliders>10,
  'Every real wall panel must have matching physical collision');
assert.ok(guards.statistics.protectedMetres>100,
  'Slope protection should extend along the difficult mountainside');
assert.ok(guards.meshes.every(mesh=>mesh.isInstancedMesh),
  'Hundreds of wall panels must be GPU instanced');
assert.ok(guards.bodies.some(body=>body.shapes.length>5),
  'Static physics walls should be batched per road');
assert.ok(guards.meshes.find(mesh=>mesh.name.includes('painéis')).count===
  guards.statistics.wallColliders,
  'A wall must never have physics without visual geometry');
const bodies=physics.bodies.length;
guards.dispose();
assert.ok(bodies>0);
assert.equal(physics.bodies.length,0);
assert.equal(scene.children.length,0);
console.log('PASS: physically collidable engineered retaining walls on both mountain cuts and raised slopes.');
