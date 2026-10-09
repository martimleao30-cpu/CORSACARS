import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DrivingWorld } from './world.js';
import { PlayerVehicle } from './vehicle.js';
import { GraphicsPipeline } from './graphics.js';
import { AssetUpgrade } from './assets.js';
import { IndirectLighting } from './lighting.js';
import { PerformanceMonitor } from './performance.js';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const settingsKey = 'corsacars.settings.v1';

function restoreSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    return {
      quality: ['low', 'medium', 'high', 'ultra'].includes(saved.quality) ? saved.quality : 'high',
      fps: [0, 30, 60, 120].includes(saved.fps) ? saved.fps : 60,
      sound: saved.sound !== false,
      ao: saved.ao !== false,
      reflections: saved.reflections !== false,
      model: saved.model !== false,
      autoQuality: saved.autoQuality === true
    };
  } catch {
    return { quality: 'high', fps: 60, sound: true, ao: true, reflections: true, model: true, autoQuality: false };
  }
}
const settings = restoreSettings();
function persistSettings() {
  try { localStorage.setItem(settingsKey, JSON.stringify(settings)); }
  catch { /* Browsers may restrict local storage; gameplay still works. */ }
}

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(67, 1, 0.15, 1900);
const physics = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0),
  allowSleep: true
});
physics.defaultContactMaterial.friction = 0.68;
physics.defaultContactMaterial.restitution = 0;
physics.solver.iterations = 12;
physics.broadphase = new CANNON.SAPBroadphase(physics);
const world = new DrivingWorld(scene, physics, settings.quality);
const car = new PlayerVehicle(physics, scene, world.spawn);
const graphics = new GraphicsPipeline(renderer, scene, camera, car, world);
graphics.setQuality(settings.quality, settings);
void graphics.initialize();
const indirect = new IndirectLighting(scene, renderer);
graphics.indirect = indirect;
const assets = new AssetUpgrade(car, world, scene, renderer);
assets.modelEnabled = settings.model;
assets.setQuality(settings.quality);
const performanceMonitor = new PerformanceMonitor(renderer, $('perfValue'), quality => {
  settings.quality = quality;
  $('qualitySelect').value = quality;
  applyQuality();
  persistSettings();
  toast('QUALIDADE AUTOMÁTICA: ' + quality.toUpperCase());
});

let active = false;
let paused = false;
let settingsFrom = 'startScreen';
let cameraMode = 0;
let cameraLook = new THREE.Vector3();
let lastFrame = 0;
let notifyUntil = 0;
let gamepadLast = { camera: false, menu: false };
const viewNames = ['SEGUIMENTO', 'EXTERIOR', 'INTERIOR', 'CAPÔ', 'CINEMATOGRÁFICA'];
const cameraPos = new THREE.Vector3();
const forward = new THREE.Vector3();
const offset = new THREE.Vector3();

