import assert from 'node:assert/strict';
import * as THREE from 'three';
import {evaluateAtmosphere,CinematicSky,configureCinematicShadows}
  from '../src/cinematic-lighting.js';

const midday=evaluateAtmosphere(12,'clear');
const dawn=evaluateAtmosphere(6.6,'clear');
const sunset=evaluateAtmosphere(18.4,'clear');
const night=evaluateAtmosphere(0,'clear');
const rain=evaluateAtmosphere(12,'rain');
const fog=evaluateAtmosphere(12,'fog');
assert.ok(midday.daylight>.99 && midday.sunDirection.y>.7);
assert.ok(midday.sunIntensity>2,'Daylight must have bright direct sun');
assert.ok(dawn.sunIntensity<midday.sunIntensity,'Dawn sun weaker than midday');
assert.ok(sunset.golden>.2 && dawn.golden>.2,'Golden hour at both horizons');
assert.ok(dawn.sunColor.r>dawn.sunColor.b,'Golden sunrise must be warm');
assert.ok(rain.sunIntensity<midday.sunIntensity*.7,'Rain dims the sun');
assert.ok(rain.sunVisibility<midday.sunVisibility*.6,'Sun disc fades behind clouds');
assert.ok(rain.sunColor.b>rain.sunColor.r*.7,'Overcast sunlight has cool tint');
assert.ok(fog.fogDensity>rain.fogDensity && rain.fogDensity>midday.fogDensity);
assert.ok(night.sunHeight<-.2 && night.sunVisibility===0);
assert.ok(night.sunIntensity<.1,'Sunlight off at night');
assert.ok(Math.abs(evaluateAtmosphere(24,'clear').sunHeight-night.sunHeight)<1e-10,
  'Clock wraps 24h without visible discontinuity');
for(const state of [midday,dawn,sunset,night,rain,fog]){
  assert.ok(Number.isFinite(state.exposure));
  assert.ok(state.exposure>.7&&state.exposure<1.3,'ACES exposure remains bounded');
  assert.ok(Math.abs(state.sunDirection.length()-1)<1e-9,'Sky and shadow sun vectors agree');
}
const scene=new THREE.Scene();
const sky=new CinematicSky(scene);
assert.equal(sky.mesh.material.isShaderMaterial,true);
assert.equal(sky.mesh.material.depthWrite,false);
assert.equal(sky.mesh.renderOrder,-1000);
assert.match(sky.material.fragmentShader,/solarDisc/);
assert.match(sky.material.fragmentShader,/tonemapping_fragment/);
assert.match(sky.material.fragmentShader,/colorspace_fragment/);
const focus=new THREE.Vector3(115,5,-90);
sky.update(rain,focus);
assert.ok(sky.mesh.position.distanceTo(focus)<1e-9);
assert.ok(sky.uniforms.uSunVisibility.value<.5);
const light=new THREE.DirectionalLight();
const ultra=configureCinematicShadows(light,'ultra','high');
assert.equal(ultra.size,2048);
assert.ok(light.shadow.normalBias>0 && light.shadow.normalBias<.05);
assert.ok(light.shadow.camera.right<175,'Shadow camera tighter than old box');
const medium=configureCinematicShadows(light,'medium','medium');
assert.equal(medium.size,1536);
assert.ok(medium.extent<ultra.extent);
assert.equal(configureCinematicShadows(light,'high','off').enabled,false);
sky.dispose();
assert.equal(scene.children.length,0);
console.log('PASS: cinematic sky, realistic sun direction, golden hour, cloudiness, ACES and bounded shadows.');
