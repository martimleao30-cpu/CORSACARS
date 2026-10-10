import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoadBed,ROAD_SECTION} from '../src/road-upgrades.js';
import {RoadSignage,createRoadSampler,createLineGeometry,createCrosswalkGeometry,
  createArrowGeometry,PAINT_LIFT,LINE_STYLES,junctionPaintGaps,
  paintIntervals,roadCenterMarking} from '../src/road-signage.js';

const terrain=(x,z)=>1.6*Math.sin(x*.025)+.8*Math.cos(z*.037);
function fakeRoad(id,category,width=12,count=120){
  const points=[];
  for(let i=0;i<=count;i++){
    const z=i*2.6;
    const x=18*Math.sin(i*.068);
    points.push(new THREE.Vector3(x,terrain(x,z),z));
  }
  const bed=createRoadBed(points,width,terrain,29,'dry');
  return {id,name:'Teste '+id,category,surface:'dry',width,points,
    mesh:new THREE.Mesh(bed.top,new THREE.MeshStandardMaterial())};
}
const curve=fakeRoad('nacional','urban',12);
const sampler=createRoadSampler(curve);
assert.equal(ROAD_SECTION.length,7);
assert.ok(sampler.total>250,'Curved distance should span the test road');
assert.deepEqual(LINE_STYLES,['continuous','dashed','double']);
const centerIndex=40;
const center=sampler.point(sampler.chain[centerIndex],0);
const deck=curve.mesh.geometry.getAttribute('position');
assert.ok(Math.abs(center.y-(deck.getY(centerIndex*7+3)+PAINT_LIFT))<1e-5,
  'Paint centre height MUST be derived from physical deck vertices');
const edge=sampler.point(sampler.chain[centerIndex],curve.width*.47);
assert.ok(edge.y>terrain(edge.x,edge.z),'Paint must sit just above outer shoulder');
// Ribbon UV distances and vertices must follow curved 3D road, not floating boxes.
const solid=createLineGeometry(sampler,{style:'continuous',lateral:1.15,width:.14});
const dashed=createLineGeometry(sampler,{style:'dashed',lateral:0,width:.14,dash:3,gap:7});
const double=createLineGeometry(sampler,{style:'double',lateral:0,width:.12});
assert.ok(solid.index.count>dashed.index.count,'Solid length must exceed dashed');
assert.ok(double.index.count>solid.index.count*1.8,'Double line has two full stripes');
assert.equal(solid.userData.kind,'continuous');
const attr=solid.getAttribute('position');
const expected=sampler.point(0,1.15-.07);
assert.ok(Math.abs(attr.getX(0)-expected.x)<1e-5);
assert.ok(Math.abs(attr.getY(0)-expected.y)<1e-5,
  'Start of paint must match actual road surface offset');
assert.ok(Math.abs(attr.getZ(0)-expected.z)<1e-5);
const lineUV=solid.getAttribute('uv');
assert.ok(lineUV.getY(attr.count-1)>200,'Paint UV follows real metres');
assert.ok(Math.abs(attr.getX(attr.count-1)-attr.getX(0))>.05,
  'Paint must bend with curved road geometry');
const crossing=createCrosswalkGeometry(sampler,sampler.chain[68]);
assert.ok(crossing.index.count>25,'Crosswalk uses several painted stripes');
assert.equal(crossing.userData.kind,'crosswalk');
const straight=createArrowGeometry(sampler,sampler.chain[46],-2,'straight');
const turning=createArrowGeometry(sampler,sampler.chain[46],2,'right');
assert.ok(straight.index.count>=9 && turning.index.count>=9);
assert.equal(turning.userData.direction,'right');
const scene=new THREE.Scene();
const network={roads:[
  fakeRoad('circular','ring',13.5),
  curve,
  fakeRoad('autoestrada','highway',16),
  fakeRoad('montanha','mountain',8),
  fakeRoad('rural','rural',7),
  fakeRoad('rua-lateral','urban',6.2),
  fakeRoad('rampa-entrada','highway-ramp',5.2)
]};
const signage=new RoadSignage(scene,network,'low');
assert.ok(signage.statistics.continuous>=10,'Continuous edge lines on each road');
assert.ok(signage.statistics.dashed>0,'Dashed centre and lane separation lines');
const ringLaneMarks=signage.meshes.filter(mesh=>
  mesh.name.includes('circular')&&mesh.name.includes('Divisão das vias urbanas'));
