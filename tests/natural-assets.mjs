import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createNaturalShrubGeometry,createNaturalFlowerGeometry,
  createWeatheredRockGeometry,UrbanFacadeBatch,createWeatheredWallMaterial
} from '../src/natural-assets.js';

globalThis.document={createElement(){
  return {width:192,height:192,getContext(){return {
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
    putImageData(){}
  };}};
}};
const wall=createWeatheredWallMaterial();
assert.equal(wall.userData.corsaWallFinish,true);
assert.ok(wall.map?.isCanvasTexture && wall.bumpMap===wall.map,
  'Buildings should have fine-grain weathered plaster and relief');
wall.map.dispose();wall.dispose();
const shrub=createNaturalShrubGeometry('medium');
const shrubLo=createNaturalShrubGeometry('low');
assert.equal(shrub.userData.corsaNatural,'leafy-shrub');
assert.ok(shrub.index.count>shrubLo.index.count,'Bushes need a lower detail variant');
assert.ok(shrub.getAttribute('color').count===shrub.getAttribute('position').count);
assert.ok(shrub.index.count>100,'Leaves must be modeled, not represented by a solid polyhedron');
const leafY=shrub.getAttribute('position');
assert.ok([...Array(leafY.count).keys()].some(i=>leafY.getY(i)>.9),'Bushes need varied tips');
const petals=createNaturalFlowerGeometry();
assert.equal(petals.userData.corsaNatural,'flower-petals');
assert.ok(petals.index.count>=30,'Five separate flowers petals must be present');
const stone=createWeatheredRockGeometry(2);
assert.equal(stone.userData.corsaNatural,'weathered-rock');
assert.ok(stone.getAttribute('color').count===stone.getAttribute('position').count);
assert.ok(stone.getAttribute('position').count>120,'Stone must have rounded weathered geometry');
const scene=new THREE.Scene();
const facades=new UrbanFacadeBatch(scene);
facades.building({x:0,z:0,baseY:0,width:17,height:17,depth:11,seed:17});
facades.building({x:24,z:0,baseY:0,width:12,height:10,depth:13,seed:18});
facades.finalize();
const sideWindows=facades.pending.pane.filter(p=>Math.abs(Math.abs(p.rotation)-Math.PI/2)<.02);
assert.ok(new Set(sideWindows.map(p=>p.z.toFixed(3))).size>=3,
  'Building side façades must spread individual windows along Z, not stack them');
assert.equal(facades.buildingCount,2);
assert.ok(facades.windowCount>20,'Buildings need separate framed window panels');
assert.equal(facades.meshes.length,5,'Facades should use five instanced materials');
assert.ok(facades.meshes.every(m=>m.isInstancedMesh),'Building facades must be batched');
const totalDraws=scene.children.length;
assert.equal(totalDraws,5,'Hundreds of windows should only take five draw calls');
facades.dispose();
assert.equal(scene.children.length,0);
for(const g of [shrub,shrubLo,petals,stone])g.dispose();
console.log('PASS: leafy bushes, five-petal flowers, weathered rocks and instanced building facades.');