class EngineTone {
  constructor() {
    this.context = null;
    this.low = null;
    this.high = null;
    this.gain = null;
    this.enabled = settings.sound;
  }
  activate() {
    if (!this.enabled) return;
    if (this.context) {
      this.context.resume().catch(() => {});
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.gain = this.context.createGain();
    this.gain.gain.value = 0.0001;
    filter.connect(this.gain);
    this.gain.connect(this.context.destination);
    this.low = this.context.createOscillator();
    this.low.type = 'sawtooth';
    this.low.connect(filter);
    this.high = this.context.createOscillator();
    this.high.type = 'triangle';
    this.high.connect(filter);
    this.low.start();
    this.high.start();
  }
  update(rpm, throttle, isPaused) {
    if (!this.context) return;
    const time = this.context.currentTime;
    const hz = 26 + rpm / 95;
    this.low.frequency.setTargetAtTime(hz, time, 0.05);
    this.high.frequency.setTargetAtTime(hz * 1.98, time, 0.05);
    this.gain.gain.setTargetAtTime(
      this.enabled && !isPaused ? 0.009 + Math.abs(throttle) * 0.019 : 0.00001,
      time, 0.09
    );
  }
}
const engine = new EngineTone();

const keys = new Set();
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  const editing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (editing && key !== 'escape') return;
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
  keys.add(key);
  if (event.repeat) return;
  if (key === 'escape') {
    if (!$('settingsScreen').classList.contains('hidden')) closeSettings();
    else if (active) setPaused(!paused);
  }
  if (!active || paused || !$('settingsScreen').classList.contains('hidden')) return;
  if (key === 'c') changeCamera();
  if (key === 'r') { car.reset(); toast('CARRO RECOLOCADO NA ESTRADA'); }
  if (key === 'm') {
    car.manual = !car.manual;
    toast(car.manual ? 'CAIXA MANUAL' : 'CAIXA AUTOMÁTICA');
  }
  if (key === 'z') { car.setIndicator(-1); toast('PISCA ESQUERDO'); }
  if (key === 'x') { car.setIndicator(1); toast('PISCA DIREITO'); }
  if (key === 'q') car.shift(-1);
  if (key === 'e') car.shift(1);
  if (key === 'n') { world.hour = world.hour > 7 && world.hour < 19 ? 23 : 14; toast('HORA ALTERADA'); }
  if (key === 'k') {
    const choices = ['clear', 'rain', 'fog'];
    const next = choices[(choices.indexOf(world.weather) + 1) % choices.length];
    world.setWeather(next);
    $('weatherSelect').value = next;
    toast('CLIMA: ' + { clear: 'LIMPO', rain: 'CHUVA', fog: 'NEVOEIRO' }[next]);
  }
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('gamepaddisconnected', () => { gamepadLast = { camera: false, menu: false }; });

function sampleControls() {
  const stick = { steer: 0, accelerate: 0, brake: 0, handbrake: false };
  const keyboardSteer = (keys.has('d') || keys.has('arrowright') ? 1 : 0) -
    (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  stick.steer = keyboardSteer;
  stick.accelerate = keys.has('w') || keys.has('arrowup') ? 1 : 0;
  stick.brake = keys.has('s') || keys.has('arrowdown') ? 1 : 0;
  stick.handbrake = keys.has(' ');
  const gp = navigator.getGamepads?.()?.find(p => p?.connected && p.mapping === 'standard');
  if (gp) {
    const steer = gp.axes[0] || 0;
    stick.steer = Math.abs(steer) > 0.12 ? steer : stick.steer;
    stick.accelerate = Math.max(stick.accelerate, gp.buttons[7]?.value || 0);
    stick.brake = Math.max(stick.brake, gp.buttons[6]?.value || 0);
    stick.handbrake ||= gp.buttons[0]?.pressed || false;
    const cameraPressed = gp.buttons[3]?.pressed || false;
    const menuPressed = gp.buttons[9]?.pressed || false;
    if (cameraPressed && !gamepadLast.camera && active && !paused) changeCamera();
    if (menuPressed && !gamepadLast.menu && active) setPaused(!paused);
    gamepadLast = { camera: cameraPressed, menu: menuPressed };
    if (car.manual && active && !paused) {
      const down = gp.buttons[4]?.pressed || false;
      const up = gp.buttons[5]?.pressed || false;
      if (down && !sampleControls.lastDown) car.shift(-1);
      if (up && !sampleControls.lastUp) car.shift(1);
      sampleControls.lastDown = down;
      sampleControls.lastUp = up;
    }
  }
  return stick;
}

function updateCamera(dt) {
  const point = car.getPosition();
  const quat = car.model.quaternion;
  forward.set(0, 0, 1).applyQuaternion(quat);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
  const up = new THREE.Vector3(0, 1, 0);
  const speed = car.speedKmh;
  const chaseDistance = cameraMode === 1 ? 14 : 7.7;
  if (cameraMode <= 1) {
    cameraPos.copy(point).addScaledVector(forward, -chaseDistance)
      .addScaledVector(up, cameraMode === 1 ? 4.9 : 2.9);
    cameraLook.copy(point).addScaledVector(forward, 5.1).addScaledVector(up, 0.9);
  } else if (cameraMode === 2) {
    cameraPos.copy(point).add(new THREE.Vector3(-0.35, 0.79, 0.03).applyQuaternion(quat));
    cameraLook.copy(cameraPos).addScaledVector(forward, 16).addScaledVector(up, -0.1);
  } else if (cameraMode === 3) {
    cameraPos.copy(point).add(new THREE.Vector3(0, 0.48, 1.69).applyQuaternion(quat));
    cameraLook.copy(cameraPos).addScaledVector(forward, 16);
  } else {
    offset.copy(right).multiplyScalar(8.5).addScaledVector(forward, -11);
    cameraPos.copy(point).add(offset).addScaledVector(up, 4.2);
    cameraLook.copy(point).addScaledVector(forward, 2.3);
  }
  const smoothing = cameraMode === 2 || cameraMode === 3 ? 16 : 5.5;
  if (camera.position.distanceToSquared(point) > 8500) camera.position.copy(cameraPos);
  else camera.position.lerp(cameraPos, 1 - Math.exp(-smoothing * dt));
  camera.fov = THREE.MathUtils.damp(camera.fov,
    67 + Math.min(12, speed * 0.07), 4, dt);
  camera.updateProjectionMatrix();
  camera.lookAt(cameraLook);
}

function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.remove('hidden');
  notifyUntil = performance.now() + 2100;
}
function changeCamera() {
  cameraMode = (cameraMode + 1) % viewNames.length;
  toast('CÂMARA: ' + viewNames[cameraMode]);
}
function showOnly(id) {
  for (const name of ['startScreen', 'pauseScreen', 'settingsScreen']) {
    $(name).classList.toggle('hidden', name !== id);
  }
}
function startGame() {
  active = true;
  paused = false;
  showOnly(null);
  $('topbar').classList.remove('hidden');
  $('hud').classList.remove('hidden');
  engine.activate();
  void assets.start(settings.quality);
  if (!window.__CORSACARS_DISABLE_REMOTE_ASSETS__) void indirect.load();
}
function setPaused(value) {
  if (!active) return;
  paused = value;
  showOnly(paused ? 'pauseScreen' : null);
  keys.clear();
}
function showSettings() {
  settingsFrom = !$('pauseScreen').classList.contains('hidden') ? 'pauseScreen' : 'startScreen';
  if (active) paused = true;
  showOnly('settingsScreen');
}
function closeSettings() {
  showOnly(settingsFrom);
  if (settingsFrom === 'startScreen') active = false;
  else paused = true;
}
function goHome() {
  active = false;
  paused = false;
  keys.clear();
  car.reset();
  showOnly('startScreen');
  $('topbar').classList.add('hidden');
  $('hud').classList.add('hidden');
}

function applyQuality() {
  const scales = { low: 0.67, medium: 0.83, high: 1, ultra: 1.3 };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8) * scales[settings.quality]);
  renderer.shadowMap.enabled = settings.quality !== 'low';
  renderer.shadowMap.needsUpdate = true;
  graphics.setQuality(settings.quality, settings);
  assets.setQuality(settings.quality);
  resize();
}
function resize() {
  const width = window.innerWidth, height = window.innerHeight;
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  graphics.resize();
}
window.addEventListener('resize', resize);

