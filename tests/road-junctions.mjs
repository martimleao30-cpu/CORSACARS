import assert from 'node:assert/strict';
import * as THREE from 'three';
import {findAtGradeJunctions,clipGeometryAtJunctions,blendJunctionHeights,roadPriority}
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
  assert.ok(Math.abs(cz)>=main.width*.5-.25,
    'Secondary road must stop at the main deck with only a tiny overlap');
  assert.ok(Number.isFinite(cx));
  triangles++;
}
assert.ok(triangles>0);
assert.ok(clipped.getAttribute('uv'),'Texture coordinates preserved');
const before=Array.from(clipped.getAttribute('position').array);
blendJunctionHeights(clipped,junctions,()=>0);
assert.ok(before.some((value,i)=>i%3===1&&
  Math.abs(value-clipped.getAttribute('position').array[i])>.0001),
  'A blended junction must smoothly adjust the secondary deck edge');

// T junction with a secondary road ending in the carriageway, rather than
// mathematically crossing its centreline, must still get a single owner.
const ring=road('circular','ring',13.5,[[-40,.2,0],[40,.2,0]]);
const branch=road('access','rural',7,[[1,.2,-24],[1,.2,-2]]);
const joins=findAtGradeJunctions([ring,branch]);
assert.ok(joins.some(j=>j.secondary===branch&&j.kind==='endpoint'),
  'A T junction ending on the main carriageway must be clipped');
const point=joins.find(j=>j.kind==='endpoint');
assert.equal(point.primary,ring);
assert.ok(point.halfU>0&&point.halfV>=ring.width*.5-.25);

geo.dispose();clipped.dispose();
console.log('PASS: single-owner T/X junctions, grade separation and exact surface clipping.');
