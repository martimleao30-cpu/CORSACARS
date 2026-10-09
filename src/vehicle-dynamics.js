// CORSACARS vehicle dynamics fundamentals. All dimensional quantities are SI.
export const CAR_SPECS = Object.freeze({
  coupe: Object.freeze({
    massKg: 1370, frontWeightFraction: 0.52, centerOfMassHeightM: 0.53,
    wheelbaseM: 2.76, trackM: 1.74, wheelRadiusM: 0.38,
    inertiaScale: 1.0, drivetrain: 'RWD', finalDrive: 3.62,
    gearRatios: [3.48,2.15,1.52,1.17,0.94,0.78],
    reverseRatio: 3.2, shiftTimeS: 0.36,
    idleRpm: 850, redlineRpm: 6850,
    peakTorqueNm: 345, drivetrainEfficiency: 0.88,
    dragCoefficient: 0.31, frontalAreaM2: 2.13, airDensityKgM3: 1.225,
    rollingResistance: 0.014,
    brakeTorqueFrontNm: 2050, brakeTorqueRearNm: 1440,
    downforceCoefficient: 0.045, springFront: 38, springRear: 34,
    dampingCompression: 4.5, dampingRelaxation: 2.9,
    antiRollStiffness: 1400
  })
});

export const SURFACES = Object.freeze({
  dry: Object.freeze({ grip: 1, lateral: 1, rolling: 1, name: 'ASFALTO SECO' }),
  wet: Object.freeze({ grip: .73, lateral: .79, rolling: 1.06, name: 'ASFALTO MOLHADO' }),
  dirt: Object.freeze({ grip: .67, lateral: .72, rolling: 1.45, name: 'TERRA' }),
  gravel: Object.freeze({ grip: .60, lateral: .64, rolling: 1.53, name: 'GRAVILHA' }),
  grass: Object.freeze({ grip: .45, lateral: .49, rolling: 1.72, name: 'RELVA' })
});

export const TYRES = Object.freeze({
  road: Object.freeze({ grip: 1, wet: .92, sidewall: 1 }),
  sport: Object.freeze({ grip: 1.14, wet: .84, sidewall: 1.06 }),
  track: Object.freeze({ grip: 1.3, wet: .67, sidewall: 1.12 })
});

export const clamp = (v, min, max) => Math.max(min,Math.min(max,Number.isFinite(v)?v:0));

export function torqueAtRpm(rpm, spec=CAR_SPECS.coupe) {
  const t=clamp((rpm-spec.idleRpm)/(spec.redlineRpm-spec.idleRpm),0,1);
  // Broad naturally aspirated torque curve: low-end and redline taper.
  const curve=t<.18?.64+1.5*t:t<.63?.91+.16*(t-.18):1.0-.95*(t-.63);
  return spec.peakTorqueNm * Math.max(.5, curve);
}

export function powerKW(rpm,torqueNm) {
  return Math.max(0,torqueNm*rpm*2*Math.PI/60000);
}

export function tyreGrip(surface='dry',tyre='road',wetness=0) {
  const p=SURFACES[surface]||SURFACES.dry;
  const t=TYRES[tyre]||TYRES.road;
  const wet = surface==='wet'||wetness>.1;
  return {longitudinal:p.grip*t.grip*(wet?t.wet:1),
    lateral:p.lateral*t.grip*(wet?t.wet:1)*t.sidewall,
    rolling:p.rolling,
    surface:p.name};
}

// Smooth loss of contact force when slip exceeds its useful range.
// The saturated response never snaps to zero as an animation would.
export function normalizedTyreForce(slip,peak=.13) {
  const magnitude=Math.abs(slip);
  return Math.sign(slip)*Math.sin(Math.atan(magnitude/peak)*1.65);
}

export function contactSlip(wheelLongMS,rollingMS,lateralMS) {
  const denom=Math.max(2.0,Math.abs(wheelLongMS),Math.abs(rollingMS));
  return {longitudinal:clamp((rollingMS-wheelLongMS)/denom,-2,2),
    lateral:Math.atan2(lateralMS,Math.max(1,Math.abs(wheelLongMS)))};
}

export function ackermannAngles(steer,wheelbase,track) {
  const s=clamp(steer,-.7,.7);
  if(Math.abs(s)<1e-5)return [0,0];
  const radius=wheelbase/Math.tan(Math.abs(s));
  const inner=Math.atan(wheelbase/Math.max(.35,radius-track/2));
  const outer=Math.atan(wheelbase/(radius+track/2));
  // Positive steering indicates left wheel as inner wheel.
  return s>0?[inner,outer]:[-outer,-inner];
}

export function aerodynamicDrag(speedMS,spec=CAR_SPECS.coupe) {
  return .5*spec.airDensityKgM3*spec.dragCoefficient*spec.frontalAreaM2*speedMS*speedMS;
}

export function brakingAssist(brake,slipRatio,absEnabled=true) {
  if(!absEnabled)return clamp(brake,0,1);
  // Gradual electronic pressure modulation on any wheel that tends to lock.
  const intervention=clamp((-slipRatio-.13)/.50,0,.72);
  return clamp(brake,0,1)*(1-intervention);
}

export function tractionAssist(throttle,slipRatio,tcsEnabled=true) {
  if(!tcsEnabled)return clamp(throttle,0,1);
  const intervention=clamp((slipRatio-.14)/.55,0,.86);
  return clamp(throttle,0,1)*(1-intervention);
}
