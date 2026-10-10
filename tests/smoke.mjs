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
  'fullscreenButton', 'gpsCanvas', 'gpsReference', 'gpsStatus', 'speedValue', 'rpmValue', 'gearValue',
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
assert.match(world,/new CinematicSky/);
assert.match(world,/configureCinematicShadows/);
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
assert.match(world,/new ModernRoadLighting/);
assert.match(world,/this\.roadLighting\?\.update/);
assert.match(vehicle, /this\.wheelModels/);
const premium=readFileSync(new URL('../src/interface.js',import.meta.url),'utf8');
const premiumCss=readFileSync(new URL('../src/premium.css',import.meta.url),'utf8');
for(const id of ['garageScreen','mapScreen','hudEditorScreen','creditsScreen',
  'hudStyle','hudScale','hudColor','hudUnit','hudApply','hudCancel','hudProfile',
  'renderScale','antiAlias','shadowQuality','drawDistance','engineVolume']) {
  assert.ok(premium.includes(id), 'Premium interface missing: '+id);
}
assert.match(premium,/localStorage\.setItem/);
assert.match(premium,/data-bind/);
assert.match(premiumCss,/style-analog/);
assert.match(premiumCss,/style-racing/);
assert.match(main,/ui\.updateTelemetry/);
assert.match(main,/saveSession/);
assert.match(main,/settings\.bindings/);
const details=readFileSync(new URL('../src/world-details.js',import.meta.url),'utf8');
for(const feature of ['buildGrass','buildShrubs','buildClouds','buildPuddles',
  'buildGuardrails','buildSigns','animateTreeLeaves','setDensity']) {
  assert.ok(details.includes(feature),'World detail feature missing: '+feature);
}
assert.match(details,/InstancedMesh/);
assert.match(details,/uCorsaWind/);
assert.match(world,/details\?\.update/);
assert.match(world,/createTerrainMaterial/);
assert.match(world,/ForestSystem/);
assert.match(world,/new RoadSignage/);
assert.match(main,/world\.updateForest/);
assert.match(vehicle,/contactShadow/);
assert.match(vehicle,/tireTreads/);
assert.match(vehicle,/dashLight/);
assert.match(premium,/style-glass/);
assert.match(premium,/new NavigationHUD/);
assert.match(premium,/garageModel/);
assert.match(premium,/this.railDestinations/);
assert.match(premium,/this.api.world.railway/);
assert.match(premium,/BMW M4 Competition/);
assert.match(main,/setCarModel/);
assert.match(premium,/gpsDestination/);
const gpsAsset=readFileSync(new URL('../assets/ui/gps-reference.webp',import.meta.url));
assert.ok(gpsAsset.length>1000,'GPS transparent asset must be included in web and desktop builds');
assert.equal(gpsAsset.toString('ascii',0,4),'RIFF');
assert.match(premiumCss,/style-glass/);
console.log('PASS: vehicle, road, 3D vegetation, wet weather, clouds and translucent HUD integrations.');
