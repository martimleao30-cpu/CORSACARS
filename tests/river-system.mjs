import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {RiverSystem,RIVER_WAYPOINTS} from '../src/river-system.js';

// A purposely chosen real crossing of the river by an east-west dirt road.
const road={id:'rio-teste',name:'Travessia do Vale',width:7,
  surface:'gravel',category:'dirt',
  points:Array.from({length:81},(_,i)=>
    new THREE.Vector3(445+i*2.5,3,430))};
const scene=new THREE.Scene(),physics=new CANNON.World();
const system=new RiverSystem(scene,physics,{roads:[road]},()=>3,'low');
assert.equal(RIVER_WAYPOINTS.length>=10,true);
assert.ok(system.statistics.riverSections>400);
assert.ok(system.statistics.riverLengthM>2000);
assert.ok(system.statistics.boulders>20);
assert.ok(system.waterMesh.material.isShaderMaterial);
assert.ok(system.waterfallMesh.material.isShaderMaterial,
  'The waterfall must be real animated geometry, not a decorative image');
assert.equal(system.statistics.waterfallDropM,3.7);
assert.ok(system.waterfallMesh.geometry.index.count>1200,
  'Waterfall needs detailed flowing water geometry');
assert.ok(system.bankMesh.geometry.index.count>2800,
  'Both physical riverbanks must be joined with the watercourse');
const upper=system.points[system.waterfall.start];
const lower=system.points[system.waterfall.end];
assert.ok(upper.y-lower.y>2.9,
  'Waterfall must have an actual altitude drop in the river profile');
for(const i of [2,40,101,205,system.points.length-3]){
  const a=system.points[Math.max(0,i-1)],b=system.points[Math.min(i+1,system.points.length-1)];
  const dot=(b.x-a.x)*system.points[i].nx+(b.z-a.z)*system.points[i].nz;
  assert.ok(Math.abs(dot)<1e-5,
    'Both riverbanks must be perpendicular to arc-length river flow');
}
const foamShader=system.foam.material;
assert.ok(foamShader.isShaderMaterial,'Foam must have feathered, flowing transparency');
assert.match(foamShader.fragmentShader,/smoothstep/);
assert.ok(system.points.every((p,i)=>i===0||
  p.along>system.points[i-1].along),'Arc-length must be monotonic');
const widths=system.points.map(p=>p.width);
assert.ok(widths.every(w=>w>=6.5),'River width never collapses');
for(const p of system.points.filter((_,i)=>i%31===0)){
  const expected=8.6+2.05*Math.sin(p.along*.009)+.82*Math.sin(p.along*.021);
  assert.ok(Math.abs(p.width-Math.max(6.5,expected))<.0001,
    'Shore widths must be based on world metres, not mesh index');
}
for(let i=0;i<system.points.length;i+=23){
  const a=system.points[i];
  const side=(i%2?1:-1)*a.width*.52;
  const x=a.x+a.nx*side,z=a.z+a.nz*side;
  const nearest=system.lookup(x,z);
  assert.ok(nearest&&nearest.distance<nearest.width,
    'Visible water and the river locator must describe the same channel');
}
const flows=system.waterMesh.geometry.getAttribute('flowSpeed');
assert.ok(flows?.count>3000,'Every flowing water vertex needs current velocity');
assert.ok(Array.from(flows.array).every(speed=>speed>=.7&&speed<=2.31),
  'Current must adapt to the changing valley slope');
assert.match(system.waterMaterial.vertexShader,/uTime\*2\.8\*vSpeed/);
assert.match(system.waterMaterial.fragmentShader,/whitewater|flowFoam/);
assert.ok(system.lookup(535,430)?.distance<2,
  'The river must pass through the known valley crossing X=535, Z=430');
assert.ok(system.crossings.length>=1,
  'A bridge must be placed at a real river/road intersection');
const originalRoads=system.network.roads;
system.network.roads=[{...road,id:'rio-longo',
  points:[new THREE.Vector3(200,3,430),new THREE.Vector3(900,3,430)]}];
