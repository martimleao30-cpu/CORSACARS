import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {RegionalRailway,generateRailwayAlignment,sampleAlignment}
  from '../src/regional-railway.js';
const terrain=(x,z)=>2*Math.sin(x*.018)+2*Math.cos(z*.013);
const clearance={roadProximity(x,z){
  return {edge:Math.abs(x-110)};
}};
const map=generateRailwayAlignment(terrain,clearance,650);
assert.ok(map.total>4800,'Regional line must travel the entire playable map');
assert.ok(map.points.length===651);
for(const x of [0,250,760,1700,map.total-.1]){
  const p=sampleAlignment(map,x);
  assert.ok(Number.isFinite(p.point.y));
  assert.ok(Math.abs(p.dir.length()-1)<.00001);
}
const scene=new THREE.Scene(),physics=new CANNON.World();
const rail=new RegionalRailway(scene,physics,terrain,clearance,'low');
assert.ok(rail.statistics.lengthM>4800);
assert.equal(rail.statistics.stations,2);
assert.equal(rail.statistics.trainCars,3);
assert.ok(rail.statistics.sleepers>4000);
assert.ok(rail.statistics.railSegments>=650);
for(const station of rail.stations){
  assert.ok(station.group.children.length>0);
  assert.ok(rail.group.children.includes(station.group));
  assert.ok(station.point.distanceTo(sampleAlignment(rail.line,station.distance).point)<1.5);
}
const initial=rail.trainCars[0].position.clone();
rail.update(1,false);
assert.ok(rail.trainCars[0].position.distanceTo(initial)>.001,
  'Electric train must move along the tracks');
const paused=rail.trainCars[0].position.clone();
rail.update(.5,true);
assert.ok(paused.distanceTo(rail.trainCars[0].position)<1e-6);
for(const train of rail.trainCars){
  assert.ok(train.children.some(x=>x.name==='Janela de passageiros'));
  assert.ok(train.children.some(x=>x.name==='Rodas de aço'));
}
assert.ok(rail.nearestTrack(rail.line.points[50].x,rail.line.points[50].z)<4);
rail.dispose();
assert.ok(!scene.children.includes(rail.group));
console.log('PASS: map-spanning railway, grade-separated crossing height, station models, moving electric train and pause.');
