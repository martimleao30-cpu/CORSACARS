import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Geometry data can be verified without WebGL or downloading photographic assets.
globalThis.document={
  createElement(name) {
    if(name!=='canvas')throw new Error('Canvas expected');
    return {width:256,height:256,
      getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
        putImageData(){},fillRect(){},fillText(){}})};
  }
};
const {RoadNetwork,REGIONAL_LINKS}=await import('../src/road-network.js');
const {roadGradeStatistics,gradeLimit,ROAD_MAX_CROSS_SLOPE}=
  await import('../src/road-grading.js');
const {WorldSectors}=await import('../src/world-sectors.js');
const {RoadsideClearance}=await import('../src/roadside-clearance.js');
const {DrivingTestArea}=await import('../src/driving-test-area.js');
const scene=new THREE.Scene(),physics=new CANNON.World();
const ring=[];
for(let i=0;i<=420;i++){
  const angle=i/420*Math.PI*2;
  ring.push({center:new THREE.Vector3(Math.cos(angle)*400,.2,Math.sin(angle)*400)});
}
const network=new RoadNetwork(scene,physics,()=>0,ring,13.5,'low');
assert.equal(REGIONAL_LINKS.length,11);
assert.equal(network.roads.length,REGIONAL_LINKS.length+4);
assert.equal(physics.bodies.length,network.roads.length-1,'All new roads need real collision bodies');
assert.ok(network.cells.size>30,'Surface lookups should use spatial hashing');
for(const road of network.roads){
  if(road.id!=='circular'){
    const stats=roadGradeStatistics(road.points);
    assert.ok(stats.maxGrade<=gradeLimit(road)+.009,
      'No absurd longitudinal gradients: '+road.id+' '+stats.maxGrade);
    const rows=(road.sourceGeometry||road.mesh.geometry).getAttribute('position');
    let highestCrossfall=0;
    for(let i=0;i<road.points.length;i+=4)
      highestCrossfall=Math.max(highestCrossfall,
        Math.abs(rows.getY(i*7)-rows.getY(i*7+6))/road.width);
    assert.ok(highestCrossfall<ROAD_MAX_CROSS_SLOPE+.012,
      'No dangerously tilted horizontal lanes: '+road.id+' '+highestCrossfall);
  }
  if(road.id==='circular')continue;
  if(road.from!==undefined)assert.equal(road.points[0].x,ring[road.from].center.x);
  assert.ok(road.mesh.geometry.index.count>30);
  if(road.from!==undefined){
    let biggest=0;
    for(let i=1;i<road.points.length;i++)
      biggest=Math.max(biggest,road.points[i].distanceTo(road.points[i-1]));
    assert.ok(biggest<13,'Long or folded curved deck segment on '+road.name+': '+biggest);
  }
  assert.equal((road.sourceGeometry||road.mesh.geometry).getAttribute('position').count,
    road.points.length*7,'Road cross-section source must be actual 3D geometry');
  if(road.junctionCuts?.length){
    assert.equal(road.mesh.geometry.userData.junctionClipped,true,
      'Intersecting road must use cut geometry, not stacked roadway slabs');
    assert.ok(road.mesh.geometry.index.count>100);
  }
  assert.ok(road.sides.geometry.index.count>0,'Visible roadbed side walls required');
  assert.equal(road.shoulders.length,2,'Both road shoulders must exist');
  if(road.id==='autoestrada'||road.id==='nacional'){
    assert.equal(road.profileGeometry.paved.length,2,
      'Major roads must have two physical paved shoulder lanes');
    assert.ok(road.body.shapes.length>=3,
      'Paved shoulder triangles must be added to the existing road collider');
    if(road.id==='autoestrada'){
      assert.equal(road.width,19);
      assert.equal(road.profileGeometry.median.mesh.geometry.userData.medianWidth,4);
      assert.ok(road.body.shapes.length>=4,
        'Motorway central barrier must prevent crossing onto the opposite carriageway');
    }else assert.equal(road.width,7);
  }
  if(['rural','mountain'].includes(road.category)&&road.from!==undefined){
    assert.equal(road.drainage.length,2,
      'Rural and mountain routes need a ditch and embankment on both sides');
    for(const ribbon of road.drainage){
      assert.ok(ribbon.geometry.index.count>100);
      assert.equal(ribbon.geometry.userData.corsaDrainage,true);
    }
  }
  if(road.category==='dirt'){
    assert.equal(road.mesh.material.userData.corsaDirtRoad,true,
      'Unpaved route must use detailed ground-specific maps');
    assert.ok(road.mesh.material.map.image.width>=512,
      'Unpaved road must use at least 512px albedo');
    assert.ok(road.mesh.material.normalMap&&road.mesh.material.roughnessMap,
      'Detailed earth requires normal and roughness textures');
    const uv=(road.sourceGeometry||road.mesh.geometry).getAttribute('uv');
    assert.ok(uv.getY(7)>.01,'Unpaved road texture must tile along distance');
  }
  if(road.category==='mountain'){
    assert.equal(road.mesh.material.userData.mountainDetail,true,
      'Mountain roads must have their own improved texture detail');
    const uv=(road.sourceGeometry||road.mesh.geometry).getAttribute('uv');
    const stride=7;
    const metres=Math.hypot(road.points[1].x-road.points[0].x,
      road.points[1].z-road.points[0].z);
    assert.ok(Math.abs(uv.getY(stride)/metres-.30)<.002,
      'Mountain asphalt should have 50% more texels per metre');
  }
  if(road.surface==='dry'&&road.wear)assert.ok(road.wear.skids.count>0);
  const middle=road.points[Math.floor(road.points.length*.57)];
  const queried=network.query(middle.x,middle.z,'clear');
  assert.notEqual(queried.surface,'grass','Road should be drivable: '+road.id);
  if(road.id==='montanha'||road.id==='autoestrada'){
    assert.ok(['wet','dry'].includes(network.query(middle.x,middle.z,'rain').surface));
  }
}
assert.equal(network.query(4000,4000).surface,'grass');
for(const id of ['serra-norte','planicie-sul','vale-leste','campos-oeste']){
  const road=network.roads.find(r=>r.id===id);
  assert.ok(road&&road.points.length>=220,'New outer map road missing: '+id);
  assert.ok(road.points.some(p=>Math.max(Math.abs(p.x),Math.abs(p.z))>1050),
    'New route should explore territory outside the old terrain: '+id);
}
assert.deepEqual(new Set(REGIONAL_LINKS.map(r=>r.category)),
  new Set(['urban','highway','mountain','rural','dirt','test']));
