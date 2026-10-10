import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {RiverSystem,RIVER_WAYPOINTS} from '../src/river-system.js';

// A purposely chosen real crossing of the river by an east-west dirt road.
const road={id:'rio-teste',name:'Travessia do Vale',width:7,
  surface:'gravel',category:'dirt',
  points:Array.from({length:81},(_,i)=>
    new THREE.Vector3(445+i*2.5,3,430))};
const scene=new THREE.Scene(),physics=new CANNON.World();
const system=new RiverSystem(scene,physics,{roads:[road]},()=>3,'low');
assert.equal(RIVER_WAYPOINTS.length>=10,true);
assert.ok(system.statistics.riverSections>400);
assert.ok(system.statistics.riverLengthM>2000);
assert.ok(system.statistics.boulders>20);
assert.ok(system.waterMesh.material.isShaderMaterial);
assert.ok(system.crossings.length>=1,
  'A bridge must be placed at a real river/road intersection');
assert.ok(system.crossings.every(p=>p.roadId===road.id&&
  p.x>=445&&p.x<=645),'Bridge cannot be positioned randomly');
assert.equal(system.bodies.length,system.crossings.length*2,
  'Real bridge guardrails need matching collision objects');
const point=RIVER_WAYPOINTS[4];
const river=system.lookup(point[0],point[1]);
assert.ok(river?.distance<2);
assert.equal(system.contains(point[0],point[1]),true);
assert.equal(system.contains(0,-1600),false);
const ground=new THREE.PlaneGeometry(1600,1600,90,90);
ground.rotateX(-Math.PI/2);
const attrib=ground.getAttribute('position');
for(let i=0;i<attrib.count;i++)attrib.setY(i,3);
const affected=system.carveTerrain(ground);
assert.ok(affected>30,'River must lower actual terrain, not just overlay water');
const lowered=[];
for(let i=0;i<attrib.count;i++){
  if(attrib.getY(i)<2)lowered.push(i);
}
assert.ok(lowered.length>15,'Channel should be visibly lower than the valley');
const before=system.waterMaterial.uniforms.uTime.value;
system.update(.05,false,true,new THREE.Vector3(.8,.4,.2));
assert.ok(system.waterMaterial.uniforms.uTime.value>before,
  'A flowing river must animate its currents');
assert.equal(system.waterMaterial.uniforms.uRain.value,1);
const after=system.waterMaterial.uniforms.uTime.value;
system.update(.1,true,false);
assert.equal(system.waterMaterial.uniforms.uTime.value,after,
  'River currents must freeze with game pause');
const oldBodies=physics.bodies.length;
assert.ok(oldBodies>0);
system.dispose();ground.dispose();
assert.equal(physics.bodies.length,0);
assert.equal(scene.children.length,0);
console.log('PASS: deterministic river, flowing water, rocky banks, carved terrain, real bridge crossing and cleanup.');
