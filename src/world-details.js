import * as THREE from 'three';

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
  constructor(scene, roadPoints, roadWidth, terrainY, quality = 'high') {
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
    this.buildFlowers();
    this.buildClouds();
    this.buildPuddles();
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
    // Flat blades are REAL 3D polygons, crossed in pairs to give volume.
    const blades = new THREE.BufferGeometry();
    const w = .075;
    const positions = [
      -w,0,0, w,0,0, .008,1,0,
      0,0,-w, 0,0,w, 0,.82,.008
    ];
    blades.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    blades.computeVertexNormals();
    const {mat, shaderUniform} = windMaterial(0x91a85b,.14);
    this.winds.push(shaderUniform);
    const colors = [C(0x607b38), C(0x819b4c), C(0x9ba65c), C(0x476a31)];
    const tileSize = 190;
    const count = this.quality === 'ultra' ? 6800 :
      this.quality === 'high' ? 4400 : this.quality === 'medium' ? 2100 : 750;
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

  buildFlowers() {
    const amount=this.quality==='low'?90:this.quality==='medium'?220:400;
    const stem=new THREE.InstancedMesh(
      new THREE.CylinderGeometry(.015,.025,.65,5),
      new THREE.MeshStandardMaterial({color:0x436d32,roughness:1}),amount
    );
    const bloom=new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(.09,0),
      new THREE.MeshStandardMaterial({roughness:.78,vertexColors:false}),amount
    );
    const palettes=[C(0xf4d577),C(0xf5d9f0),C(0xb49fea),C(0xf6f5dd)];
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
      t.position.y=y+h*.75;t.scale.set(1+rand()*.7,1,1+rand()*.7);t.updateMatrix();
      bloom.setMatrixAt(i,t.matrix);
      bloom.setColorAt(i,palettes[Math.floor(rand()*palettes.length)]);
    }
    for(const mesh of [stem,bloom])mesh.instanceMatrix.needsUpdate=true;
    bloom.instanceColor.needsUpdate=true;
    this.scene.add(stem,bloom);
  }

  buildClouds() {
    const count=this.quality==='low'?26:this.quality==='medium'?47:83;
    const geometry=new THREE.IcosahedronGeometry(1,1);
    const material=new THREE.MeshLambertMaterial({
      color:0xffffff,transparent:true,opacity:.67,
      depthWrite:false,side:THREE.FrontSide
    });
    const mesh=new THREE.InstancedMesh(geometry,material,count);
    const t=new THREE.Object3D();
    for(let i=0;i<count;i++){
      t.position.set((rand()-.5)*1800,165+rand()*135,(rand()-.5)*1800);
      const size=16+rand()*30;
      t.scale.set(size*2.8, size*.37, size*1.4);
      t.rotation.set(0,rand()*TAU,0);
      t.updateMatrix();mesh.setMatrixAt(i,t.matrix);
      mesh.setColorAt(i,C(i%4===0?0xc9cdd2:0xe7e6da));
    }
    mesh.instanceMatrix.needsUpdate=true;
    mesh.instanceColor.needsUpdate=true;
    mesh.castShadow=false;
    mesh.frustumCulled=false;
    this.scene.add(mesh);
    this.clouds=mesh;
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
      const height=this.terrainY(p.x,p.z)+.242;
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
  }

  update(dt, car, weather, hour, paused=false) {
    const delta=paused?0:Math.min(.05,dt);
    this.elapsed+=delta;
    for(const item of this.winds)item.value=this.elapsed;
    if(this.clouds){
      this.clouds.position.x=Math.sin(this.elapsed*.006)*55;
      this.clouds.material.opacity=weather==='rain'?.79:weather==='fog'?.52:.7;
      const daylight=Math.max(0,Math.sin((hour-6)/24*TAU));
      this.clouds.material.color.set(daylight<.18?0x69788b:weather==='rain'?0x89949b:0xf7f1e7);
    }
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
