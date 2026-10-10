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
export function generateRailwayAlignment(terrainY,roadside,steps=950){
  const curve=new THREE.CatmullRomCurve3(
    ROUTE.map(([x,z])=>new THREE.Vector3(x,0,z)),true,'centripetal',.32);
  const points=[];
  for(let i=0;i<steps;i++){
    const p=curve.getPoint(i/steps);
    const y=terrainY(p.x,p.z);
    const edge=roadside?.roadProximity(p.x,p.z).edge??Infinity;
    // Bridges begin >100m before carriageways: no rail/asphalt mesh overlap.
    const bridge=smooth((96-edge)/76);
    p.y=y+.58+bridge*7.4;
    points.push(p);
  }
  points.push(points[0].clone());
  const length=[0];
  for(let i=1;i<points.length;i++)
    length.push(length[i-1]+points[i].distanceTo(points[i-1]));
  return {points,length,total:length[length.length-1]};
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
const colored=(m)=>m.clone();
export class RegionalRailway{
  constructor(scene,physics,terrainY,roadside,quality='high'){
    this.scene=scene;this.physics=physics;this.terrainY=terrainY;
    this.roadside=roadside;this.quality=quality;
    this.line=generateRailwayAlignment(terrainY,roadside,quality==='low'?650:1000);
    this.group=new THREE.Group();this.group.name='Linha Ferroviária Regional · Vale-Serra';
    scene.add(this.group);
    this.materials={
      ballast:material(0x89877c,.99),sleeper:material(0x484a46,.97),
      rail:material(0x858f95,.36,.91),concrete:material(0xaeb2b1,.9),
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
      railSegments:this.line.points.length-1};
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
  buildTrack(){
    const {points,length,total}=this.line;
    const ballastPositions=[],railPoints=[[],[]];
    const ballastGeo=new THREE.BoxGeometry(1,1,1);
    this.geometry.push(ballastGeo);
    const n=Math.floor(total/1.0);
    const sleepers=new THREE.InstancedMesh(ballastGeo,this.materials.sleeper,n);
    sleepers.name='Travessas de betão · 1 metro';
    const ballast=new THREE.InstancedMesh(ballastGeo,this.materials.ballast,
      Math.ceil(total/6));
    ballast.name='Leito ferroviário com balastro';
    this.group.add(sleepers,ballast);
    const dummy=new THREE.Object3D();
    const up=new THREE.Vector3(0,1,0);
    for(let i=0;i<n;i++){
      const p=sampleAlignment(this.line,i*total/n);
      dummy.position.copy(p.point).add(new THREE.Vector3(0,-.27,0));
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),
        new THREE.Vector3(p.dir.x,0,p.dir.z).normalize());
      dummy.scale.set(2.65,.20,.23);
      dummy.updateMatrix();sleepers.setMatrixAt(i,dummy.matrix);
    }
    for(let i=0;i<ballast.count;i++){
      const p=sampleAlignment(this.line,(i+.5)*6);
      const a=sampleAlignment(this.line,(i+.05)*6),b=sampleAlignment(this.line,(i+.95)*6);
      dummy.position.copy(p.point).add(new THREE.Vector3(0,-.51,0));
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),
        new THREE.Vector3(p.dir.x,0,p.dir.z).normalize());
      dummy.scale.set(3.6,.36,Math.min(7,a.point.distanceTo(b)+.5));
      dummy.updateMatrix();ballast.setMatrixAt(i,dummy.matrix);
    }
    sleepers.instanceMatrix.needsUpdate=true;ballast.instanceMatrix.needsUpdate=true;
    sleepers.castShadow=false;ballast.castShadow=false;
    this.sleeperCount=n;
    const rails=[[],[]];
    for(const p of points){
      const i=points.indexOf(p);
      const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
      const tangent=next.clone().sub(prev).setY(0).normalize();
      const side=new THREE.Vector3(-tangent.z,0,tangent.x);
      for(let r=0;r<2;r++)rails[r].push(p.clone().addScaledVector(side,r===0?-.77:.77)
        .add(new THREE.Vector3(0,.055,0)));
    }
    for(const rail of rails){
      const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail,false,'centripetal'),
        points.length-1,.058,5,false);
      this.geometry.push(geo);
      const mesh=new THREE.Mesh(geo,this.materials.rail);
      mesh.name='Carril contínuo de aço';mesh.castShadow=false;mesh.receiveShadow=true;
      this.group.add(mesh);
    }
    // Only bridge regions receive viaduct piers and crash-resistant deck.
    this.bridgeSupports=0;
    for(let d=25;d<total-25;d+=43){
      const p=sampleAlignment(this.line,d),ground=this.terrainY(p.point.x,p.point.z);
      const deckHeight=p.point.y-ground;
      const nearRoad=this.roadside?.roadProximity(p.point.x,p.point.z).edge??Infinity;
      if(deckHeight<3.6||nearRoad<12)continue;
      this.createBox('Pilar do viaduto',
        new THREE.Vector3(p.point.x,(p.point.y+ground)/2-.2,p.point.z),
        [1.12,Math.max(.5,deckHeight-.5),1.12],this.materials.concrete);
      this.bridgeSupports++;
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
  }
}
