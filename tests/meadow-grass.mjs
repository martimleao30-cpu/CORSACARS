import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMeadowTuftGeometry,createMeadowWindMaterial,meadowProfile}
  from '../src/meadow-grass.js';
import {WorldDetails} from '../src/world-details.js';

for(const quality of ['low','medium','high','ultra']){
  const grass=createMeadowTuftGeometry(quality);
  assert.equal(grass.userData.corsaGrass,'multi-blade-curved-meadow');
  assert.ok(grass.getAttribute('position').count>25);
  assert.equal(grass.getAttribute('position').count,grass.getAttribute('color').count);
  assert.equal(grass.index.count,grass.userData.blades*15);
  assert.ok(grass.boundingSphere.radius>0);
  grass.dispose();
}
const low=createMeadowTuftGeometry('low');
const high=createMeadowTuftGeometry('high');
assert.ok(high.userData.blades>low.userData.blades);
low.dispose();high.dispose();
const dry=meadowProfile(80,-140,45);
const edge=meadowProfile(80,-140,4);
assert.ok(edge.height<dry.height*.75,'Close-to-road grass must be shorter');
assert.ok(edge.density<dry.density,'The verge needs sparser plants');
assert.ok(edge.roadside>.9 && dry.roadside<.05);
const c1=meadowProfile(55,34,18),c2=meadowProfile(354,-231,18);
assert.notEqual(c1.color.getHex(),c2.color.getHex(),'Spatial colour variation matters');
const wind=createMeadowWindMaterial();
const shader={uniforms:{},vertexShader:'#include <common>\nvoid main(){\n#include <begin_vertex>\n}'};
wind.mat.onBeforeCompile(shader);
assert.ok(shader.vertexShader.includes('instanceMatrix[3].x'));
assert.ok(shader.vertexShader.includes('tuftHeight'));
assert.ok(shader.vertexShader.includes('leafFlex'));
assert.equal(shader.uniforms.uCorsaWind,wind.wind);
wind.mat.dispose();
const scene=new THREE.Scene(),points=[];
for(let i=0;i<=96;i++){
  const a=i/96*Math.PI*2;
  points.push({center:new THREE.Vector3(Math.cos(a)*190,0,Math.sin(a)*190),
    side:new THREE.Vector3(Math.cos(a),0,Math.sin(a)),
    tangent:new THREE.Vector3(-Math.sin(a),0,Math.cos(a))});
}
globalThis.document={createElement(){return {width:192,height:192,getContext(){
  return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
    putImageData(){}};
}};}};
let excluded=0;
const clearance={
  plantAllowed(x,z,kind){const allowed=x<=0;if(!allowed)excluded++;return allowed;},
  roadProximity(x,z){return {edge:Math.abs(Math.hypot(x,z)-190)-7};}
};
const details=new WorldDetails(scene,points,13.5,()=>0,'low',null,clearance);
assert.ok(excluded>0,'Meadow candidates must consult road-clearance masks');
assert.ok(details.grassStatistics.planted>100,'Allowed half of meadow must be populated');
assert.equal(details.grassStatistics.planted,1300,\n  'Permitted grass candidates should fill the configured density budget');
assert.ok(details.grassStatistics.rejected>0);
let checked=0;
const matrix=new THREE.Matrix4(),place=new THREE.Vector3();
for(const patch of details.grassPatches){
  for(let i=0;i<patch.mesh.count;i++){
    patch.mesh.getMatrixAt(i,matrix);
    place.setFromMatrixPosition(matrix);
    assert.ok(place.x<=0.0001,'Grass must never appear in excluded half-space');
    checked++;
  }
}
assert.equal(checked,details.grassStatistics.planted);
const original=details.grassPatches.reduce((n,p)=>n+p.mesh.count,0);
details.setDensity(.25);
const quarter=details.grassPatches.reduce((n,p)=>n+p.mesh.count,0);
assert.ok(quarter<original*.38 && quarter>0,'Quality slider still reduces density');
console.log('PASS: bent meadow geometry, dry/green gradients, realistic verges, clearance, wind and instanced culling.');
