import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Self-contained, streaming highway service station. The layout uses the
// highway tangent and signed outer verge, not fixed global X/Z coordinates.
// No third-party marks or remote assets.
const BASE_GREY=0x353e42;
const make=(color,roughness=.8,metalness=0,extras={})=>
  new THREE.MeshStandardMaterial({color,roughness,metalness,...extras});
const safe=(x,min,max)=>Math.max(min,Math.min(max,x));
export const SERVICE_LAYOUT=Object.freeze({
  near:15,far:86,front:-55,back:55,
  fuelRows:[34,51],pumpStations:[-29,-13],parkingRows:[31,44],
  roofV:42.5,roofZ:-22,shopV:73,shopZ:9
});

export function serviceFrame(region,terrainY){
  const tangent=region.tangent.clone().setY(0).normalize();
  const outward=region.side.clone().setY(0).normalize();
  const anchor=region.roadPoint.clone();
  anchor.y=terrainY(anchor.x,anchor.z);
  const direction=region.side?.lengthSq()>0?
    Math.sign(tangent.x*outward.z-tangent.z*outward.x)||1:1;
  const yaw=Math.atan2(tangent.x,tangent.z);
  // Local +X is the "right" of local +Z. Highway side -1 occupies +X.
  const factor=-direction;
  const world=(v,z)=>{
    const x=anchor.x+outward.x*v+tangent.x*z;
    const zz=anchor.z+outward.z*v+tangent.z*z;
    return {x,z:zz};
  };
  const height=(v,z)=>{
    const p=world(v,z);
    return terrainY(p.x,p.z)-anchor.y;
  };
  return {anchor,tangent,outward,direction,factor,yaw,world,height};
}

