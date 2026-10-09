import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createAsphaltMaterial, createGravelMaterial, createTerrainMaterial } from './materials.js';
import { WorldDetails } from './world-details.js';
import { RoadNetwork } from './road-network.js';
import { WorldSectors } from './world-sectors.js';
import { DrivingTestArea } from './driving-test-area.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

function seeded(seed = 127) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(1664525, value) + 1013904223) >>> 0) / 4294967296);
}
const random = seeded(20261009);

export function groundHeight(x, z) {
  const distant = Math.max(0, (Math.hypot(x, z) - 350) / 570);
  const rolling = 1.7 * Math.sin(x * 0.012) * Math.cos(z * 0.008) +
    0.9 * Math.sin((x + z) * 0.022);
  const mountains = Math.pow(distant, 1.8) * (
    24 + 12 * Math.sin(x * 0.012) * Math.cos(z * 0.018)
  );
  return rolling + mountains;
}

function material(color, roughness = 0.85, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function meshCollider(world, geometry, frictionMaterial) {
  const positions = geometry.getAttribute('position').array;
  const indices = geometry.index.array;
  const vertices = Array.from(positions);
  const faces = Array.from(indices);
  const body = new CANNON.Body({ mass: 0, material: frictionMaterial });
  body.addShape(new CANNON.Trimesh(vertices, faces));
  world.addBody(body);
  return body;
}
function groupBox(parent, x, y, z, width, height, depth, color, metalness = 0) {
  const obj = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color, 0.8, metalness));
  obj.position.set(x, y + height / 2, z);
  obj.castShadow = true;
  obj.receiveShadow = true;
  parent.add(obj);
  return obj;
}

export class DrivingWorld {
  constructor(scene, physics, quality = 'high') {
    this.scene = scene;
    this.physics = physics;
    this.quality = quality;
    this.hour = 14;
    this.weather = 'clear';
    this.sunSpeed = 1.2; // simulated hours per real minute: full 24h cycle in ~20 real minutes
    this.roadWidth = 13.5;
    this.terrainMaterial = new CANNON.Material('ground');
    this.asphaltMaterial = new CANNON.Material('asphalt');
    this.roadPoints = [];
    this.rain = null;
    this.stars = null;
    this.streetLights = [];
    this.buildSun();
    this.buildTerrain();
    this.buildRoad();
    this.network = new RoadNetwork(this.scene,this.physics,groundHeight,
      this.roadPoints,this.roadWidth,this.quality);
    this.buildRoadside();
    this.testArea=new DrivingTestArea(this.scene,this.physics,this.network,groundHeight);
    this.buildScenery();
    this.buildStreetLights();
    this.sectors=new WorldSectors(this.scene,this.physics,this.network,groundHeight);
    this.details = new WorldDetails(this.scene, this.roadPoints, this.roadWidth,
      groundHeight, this.quality, this.vegetation);
    this.buildRain();
    this.updateAtmosphere();
  }

