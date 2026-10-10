import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCloudTexture,AtmosphericClouds,RainStreaks} from '../src/atmosphere-effects.js';

let cloudPixels=null;
globalThis.document={
  createElement(name){
    assert.equal(name,'canvas');
    return {width:192,height:192,
      getContext(){return {
        createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
        putImageData:(data)=>{cloudPixels=data.data;}
      };}
    };
  }
};
const scene=new THREE.Scene();
const texture=createCloudTexture(64);
assert.equal(texture.isCanvasTexture,true);
assert.equal(texture.colorSpace,THREE.SRGBColorSpace);
assert.ok(cloudPixels.some((v,i)=>i%4===3 && v>90),'Clouds must have dense central areas');
assert.ok(cloudPixels.some((v,i)=>i%4===3 && v===0),'Clouds must have soft transparent edges');
texture.dispose();

const system=new AtmosphericClouds(scene,'medium');
assert.equal(system.groups.length,4,'Clouds are split into four spatially culled batches');
assert.ok(system.clouds.count>0);
assert.ok(system.groups.every(m=>m.isInstancedMesh&&m.geometry.getAttribute('position').count===4));
assert.ok(system.groups.every(m=>m.frustumCulled&&m.material.depthWrite===false));
const a=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
system.clouds.getMatrixAt(0,a);
a.decompose(p,q,s);
assert.ok(s.x>25&&s.z>25&&s.y===1,
  'Billboard planes lie horizontal in X/Z and must be scaled along their actual depth');
const cloudTime=system.time;
system.update(.1,'rain',12,false);
assert.ok(system.time>cloudTime);
assert.ok(system.material.opacity>.9,'Rain must increase cloud cover');
const stationary=system.time;
system.update(.1,'fog',22,true);
assert.equal(system.time,stationary,'Pausing must freeze cloud drift');
assert.ok(system.material.opacity<.6,'Fog changes cloud opacity');

const rain=new RainStreaks(scene,'low');
assert.ok(rain.mesh.isLineSegments,'Rain must render as narrow falling streaks');
assert.ok(rain.count<=500);
assert.equal(rain.mesh.geometry.getAttribute('position').count,rain.count*2);
assert.equal(rain.mesh.visible,false);
rain.mesh.visible=true;
const initial=rain.position[1];
rain.update(.012,false);
assert.ok(rain.position[1]!==initial,'Rain must move while active');
assert.ok(rain.mesh.geometry.getAttribute('position').array[4]>
  rain.mesh.geometry.getAttribute('position').array[1],
  'A rain streak must have physical segment length');
const before=rain.position[1];
rain.update(.2,true);
assert.equal(rain.position[1],before,'Rain pauses with gameplay');
system.dispose();
rain.dispose();
assert.equal(scene.children.length,0,'Atmospheric meshes must clean up');
console.log('PASS: soft volumetric-looking cloud alpha, instancing, X/Z scale, weather, and dynamic rain streaks.');
