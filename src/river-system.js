import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// The river is a geographical feature, not arbitrary ponds. Its centreline
// flows through the eastern valley and intersects roads at actual coordinates.
export const RIVER_WAYPOINTS=Object.freeze([
  [690,1310],[735,1090],[675,865],[625,650],[535,430],
  [490,245],[545,40],[675,-185],[745,-435],
  [870,-695],[1060,-910],[1260,-1120],[1410,-1400]
]);
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const smooth=x=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
const cross=(a,b)=>a.x*b.z-a.z*b.x;
const nearest=(x,z,a,b)=>{
  const dx=b.x-a.x,dz=b.z-a.z,m=dx*dx+dz*dz;
  const u=m?clamp(((x-a.x)*dx+(z-a.z)*dz)/m,0,1):0;
  const px=a.x+u*dx,pz=a.z+u*dz;
  return {u,distance:Math.hypot(px-x,pz-z),x:px,z:pz};
};
const crossing=(a,b,c,d)=>{
  const r={x:b.x-a.x,z:b.z-a.z},s={x:d.x-c.x,z:d.z-c.z};
  const denom=cross(r,s);
  if(Math.abs(denom)<.00001)return null;
  const q={x:c.x-a.x,z:c.z-a.z};
  const t=cross(q,s)/denom,u=cross(q,r)/denom;
  if(t<0||t>1||u<0||u>1)return null;
  const angle=Math.abs(denom)/(Math.hypot(r.x,r.z)*Math.hypot(s.x,s.z));
  if(angle<.22)return null; // No bridge for river-parallel roads.
  return {x:a.x+t*r.x,z:a.z+t*r.z,angle};
};
const seedRandom=seed=>()=>{
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return seed/4294967296;
};

