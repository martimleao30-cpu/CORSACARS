import assert from 'node:assert/strict';
import {CAR_SPECS,SURFACES,TYRES,torqueAtRpm,powerKW,tyreGrip,
  normalizedTyreForce,contactSlip,ackermannAngles,aerodynamicDrag,
  brakingAssist,tractionAssist} from '../src/vehicle-dynamics.js';

const spec=CAR_SPECS.coupe;
assert.equal(spec.massKg,1370);
assert.ok(spec.wheelbaseM>spec.trackM);
assert.ok(torqueAtRpm(3500)>torqueAtRpm(spec.idleRpm));
assert.ok(powerKW(4500,300)>100 && powerKW(4500,300)<180);
for(const s of Object.keys(SURFACES))assert.ok(tyreGrip(s).longitudinal>0);
assert.ok(tyreGrip('dry').longitudinal>tyreGrip('wet').longitudinal);
assert.ok(tyreGrip('wet').longitudinal>tyreGrip('gravel').longitudinal);
assert.ok(tyreGrip('gravel').longitudinal>tyreGrip('grass').longitudinal);
assert.ok(tyreGrip('dry','track').longitudinal>tyreGrip('dry','road').longitudinal);
assert.ok(tyreGrip('wet','track').longitudinal<tyreGrip('dry','track').longitudinal);
assert.equal(Object.keys(TYRES).length,3);
const angles=ackermannAngles(.3,spec.wheelbaseM,spec.trackM);
assert.ok(angles[0]>angles[1]&&angles[1]>0,'Inside wheel must turn more');
const right=ackermannAngles(-.3,spec.wheelbaseM,spec.trackM);
assert.ok(right[1]<right[0] && right[0]<0,'Ackermann must reverse for right turns');
assert.deepEqual(ackermannAngles(0,spec.wheelbaseM,spec.trackM),[0,0]);
assert.ok(aerodynamicDrag(40)>aerodynamicDrag(20)*3.9);
assert.ok(brakingAssist(1,-.8,true)<brakingAssist(1,-.8,false));
assert.ok(tractionAssist(1,.9,true)<tractionAssist(1,.9,false));
assert.equal(tractionAssist(.8,.9,false),.8);
assert.ok(Math.abs(normalizedTyreForce(.4))<1.1);
assert.ok(Math.abs(contactSlip(20,21,2).lateral)>0);
console.log('PASS: vehicle physics SI profiles, torque/power, independent tyre compounds, slip, ABS/TCS, drag, Ackermann.');
