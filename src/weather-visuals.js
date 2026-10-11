import * as THREE from 'three';
import {roadDeckHeight} from './road-upgrades.js';

// Lightweight layered atmospheric scattering. The textured fog sheets use
// world-space animated noise and depth testing: no high-cost full-screen
// ray marching, and no billboard triangles inside the player's windscreen.
const fogVertex=`
// Three.js injects instanceColor for InstancedMesh with per-instance colours.
// Re-declaring it causes a GLSL compilation failure (redefinition).
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vTint;
void main(){
  vUv=uv;
  vTint=instanceColor;
  vec4 world=modelMatrix*instanceMatrix*vec4(position,1.0);
  vWorld=world.xyz;
  gl_Position=projectionMatrix*viewMatrix*world;
}`;
const fogFragment=`
uniform float uTime;
uniform float uDensity;
uniform vec3 uFogColor;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vTint;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),
    mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0)),f.x),f.y);
}
void main(){
  vec2 p=vWorld.xz*.018+vec2(uTime*.006,-uTime*.004);
  float layered=noise(p)+.43*noise(p*2.3+7.7)+.22*noise(p*5.8-2.9);
  float edge=smoothstep(0.0,.18,vUv.x)*(1.0-smoothstep(.82,1.0,vUv.x));
  float height=smoothstep(0.0,.20,vUv.y)*(1.0-smoothstep(.65,1.0,vUv.y));
  float alpha=uDensity*edge*height*smoothstep(.30,1.2,layered)*.20;
  if(alpha<.003)discard;
  gl_FragColor=vec4(mix(uFogColor,vTint,.18),alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export class VolumetricMist{
  constructor(scene,terrainY,quality='high'){
    this.scene=scene;
    this.time=0;
    this.color=new THREE.Color(0x99aeba);
    const count=quality==='low'?28:quality==='medium'?45:75;
    this.geometry=new THREE.PlaneGeometry(1,1,1,1);
    this.geometry.translate(0,.5,0);
    this.material=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uDensity:{value:0},
        uFogColor:{value:this.color}},
      vertexShader:fogVertex,fragmentShader:fogFragment,
      transparent:true,depthWrite:false,depthTest:true,
      side:THREE.DoubleSide,blending:THREE.NormalBlending,
      fog:false
    });
    this.mesh=new THREE.InstancedMesh(this.geometry,this.material,count);
    this.mesh.name='Nevoeiro 3D · camadas de humidade a baixa altitude';
    this.mesh.frustumCulled=true;
    this.mesh.renderOrder=2;
    const dummy=new THREE.Object3D();
    // Static instances. Fog modulation happens in the GPU.
    let seed=712171;
    const random=()=>{
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;
    };
    for(let i=0;i<count;i++){
      const x=(random()-.5)*3250,z=(random()-.5)*3250;
      const ground=terrainY(x,z);
      dummy.position.set(x,ground-.8+random()*1.5,z);
      dummy.rotation.set(0,random()*Math.PI*2,0);
      dummy.scale.set(115+random()*190,16+random()*32,1);
      dummy.updateMatrix();this.mesh.setMatrixAt(i,dummy.matrix);
      this.mesh.setColorAt(i,new THREE.Color(0xc0d0d2));
    }
    this.mesh.instanceMatrix.needsUpdate=true;
    if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
    this.mesh.computeBoundingSphere();
    this.mesh.visible=false;scene.add(this.mesh);
  }
  update(dt,climate,atmosphere,paused=false){
    if(!paused)this.time+=Math.max(0,Math.min(.12,dt));
    const intensity=Math.max(0,Math.min(1,climate?.fog||0));
    this.mesh.visible=intensity>.025;
    this.material.uniforms.uDensity.value=intensity;
    this.material.uniforms.uTime.value=this.time;
    if(atmosphere)this.material.uniforms.uFogColor.value.copy(atmosphere.fogColor);
  }
  dispose(){
    this.scene.remove(this.mesh);
    this.geometry.dispose();this.material.dispose();
  }
}

export class WetRoadPuddles{
  constructor(scene,network,terrainY,quality='high'){
    this.scene=scene;
    const matrices=[];
    const dummy=new THREE.Object3D();
    let seed=192041;
    const random=()=>{
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;
    };
    const max=quality==='low'?165:quality==='medium'?280:
      quality==='ultra'?620:440;
    for(const road of network.roads||[]){
      if(road.surface!=='dry'||road.points.length<3)continue;
      const pts=road.points;
      for(let i=7;i<pts.length-7&&matrices.length<max;i+=Math.max(8,Math.floor(60/5.7))){
        const p=pts[i].center||pts[i];
        // Follow the actual centreline and reject junction conflict polygons.
        if((network.junctions||[]).some(j=>
          Math.hypot(p.x-j.x,p.z-j.z)<Math.max(j.halfU,j.halfV)+8))continue;
        if(random()<.20)continue;
        const a=pts[Math.max(0,i-2)].center||pts[Math.max(0,i-2)];
        const b=pts[Math.min(pts.length-1,i+2)].center||pts[Math.min(pts.length-1,i+2)];
        const dx=b.x-a.x,dz=b.z-a.z,den=Math.hypot(dx,dz)||1;
        const sideX=-dz/den,sideZ=dx/den;
        // Prefer shallow puddles alongside wheel paths/road edges.
        const lateral=(random()>.5?1:-1)*(road.width*.21+random()*road.width*.16);
        const x=p.x+sideX*lateral,z=p.z+sideZ*lateral;
        const y=roadDeckHeight(terrainY,x,z,lateral,road.width)+.018;
        dummy.position.set(x,y,z);
        dummy.rotation.set(-Math.PI/2,0,Math.atan2(dx,dz));
        dummy.scale.set(.34+random()*1.0,.72+random()*2.7,1);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
      }
    }
    this.geometry=new THREE.CircleGeometry(1,28);
    this.color=new THREE.Color(0x708597);
    this.material=new THREE.MeshPhysicalMaterial({
      color:0x728ba2,roughness:.055,metalness:.32,transparent:true,
      opacity:0,depthWrite:false,depthTest:true,clearcoat:1,
      clearcoatRoughness:.018,envMapIntensity:1.65,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1
    });
    this.mesh=new THREE.InstancedMesh(this.geometry,this.material,Math.max(1,matrices.length));
    this.mesh.name='Água acumulada · poças nas vias principais e nacionais';
    for(let i=0;i<matrices.length;i++)this.mesh.setMatrixAt(i,matrices[i]);
    this.mesh.count=matrices.length;
    this.mesh.instanceMatrix.needsUpdate=true;
    this.mesh.visible=false;
    scene.add(this.mesh);
  }
  update(wetness,atmosphere){
    const amount=THREE.MathUtils.clamp((wetness-.12)/.88,0,1);
    this.mesh.visible=amount>.02;
    this.material.opacity=.48*amount;
    if(atmosphere)this.material.color.copy(atmosphere.horizon).lerp(
      this.color,.48);
  }
  dispose(){
    this.scene.remove(this.mesh);
    this.geometry.dispose();this.material.dispose();
  }
}
