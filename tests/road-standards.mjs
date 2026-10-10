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
for(const shoulder of profile.paved){
  const n=shoulder.geometry.getAttribute('normal');
  assert.ok(n.getY(0)>.3,
    'Both paved shoulder meshes must face upward for visual and tyre contact');
}
const national=mockRoad('nacional',7);
const profileEN=buildRoadProfileGeometry(scene,national,()=>0,[]);
assert.equal(profileEN.paved.length,2);
assert.equal(profileEN.median,null);
assert.equal(national.body.shapes.length,2);
assert.ok(profileEN.paved.every(m=>m.geometry.userData.roadShoulderWidth===2.5));
// A junction must cut BOTH the visible asphalt shoulder and its Cannon
// collider, not leave an invisible slab under the joining road.
const crossingRoad=mockRoad('autoestrada',19);
const joining=mockRoad('rampa-entrada',3.75);
const junction={x:0,z:90,ux:0,uz:1,
  halfU:16,halfV:23,primary:crossingRoad,secondary:joining};
const cutProfile=buildRoadProfileGeometry(scene,crossingRoad,()=>0,[junction]);
for(let side=0;side<2;side++){
  const geometry=cutProfile.paved[side].geometry;
  const positions=geometry.getAttribute('position'),indices=geometry.index;
  for(let k=0;k<indices.count;k+=3){
    const cx=(positions.getX(indices.getX(k))+
      positions.getX(indices.getX(k+1))+
      positions.getX(indices.getX(k+2)))/3;
    const cz=(positions.getZ(indices.getX(k))+
      positions.getZ(indices.getX(k+1))+
      positions.getZ(indices.getX(k+2)))/3;
    assert.ok(Math.abs(cx)>=junction.halfV-.0001||
      Math.abs(cz-90)>=junction.halfU-.0001,
      'No paved-shoulder triangle may lie inside a junction');
  }
  const collider=crossingRoad.body.shapes[side];
  assert.equal(collider.indices.length,geometry.index.count,
    'Paved shoulder collision must use the exact clipped visual triangles');
}
const farm=mockRoad('terra',4);
const profileFarm=buildRoadProfileGeometry(scene,farm,()=>0,[]);
assert.equal(profileFarm.paved.length,0);
assert.equal(profileFarm.median,null);
console.log('PASS: national road reference profiles and collision-backed shoulders/median.');
