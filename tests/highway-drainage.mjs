import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {HighwayDrainage} from '../src/highway-drainage.js';

const scene=new THREE.Scene(),physics=new CANNON.World();
const points=Array.from({length:100},(_,i)=>new THREE.Vector3(0,6-i*.06,i*5));
const highway={id:'autoestrada',name:'Autoestrada',surface:'dry',width:19,
  category:'highway',points,body:new CANNON.Body({mass:0})};
physics.addBody(highway.body);
const network={roads:[highway],junctions:[{
  x:0,z:220,halfU:19,halfV:17,ux:0,uz:1
}]};
const terrain=(x,z)=>.018*x+Math.sin(z*.004)*.4;
const drainage=new HighwayDrainage(scene,network,terrain);
assert.equal(drainage.waterMat.fog,false,
  'Custom water shaders must not enable engine fog without fog uniforms');
assert.equal(drainage.waterMat.uniforms.fogColor,undefined,
  'Runoff has local colour grading; it does not supply engine fog uniforms');
assert.equal(drainage.channels.length,2,
  'Motorway should have two independent concrete drainage channels');
assert.ok(drainage.outletCount>0,
  'Downhill verge sections must receive real gravity-fed culvert pipes');
assert.ok(drainage.geometryStats.culverts===drainage.outletCount,
  'Culvert counts must match the generated pipe instances');
assert.ok(drainage.inletCount>4,
  'Drainage requires grated runoff inlets along both shoulders');
assert.equal(highway.body.shapes.length,2,
  'Visible gutters must have matching physical triangle collisions');
for(const channel of drainage.channels){
  assert.ok(channel.segmentCount>10,'Channels must follow the full highway');
  assert.equal(channel.mesh.geometry.userData.drainage,
    'motorway-concrete-channel');
  const verts=channel.mesh.geometry.getAttribute('position');
  const idx=channel.mesh.geometry.index;
  assert.equal(verts.count,points.length*8,
    'Every motorway station needs the full 3D V-shaped cross-section');
  for(let row=0;row<verts.count;row+=8){
    const bank=verts.getY(row);
    const invert=verts.getY(row+3);
    assert.ok(bank>invert-.05,
      'Channel invert must lie lower than its raised sloped sides');
  }
  for(let k=0;k<idx.count;k+=3){
    const z=(verts.getZ(idx.getX(k))+verts.getZ(idx.getX(k+1))+
      verts.getZ(idx.getX(k+2)))/3;
    assert.ok(z<179||z>261,
      'Concrete drainage must stop around bridge/junction zones');
  }
  assert.equal(channel.water.visible,false,'Dry channels show no flowing water');
  assert.equal(channel.outletFlow.visible,false,
    'Culvert outlets cannot flow when the sky is dry');
  assert.equal(channel.splashes.visible,false,
    'Dry collectors must not show artificial splashes');
  assert.ok(channel.runoff.geometry.index.count>=channel.grates.count*3*10*6,
    'Each collector must receive three separate graded water tributaries');
  assert.equal(channel.pipes.count,channel.outlets.length,
    'Each downhill outlet should have one correctly oriented cylindrical pipe');
  assert.equal(channel.rims.count,channel.outlets.length,
    'Each pipe mouth needs a cast protective circular rim');
  assert.equal(channel.basins.count,channel.grates.count,
    'Collector chambers must match all surface grates');
  assert.equal(channel.splashes.count,channel.grates.count,
    'Every active collector needs an animated splash surface');
  assert.ok(channel.headwalls.geometry.type==='ExtrudeGeometry'&&
    channel.headwalls.geometry.parameters.shapes.holes?.length===1,
    'Outfall headwalls must have true circular openings in their geometry');
  assert.ok(channel.grates.geometry.getAttribute('position').count>150,
    'Grates must have real open slats and bolted metal detailing');
  assert.ok(channel.pipes.geometry.type==='CylinderGeometry'&&
    channel.pipes.geometry.parameters.openEnded===true,
    'Real drainage pipes need hollow ends, not solid rods');
  for(const culvert of channel.outlets){
    assert.ok(culvert.axis.y<0,
      'Only downhill pipes may drain gravity-fed water');
    assert.ok(!drainage.nearConflict(culvert.mouth),
      'No culvert may emerge under a bridge or at a junction');
  }
  assert.ok(channel.runoff.geometry.index.count>0,
    'Runoff from wet shoulders must be visibly channeled into grates');
  assert.equal(channel.runoff.visible,false,
    'Rain rivulets must remain invisible when the asphalt is dry');
  assert.equal(channel.water.geometry.index.count,
    channel.segmentCount*6/7,
    'One moving water strip accompanies seven concrete profile strips');
}
drainage.update(.016,0,0);
assert.ok(drainage.level===0,'No water should spawn without rainfall');
for(let i=0;i<1000;i++)drainage.update(.05,1,1);
assert.ok(drainage.level>.35,'Rain feeds a growing flow through gutters');
assert.ok(drainage.channels.every(c=>c.water.visible),
  'Rain-fed water flow must be visible on both sides');
assert.ok(drainage.channels.some(c=>c.outletFlow.visible&&
  c.outletFlow.geometry.index.count>0),
  'Stormwater must visibly run from culvert pipes into the grassy verge');
assert.ok(drainage.channels.every(c=>c.runoff.visible),
  'Rain must run across the verge into real drainage inlets');
assert.ok(drainage.channels.every(c=>c.splashes.visible),
  'Rain should cause animated splashing at every collector grate');
const paused=drainage.level;
drainage.update(1,0,0,true);
assert.equal(drainage.level,paused,'Paused runoff must not change');
for(let i=0;i<4500;i++)drainage.update(.07,0,0);
assert.ok(drainage.level<.025,'Drainage must empty after rain stops');
assert.ok(drainage.channels.every(c=>!c.water.visible));
assert.ok(drainage.channels.every(c=>!c.runoff.visible));
assert.ok(drainage.channels.every(c=>!c.outletFlow.visible),
  'Culvert water must stop flowing after the rain has drained away');
assert.ok(drainage.channels.every(c=>!c.splashes.visible),
  'Collector splash effects must disappear on dry roads');
const bodies=physics.bodies.length;
drainage.dispose();
assert.ok(!scene.children.includes(drainage.group));
assert.equal(physics.bodies.length,bodies,
  'Shared road colliders remain safely attached after visual disposal');
console.log('PASS: collision-backed motorway stormwater channels, V geometry, junction safety and self-draining runoff.');