assert.ok(system.findCrossings().some(hit=>
  hit.roadId==='rio-longo'&&Math.abs(hit.x-535)<8),
  'Even a long road segment must get a bridge when it crosses the river');
system.network.roads=originalRoads;
assert.ok(system.crossings.every(p=>p.roadId===road.id&&
  p.x>=445&&p.x<=645),'Bridge cannot be positioned randomly');
assert.ok(system.bodies.length>=system.crossings.length*2,
  'Bridge guardrails and substantial river boulders need physical collision');
const bridgePiers=system.group.children.filter(mesh=>
  mesh.name==='Ponte · apoio no leito rochoso');
assert.equal(bridgePiers.length,system.crossings.length*4,
  'Each crossing needs two pillars on both river banks');
for(const pillar of bridgePiers){
  const x=pillar.position.x,z=pillar.position.z,local=system.lookup(x,z);
  const footing=system.channelHeight(3,local)-.18;
  assert.ok(Math.abs(pillar.position.y-pillar.scale.y*.5-footing)<.025,
    'Bridge supports must meet the post-excavation riverbed');
}
const point=RIVER_WAYPOINTS[4];
const river=system.lookup(point[0],point[1]);
assert.ok(river?.distance<2);
assert.equal(system.contains(point[0],point[1]),true);
assert.equal(system.contains(0,-1600),false);
const riverMiddle=system.lookup(535,430);
const level=riverMiddle.waterY,width=riverMiddle.width;
const deep=system.channelHeight(30,{...riverMiddle,distance:0});
const shore=system.channelHeight(30,{...riverMiddle,distance:width+4});
const outer=system.channelHeight(30,{...riverMiddle,distance:width+28});
assert.ok(deep<shore&&shore<outer,
  'The river must have a deeper centre and smoothly climbing banks');
assert.ok(Math.abs(deep-(level-1.55))<.001,
  'The riverbed must remain submerged below the visible water');
assert.equal(outer,30,
  'Erosion must not produce a flat trench beyond the riverbank');

const ground=new THREE.PlaneGeometry(1600,1600,90,90);
ground.rotateX(-Math.PI/2);
const attrib=ground.getAttribute('position');
for(let i=0;i<attrib.count;i++)attrib.setY(i,3);
const affected=system.carveTerrain(ground);
assert.ok(affected>30,'River must lower actual terrain, not just overlay water');
const lowered=[];
for(let i=0;i<attrib.count;i++){
  if(attrib.getY(i)<2)lowered.push(i);
}
assert.ok(lowered.length>15,'Channel should be visibly lower than the valley');
const before=system.waterMaterial.uniforms.uTime.value;
const waterfallBefore=system.waterfallMaterial.uniforms.uTime.value;
system.update(.05,false,true,new THREE.Vector3(.8,.4,.2));
assert.ok(system.waterMaterial.uniforms.uTime.value>before,
  'A flowing river must animate its currents');
assert.equal(system.waterMaterial.uniforms.uRain.value,1);
assert.ok(system.waterfallMaterial.uniforms.uTime.value>waterfallBefore,
  'Waterfall must animate with the flowing river');
assert.equal(system.waterfallFoamMaterial.uniforms.uRain.value,1);
assert.equal(system.foamMaterial.uniforms.uRain.value,1);
assert.equal(system.foamMaterial.uniforms.uTime.value,system.time);
const after=system.waterMaterial.uniforms.uTime.value;
system.update(.1,true,false);
assert.equal(system.waterMaterial.uniforms.uTime.value,after,
  'River currents must freeze with game pause');
const oldBodies=physics.bodies.length;
assert.ok(oldBodies>0);
system.dispose();ground.dispose();
assert.equal(physics.bodies.length,0);
assert.equal(scene.children.length,0);
console.log('PASS: deterministic river, flowing water, rocky banks, carved terrain, real bridge crossing and cleanup.');