assert.equal(ringLaneMarks.length,2,'Circular road must mark its four lanes');
assert.ok(ringLaneMarks.every(mesh=>
  Math.abs(Math.abs(mesh.geometry.userData.lateral)-network.roads[0].width*.25)<.00001),
  'Ring-road markings must align with each 3.5m carriageway lane');
const motorwayMarkings=signage.meshes.filter(mesh=>
  mesh.name.includes('autoestrada')&&mesh.name.includes('Linha entre vias'));
assert.equal(motorwayMarkings.length,2,
  'Motorway needs one proper lane separator on each carriageway');
const motorwayWidth=network.roads[2].width;
const expectedDivision=(motorwayWidth+4)/4;
assert.ok(motorwayMarkings.every(mesh=>
  Math.abs(Math.abs(mesh.geometry.userData.lateral)-expectedDivision)<.00001),
  'Paint must align with the actual lane profile and central separator');
assert.equal(signage.statistics.double,0,
  'No arbitrary continuous double centre lines across rural or motorway routes');
assert.ok(signage.statistics.arrows>0,'Painted straight/turning arrows must exist');
assert.ok(signage.statistics.crosswalks>=4,'Painted crosswalks across urban roads');
const dirtRoute=fakeRoad('caminho','dirt',6);
network.roads.push(dirtRoute);
const trackSignage=new RoadSignage(new THREE.Scene(),
  {roads:[dirtRoute]},'low');
assert.equal(trackSignage.meshes.length,0,
  'Dirt roads must not have floating white painted lane markings');
trackSignage.dispose();
network.roads.pop();
const join={x:curve.points[59].x,z:curve.points[59].z,halfU:13,
  halfV:curve.width*.5,angle:.94,primary:curve,secondary:network.roads[5]};
network.junctions=[join];
const gaps=junctionPaintGaps(sampler,network.junctions);
assert.equal(gaps.length,1,'A real junction needs exactly one paint-free zone');
assert.ok(gaps[0][1]-gaps[0][0]>20);
assert.equal(paintIntervals(sampler.total,0,sampler.total,gaps).length,2);
const clippedLine=createLineGeometry(sampler,{style:'dashed',lateral:0,
  excluded:gaps,dash:3.8,gap:5.2});
const paintUv=clippedLine.getAttribute('uv');
for(let i=0;i<paintUv.count;i++)
  assert.ok(paintUv.getY(i)<=gaps[0][0]+.0001||
    paintUv.getY(i)>=gaps[0][1]-.0001,
    'Road paint must NOT pass through a conflicting junction');
const mountainPlan=roadCenterMarking(network.roads[3],
  createRoadSampler(network.roads[3]));
assert.equal(mountainPlan.style,'dashed',
  'Mountain centre lines default to interrupted overtaking marks');
assert.equal(roadCenterMarking(network.roads[4],
  createRoadSampler(network.roads[4])).solid.length,0,
  'Rural roads must not paint continuous centre lines everywhere');
clippedLine.dispose();
const crossingScene=new THREE.Scene();
const atCrossing=new RoadSignage(crossingScene,network,'low');
const protectedLines=atCrossing.meshes.filter(mesh=>
  mesh.name.startsWith(curve.name)&&
  ['continuous','dashed','double'].includes(mesh.geometry.userData.kind));
assert.ok(protectedLines.length>=2);
for(const mesh of protectedLines){
  const uv=mesh.geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++)
    assert.ok(uv.getY(i)<=gaps[0][0]+.001||
      uv.getY(i)>=gaps[0][1]-.001,
      'Main-road markings cannot run across the intersection');
}
atCrossing.dispose();
assert.equal(signage.statistics.roadCount,network.roads.length);
assert.equal(signage.meshes.length,signage.statistics.geometries);
assert.ok(signage.meshes.every(mesh=>mesh.material.polygonOffset &&
  mesh.material.depthTest && !mesh.material.depthWrite),
  'Paint must use depth-tested polygon offset and no depth writes');
assert.ok(signage.meshes.every(mesh=>mesh.geometry.getAttribute('position').count>3),
  'No pre-existing floating painted boxes');
const paintMesh=signage.meshes[0],paintGeom=paintMesh.geometry;
let disposed=false;
paintGeom.addEventListener('dispose',()=>{disposed=true;});
signage.dispose();
assert.ok(!scene.children.includes(paintMesh),'Dispose must unlink road paint');
assert.equal(disposed,true,'Dispose must trigger GPU buffer release');
console.log('PASS: conforming 3D linework, dashed/double, arrows, painted crosswalks, depth bias and cleanup.');
