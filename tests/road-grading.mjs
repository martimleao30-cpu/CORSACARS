import assert from 'node:assert/strict';
import * as THREE from 'three';
import {engineerRoadGrade,roadGradeTerrain,gradeLimit,roadGradeStatistics,
  ROAD_MAX_CROSS_SLOPE} from '../src/road-grading.js';
import {createRoadBed} from '../src/road-upgrades.js';

const terrain=(x,z)=>8*Math.sin(x*.051)+z*.72+
  1.8*Math.cos(x*.11+z*.04);
const natural=Array.from({length:170},(_,i)=>new THREE.Vector3(
  i*4,terrain(i*4,0)+.21,0));
const unmodified=natural.map(p=>p.clone());
const limit=.09;
const alignment=engineerRoadGrade(natural,terrain,{
  maxGrade:limit,smoothingMetres:43,
  startY:unmodified[0].y,endY:unmodified.at(-1).y
});
const metrics=roadGradeStatistics(natural);
assert.ok(metrics.maxGrade<=limit+.0002,
  'Engineered vertical profile must obey the 9% road grade limit');
assert.ok(metrics.maxGrade<.12,'Abrupt mountain crests must disappear');
assert.ok(Math.abs(natural[0].y-unmodified[0].y)<1e-6,
  'Connected road start must remain fixed at its parent deck');
assert.ok(Math.abs(natural.at(-1).y-unmodified.at(-1).y)<1e-6,
  'Connected road end must not float above the circular road');
const sampler=roadGradeTerrain(natural,terrain,7);
const deck=createRoadBed(natural,7,sampler,35,'dry');
const p=deck.top.getAttribute('position'),stride=7;
let maxCrossfall=0;
for(let i=0;i<natural.length;i++){
  const left=p.getY(i*stride),right=p.getY(i*stride+6);
  maxCrossfall=Math.max(maxCrossfall,Math.abs(left-right)/7);
  const mid=p.getY(i*stride+3);
  assert.ok(Math.abs(mid-natural[i].y-.047)<.025,
    'Physical central asphalt must follow the engineered grade plus standard road crown');
  assert.ok(Math.abs(left-mid)<.11&&Math.abs(right-mid)<.11,
    'Steep underlying terrain must not tilt a drivable lane sideways');
}
assert.ok(maxCrossfall<=ROAD_MAX_CROSS_SLOPE,
  'All seven transverse pavement vertices must keep near-level camber');
assert.ok(Math.abs(sampler(200,50)-terrain(200,50))<.0001,
  'Engineering must return to untouched terrain beyond the cut/fill slope');
assert.equal(gradeLimit({category:'highway'}),.065);
assert.ok(gradeLimit({category:'mountain'})>.09);
assert.ok(gradeLimit({category:'highway-ramp'})<.09);
assert.ok(alignment.longestCut>1,
  'A steep artificial hillside should require real engineering earthworks');
deck.top.dispose();deck.sides.dispose();
console.log('PASS: anchored smooth grades, level paved cross-sections, cut/fill interpolation, mountain and motorway limits.');