  buildSun() {
    this.scene.background = new THREE.Color(0xa5cbdc);
    this.scene.fog = new THREE.FogExp2(0xa7c2c5, 0.0009);
    this.ambient = new THREE.HemisphereLight(0xd8efff, 0x626e4c, 1.35);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffedd0, 2.65);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -175;
    this.sun.shadow.camera.right = 175;
    this.sun.shadow.camera.top = 175;
    this.sun.shadow.camera.bottom = -175;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 800;
    this.sun.shadow.bias = -0.00008;
    this.sun.shadow.normalBias = 0.045;
    this.sun.shadow.radius = 2.2;
    this.scene.add(this.sun, this.sun.target);
    const rnd = seeded(8999);
    const positions = [];
    for (let i = 0; i < 650; i++) {
      const phi = Math.acos(2 * rnd() - 1);
      const theta = rnd() * TAU;
      const r = 650;
      if (Math.cos(phi) > -0.03) {
        positions.push(r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      }
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
      color: 0xf3f7ff, size: 1.3, sizeAttenuation: false, depthWrite: false
    }));
    this.stars.visible = false;
    this.scene.add(this.stars);
  }

  buildTerrain() {
    const subdivisions = this.quality === 'ultra' ? 196 : this.quality === 'high' ? 150 : 118;
    const geometry = new THREE.PlaneGeometry(2000, 2000, subdivisions, subdivisions);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute('position');
    const colors = [];
    const low = new THREE.Color(0x596c46);
    const high = new THREE.Color(0x9f9d78);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      const h = groundHeight(x, z);
      positions.setY(i, h);
      const mix = THREE.MathUtils.clamp((h + 2) / 38, 0, 1);
      const grain = 0.93 + 0.11 * Math.sin(i * 7.3);
      const color = low.clone().lerp(high, mix).multiplyScalar(grain);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const surface = new THREE.Mesh(geometry, createTerrainMaterial());
    surface.receiveShadow = true;
    this.scene.add(surface);
    meshCollider(this.physics, geometry, this.terrainMaterial);
  }

  buildRoad() {
    const controls = [
      [-115, -250], [-352, -200], [-438, 10], [-270, 265],
      [35, 350], [330, 235], [420, -25], [245, -295]
    ];
    const curve = new THREE.CatmullRomCurve3(
      controls.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true, 'centripetal', 0.4
    );
    const sampleCount = 420;
    const positions = [], normals = [], uvs = [], indices = [];
    for (let i = 0; i <= sampleCount; i++) {
      const u = i / sampleCount;
      const center = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u).normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
      const left = center.clone().addScaledVector(side, this.roadWidth / 2);
      const right = center.clone().addScaledVector(side, -this.roadWidth / 2);
      left.y = groundHeight(left.x, left.z) + 0.19;
      right.y = groundHeight(right.x, right.z) + 0.19;
      const roadCenter = left.clone().add(right).multiplyScalar(0.5);
      this.roadPoints.push({ center: roadCenter, tangent, side, left, right });
      for (const point of [left, right]) {
        positions.push(point.x, point.y, point.z);
        normals.push(0, 1, 0);
      }
      uvs.push(0, u * 180, 1, u * 180);
      if (i !== sampleCount) {
        const j = i * 2;
        indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
      }
    }
    const roadGeometry = new THREE.BufferGeometry();
    roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    roadGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeometry.setIndex(indices);
    roadGeometry.computeVertexNormals();
    this.roadMaterial = createAsphaltMaterial(this.quality);
    const roadMesh = new THREE.Mesh(roadGeometry, this.roadMaterial);
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);
    meshCollider(this.physics, roadGeometry, this.asphaltMaterial);

    const stripeGeo = new THREE.BoxGeometry(0.16, 0.027, 3.5);
    const lineGeo = new THREE.BoxGeometry(0.13, 0.027, 7);
    const dashed = new THREE.InstancedMesh(stripeGeo, material(0xeed9a9, 0.95), 75);
    const solid = new THREE.InstancedMesh(lineGeo, material(0xcfd4d0, 0.95), 2 * sampleCount);
    const holder = new THREE.Object3D();
    let d = 0, s = 0;
    for (let i = 0; i < sampleCount; i++) {
      const point = this.roadPoints[i];
      const next = this.roadPoints[i + 1];
      const distance = point.center.distanceTo(next.center);
      const yaw = Math.atan2(point.tangent.x, point.tangent.z);
      if (i % 6 === 0 && d < 75) {
        holder.position.copy(point.center);
        holder.position.y += 0.055;
        holder.rotation.set(0, yaw, 0);
        holder.scale.set(1, 1, 1);
        holder.updateMatrix();
        dashed.setMatrixAt(d++, holder.matrix);
      }
      for (const lateral of [-this.roadWidth / 2 + 0.46, this.roadWidth / 2 - 0.46]) {
        holder.position.copy(point.center).addScaledVector(point.side, lateral);
        holder.position.y = groundHeight(holder.position.x, holder.position.z) + 0.23;
        holder.rotation.set(0, yaw, 0);
        holder.scale.set(1, 1, Math.max(0.1, distance / 7 + 0.025));
        holder.updateMatrix();
        solid.setMatrixAt(s++, holder.matrix);
      }
    }
    dashed.count = d;
    solid.count = s;
    dashed.instanceMatrix.needsUpdate = true;
    solid.instanceMatrix.needsUpdate = true;
    dashed.receiveShadow = solid.receiveShadow = true;
    this.scene.add(dashed, solid);
    this.spawn = this.roadPoints[5];
  }

  buildRoadside() {
    // Curved gravel shoulders hug the terrain beside the road.
    for (const direction of [-1, 1]) {
      const vertices = [], uv = [], indices = [];
      for (let i = 0; i < this.roadPoints.length; i++) {
        const edge = this.roadPoints[i];
        const inside = edge.center.clone().addScaledVector(edge.side,
          direction * (this.roadWidth / 2 + 0.03));
        const outside = edge.center.clone().addScaledVector(edge.side,
          direction * (this.roadWidth / 2 + 2.2));
        inside.y = groundHeight(inside.x, inside.z) + 0.13;
        outside.y = groundHeight(outside.x, outside.z) + 0.045;
        vertices.push(inside.x, inside.y, inside.z, outside.x, outside.y, outside.z);
        uv.push(0, i * 0.5, 1, i * 0.5);
        if (i < this.roadPoints.length - 1) {
          const j = i * 2;
          indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const shoulder = new THREE.Mesh(geometry, createGravelMaterial());
      shoulder.material.side = THREE.DoubleSide;
      shoulder.receiveShadow = true;
      this.scene.add(shoulder);
    }
  }

  buildStreetLights() {
    const post = new THREE.CylinderGeometry(0.11, 0.16, 7, 8);
    const arm = new THREE.CylinderGeometry(0.07, 0.07, 2.1, 8);
    const poleMaterial = material(0x5d6770, 0.49, 0.7);
    this.bulbMaterial = new THREE.MeshStandardMaterial({
      color: 0xffeac8, emissive: 0xffd9a4, emissiveIntensity: 0.1
    });
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 5; i < this.roadPoints.length; i += 18) {
      const road = this.roadPoints[i];
      const side = road.side.clone().multiplyScalar(i % 2 === 0 ? 1 : -1);
      const location = road.center.clone().addScaledVector(side, 10);
      location.y = groundHeight(location.x, location.z);
      const upright = new THREE.Mesh(post, poleMaterial);
      upright.position.copy(location).add(new THREE.Vector3(0, 3.5, 0));
      upright.castShadow = true;
      this.scene.add(upright);
      const lampPos = location.clone().add(new THREE.Vector3(0, 6.86, 0))
        .addScaledVector(side, -1.92);
      const crossbar = new THREE.Mesh(arm, poleMaterial);
      crossbar.position.copy(location).add(new THREE.Vector3(0, 6.86, 0))
        .addScaledVector(side, -0.96);
      crossbar.quaternion.setFromUnitVectors(up, side.clone().negate());
      crossbar.castShadow = true;
      this.scene.add(crossbar);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.15, 0.55),
        this.bulbMaterial);
      bulb.position.copy(lampPos);
      this.scene.add(bulb);
      const light = new THREE.PointLight(0xffddb0, 0, 27, 2);
      light.position.copy(lampPos);
      light.castShadow = false;
      this.scene.add(light);
      this.streetLights.push(light);
    }
  }

  distanceToRoad(x, z) {
    let minSq = Infinity;
    for (let i = 0; i < this.roadPoints.length; i += 7) {
      const p = this.roadPoints[i].center;
      const dist = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (dist < minSq) minSq = dist;
    }
    return Math.sqrt(minSq);
  }

  buildScenery() {
    const treeCount = this.quality === 'low' ? 230 : this.quality === 'medium' ? 420 : 680;
    // Three independent foliage volumes per tree replace the old single cone.
    // Instancing keeps the number of draw calls low even with hundreds of trees.
    const clusters = 3;
    const leaves = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(2.35, this.quality === 'low' ? 0 : 1),
      new THREE.MeshStandardMaterial({ color: 0x879b77, roughness: 0.96, metalness: 0 }),
      treeCount * clusters
    );
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.3, 0.46, 4.7, 8),
      material(0x51412f), treeCount
    );
    // Distinct species: approximately 20% conifers, the rest broadleaf trees.
    const conifers = new THREE.InstancedMesh(
      new THREE.ConeGeometry(2.65, 8.7, 9, 3),
      new THREE.MeshStandardMaterial({color:0x345b39,roughness:.99}),
      treeCount
    );
    let pineCount = 0;
    const dummy = new THREE.Object3D();
    const shades = [0x3c613a, 0x547747, 0x6d854a, 0x324d35, 0x526946]
      .map(x => new THREE.Color(x));
    let planted = 0, leafCount = 0;
    for (let i = 0; i < treeCount * 5 && planted < treeCount; i++) {
      const x = (random() - 0.5) * 1650, z = (random() - 0.5) * 1650;
      if (this.distanceToRoad(x, z) < 20) continue;
      if (x > 40 && x < 270 && z > -80 && z < 210) continue;
      const h = groundHeight(x, z);
      const size = 0.7 + random() * 0.95;
      dummy.position.set(x, h + 2.35 * size, z);
      dummy.rotation.set(0, random() * TAU, 0);
      dummy.scale.set(size, size, size);
      dummy.updateMatrix();
      trunks.setMatrixAt(planted, dummy.matrix);
      const type = Math.floor(random() * shades.length);
      if(type===0) {
        dummy.position.set(x, h + 6.25 * size, z);
        dummy.rotation.set(0, random()*TAU, 0);
        dummy.scale.set(size*.82,size,size*.82);
        dummy.updateMatrix();
        conifers.setMatrixAt(pineCount, dummy.matrix);
        conifers.setColorAt(pineCount,
          new THREE.Color(random()>.5?0x476944:0x2e543b));
        pineCount++;
      } else for (let k = 0; k < clusters; k++) {
        const theta = k * TAU / clusters + random() * 0.7;
        const radial = k === 2 ? 0.4 : 1.25;
        dummy.position.set(
          x + Math.cos(theta) * radial * size,
          h + (5.5 + (k === 2 ? 2 : 0.2 * k)) * size,
          z + Math.sin(theta) * radial * size
        );
        dummy.rotation.set(random() * 0.4, random() * TAU, random() * 0.4);
        dummy.scale.set(size * (0.95 + random() * 0.35),
          size * (0.85 + random() * 0.3), size * (0.88 + random() * 0.3));
        dummy.updateMatrix();
        leaves.setMatrixAt(leafCount, dummy.matrix);
        leaves.setColorAt(leafCount, shades[(type + k) % shades.length]);
        leafCount++;
      }
      planted++;
    }
    trunks.count = planted;
    leaves.count = leafCount;
    conifers.count = pineCount;
    leaves.castShadow = this.quality !== 'low';
    leaves.receiveShadow = true;
    trunks.castShadow = this.quality === 'ultra';
    leaves.instanceMatrix.needsUpdate = true;
    leaves.instanceColor.needsUpdate = true;
    trunks.instanceMatrix.needsUpdate = true;
    conifers.instanceMatrix.needsUpdate = true;
    conifers.instanceColor.needsUpdate = true;
    conifers.castShadow = this.quality === 'ultra';
    conifers.receiveShadow = true;
    this.scene.add(leaves, trunks, conifers);
    this.vegetation = { leaves, trunks, conifers, leafCount, planted, pineCount };

    const colors = [0xc1b7a1, 0x949fa4, 0xc4bdb0, 0x827b74, 0xa4a99c];
    const glass = material(0x5a7e90, 0.22, 0.26);
    for (let i = 0; i < 48; i++) {
      const x = 65 + (i % 8) * 28 + random() * 9;
      const z = -70 + Math.floor(i / 8) * 42 + random() * 8;
      // Do not place buildings inside any of the connected urban roads.
      if (this.distanceToRoad(x, z) < 23 ||
          this.network.query(x,z).distance < 22) continue;
      const height = 9 + Math.floor(random() * 6) * 7;
      const width = 14 + random() * 8, depth = 15 + random() * 9;
      const baseY = groundHeight(x, z) - 0.12;
      groupBox(this.scene, x, baseY, z, width, height, depth, colors[i % colors.length]);
      for (let floor = 0; floor < Math.floor(height / 5); floor++) {
        const face = new THREE.Mesh(new THREE.BoxGeometry(width * 0.75, 2.5, 0.08), glass);
        face.position.set(x, baseY + 3.5 + floor * 5, z + depth / 2 + 0.06);
        this.scene.add(face);
      }
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2)));
      body.position.set(x, baseY + height / 2, z);
      this.physics.addBody(body);
    }

    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(2, 0),
      material(0x7b7b70), 140);
    let count = 0;
    for (let i = 0; i < 500 && count < 140; i++) {
      const x = (random() - 0.5) * 1800, z = (random() - 0.5) * 1800;
      if (this.distanceToRoad(x, z) < 16) continue;
      const size = 0.4 + random() * 2.4;
      dummy.position.set(x, groundHeight(x, z) + size * 0.15, z);
      dummy.rotation.set(random(), random() * TAU, random());
      dummy.scale.set(size, size * 0.6, size * 1.1);
      dummy.updateMatrix();
      rocks.setMatrixAt(count++, dummy.matrix);
    }
    rocks.count = count;
    rocks.instanceMatrix.needsUpdate = true;
    rocks.receiveShadow = true;
    this.scene.add(rocks);
  }

  setVegetationDensity(factor = 1) {
    if(!this.vegetation)return;
    const ratio=Math.max(.2,Math.min(1,Number(factor)||1));
    const v=this.vegetation;
    v.trunks.count=Math.max(1,Math.floor(v.planted*ratio));
    v.leaves.count=Math.max(1,Math.floor(v.leafCount*ratio));
    v.conifers.count=Math.max(1,Math.floor(v.pineCount*ratio));
    this.details?.setDensity(ratio);
  }

    buildRain() {
    const count = 1050;
    const coords = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      coords[i * 3] = (random() - 0.5) * 92;
      coords[i * 3 + 1] = random() * 38;
      coords[i * 3 + 2] = (random() - 0.5) * 92;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(coords, 3));
    this.rain = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0xc5e4f2, size: 0.12, opacity: 0.63, transparent: true,
      depthWrite: false, sizeAttenuation: true
    }));
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  surfaceAt(x,z) {
    return this.network.query(x,z,this.weather);
  }

    setWeather(weather) {
    if (!['clear', 'rain', 'fog'].includes(weather)) return;
    this.weather = weather;
    this.rain.visible = weather === 'rain';
    // Wetness now rises and dries gradually in update(), including puddles.
    // Avoid forcing instantaneous material changes when it starts raining.
    this.updateAtmosphere();
  }

  updateAtmosphere() {
    const angle = ((this.hour - 6) / 24) * TAU;
    const daylight = Math.max(0, Math.sin(angle));
    const twilight = THREE.MathUtils.smoothstep(daylight, 0.0, 0.25);
    const daylightColor = new THREE.Color(0xaccddd);
    const twilightColor = new THREE.Color(0xecae77);
    const nightColor = new THREE.Color(0x07111e);
    const sky = nightColor.clone().lerp(twilightColor, twilight)
      .lerp(daylightColor, THREE.MathUtils.smoothstep(daylight, 0.25, 0.7));
    if (this.weather === 'rain') sky.lerp(new THREE.Color(0x3a5262), 0.68);
    if (this.weather === 'fog') sky.lerp(new THREE.Color(0xa4aba9), 0.34);
    const atmosphericBlend = this.frameDt ? Math.min(1, this.frameDt * 2.6) : 0.05;
    this.scene.background.lerp(sky, atmosphericBlend);
    this.scene.fog.color.lerp(sky, atmosphericBlend);
    const density = this.weather === 'fog' ? 0.009 :
      this.weather === 'rain' ? 0.0023 : 0.0008;
    this.scene.fog.density = THREE.MathUtils.lerp(this.scene.fog.density, density, atmosphericBlend);
    this.sun.position.set(Math.cos(angle) * 180, Math.max(5, daylight * 200), Math.sin(angle) * 180);
    this.sun.intensity = 0.045 + daylight * (this.weather === 'rain' ? 1.0 : 2.65);
    this.ambient.intensity = 0.17 + daylight * (this.weather === 'rain' ? 0.55 : 1.1);
    this.ambient.color.set(daylight < 0.18 ? 0x829cbd : 0xd5e8ff);
    this.bulbMaterial.emissiveIntensity = daylight < 0.12 ? 1.9 : 0.06;
    this.sun.color.set(daylight < 0.4 ? 0xffc184 : 0xffefdd);
    this.stars.visible = daylight < 0.08 && this.weather === 'clear';
  }

  update(dt, vehiclePosition, paused = false) {
    this.frameDt = paused ? 0 : dt;
    if (!paused) {
      this.hour = (this.hour + dt * this.sunSpeed / 60) % 24;
      if (this.rain.visible) {
        const pos = this.rain.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          let y = pos.getY(i) - dt * 32;
          if (y < 0) y += 38;
          pos.setY(i, y);
        }
        pos.needsUpdate = true;
      }
    }
    const wetness = this.details?.update(dt, vehiclePosition, this.weather, this.hour, paused) || 0;
    if (this.roadMaterial) {
      this.roadMaterial.clearcoat = 0.08 + .82 * wetness;
      this.roadMaterial.clearcoatRoughness = .23 - .12 * wetness;
      this.roadMaterial.roughness = .97 - .47 * wetness;
      this.roadMaterial.color.setRGB(1 - .25 * wetness, 1 - .23 * wetness, 1 - .19 * wetness);
    }
    this.updateAtmosphere();
    if (vehiclePosition) {
      this.sectors.update(vehiclePosition,performance.now()/1000);
      this.rain.position.set(vehiclePosition.x, vehiclePosition.y - 3, vehiclePosition.z);
      this.stars.position.set(vehiclePosition.x, 0, vehiclePosition.z);
      this.sun.target.position.set(vehiclePosition.x, 0, vehiclePosition.z);
      this.sun.position.x = vehiclePosition.x + Math.cos((this.hour - 6) / 24 * TAU) * 180;
      this.sun.position.z = vehiclePosition.z + Math.sin((this.hour - 6) / 24 * TAU) * 180;
      this.sun.target.updateMatrixWorld();
      // Keep only a small number of nearby streetlights active.
      const nighttime = this.hour < 6.3 || this.hour > 18.9;
      for (const lamp of this.streetLights) {
        const dx = lamp.position.x - vehiclePosition.x;
        const dz = lamp.position.z - vehiclePosition.z;
        lamp.intensity = nighttime && dx * dx + dz * dz < 8100 ? 30 : 0;
      }
    }
  }
}
