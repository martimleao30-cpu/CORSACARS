import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DrivingWorld } from './world.js';
import { PlayerVehicle } from './vehicle.js';
import { GraphicsPipeline } from './graphics.js';
import { AssetUpgrade } from './assets.js';
import { IndirectLighting } from './lighting.js';
import { PerformanceMonitor } from './performance.js';
import { PremiumInterface } from './interface.js';
import { RoadDust } from './road-dust.js';
import './desktop-updates.js';

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
      autoQuality: saved.autoQuality === true,
      paint: /^#[0-9a-f]{6}$/i.test(saved.paint) ? saved.paint : '#29445d',
      bindings: saved.bindings && typeof saved.bindings==='object' ? saved.bindings : undefined,
      ...Object.fromEntries(['renderScale','antiAlias','shadowQuality','drawDistance','vegetation','textureQuality','bloom','engineVolume','steeringSensitivity','gamepadDeadzone','menuAccent','tyreCompound','absEnabled','tcsEnabled','escEnabled','analogCurve','invertSteering','gearboxMode'].filter(k => saved[k] !== undefined).map(k => [k,saved[k]]))
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
const roadDust = new RoadDust(scene, settings.quality);
const graphics = new GraphicsPipeline(renderer, scene, camera, car, world);
graphics.setQuality(settings.quality, settings);
void graphics.initialize();
const indirect = new IndirectLighting(scene, renderer);
graphics.indirect = indirect;
const assets = new AssetUpgrade(car, world, scene, renderer, status => {
  $('assetStatus').textContent = status;
});
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
const panelStack = [];
const SESSION_KEY = 'corsacars.session.v1';
let lastSessionSave = 0;
let cameraMode = 0;
let cameraLook = new THREE.Vector3();
let lastFrame = 0;
const FIXED_DT = 1/60;
let physicsAccumulator = 0;
let physicsStepMs = 0;
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
      this.enabled && !isPaused ? (0.009 + Math.abs(throttle) * 0.019) * (settings.engineVolume ?? .7) : 0.00001,
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
    if (ui.handleEscape()) return;
    if (!$('settingsScreen').classList.contains('hidden')) closeSettings();
    else if (active) setPaused(!paused);
  }
  if (!active || paused || !$('settingsScreen').classList.contains('hidden')) return;
  if (key === (settings.bindings?.camera || 'c')) changeCamera();
  if (key === 'r') { car.reset(); toast('CARRO RECOLOCADO NA ESTRADA'); }
  if (key === 'm') {
    car.manual = !car.manual;
    settings.gearboxMode=car.manual?'manual':'auto';
    $('gearboxMode').value=settings.gearboxMode;
    persistSettings();
    if(!car.manual){car.gear=Math.max(1,car.gear);car.reverse=false;}
    toast(car.manual ? 'CAIXA MANUAL · Q/E: MUDANÇAS' : 'CAIXA AUTOMÁTICA');
  }
  if (key === 'z') { car.setIndicator(-1); toast('PISCA ESQUERDO'); }
  if (key === 'x') { car.setIndicator(1); toast('PISCA DIREITO'); }
  if (key === 'f') interactNearby();
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
  const bindings=settings.bindings || {};
  const keyboardSteer = (keys.has(bindings.right || 'd') || keys.has('arrowright') ? 1 : 0) -
    (keys.has(bindings.left || 'a') || keys.has('arrowleft') ? 1 : 0);
  stick.steer = keyboardSteer * (settings.steeringSensitivity ?? 1);
  stick.accelerate = keys.has(bindings.accelerate || 'w') || keys.has('arrowup') ? 1 : 0;
  stick.brake = keys.has(bindings.brake || 's') || keys.has('arrowdown') ? 1 : 0;
  stick.handbrake = keys.has(bindings.handbrake || ' ');
  const gp = navigator.getGamepads?.()?.find(p => p?.connected && p.mapping === 'standard');
  if (gp) {
    const steer=gp.axes[0]||0;
    const deadzone=Math.max(.05,Math.min(.4,Number(settings.gamepadDeadzone)||.12));
    const magnitude=Math.max(0,(Math.abs(steer)-deadzone)/(1-deadzone));
    const linearity=Math.max(.6,Math.min(2.2,Number(settings.analogCurve)||1));
    const mapped=Math.sign(steer)*Math.pow(magnitude,linearity)*
      (settings.invertSteering?-1:1)*(settings.steeringSensitivity??1);
    if(magnitude>0)stick.steer=Math.max(-1,Math.min(1,mapped));
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
  stick.steer=Math.max(-1,Math.min(1,stick.steer));
  return stick;
}

