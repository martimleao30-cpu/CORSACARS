import * as THREE from 'three';

// Reusable tuft geometry and spatial meadow palette. All variation is
// deterministic, including leaf shapes, micro-camber and large-scale colour.
const TAU=Math.PI*2;
const clamp=THREE.MathUtils.clamp;
function rng(seed){
  let s=seed>>>0;
  return ()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);
}
export function createMeadowTuftGeometry(quality='high'){
  const count={low:4,medium:5,high:7,ultra:8}[quality]||7;
  const r=rng(741813);
  const vertices=[],colours=[],indices=[];
  for(let blade=0;blade<count;blade++){
    const angle=TAU*(blade+r()*.38)/count;
    const ca=Math.cos(angle),sa=Math.sin(angle);
    const height=.66+r()*.5;
    const width=.063+r()*.065;
    const lean=(r()-.5)*.34;
    const bend=(r()-.5)*.16;
    const tint=.8+r()*.22;
    const base=vertices.length/3;
    // Slightly asymmetric leaf ribbons, with a raised midrib and tapered tip.
    // Segmented stems allow silhouettes to curve rather than look like cards.
    const profile=[
      [-1,0,0], [1,0,0],
      [-.77,.38,.12], [.68,.38,.1],
      [-.39,.76,.53], [.30,.76,.47],
      [0,1,1.0]
    ];
    for(let j=0;j<profile.length;j++){
      const [side,t,curve]=profile[j];
      const distance=side*width*(1-.25*t);
      const out=(lean*t*t+bend*curve);
      const x=distance*ca-out*sa;
      const z=distance*sa+out*ca;
      const y=height*t;
      vertices.push(x,y,z);
      const baseShade=t>.99?1.06:t>.75?.98:.80+.1*t;
      colours.push(
        Math.min(1,tint*baseShade*.90),
        Math.min(1,tint*baseShade),
        Math.min(1,tint*baseShade*.75));
    }
    indices.push(base,base+1,base+2,base+1,base+3,base+2,
      base+2,base+3,base+4,base+3,base+5,base+4,
      base+4,base+5,base+6);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.userData.corsaGrass='multi-blade-curved-meadow';
  geo.userData.blades=count;
  return geo;
}

export function meadowProfile(x,z,edge=40){
  // Low-frequency noise creates large areas of sparse/dense meadow. Details
  // use separate high-frequency bands so the colour is not tiled uniformly.
  const macro=Math.sin(x*.022+Math.sin(z*.011))*Math.cos(z*.019-x*.006);
  const micro=Math.sin(x*.093+z*.031)*Math.cos(z*.084-x*.022);
  const moisture=.5+.26*Math.sin(x*.006+Math.cos(z*.012))*
    Math.cos(z*.008-Math.sin(x*.011))+.11*micro;
  const dryness=clamp(.52-.50*moisture+.20*macro,0,1);
  const roadside=1-THREE.MathUtils.smoothstep(edge,3,23);
  const gap=THREE.MathUtils.smoothstep(macro+micro*.19,-.71,-.20);
  const density=clamp((.41+.55*gap)*(1-.34*roadside),.09,.98);
  const height=clamp((.66+.26*micro+.18*macro)*
    (1-.60*roadside),.25,1.30);
  const warmth=dryness*.72+roadside*.15;
  const lush=new THREE.Color(0x769160);
  const dry=new THREE.Color(0xa39567);
  const fresh=new THREE.Color(0x647f4c);
  const color=fresh.lerp(lush,clamp(moisture,0,1))
    .lerp(dry,clamp(warmth,0,1))
    .multiplyScalar(clamp(.88+.095*micro, .75,1.07));
  return {density,height,moisture,dryness,roadside,color,macro,micro};
}

export function createMeadowWindMaterial(){
  const wind={value:0};
  const mat=new THREE.MeshStandardMaterial({
    color:0xffffff,vertexColors:true,roughness:.96,metalness:0,
    side:THREE.DoubleSide
  });
  mat.onBeforeCompile=shader=>{
    shader.uniforms.uCorsaWind=wind;
    shader.vertexShader=shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nuniform float uCorsaWind;'
    );
    shader.vertexShader=shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n'+
      'float leafFlex=pow(clamp(position.y,0.0,1.4),1.85);\n'+
      'float tuftHeight=clamp(instanceMatrix[1].y,0.25,1.5);\n'+
      'float windPhase=instanceMatrix[3].x*.067+instanceMatrix[3].z*.043;\n'+
      'float windWave=sin(uCorsaWind*1.12+windPhase)*.045+'+
      'sin(uCorsaWind*.77+windPhase*1.8)*.019;\n'+
      'transformed.x+=windWave*leafFlex*tuftHeight;\n'+
      'transformed.z+=cos(uCorsaWind*.93+windPhase)*.028*leafFlex*tuftHeight;\n'
    );
  };
  mat.customProgramCacheKey=()=> 'corsa-meadow-wind-v2';
  return {mat,wind};
}
