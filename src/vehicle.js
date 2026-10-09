import * as THREE from 'three';
import * as CANNON from 'cannon-es';

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
    this.mass = 1370;
    this.chassis = new CANNON.Body({
      mass: this.mass,
      material: new CANNON.Material('chassis'),
      angularDamping: 0.42,
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
          ...options, chassisConnectionPointLocal: new CANNON.Vec3(x, -0.18, z)
        });
      }
    }
    this.vehicle.addToWorld(this.physics);
    this.buildModel();
    this.reset();
  }

  buildModel() {
    const root = this.model = new THREE.Group();
    const navy = painted(0x273f54, 0.66, 0.24);
    const dark = painted(0x101820, 0.22, 0.45);
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x233e51, metalness: 0.06, roughness: 0.11,
      transparent: true, opacity: 0.82, clearcoat: 1, clearcoatRoughness: 0.08
    });
    const red = new THREE.MeshStandardMaterial({
      color: 0xb91924, emissive: 0x7b0d11, emissiveIntensity: 0.6
    });
    const led = new THREE.MeshStandardMaterial({
      color: 0xf9f1d8, emissive: 0xffecc5, emissiveIntensity: 1.1
    });
    box(root, [1.91, 0.47, 4.25], 0x273f54, [0, 0.09, 0], navy);
    box(root, [1.72, 0.16, 1.45], 0x273f54, [0, 0.34, 1.31], navy);
    box(root, [1.56, 0.57, 1.88], 0x273f54, [0, 0.68, -0.34], navy);
    box(root, [1.64, 0.11, 1.95], 0x273f54, [0, 1.02, -0.34], navy);
    box(root, [1.55, 0.48, 0.08], 0x233e51, [0, 0.72, 0.63], glass);
    box(root, [1.50, 0.40, 0.07], 0x233e51, [0, 0.70, -1.28], glass);
    for (const side of [-1, 1]) {
      box(root, [0.07, 0.39, 1.4], 0x233e51, [side * 0.8, 0.70, -0.34], glass);
      box(root, [0.24, 0.12, 0.26], 0x273f54, [side * 1.02, 0.62, 0.43], navy);
      box(root, [0.5, 0.12, 0.18], 0xfff9e9, [side * 0.60, 0.19, 2.17], led);
      box(root, [0.52, 0.13, 0.12], 0xba1020, [side * 0.64, 0.18, -2.15], red);
    }
    box(root, [1.88, 0.14, 0.17], 0x101820, [0, -0.14, 2.13], dark);
    box(root, [1.88, 0.14, 0.18], 0x101820, [0, -0.14, -2.13], dark);
    box(root, [1.4, 0.1, 0.08], 0x16212b, [0, 0.25, 1.99], dark);
    const cockpit = new THREE.Group();
    box(cockpit, [1.47, 0.19, 0.65], 0x171d22, [0, 0.37, 0.39], dark);
    for (const side of [-1, 1]) {
      box(cockpit, [0.5, 0.28, 0.52], 0x181d22, [side * 0.39, 0.29, -0.61], dark);
    }
    const wheel = part(cockpit, new THREE.TorusGeometry(0.21, 0.035, 8, 20),
      dark, [-0.37, 0.54, 0.19]);
    wheel.rotation.x = 0.6;
    root.add(cockpit);
    this.scene.add(root);

    this.wheelModels = [];
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
      hub.rotation.z = Math.PI / 2;
      pivot.castShadow = true;
      this.scene.add(pivot);
      this.wheelModels.push(pivot);
    }
    this.headlights = [];
    for (const side of [-1, 1]) {
      const light = new THREE.SpotLight(0xfff3d8, 0, 45, Math.PI / 6, 0.55, 1.4);
      light.position.set(side * 0.63, 0.22, 2.13);
      light.target.position.set(side * 0.63, -0.45, 18);
      root.add(light, light.target);
      this.headlights.push(light);
    }
    this.updateVisuals();
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
    this.rpm = 850;
    this.updateVisuals();
  }

  shift(delta) {
    if (!this.manual) return;
    this.gear = clamp(this.gear + delta, 1, GEAR_RATIOS.length);
  }

  getForwardVelocity() {
    const forward = this.chassis.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
    return this.chassis.velocity.dot(forward);
  }

  updatePhysics(dt, controls, surface = 'clear') {
    const forwardSpeed = this.getForwardVelocity();
    const absSpeed = Math.abs(forwardSpeed);
    const vehicleSpeed = this.chassis.velocity.length();
    this.speedKmh = vehicleSpeed * 3.6;
    const steeringLimit = 0.52 / (1 + absSpeed * 0.038);
    this.steering = THREE.MathUtils.damp(this.steering,
      -controls.steer * steeringLimit, 8, dt);
    this.vehicle.setSteeringValue(this.steering, 0);
    this.vehicle.setSteeringValue(this.steering, 1);
    const targetThrottle = controls.accelerate || 0;
    this.throttleSmooth = THREE.MathUtils.damp(this.throttleSmooth, targetThrottle, 5, dt);

    let braking = 0;
    let throttle = this.throttleSmooth;
    if ((controls.brake || 0) > 0) {
      if (forwardSpeed > 1.4) {
        braking = controls.brake;
      } else if (forwardSpeed < -1.4 && targetThrottle > 0) {
        braking = targetThrottle;
        throttle = 0;
      } else if (targetThrottle < 0.01) {
        this.reverse = true;
        throttle = -controls.brake * 0.48;
      }
    } else if (targetThrottle > 0) {
      if (forwardSpeed < -1.4) {
        braking = targetThrottle;
        throttle = 0;
      } else {
        this.reverse = false;
      }
    } else if (Math.abs(forwardSpeed) < 0.5) {
      this.reverse = false;
    }

    if (!this.manual && !this.reverse) {
      const revs = 850 + absSpeed * 60 / (2 * Math.PI * WHEEL_RADIUS) *
        FINAL_DRIVE * GEAR_RATIOS[this.gear - 1];
      if (revs > 6100 && this.gear < GEAR_RATIOS.length) this.gear++;
      if (revs < 1900 && this.gear > 1) this.gear--;
    }
    const ratio = this.reverse ? 3.2 : GEAR_RATIOS[this.gear - 1];
    const wheelRpm = absSpeed * 60 / (2 * Math.PI * WHEEL_RADIUS);
    const calculatedRpm = 850 + wheelRpm * ratio * FINAL_DRIVE;
    this.rpm = clamp(calculatedRpm + Math.abs(throttle) * 220, 850, RPM_LIMIT);
    const normalizedRpm = this.rpm / RPM_LIMIT;
    const torqueCurve = normalizedRpm < 0.2 ? 0.65 + normalizedRpm * 1.2 :
      normalizedRpm < 0.65 ? 0.89 + (normalizedRpm - 0.2) * 0.18 :
      Math.max(0.54, 0.97 - (normalizedRpm - 0.65) * 1.2);
    const wheelForce = Math.abs(throttle) * 345 * torqueCurve *
      ratio * FINAL_DRIVE / WHEEL_RADIUS * 0.46;
    const engineForce = this.rpm >= RPM_LIMIT && throttle > 0 ? 0 :
      -Math.sign(throttle) * wheelForce;
    const grip = surface === 'rain' ? 0.71 : 1;
    for (let i = 0; i < 4; i++) {
      this.vehicle.wheelInfos[i].frictionSlip = 4.6 * grip;
      this.vehicle.applyEngineForce(i >= 2 ? engineForce / 2 : 0, i);
      this.vehicle.setBrake((braking * 3000 + (controls.handbrake && i >= 2 ? 4500 : 0)), i);
    }
    // Quadratic air drag plus rolling resistance, independent of driving input.
    if (vehicleSpeed > 0.15) {
      const totalResist = 0.39 * vehicleSpeed * vehicleSpeed + 145;
      const direction = this.chassis.velocity.scale(-totalResist / vehicleSpeed);
      this.chassis.applyForce(direction, new CANNON.Vec3(0, 0, 0));
    }
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
    for (const light of this.headlights) light.intensity = night ? 17 : 0;
  }

  getPosition() {
    return this.model.position;
  }

  getGearLabel() {
    return this.reverse ? 'R' : String(this.gear);
  }

  getTelemetry() {
    return {
      speed: Math.round(this.speedKmh),
      rpm: Math.round(this.rpm),
      gear: this.getGearLabel(),
      gearbox: this.manual ? 'MANUAL' : 'AUTO'
    };
  }

  dispose() {
    this.vehicle.removeFromWorld(this.physics);
    this.scene.remove(this.model);
    for (const wheel of this.wheelModels) this.scene.remove(wheel);
  }
}