function updateCamera(dt) {
  const point = car.getPosition();
  if (!active && !$('startScreen').classList.contains('hidden') ||
      !$('garageScreen').classList.contains('hidden')) {
    const t=performance.now() * .00011;
    const radius= $('garageScreen').classList.contains('hidden') ? 12 : 8;
    cameraPos.set(point.x+Math.sin(t)*radius,point.y+3.8,point.z+Math.cos(t)*radius);
    camera.position.lerp(cameraPos,Math.min(1,dt*2.6));
    camera.lookAt(point.x,point.y+0.5,point.z);
    return;
  }
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
function interactNearby(){
  const poi=world.sectors?.nearby(car.getPosition(),43);
  if(!poi)return toast('APROXIMA-TE DE UM PONTO DE INTERESSE');
  if(poi.kind==='service'){
    const options=['road','sport','track'];
    const next=options[(options.indexOf(car.tyreCompound)+1)%options.length];
    car.setTyreCompound(next);settings.tyreCompound=next;
    if($('tyreCompound'))$('tyreCompound').value=next;
    persistSettings();
    toast('ÁREA DE SERVIÇO · PNEUS: '+next.toUpperCase());
  }else if(poi.kind==='town'){
    showPanel('garageScreen');
  }else if(poi.kind==='lookout'){
    cameraMode=4;
    toast('MIRADOURO · CÂMARA CINEMATOGRÁFICA');
  }else if(poi.kind==='industrial'){
    diagnostics.node.hidden=!diagnostics.node.hidden;
    toast('PEDREIRA · DIAGNÓSTICO DE ADERÊNCIA');
  }else if(poi.kind==='farm'){
    car.setTyreCompound('road');settings.tyreCompound='road';
    if($('tyreCompound'))$('tyreCompound').value='road';
    persistSettings();toast('QUINTA · PNEUS DE ESTRADA INSTALADOS');
  }
}
function changeCamera() {
  cameraMode = (cameraMode + 1) % viewNames.length;
  toast('CÂMARA: ' + viewNames[cameraMode]);
}
function showOnly(id) {
  for (const name of ['startScreen', 'pauseScreen', 'settingsScreen', 'garageScreen', 'hudEditorScreen', 'mapScreen', 'creditsScreen']) {
    $(name).classList.toggle('hidden', name !== id);
  }
}
function startGame() {
  if (!active) restoreSession();
  active = true;
  paused = false;
  showOnly(null);
  $('topbar').classList.remove('hidden');
  $('hud').classList.remove('hidden');
  engine.activate();
  $('hud').classList.remove('editing');
  void assets.start(settings.quality);
  if (!window.__CORSACARS_DISABLE_REMOTE_ASSETS__) void indirect.load();
}
function setPaused(value) {
  if (!active) return;
  paused = value;
  showOnly(paused ? 'pauseScreen' : null);
  keys.clear();
}
function showPanel(id) {
  const previous=['startScreen','pauseScreen','settingsScreen','garageScreen','hudEditorScreen','mapScreen','creditsScreen']
    .find(name=>!$(name).classList.contains('hidden')) || (active?'pauseScreen':'startScreen');
  panelStack.push(previous);
  if(active)paused=true;
  showOnly(id);
  keys.clear();
}
function backPanel() {
  const previous=panelStack.pop() || (active?'pauseScreen':'startScreen');
  showOnly(previous);
  $('hud').classList.toggle('hidden', !active && previous!=='hudEditorScreen');
  if(previous==='pauseScreen')paused=true;
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
  if(active) saveSession();
  active = false;
  paused = false;
  keys.clear();
  car.reset();
  panelStack.length=0;
  showOnly('startScreen');
  $('topbar').classList.add('hidden');
  $('hud').classList.add('hidden');
}

function applyQuality() {
  const scales = { low: 0.67, medium: 0.83, high: 1, ultra: 1.3 };
  const requestedScale=Math.max(.6,Math.min(1.15,Number(settings.renderScale)||1));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8) * scales[settings.quality] * requestedScale);
  const shadowSetting=settings.shadowQuality || 'high';
  renderer.shadowMap.enabled = settings.quality !== 'low' && shadowSetting !== 'off';
  const sizes={off:512,low:512,medium:1024,high:2048};
  const size=sizes[shadowSetting]||1024;
  if(world.sun.shadow.mapSize.x!==size){
    world.sun.shadow.map?.dispose();
    world.sun.shadow.map=null;
    world.sun.shadow.mapSize.set(size,size);
  }
  camera.far=Math.max(500,Math.min(1900,Number(settings.drawDistance)||1500));
  camera.updateProjectionMatrix();
  world.setVegetationDensity?.(Number(settings.vegetation)||1);
  world.forest?.setQuality(settings.quality);
  roadDust.quality=settings.quality;
  renderer.shadowMap.needsUpdate = true;
  graphics.setQuality(settings.quality, settings);
  graphics.configureEffects?.(settings);
  assets.setQuality(settings.quality);
  resize();
}
window.addEventListener('corsacars:before-update', () => {
  saveSession();
  persistSettings();
});
function saveSession() {
  const p=car.chassis.position,q=car.chassis.quaternion;
  try {localStorage.setItem(SESSION_KEY,JSON.stringify({v:1,position:[p.x,p.y,p.z],quaternion:[q.x,q.y,q.z,q.w],saved:Date.now()}));}
  catch{}
}
function restoreSession() {
  try {
    const state=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
    const a=state?.position,b=state?.quaternion;
    if(state?.v!==1||!Array.isArray(a)||a.length!==3||!Array.isArray(b)||b.length!==4||
       ![...a,...b].every(Number.isFinite)||Math.max(Math.abs(a[0]),Math.abs(a[2]))>950||
       a[1]<-10||a[1]>300)return;
    car.chassis.position.set(...a);
    car.chassis.quaternion.set(...b);
    car.chassis.velocity.set(0,0,0);
    car.chassis.angularVelocity.set(0,0,0);
  } catch {}
}

