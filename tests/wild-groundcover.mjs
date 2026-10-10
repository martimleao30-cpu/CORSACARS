import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WildGroundcover} from '../src/wild-groundcover.js';
const scene=new THREE.Scene();
const clearance={
  plantAllowed(x,z){return x<0;},
  roadProximity(x,z){return {edge:Math.abs(x)+20};}
};
const railway={nearestTrack(x,z){return Math.abs(z-12);}};
const a=new WildGroundcover(scene,()=>0,clearance,railway,'low');
assert.ok(a.statistics.shrubs>100);
assert.ok(a.statistics.meadow>500);
assert.ok(a.statistics.flowerPatches>100);
assert.ok(a.statistics.tiles>5);
let counter=0;const matrix=new THREE.Matrix4(),point=new THREE.Vector3();
for(const chunk of a.chunks){
  assert.ok(chunk.mesh.isInstancedMesh,'Ground cover must stay batched');
  const positions=chunk.mesh.instanceMatrix;
  for(let i=0;i<chunk.mesh.count;i+=Math.max(1,Math.floor(chunk.mesh.count/9))){
    chunk.mesh.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);
    assert.ok(point.x<=0.01,'Ground cover cannot grow inside blocked road');
    assert.ok(Math.abs(point.z-12)>=5,'Ground cover cannot grow on train track');
    counter++;
  }
}
assert.ok(counter>100);
a.update(new THREE.Vector3(-40,0,0),.2,false);
assert.ok(a.chunks.some(c=>c.mesh.visible));
const count=a.chunks.reduce((sum,c)=>sum+c.mesh.count,0);
a.setDensity(.5);
assert.ok(a.chunks.reduce((sum,c)=>sum+c.mesh.count,0)<count);
a.dispose();
assert.equal(a.chunks.length,0);
console.log('PASS: world-wide shrubs, flowers and grass, road/rail exclusion, tiled instancing and density control.');