export class RiverSystem {
  constructor(scene,physics,network,terrainY,quality='high'){
    this.scene=scene;this.physics=physics;this.network=network;
    this.terrainY=terrainY;this.quality=quality;
    this.group=new THREE.Group();this.group.name='Rio da Ribeira Leste · água corrente';
    scene.add(this.group);
    this.bodies=[];this.geometries=[];this.materials=[];
    this.time=0;
    const route=new THREE.CatmullRomCurve3(
      RIVER_WAYPOINTS.map(([x,z])=>new THREE.Vector3(x,0,z)),
      false,'centripetal',.45);
    const sampleCount=quality==='ultra'?1100:quality==='low'?420:780;
    this.points=route.getSpacedPoints(sampleCount).map((p,i)=>{
      const tangent=route.getTangentAt(i/sampleCount);
      const len=Math.hypot(tangent.x,tangent.z)||1;
      const width=8.5+2.7*Math.sin(i*.033)+1.0*Math.sin(i*.13);
      return {x:p.x,z:p.z,y:terrainY(p.x,p.z)-1.3,
        width:Math.max(6.5,width),nx:-tangent.z/len,nz:tangent.x/len};
    });
    this.bucketSize=42;this.buckets=new Map();
    for(let i=0;i<this.points.length-1;i++){
      const a=this.points[i],b=this.points[i+1],margin=28;
      for(let gx=Math.floor((Math.min(a.x,b.x)-margin)/this.bucketSize);
        gx<=Math.floor((Math.max(a.x,b.x)+margin)/this.bucketSize);gx++)
        for(let gz=Math.floor((Math.min(a.z,b.z)-margin)/this.bucketSize);
          gz<=Math.floor((Math.max(a.z,b.z)+margin)/this.bucketSize);gz++){
          const key=gx+','+gz;
          if(!this.buckets.has(key))this.buckets.set(key,[]);
          this.buckets.get(key).push(i);
        }
    }
    this.crossings=this.findCrossings();
    this.buildWater();
    this.buildRocks();
    this.buildBridges();
    this.statistics={
      riverLengthM:Math.round(route.getLength()),
      bridgeCount:this.crossings.length,
      boulders:this.rocks,
      riverSections:this.points.length-1
    };
  }
  lookup(x,z){
    const ids=this.buckets.get(Math.floor(x/this.bucketSize)+','+
      Math.floor(z/this.bucketSize))||[];
    let result=null,best=Infinity;
    for(const i of ids){
      const a=this.points[i],b=this.points[i+1];
      const point=nearest(x,z,a,b);
      if(point.distance>=best)continue;
      best=point.distance;
      result={...point,width:a.width+(b.width-a.width)*point.u,
        waterY:a.y+(b.y-a.y)*point.u,index:i};
    }
    return result;
  }
  contains(x,z,margin=0){
    const p=this.lookup(x,z);
    return !!p&&p.distance<p.width+margin;
  }
  carveTerrain(geometry){
    const vertices=geometry.getAttribute('position');
    const cols=vertices.count;
    let affected=0;
    for(let i=0;i<cols;i++){
      const x=vertices.getX(i),z=vertices.getZ(i),p=this.lookup(x,z);
      if(!p)continue;
      const inner=p.width+1.8,outer=p.width+17;
      if(p.distance>=outer)continue;
      const factor=1-smooth((p.distance-inner)/(outer-inner));
      const current=vertices.getY(i);
      const bed=p.waterY-1.25;
      const desired=Math.min(current,bed);
      const next=current+(desired-current)*factor;
      if(Math.abs(next-current)<.0005)continue;
      vertices.setY(i,next);
      affected++;
    }
    if(affected){
      vertices.needsUpdate=true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
    }
    this.statistics.terrainVertices=affected;
    return affected;
  }
  findCrossings(){
    const hits=[];
    for(const road of this.network.roads){
      if(!road.points?.length||road.width<5)continue;
      for(let i=0;i<road.points.length-1;i++){
        const a=road.points[i],b=road.points[i+1];
        const mid={x:(a.x+b.x)*.5,z:(a.z+b.z)*.5};
        if(!this.lookup(mid))continue;
        // Spatial hashes keep detection cheap even on the entire 4km network.
        const segmentIds=new Set();
        for(const p of [a,b,mid]){
          const cx=Math.floor(p.x/this.bucketSize),cz=Math.floor(p.z/this.bucketSize);
          for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)
            for(const k of this.buckets.get((cx+dx)+','+(cz+dz))||[])
              segmentIds.add(k);
        }
        for(const k of segmentIds){
          const hit=crossing(a,b,this.points[k],this.points[k+1]);
          if(!hit)continue;
          if(hits.some(h=>h.roadId===road.id&&
            Math.hypot(h.x-hit.x,h.z-hit.z)<55))continue;
          const d=Math.hypot(b.x-a.x,b.z-a.z)||1;
          hits.push({...hit,roadId:road.id,road,
            direction:{x:(b.x-a.x)/d,z:(b.z-a.z)/d}});
        }
      }
    }
    return hits;
  }
  buildWater(){
    const pos=[],uv=[],indices=[],bank=[];
    for(let i=0;i<this.points.length;i++){
      const p=this.points[i];
      const prev=this.points[Math.max(0,i-1)];
      const along=i?Math.hypot(p.x-prev.x,p.z-prev.z):0;
      for(let j=0;j<=8;j++){
        const v=j/8,side=(v*2-1)*p.width;
        pos.push(p.x+p.nx*side,p.y+.08,p.z+p.nz*side);
        uv.push(v,i/8);
        bank.push(Math.abs(v*2-1));
      }
      if(i>=this.points.length-1)continue;
      for(let j=0;j<8;j++){
        const a=i*9+j,b=a+9;
        indices.push(a,b,a+1,a+1,b,b+1);
      }
      void along;
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setAttribute('bank',new THREE.Float32BufferAttribute(bank,1));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    geometry.computeBoundingSphere();this.geometries.push(geometry);
    const material=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uRain:{value:0},
        uSun:{value:new THREE.Vector3(.45,.8,.22)}},
      vertexShader:`
        uniform float uTime;
        attribute float bank;
        varying vec2 vUV;
        varying float vBank;
        varying vec3 vWorld;
        void main(){
          vUV=uv;vBank=bank;
          vec3 p=position;
          float wave=sin(uv.y*1.65-uTime*2.8+uv.x*16.0)*.045+
            sin(uv.y*2.7-uTime*4.1-uv.x*23.0)*.023;
          p.y+=wave*(1.0-bank*.35);
          vec4 world=modelMatrix*vec4(p,1.0);
          vWorld=world.xyz;
          gl_Position=projectionMatrix*viewMatrix*world;
        }`,
      fragmentShader:`
        uniform float uTime;
        uniform float uRain;
        uniform vec3 uSun;
        varying vec2 vUV;
        varying float vBank;
        varying vec3 vWorld;
        void main(){
          vec2 uv=vec2(vUV.x*4.0,vUV.y);
          float ripple1=sin(uv.y*4.1-uTime*3.5+sin(uv.x*9.0)*1.2);
          float ripple2=sin(uv.y*7.2-uTime*5.0+uv.x*20.0);
          float ripples=ripple1*.48+ripple2*.24;
          vec3 normal=normalize(vec3(
            .09*cos(uv.x*12.0+uTime*.8),
            1.0,
            .16*cos(uv.y*5.0-uTime*3.5)));
          vec3 viewDir=normalize(cameraPosition-vWorld);
          float fresnel=pow(1.0-max(0.0,dot(normal,viewDir)),3.0);
          vec3 water=mix(vec3(.044,.21,.225),vec3(.13,.365,.38),
            .53+.15*ripples);
          vec3 sky=mix(vec3(.35,.53,.62),vec3(.66,.78,.82),fresnel);
          water=mix(water,sky,clamp(.16+fresnel*.57,0.0,.78));
          float sparkle=pow(max(0.0,dot(reflect(-normalize(uSun),normal),
            viewDir)),50.0);
          water+=vec3(.85,.91,.87)*sparkle*.85;
          float flowFoam=smoothstep(.67,.93,abs(ripple1*.8+ripple2*.3))*
            (.04+.09*uRain);
          flowFoam+=smoothstep(.70,.98,vBank)*.13;
          water=mix(water,vec3(.83,.91,.89),clamp(flowFoam,0.0,.4));
          gl_FragColor=vec4(water,.94);
        }`,
      transparent:true,side:THREE.DoubleSide,depthWrite:false
    });
    this.materials.push(material);this.waterMaterial=material;
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name='Rio · corrente animada, reflexo Fresnel e ondulação';
    mesh.renderOrder=1;
    this.group.add(mesh);this.waterMesh=mesh;
  }
  buildRocks(){
    const random=seedRandom(96355);
    const density=this.quality==='low'?.10:this.quality==='ultra'?.40:.24;
    const count=Math.floor(this.points.length*density);
    const geo=new THREE.IcosahedronGeometry(1,1);
    const material=new THREE.MeshStandardMaterial({
      color:0xc1c2b6,roughness:.96,flatShading:true
    });
    this.geometries.push(geo);this.materials.push(material);
    const mesh=new THREE.InstancedMesh(geo,material,count);
    mesh.name='Rochas húmidas e pedras no leito do rio';
    const obj=new THREE.Object3D();let made=0;
    for(let i=0;i<count*3&&made<count;i++){
      const point=this.points[Math.floor(random()*this.points.length)];
      const side=(random()*2-1)*point.width*1.12;
      const size=.30+random()*2.1;
      obj.position.set(point.x+point.nx*side,
        point.y+.08-size*.38,point.z+point.nz*side);
      obj.rotation.set(random()*2,random()*6.28,random()*2);
      obj.scale.set(size,size*.53,size*(.65+random()*.60));
      obj.updateMatrix();mesh.setMatrixAt(made,obj.matrix);
      mesh.setColorAt(made,new THREE.Color(
        [0x797e78,0xa7a99c,0x777d75,0xb2b2a5][Math.floor(random()*4)]));
      made++;
    }
    mesh.count=made;mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.castShadow=this.quality==='ultra';mesh.receiveShadow=true;
    this.group.add(mesh);this.rocks=made;
    // Foamy eddies downstream of larger rocks, visibly advecting with flow.
    const foamGeo=new THREE.PlaneGeometry(1,1,3,4);
    foamGeo.rotateX(-Math.PI/2);this.geometries.push(foamGeo);
    const foamMat=new THREE.MeshBasicMaterial({color:0xd4e5df,
      transparent:true,opacity:.46,depthWrite:false,side:THREE.DoubleSide});
    this.materials.push(foamMat);
    const wakes=new THREE.InstancedMesh(foamGeo,foamMat,Math.floor(count*.55));
    wakes.name='Espuma e corrente à volta das rochas';
    let index=0;
    for(let i=0;i<count*2&&index<wakes.instanceMatrix.count;i++){
      const p=this.points[Math.floor(random()*this.points.length)];
      if(random()>.6)continue;
      obj.position.set(p.x+p.nx*(random()*2-1)*p.width*.68,
        p.y+.115,p.z+p.nz*(random()*2-1)*p.width*.68);
      obj.rotation.set(0,Math.atan2(-p.nx,p.nz),0);
      obj.scale.set(.45+random()*.7,1,.65+random()*1.6);
      obj.updateMatrix();wakes.setMatrixAt(index++,obj.matrix);
    }
    wakes.count=index;wakes.instanceMatrix.needsUpdate=true;
    this.group.add(wakes);this.foam=wakes;
  }
  buildBridges(){
    const concrete=new THREE.MeshStandardMaterial({color:0xaaa9a0,roughness:.90});
    const steel=new THREE.MeshStandardMaterial({color:0x888f91,roughness:.40,metalness:.70});
    this.materials.push(concrete,steel);
    const cube=new THREE.BoxGeometry(1,1,1);
    this.geometries.push(cube);
    const add=(name,x,y,z,sx,sy,sz,yaw,material)=>{
      const mesh=new THREE.Mesh(cube,material);
      mesh.name=name;mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);
      mesh.rotation.y=yaw;
      mesh.receiveShadow=true;
      this.group.add(mesh);return mesh;
    };
    for(const hit of this.crossings){
      const near=this.lookup(hit.x,hit.z);
      if(!near)continue;
      const length=near.width*2+13,width=hit.road.width;
      const yaw=Math.atan2(hit.direction.x,hit.direction.z);
      const deckY=this.terrainY(hit.x,hit.z)+.205;
      add('Ponte rodoviária · viga inferior',
        hit.x,deckY-.50,hit.z,width+.70,.58,length,yaw,concrete);
      for(const sign of [-1,1]){
        const side={x:-hit.direction.z*sign,z:hit.direction.x*sign};
        const x=hit.x+side.x*(width*.5+.61),z=hit.z+side.z*(width*.5+.61);
        add('Ponte · guarda metálica lateral',x,deckY+.66,z,
          .17,1.05,length-.65,yaw,steel);
        const pillarHeight=Math.max(.7,deckY-near.waterY-.35);
        for(const advance of [-1,1]){
          const x2=x+hit.direction.x*advance*(length*.36);
          const z2=z+hit.direction.z*advance*(length*.36);
          add('Ponte · apoio no leito rochoso',x2,deckY-pillarHeight*.5-.33,z2,
            .72,pillarHeight,1.0,yaw,concrete);
        }
        const collider=new CANNON.Body({mass:0,material:new CANNON.Material('bridge-rail')});
        collider.addShape(new CANNON.Box(new CANNON.Vec3(.09,.525,(length-.65)*.5)));
        collider.position.set(x,deckY+.66,z);
        collider.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),yaw);
        this.physics.addBody(collider);this.bodies.push(collider);
      }
    }
  }
  update(dt,paused=false,rain=false,sun=null){
    if(!paused)this.time+=Math.max(0,Math.min(dt,.08));
    this.waterMaterial.uniforms.uTime.value=this.time;
    this.waterMaterial.uniforms.uRain.value=rain?1:0;
    if(sun)this.waterMaterial.uniforms.uSun.value.copy(sun).normalize();
  }
  dispose(){
    for(const body of this.bodies)this.physics.removeBody(body);
    this.scene.remove(this.group);
    for(const geo of this.geometries)geo.dispose();
    for(const mat of this.materials)mat.dispose();
  }
}
