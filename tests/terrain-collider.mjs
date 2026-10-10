import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {createTerrainCollider} from '../src/world.js';

// Physics must match the visible (possibly sloping) off-road surface.
const size=200,steps=40;
const groundY=(x,z)=>.025*x+.01*z;
const geometry=new THREE.PlaneGeometry(size,size,steps,steps);
geometry.rotateX(-Math.PI/2);
const vertices=geometry.getAttribute('position');
for(let i=0;i<vertices.count;i++)
  vertices.setY(i,groundY(vertices.getX(i),vertices.getZ(i)));
geometry.computeVertexNormals();

const physics=new CANNON.World({gravity:new CANNON.Vec3(0,-9.81,0)});
const collider=createTerrainCollider(physics,geometry,new CANNON.Material('grass'));
assert.ok(collider.shapes[0] instanceof CANNON.Heightfield,
  'Off-road terrain needs a proper heightfield, not one huge Trimesh');
assert.equal(physics.bodies.includes(collider),true);
assert.ok(Math.abs(collider.position.x+size*.5)<.25,
  'Collision lattice must not visibly separate from rendered terrain');
// Cover exact visual grid vertices (which previously gave intermittent
// Cannon heightfield ray misses), cells interiors and both boundaries.
for(const [x,z] of [[0,0],[65,-40],[-55,60],[97,97],[-92,-70],
  [65.05,-39.95],[-55.05,60.05],[99.5,99.5],[-99.5,-99.5],
  [2.5,-7.5],[-37.4,-64.2]]){
  const result=new CANNON.RaycastResult();
  const hit=physics.raycastClosest(new CANNON.Vec3(x,40,z),
    new CANNON.Vec3(x,-40,z),{},result);
  assert.ok(hit,'The ground must be solid at off-road coordinates '+x+','+z);
  assert.ok(Math.abs(result.hitPointWorld.y-groundY(x,z))<.04,
    'Collision surface must coincide with visual ground at '+x+','+z);
}
const ball=new CANNON.Body({mass:1,position:new CANNON.Vec3(5,7,7)});
ball.addShape(new CANNON.Sphere(.7));
physics.addBody(ball);
for(let i=0;i<180;i++)physics.step(1/60);
assert.ok(ball.position.y>groundY(5,7)+.5,
  'A dynamic object must remain above the off-road ground instead of falling through');
geometry.dispose();
console.log('PASS: continuous off-road heightfield, matching collision height and rigid-body ground contact.');