function createDiagnostics(){
  const node=document.createElement('div');
  node.id='physicsDiagnostics';
  node.hidden=true;
  node.setAttribute('aria-live','off');
  node.style.cssText=[
    'position:fixed;top:76px;right:22px;z-index:12',
    'width:270px;padding:14px 15px;border:1px solid #92b77e',
    'border-radius:8px;background:rgba(8,21,29,.87)',
    'color:#dbecef;font:11px/1.5 monospace;white-space:pre-line',
    'pointer-events:none;backdrop-filter:blur(8px)'
  ].join(';');
  document.body.appendChild(node);
  let last=0;
  return {node,update(data,stepMs,roadCount){
    if(node.hidden)return;
    const now=performance.now();
    if(now-last<160)return;
    last=now;
    node.textContent=[
      'FÍSICA CORSACARS · F3 PARA FECHAR',
      'Velocidade: '+data.speed+' km/h',
      'RPM: '+data.rpm+' | '+data.gearbox+' '+data.gear,
      'Superfície: '+data.surface+' | μ='+data.grip,
      'Força motriz: '+data.driveForceN+' N',
      'Potência instantânea: '+data.enginePowerKW+' kW',
      'Patinagem motriz: '+data.slip,
      'Rodas em contacto: '+data.wheelContact+'/4',
      'Suspensão [m]: '+(data.suspension||[]).join(' · '),
      'Slip rodas: '+(data.wheelSlip||[]).join(' · '),
      'TCS redução: '+Math.round((data.tractionIntervention||0)*100)+'%',
      'Tempo física: '+stepMs.toFixed(2)+' ms',
      'FPS estimados: '+performanceMonitor.current.fps,
      'Render: '+renderer.info.render.calls+' draw calls · '+renderer.info.render.triangles+' tri',
      'Memória GPU aprox.: '+renderer.info.memory.textures+' texturas / '+renderer.info.memory.geometries+' geometrias',
      'Estradas da região: '+roadCount,
      'Árvores: '+(world.forest?.statistics.active||0)+' visíveis / '+
        (world.forest?.statistics.planted||0)+' colocadas',
      'LOD árvores 0/1/2/3: '+(world.forest?.statistics.lod||[0,0,0,0]).join('/')
    ].join('\n');
  }};
}
window.addEventListener('keydown',e=>{
  if(e.key==='F3'){e.preventDefault();diagnostics.node.hidden=!diagnostics.node.hidden;}
});

