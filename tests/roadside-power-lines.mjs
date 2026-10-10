import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {planRoadsidePowerLines,RoadsidePowerLines}
  from '../src/roadside-power-lines.js';

const points=Array.from({length:181},(_,i)=>new THREE.Vector3(
  16*Math.sin(i/23),0,i*8));
const roads=[{id:'aldeia-exemplo',category:'rural',width:8,points}];
const network={roads};
const clearance={
  insideService(x,z){return Math.abs(z-910)<12;},
  insideBusBay(x,z){return Math.abs(z-1040)<16;},
  nearJunction(x,z){return Math.abs(z-505)<18;},
  nearAccess(x,z){return Math.abs(z-720)<14;},
  roadProximity(){return {edge:Infinity};}
};
const railway={nearestTrack(x,z){return Math.abs(z-1250);}};
const plan=planRoadsidePowerLines(network,()=>0,clearance,railway);
assert.ok(plan.poles.length>12);
assert.ok(plan.spans.length>12);
assert.ok(plan.ratio>.38&&plan.ratio<.76,
  'Powerlines should cover most, but not every, eligible roadside kilometre');
for(const {a,b} of plan.spans){
  for(const p of [a,b,{x:(a.x+b.x)*.5,z:(a.z+b.z)*.5}]){
    assert.ok(!clearance.nearJunction(p.x,p.z));
    assert.ok(!clearance.nearAccess(p.x,p.z));
    assert.ok(!clearance.insideService(p.x,p.z));
    assert.ok(!clearance.insideBusBay(p.x,p.z));
    assert.ok(railway.nearestTrack(p.x,p.z)>=15);
  }
}
const scene=new THREE.Scene(),physics=new CANNON.World();
const power=new RoadsidePowerLines(scene,physics,network,()=>0,
  clearance,railway,'low');
assert.equal(power.statistics.powerPoles,plan.poles.length);
assert.equal(power.statistics.cableSpans,plan.spans.length);
assert.equal(power.bodies.length,plan.poles.length,
  'Each power pole has a physical off-road collider');
assert.ok(scene.children.some(o=>
  o.name==='Três condutores elétricos · cabos suspensos com flecha'));
const wires=scene.children.find(o=>
  o.name==='Três condutores elétricos · cabos suspensos com flecha');
assert.equal(wires.geometry.getAttribute('position').count,
  plan.spans.length*3*5*2,
  'Three visibly curved cables for each supported electrical span');
const positions=wires.geometry.getAttribute('position');
const first=plan.spans[0],linearHeight=
  first.a.y+7.88+(first.b.y-first.a.y)*.4;
assert.ok(positions.getY(4)<linearHeight-.30,
  'Cable must sag realistically below its straight support-to-support line');
assert.ok(scene.children.some(o=>o.name==='Isoladores elétricos de cerâmica'));
assert.equal(power.statistics.coverage,plan.ratio);
power.dispose();
assert.equal(physics.bodies.length,0);
assert.equal(scene.children.length,0);
console.log('PASS: contextual 70% roadside power network, suspended wires, railway/BUS clearance and cleanup.');
