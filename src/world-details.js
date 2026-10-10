import * as THREE from 'three';
import {roadDeckHeight} from './road-upgrades.js';
import {AtmosphericClouds} from './atmosphere-effects.js';
import {createNaturalShrubGeometry,createNaturalFlowerGeometry} from './natural-assets.js';

// Entirely native Three.js geometry: no external meshes or image placeholders.
// Reused geometries, materials and per-region InstancedMesh keep draw calls low.
function seeded(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const TAU = Math.PI * 2;
const rand = seeded(20261027);
const C = (x) => new THREE.Color(x);

function windMaterial(color, amplitude = 0.12) {
  const shaderUniform = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.92, metalness: 0, side: THREE.DoubleSide
  });
  mat.onBeforeCompile = shader => {
    shader.uniforms.uCorsaWind = shaderUniform;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nuniform float uCorsaWind;'
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n' +
      'float bend = clamp(position.y, 0.0, 1.0);\n' +
      'transformed.x += sin(uCorsaWind * 1.6 + instanceMatrix[3].x * .044 + instanceMatrix[3].z * .027) * bend * bend * ' + amplitude.toFixed(3) + ';\n'
    );
  };
  mat.customProgramCacheKey = () => 'corsa-wind-' + amplitude;
  return { mat, shaderUniform };
}

export class WorldDetails {
  constructor(scene, roadPoints, roadWidth, terrainY, quality = 'high', trees = null) {
    this.scene = scene;
    this.points = roadPoints;
    this.width = roadWidth;
    this.terrainY = terrainY;
    this.quality = quality;
    this.elapsed = 0;
    this.wetness = 0;
    this.grassPatches = [];
    this.winds = [];
    this.buildGuardrails();
    this.buildSigns();
    this.buildGrass();
    this.buildShrubs();
    this.buildFlowers();
    this.buildClouds();
    this.buildPuddles();
    this.animateTreeLeaves(trees);
  }

  roadPoint(index, lateral = 0) {
    const p = this.points[((index % (this.points.length - 1)) + (this.points.length - 1)) % (this.points.length - 1)];
    const v = p.center.clone().addScaledVector(p.side, lateral);
    v.y = this.terrainY(v.x, v.z);
    return v;
  }

  buildGuardrails() {
    if (this.quality === 'low') return;
    // Follow curved outer road edges with individual steel beams.
    const beamGeometry = new THREE.BoxGeometry(0.09, 0.36, 1);
    const postGeometry = new THREE.BoxGeometry(0.14, 1.28, 0.15);
    const steel = new THREE.MeshStandardMaterial({
      color: 0xa2abb1, roughness: 0.34, metalness: 0.82, envMapIntensity: 1
    });
    const segmentSpacing = this.quality === 'medium' ? 9 : 5;
    const capacity = Math.ceil(this.points.length / segmentSpacing) * 2;
    const beams = new THREE.InstancedMesh(beamGeometry, steel, capacity);
    const posts = new THREE.InstancedMesh(postGeometry, steel, capacity);
    const transform = new THREE.Object3D();
    let n = 0;
    for (let i = 0; i < this.points.length - segmentSpacing; i += segmentSpacing) {
      for (const side of [-1, 1]) {
        const a = this.roadPoint(i, side * (this.width / 2 + 3.2));
        const b = this.roadPoint(i + segmentSpacing, side * (this.width / 2 + 3.2));
        const middle = a.clone().add(b).multiplyScalar(.5);
        const vector = b.clone().sub(a);
        const length = vector.length();
        if (length > 35) continue;
        transform.position.copy(middle);
        transform.position.y += .87;
        transform.scale.set(1, 1, length);
        transform.rotation.set(0, Math.atan2(vector.x, vector.z), 0);
        transform.updateMatrix();
        beams.setMatrixAt(n, transform.matrix);
        transform.position.copy(a);
        transform.position.y += .64;
        transform.rotation.set(0, 0, 0);
        transform.scale.set(1, 1, 1);
        transform.updateMatrix();
        posts.setMatrixAt(n, transform.matrix);
        n++;
      }
    }
    beams.count = posts.count = n;
    beams.instanceMatrix.needsUpdate = true;
    posts.instanceMatrix.needsUpdate = true;
    beams.castShadow = this.quality === 'ultra';
    posts.castShadow = this.quality === 'ultra';
    beams.receiveShadow = posts.receiveShadow = true;
    this.scene.add(beams, posts);
  }

