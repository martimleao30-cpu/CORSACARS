import assert from 'node:assert/strict';
import * as THREE from 'three';

// Pure geometry and PBR tests; no browser, Unity or remote assets required.
globalThis.document={
  createElement(name){
    assert.equal(name,'canvas');
    return {width:0,height:0,getContext(){
      return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
        putImageData(){}};
    }};
  }
};
const {createRoadBed,ROAD_SECTION,roadDeckHeight,addRoadWear,addRoadShoulders,addRoadSides}=
  await import('../src/road-upgrades.js');
const {createAsphaltMaterial,createGravelMaterial}=await import('../src/materials.js');
const points=[
  new THREE.Vector3(0,.2,0),
  new THREE.Vector3(0,.2,11),
  new THREE.Vector3(1,.2,22)
];
const ground=(x,z)=>.03*x+.01*z;
const width=12;
const bed=createRoadBed(points,width,ground,11);
const positions=bed.top.getAttribute('position');
const uv=bed.top.getAttribute('uv');
assert.equal(positions.count,points.length*ROAD_SECTION.length);
assert.equal(uv.count,positions.count);
assert.equal(bed.top.index.count,(points.length-1)*(ROAD_SECTION.length-1)*6);
assert.equal(bed.sides.getAttribute('position').count,points.length*4);
assert.ok(
  positions.getY(3)-ground(positions.getX(3),positions.getZ(3)) >
  positions.getY(0)-ground(positions.getX(0),positions.getZ(0)),
  'Camber must rise relative to terrain, even on sloping ground');
assert.ok(uv.getY(ROAD_SECTION.length)>uv.getY(0),'Texture V must use real distance');
assert.ok(uv.getX(ROAD_SECTION.length-1)>1,'Texture must tile in metres across width');
assert.ok(Math.abs(positions.getY(3)-roadDeckHeight(ground,0,0,0,width))<1e-5);
assert.ok(bed.top.getAttribute('color'),'Long-range road color variation required');
const normal=bed.top.getAttribute('normal');
assert.ok(normal.getY(3)>.2,'Drivable triangles must face upward');
const aged=createAsphaltMaterial('low','aged');
const fresh=createAsphaltMaterial('low','fresh');
const worn=createAsphaltMaterial('low','worn');
assert.ok(aged.isMeshPhysicalMaterial);
assert.ok(aged.map&&aged.normalMap&&aged.roughnessMap);
assert.equal(aged.vertexColors,true);
assert.equal(aged.userData.variant,'aged');
assert.equal(aged.map.image.width,384,'Offline low detail should be upgraded to 384px');
for(const map of [aged.map,aged.normalMap,aged.roughnessMap])
  assert.equal(map.repeat.y,2,'All asphalt PBR maps should use the same UV tiling');
assert.notEqual(fresh.map,worn.map);
assert.equal(createAsphaltMaterial('low','aged').map,aged.map,
  'PBR textures must be shared between routes');
const scene=new THREE.Scene();
const sideMesh=addRoadSides(scene,bed.sides,'Teste');
assert.equal(sideMesh.geometry,bed.sides);
const wear=addRoadWear(scene,points,width,ground,'low',27);
assert.ok(wear.patches.count>0 && wear.skids.count>=2 && wear.dirt.count>=2);
const gravel=createGravelMaterial();
assert.equal(gravel.map.image.width,512,'Gravel should have more than 128 pixels');
assert.ok(gravel.normalMap?.isCanvasTexture,'Fine stone relief normal map required');
assert.equal(createGravelMaterial().map,gravel.map,'Gravel texture must be cached globally');
const shoulders=addRoadShoulders(scene,points,width,ground,gravel);
assert.equal(shoulders.length,2);
assert.ok(shoulders.every(m=>m.geometry.index.count>0));
for(const shoulder of shoulders){
  const geometry=shoulder.geometry;
  assert.equal(geometry.getAttribute('position').count,points.length*4);
  assert.equal(geometry.getAttribute('color').count,points.length*4);
  assert.ok(geometry.index.count>12,'A shoulder must have graded material bands');
  assert.equal(shoulder.material.vertexColors,true);
  const uv=geometry.getAttribute('uv');
  assert.ok(uv.getX(4)>uv.getX(0),'Gravel UV should tile along real metres');
  const colors=geometry.getAttribute('color');
  assert.notEqual(colors.getY(0),colors.getY(3),
    'Outer verge must blend gravel into natural soil/grass');
}
assert.equal(scene.children.length,6);
console.log('PASS: 3D road deck and sides, real-distance UVs, PBR aging, reuse, tire marks, patches and shoulders.');
