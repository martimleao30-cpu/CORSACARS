import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ForestSystem,FOREST_LOD,TREE_SPECIES,TREE_AGES} from '../src/forest-system.js';

globalThis.document={
  createElement(name) {
    assert.equal(name,'canvas');
    return {
      width:256,height:256,
      getContext(){
        return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
          putImageData(){}};
      }
    };
  }
};
assert.equal(FOREST_LOD.length,4,'Exactly four distance LOD levels');
assert.deepEqual(TREE_SPECIES,['oak','birch','pine']);
assert.deepEqual(TREE_AGES,['young','adult','ancient']);
const scene=new THREE.Scene();
const originalSceneSize=scene.children.length;
const create=()=>new ForestSystem(scene,{quality:'low',seed:3124,terrainY:()=>0,
  distanceToRoad:()=>Infinity,isNearRoad:()=>false});
const forest=create();
assert.ok(forest.statistics.planted>=200,'Significant real forest population expected');
assert.equal(Object.values(forest.statistics.species).reduce((a,b)=>a+b,0),forest.statistics.planted);
assert.equal(Object.values(forest.statistics.ages).reduce((a,b)=>a+b,0),forest.statistics.planted);
assert.equal(forest.prototypes.size,0,'High-detail geometry must not load at startup');
assert.ok(forest.chunks.size>9,'Trees should be spatially grouped');
for(const specie of TREE_SPECIES)for(const age of TREE_AGES){
  const high=forest.getPrototype(specie+':'+age,0);
  const far=forest.getPrototype(specie+':'+age,3);
  assert.ok(high.wood.getAttribute('position').count>far.wood.getAttribute('position').count,
    'High LOD bark must have substantially more geometry');
  assert.ok(high.leaves.getAttribute('position').count>far.leaves.getAttribute('position').count,
    'High LOD leaves must have substantially more geometry');
  assert.ok(high.leaves.getAttribute('aWindWeight')!==undefined,
    'Foliage must receive per-vertex GPU wind attributes');
  assert.ok(high.leaves.index.count>200,'Near foliage must have modeled leaf geometry');
}
assert.ok(forest.materials.bark.map && forest.materials.bark.bumpMap,
  'Procedural bump-mapped bark must exist');
assert.equal(forest.materials.distantLeaves.map,null,
  'Distant canopy must not be punctured by near leaf alpha masks');
assert.ok(forest.materials.leaves.alphaTest>0,
  'Near leaf geometry must use masked foliage rather than opaque spheres');
const camera=new THREE.PerspectiveCamera(70,16/9,.2,1600);
camera.position.set(0,26,20);
camera.lookAt(0,9,-220);
camera.updateMatrixWorld(true);
forest.update(camera,.2,'clear',false);
assert.ok(forest.statistics.active>0,'Chunks ahead of player must be visible');
assert.ok(forest.statistics.loadedDetailChunks>0,'Close forest LOD0 must activate');
const nearMeshes=[...forest.chunks.values()].filter(c=>c.lod===0)
  .flatMap(c=>[...c.cache.get(0).children]);
assert.ok(nearMeshes.length>0 && nearMeshes.every(m=>m.isInstancedMesh));
const before=forest.wind.time.value;
forest.update(camera,.5,'rain',false);
assert.ok(forest.wind.time.value>before);
assert.ok(forest.wind.strength.value>.12,'Rain should increase sway');
const atPause=forest.wind.time.value;
forest.update(camera,.3,'rain',true);
assert.equal(forest.wind.time.value,atPause,'Forest must freeze when paused');
forest.setDensity(.35);
forest.setQuality('low');
assert.equal(forest.quality,'low','Quality must adjust LOD policy without rebuilding trees');
assert.ok(nearMeshes.every(m=>m.castShadow===false),'Low preset must disable tree shadow casting');
assert.ok(nearMeshes.some(m=>m.count<m.instanceMatrix.count),
  'Density slider should hide instances instead of reallocating');
camera.position.set(9000,30,9000);
camera.lookAt(9100,0,9100);
forest.update(camera,.3,'clear',false);
assert.equal(forest.statistics.active,0,'Invisible distant trees must be culled');
assert.ok([...forest.chunks.values()].every(chunk=>chunk.lod<0));
const compactForest=create();
assert.equal(compactForest.statistics.planted,forest.statistics.planted,
  'Forest positions/species must be deterministic');
compactForest.dispose();
forest.dispose();
assert.equal(scene.children.length,originalSceneSize,'Forest batches must clean up');
console.log('PASS: multi-species ages, 3D bark/leaves, distant LOD, instancing, frustum, weather and pause.');
