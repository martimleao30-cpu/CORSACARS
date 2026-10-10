import assert from 'node:assert/strict';
import * as THREE from 'three';
import {findAtGradeJunctions,clipGeometryAtJunctions,roadPriority}
  from '../src/road-junctions.js';

const road=(id,category,width,coords)=>({
  id,category,width,points:coords.map(([x,y,z])=>new THREE.Vector3(x,y,z))
});
const main=road('nacional','urban',10,[[-25,.2,0],[0,.2,0],[25,.2,0]]);
const side=road('ramal','rural',7,[[0,.2,-25],[0,.2,25]]);
const elevated=road('bridge','highway',11,[[-25,8,5],[25,8,5]]);
const junctions=findAtGradeJunctions([main,side,elevated]);
assert.equal(junctions.length,1,'Grade-separated bridge cannot be flattened');
assert.equal(junctions[0].primary,main);
assert.equal(junctions[0].secondary,side);
assert.equal(roadPriority(main)>roadPriority(side),true);
const geo=new THREE.BufferGeometry();
geo.setAttribute('position',new THREE.Float32BufferAttribute([
  -3,.2,-24,3,.2,-24,-3,.2,24,3,.2,24
],3));
geo.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));
geo.setIndex([0,2,1,1,2,3]);
geo.computeVertexNormals();
const clipped=clipGeometryAtJunctions(geo,junctions);
assert.ok(clipped?.index.count>0);
assert.equal(clipped.userData.junctionClipped,true);
const position=clipped.getAttribute('position');
const index=clipped.index;
let triangles=0;
for(let k=0;k<index.count;k+=3){
  const cx=(position.getX(index.getX(k))+position.getX(index.getX(k+1))+
    position.getX(index.getX(k+2)))/3;
  const cz=(position.getZ(index.getX(k))+position.getZ(index.getX(k+1))+
    position.getZ(index.getX(k+2)))/3;
  assert.ok(Math.abs(cz)>=main.width*.5-1e-3,
    'Secondary road triangle must stop at the main asphalt edge');
  assert.ok(Number.isFinite(cx));
  triangles++;
}
assert.ok(triangles>0);
assert.ok(clipped.getAttribute('uv'),'Texture coordinates preserved');
geo.dispose();clipped.dispose();
console.log('PASS: single-owner T/X junctions, grade separation and exact surface clipping.');
