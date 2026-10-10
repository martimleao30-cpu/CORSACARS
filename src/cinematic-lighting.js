import * as THREE from 'three';

// A filmic sky rendered at infinity, with solar disc, aerial haze, sunset
// scattering and overcast colour temperature. No expensive ray marching.
const TAU=Math.PI*2;
const clamp=THREE.MathUtils.clamp;
const smooth=THREE.MathUtils.smoothstep;
const C=hex=>new THREE.Color(hex);
const PALETTE={
  dayZenith:C(0x437da9),dayHorizon:C(0xc1d4dd),
  eveningZenith:C(0x324d78),eveningHorizon:C(0xe6a77d),
  nightZenith:C(0x07101e),nightHorizon:C(0x202e44),
  rainZenith:C(0x465969),rainHorizon:C(0x8f9da5),
  fogZenith:C(0x8b9ba5),fogHorizon:C(0xb4bcbd),
  warmSun:C(0xffbd81),highSun:C(0xfff1dc),rainSun:C(0xc6d2da),
  blueAmbient:C(0xc4dcf0),warmAmbient:C(0xffd3ad)
};

export function evaluateAtmosphere(hour=14,weather='clear'){
  const h=((Number(hour)||0)%24+24)%24;
  const angle=(h-6)/24*TAU;
  const sunHeight=Math.sin(angle);
  const daylight=Math.max(0,sunHeight);
  const twilight=smooth(sunHeight,-.14,.12);
  const daytime=smooth(sunHeight,.08,.53);
  const golden=smooth(sunHeight,-.18,-.025)*(1-smooth(sunHeight,.20,.49));
  const mix=weather&&typeof weather==='object'?weather:null;
  const rain=clamp(mix?.rain??(weather==='rain'?.78:weather==='storm'?1:0),0,1);
  const mist=clamp(mix?.fog??(weather==='fog'?1:0),0,1);
  const cloudy=clamp(mix?.clouds??(weather==='fog'?.87:
    weather==='rain'?.76:weather==='storm'?1:
    weather==='cloudy'?.72:0),0,1);
  const isRain=rain>.15,isFog=mist>.35;
  const sunDirection=new THREE.Vector3(Math.cos(angle)*185,
    sunHeight*220,Math.sin(angle)*185).normalize();

  const zenith=PALETTE.nightZenith.clone()
    .lerp(PALETTE.eveningZenith,twilight)
    .lerp(PALETTE.dayZenith,daytime);
  const horizon=PALETTE.nightHorizon.clone()
    .lerp(PALETTE.eveningHorizon,twilight)
    .lerp(PALETTE.dayHorizon,daytime);
  const overcastZenith=isFog?PALETTE.fogZenith:PALETTE.rainZenith;
  const overcastHorizon=isFog?PALETTE.fogHorizon:PALETTE.rainHorizon;
  zenith.lerp(overcastZenith,cloudy*twilight);
  horizon.lerp(overcastHorizon,cloudy*twilight);
  // Humidity cools the dawn palette, but does not abruptly change time of day.
  horizon.lerp(PALETTE.fogHorizon,mist*.18*twilight);
  const groundHaze=horizon.clone().multiplyScalar(.77);
  const sunColor=PALETTE.highSun.clone()
    .lerp(PALETTE.warmSun,golden)
    .lerp(PALETTE.rainSun,cloudy*.86);
  const ambientColor=PALETTE.blueAmbient.clone()
    .lerp(PALETTE.warmAmbient,golden*.62)
    .lerp(PALETTE.rainSun,cloudy*.62);
  const fogDensity=.00078+mist*.00722+rain*.00115+cloudy*.00012;
  const sunVisibility=smooth(sunHeight,-.06,.06)*(1-cloudy*.85);
  const sunIntensity=(.018+2.95*Math.pow(daylight,.72))*(1-cloudy*.63);
  const ambientIntensity=(.16+.98*Math.pow(daylight,.5))*(1-cloudy*.24);
  return {
    angle,sunHeight,daylight,golden,cloudy,rain,mist,sunDirection,
    zenith,horizon,groundHaze,sunColor,ambientColor,
    fogColor:horizon.clone().lerp(zenith,.18),
    fogDensity,sunVisibility,sunIntensity,ambientIntensity,
    exposure:clamp(.98+golden*.10+(1-daytime)*.055-cloudy*.055,.85,1.16),
    shadowRadius:1.7+Math.max(rain,mist)*1.3+golden*.45
  };
}

