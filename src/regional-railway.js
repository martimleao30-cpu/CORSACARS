import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// One continuous regional railway. Track centres run through the valley,
// town outskirts, forest, mountain approaches and service corridor.
const ROUTE=[
  [-760,-470],[-530,-620],[-245,-725],[65,-665],[355,-495],
  [625,-305],[760,-30],[725,255],[510,435],[265,640],
  [-20,750],[-350,710],[-610,490],[-745,180],[-805,-125]
];
const smooth=(t)=>{t=Math.min(1,Math.max(0,t));return t*t*(3-2*t);};
const TAU=Math.PI*2;
function material(color,roughness=.84,metalness=0,extras={}){
  return new THREE.MeshStandardMaterial({color,roughness,metalness,...extras});
}
// Fine, locally generated aggregate texture: visible 3D grain on top of the
// individually scattered stones, without introducing any external downloads.
export function createRailwayBallastSurface(quality='high'){
  if(typeof document==='undefined')
    return {material:material(0x96938a,.99,0,{vertexColors:true}),textures:[]};
  const size=quality==='low'?384:quality==='ultra'?1024:768;
  const canvas=document.createElement('canvas'),normal=document.createElement('canvas');
  canvas.width=canvas.height=normal.width=normal.height=size;
  const ctx=canvas.getContext('2d'),normalCtx=normal.getContext('2d');
  const diffuse=ctx.createImageData(size,size);
  const normalData=normalCtx.createImageData(size,size);
  const heights=new Float32Array(size*size);
  let seed=128991;const random=()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  };
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x,p=i*4;
    const grain=random();
    const coarse=Math.sin(x*.17+Math.cos(y*.09))*
      Math.cos(y*.20-Math.sin(x*.06));
    const stones=Math.max(0,Math.sin(x*.72+y*.32)*Math.cos(y*.61-x*.21));
    heights[i]=grain*.63+coarse*.17+stones*.44;
    const tone=Math.min(216,Math.max(73,Math.round(104+grain*63+
      coarse*23+stones*36)));
    diffuse.data[p]=tone+5;
    diffuse.data[p+1]=tone+1;
    diffuse.data[p+2]=Math.max(0,tone-8);
    diffuse.data[p+3]=255;
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x,p=i*4;
    const dx=(heights[y*size+(x+1)%size]-
      heights[y*size+(x+size-1)%size])*.7;
    const dy=(heights[((y+1)%size)*size+x]-
      heights[((y+size-1)%size)*size+x])*.7;
    const inv=1/Math.hypot(dx,dy,1);
    normalData.data[p]=Math.round((1-dx*inv)*127.5);
    normalData.data[p+1]=Math.round((1-dy*inv)*127.5);
    normalData.data[p+2]=Math.round((1+inv)*127.5);
    normalData.data[p+3]=255;
  }
  ctx.putImageData(diffuse,0,0);normalCtx.putImageData(normalData,0,0);
  const map=new THREE.CanvasTexture(canvas),normalMap=new THREE.CanvasTexture(normal);
  for(const tex of [map,normalMap]){
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=8;
  }
  map.colorSpace=THREE.SRGBColorSpace;
  const mat=material(0xd8d5cb,.99,0,{
    map,normalMap,vertexColors:true
  });
  mat.normalScale.set(.75,.75);
  return {material:mat,textures:[map,normalMap]};
}
export function generateRailwayAlignment(terrainY,roadside,steps=950,river=null){
  const curve=new THREE.CatmullRomCurve3(
    ROUTE.map(([x,z])=>new THREE.Vector3(x,0,z)),true,'centripetal',.32);
  const points=[],heights=[];
  for(let i=0;i<steps;i++){
    const p=curve.getPoint(i/steps);
    const ground=terrainY(p.x,p.z);
    const edge=roadside?.roadProximity(p.x,p.z).edge??Infinity;
    const roadBridge=smooth((96-edge)/76);
    const nearRiver=river?.lookup(p.x,p.z);
    const riverApproach=nearRiver?
      smooth((nearRiver.width+62-nearRiver.distance)/62):0;
    // Reserve an actual bridge clearance over the excavated watercourse,
    // including natural approach ramps. Never lay a ballast ribbon in water.
    const elevation=ground+.64+Math.max(roadBridge*7.4,riverApproach*6.6);
    points.push(p);heights.push(elevation);
  }
  // Railway track grades must not jitter at every high-frequency terrain
  // bump. Smooth the elevation target on a CLOSED loop; then enforce ground
  // clearance without losing the overhead separation at bridges.
  let smoothed=heights;
  for(let pass=0;pass<8;pass++){
    smoothed=smoothed.map((h,i)=>
      (smoothed[(i-2+steps)%steps]+4*smoothed[(i-1+steps)%steps]+
      6*h+4*smoothed[(i+1)%steps]+smoothed[(i+2)%steps])/16);
  }
  for(let i=0;i<steps;i++)
    points[i].y=Math.max(terrainY(points[i].x,points[i].z)+.62,smoothed[i]);
  points.push(points[0].clone());
  const length=[0];
  for(let i=1;i<points.length;i++)
    length.push(length[i-1]+points[i].distanceTo(points[i-1]));
  return {points,length,total:length[length.length-1]};
}
// Shared closed-loop tangent: first and last duplicates MUST generate the
// exact same normal or the track, sleepers and ballast split at the seam.
export function railwayNormal(line,index){
  const n=line.points.length-1,i=index===n?0:index;
  const a=line.points[(i+n-1)%n],b=line.points[(i+1)%n];
  const dx=b.x-a.x,dz=b.z-a.z;
  const length=Math.hypot(dx,dz)||1;
  return new THREE.Vector3(-dz/length,0,dx/length);
}
export function sampleAlignment(line,distance){
  const total=line.total;
  const d=((distance%total)+total)%total;
  let lo=0,hi=line.length.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(line.length[m]<d)lo=m;else hi=m;}
  const f=(d-line.length[lo])/Math.max(1e-5,line.length[hi]-line.length[lo]);
  const point=line.points[lo].clone().lerp(line.points[hi],f);
  const dir=line.points[Math.min(hi+1,line.points.length-1)].clone()
    .sub(line.points[Math.max(0,lo-1)]).normalize();
  const side=new THREE.Vector3(-dir.z,0,dir.x).normalize();
  return {point,dir,side};
}
// Single continuous ballast deck. Unlike long overlapping BoxGeometry pieces
// this follows the actual track curvature and has a tapered drainage shoulder.
export function createBallastBedGeometry(line){
  const cross=[[-2.25,-.60],[-1.86,-.38],[0,-.34],[1.86,-.38],[2.25,-.60]];
  const vertices=[],uv=[],colors=[],indices=[];
  for(let i=0;i<line.points.length;i++){
    const side=railwayNormal(line,i);
    const p=line.points[i],distance=line.length[i];
    for(let j=0;j<cross.length;j++){
      const [lateral,vertical]=cross[j];
      const shade=1-.09*Math.abs(lateral)/2.25+
        .035*Math.sin(distance*.19+j*1.8);
      vertices.push(p.x+side.x*lateral,p.y+vertical,p.z+side.z*lateral);
      uv.push(lateral/2.6,distance/2.6);
      colors.push(shade,shade*.978,shade*.94);
    }
    if(i===line.points.length-1)continue;
    const row=i*cross.length;
    for(let j=0;j<cross.length-1;j++){
      const a=row+j,b=a+cross.length;
      indices.push(a,a+1,b,a+1,b+1,b);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.corsaRailway='continuous-tapered-ballast';
  return geometry;
}

// Steel rail with a broad foot, thin web and narrow head (rather than a tube).
// The 1.435m gauge is measured between the two rail centre-lines.
export function createSteelRailGeometry(line,offset){
  const section=[
    [-.085,-.145],[.085,-.145],[.085,-.116],
    [.026,-.102],[.026,-.018],[.06,-.01],
    [.06,.055],[-.06,.055],[-.06,-.01],
    [-.026,-.018],[-.026,-.102],[-.085,-.116]
  ];
  const vertices=[],uv=[],indices=[];
  for(let i=0;i<line.points.length;i++){
    const side=railwayNormal(line,i),p=line.points[i];
    for(const [w,h] of section){
      const lateral=offset+w;
      vertices.push(p.x+side.x*lateral,p.y+h,p.z+side.z*lateral);
      uv.push(w*4,line.length[i]/2);
    }
    if(i===line.points.length-1)continue;
    const row=i*section.length;
    for(let j=0;j<section.length;j++){
      const k=(j+1)%section.length;
      const a=row+j,b=row+k,c=a+section.length,d=b+section.length;
      indices.push(a,b,c,b,d,c);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.corsaRailway='steel-rail-profile';
  geometry.userData.gaugeM=1.435;
  return geometry;
}

const colored=(m)=>m.clone();
export class RegionalRailway{
  constructor(scene,physics,terrainY,roadside,quality='high',river=null){
    this.scene=scene;this.physics=physics;this.terrainY=terrainY;
    this.roadside=roadside;this.quality=quality;this.river=river;
    this.line=generateRailwayAlignment(terrainY,roadside,
      quality==='low'?650:1000,river);
    this.group=new THREE.Group();this.group.name='Linha Ferroviária Regional · Vale-Serra';
    scene.add(this.group);
    const ballastSurface=createRailwayBallastSurface(this.quality);
    this.textures=ballastSurface.textures;
    this.materials={
      ballast:ballastSurface.material,sleeper:material(0xb3b1a8,.91),
      rail:material(0x89949b,.27,.88,{side:THREE.DoubleSide}),
      stones:material(0xffffff,.98,0),insulator:material(0x73776f,.54,.18),
      wire:new THREE.LineBasicMaterial({color:0x747e80}),
      concrete:material(0xaeb2b1,.9),
      embankment:material(0xffffff,.99,0,{side:THREE.DoubleSide,vertexColors:true}),
      structure:material(0x747a7c,.68,.37),paint:material(0xe9e5d5,.91),
      glass:material(0x334955,.24,.32,{transparent:true,opacity:.74}),
      roof:material(0x333d48,.48,.25),body:material(0xe5e7df,.55,.28),
      accent:material(0x23667b,.5,.18),
      headlight:material(0xe2f9ee,.42,0,{emissive:0xd8f5e6,emissiveIntensity:1.4})
    };
    this.geometry=[];this.stationBodies=[];
    this.position=0;this.elapsed=0;this.stopTime=0;this.lastStop=-1;
    this.speedMS=24.5;
    this.buildTrack();this.buildStations();this.buildTrain();
    // 88 km/h between stations, not a static diorama.
    this.statistics={lengthM:Math.round(this.line.total),stations:this.stations.length,
      trainCars:this.trainCars.length,sleepers:this.sleeperCount,bridges:this.bridgeSupports,
      railSegments:this.line.points.length-1,
      ballastStones:this.ballastStones,catenaryMasts:this.catenaryMasts,
      bridgeDeckSegments:this.bridgeDeckSegments,
      embankmentSections:this.embankmentSections};
  }
  createBox(name,position,dimensions,mat,parent=this.group,collide=false){
    const geo=new THREE.BoxGeometry(...dimensions);
    this.geometry.push(geo);
    const obj=new THREE.Mesh(geo,mat);
    obj.position.copy(position);obj.name=name;obj.castShadow=true;obj.receiveShadow=true;
    parent.add(obj);
    if(collide){
      const b=new CANNON.Body({mass:0});
      b.addShape(new CANNON.Box(new CANNON.Vec3(...dimensions.map(v=>v*.5))));
      b.position.set(position.x,position.y,position.z);
      this.physics.addBody(b);this.stationBodies.push(b);
    }
    return obj;
  }
  trackGround(x,z){
    const original=this.terrainY(x,z);
    const water=this.river?.lookup(x,z);
    return water&&water.distance<water.width+8.5
      ?Math.min(original,water.waterY-1.55):original;
  }
  buildTrack(){
    const total=this.line.total,up=new THREE.Vector3(0,1,0);
    const sleeperGeo=new THREE.BoxGeometry(1,1,1);
    const ballastGeo=createBallastBedGeometry(this.line);
    this.geometry.push(sleeperGeo,ballastGeo);
    const ballast=new THREE.Mesh(ballastGeo,this.materials.ballast);
    ballast.name='Leito contínuo de balastro · taludes e drenagem';
    ballast.receiveShadow=true;
    this.group.add(ballast);
    const n=Math.floor(total/.65);
    const sleepers=new THREE.InstancedMesh(sleeperGeo,this.materials.sleeper,n);
    sleepers.name='Travessas de betão · espaçamento 65 cm';
    const dummy=new THREE.Object3D();
    for(let i=0;i<n;i++){
      const p=sampleAlignment(this.line,(i+.5)*total/n);
      dummy.position.copy(p.point);dummy.position.y-=.22;
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),
        new THREE.Vector3(p.dir.x,0,p.dir.z).normalize());
      dummy.scale.set(2.55,.17,.27);
      dummy.updateMatrix();sleepers.setMatrixAt(i,dummy.matrix);
    }
    sleepers.instanceMatrix.needsUpdate=true;
    sleepers.castShadow=this.quality==='ultra';
    sleepers.receiveShadow=true;
    this.group.add(sleepers);this.sleeperCount=n;
    for(const offset of [-.7175,.7175]){
      const geo=createSteelRailGeometry(this.line,offset);
      this.geometry.push(geo);
      const rail=new THREE.Mesh(geo,this.materials.rail);
      rail.name='Carril ferroviário perfilado · bitola 1435 mm';
      rail.receiveShadow=true;this.group.add(rail);
    }
    // Three-dimensional scattered stones break up the otherwise perfectly
    // smooth surface without requiring a mesh or draw call per rock.
    const stoneCount=Math.floor(total*(this.quality==='low'?.45:
      this.quality==='medium'?.8:this.quality==='high'?1.35:2));
    const stoneGeo=new THREE.IcosahedronGeometry(1,0);
    this.geometry.push(stoneGeo);
    const stones=new THREE.InstancedMesh(stoneGeo,this.materials.stones,stoneCount);
    stones.name='Pedras individuais do balastro';
    let seed=846827;const rand=()=>{
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;
    };
    const stoneColors=[0x89867d,0x9c9588,0x696d69,0xb0a99a];
    for(let i=0;i<stoneCount;i++){
      const d=rand()*total,p=sampleAlignment(this.line,d);
      const lateral=(rand()-.5)*3.75,scale=.042+rand()*.092;
      dummy.position.copy(p.point).addScaledVector(p.side,lateral);
      dummy.position.y-=.32+Math.abs(lateral)*.018;
      dummy.rotation.set(rand()*3,rand()*6,rand()*3);
      dummy.scale.set(scale*(.75+rand()),scale*.5,scale*(.9+rand()));
      dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);
      stones.setColorAt(i,new THREE.Color(stoneColors[Math.floor(rand()*stoneColors.length)]));
    }
    stones.instanceMatrix.needsUpdate=true;
    if(stones.instanceColor)stones.instanceColor.needsUpdate=true;
    stones.castShadow=false;stones.receiveShadow=true;
    this.group.add(stones);this.ballastStones=stoneCount;

    this.buildEmbankments();
    this.buildViaductSupports();
    this.buildCatenary();
  }
  // For the long stretches below viaduct height, connect the ballast to
  // real ground with a trapezoidal earth-and-stone formation. Otherwise the
  // 0.6–3m difference to irregular hills looks like track suspended in air.
  // Never fill a grade-separated road crossing with earth.
  buildEmbankments(){
    const positions=[],colors=[],indices=[],valid=[];
    const steps=this.line.points.length;
    const stone=new THREE.Color(0x8f8879),soil=new THREE.Color(0x726c5b);
    const widths=[-1,-.66,-.32,.32,.66,1];
    for(let i=0;i<steps;i++){
      const p=this.line.points[i];
      const side=railwayNormal(this.line,i);
      const ground=this.trackGround(p.x,p.z);
      const rise=p.y-ground;
      const edge=this.roadside?.roadProximity(p.x,p.z).edge??Infinity;
      const water=this.river?.lookup(p.x,p.z);
      const onRiver=!!water&&water.distance<water.width+17;
      valid.push(rise<=3.65&&edge>12&&!onRiver);
      const half=2.25+Math.min(7,Math.max(.45,rise*1.7));
      for(const u of widths){
        const distance=Math.abs(u)*half;
        const x=p.x+side.x*u*half,z=p.z+side.z*u*half;
        const earth=this.trackGround(x,z)+.025;
        const top=p.y-.39; // Flush with the lower face of the 3D ballast
        const t=THREE.MathUtils.smoothstep(distance,2.10,half);
        const y=THREE.MathUtils.lerp(top,earth,t);
        positions.push(x,y,z);
        const tint=stone.clone().lerp(soil,t*.75);
        colors.push(tint.r,tint.g,tint.b);
      }
      if(i===0||!valid[i]||!valid[i-1])continue;
      const previous=(i-1)*widths.length,current=i*widths.length;
      for(let j=0;j<widths.length-1;j++){
        indices.push(previous+j,current+j,previous+j+1,
          previous+j+1,current+j,current+j+1);
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.userData.corsaRailway='terrain-founded-embankment';
    this.geometry.push(geo);
    const mesh=new THREE.Mesh(geo,this.materials.embankment);
    mesh.name='Talude ferroviário · aterro ligado ao terreno';
    mesh.receiveShadow=true;
    this.group.add(mesh);
    this.embankmentSections=Math.round(indices.length/30);
  }
  // A viaduct is a continuous load-bearing span, not pillars scattered
  // randomly on a high railway. Only elevated portions receive longitudinal
  // girders, crossheads and paired columns on terrain-grounded footings.
  buildViaductSupports(){
    const total=this.line.total;
    const profile=distance=>{
      const point=sampleAlignment(this.line,distance);
      const ground=this.trackGround(point.point.x,point.point.z);
      const height=point.point.y-ground;
      const roadEdge=this.roadside?.roadProximity(point.point.x,point.point.z).edge??Infinity;
      return {...point,ground,height,roadEdge};
    };
    const span=9,pierSpacing=18;
    this.bridgeSupports=0;this.bridgeDeckSegments=0;
    for(let d=0;d<total-span;d+=span){
      const a=profile(d),b=profile(d+span);
      const crossingRoad=Math.min(a.roadEdge,b.roadEdge)<13;
      const water=this.river?.lookup((a.point.x+b.point.x)*.5,
        (a.point.z+b.point.z)*.5);
      const crossingRiver=!!water&&water.distance<water.width+16;
      if(Math.max(a.height,b.height)<2.65&&!crossingRoad&&!crossingRiver)continue;
      const mid=profile(d+span*.5);
      const length=a.point.distanceTo(b.point);
      const horizontal=Math.hypot(b.point.x-a.point.x,b.point.z-a.point.z);
      const yaw=Math.atan2(b.point.x-a.point.x,b.point.z-a.point.z);
      const pitch=-Math.atan2(b.point.y-a.point.y,horizontal);
      const girder=this.createBox('Viaduto · viga contínua de betão',
        a.point.clone().lerp(b.point,.5).add(new THREE.Vector3(0,-.78,0)),
        [4.1,.60,length+.24],this.materials.concrete);
      girder.rotation.set(pitch,yaw,0,'YXZ');
      const lip=this.createBox('Viaduto · bordo de segurança',
        a.point.clone().lerp(b.point,.5).addScaledVector(mid.side,2.05)
          .add(new THREE.Vector3(0,-.36,0)),
        [.18,.56,length+.20],this.materials.structure);
      lip.rotation.set(pitch,yaw,0,'YXZ');
      const opposite=this.createBox('Viaduto · bordo de segurança',
        a.point.clone().lerp(b.point,.5).addScaledVector(mid.side,-2.05)
          .add(new THREE.Vector3(0,-.36,0)),
        [.18,.56,length+.20],this.materials.structure);
      opposite.rotation.set(pitch,yaw,0,'YXZ');
      this.bridgeDeckSegments++;
    }
    for(let d=pierSpacing*.5;d<total;d+=pierSpacing){
      const p=profile(d);
      if(p.height<2.85||p.roadEdge<12)continue;
      const height=p.height-.95;
      const yaw=Math.atan2(p.dir.x,p.dir.z);
      const top=p.point.y-.73;
      for(const offset of [-1.06,1.06]){
        const foot=p.point.clone().addScaledVector(p.side,offset);
        const base=this.trackGround(foot.x,foot.z);
        const columnHeight=Math.max(.4,top-base-.24);
        const footing=this.createBox('Viaduto · sapata de fundação',
          new THREE.Vector3(foot.x,base+.09,foot.z),
          [1.5,.42,1.65],this.materials.concrete);
        footing.rotation.y=yaw;
        const column=this.createBox('Viaduto · pilar estrutural',
          new THREE.Vector3(foot.x,base+.28+columnHeight*.5,foot.z),
          [.78,columnHeight,.87],this.materials.concrete);
        column.rotation.y=yaw;
      }
      const crosshead=this.createBox('Viaduto · travessa de apoio',
        new THREE.Vector3(p.point.x,top-.08,p.point.z),
        [3.55,.48,1.35],this.materials.concrete);
      crosshead.rotation.y=yaw;
      this.bridgeSupports++;
    }
  }
  buildCatenary(){
    const total=this.line.total,interval=57;
    const count=Math.floor(total/interval);
    const poleGeo=new THREE.CylinderGeometry(.065,.092,6.8,8);
    const armGeo=new THREE.BoxGeometry(.10,.11,3.2);
    const insulatorGeo=new THREE.CylinderGeometry(.09,.09,.32,8);
    this.geometry.push(poleGeo,armGeo,insulatorGeo);
    const poles=new THREE.InstancedMesh(poleGeo,this.materials.structure,count);
    const arms=new THREE.InstancedMesh(armGeo,this.materials.structure,count);
    const insulators=new THREE.InstancedMesh(insulatorGeo,this.materials.insulator,count);
    const dummy=new THREE.Object3D();
    for(let i=0;i<count;i++){
      const p=sampleAlignment(this.line,i*total/count);
      const pos=p.point.clone().addScaledVector(p.side,3.2);
      dummy.position.copy(pos);dummy.position.y+=2.9;
      dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);
      dummy.updateMatrix();poles.setMatrixAt(i,dummy.matrix);
      dummy.position.copy(p.point).addScaledVector(p.side,1.5);
      dummy.position.y+=5.96;
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),
        new THREE.Vector3(p.side.x,0,p.side.z));
      dummy.scale.set(1,1,1);dummy.updateMatrix();
      arms.setMatrixAt(i,dummy.matrix);
      dummy.position.copy(p.point);dummy.position.y+=5.73;
      dummy.quaternion.identity();dummy.updateMatrix();
      insulators.setMatrixAt(i,dummy.matrix);
    }
    for(const mesh of [poles,arms,insulators]){
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
      mesh.castShadow=false;mesh.receiveShadow=true;
      this.group.add(mesh);
    }
    poles.name='Postes da catenária · espaçamento 57 m';
    arms.name='Braços de suspensão da catenária';
    insulators.name='Isoladores elétricos da catenária';
    this.catenaryMasts=count;
    // Two longitudinal wires, slightly sagging between support points.
    const wireSegments=[],messengerSegments=[];
    for(let i=0;i<count;i++){
      const start=i*total/count,span=total/count;
      for(let j=0;j<8;j++){
        const t0=j/8,t1=(j+1)/8;
        const p0=sampleAlignment(this.line,start+span*t0).point;
        const p1=sampleAlignment(this.line,start+span*t1).point;
        const wire=(p,t,y,drop)=>[
          p.x,p.y+y-drop*4*t*(1-t),p.z
        ];
        wireSegments.push(...wire(p0,t0,5.65,.12),...wire(p1,t1,5.65,.12));
        messengerSegments.push(
          ...wire(p0,t0,6.48,.31),...wire(p1,t1,6.48,.31));
      }
    }
    for(const [name,vertices] of [
      ['Fio de contacto elétrico',wireSegments],
      ['Cabo mensageiro da catenária',messengerSegments]
    ]){
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',
        new THREE.Float32BufferAttribute(vertices,3));
      geometry.computeBoundingSphere();this.geometry.push(geometry);
      const mesh=new THREE.LineSegments(geometry,this.materials.wire);
      mesh.name=name;this.group.add(mesh);
    }
  }
  buildStations(){
    const targets=[
      {id:'central',name:'Estação do Vale Central',x:475,z:370},
      {id:'serra',name:'Apeadeiro da Serra',x:-345,z:695}
    ];
    this.stations=[];
    for(const target of targets){
      let closest=0,dist=Infinity;
      for(let i=0;i<this.line.points.length-1;i++){
        const p=this.line.points[i],d=(p.x-target.x)**2+(p.z-target.z)**2;
        if(d<dist){dist=d;closest=i;}
      }
      const distance=this.line.length[closest],sample=sampleAlignment(this.line,distance);
      const side=sample.side;
      const direction=sample.dir.clone().setY(0).normalize();
      const position=sample.point;
      const normal=new THREE.Vector3(-direction.z,0,direction.x);
      const station=new THREE.Group();station.name=target.name;
      station.position.copy(position);
      station.rotation.y=Math.atan2(direction.x,direction.z);
      this.group.add(station);
      const stationStart=this.group.children.length;
      const ground=this.terrainY(position.x,position.z);
      const railY=position.y;
      const platform=this.createBox(target.name+' · Plataforma',
        new THREE.Vector3(position.x+normal.x*3.6,railY-.14,
          position.z+normal.z*3.6),[3.5,.34,55],this.materials.concrete);
      platform.rotation.y=station.rotation.y;
      const edge=this.createBox(target.name+' · Faixa tátil',
        new THREE.Vector3(position.x+normal.x*2.08,railY+.04,
          position.z+normal.z*2.08),[.23,.018,51],this.materials.paint);
      edge.rotation.y=station.rotation.y;
      // Glass-and-steel shelter mounted on the platform.
      const local=(x,y,z)=>new THREE.Vector3(position.x+normal.x*x+direction.x*z,
        railY+y,position.z+normal.z*x+direction.z*z);
      for(const d of [-9,9])for(const a of [3.4,5.15])
        this.createBox('Estação · Pilar metálico',local(a,1.7,d),
          [.15,3.4,.15],this.materials.structure);
      this.createBox('Estação · Cobertura',local(4.25,3.43,0),
        [3.4,.28,22],this.materials.roof);
      this.createBox('Estação · Sala de espera',local(5.1,1.13,0),
        [.14,2.15,17],this.materials.glass);
      for(const z of [-6,6])
        this.createBox('Estação · Banco',local(4.5,.56,z),
          [1.0,.12,2.4],this.materials.structure);
      if(target.id==='central'){
        // Station building starts outside the platform; no road crossings.
        this.createBox('Estação · Bilheteira',local(10,1.85,0),
          [8.2,3.7,19],this.materials.body);
        this.createBox('Estação · Telhado da bilheteira',local(10,3.89,0),
          [8.8,.42,20],this.materials.roof);
        this.createBox('Estação · Fachada envidraçada',local(5.86,1.8,0),
          [.13,2.5,14],this.materials.glass);
      }
      // A pedestrian staircase joins the high platform to the landscape.
      const height=Math.max(1.4,railY-ground);
      const steps=10;
      for(let k=0;k<steps;k++){
        const v=(k+.5)/steps;
        this.createBox('Estação · Acesso pedonal',
          local(7+v*(3+height),-height*(1-v)+.11,22),
          [1.75,.20,1.3],this.materials.concrete);
      }
      // Keep every station part in its station group without modifying their
      // terrain-following world transforms.
      this.group.updateMatrixWorld(true);
      station.updateMatrixWorld(true);
      for(const part of this.group.children.slice(stationStart))station.attach(part);
      this.stations.push({...target,point:position.clone(),distance,group:station});
    }
  }
  buildTrain(){
    this.trainCars=[];const mats=this.materials;
    for(let k=0;k<3;k++){
      const group=new THREE.Group();
      group.name=k===0?'Automotora elétrica regional · Cabina':'Carruagem de passageiros '+k;
      const name=k===0?'Cabina':'Carruagem';
      const body=this.createBox(name,new THREE.Vector3(0,1.45,0),
        [2.65,2.55,15.6],mats.body,group);
      this.createBox('Banda lateral',new THREE.Vector3(0,1.12,0),
        [2.70,.50,15.55],mats.accent,group);
      this.createBox('Teto perfilado',new THREE.Vector3(0,2.82,0),
        [2.48,.22,14.7],mats.roof,group);
      for(const side of [-1,1]){
        const sideX=side*1.34;
        for(let j=-3;j<=3;j++){
          const z=j*1.82;
          const win=this.createBox('Janela de passageiros',
            new THREE.Vector3(sideX,2.0,z),[.04,.81,1.28],mats.glass,group);
        }
        for(const end of [-4.7,4.7])
          this.createBox('Porta da carruagem',
            new THREE.Vector3(sideX,1.35,end),[.06,1.8,.95],mats.structure,group);
      }
      for(const z of [-6.05,6.05]){
        this.createBox('Bogies do comboio',new THREE.Vector3(0,.21,z),
          [2.25,.35,2.0],mats.structure,group);
        for(const x of [-1.12,1.12]){
          for(const offset of [-.60,.60]){
            const geo=new THREE.CylinderGeometry(.39,.39,.16,12);
            this.geometry.push(geo);
            const wheel=new THREE.Mesh(geo,mats.roof);
            wheel.position.set(x,.20,z+offset);wheel.rotation.z=Math.PI/2;
            wheel.name='Rodas de aço';group.add(wheel);
          }
        }
      }
      if(k===0){
        for(const end of [-1,1]){
          this.createBox('Para-brisas da automotora',
            new THREE.Vector3(0,2.0,end*7.86),[2.15,1.05,.075],
            mats.glass,group);
          for(const x of [-.72,.72])
            this.createBox('Farol LED da automotora',
              new THREE.Vector3(x,1.1,end*7.87),
              [.27,.13,.09],mats.headlight,group);
        }
      }
      this.group.add(group);this.trainCars.push(group);
    }
    this.headlight=new THREE.PointLight(0xe8f7ef,0,22,2);
    this.trainCars[0].add(this.headlight);
    this.headlight.position.set(0,1.1,7.6);
    this.updateTrain(0);
  }
  updateTrain(dt){
    this.elapsed+=Math.max(0,dt);
    if(this.stopTime>0)this.stopTime=Math.max(0,this.stopTime-dt);
    else{
      let speed=this.speedMS;
      for(let i=0;i<this.stations.length;i++){
        const s=this.stations[i],ahead=((s.distance-this.position)+this.line.total)%this.line.total;
        if(ahead<75)speed*=smooth(ahead/75);
        if(ahead<1.4&&this.lastStop!==i){this.stopTime=7.5;this.lastStop=i;}
        if(ahead>200&&this.lastStop===i)this.lastStop=-1;
      }
      this.position=(this.position+Math.max(.04,speed)*Math.max(0,dt))%this.line.total;
    }
    for(let k=0;k<this.trainCars.length;k++){
      const p=sampleAlignment(this.line,this.position-k*17.8);
      this.trainCars[k].position.copy(p.point);
      this.trainCars[k].quaternion.setFromUnitVectors(
        new THREE.Vector3(0,0,1),p.dir);
    }
    this.headlight.intensity=1.8;
  }
  update(dt,paused=false){if(!paused)this.updateTrain(Math.min(.12,Math.max(0,dt)));}
  nearestTrack(x,z){
    let best=Infinity;
    for(let i=0;i<this.line.points.length-1;i+=2){
      const p=this.line.points[i];
      const d=Math.hypot(x-p.x,z-p.z);
      best=Math.min(best,d);
    }
    return best;
  }
  dispose(){
    this.scene.remove(this.group);
    for(const body of this.stationBodies)this.physics.removeBody(body);
    for(const geometry of this.geometry)geometry.dispose();
    for(const mat of Object.values(this.materials))mat.dispose();
    for(const texture of this.textures)texture.dispose();
  }
}