$('startButton').addEventListener('click', startGame);
$('resumeButton').addEventListener('click', () => setPaused(false));
$('pauseButton').addEventListener('click', () => setPaused(true));
$('restartButton').addEventListener('click', () => { car.reset(); setPaused(false); });
$('homeButton').addEventListener('click', goHome);
document.querySelectorAll('[data-open-settings]').forEach(button =>
  button.addEventListener('click', showSettings));
$('settingsBack').addEventListener('click', closeSettings);
$('qualitySelect').value = settings.quality;
$('qualitySelect').addEventListener('change', event => {
  settings.quality = event.target.value;
  applyQuality();
  persistSettings();
});
$('fpsSelect').value = String(settings.fps);
$('fpsSelect').addEventListener('change', event => {
  settings.fps = Number(event.target.value);
  persistSettings();
});
$('aoToggle').checked = settings.ao;
$('reflectionToggle').checked = settings.reflections;
$('aoToggle').addEventListener('change', event => {
  settings.ao = Boolean(event.target.checked);
  graphics.setQuality(settings.quality, settings);
  persistSettings();
});
$('reflectionToggle').addEventListener('change', event => {
  settings.reflections = Boolean(event.target.checked);
  graphics.setQuality(settings.quality, settings);
  persistSettings();
});
$('modelToggle').checked = settings.model;
$('modelToggle').addEventListener('change', event => {
  settings.model = Boolean(event.target.checked);
  assets.modelEnabled = settings.model;
  assets.setVisibility();
  persistSettings();
});
$('autoQualityToggle').checked = settings.autoQuality;
$('autoQualityToggle').addEventListener('change', event => {
  settings.autoQuality = Boolean(event.target.checked);
  persistSettings();
});
$('soundToggle').checked = settings.sound;
$('soundToggle').addEventListener('change', event => {
  settings.sound = Boolean(event.target.checked);
  engine.enabled = settings.sound;
  if (engine.enabled) engine.activate();
  persistSettings();
});
$('weatherSelect').addEventListener('change', event => world.setWeather(event.target.value));
$('timeRange').addEventListener('input', event => { world.hour = Number(event.target.value) % 24; });
$('fullscreenButton').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { toast('O NAVEGADOR NÃO PERMITIU ECRÃ INTEIRO'); }
});