export function buildHighwayService(group,physics,bodies,region,terrainY,quality='high'){
  const frame=serviceFrame(region,terrainY);
  const root=new THREE.Group();
  root.name='Área de serviço · infraestrutura orientada à via';
  root.position.copy(frame.anchor);
  root.rotation.y=frame.yaw;
  group.add(root);
  const materials=[
    make(0x495156,.97),make(0x656d70,.94),make(0xb5b9b6,.85),
    make(0xe3dfd1,.79),make(0x677477,.62,.45),make(0x343c42,.51,.2),
    make(0x244f64,.52,.22),make(0x81938e,.67,.18),
    make(0x99a3a6,.42,.75),make(0xadbab6,.6,.16),
    make(0xf5eee1,.87),make(0x78949a,.19,.16,{transparent:true,opacity:.82}),
    make(0xd5d3c5,.85),make(0x505757,.81),make(0x1a2428,.83),
    make(0xe1e7db,.38,.06,{emissive:0xc9dddc,emissiveIntensity:.05}),
    make(0x646b71,.61,.18),make(0xb0a28b,.92)
  ];
  const [asphalt,concrete,white,cream,steel,graphite,blue,teal,metal,trim,
    marking,glass,slab,charcoal,dark,led,paint,timber]=materials;
  const lamps=[],textures=[];
  const stats={fuelPumps:0,canopyColumns:0,parkingSpaces:0,
    lights:0,accessRoads:0,collisionBodies:0,buildings:0};
  const toLocal=(v,z,y=0)=>new THREE.Vector3(frame.factor*v,y,z);
  const absolute=(v,z,y)=>{
    const p=frame.world(v,z);
    return {x:p.x,z:p.z,y:frame.anchor.y+y};
  };
  function box(name,v,z,w,h,d,material,{bottom=null,collide=false}={}){
    const elevation=bottom??frame.height(v,z);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    mesh.position.copy(toLocal(v,z,elevation+h*.5));
    mesh.castShadow=h>.45;mesh.receiveShadow=true;
    mesh.name=name;root.add(mesh);
    if(collide){
      const position=absolute(v,z,elevation+h*.5);
      const body=new CANNON.Body({mass:0});
      body.addShape(new CANNON.Box(new CANNON.Vec3(w*.5,h*.5,d*.5)));
      body.position.set(position.x,position.y,position.z);
      body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),frame.yaw);
      physics.addBody(body);bodies.push(body);stats.collisionBodies++;
    }
    return mesh;
  }
  function cylinder(name,v,z,r,ht,material,{bottom=null,collide=false,segments=10}={}){
    const elevation=bottom??frame.height(v,z);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r*.88,r,ht,segments),material);
    mesh.position.copy(toLocal(v,z,elevation+ht*.5));
    mesh.castShadow=ht>1;mesh.receiveShadow=true;mesh.name=name;root.add(mesh);
    if(collide){
      const at=absolute(v,z,elevation+ht*.5);
      const body=new CANNON.Body({mass:0});
      body.addShape(new CANNON.Cylinder(r*.88,r,ht,segments));
      body.position.set(at.x,at.y,at.z);
      physics.addBody(body);bodies.push(body);stats.collisionBodies++;
    }
    return mesh;
  }
  function roadway(name,v0,v1,z0,z1,material,samplesV=6,samplesZ=12){
    const vertices=[],uv=[],indices=[];
    for(let i=0;i<=samplesV;i++)for(let j=0;j<=samplesZ;j++){
      const v=v0+(v1-v0)*i/samplesV,z=z0+(z1-z0)*j/samplesZ;
      vertices.push(frame.factor*v,frame.height(v,z)+.20,z);
      uv.push((v-v0)/5,(z-z0)/5);
    }
    for(let i=0;i<samplesV;i++)for(let j=0;j<samplesZ;j++){
      const a=i*(samplesZ+1)+j,b=a+samplesZ+1,c=a+1,d=b+1;
      if(frame.factor>0)indices.push(a,c,b,b,c,d);
      else indices.push(a,b,c,b,d,c);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geo.setIndex(indices);geo.computeVertexNormals();
    const road=new THREE.Mesh(geo,material);
    road.name=name;road.receiveShadow=true;root.add(road);
    // A real collision-backed driveway/apron lets the car use the facility.
    const body=new CANNON.Body({mass:0,material:new CANNON.Material('dry')});
    body.addShape(new CANNON.Trimesh(vertices,indices));
    body.position.set(frame.anchor.x,frame.anchor.y,frame.anchor.z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),frame.yaw);
    physics.addBody(body);bodies.push(body);stats.collisionBodies++;
    return road;
  }
  // Paved base follows undulating terrain rather than hovering as one plane.
  roadway('Área de serviço · praça circulável',15,86,-55,55,asphalt,12,18);
  roadway('Área de serviço · acesso de entrada',region.roadWidth*.5+.3,22,-44,-36,asphalt,5,6);
  roadway('Área de serviço · acesso de saída',region.roadWidth*.5+.3,22,36,44,asphalt,5,6);
  stats.accessRoads=2;
  for(const entry of [-40,40]){
    // Road-oriented arrows and white entrance/exit lips at the apron edge.
    box('Área de serviço · linha de entrada',17.3,entry,5,.028,.19,
      marking,{bottom:frame.height(17.3,entry)+.22});
  }

  // 38 m canopy, real steel support columns and profiled roof edge.
  const roofBase=Math.max(
    frame.height(25,-45),frame.height(59,-45),
    frame.height(25,2),frame.height(59,2))+5.65;
  const roofV=SERVICE_LAYOUT.roofV,roofZ=SERVICE_LAYOUT.roofZ;
  box('Área de serviço · canopy',roofV,roofZ,37,.58,49,graphite,
    {bottom:roofBase});
  box('Área de serviço · canopy superior',roofV,roofZ,37.8,.18,49.8,
    metal,{bottom:roofBase+.56});
  for(const z of [-45.5,1.5])
    box('Área de serviço · fascia canopy',roofV,z,38,.64,.32,blue,
      {bottom:roofBase+.13});
  for(const v of [24,61])
    box('Área de serviço · perfil lateral',v,roofZ,.25,.70,49,trim,
      {bottom:roofBase+.06});
  for(const v of [27,58])for(const z of [-42,-2]){
    const ground=frame.height(v,z);
    const colHeight=Math.max(3.1,roofBase-ground+.14);
    cylinder('Área de serviço · coluna metálica',v,z,.20,colHeight,
      metal,{collide:true});
    box('Área de serviço · base da coluna',v,z,.72,.23,.72,
      concrete,{collide:true});
    stats.canopyColumns++;
  }

  // Three pairs of dispense units across two islands. Decorative hose loops,
  // screens, protective bollards, foundations and small unit variations.
  for(const [lane,rowV] of SERVICE_LAYOUT.fuelRows.entries()){
    const islandZ=-21;
    const ground=frame.height(rowV,islandZ);
    box('Área de serviço · ilha de bombas',rowV,islandZ,2.75,.23,31,
      slab,{bottom:ground+.18,collide:true});
    for(const [i,z] of SERVICE_LAYOUT.pumpStations.entries()){
      const grade=frame.height(rowV,z)+.41;
      const hue=(lane+i)%2===0?blue:teal;
      box('Área de serviço · bomba de combustível',rowV,z,.98,1.75,.78,
        graphite,{bottom:grade,collide:true});stats.fuelPumps++;
      box('Área de serviço · painel da bomba',rowV,z,1,.55,.81,
        hue,{bottom:grade+1.20});
      for(const sign of [-1,1]){
        const frontV=rowV+sign*.518;
        box('Área de serviço · visor da bomba',frontV,z,.045,.38,.54,
          dark,{bottom:grade+1.07});
        box('Área de serviço · mostrador digital',frontV+sign*.028,z,
          .015,.19,.39,led,{bottom:grade+1.17});
      }
      cylinder('Área de serviço · suporte da mangueira',
        rowV,z+.40,.033,1.00,steel,{bottom:grade+.28,segments:7});
      // A bent rubber hose remains visually attached to its dispenser.
      const hosePoints=[
        new THREE.Vector3(frame.factor*(rowV+.47),grade+1.19,z+.21),
        new THREE.Vector3(frame.factor*(rowV+.76),grade+.96,z+.37),
        new THREE.Vector3(frame.factor*(rowV+.81),grade+.41,z+.64),
        new THREE.Vector3(frame.factor*(rowV+.58),grade+.22,z+.67)
      ];
      const hose=new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hosePoints),10,.036,5,false),
        dark);
      hose.name='Área de serviço · mangueira';root.add(hose);
      for(const dz of [-1.24,1.24]){
        cylinder('Área de serviço · proteção da bomba',rowV,z+dz,
          .11,.85,metal,{collide:true});
      }
    }
  }

  // Shop with actual windows, door glazing, fascia and a walkable pavement.
  const shopV=SERVICE_LAYOUT.shopV,shopZ=SERVICE_LAYOUT.shopZ;
  const shopGround=frame.height(shopV,shopZ);
  box('Área de serviço · loja café',shopV,shopZ,19,4.65,32,
    concrete,{bottom:shopGround+.19,collide:true});stats.buildings++;
  box('Área de serviço · cobertura da loja',shopV,shopZ,20.2,.38,33.2,
    graphite,{bottom:shopGround+4.95});
  box('Área de serviço · passeio da loja',61.9,shopZ,3,.23,35,
    slab,{collide:true});
  box('Área de serviço · pala de entrada',62.9,shopZ,2.9,.20,21,
    metal,{bottom:shopGround+3.29});
  const shopFront=shopV-19*.5-.08;
  for(const z of [-7.5,-1.5,5.5,12]){
    box('Área de serviço · caixilharia',shopFront,z,.14,2.38,4.1,
      graphite,{bottom:shopGround+.88});
    box('Área de serviço · montra',shopFront-.11,z,.062,2.17,3.75,
      glass,{bottom:shopGround+.98});
    box('Área de serviço · peitoril',shopFront-.22,z,.38,.15,4.25,
      metal,{bottom:shopGround+.8});
  }
  box('Área de serviço · porta da loja',shopFront-.24,2.1,.15,2.50,1.52,
    dark,{bottom:shopGround+.29});
  box('Área de serviço · vidro da porta',shopFront-.32,2.1,.035,1.55,1.20,
    glass,{bottom:shopGround+.96});
  box('Área de serviço · letreiro loja',shopFront-.25,shopZ,
    .21,.83,20,blue,{bottom:shopGround+3.62});

  // Ten marked parking spaces with two low separator islands. Markings are
  // visual only, while larger concrete curbs have physical collision.
  for(const [row,z] of SERVICE_LAYOUT.parkingRows.entries()){
    for(let i=0;i<5;i++){
      const v=21+i*8.4;
      box('Área de serviço · lugar de estacionamento',v,z,3.05,.024,.12,
        marking,{bottom:frame.height(v,z)+.225});
      for(const edge of [-2.65,2.65]){
        box('Área de serviço · delimitador',v+edge,z, .10,.024,5.15,
          marking,{bottom:frame.height(v+edge,z)+.225});
      }
      stats.parkingSpaces++;
    }
    box('Área de serviço · separador de parque',64,z,.6,.22,6,
      concrete,{collide:true});
  }
  for(const z of [-52,52])
    box('Área de serviço · delimitador de circulação',66,z,29,.24,.25,
      concrete,{collide:true});

  // Dedicated rest area plus technical facilities beside the shop.
  for(const z of [20,26]){
    box('Área de serviço · banco',shopV,z,2.1,.18,.48,
      timber,{bottom:frame.height(shopV,z)+.54});
    for(const dx of [-.77,.77])
      box('Área de serviço · apoio de banco',shopV+dx,z,.12,.5,.28,
        steel);
  }
  box('Área de serviço · zona técnica',80,-17,4,2.1,7,charcoal,
    {collide:true});
  box('Área de serviço · contentor de reciclagem',67,26,1.1,1.42,1.1,
    teal,{collide:true});

  // Neutral, unbranded highway furniture and illuminated signage.
  function board(text,v,z,width=5.2,h=1.35,y=3.4){
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=176;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#224457';ctx.fillRect(0,0,512,176);
    ctx.fillStyle='#eaf1e9';ctx.font='bold 36px sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(text,256,88);
    const tx=new THREE.CanvasTexture(canvas);
    tx.colorSpace=THREE.SRGBColorSpace;textures.push(tx);
    const signMat=new THREE.MeshBasicMaterial({
      map:tx,side:THREE.DoubleSide});
    materials.push(signMat);
    box('Área de serviço · painel '+text,v,z,width,h,.07,signMat,
      {bottom:frame.height(v,z)+y});
  }
  cylinder('Área de serviço · pórtico de sinalização',19,-51,.095,3.7,
    metal,{collide:false});
  board('SERVIÇOS · COMBUSTÍVEL',19,-51,6.5,1.18,3.10);
  board('CAFÉ · PARQUE',63,22,5.7,1.0,2.65);
  board('VALE · ÁREA DE SERVIÇO',shopFront-.45,shopZ,12,.83,
    shopGround+3.65-frame.height(shopFront-.45,shopZ));

  // Canopy light boxes glow at night. Nearby real point lights illuminate
  // the forecourt, limited to four lights to preserve the driving frame rate.
  for(const v of [32,53])for(const z of [-36,-15]){
    box('Área de serviço · painel LED',v,z,1.1,.08,3.6,
      led,{bottom:roofBase-.15});
    if(lamps.length<2){
      const lamp=new THREE.PointLight(0xe4ede7,0,22,2);
      lamp.position.copy(toLocal(v,z,roofBase-.6));
      root.add(lamp);lamps.push(lamp);
    }
  }
  for(const [v,z] of [[21,52],[60,49]]){
    const level=frame.height(v,z);
    cylinder('Área de serviço · poste LED',v,z,.13,7.5,
      metal,{collide:true});
    box('Área de serviço · luminária LED',v,z,.7,.14,1.5,
      led,{bottom:level+7.36});
    const light=new THREE.PointLight(0xf6e7ce,0,28,2);
    light.position.copy(toLocal(v,z,level+7.2));root.add(light);lamps.push(light);
  }
  stats.lights=lamps.length;
  root.userData.serviceLights=lamps;
  root.userData.serviceMaterials=materials;
  root.userData.serviceTextures=textures;
  root.userData.serviceStats=stats;
  root.userData.serviceFrame=frame;
  root.userData.serviceDispose=()=>{
    for(const tx of textures)tx.dispose();
    for(const material of materials)material.dispose();
  };
  return {root,stats,lights:lamps,frame};
}