const vertex=`
varying vec3 vSkyDirection;
void main(){
  vSkyDirection=normalize(position.xyz);
  vec4 projected=projectionMatrix*modelViewMatrix*vec4(position,1.0);
  // Render at the far plane, behind real geometry and stars.
  gl_Position=projected.xyww;
}`;
const fragment=`
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGroundHaze;
uniform vec3 uSunDirection;
uniform vec3 uSunTint;
uniform float uSunVisibility;
uniform float uOvercast;
varying vec3 vSkyDirection;
void main(){
  vec3 direction=normalize(vSkyDirection);
  float elevation=direction.y;
  float atmosphere=pow(smoothstep(-0.08,0.90,elevation),.70);
  vec3 colour=mix(uHorizon,uZenith,atmosphere);
  colour=mix(uGroundHaze,colour,smoothstep(-.22,.025,elevation));
  float angularDistance=acos(clamp(dot(direction,normalize(uSunDirection)),-1.0,1.0));
  float warmHaze=exp(-angularDistance*4.5)*
    (1.0-smoothstep(-.1,.55,elevation))*uSunVisibility;
  float corona=exp(-angularDistance*22.0)*uSunVisibility;
  // Approximate solar angular radius: 0.27 degrees.
  float solarDisc=1.0-smoothstep(.0035,.0061,angularDistance);
  colour+=uSunTint*(warmHaze*.25+corona*.52+solarDisc*3.1)
    *(1.0-.50*uOvercast);
  gl_FragColor=vec4(max(colour,vec3(0.0)),1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class CinematicSky{
  constructor(scene){
    this.scene=scene;
    this.uniforms={
      uZenith:{value:PALETTE.dayZenith.clone()},
      uHorizon:{value:PALETTE.dayHorizon.clone()},
      uGroundHaze:{value:PALETTE.dayHorizon.clone()},
      uSunDirection:{value:new THREE.Vector3(0,1,0)},
      uSunTint:{value:PALETTE.highSun.clone()},
      uSunVisibility:{value:1},
      uOvercast:{value:0}
    };
    this.geometry=new THREE.SphereGeometry(1,40,24);
    this.material=new THREE.ShaderMaterial({
      uniforms:this.uniforms,vertexShader:vertex,fragmentShader:fragment,
      side:THREE.BackSide,depthWrite:false,depthTest:false,
      toneMapped:true,fog:false
    });
    this.mesh=new THREE.Mesh(this.geometry,this.material);
    this.mesh.name='Atmosfera cinematográfica · disco solar e dispersão';
    this.mesh.scale.setScalar(900);
    this.mesh.frustumCulled=false;
    this.mesh.renderOrder=-1000;
    scene.add(this.mesh);
  }
  update(state,focus){
    const u=this.uniforms;
    u.uZenith.value.copy(state.zenith);
    u.uHorizon.value.copy(state.horizon);
    u.uGroundHaze.value.copy(state.groundHaze);
    u.uSunDirection.value.copy(state.sunDirection);
    u.uSunTint.value.copy(state.sunColor);
    u.uSunVisibility.value=state.sunVisibility;
    u.uOvercast.value=state.cloudy;
    if(focus)this.mesh.position.copy(focus);
  }
  dispose(){
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

export function configureCinematicShadows(light,quality='high',shadowQuality='high'){
  const enabled=quality!=='low'&&shadowQuality!=='off';
  const sizes={low:1024,medium:1536,high:2048};
  const size=enabled?(sizes[shadowQuality]||2048):512;
  const shadow=light.shadow;
  if(shadow.mapSize.x!==size||shadow.mapSize.y!==size){
    shadow.map?.dispose();
    shadow.map=null;
    shadow.mapSize.set(size,size);
  }
  const extent=quality==='ultra'?155:quality==='medium'?118:142;
  shadow.camera.left=-extent;
  shadow.camera.right=extent;
  shadow.camera.top=extent;
  shadow.camera.bottom=-extent;
  shadow.camera.near=1;
  shadow.camera.far=530;
  shadow.camera.updateProjectionMatrix();
  shadow.bias=-.00012;
  shadow.normalBias=.025;
  shadow.radius=2;
  shadow.needsUpdate=true;
  return {size,extent,enabled};
}
