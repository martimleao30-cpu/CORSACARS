import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {CAR_SPECS,torqueAtRpm} from '../src/vehicle-dynamics.js';
import {createBMWM4Visual} from '../src/bmw-m4-visual.js';
const spec=CAR_SPECS.m4;
assert.equal(spec.massKg,1850);
assert.equal(spec.peakTorqueNm,650);
assert.equal(spec.peakPowerKW,390);
assert.equal(spec.maxSpeedKmh,250);
assert.equal(spec.referenceZeroTo100S,3.5);
assert.equal(spec.drivetrain,'AWD');
assert.equal(spec.gearRatios.length,8);
assert.ok(torqueAtRpm(3500,spec)>torqueAtRpm(1200,spec));
const visual=createBMWM4Visual();
assert.ok(visual.root.children.length>45);
for(const detail of ['Grelha dupla M4 · miolo','Farol dianteiro LED',
  'Vidro lateral trapezoidal','Spoiler traseiro','Difusor traseiro']){
  assert.ok(visual.root.children.some(child=>child.name===detail),
    'M4 signature feature missing: '+detail);
}
globalThis.document={createElement(){return {
  width:256,height:128,getContext(){
    return {createRadialGradient(){return {addColorStop(){}};},
      fillRect(){},fillText(){},strokeRect(){},createImageData(w,h){
        return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){}};
  }};}};
const {PlayerVehicle}=await import('../src/vehicle.js');
const physics=new CANNON.World({gravity:new CANNON.Vec3(0,-9.81,0)});
const scene=new THREE.Scene();
const car=new PlayerVehicle(physics,scene,{
  center:new THREE.Vector3(0,0,0),tangent:new THREE.Vector3(0,0,1)});
assert.equal(car.specId,'coupe');
assert.ok(car.setCarModel('m4'));
assert.equal(car.chassis.mass,1850);
assert.equal(car.vehicle.wheelInfos.length,4);
assert.equal(car.vehicle.wheelInfos[0].radius,spec.wheelRadiusM);
assert.equal(car.vehicle.wheelInfos[2].chassisConnectionPointLocal.z,-spec.wheelbaseM/2);
assert.equal(car.bmwModel.visible,true);
car.setVisualDetail(new THREE.Vector3(0,1,7));
assert.equal(car.bmwModel.visible,true);
assert.equal(car.cockpit.visible,false);
car.setPaintColor('#cc4433');
assert.equal(car.bmwPaint.color.getHexString(),'cc4433');
car.chassis.velocity.set(0,0,85);
car.updatePhysics(1/60,{accelerate:1,brake:0,steer:0},'dry');
assert.ok(car.chassis.velocity.length()<=250/3.6+.001,
  'Speed limiter must clamp the actual rigid body, not HUD alone');
assert.equal(car.getTelemetry().maxSpeedKmh,250);
assert.ok(car.setCarModel('coupe'));
assert.equal(car.specId,'coupe');
assert.equal(car.chassis.mass,1370);
assert.equal(car.bmwModel.visible,false);
assert.equal(car.setCarModel('supercar'),false);
car.dispose();
console.log('PASS: official BMW M4 530 cv/650 Nm/8 speeds, selection, geometry, AWD and physical 250km/h limiter.');
