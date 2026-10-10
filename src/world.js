import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createAsphaltMaterial, createGravelMaterial, createTerrainMaterial } from './materials.js';
import { WorldDetails } from './world-details.js';
import { RoadNetwork } from './road-network.js';
import {clipGeometryAtJunctions,trimRoadWearAtJunctions} from './road-junctions.js';
import { WorldSectors } from './world-sectors.js';
import {RoadsideClearance} from './roadside-clearance.js';
import { DrivingTestArea } from './driving-test-area.js';
import {createRoadBed,addRoadSides,addRoadWear,addRoadShoulders} from './road-upgrades.js';
import {RoadEnvironment} from './road-environments.js';
import {ForestSystem} from './forest-system.js';
import {RoadSignage} from './road-signage.js';
import {CinematicSky,evaluateAtmosphere,configureCinematicShadows} from './cinematic-lighting.js';
import {ModernRoadLighting} from './modern-road-lighting.js';
import {RegionalRailway} from './regional-railway.js';
import {WildGroundcover} from './wild-groundcover.js';
import {RainStreaks} from './atmosphere-effects.js';
import {createWeatheredRockGeometry,UrbanFacadeBatch,createWeatheredWallMaterial} from './natural-assets.js';

export const WORLD_SIZE=4100;
export const WORLD_HALF=WORLD_SIZE/2;
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
  // Ridged long-wavelength strata create believable variation across hills,
  // while all road/collision consumers still share this exact height function.
  const ridges = Math.max(0,Math.min(1,distant))*
    (.9*Math.sin(x*.071+Math.sin(z*.026))*
      Math.sin(z*.054-Math.cos(x*.041)) +
     1.45*Math.pow(Math.abs(Math.sin(x*.032+z*.018)),2.7));
  return rolling + mountains + ridges;
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
// A dedicated heightfield is far more reliable for off-road wheels than one
// enormous Trimesh. Read the *rendered* vertices so contact matches the grass.
export function createTerrainCollider(physics, geometry, frictionMaterial) {
  const {width,height,widthSegments,heightSegments}=geometry.parameters;
  const step=width/widthSegments;
  if(Math.abs(step-height/heightSegments)>1e-6)
    throw new Error('Terrain heightfield requires square grid cells');
  const cols=widthSegments+1,rows=heightSegments+1;
  const vertices=geometry.getAttribute('position');
  // Three PlaneGeometry row 0 is -Z after rotateX(-PI/2). Cannon heightfields
  // are +Z-up locally; their +Y becomes world -Z under the same rotation.
  const heights=Array.from({length:cols},(_,x)=>
    Array.from({length:rows},(_,z)=>vertices.getY((rows-1-z)*cols+x)));
  const shape=new CANNON.Heightfield(heights,{elementSize:step});
  const body=new CANNON.Body({mass:0,material:frictionMaterial});
  body.addShape(shape);
  body.position.set(-width*.5,0,height*.5);
  body.quaternion.setFromEuler(-Math.PI/2,0,0);
  physics.addBody(body);
  return body;
}

