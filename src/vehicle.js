import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeCarPaint, makeAutomotiveGlass } from './materials.js';
import {createBMWM4Visual} from './bmw-m4-visual.js';
import {CAR_SPECS,tyreGrip,contactSlip,ackermannAngles,torqueAtRpm,
  aerodynamicDrag,brakingAssist,tractionAssist,normalizedTyreForce,
  axleLoadTransfers,combinedSlipFactor} from './vehicle-dynamics.js';

const WHEEL_RADIUS = 0.38;
const GEAR_RATIOS = [3.48, 2.15, 1.52, 1.17, 0.94, 0.78];
const FINAL_DRIVE = 3.62;
const RPM_LIMIT = 6850;
const clamp = THREE.MathUtils.clamp;

function painted(color, metalness = 0.12, roughness = 0.28) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}
function part(parent, geometry, material, xyz, shadow = true) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...xyz);
  object.castShadow = shadow;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
function box(parent, dimensions, color, xyz, material) {
  return part(parent, new THREE.BoxGeometry(...dimensions),
    material || painted(color), xyz);
}

export class PlayerVehicle {
  constructor(physics, scene, spawn) {
    this.physics = physics;
    this.scene = scene;
    this.spawnPoint = spawn;
    this.manual = false;
    this.gear = 1;
    this.reverse = false;
    this.rpm = 850;
    this.speedKmh = 0;
    this.steering = 0;
    this.throttleSmooth = 0;
    this.longAcceleration=0;this.lateralAcceleration=0;
    this.prevForwardSpeed=0;this.prevLateralSpeed=0;
    this.contactLoads=[1,1,1,1];
    this.specId='coupe';
    this.spec = CAR_SPECS.coupe;
    this.mass = this.spec.massKg;
    this.tyreCompound = 'road';
    this.assists = {abs:true,tcs:true,esc:true};
    this.shiftTimer = 0;
    this.clutchEngagement = 1;
    this.lastDiagnostics = {surface:'dry', grip:1, slip:0, wheelContact:0, enginePowerKW:0, suspension:[], wheelSlip:[], tractionIntervention:0};
    this.brakeActive = false;
    this.indicatorSide = 0;
    this.detailLevel = true;
    this.useHighDetail = false;
    this.importedCar = null;
    this.importedLights = { brakes: [], indicators: [] };
    this.chassis = new CANNON.Body({
      mass: this.mass,
      material: new CANNON.Material('chassis'),
      angularDamping: 0.25,
      linearDamping: 0.009,
      allowSleep: false
    });
    this.chassis.addShape(new CANNON.Box(new CANNON.Vec3(0.93, 0.31, 2.05)),
      new CANNON.Vec3(0, 0.22, 0));
    this.chassis.linearFactor.set(1, 1, 1);
    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassis,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2
    });
    const options = {
      radius: WHEEL_RADIUS,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 36,
      suspensionRestLength: 0.32,
      frictionSlip: 4.6,
      dampingRelaxation: 2.9,
      dampingCompression: 4.5,
      maxSuspensionForce: 100000,
      rollInfluence: 0.045,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      maxSuspensionTravel: 0.32,
      customSlidingRotationalSpeed: -24,
      useCustomSlidingRotationalSpeed: true
    };
    for (const z of [1.37, -1.39]) {
      for (const x of [-0.87, 0.87]) {
        this.vehicle.addWheel({
          ...options,
          suspensionStiffness: z > 0 ? this.spec.springFront : this.spec.springRear,
          dampingRelaxation:this.spec.dampingRelaxation,
          dampingCompression:this.spec.dampingCompression,
          chassisConnectionPointLocal: new CANNON.Vec3(x, -0.18, z)
        });
      }
    }
    this.vehicle.addToWorld(this.physics);
    this.buildModel();
    const m4=createBMWM4Visual();
    this.bmwModel=m4.root;
    this.bmwPaint=m4.paint;
    this.bmwModel.visible=false;
    this.model.add(this.bmwModel);
    this.reset();
  }

  buildModel() {
    const root = this.model = new THREE.Group();
    const navy = makeCarPaint(0x29445d);
    this.paintMaterial=navy;
    const dark = painted(0x101820, 0.22, 0.45);
    const glass = makeAutomotiveGlass();
    this.reflectiveMaterials = [navy, glass];
    this.brakeMaterial = null;
    this.indicatorMaterials = [];
    const fineDetails = this.fineDetails = new THREE.Group();
    root.add(fineDetails);
    const red = this.brakeMaterial = new THREE.MeshStandardMaterial({
      color: 0xb91924, emissive: 0xdd1522, emissiveIntensity: 0.18
    });
    const led = new THREE.MeshStandardMaterial({
      color: 0xf9f1d8, emissive: 0xffecc5, emissiveIntensity: 1.1
    });
    box(root, [1.91, 0.47, 4.25], 0x273f54, [0, 0.09, 0], navy);
    box(root, [1.72, 0.16, 1.45], 0x273f54, [0, 0.34, 1.31], navy);
    box(root, [1.56, 0.57, 1.88], 0x273f54, [0, 0.68, -0.34], navy);
    box(root, [1.64, 0.11, 1.95], 0x273f54, [0, 1.02, -0.34], navy);
    const trim = painted(0x161e24, 0.26, 0.48);
    const silver = painted(0xaeb8bf, 0.86, 0.24);
    const leather = new THREE.MeshPhysicalMaterial({color:0x1b2027,roughness:.74,metalness:0,clearcoat:.04});
    const cloth = new THREE.MeshStandardMaterial({color:0x333842,roughness:.97});
    const brushed = new THREE.MeshStandardMaterial({color:0x858f96,roughness:.29,metalness:.89});
    // Added side sills, bonnet ribs, grille, number plates and panel trim.
    for (const side of [-1, 1]) {
      box(fineDetails, [0.075, 0.14, 2.84], 0x141b20,
        [side * 0.951, -0.04, -0.08], trim);
      box(fineDetails, [0.047, 0.045, 1.05], 0x17232c,
        [side * 0.55, 0.35, 1.48], trim);
      box(fineDetails, [0.10, 0.11, 0.46], 0xb8c1c5,
        [side * 0.72, -0.13, -2.16], silver);
    }
    box(fineDetails, [1.09, 0.16, 0.068], 0x1c262c, [0, 0.02, 2.17], trim);
    const plateMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8ddd9, metalness: 0.08, roughness: 0.75
    });
    for (const z of [-2.229, 2.229]) {
      box(fineDetails, [0.64, 0.13, 0.015], 0xe8e9e3, [0, -0.08, z], plateMaterial);
    }
    box(root, [1.55, 0.48, 0.08], 0x233e51, [0, 0.72, 0.63], glass);
    box(root, [1.50, 0.40, 0.07], 0x233e51, [0, 0.70, -1.28], glass);
    for (const side of [-1, 1]) {
      box(root, [0.07, 0.39, 1.4], 0x233e51, [side * 0.8, 0.70, -0.34], glass);
      box(root, [0.24, 0.12, 0.26], 0x273f54, [side * 1.02, 0.62, 0.43], navy);
      box(root, [0.5, 0.12, 0.18], 0xfff9e9, [side * 0.60, 0.19, 2.17], led);
      box(root, [0.52, 0.13, 0.12], 0xba1020, [side * 0.64, 0.18, -2.15], red);
      const amber = new THREE.MeshStandardMaterial({
        color: 0xd78023, emissive: 0xff8e23, emissiveIntensity: 0.02
      });
      this.indicatorMaterials.push({ side, material: amber });
      box(fineDetails, [0.18, 0.095, 0.14], 0xf1a236, [side * 0.86, 0.19, 2.16], amber);
      box(fineDetails, [0.19, 0.095, 0.13], 0xf1a236, [side * 0.88, 0.19, -2.15], amber);
    }
    // Exterior body channels, bumper diffuser and chrome exhaust surrounds.
    for(const side of [-1,1]){
      box(fineDetails,[.36,.04,2.23],0x15232e,[side*.74,.34,.02],navy);
      box(fineDetails,[.19,.06,.48],0xb8c2cc,[side*.75,.61,.43],silver);
      box(fineDetails,[.30,.035,1.42],0xb6c4cc,[side*.825,.16,-.12],brushed);
      const exhaust=part(fineDetails,new THREE.TorusGeometry(.087,.024,6,15),brushed,
        [side*.63,-.15,-2.25]);
      exhaust.rotation.y=Math.PI/2;
    }
    box(fineDetails,[1.62,.085,.38],0x151a22,[0,-.23,-2.09],dark);
    box(fineDetails,[1.60,.035,.22],0x111923,[0,1.07,-1.32],dark);
    box(root, [1.88, 0.14, 0.17], 0x101820, [0, -0.14, 2.13], dark);
    box(root, [1.88, 0.14, 0.18], 0x101820, [0, -0.14, -2.13], dark);
    box(root, [1.4, 0.1, 0.08], 0x16212b, [0, 0.25, 1.99], dark);
    const cockpit = new THREE.Group();
    // Actual shaped seat geometry, backrests/headrests, console and dashboard.
    box(cockpit,[1.45,.18,.74],0x171d22,[0,.38,.39],cloth);
    box(cockpit,[.20,.15,1.25],0x626c76,[0,.28,-.36],brushed);
    box(cockpit,[1.35,.10,.72],0x161b23,[0,.39,.40],leather);
    box(cockpit,[.57,.047,.08],0x76828d,[0,.54,.57],brushed);
    for (const side of [-1,1]){
      const px=side*.39;
      box(cockpit,[.49,.13,.62],0x17191e,[px,.13,-.62],leather);
      const back=box(cockpit,[.49,.76,.15],0x17191e,[px,.58,-.91],leather);
      back.rotation.x=-.17;
      const insert=box(cockpit,[.34,.55,.035],0x42464d,[px,.60,-.811],cloth);
      insert.rotation.x=-.17;
      box(cockpit,[.32,.24,.17],0x181a1e,[px,.99,-.99],leather);
      for(const stripe of [-1,1]){
        box(cockpit,[.012,.34,.03],0x8c939c,[px+stripe*.16,.57,-.78],brushed);
      }
    }
    const dashLight=new THREE.PointLight(0x83c4ff,0,1.9,2);
    dashLight.position.set(-.30,.60,.30);
    cockpit.add(dashLight);
    this.dashLight=dashLight;
    for (const side of [-1, 1]) {
      box(cockpit, [0.5, 0.28, 0.52], 0x181d22, [side * 0.39, 0.29, -0.61], dark);
    }
    const wheel = part(cockpit, new THREE.TorusGeometry(0.21, 0.035, 8, 20),
      dark, [-0.37, 0.54, 0.19]);
    wheel.rotation.x = 0.6;
    this.steeringWheel = wheel;
    const instrumentCanvas = document.createElement('canvas');
    instrumentCanvas.width = 256;
    instrumentCanvas.height = 128;
    this.instrumentContext = instrumentCanvas.getContext('2d');
    this.instrumentTexture = new THREE.CanvasTexture(instrumentCanvas);
    this.instrumentTexture.colorSpace = THREE.SRGBColorSpace;
    const digitalPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.43, 0.21),
      new THREE.MeshBasicMaterial({ map: this.instrumentTexture, toneMapped: false })
    );
    digitalPanel.rotation.y = Math.PI;
    digitalPanel.position.set(-0.36, 0.53, 0.055);
    cockpit.add(digitalPanel);
    this.drawInstruments(true);
    root.add(cockpit);
    this.cockpit = cockpit;
    this.scene.add(root);

    this.wheelModels = [];
    this.tireTreads = [];
    const rubber = painted(0x161819, 0.02, 0.94);
    const rim = painted(0xa6b0bb, 0.82, 0.27);
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      const tire = part(pivot,
        new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.23, 22, 1),
        rubber, [0, 0, 0]);
      tire.rotation.z = Math.PI / 2;
      const hub = part(pivot,
        new THREE.CylinderGeometry(0.23, 0.23, 0.245, 12),
        rim, [0, 0, 0]);
      // Raised rubber shoulders and a real five-spoke wheel insert.
      for (const x of [-0.124, 0.124]) {
        const sidewall = part(pivot, new THREE.TorusGeometry(0.315, 0.037, 6, 28),
          rubber, [x, 0, 0]);
        sidewall.rotation.y = Math.PI / 2;
      }
      const spokes = new THREE.Group();
      for (let k = 0; k < 5; k++) {
        const spoke = part(spokes, new THREE.BoxGeometry(0.035, 0.11, 0.045),
          rim, [0.139, 0.11, 0]);
        spoke.position.set(0.139, Math.cos(k * Math.PI * 2 / 5) * 0.12,
          Math.sin(k * Math.PI * 2 / 5) * 0.12);
        spoke.rotation.x = k * Math.PI * 2 / 5;
      }
      pivot.add(spokes);
      // 36 3D tread lugs on each tire, combined into one draw call per wheel.
      const lugGeometry=new THREE.BoxGeometry(.22,.034,.088);
      const lugs=new THREE.InstancedMesh(lugGeometry,rubber,36);
      const lugTransform=new THREE.Object3D();
      for(let t=0;t<36;t++){
        const angle=t*2*Math.PI/36;
        lugTransform.position.set(0,Math.cos(angle)*.381,Math.sin(angle)*.381);
        lugTransform.rotation.set(angle,0,0);
        lugTransform.scale.set(1,1,1);
        lugTransform.updateMatrix();
        lugs.setMatrixAt(t,lugTransform.matrix);
      }
      lugs.instanceMatrix.needsUpdate=true;
      lugs.receiveShadow=true;
      pivot.add(lugs);
      this.tireTreads.push(lugs);
      const brakeDisc=part(pivot,new THREE.CylinderGeometry(.258,.258,.034,26),
        brushed,[0,0,0]);
      brakeDisc.rotation.z=Math.PI/2;
      const wheelCap=part(pivot,new THREE.CylinderGeometry(.065,.065,.25,18),
        dark,[0,0,0]);
      wheelCap.rotation.z=Math.PI/2;
      hub.rotation.z = Math.PI / 2;
      pivot.castShadow = true;
      this.scene.add(pivot);
      this.wheelModels.push(pivot);
    }
    // Soft ground-contact shadow supplements the existing cast shadow map.
    // Transparent radial alpha gives a grounding cue in low quality modes too.
    const contactCanvas=document.createElement('canvas');
    contactCanvas.width=contactCanvas.height=128;
    const ctx=contactCanvas.getContext('2d');
    const gradient=ctx.createRadialGradient(64,64,5,64,64,63);
    gradient.addColorStop(0,'rgba(4,9,13,.57)');
    gradient.addColorStop(.58,'rgba(7,13,16,.29)');
    gradient.addColorStop(1,'rgba(5,12,16,0)');
    ctx.fillStyle=gradient;
    ctx.fillRect(0,0,128,128);
    const contactMap=new THREE.CanvasTexture(contactCanvas);
    this.contactShadow=new THREE.Mesh(
      new THREE.PlaneGeometry(2.65,5.15),
      new THREE.MeshBasicMaterial({
        map:contactMap,transparent:true,depthWrite:false,
        opacity:.66,polygonOffset:true,polygonOffsetFactor:-2
      })
    );
    this.contactShadow.rotation.order='YXZ';
    this.contactShadow.rotation.x=-Math.PI/2;
    this.contactShadow.renderOrder=1;
    this.scene.add(this.contactShadow);
    this.headlights = [];
    for (const side of [-1, 1]) {
      const light = new THREE.SpotLight(0xfff3d8, 0, 55, Math.PI / 8.5, 0.6, 1.2);
      light.position.set(side * 0.63, 0.22, 2.13);
      light.target.position.set(side * 0.63, -0.45, 18);
      root.add(light, light.target);
      this.headlights.push(light);
    }
    this.updateVisuals();
  }

  setCarModel(id='coupe') {
    if(!Object.hasOwn(CAR_SPECS,id))return false;
    const spec=CAR_SPECS[id];
    this.specId=id;this.spec=spec;this.mass=spec.massKg;
    this.chassis.mass=spec.massKg;
    this.chassis.updateMassProperties();
    const x=spec.trackM*.5,z=spec.wheelbaseM*.5;
    for(let i=0;i<this.vehicle.wheelInfos.length;i++){
      const wheel=this.vehicle.wheelInfos[i];
      wheel.chassisConnectionPointLocal.set(i%2===0?-x:x,-.18,i<2?z:-z);
      wheel.radius=spec.wheelRadiusM;
      wheel.suspensionStiffness=i<2?spec.springFront:spec.springRear;
      wheel.dampingCompression=spec.dampingCompression;
      wheel.dampingRelaxation=spec.dampingRelaxation;
      this.wheelModels[i].scale.setScalar(spec.wheelRadiusM/WHEEL_RADIUS);
    }
    this.bmwModel.visible=id==='m4';
    this.manual=false;this.gear=1;this.reverse=false;
    this.rpm=spec.idleRpm;
    this.reset();
    this.setVisualDetail(this.model.position);
    return true;
  }

  setPaintColor(hex) {
    if(/^#[0-9a-f]{6}$/i.test(hex)){
      if(this.paintMaterial)this.paintMaterial.color.set(hex);
      if(this.bmwPaint)this.bmwPaint.color.set(hex);
    }
  }

    setImportedCar(model) {
    // Physics and cameras remain attached to the original chassis.
    if (this.importedCar) this.model.remove(this.importedCar);
    this.importedCar = model;
    this.importedCar.visible = false;
    this.model.add(model);
    this.importedLights = { brakes: [], indicators: [] };
    model.traverse(node => {
      if (!node.isMesh) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        if (!mat) continue;
        const label = (mat.name || node.name || '').toLowerCase();
        if (label.includes('brakelight') && !this.importedLights.brakes.includes(mat)) {
          this.importedLights.brakes.push(mat);
        }
        if (label.includes('signallight') &&
            !this.importedLights.indicators.includes(mat)) {
          this.importedLights.indicators.push(mat);
        }
      }
    });
    this.setVisualDetail(this.model.position);
  }

  setIndicator(side) {
    this.indicatorSide = this.indicatorSide === side ? 0 : side;
  }

  setReflectionMap(texture) {
    for (const m of this.reflectiveMaterials) {
      m.envMap = texture;
      m.needsUpdate = true;
    }
  }

  setVisualDetail(cameraPosition) {
    const d2 = this.model.position.distanceToSquared(cameraPosition);
    const highQualityVisible = Boolean(this.specId!=='m4'&&this.importedCar &&
      this.useHighDetail && d2 < 100 * 100);
    if (this.importedCar) this.importedCar.visible = highQualityVisible;
    for (const obj of this.model.children) {
      if (obj === this.importedCar || obj.isLight || obj.isObject3D && obj.type === 'Object3D' && !obj.isMesh &&
          obj !== this.fineDetails && obj !== this.cockpit) continue;
      // Fallback model stays as a low-detail LOD and if the asset cannot load.
      if (obj.isMesh || obj === this.fineDetails || obj === this.cockpit) {
        obj.visible = !highQualityVisible;
      }
    }
    for (const wheel of this.wheelModels) wheel.visible = true;
    this.detailLevel = d2 < 65 * 65;
    for (const tread of this.tireTreads) tread.visible = this.detailLevel;
    if (!highQualityVisible) this.fineDetails.visible = this.detailLevel;
    const m4=this.specId==='m4';
    for(const obj of this.model.children){
      if(obj===this.bmwModel)obj.visible=m4;
      else if(m4&&!obj.isLight)obj.visible=false;
    }
  }

  drawInstruments(force = false) {
    if (!this.instrumentContext) return;
    const now = performance.now();
    if (!force && now - (this.lastInstrumentDraw || 0) < 110) return;
    this.lastInstrumentDraw = now;
    const ctx = this.instrumentContext;
    ctx.fillStyle = '#0b151d';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#b8e96c';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText(String(Math.round(this.speedKmh)).padStart(2, '0'), 16, 72);
    ctx.font = '15px sans-serif';
    ctx.fillText('KM/H', 18, 96);
    ctx.fillStyle = '#e8f6ff';
    ctx.font = 'bold 39px sans-serif';
    ctx.fillText(this.getGearLabel(), 185, 72);
    ctx.fillStyle = '#536c7c';
    ctx.fillRect(15, 109, 225, 5);
    ctx.fillStyle = '#98d7e3';
    ctx.fillRect(15, 109, 225 * Math.min(1, this.rpm / RPM_LIMIT), 5);
    this.instrumentTexture.needsUpdate = true;
  }

  reset() {
    const p = this.spawnPoint.center;
    const dir = this.spawnPoint.tangent;
    this.chassis.position.set(p.x, p.y + 1.3, p.z);
    this.chassis.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0),
      Math.atan2(dir.x, dir.z));
    this.chassis.velocity.set(0, 0, 0);
    this.chassis.angularVelocity.set(0, 0, 0);
    this.chassis.force.set(0, 0, 0);
    this.chassis.torque.set(0, 0, 0);
    this.vehicle.wheelInfos.forEach(wheel => {
      wheel.rotation = 0;
      wheel.deltaRotation = 0;
    });
    this.gear = 1;
    this.reverse = false;
    this.steering = 0;
    this.rpm=this.spec.idleRpm;
    this.longAcceleration=0;this.lateralAcceleration=0;
    this.prevForwardSpeed=0;this.prevLateralSpeed=0;
    this.contactLoads=[1,1,1,1];
    this.brakeActive = false;
    this.shiftTimer = 0;
    this.updateVisuals();
  }

  setTyreCompound(type='road') {
    if(['road','sport','track'].includes(type))this.tyreCompound=type;
  }

  setAssists(assists={}) {
    for(const key of ['abs','tcs','esc']) {
      if(typeof assists[key]==='boolean')this.assists[key]=assists[key];
    }
  }

  shift(delta) {
    if(!this.manual||this.shiftTimer>0)return;
    this.gear=clamp(this.gear+delta,-1,this.spec.gearRatios.length);
    this.reverse=this.gear===-1;
    this.shiftTimer=this.spec.shiftTimeS;
  }

  getForwardVelocity() {
    const forward = this.chassis.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
    return this.chassis.velocity.dot(forward);
  }

  updatePhysics(dt, controls, surfaceQuery='dry') {
    // Called once per fixed 1/60s simulation tick, not once per drawn frame.
    const spec=this.spec;
    this.shiftTimer=Math.max(0,this.shiftTimer-dt);
    const forwardSpeed=this.getForwardVelocity();
    const absSpeed=Math.abs(forwardSpeed);
    const vehicleSpeed=this.chassis.velocity.length();
    this.speedKmh=vehicleSpeed*3.6;
    const targetSteer=-clamp(controls.steer||0,-1,1)*
      (0.52/(1+absSpeed*.023));
    this.steering=THREE.MathUtils.damp(this.steering,targetSteer,7,dt);
    const [left,right]=ackermannAngles(this.steering,spec.wheelbaseM,spec.trackM);
    this.vehicle.setSteeringValue(left,0);
    this.vehicle.setSteeringValue(right,1);
    // Animated steering wheel uses the exact front axle command.
    if(this.steeringWheel)this.steeringWheel.rotation.z=-this.steering*2.6;

    const pedal=clamp(controls.accelerate||0,0,1);
    this.throttleSmooth=THREE.MathUtils.damp(this.throttleSmooth,pedal,5,dt);
    const brake=clamp(controls.brake||0,0,1);
    let braking=0;
    let direction=this.manual ? (this.gear<0?-1:this.gear===0?0:1) : (this.reverse?-1:1);
    if(!this.manual){
      if(brake>.05&&forwardSpeed<1.0&&pedal<.05){this.reverse=true;direction=-1;}
      if(pedal>.05&&forwardSpeed>-0.8){this.reverse=false;direction=1;}
      // On automatic cars S is brake while moving forward; reverses from a stop.
      braking=brake*(forwardSpeed>1.2||direction===1?1:0);
      if(direction<0)braking=pedal>0&&forwardSpeed<-.8?pedal:0;
    } else {
      braking=brake;
    }

    // Surface is sampled independently below the four suspension contact points.
    const rightVec=this.chassis.quaternion.vmult(new CANNON.Vec3(1,0,0));
    const lateralVelocity=this.chassis.velocity.dot(rightVec);
    // Cannon RaycastVehicle applies negative engine force for forward drive,
    // so actual forward motion is local -Z; invert its signed velocity before
    // calculating longitudinal load transfer.
    const longAccel=clamp((this.prevForwardSpeed-forwardSpeed)/Math.max(dt,.001),-18,18);
    const lateralAccel=clamp((lateralVelocity-this.prevLateralSpeed)/Math.max(dt,.001),-16,16);
    this.prevForwardSpeed=forwardSpeed;this.prevLateralSpeed=lateralVelocity;
    this.longAcceleration=THREE.MathUtils.damp(this.longAcceleration,longAccel,6,dt);
    this.lateralAcceleration=THREE.MathUtils.damp(this.lateralAcceleration,lateralAccel,6,dt);
    this.contactLoads=axleLoadTransfers(spec,this.longAcceleration,this.lateralAcceleration);
    const wheelSurface=[],gripFactors=[],slips=[];
    let averageGrip=0,contactCount=0,rolling=0;
    for(let i=0;i<4;i++) {
      const wheel=this.vehicle.wheelInfos[i];
      const hit=wheel.raycastResult;
      const local=wheel.chassisConnectionPointLocal;
      const rotated=this.chassis.quaternion.vmult(local);
      const pos=hit?.hasHit ? hit.hitPointWorld : this.chassis.position.vadd(rotated);
      const surface=typeof surfaceQuery==='function' ?
        surfaceQuery(pos.x,pos.z)?.surface||'grass' : (surfaceQuery==='rain'?'wet':surfaceQuery);
      const grip=tyreGrip(surface,this.tyreCompound);
      wheelSurface.push(surface);gripFactors.push(grip);
      averageGrip+=grip.longitudinal;
      rolling+=grip.rolling;
      if(hit?.hasHit)contactCount++;
      // Cannon RaycastVehicle updates wheel angular velocity inside its physics
      // callback; this slip is feedback for next tick's ABS/TCS decisions.
      const rollingMS=Math.abs(wheel.deltaRotation||0)*spec.wheelRadiusM/dt*Math.sign(forwardSpeed||1);
      // Slip angle is measured at the actual wheel contact, including yaw
      // velocity; using chassis-centre velocity made front/rear tyres behave
      // unrealistically alike during fast turns.
      const angular=this.chassis.angularVelocity;
      const yawX=angular.y*rotated.z-angular.z*rotated.y;
      const yawY=angular.z*rotated.x-angular.x*rotated.z;
      const yawZ=angular.x*rotated.y-angular.y*rotated.x;
      const contactLateral=lateralVelocity+
        yawX*rightVec.x+yawY*rightVec.y+yawZ*rightVec.z;
      const slip=contactSlip(forwardSpeed,rollingMS,contactLateral);
      slips.push(slip);
      const combined=combinedSlipFactor(slip.longitudinal,slip.lateral);
      const requested=4.6*grip.lateral*this.contactLoads[i]*combined;
      wheel.frictionSlip=THREE.MathUtils.damp(wheel.frictionSlip,requested,8,dt);
    }
    averageGrip/=4;
    rolling/=4;
    // The state-dependent, progressively saturating tyre curve is reported to
    // diagnostics while the Cannon raycast solver applies lateral contact force.
    const driven=spec.drivetrain==='FWD'?[0,1]:
      spec.drivetrain==='AWD'?[0,1,2,3]:[2,3];
    const drivenSlip=driven.reduce((n,i)=>n+Math.max(0,slips[i].longitudinal),0)/driven.length;
    const reduction=tractionAssist(1,drivenSlip,this.assists.tcs&&vehicleSpeed>2);
    let throttle=(!this.manual&&direction<0&&brake>.05 ? brake*.6 : this.throttleSmooth)*reduction;
    // Do not transmit drive torque while selecting a gear or clutch is open.
    const clutch=clamp(controls.clutch===undefined?1:1-controls.clutch,0,1);
    this.clutchEngagement=THREE.MathUtils.damp(this.clutchEngagement,
      this.shiftTimer>0?0:clutch,15,dt);

    let ratio=this.manual ? (this.gear===-1?-spec.reverseRatio:
      this.gear===0?0:spec.gearRatios[this.gear-1]) :
      (direction<0?-spec.reverseRatio:spec.gearRatios[this.gear-1]);
    ratio=Number.isFinite(ratio)?ratio:0;
    const wheelRpm=absSpeed*60/(2*Math.PI*spec.wheelRadiusM);
    const targetRpm=Math.abs(ratio)>0&&this.clutchEngagement>.2 ?
      spec.idleRpm+wheelRpm*Math.abs(ratio)*spec.finalDrive :
      spec.idleRpm+throttle*3400;
    this.rpm=THREE.MathUtils.damp(this.rpm,
      clamp(targetRpm,spec.idleRpm,spec.redlineRpm),10,dt);

    if(!this.manual&&!this.reverse&&this.shiftTimer===0){
      if(this.rpm>6100&&this.gear<spec.gearRatios.length){
        this.gear++;this.shiftTimer=spec.shiftTimeS;ratio=0;
      } else if(this.rpm<1800&&this.gear>1) {
        this.gear--;this.shiftTimer=spec.shiftTimeS;ratio=0;
      }
    }
    const torque=torqueAtRpm(this.rpm,spec);
    const maxTraction=spec.massKg*9.81*averageGrip*(spec.drivetrain==='AWD'?.91:.55);
    const wheelForce=Math.min(maxTraction,
      throttle*torque*Math.abs(ratio)*spec.finalDrive*spec.drivetrainEfficiency/
      spec.wheelRadiusM)*this.clutchEngagement;
    const forceDirection=ratio<0 ? 1 : -1;
    const atLimiter=spec.maxSpeedKmh&&this.speedKmh>=spec.maxSpeedKmh-.5;
    const force=(this.rpm>=spec.redlineRpm&&throttle>.01)||atLimiter?0:
      forceDirection*wheelForce/driven.length;
    for(let i=0;i<4;i++){
      const grip=gripFactors[i];
      this.vehicle.applyEngineForce(driven.includes(i)?force:0,i);
      let b=braking * (i<2?spec.brakeTorqueFrontNm:spec.brakeTorqueRearNm);
      if(!this.manual&&direction<0&&pedal>.05)b+=pedal*1600;
      const wheelSlip=slips[i].longitudinal;
      b*=brakingAssist(1,wheelSlip,this.assists.abs&&vehicleSpeed>4);
      if(controls.handbrake&&i>=2)b+=3900;
      // ESC resists large yaw excursions with restrained one-wheel braking.
      if(this.assists.esc&&vehicleSpeed>9){
        const desiredYaw=forwardSpeed*Math.tan(this.steering)/spec.wheelbaseM;
        const yawError=this.chassis.angularVelocity.y-desiredYaw;
        if(Math.abs(yawError)>.6&&Math.sign(yawError)===Math.sign(i%2===0?1:-1))
          b+=Math.min(700,(Math.abs(yawError)-.6)*250);
      }
      this.vehicle.setBrake(b,i);
    }
    // Anti-roll bars transmit force from compressed to extended suspension
    // at the front and rear. This acts on the Cannon rigid body, not the camera.
    for(const [leftIndex,rightIndex,axleZ] of [[0,1,1.37],[2,3,-1.39]]){
      const l=this.vehicle.wheelInfos[leftIndex],r=this.vehicle.wheelInfos[rightIndex];
      if(!l.raycastResult?.hasHit||!r.raycastResult?.hasHit)continue;
      const roll=clamp((l.suspensionLength-r.suspensionLength)*
        -spec.antiRollStiffness,-1600,1600);
      this.chassis.applyLocalForce(new CANNON.Vec3(0,roll,0),
        new CANNON.Vec3(-spec.trackM/2,-.18,axleZ));
      this.chassis.applyLocalForce(new CANNON.Vec3(0,-roll,0),
        new CANNON.Vec3(spec.trackM/2,-.18,axleZ));
    }
    // Newtonian aerodynamic drag and rolling resistance, independent of fps.
    if(vehicleSpeed>.15){
      const drag=aerodynamicDrag(vehicleSpeed,spec);
      const resist=spec.massKg*9.81*spec.rollingResistance*rolling;
      this.chassis.applyForce(this.chassis.velocity.scale(-(drag+resist)/vehicleSpeed),
        new CANNON.Vec3(0,0,0));
    }
    const downforce=spec.downforceCoefficient*vehicleSpeed*vehicleSpeed;
    this.chassis.applyForce(new CANNON.Vec3(0,-downforce,0),new CANNON.Vec3(0,0,0));
    // Homologated electronic limit applies to rigid-body velocity too.
    if(spec.maxSpeedKmh&&this.chassis.velocity.length()>spec.maxSpeedKmh/3.6){
      const factor=(spec.maxSpeedKmh/3.6)/this.chassis.velocity.length();
      this.chassis.velocity.scale(factor,this.chassis.velocity);
    }
    this.brakeActive=braking>.08||Boolean(controls.handbrake);
    const mostCommon=wheelSurface.reduce((best,item,_,all)=>
      all.filter(x=>x===item).length>all.filter(x=>x===best).length?item:best,'grass');
    this.lastDiagnostics={
      surface:mostCommon,grip:Number(averageGrip.toFixed(2)),
      slip:Number(drivenSlip.toFixed(3)),wheelContact:contactCount,
      enginePowerKW:Math.round(torque*this.rpm*2*Math.PI/60000),
      driveForceN:Math.round(wheelForce),
      tractionIntervention:Number((1-reduction).toFixed(2)),
      suspension:this.vehicle.wheelInfos.map(w=>Number(w.suspensionLength.toFixed(3))),
      wheelSlip:slips.map(w=>Number(w.longitudinal.toFixed(3))),
      lateralSlip:slips.map(w=>Number(normalizedTyreForce(w.lateral).toFixed(3))),
      longitudinalAcceleration:Number(this.longAcceleration.toFixed(2)),
      lateralAcceleration:Number(this.lateralAcceleration.toFixed(2)),
      wheelLoads:this.contactLoads.map(w=>Number(w.toFixed(2)))
    };
  }

  updateVisuals(night = false) {
    this.model.position.set(this.chassis.position.x, this.chassis.position.y, this.chassis.position.z);
    this.model.quaternion.set(
      this.chassis.quaternion.x, this.chassis.quaternion.y,
      this.chassis.quaternion.z, this.chassis.quaternion.w
    );
    for (let i = 0; i < 4; i++) {
      this.vehicle.updateWheelTransform(i);
      const trans = this.vehicle.wheelInfos[i].worldTransform;
      this.wheelModels[i].position.set(trans.position.x, trans.position.y, trans.position.z);
      this.wheelModels[i].quaternion.set(
        trans.quaternion.x, trans.quaternion.y, trans.quaternion.z, trans.quaternion.w
      );
    }
    if (this.contactShadow) {
      const wheels=this.vehicle.wheelInfos.map(w=>w.worldTransform.position.y-WHEEL_RADIUS);
      const wheelFloor=Math.min(...wheels);
      const height=Math.max(-100,Math.min(300,wheelFloor+.025));
      this.contactShadow.position.set(this.chassis.position.x,height,this.chassis.position.z);
      const fwd=new THREE.Vector3(0,0,1).applyQuaternion(this.model.quaternion);
      this.contactShadow.rotation.y=Math.atan2(fwd.x,fwd.z);
    }
    for (const light of this.headlights) light.intensity = night ? 55 : 0;
    if(this.dashLight)this.dashLight.intensity=night?.75:.11;
    this.brakeMaterial.emissiveIntensity = this.brakeActive ? 2.6 : (night ? 0.58 : 0.14);
    const blinking = Math.floor(performance.now() / 480) % 2 === 0;
    for (const entry of this.indicatorMaterials) {
      entry.material.emissiveIntensity =
        blinking && entry.side === this.indicatorSide ? 2.9 : 0.03;
    }
    this.drawInstruments();
    for (const material of this.importedLights.brakes) {
      if (material.emissiveIntensity !== undefined)
        material.emissiveIntensity = this.brakeActive ? 3 : (night ? 0.6 : 0.15);
    }
    for (const material of this.importedLights.indicators) {
      if (material.emissiveIntensity !== undefined)
        material.emissiveIntensity = this.indicatorSide && blinking ? 1.7 : 0.07;
    }
  }

  getPosition() {
    return this.model.position;
  }

  getGearLabel() {
    return this.reverse || this.gear===-1 ? 'R' : this.gear===0 ? 'N' : String(this.gear);
  }

  getTelemetry() {
    return {
      model:this.specId,maxSpeedKmh:this.spec.maxSpeedKmh||null,
      speed: Math.round(this.speedKmh),
      rpm: Math.round(this.rpm),
      gear: this.getGearLabel(),
      gearbox: this.manual ? 'MANUAL' : 'AUTO',
      ...this.lastDiagnostics
    };
  }

  dispose() {
    this.vehicle.removeFromWorld(this.physics);
    this.scene.remove(this.model);
    if(this.contactShadow){
      this.scene.remove(this.contactShadow);
      this.contactShadow.geometry.dispose();
      this.contactShadow.material.map?.dispose();
      this.contactShadow.material.dispose();
    }
    for (const wheel of this.wheelModels) this.scene.remove(wheel);
  }
}