function resize() {
  const width = window.innerWidth, height = window.innerHeight;
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  graphics.resize();
}
window.addEventListener('resize', resize);
const diagnostics = createDiagnostics();
const poiHint=document.createElement('div');
poiHint.id='poiHint';poiHint.hidden=true;
poiHint.style.cssText='position:fixed;top:115px;left:20px;z-index:11;'+
  'color:#f7f6df;background:rgba(8,22,30,.83);border-left:3px solid #eac387;'+
  'padding:10px 14px;font:bold 11px sans-serif;pointer-events:none';
document.body.appendChild(poiHint);
const ui = new PremiumInterface({
  vehicle:car,world,settings,persistSettings,applyQuality,
  teleportToTests:()=>{
    if(!world.testSpawn)return toast('PISTA DE TESTES INDISPONÍVEL');
    car.spawnPoint=world.testSpawn;
    car.reset();
    setPaused(false);
    toast('CENTRO DE TESTES · ACELERAÇÃO, TRAVAGEM E ADERÊNCIA');
  },
  showPanel,backPanel,closeSettings,
  showHud:(visible)=>$('hud').classList.toggle('hidden',!visible),
  toast,
  reloadTextures:(quality)=>assets.loadPhotographicAsphalt(quality==='high'?'ultra':'high')
});
car.setPaintColor(settings.paint);
car.setTyreCompound(settings.tyreCompound||'road');
car.manual=settings.gearboxMode==='manual';
car.setAssists({
  abs:settings.absEnabled!==false,
  tcs:settings.tcsEnabled!==false,
  esc:settings.escEnabled!==false
});
if(localStorage.getItem(SESSION_KEY)) {
  $('startButton').innerHTML='CONTINUAR A CONDUZIR <span>↗</span>';
}

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
  const dt = lastFrame ? clamp((now - lastFrame) / 1000, 0.001, 0.12) : 1 / 60;
  lastFrame = now;
  const play = active && !paused;
  ui.pollGamepad();
  let controls = { steer: 0, accelerate: 0, brake: 0, handbrake: false };
  if (play) {
    controls = sampleControls();
    physicsAccumulator=Math.min(.12,physicsAccumulator+dt);
    const physicsStart=performance.now();
    let substeps=0;
    while(physicsAccumulator>=FIXED_DT && substeps<7){
      car.updatePhysics(FIXED_DT,controls,(x,z)=>world.surfaceAt(x,z));
      physics.step(FIXED_DT);
      physicsAccumulator-=FIXED_DT;
      substeps++;
    }
    physicsStepMs=performance.now()-physicsStart;
  } else {
    physicsAccumulator=0;
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
  world.updateForest(camera,dt,!play);
  roadDust.update(dt,car,world,camera,play);
  car.setVisualDetail(camera.position);
  graphics.update(dt, play);
  const telemetry = car.getTelemetry();
  ui.updateTelemetry(telemetry,controls.handbrake);
  $('hudState').textContent = telemetry.gearbox + ' · '+car.spec.drivetrain+' · '+(telemetry.surface||'ASFALTO').toUpperCase();
  diagnostics.update(telemetry,physicsStepMs,world.network?.roads.length||1);
  const nearby=active&&world.sectors?.nearby(car.getPosition(),43);
  poiHint.hidden=!nearby;
  if(nearby)poiHint.textContent='F · '+nearby.name.toUpperCase()+' · INTERAGIR';
  const hours = Math.floor(world.hour), mins = Math.floor(world.hour % 1 * 60);
  $('worldTime').textContent = String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
  $('weatherLabel').textContent = { clear: 'CÉU LIMPO', rain: 'CHUVA', fog: 'NEVOEIRO' }[world.weather];
  engine.update(telemetry.rpm, controls.accelerate, !play);
  if (notifyUntil && now > notifyUntil) {
    $('toast').classList.add('hidden');
    notifyUntil = 0;
  }
  graphics.render();
  if(play && now-lastSessionSave>10000){saveSession();lastSessionSave=now;}
  performanceMonitor.update(dt, settings.quality, settings.autoQuality, play);
}

applyQuality();
// Load optional detailed car and natural environment lighting already in the 3D menu.
// Network failures keep the procedural car and the rest of the game functional.
if (!window.__CORSACARS_DISABLE_REMOTE_ASSETS__) {
  void assets.start(settings.quality);
  void indirect.load();
}
camera.position.copy(car.getPosition()).add(new THREE.Vector3(0, 5, -13));
camera.lookAt(car.getPosition());
$('loading').classList.add('hidden');
showOnly('startScreen');
requestAnimationFrame(frame);
