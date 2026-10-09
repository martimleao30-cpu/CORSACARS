import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const world = readFileSync(new URL('../src/world.js', import.meta.url), 'utf8');
const vehicle = readFileSync(new URL('../src/vehicle.js', import.meta.url), 'utf8');

const ids = [
  'game', 'startButton', 'resumeButton', 'pauseButton', 'restartButton',
  'settingsBack', 'qualitySelect', 'fpsSelect', 'weatherSelect',
  'fullscreenButton', 'speedValue', 'rpmValue', 'gearValue'
];
for (const id of ids) {
  assert.match(html, new RegExp('id="' + id + '"'), 'Missing interface element: ' + id);
}
assert.match(html, /three@0\.168\.0/);
assert.match(html, /cannon-es@0\.20\.0/);
assert.match(main, /physics\.fixedStep/);
assert.match(main, /navigator\.getGamepads/);
assert.match(main, /requestFullscreen/);
assert.match(world, /new CANNON\.Trimesh/);
assert.match(world, /updateAtmosphere/);
assert.match(vehicle, /new CANNON\.RaycastVehicle/);
assert.match(vehicle, /applyEngineForce/);
assert.match(vehicle, /setBrake/);
console.log('PASS: interface integration and source smoke checks.');
