import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoadBed} from '../src/road-upgrades.js';
import {RoadSignage,createRoadSampler,junctionPaintGaps,
  planJunctionApproaches,createJunctionMarkingGeometry,PAINT_LIFT}
  from '../src/road-signage.js';

const terrain=(x,z)=>Math.sin(x*.018)*.18+Math.cos(z*.024)*.22;
const makeRoad=(id,category,width,from,to,surface='dry')=>{
  const points=Array.from({length:61},(_,i)=>{
    const t=i/60,x=from[0]+(to[0]-from[0])*t,
      z=from[1]+(to[1]-from[1])*t;
    return new THREE.Vector3(x,terrain(x,z),z);
  });
  const {top}=createRoadBed(points,width,terrain,51,surface);
  return {id,name:id,category,surface,width,points,
    mesh:new THREE.Mesh(top,new THREE.MeshStandardMaterial())};
};
const priority=makeRoad('principal','urban',7,[-60,0],[60,0]);
const secondary=makeRoad('secundaria','rural',6.5,[0,-60],[0,60]);
const crossing={x:0,z:0,halfU:6,halfV:priority.width*.5,
  angle:1,kind:'cross',primary:priority,secondary};
const sampler=createRoadSampler(secondary);
const gaps=junctionPaintGaps(sampler,[crossing]);
const approaches=planJunctionApproaches(sampler,[crossing]);
assert.equal(approaches.length,2,'X junction must mark both incoming directions');
assert.deepEqual(approaches.map(p=>p.direction),[1,-1]);
assert.ok(approaches.every(p=>p.kind==='give-way'));
assert.equal(planJunctionApproaches(createRoadSampler(priority),[crossing]).length,0,
  'Priority carriageway cannot receive a false give-way or STOP line');
for(const plan of approaches){
  const paint=createJunctionMarkingGeometry(sampler,plan);
  assert.ok(paint?.index.count>=6,'Each approach has multiple triangular teeth');
  assert.equal(paint.userData.kind,'give-way');
  assert.equal(paint.userData.direction,plan.direction);
  const uv=paint.getAttribute('uv'),position=paint.getAttribute('position');
  for(let i=0;i<uv.count;i++){
    const lateral=uv.getX(i),distance=uv.getY(i);
    assert.ok(distance<gaps[0][0]||distance>gaps[0][1],
      'Junction triangles must lie completely outside intersection envelope');
    assert.ok(plan.direction===1?lateral<0:lateral>0,
      'Give-way must mark ONLY the incoming right-hand traffic lane');
    const source=sampler.point(distance,lateral,PAINT_LIFT+.003);
    assert.ok(Math.abs(position.getY(i)-source.y)<1e-5,
      'Triangular paint must follow the physical crowned road surface');
  }
  paint.dispose();
}
const endRoad=makeRoad('terminacao','rural',6.5,[0,-60],[0,0]);
const endJoin={...crossing,secondary:endRoad,kind:'endpoint'};
const endApproaches=planJunctionApproaches(
  createRoadSampler(endRoad),[endJoin]);
assert.equal(endApproaches.length,1,
  'T-road which stops at the priority carriageway has one usable approach');
assert.equal(endApproaches[0].direction,1);
const ramp=makeRoad('rampa','highway-ramp',3.75,[0,-60],[0,60]);
const motorway=makeRoad('autoestrada','highway',19,[-60,0],[60,0]);
const merge={...crossing,primary:motorway,secondary:ramp,kind:'endpoint',
  halfV:motorway.width*.5};
const mergePlans=planJunctionApproaches(createRoadSampler(ramp),[merge]);
assert.ok(mergePlans.length>0);
assert.ok(mergePlans.every(p=>p.kind==='merge-guide'),
  'Acceleration lanes must not have a painted stop/yield barrier');
assert.equal(createJunctionMarkingGeometry(
  createRoadSampler(ramp),mergePlans[0]).userData.kind,'merge-guide');
const dirt=makeRoad('trilho','dirt',4,[0,-60],[0,60],'dirt');
assert.equal(planJunctionApproaches(createRoadSampler(dirt),
  [{...crossing,secondary:dirt}]).length,0,
  'Unpaved roads must not receive floating white linework');
const scene=new THREE.Scene();
const render=new RoadSignage(scene,{roads:[priority,secondary],
  junctions:[crossing]},'low');
assert.equal(render.statistics.yieldLines,2);
assert.equal(render.statistics.junctionApproaches,2);
assert.equal(render.statistics.mergeGuides,0);
assert.equal(render.meshes.filter(m=>m.geometry.userData.kind==='give-way').length,2);
const painted=render.meshes.filter(m=>m.geometry.userData.kind==='give-way');
render.dispose();
assert.ok(painted.every(mesh=>!scene.children.includes(mesh)));
console.log('PASS: every at-grade priority approach receives correctly directed, deck-fitted markings; motorway ramps use merge guides.');
