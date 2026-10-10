import assert from 'node:assert/strict';
import * as THREE from 'three';
import {AssetUpgrade} from '../src/assets.js';

// No network access required: emulate a successful photographic texture load.
const originalLoad=THREE.TextureLoader.prototype.load;
const loadedUrls=[];
THREE.TextureLoader.prototype.load=function(url,onLoad){
  assert.match(url,/asphalt_02_diff_/);
  loadedUrls.push(url);
  const texture=new THREE.Texture();
  onLoad(texture);
  return texture;
};
try{
  const ring=new THREE.MeshPhysicalMaterial();
  const motorway=new THREE.MeshPhysicalMaterial();
  const rural=new THREE.MeshPhysicalMaterial();
  const gravel=new THREE.MeshStandardMaterial();
  for(const mat of [ring,motorway,rural])mat.userData.roadAsphalt=true;
  const world={roadMaterial:ring,weather:'clear',
    network:{materials:new Map([
      ['autoestrada',motorway],['rural',rural],['gravilha',gravel]
    ])}};
  const assets=new AssetUpgrade({},world,null,null);
  await assets.loadPhotographicAsphalt('high');
  assert.equal(assets.textureLoaded,true);
  assert.match(loadedUrls.at(-1),/\/2k\/asphalt_02\/asphalt_02_diff_2k\.jpg$/);
  assert.equal(assets.asphaltResolution,'2k');
  assert.ok(ring.map,'Main road needs the photographic texture');
  assert.equal(motorway.map,ring.map,'Joined motorway must match main asphalt');
  assert.equal(rural.map,ring.map,'Rural asphalt must match main asphalt');
  assert.equal(gravel.map,null,'Gravel must retain its own surface');
  const previous=ring.map;
  let disposed=false;
  previous.addEventListener('dispose',()=>{disposed=true;});
  await assets.loadPhotographicAsphalt('ultra');
  assert.match(loadedUrls.at(-1),/\/4k\/asphalt_02\/asphalt_02_diff_4k\.jpg$/);
  assert.equal(assets.asphaltResolution,'4k');
  assert.notEqual(ring.map,previous,'Higher resolution reload must replace map');
  assert.equal(rural.map,ring.map,'Reloaded texture still matches every road');
  assert.equal(disposed,true,'Old shared remote texture must be disposed once');
  await assets.loadPhotographicAsphalt('low');
  assert.match(loadedUrls.at(-1),/\/1k\/asphalt_02\/asphalt_02_diff_1k\.jpg$/);
  assert.equal(assets.asphaltResolution,'1k');
  console.log('PASS: identical photographic asphalt on all paved roads and safe reload.');
}finally{
  THREE.TextureLoader.prototype.load=originalLoad;
}