  buildSigns() {
    const rows = Math.floor((this.points.length - 1) / 38);
    const material = new THREE.MeshStandardMaterial({
      color: 0xf6bd3c, roughness: 0.61, metalness: 0.07,
      emissive: 0x50310b, emissiveIntensity: .12
    });
    const black = new THREE.MeshStandardMaterial({ color: 0x171a19, roughness: .73 });
    const pole = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(.06, .07, 2.2, 7),
      new THREE.MeshStandardMaterial({ color: 0x899197, metalness: .85, roughness: .35 }),
      rows
    );
    const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1.22, .74, .075), material, rows);
    const chevrons = new THREE.InstancedMesh(new THREE.BoxGeometry(.52, .12, .08), black, rows * 2);
    const dummy = new THREE.Object3D();
    let count = 0, stripes = 0;
    for (let i = 23; i < this.points.length - 2; i += 38) {
      const p = this.points[i];
      const q = this.roadPoint(i, this.width / 2 + 4);
      const yaw = Math.atan2(p.tangent.x, p.tangent.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.copy(q); dummy.position.y += 1.1;
      dummy.updateMatrix();
      pole.setMatrixAt(count, dummy.matrix);
      dummy.position.y += .57;
      dummy.updateMatrix();
      panels.setMatrixAt(count, dummy.matrix);
      for (const z of [-.22, .22]) {
        const arrow = new THREE.Vector3(z, 0, .055).applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
        dummy.position.copy(q).add(arrow); dummy.position.y += 1.56;
        dummy.rotation.set(0, yaw, z < 0 ? -.52 : .52);
        dummy.updateMatrix();
        chevrons.setMatrixAt(stripes++, dummy.matrix);
      }
      count++;
    }
    pole.count = panels.count = count;
    chevrons.count = stripes;
    for (const instance of [pole, panels, chevrons]) instance.instanceMatrix.needsUpdate = true;
    this.scene.add(pole, panels, chevrons);
  }

  buildGrass() {
    // Three crossed, tapered blades, each with a bend at the middle. Extra
    // facets create silhouette depth while keeping one shared instanced mesh.
    const blades=new THREE.BufferGeometry();
    const bladePositions=[],bladeIndices=[];
    for(let blade=0;blade<3;blade++){
      const angle=blade*Math.PI/3;
      const sin=Math.sin(angle),cos=Math.cos(angle);
      const bend=.06*(blade%2===0?1:-1);
      const profile=[
        [-.102,0,0],[.102,0,0],
        [-.070,.49,bend*.52],[.067,.49,bend*.52],
        [-.004,1,bend*1.65]
      ];
      const base=bladePositions.length/3;
      for(const [x,y,z] of profile)
        bladePositions.push(x*cos-z*sin,y,x*sin+z*cos);
      bladeIndices.push(base,base+1,base+2,base+1,base+3,base+2,
        base+2,base+3,base+4);
    }
    blades.setAttribute('position',new THREE.Float32BufferAttribute(bladePositions,3));
    blades.setIndex(bladeIndices);
    blades.computeVertexNormals();
    const {mat, shaderUniform} = windMaterial(0x91a85b,.14);
    this.winds.push(shaderUniform);
    const colors = [C(0x607b38), C(0x819b4c), C(0x9ba65c), C(0x476a31)];
    const tileSize = 190;
    const count = this.quality === 'ultra' ? 7600 :
      this.quality === 'high' ? 5200 : this.quality === 'medium' ? 2400 : 850;
    const buckets = new Map();
    for (let i=0; i<count; i++){
      const point = this.points[Math.floor(rand() * (this.points.length - 1))];
      const distance = (rand() < .5 ? -1 : 1) * (this.width/2 + 6 + rand()*47);
      const x = point.center.x + point.side.x*distance + (rand()-.5)*9;
      const z = point.center.z + point.side.z*distance + (rand()-.5)*9;
      const tileX = Math.floor(x/tileSize), tileZ = Math.floor(z/tileSize);
      const key = tileX+','+tileZ;
      if (!buckets.has(key)) buckets.set(key,[]);
      buckets.get(key).push({x,z,y:this.terrainY(x,z),size:.34+rand()*.87,yaw:rand()*TAU,
        color:colors[Math.floor(rand()*colors.length)]});
    }
    const dummy=new THREE.Object3D();
    for(const [key,entries] of buckets){
      const mesh=new THREE.InstancedMesh(blades,mat,entries.length);
      entries.forEach((entry,i)=>{
        dummy.position.set(entry.x,entry.y+.035,entry.z);
        dummy.rotation.set(0,entry.yaw,0);
        dummy.scale.set(.8+entry.size*.4,entry.size, .8+entry.size*.4);
        dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
        mesh.setColorAt(i,entry.color);
      });
      mesh.instanceMatrix.needsUpdate=true;
      mesh.instanceColor.needsUpdate=true;
      mesh.castShadow=false;mesh.receiveShadow=true;
      mesh.computeBoundingSphere();
      mesh.frustumCulled=true;
      this.scene.add(mesh);
      const [tx,tz] = key.split(',').map(Number);
      this.grassPatches.push({mesh,x:(tx+.5)*tileSize,z:(tz+.5)*tileSize});
    }
  }

  animateTreeLeaves(trees) {
    if(!trees) return;
    // Wind deformation is in the vertex shader, never in a per-frame CPU loop.
    for (const [mesh,baseColor,strength] of [
      [trees.leaves,0x879b77,.18],
      [trees.conifers,0x345b39,.15]
    ]) {
      const {mat,shaderUniform}=windMaterial(baseColor,strength);
      mesh.material.dispose();
      mesh.material=mat;
      this.winds.push(shaderUniform);
    }
  }

  buildShrubs() {
    const count=this.quality==='low'?150:this.quality==='medium'?260:530;
    const geometry=createNaturalShrubGeometry(this.quality==='low'?'low':'medium');
    const material=new THREE.MeshStandardMaterial({
      color:0xf1f0e7,roughness:.94,metalness:0,vertexColors:true,
      side:THREE.DoubleSide
    });
    const shrubs=new THREE.InstancedMesh(geometry,material,count);
    const t=new THREE.Object3D();
    const palettes=[C(0x8b997e),C(0x829b80),C(0x8c9a7d),C(0x7f947b)];
    for(let i=0;i<count;i++) {
      const p=this.points[Math.floor(rand()*(this.points.length-1))];
      const side=(rand()<.5?-1:1)*(this.width/2+8+rand()*85);
      const x=p.center.x+p.side.x*side;
      const z=p.center.z+p.side.z*side;
      const scale=.5+rand()*1.15;
      t.position.set(x,this.terrainY(x,z)+.012,z);
      t.rotation.set(rand()*.35,rand()*TAU,rand()*.35);
      t.scale.set(scale*.95,scale*.88,scale);
      t.updateMatrix();
      shrubs.setMatrixAt(i,t.matrix);
      shrubs.setColorAt(i,palettes[Math.floor(rand()*palettes.length)]);
    }
    shrubs.instanceMatrix.needsUpdate=true;
    shrubs.instanceColor.needsUpdate=true;
    shrubs.receiveShadow=true;
    shrubs.castShadow=this.quality==='ultra';
    this.scene.add(shrubs);
    this.shrubs=shrubs;
  }

  buildFlowers() {
    const amount=this.quality==='low'?90:this.quality==='medium'?220:400;
    const stem=new THREE.InstancedMesh(
      new THREE.CylinderGeometry(.015,.025,.65,5),
      new THREE.MeshStandardMaterial({color:0x436d32,roughness:1}),amount
    );
    const bloom=new THREE.InstancedMesh(
      createNaturalFlowerGeometry(),
      new THREE.MeshStandardMaterial({roughness:.85,vertexColors:true,
        side:THREE.DoubleSide}),amount
    );
    const palettes=[C(0xe8d6ac),C(0xc8b4ba),C(0xa6a6bc),C(0xf0e5d1)];
    const t=new THREE.Object3D();
    for(let i=0;i<amount;i++){
      const point=this.points[Math.floor(rand()*(this.points.length-1))];
      const side=(rand()<.5?-1:1)*(this.width/2+9+rand()*42);
      const x=point.center.x+point.side.x*side;
      const z=point.center.z+point.side.z*side;
      const y=this.terrainY(x,z);
      const h=.6+rand()*.45;
      t.position.set(x,y+h*.32,z);
      t.scale.set(1,h,1);t.rotation.set(0,rand()*TAU,0);t.updateMatrix();
      stem.setMatrixAt(i,t.matrix);
      t.position.y=y+h*.85;t.scale.set(.55+rand()*.34,1,.55+rand()*.34);t.updateMatrix();
      bloom.setMatrixAt(i,t.matrix);
      bloom.setColorAt(i,palettes[Math.floor(rand()*palettes.length)]);
    }
    for(const mesh of [stem,bloom])mesh.instanceMatrix.needsUpdate=true;
    bloom.instanceColor.needsUpdate=true;
    this.scene.add(stem,bloom);
  }

  buildClouds() {
    // Multi-layer soft density textures replace the old giant faceted icosahedra.
    this.cloudSystem=new AtmosphericClouds(this.scene,this.quality);
    this.clouds=this.cloudSystem.clouds;
    this.cloudGroups=this.cloudSystem.groups;
  }

  buildPuddles() {
    const count=this.quality==='low'?12:this.quality==='medium'?23:43;
    const geometry=new THREE.CircleGeometry(1,24);
    geometry.rotateX(-Math.PI/2);
    const mat=new THREE.MeshPhysicalMaterial({
      color:0x657581,roughness:.065,metalness:.13,transparent:true,
      opacity:0,depthWrite:false,clearcoat:1,clearcoatRoughness:.02,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1
    });
    const mesh=new THREE.InstancedMesh(geometry,mat,count);
    const t=new THREE.Object3D();
    for(let i=0;i<count;i++){
      const point=this.points[Math.floor(rand()*(this.points.length-1))];
      const lateral=(rand()-.5)*(this.width-3);
      const p=point.center.clone().addScaledVector(point.side,lateral);
      const height=roadDeckHeight(this.terrainY,p.x,p.z,lateral,this.width)+.024;
      t.position.set(p.x,height,p.z);
      t.rotation.set(0,rand()*TAU,0);
      t.scale.set(.45+rand()*1.1,1,1.25+rand()*2.4);
      t.updateMatrix();
      mesh.setMatrixAt(i,t.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
    mesh.material=mat;
    mesh.visible=false;
    this.scene.add(mesh);
    this.puddles=mesh;
  }

  setDensity(factor) {
    // Keep all meshes allocated: avoid GPU memory churn when quality changes.
    const f=THREE.MathUtils.clamp(Number(factor)||1,.2,1);
    for (const patch of this.grassPatches) {
      patch.mesh.count = Math.max(1,Math.floor(patch.mesh.instanceMatrix.count*f));
    }
    if(this.shrubs)this.shrubs.count=Math.max(1,Math.floor(this.shrubs.instanceMatrix.count*f));
  }

  update(dt, car, weather, hour, paused=false) {
    const delta=paused?0:Math.min(.05,dt);
    this.elapsed+=delta;
    for(const item of this.winds)item.value=this.elapsed;
    this.cloudSystem?.update(dt,weather,hour,paused);
    const target=weather==='rain'?1:0;
    this.wetness=THREE.MathUtils.damp(this.wetness,target,weather==='rain'?.23:.055,delta);
    if(this.puddles){
      this.puddles.visible=this.wetness>.045;
      this.puddles.material.opacity=.48*this.wetness;
    }
    if(car)for(const patch of this.grassPatches){
      const dx=patch.x-car.x,dz=patch.z-car.z;
      patch.mesh.visible=dx*dx+dz*dz<(this.quality==='low'?210:340)**2;
    }
    return this.wetness;
  }
}