function groupBox(parent, x, y, z, width, height, depth, color, metalness = 0) {
  const obj = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth),
    color?.isMaterial ? color : material(color, 0.8, metalness));
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
    this.network.roads[0].mesh=this.roadMesh;
    // Roads, junctions and POI entrances share ONE clearance mask.
    this.sectors=new WorldSectors(this.scene,this.physics,this.network,groundHeight);
    this.roadside=new RoadsideClearance(this.network,this.sectors.regions);
    this.sectors.clearance=this.roadside;
    this.railway=new RegionalRailway(this.scene,this.physics,groundHeight,
      this.roadside,this.quality);
    this.buildRoadside();
    this.trimRingRoadsideAtJunctions();
    this.roadEnvironment=new RoadEnvironment(this.scene,this.physics,this.network,
      groundHeight,this.quality,this.roadside);
    this.roadSignage=new RoadSignage(this.scene,this.network,this.quality);
    this.testArea=new DrivingTestArea(this.scene,this.physics,this.network,groundHeight);
    const testRoad=this.network.roads.find(r=>r.id==='provas');
    if(testRoad) {
      const i=Math.floor(testRoad.points.length*.095);
      this.testSpawn={center:testRoad.points[i],
        tangent:testRoad.points[i+1].clone().sub(testRoad.points[i]).normalize()};
    }
    this.buildScenery();
    this.buildStreetLights();
    this.details = new WorldDetails(this.scene, this.roadPoints, this.roadWidth,
      groundHeight, this.quality, null, this.roadside);
    this.buildRain();
    this.updateAtmosphere();
  }

  buildSun() {
    // Sky pixels are computed from atmospheric colours and sun direction.
    // A plain scene.background Color previously made lighting look flat.
    this.scene.background=null;
    this.scene.fog=new THREE.FogExp2(0xb9c9d1,.00078);
    this.cinematicSky=new CinematicSky(this.scene);
    this.atmosphere=evaluateAtmosphere(this.hour,this.weather);
    this.ambient=new THREE.HemisphereLight(0xc4dcf0,0x67675d,1.0);
    this.scene.add(this.ambient);
    this.sun=new THREE.DirectionalLight(0xfff1dc,2.65);
    this.sun.castShadow=true;
    this.configureShadows(this.quality,'high');
    this.scene.add(this.sun,this.sun.target);
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
    const subdivisions = this.quality === 'ultra' ? 236 : this.quality === 'high' ? 188 : this.quality==='medium'?150:118;
    const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE,
      // Preserve the previous metres-per-vertex spacing as the world grows;
      // otherwise the expanded terrain would turn into giant triangles that
      // visibly intersect and bury the detailed roadbed on steep slopes.
      Math.round(subdivisions*1.38*WORLD_SIZE/3400),
      Math.round(subdivisions*1.38*WORLD_SIZE/3400));
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute('position');
    const colors = [];
    const grass=new THREE.Color(0x6f8450);
    const meadow=new THREE.Color(0x718451);
    const earth=new THREE.Color(0x8c7857);
    const rock=new THREE.Color(0x92958b);
    const shadowed=new THREE.Color(0x526344);
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),z=positions.getZ(i);
      const h=groundHeight(x,z);
      positions.setY(i,h);
      const slope=Math.hypot(groundHeight(x+3,z)-groundHeight(x-3,z),
        groundHeight(x,z+3)-groundHeight(x,z-3))/6;
      const moisture=Math.sin(x*.0083+Math.cos(z*.006))*
        Math.cos(z*.0091-Math.sin(x*.013));
      const rockiness=THREE.MathUtils.smoothstep(slope,.24,.82)*.82+
        THREE.MathUtils.smoothstep(h,17,49)*.35;
      const dry=THREE.MathUtils.smoothstep(h,7,32)*.4+
        THREE.MathUtils.smoothstep(moisture,.13,.85)*.33;
      const patch=.06*Math.sin(x*.052+Math.sin(z*.029))*
        Math.cos(z*.042-Math.cos(x*.021));
      const color=grass.clone().lerp(meadow,THREE.MathUtils.clamp(.55+moisture*.36,0,1))
        .lerp(earth,THREE.MathUtils.clamp(dry,0,.72))
        .lerp(rock,THREE.MathUtils.clamp(rockiness,0,.9))
        .lerp(shadowed,THREE.MathUtils.clamp(-moisture*.19,0,.15))
        .multiplyScalar(THREE.MathUtils.clamp(.96+patch,.83,1.09));
      colors.push(color.r,color.g,color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const surface = new THREE.Mesh(geometry, createTerrainMaterial());
    surface.receiveShadow = true;
    this.scene.add(surface);
    this.terrainBody=createTerrainCollider(this.physics, geometry, this.terrainMaterial);
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
    for (let i = 0; i <= sampleCount; i++) {
      const u=i/sampleCount;
      const center=curve.getPointAt(u);
      const tangent=curve.getTangentAt(u).normalize();
      const side=new THREE.Vector3(-tangent.z,0,tangent.x);
      const left=center.clone().addScaledVector(side,this.roadWidth/2);
      const right=center.clone().addScaledVector(side,-this.roadWidth/2);
      left.y=groundHeight(left.x,left.z)+.205;
      right.y=groundHeight(right.x,right.z)+.205;
      const roadCenter=left.clone().add(right).multiplyScalar(.5);
      this.roadPoints.push({center:roadCenter,tangent,side,left,right});
    }
    const bed=createRoadBed(this.roadPoints,this.roadWidth,groundHeight,29);
    this.roadMaterial=createAsphaltMaterial(this.quality,'aged');
    const roadMesh=new THREE.Mesh(bed.top,this.roadMaterial);
    roadMesh.name='Estrada Circular · Pavimento 3D';
    roadMesh.receiveShadow=true;
    this.scene.add(roadMesh);
    this.roadSides=addRoadSides(this.scene,bed.sides,'Estrada Circular');
    this.roadWear=addRoadWear(this.scene,this.roadPoints,this.roadWidth,
      groundHeight,this.quality,29);
    meshCollider(this.physics,bed.top,this.asphaltMaterial);

    // Surface-conforming road lines are built by RoadSignage after the network.
    this.roadMesh=roadMesh;
    this.spawn = this.roadPoints[5];
  }

  buildRoadside() {
    // The ring uses precisely the same natural, layered shoulder geometry
    // as every regional road. Junction cutters operate on these meshes too.
    this.ringShoulders=addRoadShoulders(this.scene,this.roadPoints,
      this.roadWidth,groundHeight,createGravelMaterial());
  }

  // Asphalt at a T junction is continuous, but its outer kerb and gravel
  // shoulder must open into the joined road rather than form a visible wall.
  trimRingRoadsideAtJunctions(){
    const ring=this.network.roads.find(road=>road.id==='circular');
    const joins=this.network.junctions.filter(j=>j.primary===ring);
    const cuts=[];
    for(const join of joins){
      const road=join.secondary,pts=road.points;
      let nearest=0,dist=Infinity;
      for(let i=0;i<pts.length;i++){
        const dx=pts[i].x-join.x,dz=pts[i].z-join.z,d=dx*dx+dz*dz;
        if(d<dist){dist=d;nearest=i;}
      }
      const a=pts[Math.max(0,nearest-1)],b=pts[Math.min(pts.length-1,nearest+1)];
      const tangent=b.clone().sub(a).setY(0);
      if(tangent.lengthSq()<.01)continue;
      tangent.normalize();
      cuts.push({...join,ux:tangent.x,uz:tangent.z,
        halfU:this.roadWidth*.5+5.1,halfV:road.width*.5+2.65});
    }
    this.ringAccessCuts=cuts;
    for(const mesh of [...(this.ringShoulders||[]),this.roadSides]){
      if(!mesh)continue;
      const trimmed=clipGeometryAtJunctions(mesh.geometry,cuts);
      if(trimmed){mesh.geometry.dispose();mesh.geometry=trimmed;}
    }
    trimRoadWearAtJunctions(this.roadWear,cuts);
  }

  buildStreetLights() {
    // All styles share instanced metallic fixtures with modern LED heads.
    // At most 4–8 real dynamic lights are recycled around the car, rather
    // than dozens of expensive lights that persist all night.
    this.roadLighting=new ModernRoadLighting(
      this.scene,this.network,groundHeight,this.roadside,this.quality);
    this.streetLights=this.roadLighting.lights;
    this.bulbMaterial=this.roadLighting.glowMaterial;
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
    // Shared tree species/age prototypes, streamed LOD per spatial chunk.
    // The old cylinders, single-cone pines and icosahedral crowns are gone.
    this.understory=new WildGroundcover(this.scene,groundHeight,
      this.roadside,this.railway,this.quality);
    this.forest = new ForestSystem(this.scene, {
      quality:this.quality,
      seed:20261010,
      terrainY:groundHeight,
      distanceToRoad:(x,z)=>this.distanceToRoad(x,z),
      isNearRoad:(x,z)=>!this.roadside.plantAllowed(x,z,'tree',2)||
        this.railway.nearestTrack(x,z)<11
    });
    // Rock transforms remain independent of the new forest batches.
    const dummy = new THREE.Object3D();

    const colors = [0xb5b3ac, 0xa7aaa5, 0xc0b6ad, 0x969b98, 0xacaeaa];
    const wallMaterials=colors.map(createWeatheredWallMaterial);
    const facade=new UrbanFacadeBatch(this.scene);
    for (let i = 0; i < 48; i++) {
      const x = 65 + (i % 8) * 28 + random() * 9;
      const z = -70 + Math.floor(i / 8) * 42 + random() * 8;
      // Do not place buildings inside any of the connected urban roads.
      if (this.distanceToRoad(x, z) < 23 ||
          this.network.query(x,z).distance < 22) continue;
      const height = 9 + Math.floor(random() * 6) * 7;
      const width = 14 + random() * 8, depth = 15 + random() * 9;
      const baseY = groundHeight(x, z) - 0.12;
      groupBox(this.scene, x, baseY, z, width, height, depth, wallMaterials[i % wallMaterials.length]);
      facade.building({x,z,baseY,width,height,depth,seed:i});
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2)));
      body.position.set(x, baseY + height / 2, z);
      this.physics.addBody(body);
    }

    this.facade=facade.finalize();
    const rocks = new THREE.InstancedMesh(createWeatheredRockGeometry(2),
      new THREE.MeshStandardMaterial({color:0xb8b7ae,roughness:1,metalness:0,
        vertexColors:true}), 140);
    let count = 0;
    for (let i = 0; i < 500 && count < 140; i++) {
      const x = (random() - 0.5) * (WORLD_SIZE-220), z = (random() - 0.5) * (WORLD_SIZE-220);
      const size = 0.4 + random() * 2.4;
      if (this.railway.nearestTrack(x,z)<5||
          !this.roadside.plantAllowed(x,z,'rock',size*.75)||
          this.distanceToRoad(x,z)<16) continue;
      dummy.position.set(x, groundHeight(x, z) + size * 0.15, z);
      dummy.rotation.set(random(), random() * TAU, random());
      dummy.scale.set(size, size * 0.6, size * 1.1);
      dummy.updateMatrix();
      rocks.setMatrixAt(count, dummy.matrix);
      rocks.setColorAt(count,new THREE.Color([0xaba89f,0xa59d91,0x969c9b,0xa7a5a0][count%4]));
      count++;
    }
    rocks.count = count;
    rocks.instanceMatrix.needsUpdate = true;
    if(rocks.instanceColor)rocks.instanceColor.needsUpdate=true;
    rocks.receiveShadow = true;
    this.scene.add(rocks);
  }

  setVegetationDensity(factor = 1) {
    const ratio=Math.max(.2,Math.min(1,Number(factor)||1));
    this.forest?.setDensity(ratio);
    this.understory?.setDensity(ratio);
    this.details?.setDensity(ratio);
  }

  updateForest(camera,dt=1/60,paused=false) {
    this.forest?.update(camera,dt,this.weather,paused);
    this.understory?.update(camera.position,dt,paused);
  }


  buildRain() {
    this.rainEffect=new RainStreaks(this.scene,this.quality);
    this.rain=this.rainEffect.mesh;
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

  configureShadows(quality=this.quality,shadowQuality='high'){
    this.quality=quality;
    return configureCinematicShadows(this.sun,quality,shadowQuality);
  }

  updateAtmosphere() {
    const state=evaluateAtmosphere(this.hour,this.weather);
    this.atmosphere=state;
    this.cinematicSky.update(state);
    const blend=this.frameDt?Math.min(1,this.frameDt*3):1;
    this.scene.fog.color.lerp(state.fogColor,blend);
    this.scene.fog.density=THREE.MathUtils.lerp(
      this.scene.fog.density,state.fogDensity,blend);
    // Neutral midday, golden hour, cooler diffuse sun through rainy cloud.
    this.sun.color.copy(state.sunColor);
    this.sun.intensity=state.sunIntensity;
    this.sun.castShadow=state.daylight>.065;
    this.sun.position.copy(state.sunDirection).multiplyScalar(275)
      .add(this.sun.target.position);
    this.sun.shadow.radius=state.shadowRadius;
    this.ambient.intensity=state.ambientIntensity;
    this.ambient.color.copy(state.ambientColor);
    this.ambient.groundColor.set(this.weather==='rain'?0x59616a:0x6c6758);
    this.bulbMaterial.emissiveIntensity=state.daylight<.13?1.9:.06;
    this.stars.visible=state.sunHeight<-.1&&this.weather==='clear';
  }

  update(dt, vehiclePosition, paused = false) {
    this.frameDt = paused ? 0 : dt;
    if (!paused) {
      this.hour = (this.hour + dt * this.sunSpeed / 60) % 24;
      this.rainEffect?.update(dt,false);
    }
    const wetness = this.details?.update(dt, vehiclePosition, this.weather, this.hour, paused) || 0;
    if (this.roadMaterial) {
      this.roadMaterial.clearcoat = 0.08 + .82 * wetness;
      this.roadMaterial.clearcoatRoughness = .23 - .12 * wetness;
      this.roadMaterial.roughness = .97 - .47 * wetness;
      this.roadMaterial.color.setRGB(1 - .25 * wetness, 1 - .23 * wetness, 1 - .19 * wetness);
    }
    this.network?.setWetness(wetness);
    this.roadEnvironment?.update(dt,paused);
    this.railway?.update(dt,paused);
    this.updateAtmosphere();
    if (vehiclePosition) {
      this.sectors.update(vehiclePosition,performance.now()/1000,this.hour);
      this.rain.position.set(vehiclePosition.x, vehiclePosition.y - 3, vehiclePosition.z);
      this.stars.position.set(vehiclePosition.x, 0, vehiclePosition.z);
      this.sun.target.position.set(vehiclePosition.x,vehiclePosition.y,vehiclePosition.z);
      this.sun.position.copy(vehiclePosition).addScaledVector(
        this.atmosphere.sunDirection,275);
      this.sun.target.updateMatrixWorld();
      this.cinematicSky.mesh.position.copy(vehiclePosition);
      this.roadLighting?.update(dt,this.hour,vehiclePosition);
    }
  }
}
