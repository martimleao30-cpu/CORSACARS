import assert from 'node:assert/strict';
import {WindshieldWeather} from '../src/windshield-weather.js';
let drawn=0,cleared=0,removed=0;
const ctx={
  clearRect(){cleared++;},beginPath(){},ellipse(){drawn++;},
  fill(){},moveTo(){},lineTo(){},stroke(){},
  save(){},restore(){},translate(){},rotate(){}
};
const parent={appendChild(node){this.child=node;}};
globalThis.document={createElement:()=>({
  width:0,height:0,style:{},setAttribute(){},getContext:()=>ctx,
  remove(){removed++;}
})};
globalThis.innerWidth=1280;
globalThis.innerHeight=720;
globalThis.devicePixelRatio=1;
const glass=new WindshieldWeather(parent,30);
assert.equal(glass.canvas.style.pointerEvents,'none');
glass.update(.04,{rain:1,wind:.6},130,1,true);
assert.equal(glass.canvas.style.display,'none','External view has no fake windshield rain');
glass.update(.04,{rain:0},30,2,true);
assert.equal(glass.canvas.style.display,'none','Dry glass must remain clear');
glass.update(.04,{rain:.9,wind:.6},130,2,true);
assert.equal(glass.canvas.style.display,'block');
assert.ok(cleared>0&&drawn>0,'Interior glass droplets must be drawn');
assert.equal(glass.canvas.width,1280);
assert.equal(glass.canvas.height,720);
glass.update(.04,{rain:1},0,2,false);
assert.equal(glass.canvas.style.display,'none','Pause must hide the windshield overlay');
glass.dispose();
assert.equal(removed,1);
assert.equal(glass.drops.length,0);
console.log('PASS: windshield droplets use one reusable overlay, interior camera only and no menu interference.');