assert.equal(network.connectors.length,3,'Town side road plus motorway on/off ramps');
assert.ok(network.junctions.length>=3,'At-grade X/T crossings must be detected');
assert.ok(network.junctions.some(j=>j.secondary.id==='rua-lateral'),
  'Side street must join its parent without duplicated triangles');
// Junction surface classification must agree with the one intact asphalt
// deck, not a geometrically clipped secondary crossing.
for(const join of network.junctions.filter(j=>j.kind==='cross'||j.kind==='oblique').slice(0,5)){
  const sampled=network.query(join.x,join.z);
  assert.equal(sampled.road,join.primary.name,
    'Road grip must come from the visible primary carriageway at '+join.kind);
  const wet=network.query(join.x,join.z,'rain');
  if(join.primary.surface==='dry')assert.equal(wet.surface,'wet');
}
for(const junction of network.junctions){
  assert.ok(junction.halfU>1&&junction.halfV>1);
  assert.ok(junction.angle>.25||junction.kind==='endpoint',
    'Shallow-angle terminal joins are valid even when not a crossing');
  assert.notEqual(junction.primary.id,junction.secondary.id);
}
assert.equal(physics.bodies.length,network.roads.length-1,
  'Trimming intersections must preserve one collision body per road');
assert.ok(network.roads.filter(r=>r.surface==='dry'&&r.mesh).every(r=>
  r.mesh.material.userData.variant==='aged'),
  'All connected asphalt roads must share the same visual ageing');
assert.ok(network.roads.some(r=>r.surface==='dirt'),
  'Driveable physical dirt route must be present');
network.setWetness(1);
assert.ok(network.materials.get('nacional').clearcoat>.7,
  'Rain should wet regional road materials, not just circular road');
const wetRoad=network.roads.find(r=>r.id==='nacional');
const wetPoint=wetRoad.points[Math.floor(wetRoad.points.length*.30)];
assert.equal(network.query(wetPoint.x,wetPoint.z,'clear').surface,'wet',
  'The tyres must use retained ground wetness when the rain has stopped');
network.setWetness(0);
assert.equal(network.query(wetPoint.x,wetPoint.z,'clear').surface,'dry',
  'Wet grip must return to dry after the asphalt has dried');
const testRoad=network.roads.find(r=>r.id==='provas');
assert.ok(testRoad,'Physics test area must join the road network');
// A single vertex at 64% can land exactly on another road's junction;
// there the primary road correctly owns the surface. Verify the actual wet
// sector along the test lane, away from those priority intersections.
const wetSamples=[];
for(let i=Math.floor(testRoad.points.length*.60);
  i<Math.floor(testRoad.points.length*.70);
  i+=Math.max(1,Math.floor(testRoad.points.length*.005))){
  const p=testRoad.points[i];
  wetSamples.push(network.query(p.x,p.z,'clear'));
}
assert.ok(wetSamples.some(sample=>
  sample.road===testRoad.name&&sample.surface==='wet'),
  'The physical test track must expose a wet-grip section even in clear weather. '+
  'Observed: '+JSON.stringify(wetSamples.map(s=>[s.road,s.surface])));
const testTrack=new DrivingTestArea(scene,physics,network,()=>0);
assert.equal(testTrack.samples.length,7,'Physical driving test markers should exist');
assert.equal(testTrack.obstacleBodies.length,0,
  'Yellow test-track boxes and raised speed bump must not block the lanes');
const sectors=new WorldSectors(scene,physics,network,()=>0);
const clearance=new RoadsideClearance(network,sectors.regions);
assert.ok(clearance.busBays.length>0,'Existing BUS stops must stay available');
assert.ok(network.busBayCells.size>0,'BUS bays must be indexed in road-space cells');
const bay=clearance.busBays[0];
const insideBay=bay.offset-bay.road.width*.5-1.5;
const bx=bay.x-bay.outward.x*insideBay;
const bz=bay.z-bay.outward.z*insideBay;
const grip=network.query(bx,bz,'clear');
assert.equal(grip.busBay,true,
  'Indexed BUS lookup must retain paved-shoulder tyre grip');
assert.equal(grip.surface,'dry');
assert.equal(sectors.regions.length,11);
const spot=sectors.regions[0];
const initial=physics.bodies.length;
sectors.update(spot.point,3);
assert.ok(sectors.active.has(spot.id),'Accessible service station must stream in');
assert.ok(physics.bodies.length>initial,'Shop walls need real collision');
const near=sectors.nearby(spot.point);
assert.equal(near.id,spot.id);
sectors.update(new THREE.Vector3(3500,0,3500),6);
assert.equal(sectors.active.size,0,'Out-of-range sectors must unload');
assert.equal(physics.bodies.length,initial,'Sector collider objects must be removed');
console.log('PASS: 6 interconnected routes, collision-backed surfaces, road lookup, and dynamic loading/unloading of POI sectors.');
