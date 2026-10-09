import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const world = readFileSync(new URL('../src/world.js', import.meta.url), 'utf8');
const vehicle = readFileSync(new URL('../src/vehicle.js', import.meta.url), 'utf8');
const assets = readFileSync(new URL('../src/assets.js', import.meta.url), 'utf8');
const lighting = readFileSync(new URL('../src/lighting.js', import.meta.url), 'utf8');
const performance = readFileSync(new URL('../src/performance.js', import.meta.url), 'utf8');

const ids = [
  'game', 'startButton', 'resumeButton', 'pauseButton', 'restartButton',
  'settingsBack', 'qualitySelect', 'fpsSelect', 'weatherSelect',
  'fullscreenButton', 'speedValue', 'rpmValue', 'gearValue',
  'modelToggle', 'autoQualityToggle', 'perfValue', 'assetStatus'
];
for (const id of ids) {
  assert.match(html, new RegExp('id="' + id + '"'), 'Missing interface element: ' + id);
}
assert.match(html, /three@0\.168\.0/);
assert.match(html, /cannon-es@0\.20\.0/);
assert.match(main, /physics\.step/);
assert.match(main, /navigator\.getGamepads/);
assert.match(main, /requestFullscreen/);
assert.match(world, /new CANNON\.Trimesh/);
assert.match(world, /updateAtmosphere/);
assert.match(vehicle, /new CANNON\.RaycastVehicle/);
assert.match(vehicle, /applyEngineForce/);
assert.match(vehicle, /setBrake/);
assert.match(assets, /GLTFLoader/);
assert.match(assets, /asphalt_02_diff_/);
assert.match(assets, /setImportedCar/);
assert.match(assets, /catch \(e\)/);
assert.match(lighting, /RGBELoader/);
assert.match(lighting, /LightProbeGenerator/);
assert.match(performance, /drawCalls/);
assert.match(vehicle, /setVisualDetail/);
assert.match(vehicle, /this\.wheelModels/);
console.log('PASS: interface, photo-assets fallback, irradiance and performance checks.');