function frame(now) {
  requestAnimationFrame(frame);
  const cap = settings.fps;
  if (cap && now - lastFrame < 1000 / cap - 1.0) return;
  const dt = lastFrame ? clamp((now - lastFrame) / 1000, 0.001, 0.05) : 1 / 60;
  lastFrame = now;
  const play = active && !paused;
  let controls = { steer: 0, accelerate: 0, brake: 0, handbrake: false };
  if (play) {
    controls = sampleControls();
    car.updatePhysics(dt, controls, world.weather);
    physics.step(1 / 60, dt, 4);
  } else {
    // Detect gamepad Start even when paused.
    const gp = navigator.getGamepads?.()?.find(p => p?.connected && p.mapping === 'standard');
    const pressed = Boolean(gp?.buttons[9]?.pressed);
    if (pressed && !gamepadLast.menu && active && $('settingsScreen').classList.contains('hidden')) {
      setPaused(!paused);
    }
    gamepadLast.menu = pressed;
  }
  car.updateVisuals(world.hour >= 19 || world.hour <= 6 || world.weather !== 'clear');
  world.update(dt, car.getPosition(), !play);
  updateCamera(dt);
  car.setVisualDetail(camera.position);
  graphics.update(dt, play);
  const telemetry = car.getTelemetry();
  $('speedValue').textContent = String(telemetry.speed);
  $('rpmValue').textContent = telemetry.rpm + ' RPM';
  $('rpmBar').style.width = clamp(telemetry.rpm / 6850 * 100, 0, 100) + '%';
  $('gearValue').textContent = telemetry.gear;
  $('hudState').textContent = telemetry.gearbox + ' · RWD · FÍSICA ALPHA';
  const hours = Math.floor(world.hour), mins = Math.floor(world.hour % 1 * 60);
  $('worldTime').textContent = String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
  $('weatherLabel').textContent = { clear: 'CÉU LIMPO', rain: 'CHUVA', fog: 'NEVOEIRO' }[world.weather];
  engine.update(telemetry.rpm, controls.accelerate, !play);
  if (notifyUntil && now > notifyUntil) {
    $('toast').classList.add('hidden');
    notifyUntil = 0;
  }
  graphics.render();
  performanceMonitor.update(dt, settings.quality, settings.autoQuality, play);
}

applyQuality();
camera.position.copy(car.getPosition()).add(new THREE.Vector3(0, 5, -13));
camera.lookAt(car.getPosition());
$('loading').classList.add('hidden');
showOnly('startScreen');
requestAnimationFrame(frame);
