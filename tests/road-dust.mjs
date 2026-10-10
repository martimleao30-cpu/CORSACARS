import assert from 'node:assert/strict';
import * as THREE from 'three';
const {RoadDust}=await import('../src/road-dust.js');
const scene=new THREE.Scene(),dust=new RoadDust(scene,'high');
const wheel=()=>({raycastResult:{hasHit:true,hitPointWorld:{x:8,y:.25,z:20}}});
const car={speedKmh:36,chassis:{velocity:{x:0,z:12}},
  vehicle:{wheelInfos:[wheel(),wheel(),wheel(),wheel()]}};
const camera={quaternion:new THREE.Quaternion()};
const world={surfaceAt:()=>({surface:'dirt'})};
for(let i=0;i<20;i++)dust.update(.08,car,world,camera,true);
assert.ok(dust.particles.length>0 && dust.mesh.count>0,
  'Contacting loose surface must create tire dust');
assert.ok(dust.particles.length<=dust.max,'Bounded particle budget');
const before=dust.particles.length;
dust.update(1,car,world,camera,false);
assert.equal(dust.particles.length,before,'Paused game must freeze dust simulation');
world.surfaceAt=()=>({surface:'dry'});
for(let i=0;i<35;i++)dust.update(.08,car,world,camera,true);
assert.equal(dust.particles.length,0,'Dust must fade and stop on clean asphalt');
dust.dispose(scene);
assert.ok(!scene.children.includes(dust.mesh));
console.log('PASS: contact-driven gravel/dirt dust, bounded instancing, pause and decay.');
