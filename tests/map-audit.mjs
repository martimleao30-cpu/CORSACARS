import assert from 'node:assert/strict';
import * as THREE from 'three';
import {auditMap} from '../src/map-audit.js';

const scene=new THREE.Scene();
const geometry=new THREE.BufferGeometry();
geometry.setAttribute('position',new THREE.Float32BufferAttribute([
  -3,.2,0,3,.2,0,0,.2,6,
  -3,.2,6,3,.2,6,0,.2,12
],3));
geometry.setIndex([0,1,2,3,4,5]);
const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());
const road={id:'road-1',width:6.5,profile:{pavedWidth:6.5},mesh,
  body:{shapes:[{indices:[0,1,2,3,4,5]}]},
  points:[new THREE.Vector3(0,.2,0),new THREE.Vector3(0,.2,12)]};
const network={roads:[road],junctions:[],
  query:(x,z)=>({distance:Math.abs(x),surface:'dry'})};
const correct=auditMap({network,terrainY:()=>0});
assert.equal(correct.ok,true,JSON.stringify(correct.issues));
assert.equal(correct.metrics.roads,1);
assert.equal(correct.metrics.roadSegments,1);
assert.equal(correct.metrics.physicsDecks,1);

road.width=8;
road.body.shapes[0].indices=[0,1,2];
road.points[1].y=NaN;
const defective=auditMap({network,terrainY:()=>0});
assert.equal(defective.ok,false);
for(const kind of ['width','collision-mismatch','road-height'])
  assert.ok(defective.counts[kind]>=1,'Audit must flag '+kind);
road.width=6.5;
road.body.shapes[0].indices=[0,1,2,3,4,5];
road.points[1].y=.2;
road.junctionCuts=[{x:0,z:5,ux:0,uz:1,halfU:10,halfV:10}];
const overlap=auditMap({network,terrainY:()=>0});
assert.ok(overlap.counts['junction-clip']>=1);
assert.ok(overlap.counts['junction-overlap']>=1);
road.junctionCuts=[];
const tree={x:0,z:5};
const forest={chunks:new Map([['x',{items:[tree]}]])};
const intrusion=auditMap({network,terrainY:()=>0,forest});
assert.ok(intrusion.counts['tree-on-road']>=1);
assert.equal(intrusion.metrics.forestSamples,1);
console.log('PASS: full map diagnostics for road widths, visual/physical mismatch, collision, junctions and trees.');
