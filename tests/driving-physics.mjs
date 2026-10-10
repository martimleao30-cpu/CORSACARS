import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Non-rendering physics regression: real Cannon wheels, grounded chassis and
// physical displacement over repeated 60Hz steps. No fake speed calculations.
globalThis.document={
  createElement(){
    return {width:128,height:128,getContext(){
      return {
        fillStyle:'',font:'',
        fillRect(){},fillText(){},
        createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
        putImageData(){},
        createRadialGradient(){return {addColorStop(){}}}
      };
    }};
  }
};
const {PlayerVehicle}=await import('../src/vehicle.js');
const physics=new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0)});
physics.solver.iterations=12;
physics.defaultContactMaterial.friction=.75;
const ground=new CANNON.Body({mass:0});
ground.addShape(new CANNON.Plane());
ground.quaternion.setFromEuler(-Math.PI/2,0,0);
physics.addBody(ground);
const spawn={center:new THREE.Vector3(0,0,0),tangent:new THREE.Vector3(0,0,1)};
const car=new PlayerVehicle(physics,new THREE.Scene(),spawn);
const tick=(input,surface='dry')=>{
  car.updatePhysics(1/60,input,()=>({surface}));
  physics.step(1/60);
};
const neutral={steer:0,accelerate:0,brake:0,handbrake:false};
for(let i=0;i<95;i++)tick(neutral);
const initialZ=car.chassis.position.z;
for(let i=0;i<250;i++)tick({...neutral,accelerate:1});
const travelled=Math.abs(car.chassis.position.z-initialZ);
const v1=car.chassis.velocity.length();
assert.ok(travelled>2,'Physics must move the chassis rather than update numbers only: '+travelled);
assert.ok(v1>1,'Engine must accelerate the car with Cannon contact: '+v1);
assert.ok(car.rpm>800);
const wheel=car.vehicle.wheelInfos[0];
const dryFriction=wheel.frictionSlip;
for(let i=0;i<70;i++)tick({...neutral,brake:1},'wet');
const wetFriction=car.vehicle.wheelInfos[0].frictionSlip;
assert.ok(wetFriction<dryFriction,'Water must decrease effective wheel friction');
assert.ok(car.chassis.velocity.length()<v1,'Braking must reduce physical velocity');
assert.ok(car.lastDiagnostics.suspension.length===4);
assert.ok(car.lastDiagnostics.wheelSlip.length===4);
assert.ok(car.lastDiagnostics.wheelLoads?.length===4,
  'Every wheel should report a contact-load transfer factor');
assert.ok(car.lastDiagnostics.wheelLoads.every(n=>n>=.65&&n<=1.35),
  'Wheel loads must remain stable at high engine and brake forces');
assert.ok(Number.isFinite(car.lastDiagnostics.longitudinalAcceleration));
assert.ok(Number.isFinite(car.lastDiagnostics.lateralAcceleration));
assert.ok(car.vehicle.wheelInfos.every(w=>Number.isFinite(w.frictionSlip)&&w.frictionSlip>0),
  'Physical grip must remain positive for every tyre on wet road');
assert.ok(car.lastDiagnostics.surface==='wet');
car.manual=true;
car.gear=1;
car.shift(-1);
assert.equal(car.gear,0,'Sequential neutral gear required');
for(let i=0;i<35;i++)tick(neutral);
car.shift(-1);
assert.equal(car.gear,-1,'Manual reverse gear required');
car.setTyreCompound('sport');
car.setAssists({abs:false,tcs:false,esc:false});
assert.equal(car.tyreCompound,'sport');
assert.equal(car.assists.abs,false);
car.dispose();
console.log('PASS: actual Cannon vehicle acceleration/displacement, wet grip, real braking, wheel suspension and manual neutral/reverse.');
