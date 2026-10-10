import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Roadside architecture shared by all routes. All stations and signs face the
// actual road tangent, obey the carriageway safety mask and can be unloaded.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const METRE=1;
const make=(color,metalness=0,roughness=.8,other={})=>
  new THREE.MeshStandardMaterial({color,metalness,roughness,...other});
export class RoadsideInfrastructure{
  constructor(scene,physics,network,terrainY,clearance,quality='high'){
    this.scene=scene;this.physics=physics;this.network=network;
    this.terrainY=terrainY;this.clearance=clearance;this.quality=quality;
    this.groups=[];this.bodies=[];this.textures=[];this.signMaterials=[];
    this.busBayGeometries=[];this.busBayMaterials=[];
    this.geometries={
      box:new THREE.BoxGeometry(1,1,1),
      cylinder:new THREE.CylinderGeometry(1,1,1,10),
      cylinderThin:new THREE.CylinderGeometry(1,1,1,8),
      plane:new THREE.PlaneGeometry(1,1)
    };
    this.materials={
      steel:make(0x808c94,.83,.4),dark:make(0x29333c,.58,.53),
      alloy:make(0xa6b1b5,.73,.33),concrete:make(0xaaa9a1,.04,.92),
      glass:make(0x83adbd,.17,.19,{transparent:true,opacity:.38,
        side:THREE.DoubleSide,depthWrite:false}),
      seat:make(0x674e39,.02,.91),safety:make(0xe4e9e6,.08,.7),
      blue:make(0x285879,.06,.7),reflect:make(0xf5e8bb,.05,.24,{
        emissive:0x9b804d,emissiveIntensity:.52
      }),red:make(0xbd3436,.02,.54)
    };
    this.stats={
      stops:0,informationKiosks:0,gantries:0,emergencyCabinets:0,
      distanceMarkers:0,directionBoards:0,wayfindingSigns:0,
      delineators:0,structures:0,placedSafely:0,rejected:0,colliders:0,
      busBays:0,busPainted:0
    };
    this.build();
  }
  tangent(road,index){
    const pts=road.points;
    const a=pts[Math.max(0,index-1)],b=pts[Math.min(pts.length-1,index+1)];
    const t=new THREE.Vector3(b.x-a.x,0,b.z-a.z);
    return t.lengthSq()<1e-6?new THREE.Vector3(0,0,1):t.normalize();
  }
  candidate(road,index,side,offset){
    const t=this.tangent(road,index),p=road.points[index];
    if(!Number.isFinite(side)||Math.abs(side)!==1)throw new Error(
      'Roadside side must be a numeric +1 or -1, not a direction Vector3');
    const x=p.x-t.z*side*offset,z=p.z+t.x*side*offset;
    return {x,z,y:this.terrainY(x,z),yaw:Math.atan2(t.x,t.z),
      tangent:t,index,side,road};
  }
  allowed(p,buffer=2){
    if(!this.clearance)return true;
    const mask=this.clearance;
    // A station is not a traffic sign: its building/collider requires a broad
    // clean apron. No road, junction, side street or POI driveway is occupied.
    return !mask.insideService(p.x,p.z,buffer)&&
      !mask.insideBusBay(p.x,p.z,buffer)&&
      !mask.nearJunction(p.x,p.z,buffer)&&
      !mask.nearAccess(p.x,p.z,buffer)&&
      mask.roadProximity(p.x,p.z).edge>=buffer;
  }
  find(road,at,side,extra=6,buffer=3){
    const n=road.points.length-1,center=clamp(Math.round(at*n),5,n-5);
    const offset=road.width*.5+extra;
    for(let stride=0;stride<=Math.min(40,Math.round(n*.32));stride+=3){
      for(const direction of stride===0?[0]:[-1,1]){
        const i=clamp(center+stride*direction,4,n-4);
        const p=this.candidate(road,i,side,offset);
        if(this.allowed(p,buffer)){
          this.stats.placedSafely++;
          return p;
        }
        this.stats.rejected++;
      }
    }
    return null;
  }
  createRoot(label,p){
    const g=new THREE.Group();
    g.name=label;
    g.position.set(p.x,p.y,p.z);
    g.rotation.y=p.yaw;
    this.scene.add(g);this.groups.push(g);
    return g;
  }
  mesh(parent,label,geo,material,x,y,z,sx,sy,sz){
    const obj=new THREE.Mesh(this.geometries[geo],this.materials[material]);
    obj.name=label;obj.position.set(x,y,z);obj.scale.set(sx,sy,sz);
    obj.castShadow=(sy>1.2&&this.quality!=='low');
    obj.receiveShadow=true;parent.add(obj);
    this.stats.structures++;
    return obj;
  }
  collider(root,x,y,z,sx,sy,sz){
    root.updateMatrixWorld(true);
    const p=root.localToWorld(new THREE.Vector3(x,y,z));
    const q=new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(0,1,0),root.rotation.y);
    const body=new CANNON.Body({mass:0});
    body.addShape(new CANNON.Box(new CANNON.Vec3(sx*.5,sy*.5,sz*.5)));
    body.position.set(p.x,p.y,p.z);body.quaternion.copy(q);
    this.physics.addBody(body);this.bodies.push(body);this.stats.colliders++;
  }
  board(root,label,writing,scheme='blue',x=0,y=3.4,z=0,w=3.6,h=1.2){
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=256;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle=scheme==='blue'?'#225278':'#303c42';
    ctx.fillRect(0,0,512,256);
    ctx.lineWidth=9;ctx.strokeStyle='#eff4f1';ctx.strokeRect(14,14,484,228);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f7f9f7';
    const rows=Array.isArray(writing)?writing:[writing];
    rows.slice(0,3).forEach((row,i)=>{
      const str=String(row).slice(0,33);
      // Short, robust layout for the actual direction and distance labels.
      ctx.font='bold '+(str.length>21?27:str.length>13?33:43)+'px system-ui,sans-serif';
      ctx.fillText(str,256,rows.length===1?128:72+i*57);
    });
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=8;this.textures.push(texture);
    const mat=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
    this.signMaterials.push(mat);
    const plane=new THREE.Mesh(this.geometries.plane,mat);
    plane.name=label;
    plane.position.set(x,y,z);
    // Panels face approaching traffic along the road axis.
    plane.scale.set(w,h,1);
    root.add(plane);
    this.mesh(root,label+' · estrutura','box','dark',x,y,z,w+.1,h+.1,.10);
    plane.position.z+=.065;
    this.stats.directionBoards++;
  }
  // All passenger stops use the shared clearance plan. This keeps a
  // planned bus bay separate from another junction, driveway or rail guard.
  stopLocation(road,region,side){
    const site=this.clearance?.busBays?.find(bay=>
      bay.roadId===road.id&&bay.regionId===region.id&&bay.side===side);
    if(!site)return null;
    const p=this.candidate(road,site.index,side,site.offset);
    this.stats.placedSafely++;
    return {...p,poiId:region.id,poiDistance:site.poiDistance,
      busBay:site};
  }
  buildBusBay(root,p){
    const road=p.road,site=p.busBay;
    if(!site)return;
    const offset=road.width*.5;
    const sections=[],positions=[],uv=[],color=[],indices=[];
    root.updateMatrixWorld(true);
    for(let j=-11;j<=11;j++){
      const distance=j*2,relative=Math.abs(distance);
      const t=clamp((22-relative)/10,0,1);
      const taper=t*t*(3-2*t);
      const bayWidth=.12+3.65*taper;
      const sample=this.clearance.alongRoad(road,p.index,distance);
      const tangent=this.tangent(road,p.index);
      const nx=-tangent.z*p.side,nz=tangent.x*p.side;
      for(const f of [0,.32,.67,1]){
        const lateral=offset-.16+bayWidth*f;
        const x=sample.x+nx*lateral,z=sample.z+nz*lateral;
        const y=this.terrainY(x,z)+.209-.068*f+.006;
        const v=root.worldToLocal(new THREE.Vector3(x,y,z));
        positions.push(v.x,v.y,v.z);
        uv.push((distance+22)/5,lateral/5);
        color.push(.99,.99,.99);
      }
      sections.push(bayWidth);
      if(j===11)continue;
      const row=(j+11)*4;
      for(let k=0;k<3;k++){
        const a=row+k,b=a+4;
        // Correct triangle winding for the mesh collider/raycast wheel hits.
        if(p.side===1)indices.push(a,a+1,b,a+1,b+1,b);
        else indices.push(a,b,a+1,a+1,b,b+1);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(color,3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.userData.corsaBusBay=true;
    this.busBayGeometries.push(geometry);
    // Reuse the same photographic/procedural tarmac as the parent road.
    const mesh=new THREE.Mesh(geometry,road.mesh?.material||this.materials.dark);
    mesh.name='Baía de autocarro · asfalto transitável';
    mesh.receiveShadow=true;root.add(mesh);
    root.updateMatrixWorld(true);
    const colliderVertices=[];
    for(let i=0;i<positions.length;i+=3){
      const world=root.localToWorld(new THREE.Vector3(
        positions[i],positions[i+1],positions[i+2]));
      colliderVertices.push(world.x,world.y,world.z);
    }
    const body=new CANNON.Body({mass:0,material:new CANNON.Material('dry')});
    body.addShape(new CANNON.Trimesh(colliderVertices,indices));
    this.physics.addBody(body);this.bodies.push(body);this.stats.colliders++;
    // BUS painted on the asphalt. Letters are arranged longitudinally so
    // they remain legible from the driver's approach direction.
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=1024;
    const ctx=canvas.getContext('2d');
    ctx.clearRect?.(0,0,512,1024);
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='900 260px sans-serif';ctx.fillStyle='#f3f3eb';
    for(const [i,letter] of [...'BUS'].entries())
      ctx.fillText(letter,256,190+i*322);
    const tex=new THREE.CanvasTexture(canvas);
    tex.colorSpace=THREE.SRGBColorSpace;
    tex.anisotropy=8;this.textures.push(tex);
    const material=new THREE.MeshBasicMaterial({map:tex,transparent:true,
      depthWrite:false,side:THREE.DoubleSide,
      polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    this.busBayMaterials.push(material);
    const paintGeo=new THREE.PlaneGeometry(2.5,6.2,2,12);
    paintGeo.rotateX(-Math.PI/2);
    this.busBayGeometries.push(paintGeo);
    const paint=new THREE.Mesh(paintGeo,material);
    paint.name='BUS · inscrição branca no pavimento';
    const markOffset=offset+1.67;
    const localX=p.side*(site.offset-markOffset);
    // Drape the marking over the actual sloping lay-by, not a flat plane.
    const paintVertices=paintGeo.getAttribute('position');
    for(let i=0;i<paintVertices.count;i++){
      const world=root.localToWorld(new THREE.Vector3(
        localX+paintVertices.getX(i),0,paintVertices.getZ(i)));
      paintVertices.setY(i,this.terrainY(world.x,world.z)+.193-p.y);
    }
    paintGeo.computeVertexNormals();
    paint.position.set(localX,0,0);
    paint.renderOrder=2;
    root.add(paint);
    root.userData.busBay=true;
    root.userData.bayLengthM=44;
    root.userData.bayWidthM=3.77;
    root.userData.busBayHasCollider=true;
    this.stats.busBays++;
    this.stats.busPainted++;
  }
  shelter(road,region,side,lead=1){
    const p=this.stopLocation(road,region,side,lead);
    if(!p)return;
    const rural=region.kind==='hamlet';
    const root=this.createRoot('Paragem de autocarro · '+(rural?'rural':'urbana'),p);
    root.userData.servesPOI=region.id;
    root.userData.poiDistance=p.poiDistance;
    root.userData.roadId=road.id;
    this.buildBusBay(root,p);
    // Marked pedestrian link from the shelter to the road shoulder. Small
    // segments follow the actual terrain; never a floating 10m slab.
    for(let step=1;step<=4;step++){
      const localX=p.side*(step*1.55);
      const direction=new THREE.Vector3(Math.cos(p.yaw),0,-Math.sin(p.yaw));
      const px=p.x+direction.x*localX,pz=p.z+direction.z*localX;
      const top=this.terrainY(px,pz)-p.y+.06;
      this.mesh(root,'Acesso pedonal · paragem','box','concrete',
        localX,top,0,1.75,.12,1.45);
    }
    root.userData.pedestrianAccess=true;
    // 3.8 m shelter, structural steel, tempered glass, accessible threshold.
    this.mesh(root,'Paragem · laje','box','concrete',0,.11,0,4.3,.21,5.25);
    this.mesh(root,'Paragem · cobertura metálica','box','dark',0,3.08,0,4.5,.21,5.20);
    for(const x of [-1.85,1.85])for(const z of [-2.22,2.22]){
      this.mesh(root,'Paragem · coluna','cylinderThin','alloy',x,1.55,z,.075,3.04,.075);
      this.collider(root,x,1.55,z,.15,3.04,.15);
    }
    this.mesh(root,'Paragem · vidro lateral','box','glass',-1.88,1.55,0,.05,2.75,4.30);
    this.mesh(root,'Paragem · vidro traseiro','box','glass',0,1.55,-2.2,3.70,2.75,.07);
    this.mesh(root,'Paragem · banco','box','seat',.2,.79,-1.47,2.5,.13,.48);
    this.mesh(root,'Paragem · encosto','box','seat',.2,1.18,-1.77,2.5,.74,.10);
    for(const z of [-.75,.75])
      this.mesh(root,'Paragem · pé do banco','box','steel',z,.41,-1.45,.07,.67,.10);
    this.board(root,'Paragem · mapa e horário',
      ['PARAGEM',rural?'ALDEIA / SERRA':'CENTRO / VILA'],
      'blue',-1.55,1.6,-2.25,.7,1.0);
    if(rural){
      this.mesh(root,'Paragem rural · acabamento madeira','box','seat',
        0,3.04,0,4.6,.16,5.3);
    }
    this.stats.stops++;
  }
  direction(road,at,side,writing,kind='road'){
    const p=this.find(road,at,side,kind==='highway'?9:7.1,2.8);
    if(!p)return;
    const root=this.createRoot('Sinal direcional · '+writing[0],p);
    const height=kind==='highway'?4.05:3.3;
    this.mesh(root,'Placa direcional · suporte','cylinder','steel',0,height*.5,0,
      .075,height,.075);
    this.collider(root,0,height*.5,0,.14,height,.14);
    this.board(root,'Placa de orientação',writing,'blue',0,height+.12,0,
      kind==='highway'?4.7:3.35,kind==='highway'?1.5:1.2);
    this.stats.wayfindingSigns++;
  }
  emergency(road,at,side){
    const p=this.find(road,at,side,10.1,3.4);
    if(!p)return;
    const root=this.createRoot('Posto SOS · autoestrada',p);
    this.mesh(root,'SOS · plataforma','box','concrete',0,.11,0,2.6,.22,3.1);
    this.mesh(root,'SOS · armário','box','steel',0,1.0,0,.9,1.8,.62);
    this.mesh(root,'SOS · painel','box','blue',-.06,1.4,.33,.54,.67,.07);
    this.mesh(root,'SOS · botão de emergência','cylinderThin','red',
      -.1,1.47,.39,.08,.07,.08);
    this.mesh(root,'SOS · cabeçalho','box','safety',0,2.08,0,1.2,.24,.73);
    this.collider(root,0,1,0,.9,1.8,.62);
    this.stats.emergencyCabinets++;
  }
  kiosk(road,at,side,word){
    const p=this.find(road,at,side,16.2,8.3);
    if(!p)return;
    const root=this.createRoot('Posto de informação · '+word,p);
    this.mesh(root,'Posto · fundação','box','concrete',0,.11,0,5.6,.22,5.4);
    for(const x of [-2.2,2.2])for(const z of [-2.0,2.0]){
      this.mesh(root,'Posto · pilar','cylinder','alloy',x,1.50,z,.11,2.80,.11);
      this.collider(root,x,1.5,z,.22,2.8,.22);
    }
    this.mesh(root,'Posto · telhado','box','dark',0,3.04,0,5.5,.25,5.2);
    this.mesh(root,'Posto · quiosque informativo','box','blue',
      0,1.14,-1.4,3.2,2.22,.37);
    this.board(root,'Posto · painel turístico',[word,'PERCURSOS / APOIO'],
      'blue',0,1.76,-1.17,2.75,1.33);
    this.mesh(root,'Posto · banco','box','seat',0,.66,1.44,2.8,.15,.5);
    this.stats.informationKiosks++;
  }
  gantry(road,at,side){
    const p=this.find(road,at,side,road.width*.5+10,3.5);
    if(!p)return;
    // A road sign is on a high crossbeam above the carriageway, not a slab
    // placed on the road. Its two legs stay outside the asphalt and shoulders.
    const t=p.tangent;
    const center=road.points[p.index];
    const root=this.createRoot('Pórtico de informação · autoestrada',
      {...p,x:center.x,y:this.terrainY(center.x,center.z),z:center.z});
    const width=road.width+16.8,leg=width*.5;
    // Only build if both legs are outside every other road / access.
    root.updateMatrixWorld(true);
    const left=root.localToWorld(new THREE.Vector3(-leg,0,0));
    const right=root.localToWorld(new THREE.Vector3(leg,0,0));
    if(!this.allowed({x:left.x,z:left.z},2)||!this.allowed({x:right.x,z:right.z},2)){
      this.scene.remove(root);this.groups.pop();this.stats.rejected++;
      return;
    }
    for(const x of [-leg,leg]){
      const terrain=this.terrainY(x===-leg?left.x:right.x,x===-leg?left.z:right.z);
      const h=7.4+(root.position.y-terrain);
      this.mesh(root,'Pórtico · coluna','box','steel',x,7.4-h/2,0,.22,h,.26);
      this.collider(root,x,7.4-h/2,0,.22,h,.26);
    }
    this.mesh(root,'Pórtico · travessa','box','alloy',0,7.12,0,width+.1,.23,.3);
    this.board(root,'Pórtico · direção',['VALE CENTRAL ↑','SERVIÇOS / SAÍDA →'],
      'blue',0,5.80,0,6.7,1.68);
    this.stats.gantries++;
  }
  markers(road,kind,interval=11){
    const pts=road.points,boxes=[],reflectors=[];
    for(let i=8;i<pts.length-8;i+=interval){
      for(const side of [-1,1]){
        const p=this.candidate(road,i,side,road.width*.5+
          (kind==='highway'?3.4:2.7));
        if(!this.allowed(p,1.1))continue;
        boxes.push({...p});
        reflectors.push({...p});
      }
    }
    if(!boxes.length)return;
    const dummy=new THREE.Object3D(),mat=this.materials;
    for(const [name,geometr,material,offset,height] of [
      ['Balizador rodoviário · corpo','box',mat.safety,.46,.92],
      ['Balizador rodoviário · refletor','box',mat.reflect,.85,.19]
    ]){
      const mesh=new THREE.InstancedMesh(this.geometries[geometr],material,boxes.length);
      mesh.name=name;
      for(let i=0;i<boxes.length;i++){
        const p=boxes[i];
        dummy.position.set(p.x,p.y+offset,p.z);
        dummy.rotation.set(0,p.yaw,0);
        dummy.scale.set(.115,height,.15);
        dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;
      mesh.computeBoundingSphere();this.scene.add(mesh);
      this.groups.push(mesh);
    }
    this.stats.delineators+=boxes.length;
  }
  build(){
    for(const road of this.network.roads){
      if(road.id==='circular'){
        this.direction(road,.14,1,['VILA NOVA','ESTAÇÃO CENTRAL']);
        this.direction(road,.61,-1,['CIRCULAR','SERRA ALTA']);
        this.markers(road,'ring',17);
      }else if(road.category==='urban'){
        const settlement=(this.clearance?.regions||[]).find(r=>
          r.kind==='town'&&r.road===road.id);
        if(settlement){
          this.shelter(road,settlement,settlement.sideSign,-1);
          this.shelter(road,settlement,-settlement.sideSign,1);
        }
        this.direction(road,.41,1,['CENTRO DA VILA','ESTAÇÃO FERROVIÁRIA']);
        this.direction(road,.87,-1,['CIRCULAR','PARQUE / COMÉRCIO']);
        this.markers(road,'urban',14);
      }else if(road.category==='highway'){
        this.emergency(road,.17,1);
        this.emergency(road,.81,-1);
        if(road.id==='autoestrada'){
          this.gantry(road,.33,-1);
          this.direction(road,.65,-1,['ÁREA DE SERVIÇO','COMBUSTÍVEL · 500 m'],'highway');
        }
        this.markers(road,'highway',9);
      }else if(road.category==='mountain'){
        const village=(this.clearance?.regions||[]).find(r=>
          r.kind==='hamlet'&&r.road===road.id);
        if(village)this.shelter(road,village,-village.sideSign,-1);
        this.kiosk(road,.52,-1,'SERRA ALTA');
        this.direction(road,.24,1,['MIRADOURO','ATENÇÃO: CURVAS']);
        this.markers(road,'mountain',8);
      }else if(road.category==='rural'){
        for(const village of this.clearance?.regions||[]){
          if(village.road===road.id&&village.kind==='hamlet')
            this.shelter(road,village,-village.sideSign,-1);
        }
        this.kiosk(road,.27,1,'CAMINHO DO PINHAL');
        this.direction(road,.65,-1,['QUINTA DO PINHAL','ESTRADA RURAL']);
        this.markers(road,'rural',11);
      }else if(road.category==='highway-ramp'){
        this.direction(road,.55,1,['A1 · ENTRADA','CONVERGÊNCIA'],'highway');
        this.markers(road,'highway',8);
      }else if(road.category==='test'){
        this.direction(road,.22,1,['CENTRO DE TESTES','REDUZIR VELOCIDADE']);
        this.markers(road,'test',12);
      }else if(road.category==='dirt'){
        this.direction(road,.19,1,['VIA DE SERVIÇO','PISO NÃO PAVIMENTADO']);
        this.markers(road,'dirt',15);
      }
    }
  }
  dispose(){
    for(const body of this.bodies)this.physics.removeBody(body);
    for(const obj of this.groups)this.scene.remove(obj);
    for(const geo of Object.values(this.geometries))geo.dispose();
    for(const geo of this.busBayGeometries)geo.dispose();
    for(const mat of this.busBayMaterials)mat.dispose();
    for(const mat of Object.values(this.materials))mat.dispose();
    for(const mat of this.signMaterials)mat.dispose();
    for(const tex of this.textures)tex.dispose();
    this.groups.length=this.bodies.length=0;
  }
}
