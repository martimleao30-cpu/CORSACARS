import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
globalThis.document={createElement(){return {width:512,height:192,getContext(){
  return {fillRect(){},strokeRect(){},fillText(){},
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};
}};}};
const {RoadNetwork}=await import('../src/road-network.js');
const {WorldSectors}=await import('../src/world-sectors.js');
const ring=Array.from({length:421},(_,i)=>{
  const a=i/420*Math.PI*2;return {
    center:new THREE.Vector3(400*Math.cos(a),0,400*Math.sin(a)),
    tangent:new THREE.Vector3(-Math.sin(a),0,Math.cos(a))};
});
const scene=new THREE.Scene(),physics=new CANNON.World();
const network=new RoadNetwork(scene,physics,()=>0,ring,13.5,'low');
const sector=new WorldSectors(scene,physics,network,()=>0);
const initial=physics.bodies.length;
for(const region of sector.regions){
  sector.load(region);
  const record=sector.active.get(region.id);
  assert.ok(record);
  const geometries=new Set(),owned=[];
  record.group.traverse(x=>{
    if(x.isMesh&&x.geometry){
      geometries.add(x.geometry);
      if(x.material&&!Array.isArray(x.material))owned.push(x.material);
    }
  });
  assert.ok(geometries.size>3);
  let disposed=0;
  const chosen=[...geometries][0];
  chosen.addEventListener('dispose',()=>{disposed++;});
  sector.unload(region.id);
  assert.equal(physics.bodies.length,initial,'Unload must not leak POI collision');
  assert.equal(disposed,1,'POI geometry must release WebGL buffers');
  assert.ok([...geometries].every(g=>g.getAttribute('position')?.array),
    'Geometry objects remain inspectable despite GPU dispose');
}
sector.dispose();
// Eager mode constructs EVERY named location at startup and keeps it alive
// while the player moves to another end of the map.
const progress=[];
const regionCount=await sector.preloadAll((done,total)=>
  progress.push([done,total]),async()=>{});
assert.equal(regionCount,sector.regions.length);
assert.equal(sector.preloaded,true);
assert.equal(progress.length,sector.regions.length);
const eagerBodies=physics.bodies.length;
assert.ok(eagerBodies>initial);
sector.update(new THREE.Vector3(12000,0,12000),5,14);
assert.equal(sector.active.size,sector.regions.length,
  'Eager mode must not unload town, farm or service assets mid-drive');
assert.equal(physics.bodies.length,eagerBodies,
  'Eager mode retains POI collisions without rebuilding them while driving');
sector.dispose();
assert.equal(physics.bodies.length,initial,
  'Eager POI cleanup must still remove static physics bodies');
console.log('PASS: all POIs load/unload correctly and eager preload retains them during driving.');
