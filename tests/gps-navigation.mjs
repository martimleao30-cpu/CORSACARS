import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildNavigationGraph,shortestRoute,NavigationHUD,gpsBearing,gpsProjection}
  from '../src/gps-navigation.js';

const a={id:'street',category:'urban',width:8,points:[
  new THREE.Vector3(-20,0,0),new THREE.Vector3(0,0,0),
  new THREE.Vector3(20,0,0)]};
const b={id:'cross',category:'rural',width:6,points:[
  new THREE.Vector3(0,0,-30),new THREE.Vector3(0,0,0),
  new THREE.Vector3(0,0,30)]};
const network={roads:[a,b],junctions:[{
  primary:a,secondary:b,x:0,z:0,halfU:5,halfV:4
}]};
const graph=buildNavigationGraph(network);
assert.equal(graph.nodes.length,6);
assert.equal(graph.edges.length,6);
const trip=shortestRoute(graph,0,5);
assert.ok(trip && trip.length>=40 && trip.length<=70,
  'Route should transfer at the crossing');
assert.ok(trip.points.length>=4);
assert.equal(shortestRoute(graph,-1,5),null);
const status={textContent:''};
const cmds=[];
const ctx=new Proxy({}, {get:(_,p)=>{
  if(p==='canvas')return null;
  if(p==='createLinearGradient')return ()=>({addColorStop(){}});
  return (...args)=>{cmds.push({p,args});};
},set:()=>true});
const canvas={width:240,height:240,getContext(){return ctx;}};
const gps=new NavigationHUD(canvas,network,[{
  id:'cafe',name:'Café',point:new THREE.Vector3(0,0,30),
  roadPoint:new THREE.Vector3(0,0,30)
}],status);
assert.equal(gps.setDestination('cafe'),true);
gps.update(new THREE.Vector3(-20,0,0),new THREE.Quaternion(),1000);
assert.ok(gps.route?.points.length>=4);
assert.ok(status.textContent.includes('CAFÉ'));
assert.equal(status.hidden,false,'Route label visible only during navigation');
const project=gpsProjection(new THREE.Vector3(0,0,0),240,240,1);
assert.ok(project({x:30,z:0}).x>120,
  'East/right on a north-up GPS must remain on screen right');
assert.ok(project({x:-30,z:0}).x<120,
  'West/left on a north-up GPS must remain on screen left');
assert.ok(project({x:0,z:-30}).y<120,
  'North must stay upwards even while the vehicle turns');
const faceRight=new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0,1,0),Math.PI*.5);
const faceLeft=new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0,1,0),-Math.PI*.5);
assert.ok(Math.abs(gpsBearing(faceRight)-Math.PI*.5)<1e-6,
  'Turning right must rotate the vehicle marker to screen right');
assert.ok(Math.abs(gpsBearing(faceLeft)+Math.PI*.5)<1e-6,
  'Turning left must rotate the vehicle marker to screen left');
gps.draw(new THREE.Vector3(0,0,0),faceRight);
assert.ok(cmds.some(c=>c.p==='clip'),'Minimap must clip to a circle');
assert.ok(cmds.some(c=>c.p==='rotate'&&Math.abs(c.args[0]-Math.PI*.5)<1e-5),
  'Actual arrow must rotate to the right on right-hand turns');
assert.ok(cmds.some(c=>c.p==='clearRect'),'GPS must remain transparent');
assert.equal(gps.setDestination('unknown'),false);
assert.equal(gps.destinationId,null);
assert.equal(status.hidden,true,'No GPS status label in free-drive mode');
// The complete game's ring and all POI roads must form one navigable graph.
globalThis.document={createElement(){return {width:64,height:64,getContext(){
  return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
    putImageData(){},fillText(){},fillRect(){},strokeRect(){}};
}};}};
const CANNON=await import('cannon-es');
const {RoadNetwork}=await import('../src/road-network.js');
const {WorldSectors}=await import('../src/world-sectors.js');
const ring=[];
for(let i=0;i<=420;i++){
  const a=i/420*2*Math.PI;
  ring.push({center:new THREE.Vector3(Math.cos(a)*400,0,Math.sin(a)*400),
    tangent:new THREE.Vector3(-Math.sin(a),0,Math.cos(a))});
}
const city=new RoadNetwork(new THREE.Scene(),new CANNON.World(),()=>0,ring,13.5,'low');
const sectors=new WorldSectors(new THREE.Scene(),new CANNON.World(),city,()=>0);
const liveGraph=buildNavigationGraph(city);
const spawn=liveGraph.closest(city.roads[0],
  city.roads[0].points[5].x,city.roads[0].points[5].z);
for(const site of sectors.regions){
  const goal=liveGraph.closest(city.roads.find(r=>r.id===site.road),
    site.roadPoint.x,site.roadPoint.z);
  const computed=shortestRoute(liveGraph,spawn,goal);
  assert.ok(computed?.points.length>2,'All POIs must be reachable from spawn: '+site.name);
  assert.ok(computed.length>15,'A real route must cover a measurable distance');
}
console.log('PASS: heading-up transparent GPS, crossing-aware routes, all POI destinations and HUD drawing.');
