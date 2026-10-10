import assert from 'node:assert/strict';
import {CAR_SPECS,SURFACES,TYRES,torqueAtRpm,powerKW,tyreGrip,
  normalizedTyreForce,contactSlip,ackermannAngles,aerodynamicDrag,
  brakingAssist,tractionAssist,axleLoadTransfers,combinedSlipFactor} from '../src/vehicle-dynamics.js';

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
for(const vehicle of Object.values(CAR_SPECS)){
  assert.deepEqual(axleLoadTransfers(vehicle,0,0),[1,1,1,1],
    'At rest each axle must retain its design static normal load');
  const braking=axleLoadTransfers(vehicle,-7,0);
  const accelerating=axleLoadTransfers(vehicle,7,0);
  assert.ok(braking[0]>1&&braking[1]>1&&braking[2]<1&&braking[3]<1,
    'During braking the front tyres must receive extra normal load');
  assert.ok(accelerating[0]<1&&accelerating[2]>1,
    'Acceleration must transfer weight to the rear axle');
  const cornering=axleLoadTransfers(vehicle,0,5);
  assert.ok(cornering[0]>cornering[1]&&cornering[2]>cornering[3],
    'Cornering must alter left/right contact loads consistently');
  assert.ok(axleLoadTransfers(vehicle,-30,30).every(n=>n>=.65&&n<=1.35),
    'Transient load is bounded for physics stability');
}
assert.equal(combinedSlipFactor(0,0),1);
assert.ok(combinedSlipFactor(.5,.2)<combinedSlipFactor(0,.2));
assert.ok(combinedSlipFactor(.9,.7)>=.75);
console.log('PASS: vehicle physics SI profiles, torque/power, independent tyre compounds, slip, ABS/TCS, drag, Ackermann.');
