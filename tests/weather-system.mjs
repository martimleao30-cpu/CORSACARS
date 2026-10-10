import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WeatherSystem,WEATHER_PRESETS,weatherKeys,weatherTransition}
  from '../src/weather-system.js';
import {evaluateAtmosphere} from '../src/cinematic-lighting.js';

assert.deepEqual(weatherKeys,['clear','cloudy','fog','rain','storm']);
assert.equal(WEATHER_PRESETS.clear.rain,0);
assert.ok(WEATHER_PRESETS.storm.rain>WEATHER_PRESETS.rain.rain);
assert.equal(weatherTransition(0,1,0),0);
const changing=weatherTransition(0,1,1/60);
assert.ok(changing>0&&changing<.1,'Weather transitions must not pop');
const weather=new WeatherSystem('clear');
assert.equal(weather.setWeather('invalid'),false);
assert.equal(weather.selected,'clear');
assert.equal(weather.setWeather('storm'),true);
const immediately=weather.update(0,false,14);
assert.equal(immediately.rain,0,'Storm must not instantly soak the map');
const first=weather.update(1/60,false,14);
assert.ok(first.rain>0&&first.rain<1,'Rain builds gradually');
let prev=first.rain;
for(let i=0;i<1800;i++){
  const next=weather.update(1/60,false,14);
  assert.ok(next.rain>=prev-.000001,'Shower cannot reverse while ramping up');
  prev=next.rain;
}
assert.ok(weather.state.rain>.95,'Storm reaches steady state');
const frozen=weather.update(.2,true,14);
assert.equal(frozen.rain,weather.state.rain,'Pause freezes the weather simulation');
weather.setWeather('clear');
weather.update(1/60,false,14);
assert.ok(weather.state.rain>.1,'Stopping rain must not instantly dry the scene');
const dawn=new WeatherSystem('clear').update(1/60,false,6.5);
assert.ok(dawn.fog>0,'Early morning must allow valley mist');
const dry=new WeatherSystem('clear').update(1/60,false,14);
assert.equal(dry.fog,0,'Clear afternoons need no false white fog');
for(const state of [first,frozen,dawn,dry]){
  const atmosphere=evaluateAtmosphere(18.3,state);
  assert.ok(Number.isFinite(atmosphere.sunIntensity));
  assert.ok(atmosphere.sunDirection instanceof THREE.Vector3);
  assert.ok(atmosphere.fogDensity>.0005&&atmosphere.fogDensity<.013);
}
const clearMidday=evaluateAtmosphere(12,WEATHER_PRESETS.clear);
const stormMidday=evaluateAtmosphere(12,WEATHER_PRESETS.storm);
assert.ok(stormMidday.sunIntensity<clearMidday.sunIntensity);
assert.ok(stormMidday.cloudy>clearMidday.cloudy);
assert.ok(stormMidday.fogDensity>clearMidday.fogDensity);
const golden=evaluateAtmosphere(18.4,WEATHER_PRESETS.clear);
assert.ok(golden.sunColor.r>golden.sunColor.b,
  'Golden-hour palette must survive weather interpolation');
console.log('PASS: gradual five-state weather, stable mist, storms, pause and cinematic lighting.');
