import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {RegionalRailway,generateRailwayAlignment,sampleAlignment,
  createBallastBedGeometry,createSteelRailGeometry,createRailwayBallastSurface}
  from '../src/regional-railway.js';
const terrain=(x,z)=>2*Math.sin(x*.018)+2*Math.cos(z*.013);
const clearance={roadProximity(x,z){
  return {edge:Math.abs(x-110)};
}};
const fallback=createRailwayBallastSurface('low');
assert.equal(fallback.material.vertexColors,true);
assert.equal(fallback.textures.length,0);
fallback.material.dispose();
const map=generateRailwayAlignment(terrain,clearance,650);
assert.ok(map.total>3600,'Regional line must travel the entire playable map');
assert.ok(map.points.length===651);
const bed=createBallastBedGeometry(map);
assert.equal(bed.userData.corsaRailway,'continuous-tapered-ballast');
assert.equal(bed.getAttribute('position').count,map.points.length*5);
assert.equal(bed.getAttribute('color').count,map.points.length*5);
assert.ok(bed.index.count>8000,'Ballast should be one tessellated ribbon');
for(const lateral of [-.7175,.7175]){
  const steel=createSteelRailGeometry(map,lateral);
  assert.equal(steel.userData.corsaRailway,'steel-rail-profile');
  assert.equal(steel.userData.gaugeM,1.435);
  assert.equal(steel.getAttribute('position').count,map.points.length*12);
  steel.dispose();
}
bed.dispose();
for(const x of [0,250,760,1700,map.total-.1]){
  const p=sampleAlignment(map,x);
  assert.ok(Number.isFinite(p.point.y));
  assert.ok(Math.abs(p.dir.length()-1)<.00001);
}
const scene=new THREE.Scene(),physics=new CANNON.World();
const rail=new RegionalRailway(scene,physics,terrain,clearance,'low');
assert.ok(rail.statistics.lengthM>3600);
assert.equal(rail.statistics.stations,2);
assert.equal(rail.statistics.trainCars,3);
assert.ok(rail.statistics.sleepers>3500);
assert.ok(rail.statistics.railSegments>=650);
assert.ok(rail.statistics.ballastStones>1000,
  'Ballast should include scattered individual aggregate');
assert.ok(rail.statistics.catenaryMasts>55,'Regional line requires overhead supply masts');
const beams=rail.group.children.filter(o=>
  o.name==='Viaduto · viga contínua de betão');
const caps=rail.group.children.filter(o=>
  o.name==='Viaduto · travessa de apoio');
const piers=rail.group.children.filter(o=>
  o.name==='Viaduto · pilar estrutural');
const bases=rail.group.children.filter(o=>
  o.name==='Viaduto · sapata de fundação');
assert.equal(beams.length,rail.statistics.bridgeDeckSegments);
assert.equal(caps.length,rail.statistics.bridges);
assert.equal(piers.length,2*caps.length,
  'Elevated railway support must use paired structural legs');
assert.equal(bases.length,piers.length,
  'Railway piers must have terrain-grounded foundations');
assert.ok(beams.length>0,
  'Elevated track should use connected viaduct girders, not floating rail');
const embankments=rail.group.children.filter(o=>
  o.name==='Talude ferroviário · aterro ligado ao terreno');
assert.equal(embankments.length,1,
  'Low railway sections must use continuous earth/rock formations');
const fill=embankments[0].geometry;
assert.equal(fill.userData.corsaRailway,'terrain-founded-embankment');
assert.ok(fill.index.count>100,'Railway embankments must connect to the landscape');
assert.ok(rail.statistics.embankmentSections>5,
  'The rail route must contain substantial ground-supported sections');
const positions=fill.getAttribute('position');
for(let i=0;i<positions.count;i+=6){
  for(const j of [0,5]){
    const x=positions.getX(i+j),z=positions.getZ(i+j);
    assert.ok(Math.abs(positions.getY(i+j)-terrain(x,z))<.06,
      'Rail embankment outer edges must meet actual ground, not float');
  }
}
assert.ok(rail.statistics.bridges>=1,
  'Elevated spans must retain their own structural supports');
for(const base of bases)
  assert.ok(Math.abs(base.position.y-terrain(base.position.x,base.position.z))<.6,
    'Viaduct foundation must meet the terrain');
const rails=rail.group.children.filter(m=>m.name==='Carril ferroviário perfilado · bitola 1435 mm');
assert.equal(rails.length,2,'Both proper steel rails must remain visible');
assert.ok(rail.group.children.some(m=>m.name==='Leito contínuo de balastro · taludes e drenagem'));
assert.ok(rail.group.children.some(m=>m.name==='Pedras individuais do balastro'));
assert.ok(rail.group.children.some(m=>m.name==='Fio de contacto elétrico'));
assert.ok(rail.group.children.some(m=>m.name==='Cabo mensageiro da catenária'));
assert.equal(rail.group.children.find(m=>m.name==='Travessas de betão · espaçamento 65 cm').count,
  rail.statistics.sleepers);
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
