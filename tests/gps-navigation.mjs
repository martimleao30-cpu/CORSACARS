import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildNavigationGraph,shortestRoute,NavigationHUD}
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
assert.ok(cmds.some(c=>c.p==='clearRect'),'GPS must remain transparent');
assert.equal(gps.setDestination('unknown'),false);
assert.equal(gps.destinationId,null);
console.log('PASS: heading-up transparent GPS, crossing-aware routes, destination changes and HUD drawing.');
