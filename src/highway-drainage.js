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
  for(let i=0;i<13;i++)box(.034,.064,.49,(i-6)*.076,0);
  for(const z of [-.277,.277])box(1.16,.10,.074,0,z);
  for(const x of [-.568,.568])box(.074,.10,.62,x,0);
  // Four recessed screw heads, modelled within the shared metal casting.
  for(const x of [-.50,.50])for(const z of [-.21,.21])
    box(.034,.11,.034,x,z);
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
    this.meshCount=0;this.inletCount=0;this.outletCount=0;
    this.geometryStats={channels:0,grates:0,culverts:0,runoffRibbons:0};
    this.concrete=new THREE.MeshStandardMaterial({
      color:0xd2d2ca,vertexColors:true,roughness:.92,metalness:.025,
      side:THREE.DoubleSide
    });
    this.grateMat=new THREE.MeshStandardMaterial({
      color:0x515a5e,roughness:.43,metalness:.77
    });
    this.pipeMat=new THREE.MeshStandardMaterial({
      color:0x9a9d96,roughness:.91,metalness:.04,side:THREE.DoubleSide
    });
    this.rimMat=new THREE.MeshStandardMaterial({
      color:0x727a7c,roughness:.59,metalness:.63
    });
    this.apertureMat=new THREE.MeshStandardMaterial({
      color:0x17282d,roughness:.90,metalness:.08,side:THREE.DoubleSide
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
          // Three travelling flow scales: broad transparent rivulets,
          // short ripple crests and micro-foam. UV.y follows the gutter;
          // the direction is signed per road segment from its real grade.
          float speed=(.68+uRain*2.05)*max(.28,abs(vFlow));
          float t=vUv.y*3.7-uTime*speed*sign(vFlow);
          float streak=sin(t*9.0+sin(vUv.x*12.0+t*.35)*1.6);
          float tiny=sin(t*23.0-vUv.x*24.0+sin(t*2.3)*.65);
          float diagonal=sin(t*15.0+vUv.x*11.0);
          float turbulence=streak*.094+tiny*.052+diagonal*.032;
          float foam=smoothstep(.53,.95,abs(streak*.58+tiny*.25+
            diagonal*.23))*(.08+.30*uRain);
          float glint=pow(max(0.0,diagonal*.5+.5),14.0)*.095;
          vec3 dark=vec3(.045,.125,.150);
          vec3 bright=vec3(.23,.38,.41);
          vec3 water=mix(dark,bright,.32+turbulence+uRain*.12);
          water+=vec3(.58,.67,.70)*glint;
          water=mix(water,vec3(.74,.84,.83),foam);
          float edge=smoothstep(0.0,.10,vUv.x)*
            (1.0-smoothstep(.90,1.0,vUv.x));
          float opacity=(.33+.47*uLevel)*edge;
          gl_FragColor=vec4(water,opacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent:true,side:THREE.DoubleSide,depthWrite:false,
      // Raw ShaderMaterial has no Three.js fog uniforms; fog:true made
      // WebGLRenderer.refreshFogUniforms access an undefined .value at runtime.
      // These local translucent runoff channels use their own shading.
      fog:false
    });
    this.splashMat=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uRain:{value:0},uLevel:{value:0}},
      vertexShader:`
        varying vec2 vUv;
        void main(){
          vUv=uv;
          gl_Position=projectionMatrix*modelViewMatrix*
            instanceMatrix*vec4(position,1.0);
        }`,
      fragmentShader:`
        uniform float uTime;uniform float uRain;uniform float uLevel;
        varying vec2 vUv;
        void main(){
          vec2 q=(vUv-.5)*vec2(1.4,1.7);
          float radius=length(q);
          float mask=(1.0-smoothstep(.36,.65,radius));
          float ring=sin(radius*35.0-uTime*9.0);
          float droplets=sin(vUv.x*39.0+uTime*5.2)*
            sin(vUv.y*47.0-uTime*6.1);
          float foam=pow(max(0.0,ring),4.0)*.41+
            pow(max(0.0,droplets),8.0)*.16;
          float alpha=mask*foam*(.23+.77*uRain)*
            (.30+.70*uLevel);
          if(alpha<.012)discard;
          gl_FragColor=vec4(.81,.90,.92,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent:true,depthWrite:false,depthTest:true,
      side:THREE.DoubleSide,fog:false
    });
    this.materials.push(this.concrete,this.grateMat,this.waterMat,
      this.pipeMat,this.rimMat,this.apertureMat,this.splashMat);
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
    // True open trapezoidal canal, with raised concrete crests, chamfered
    // slopes and a flat submerged invert. Collision mesh shares vertices.
    const section=[-1.48,-1.18,-.69,-.32,.32,.69,1.18,1.48];
    const heights=[.40,.34,.135,.025,.025,.135,.34,.40];
    const shades=[.91,.96,.81,.61,.61,.81,.96,.91];
    const inletGeometry=collectorGrateGeometry();
    this.geometry.push(inletGeometry);
    const basinGeometry=new THREE.PlaneGeometry(1.12,.57);
    basinGeometry.rotateX(-Math.PI/2);
    const splashGeometry=new THREE.PlaneGeometry(1.03,.53);
    splashGeometry.rotateX(-Math.PI/2);
    const pipeGeometry=new THREE.CylinderGeometry(.42,.42,1,18,1,true);
    pipeGeometry.rotateZ(Math.PI/2);
    const rimGeometry=new THREE.TorusGeometry(.45,.078,8,22);
    rimGeometry.rotateY(Math.PI/2);
    const apertureGeometry=new THREE.CircleGeometry(.38,22);
    apertureGeometry.rotateY(Math.PI/2);
    // Real circular culvert cut-out, not a painted black circle over a cube.
    const wallShape=new THREE.Shape();
    wallShape.moveTo(-.70,-.55);wallShape.lineTo(.70,-.55);
    wallShape.lineTo(.70,.55);wallShape.lineTo(-.70,.55);
    wallShape.closePath();
    const hole=new THREE.Path();
    hole.absarc(0,0,.445,0,Math.PI*2,true);
    wallShape.holes.push(hole);
    const headwallGeometry=new THREE.ExtrudeGeometry(wallShape,{
      depth:.23,steps:1,curveSegments:20,bevelEnabled:true,
      bevelThickness:.012,bevelSize:.02,bevelSegments:1
    });
    headwallGeometry.rotateY(Math.PI/2);
    this.geometry.push(basinGeometry,splashGeometry,pipeGeometry,
      rimGeometry,apertureGeometry,headwallGeometry);
    const axisX=new THREE.Vector3(1,0,0);
    for(const road of this.network.roads){
      if(road.id!=='autoestrada'||road.points?.length<2)continue;
      const profile=roadProfile(road);
      const offset=road.width*.5+profile.outerShoulder+3.15;
      for(const sign of [-1,1]){
        const vertices=[],uv=[],colors=[],indices=[],waterPos=[],waterUv=[],
          waterDir=[],waterIndex=[],inlets=[],
          runoffPos=[],runoffUv=[],runoffDir=[],runoffIndices=[],
          outletPos=[],outletUv=[],outletDir=[],outletIndices=[],outlets=[];
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
            waterPos.push(x,this.terrainY(x,z)+.053,z);
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
            // Grates sit only ~10 cm above the depressed channel floor;
            // the earlier +.38 m setting made them float above the gutter.
            const pos=new THREE.Vector3(cx,this.terrainY(cx,cz)+.117,cz);
            inlets.push({position:pos,yaw:Math.atan2(side.dx,side.dz)});
            // A safe outward culvert is only fitted when gravity can carry
            // water away from the channel. Avoid bridges and junctions.
            const nx=side.x*sign,nz=side.z*sign;
            const startX=cx+nx*1.55,startZ=cz+nz*1.55;
            const exitX=cx+nx*5.05,exitZ=cz+nz*5.05;
            const inletY=this.terrainY(startX,startZ)+.11;
            const exitY=this.terrainY(exitX,exitZ)+.085;
            const fartherX=exitX+nx*2.4,fartherZ=exitZ+nz*2.4;
            if(exitY<inletY-.055 &&
              this.terrainY(fartherX,fartherZ)<exitY+.085 &&
              !this.nearConflict({x:exitX,z:exitZ}) &&
              !this.nearConflict({x:fartherX,z:fartherZ})){
              const direction=new THREE.Vector3(nx*3.5,exitY-inletY,nz*3.5);
              const axis=direction.clone().normalize();
              const quaternion=new THREE.Quaternion().setFromUnitVectors(axisX,axis);
              const mouth=new THREE.Vector3(exitX,exitY,exitZ);
              outlets.push({mouth,quaternion,
                center:new THREE.Vector3((startX+exitX)/2,
                  (inletY+exitY)/2,(startZ+exitZ)/2),
                length:direction.length(),axis});
              const baseOutlet=outletPos.length/3;
              // Actual world-space ribbon from the pipe mouth into the
              // downstream verge. A longitudinal shader animates its flow.
              for(let j=0;j<=10;j++){
                const t=j/10,d=t*2.4;
                const x=exitX+nx*d,z=exitZ+nz*d;
                const ground=this.terrainY(x,z);
                const y=ground+.045+.06*(1-t);
                const width=.28+.19*t;
                for(const sideStep of [-1,1]){
                  outletPos.push(x+side.dx*width*sideStep,y,
                    z+side.dz*width*sideStep);
                  outletUv.push(sideStep*.5+.5,t*1.6);
                  outletDir.push(1);
                }
                if(j>0){
                  const a=baseOutlet+(j-1)*2,b=baseOutlet+j*2;
                  outletIndices.push(a,b,a+1,a+1,b,b+1);
                }
              }
            }
            // Surface runoff crosses the outer grass/gravel strip and
            // drops into the collector. All inlets share ONE combined
            // animated geometry to avoid per-gully GPU draw calls.
            const span=offset-(road.width*.5+profile.outerShoulder+.8);
            // Three independently flowing tributaries converge towards the
            // grate, so stormwater is seen moving *from* the road edge rather
            // than spawning as one artificial stripe in the ditch.
            for(const feeder of [-1,0,1]){
              const base=runoffPos.length/3;
              for(let j=0;j<=10;j++){
                const t=j/10,lateral=offset-span*(1-t);
                const along=feeder*(.21+1.08*(1-t));
                const rx=p.x+side.x*lateral*sign+side.dx*along;
                const rz=p.z+side.z*lateral*sign+side.dz*along;
                const elevation=this.terrainY(rx,rz)+.061+
                  .20*Math.pow(1-t,1.4);
                for(const across of [-.067,.067]){
                  runoffPos.push(rx+side.dx*across,elevation,
                    rz+side.dz*across);
                  runoffUv.push(across/.134+.5,t*4.1+feeder*.19);
                  runoffDir.push(1);
                }
                if(j>0){
                  const v=base+(j-1)*2,w=base+j*2;
                  runoffIndices.push(v,w,v+1,v+1,w,w+1);
                }
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
        // Dark collector throat is visible between the actual open steel bars.
        // Neither the aperture nor the flowing water is an extra collider.
        const basins=new THREE.InstancedMesh(basinGeometry,
          this.apertureMat,Math.max(1,inlets.length));
        basins.name='Coletores pluviais · aberturas escuras sob grelhas';
        for(let k=0;k<inlets.length;k++){
          obj.position.copy(inlets[k].position);
          obj.position.y-=.052;
          obj.rotation.set(0,inlets[k].yaw,0);
          obj.scale.set(1,1,1);obj.updateMatrix();
          basins.setMatrixAt(k,obj.matrix);
        }
        basins.count=inlets.length;basins.instanceMatrix.needsUpdate=true;
        if(basins.count)basins.computeBoundingSphere();
        this.group.add(basins);
        const splashes=new THREE.InstancedMesh(splashGeometry,
          this.splashMat,Math.max(1,inlets.length));
        splashes.name='Chuva e salpicos nas grelhas pluviais';
        for(let k=0;k<inlets.length;k++){
          obj.position.copy(inlets[k].position);
          obj.position.y+=.062;
          obj.rotation.set(0,inlets[k].yaw,0);
          obj.scale.set(1,1,1);obj.updateMatrix();
          splashes.setMatrixAt(k,obj.matrix);
        }
        splashes.count=inlets.length;
        splashes.instanceMatrix.needsUpdate=true;
        if(splashes.count)splashes.computeBoundingSphere();
        splashes.renderOrder=4;
        splashes.visible=false;
        this.group.add(splashes);
        // One set of geometry/materials for ALL culverts on both shoulders.
        // The outlet end is a proper circular cast lip and dark throat.
        const batch=(name,geo,mat,mode)=>{
          const inst=new THREE.InstancedMesh(geo,mat,Math.max(1,outlets.length));
          inst.name=name;
          for(let k=0;k<outlets.length;k++){
            const o=outlets[k];
            obj.position.copy(mode==='pipe'?o.center:o.mouth);
            obj.quaternion.copy(o.quaternion);
            if(mode==='pipe')obj.scale.set(o.length,1,1);
            else if(mode==='aperture')obj.position.addScaledVector(o.axis,.085);
            else if(mode==='headwall')obj.position.addScaledVector(o.axis,-.12);
            obj.scale.set(mode==='pipe'?o.length:1,1,1);
            obj.updateMatrix();inst.setMatrixAt(k,obj.matrix);
          }
          inst.count=outlets.length;
          inst.instanceMatrix.needsUpdate=true;
          if(inst.count)inst.computeBoundingSphere();
          inst.receiveShadow=true;
          this.group.add(inst);
          return inst;
        };
        const pipes=batch('Bueiros · tubos circulares em betão',
          pipeGeometry,this.pipeMat,'pipe');
        const headwalls=batch('Saídas de drenagem · muros de proteção',
          headwallGeometry,this.concretePlain||this.pipeMat,'headwall');
        const apertures=batch('Saídas de drenagem · garganta aberta',
          apertureGeometry,this.apertureMat,'aperture');
        const rims=batch('Saídas de drenagem · anéis metálicos de reforço',
          rimGeometry,this.rimMat,'rim');
        const outletGeo=new THREE.BufferGeometry();
        outletGeo.setAttribute('position',
          new THREE.Float32BufferAttribute(outletPos,3));
        outletGeo.setAttribute('uv',new THREE.Float32BufferAttribute(outletUv,2));
        outletGeo.setAttribute('flowDirection',
          new THREE.Float32BufferAttribute(outletDir,1));
        outletGeo.setIndex(outletIndices);
        if(outletIndices.length){
          outletGeo.computeVertexNormals();
          outletGeo.computeBoundingSphere();
        }
        this.geometry.push(outletGeo);
        const outletFlow=new THREE.Mesh(outletGeo,this.waterMat);
        outletFlow.name='Água a sair dos tubos e a escorrer pelo talude';
        outletFlow.renderOrder=3;
        outletFlow.visible=false;
        this.group.add(outletFlow);
        this.inletCount+=inlets.length;
        this.outletCount+=outlets.length;
        this.geometryStats.channels++;
        this.geometryStats.grates+=inlets.length;
        this.geometryStats.culverts+=outlets.length;
        this.geometryStats.runoffRibbons+=runoffIndices.length/6+
          outletIndices.length/6;
        this.meshCount++;
        this.channels.push({road,sign,mesh,water,runoff,grates,basins,
          pipes,headwalls,apertures,rims,outletFlow,outlets,splashes,
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
    this.splashMat.uniforms.uTime.value=this.time;
    this.splashMat.uniforms.uRain.value=this.rainfall;
    this.splashMat.uniforms.uLevel.value=this.level;
    const show=this.level>.025;
    for(const channel of this.channels){
      channel.water.visible=show;
      // Sheet flow only while rain feeds the shoulder, while water in the
      // concrete swales persists briefly as the road dries.
      channel.runoff.visible=show&&this.rainfall>.035;
      channel.outletFlow.visible=show&&this.rainfall>.035;
      channel.splashes.visible=show&&this.rainfall>.085;
    }
  }
  dispose(){
    this.scene.remove(this.group);
    for(const geo of this.geometry)geo.dispose();
    for(const mat of this.materials)mat.dispose();
  }
}
