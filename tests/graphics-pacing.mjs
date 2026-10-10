import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GraphicsPipeline} from '../src/graphics.js';

const renders=[],targets=[];
const renderer={
  toneMappingExposure:1,
  shadowMap:{autoUpdate:true},
  getRenderTarget:()=>null,
  setRenderTarget:(target,face)=>targets.push({target,face}),
  render:(scene,camera)=>renders.push(camera)
};
const scene=new THREE.Scene();
const model=new THREE.Group(),wheelModels=[new THREE.Group(),new THREE.Group()];
model.position.set(125,4,-19);
const vehicle={model,wheelModels,setReflectionMap:()=>{}};
const world={hour:13,weather:'clear',atmosphere:{exposure:1.04}};
const graphics=new GraphicsPipeline(renderer,scene,new THREE.PerspectiveCamera(),
  vehicle,world);
graphics.quality='high';
graphics.reflectionEnabled=true;
for(let i=0;i<59;i++)graphics.update(1/60,true);
assert.equal(renders.length,5,
  'Reflection capture should render at most one face every 10 frames');
assert.equal(targets.filter(x=>x.target).length,5);
assert.equal(graphics.reflectionTarget.width,128,
  'Performance must not lower the cubemap resolution');
assert.deepEqual(targets.filter(x=>x.target).map(x=>x.face),[0,1,2,3,4]);
assert.equal(renderer.shadowMap.autoUpdate,true);
assert.equal(model.visible,true);
assert.ok(wheelModels.every(w=>w.visible));
graphics.update(1/60,true);
assert.equal(renders.length,6,'The sixth face completes the reflection cycle');
assert.equal(graphics.reflectionFace,0);
assert.equal(graphics.reflectionCapturePosition.x,125);
model.position.x=180;
for(let i=0;i<10;i++)graphics.update(1/60,true);
assert.equal(graphics.reflectionCapturePosition.x,180,
  'New capture origin must be updated on the next cube cycle');
assert.equal(graphics.reflectionFace,1);
graphics.reflectionEnabled=false;
for(let i=0;i<20;i++)graphics.update(1/60,true);
assert.equal(renders.length,7,'Disabled reflections must not render cube faces');
assert.ok(targets.every(x=>x.target===null||x.target===graphics.reflectionTarget));
console.log('PASS: all six full-resolution cube faces updated incrementally with restored render state.');
