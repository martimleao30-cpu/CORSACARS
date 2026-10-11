import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {roadProfile} from './road-standards.js';

const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const center=p=>p.center||p;
// One detailed reusable 3D grate with real open gaps rather than an opaque
// painted rectangle. All installed drains share this single geometry.
function collectorGrateGeometry(){
  const positions=[],normals=[],uv=[],indices=[];
  const box=(width,height,depth,x,z)=>{
    const part=new THREE.BoxGeometry(width,height,depth);
    part.translate(x,0,z);
    const p=part.getAttribute('position').array;
    const n=part.getAttribute('normal').array;
    const t=part.getAttribute('uv').array;
    const offset=positions.length/3;
    positions.push(...p);normals.push(...n);uv.push(...t);
    indices.push(...Array.from(part.index.array,i=>i+offset));
    part.dispose();
  };
  for(let i=0;i<9;i++)box(.047,.07,.38,(i-4)*.108,0);
  for(const z of [-.22,.22])box(1.02,.092,.075,0,z);
  for(const x of [-.515,.515])box(.07,.092,.45,x,0);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);geometry.computeBoundingSphere();
  return geometry;
}
const sideAt=(points,i)=>{
  const a=center(points[Math.max(0,i-1)]);
  const b=center(points[Math.min(points.length-1,i+1)]);
  const dx=b.x-a.x,dz=b.z-a.z;
  const d=Math.hypot(dx,dz)||1;
  return {x:-dz/d,z:dx/d,dx:dx/d,dz:dz/d};
};
// Real roadside surface geometry and collision follow the SAME vertices;
// rainwater is a distinct translucent strip which never carries rigid bodies.
export class HighwayDrainage{
  constructor(scene,network,terrainY,river=null){
    this.scene=scene;this.network=network;this.terrainY=terrainY;
    this.river=river;this.group=new THREE.Group();
    this.group.name='Autoestrada · canais de drenagem e coletores pluviais';
    scene.add(this.group);
    this.geometry=[];this.materials=[];this.channels=[];
    this.time=0;this.level=0;this.rainfall=0;
    this.meshCount=0;this.inletCount=0;
    this.concrete=new THREE.MeshStandardMaterial({
      color:0xd2d2ca,vertexColors:true,roughness:.92,metalness:.025,
      side:THREE.DoubleSide
    });
    this.grateMat=new THREE.MeshStandardMaterial({
      color:0x515a5e,roughness:.58,metalness:.61
    });
    this.waterMat=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uLevel:{value:0},uRain:{value:0}},
      vertexShader:`
        attribute float flowDirection;
        varying vec2 vUv;
        varying float vFlow;
        void main(){
          vUv=uv;vFlow=flowDirection;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }`,
      fragmentShader:`
        uniform float uTime;uniform float uLevel;uniform float uRain;
        varying vec2 vUv;varying float vFlow;
        void main(){
          float t=vUv.y*2.2-uTime*(1.1+uRain*1.6)*vFlow;
          float waves=sin(t*12.0+sin(vUv.x*17.0)*.9)*.12+
            sin(t*22.0-vUv.x*11.0)*.06;
          float foam=smoothstep(.66,.94,abs(waves*3.5))*.18*uRain;
          vec3 base=mix(vec3(.10,.20,.23),vec3(.27,.40,.43),
            .36+.24*waves);
          vec3 color=mix(base,vec3(.80,.87,.86),foam);
          float edge=smoothstep(0.0,.14,vUv.x)*
            (1.0-smoothstep(.86,1.0,vUv.x));
          gl_FragColor=vec4(color,(.40+.39*uLevel)*edge);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent:true,side:THREE.DoubleSide,depthWrite:false,
      // Raw ShaderMaterial has no Three.js fog uniforms; fog:true made
      // WebGLRenderer.refreshFogUniforms access an undefined .value at runtime.
      // These local translucent runoff channels use their own shading.
      fog:false
    });
    this.materials.push(this.concrete,this.grateMat,this.waterMat);
    this.build();
  }
  nearConflict(p){
    for(const j of this.network.junctions||[]){
      if(Math.hypot(p.x-j.x,p.z-j.z)<
        Math.max(j.halfU,j.halfV)+24)return true;
    }
    const river=this.river?.lookup(p.x,p.z);
    return !!river&&river.distance<river.width+24;
  }
  build(){
    const section=[-1.36,-1.03,-.57,-.27,.27,.57,1.03,1.36];
    const heights=[.37,.31,.12,.06,.06,.12,.31,.37];
    const shades=[.89,.93,.77,.66,.66,.77,.93,.89];
    const inletGeometry=collectorGrateGeometry();
    this.geometry.push(inletGeometry);
    for(const road of this.network.roads){
      if(road.id!=='autoestrada'||road.points?.length<2)continue;
      const profile=roadProfile(road);
      const offset=road.width*.5+profile.outerShoulder+3.15;
      for(const sign of [-1,1]){
        const vertices=[],uv=[],colors=[],indices=[],waterPos=[],waterUv=[],
          waterDir=[],waterIndex=[],inlets=[],
          runoffPos=[],runoffUv=[],runoffDir=[],runoffIndices=[];
        let distance=0,previous=null;
        let lastInlet=-Infinity;
        const stations=[];
        for(let i=0;i<road.points.length;i++){
          const p=center(road.points[i]),side=sideAt(road.points,i);
          if(previous)distance+=Math.hypot(p.x-previous.x,p.z-previous.z);
          previous=p;
          const cx=p.x+side.x*offset*sign,cz=p.z+side.z*offset*sign;
          const conflict=this.nearConflict(p)||this.nearConflict({x:cx,z:cz});
          stations.push({p,side,cx,cz,distance,valid:!conflict});
          for(let k=0;k<section.length;k++){
            const lateral=section[k];
            const x=cx+side.x*lateral,z=cz+side.z*lateral;
            const h=this.terrainY(x,z)+heights[k];
            vertices.push(x,h,z);
            uv.push(lateral*.75+.5,distance/3.1);
            const wear=.92+.035*Math.sin(distance*.11+k*.8);
            colors.push(shades[k]*wear,shades[k]*wear,shades[k]*wear*.97);
          }
          // The water follows the real roadside fall, not a fake overlay on
          // the driving lanes. Positive flow travels downhill along +s.
          const a=center(road.points[Math.max(0,i-1)]);
          const b=center(road.points[Math.min(road.points.length-1,i+1)]);
          const flow=p.y>=b.y?1:-1;
          for(const lateral of [-.30,.30]){
            const x=cx+side.x*lateral,z=cz+side.z*lateral;
            waterPos.push(x,this.terrainY(x,z)+.091,z);
            waterUv.push(lateral/.60+.5,distance/3.1);
            waterDir.push(flow);
          }
          if(i===0)continue;
          const station=stations[i],prev=stations[i-1];
          if(!station.valid||!prev.valid)continue;
          for(let k=0;k<section.length-1;k++){
            const a=(i-1)*section.length+k,b=i*section.length+k;
            indices.push(a,b,a+1,a+1,b,b+1);
          }
          waterIndex.push((i-1)*2,i*2,(i-1)*2+1,
            (i-1)*2+1,i*2,i*2+1);
          if(distance-lastInlet>75&&distance>28){
            lastInlet=distance;
            const pos=new THREE.Vector3(cx,this.terrainY(cx,cz)+.38,cz);
            inlets.push({position:pos,yaw:Math.atan2(side.dx,side.dz)});
            // Surface runoff crosses the outer grass/gravel strip and
            // drops into the collector. All inlets share ONE combined
            // animated geometry to avoid per-gully GPU draw calls.
            const span=offset-(road.width*.5+profile.outerShoulder+.8);
            const base=runoffPos.length/3;
            for(let j=0;j<=7;j++){
              const t=j/7,lateral=offset-span*(1-t);
              const rx=p.x+side.x*lateral*sign;
              const rz=p.z+side.z*lateral*sign;
              const elevation=this.terrainY(rx,rz)+.13+
                .16*Math.pow(1-t,1.4);
              for(const across of [-.12,.12]){
                runoffPos.push(rx+side.dx*across,elevation,
                  rz+side.dz*across);
                runoffUv.push(across/.24+.5,t*3.1);
                runoffDir.push(1);
              }
              if(j>0){
                const v=base+(j-1)*2,w=base+j*2;
                runoffIndices.push(v,w,v+1,v+1,w,w+1);
              }
            }
          }
        }
        if(!indices.length)continue;
        const concreteGeo=new THREE.BufferGeometry();
        concreteGeo.setAttribute('position',
          new THREE.Float32BufferAttribute(vertices,3));
        concreteGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
        concreteGeo.setAttribute('color',
          new THREE.Float32BufferAttribute(colors,3));
        concreteGeo.setIndex(indices);
        concreteGeo.computeVertexNormals();concreteGeo.computeBoundingSphere();
        concreteGeo.userData.drainage='motorway-concrete-channel';
        this.geometry.push(concreteGeo);
        const mesh=new THREE.Mesh(concreteGeo,this.concrete);
        mesh.name='Autoestrada · canaleta de betão em V ('+
          (sign>0?'direita':'esquerda')+')';
        mesh.receiveShadow=true;this.group.add(mesh);
        if(road.body)road.body.addShape(new CANNON.Trimesh(
          vertices,indices)); // solid, driveable drainage channel
        const waterGeo=new THREE.BufferGeometry();
        waterGeo.setAttribute('position',
          new THREE.Float32BufferAttribute(waterPos,3));
        waterGeo.setAttribute('uv',new THREE.Float32BufferAttribute(waterUv,2));
        waterGeo.setAttribute('flowDirection',
          new THREE.Float32BufferAttribute(waterDir,1));
        waterGeo.setIndex(waterIndex);waterGeo.computeVertexNormals();
        waterGeo.computeBoundingSphere();
        this.geometry.push(waterGeo);
        const water=new THREE.Mesh(waterGeo,this.waterMat);
        water.name='Água pluvial a escoar pela canaleta';
        water.renderOrder=2;water.visible=false;
        this.group.add(water);
        const runoffGeo=new THREE.BufferGeometry();
        runoffGeo.setAttribute('position',
          new THREE.Float32BufferAttribute(runoffPos,3));
        runoffGeo.setAttribute('uv',new THREE.Float32BufferAttribute(runoffUv,2));
        runoffGeo.setAttribute('flowDirection',
          new THREE.Float32BufferAttribute(runoffDir,1));
        runoffGeo.setIndex(runoffIndices);
        if(runoffIndices.length){
          runoffGeo.computeVertexNormals();
          runoffGeo.computeBoundingSphere();
        }
        this.geometry.push(runoffGeo);
        const runoff=new THREE.Mesh(runoffGeo,this.waterMat);
        runoff.name='Escoamento transversal da berma para as valetas';
        runoff.renderOrder=2;runoff.visible=false;
        this.group.add(runoff);
        const grates=new THREE.InstancedMesh(inletGeometry,this.grateMat,
          Math.max(1,inlets.length));
        grates.name='Autoestrada · grelhas metálicas dos coletores pluviais';
        const obj=new THREE.Object3D();
        for(let k=0;k<inlets.length;k++){
          obj.position.copy(inlets[k].position);
          obj.rotation.set(0,inlets[k].yaw,0);
          obj.scale.set(1,1,1);obj.updateMatrix();
          grates.setMatrixAt(k,obj.matrix);
        }
        grates.count=inlets.length;grates.instanceMatrix.needsUpdate=true;
        if(grates.count)grates.computeBoundingSphere();
        this.group.add(grates);
        this.inletCount+=inlets.length;
        this.meshCount++;
        this.channels.push({road,sign,mesh,water,runoff,grates,
          segmentCount:indices.length/6,offset});
      }
    }
  }
  update(dt,rain=0,wetness=0,paused=false){
    if(paused)return;
    const delta=clamp(dt,0,.12);
    this.time+=delta;
    this.rainfall=clamp(rain,0,1);
    // Surface runoff increases during rainfall, drains down by gravity
    // through the grates and becomes empty gradually in dry weather.
    const supply=this.rainfall*.24+wetness*.05;
    const drainage=.045+this.level*.22;
    this.level=clamp(this.level+(supply-drainage*this.level)*delta,0,1);
    this.waterMat.uniforms.uTime.value=this.time;
    this.waterMat.uniforms.uRain.value=this.rainfall;
    this.waterMat.uniforms.uLevel.value=this.level;
    const show=this.level>.025;
    for(const channel of this.channels){
      channel.water.visible=show;
      channel.runoff.visible=show&&this.rainfall>.08;
    }
  }
  dispose(){
    this.scene.remove(this.group);
    for(const geo of this.geometry)geo.dispose();
    for(const mat of this.materials)mat.dispose();
  }
}
