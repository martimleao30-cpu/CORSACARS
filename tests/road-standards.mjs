import assert from 'node:assert/strict';
import {ROAD_PROFILES,PROFILE_FOR_ROAD,officialRoadWidth,roadProfile,
  ROAD_LAMP_SPACING_METRES} from '../src/road-standards.js';
import {REGIONAL_LINKS} from '../src/road-network.js';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {buildRoadProfileGeometry} from '../src/road-profile-geometry.js';

assert.equal(ROAD_LAMP_SPACING_METRES,34);
assert.equal(ROAD_PROFILES.highway.laneWidth,3.75);
assert.equal(ROAD_PROFILES.highway.lanes,4);
assert.equal(ROAD_PROFILES.highway.median,4);
assert.equal(ROAD_PROFILES.highway.pavedWidth,19);
assert.equal(ROAD_PROFILES.highway.outerShoulder,3.5);
assert.equal(ROAD_PROFILES.highway.innerShoulder,1);
assert.equal(ROAD_PROFILES.national.laneWidth,3.5);
assert.equal(ROAD_PROFILES.national.pavedWidth,7);
assert.equal(ROAD_PROFILES.ramp.laneWidth,3.75);
for(const route of REGIONAL_LINKS){
  assert.equal(route.width,officialRoadWidth(route),
    'Road '+route.id+' must use the design width for its profile');
}
assert.equal(officialRoadWidth({id:'circular'}),14);
assert.equal(officialRoadWidth({id:'rua-lateral'}),6.5);
assert.equal(officialRoadWidth({id:'rampa-entrada'}),3.75);
const scene=new THREE.Scene(),physics=new CANNON.World();
const mockRoad=(id,width)=>{
  const points=Array.from({length:50},(_,i)=>
    new THREE.Vector3(0,0,i*4));
  const body=new CANNON.Body({mass:0});
  physics.addBody(body);
  return {id,width,points,body,mesh:{material:new THREE.MeshStandardMaterial({
    color:0xffffff,vertexColors:true
  })}};
};
const motorway=mockRoad('autoestrada',19);
const profile=buildRoadProfileGeometry(scene,motorway,()=>0,[]);
assert.equal(profile.paved.length,2);
assert.ok(profile.median?.mesh&&profile.median?.barrier);
assert.equal(profile.median.mesh.geometry.userData.medianWidth,4);
assert.equal(motorway.body.shapes.length,3,
  'Physical motorway needs both paved shoulders and centre barrier');
assert.ok(profile.paved.every(m=>m.geometry.userData.roadShoulderWidth===3.5));
const national=mockRoad('nacional',7);
const profileEN=buildRoadProfileGeometry(scene,national,()=>0,[]);
assert.equal(profileEN.paved.length,2);
assert.equal(profileEN.median,null);
assert.equal(national.body.shapes.length,2);
assert.ok(profileEN.paved.every(m=>m.geometry.userData.roadShoulderWidth===2.5));
const farm=mockRoad('terra',4);
const profileFarm=buildRoadProfileGeometry(scene,farm,()=>0,[]);
assert.equal(profileFarm.paved.length,0);
assert.equal(profileFarm.median,null);
console.log('PASS: national road reference profiles and collision-backed shoulders/median.');
