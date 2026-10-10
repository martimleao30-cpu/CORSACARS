import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {buildRuralSettlement} from '../src/rural-settlements.js';
const scene=new THREE.Scene(),physics=new CANNON.World();
const terrain=(x,z)=>.14*Math.sin(x*.03)+.17*Math.cos(z*.02);
const region={
  id:'testfarm',kind:'farmstead',roadPoint:new THREE.Vector3(120,0,-450),
  point:new THREE.Vector3(100,0,-450),
  side:new THREE.Vector3(-1,0,0),
  tangent:new THREE.Vector3(0,0,1)
};
const groups=[],bodies=[];
for(const kind of ['farmstead','hamlet']){
  const root=new THREE.Group(),p={...region,kind};
  const result=buildRuralSettlement(root,physics,bodies,p,terrain);
  scene.add(root);groups.push(root);
  assert.ok(result.stats.buildings>=3);
  assert.ok(result.stats.objects>15);
  assert.ok(result.stats.colliders>=3);
  assert.ok(result.root.children.some(obj=>obj.name==='Casa rural · paredes'));
  if(kind==='farmstead'){
    assert.ok(result.stats.fields>=8);
    assert.ok(result.stats.hayBales>=10);
    assert.ok(result.stats.fenceSections>=3);
    assert.ok(result.root.children.some(obj=>obj.name==='Trator agrícola · carroçaria'));
    assert.equal(result.stats.cows,3);
    assert.equal(result.stats.sheep,5);
    assert.ok(result.stats.swallows>=5);
    assert.equal(result.root.children.filter(obj=>
      obj.name==='Vaca de quinta · gado').length,3);
    assert.equal(result.root.children.filter(obj=>
      obj.name==='Ovelha · rebanho').length,5);
    const birds=result.root.children.filter(obj=>
      obj.name==='Andorinha · corpo aerodinâmico');
    const initialPosition=birds[0].position.clone();
    const initialWing=birds[0].userData.wings.left.rotation.z;
    result.wildlife.update(2.3);
    assert.ok(birds[0].position.distanceTo(initialPosition)>1.0,
      'Andorinhas devem mover-se em voo livre entre fotogramas');
    assert.notEqual(birds[0].userData.wings.left.rotation.z,initialWing,
      'As asas devem bater em vez de ficar fixas');
    const animalPositions=[...result.root.children].filter(obj=>
      obj.name==='Vaca de quinta · gado'||obj.name==='Ovelha · rebanho');
    assert.ok(animalPositions.every(obj=>Math.abs(obj.position.x)>70),
      'O gado não pode invadir a faixa de rodagem');
  }else{
    assert.ok(result.root.children.some(obj=>obj.name==='Largo da aldeia · calçada'));
    assert.equal(result.stats.cows,0);
    assert.ok(result.stats.swallows>=5);
  }
}
assert.ok(bodies.every(body=>Number.isFinite(body.position.x)&&
  Number.isFinite(body.position.y)&&Number.isFinite(body.position.z)));
for(const body of bodies)physics.removeBody(body);
for(const group of groups)scene.remove(group);
assert.equal(physics.bodies.length,0);
console.log('PASS: farmsteads, barns, grain silos, hay bales, fields and rural hamlet with collision.');
