import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Wildlife belongs to a real loaded farm sector. Detailed, reusable 3D
// geometry is shared within each flock and is released with the farm sector.
const material=(color,roughness=.91)=>new THREE.MeshStandardMaterial({
  color,roughness,side:THREE.DoubleSide});
const add=(parent,name,geometry,mat,x,y,z,sx=1,sy=1,sz=1)=>{
  const mesh=new THREE.Mesh(geometry,mat);
  mesh.name=name;
  mesh.position.set(x,y,z);
  mesh.scale.set(sx,sy,sz);
  mesh.castShadow=false;mesh.receiveShadow=true;
  parent.add(mesh);return mesh;
};
const triangle=points=>{
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geo.setIndex([0,1,2,0,2,3]);
  geo.computeVertexNormals();
  return geo;
};
export function createSwallowModel(resources){
  const {sphere,wingRight,wingLeft,tail,mat}=resources;
  const root=new THREE.Group();root.name='Andorinha · corpo aerodinâmico';
  add(root,'Corpo escuro',sphere,mat.dark,0,0,0,.11,.105,.38);
  add(root,'Peito claro',sphere,mat.light,0,-.035,.14,.075,.075,.18);
  add(root,'Cabeça',sphere,mat.dark,0,.025,.30,.12,.115,.13);
  add(root,'Garganta avermelhada',sphere,mat.throat,0,-.03,.385,.064,.046,.042);
  const left=new THREE.Group(),right=new THREE.Group();
  left.name='Asa esquerda articulada';right.name='Asa direita articulada';
  add(left,'Pena esquerda',wingLeft,mat.dark,0,0,0);
  add(right,'Pena direita',wingRight,mat.dark,0,0,0);
  root.add(left,right);
  add(root,'Cauda bifurcada de andorinha',tail,mat.dark,0,0,-.26);
  root.userData.wings={left,right};
  return root;
}
export function buildRuralWildlife(root,region,terrain,quality='high',physics=null,bodies=null){
  const geometries={
    sphere:new THREE.SphereGeometry(1,10,8),
    cylinder:new THREE.CylinderGeometry(1,1,1,7),
    wingLeft:triangle([0,0,.19,-.19,.05,.03,-.69,.045,-.38,-.33,.01,-.16]),
    wingRight:triangle([0,0,.19,.33,.01,-.16,.69,.045,-.38,.19,.05,.03]),
    tail:triangle([-.05,0,.05,-.26,0,-.45,.02,0,-.31,.26,0,-.45])
  };
  const mat={
    cow:material(0x8a6a50),cowLight:material(0xe2d5c0),
    patches:material(0x473d34),muzzle:material(0xb8a49a),
    hooves:material(0x494744),sheep:material(0xd9d7c6),
    sheepFace:material(0x544d47),eye:material(0x171b1b),
    dark:material(0x252c31,.64),light:material(0xdedbd3,.71),
    throat:material(0x77392f,.72)
  };
  const resources={...geometries,mat};
  const frame=region.tangent.clone().setY(0).normalize(),
    outward=region.side.clone().setY(0).normalize();
  const factor=Math.sign(frame.z*outward.x-frame.x*outward.z)||1;
  const location=(out,along)=>{
    const x=region.roadPoint.x+outward.x*out+frame.x*along;
    const z=region.roadPoint.z+outward.z*out+frame.z*along;
    return new THREE.Vector3(factor*out,
      terrain(x,z)-root.position.y,along);
  };
  const cows=[],sheep=[],birds=[];
  let animalColliders=0;
  const animalCollider=(out,along,y,width,height,depth,yaw)=>{
    if(!physics||!bodies)return;
    const x=region.roadPoint.x+outward.x*out+frame.x*along;
    const z=region.roadPoint.z+outward.z*out+frame.z*along;
    const body=new CANNON.Body({mass:0});
    body.addShape(new CANNON.Box(new CANNON.Vec3(width*.5,height*.5,depth*.5)));
    body.position.set(x,terrain(x,z)+y,z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),
      Math.atan2(frame.x,frame.z)+yaw);
    physics.addBody(body);bodies.push(body);animalColliders++;
  };
  const farm=region.kind==='farm'||region.kind==='farmstead';
  function createCow(out,along,variant){
    const model=new THREE.Group();model.name='Vaca de quinta · gado';
    model.position.copy(location(out,along));
    model.rotation.y=[.5,-.65,1.15][variant%3];
    root.add(model);
    const bodyMat=variant%2?mat.cowLight:mat.cow;
    add(model,'Tronco anatómico',geometries.sphere,bodyMat,0,1.11,0,.52,.58,1.05);
    add(model,'Manchas do pelo',geometries.sphere,mat.patches,-.42,1.33,.18,.14,.22,.40);
    for(const x of [-.34,.34])for(const z of [-.70,.70]){
      add(model,'Pata bovina',geometries.cylinder,bodyMat,x,.48,z,.14,.86,.15);
      add(model,'Casco',geometries.sphere,mat.hooves,x,.10,z,.18,.13,.20);
    }
    const head=new THREE.Group();head.name='Cabeça bovina · movimento de pastagem';
    head.position.set(0,1.35,.62);
    add(head,'Pescoço',geometries.sphere,bodyMat,0,.04,.22,.35,.39,.47);
    add(head,'Cabeça',geometries.sphere,bodyMat,0,.02,.66,.31,.32,.33);
    add(head,'Focinho',geometries.sphere,mat.muzzle,0,-.13,.91,.26,.17,.17);
    for(const sign of [-1,1]){
      add(head,'Orelha',geometries.sphere,bodyMat,sign*.37,.23,.57,.19,.07,.13);
      add(head,'Olho',geometries.sphere,mat.eye,sign*.26,.11,.81,.042,.041,.038);
    }
    model.add(head);
    const tail=add(model,'Cauda',geometries.cylinder,bodyMat,0,1.02,-1.01,.04,.73,.05);
    tail.rotation.x=-.36;
    animalCollider(out,along,1.11,1.04,1.16,2.10,model.rotation.y);
    cows.push({head,tail,phase:variant*1.9});
  }
  function createSheep(out,along,index){
    const model=new THREE.Group();model.name='Ovelha · rebanho';
    model.position.copy(location(out,along));
    model.rotation.y=index*.9;root.add(model);
    add(model,'Corpo de lã',geometries.sphere,mat.sheep,0,.78,0,.46,.43,.69);
    for(const [x,y,z] of [[-.40,.97,-.22],[.35,1.01,-.16],
      [0,1.10,.18],[-.34,.69,.18],[.36,.77,.20]]){
      add(model,'Volume de lã',geometries.sphere,mat.sheep,x,y,z,.30,.27,.30);
    }
    for(const x of [-.27,.27])for(const z of [-.43,.43])
      add(model,'Pata de ovelha',geometries.cylinder,mat.sheepFace,
        x,.29,z,.083,.50,.075);
    const head=new THREE.Group();head.position.set(0,.83,.52);
    add(head,'Cabeça de ovelha',geometries.sphere,mat.sheepFace,
      0,0,.15,.23,.22,.35);
    for(const x of [-.17,.17])
      add(head,'Olho de ovelha',geometries.sphere,mat.eye,x,.09,.36,.032,.035,.04);
    model.add(head);
    animalCollider(out,along,.78,.90,.86,1.38,model.rotation.y);
    sheep.push({head,phase:index*1.7});
  }
  if(farm){
    for(const [i,out,along] of [[0,104,-45],[1,116,-22],[2,99,4]])
      createCow(out,along,i);
    for(const [i,out,along] of [
      [0,92,18],[1,104,30],[2,115,23],[3,110,-6],[4,123,0]])
      createSheep(out,along,i);
  }
  const count=quality==='low'?5:quality==='medium'?8:
    quality==='ultra'?14:11;
  for(let i=0;i<count;i++){
    const bird=createSwallowModel(resources);
    const x=55+i*1.65,z=-12+i*3.4;
    bird.position.copy(location(x,z));
    bird.position.y+=11;
    bird.scale.setScalar(.8+i%4*.10);
    bird.userData.base={x:factor*x,z,y:bird.position.y};
    root.add(bird);birds.push(bird);
  }
  const update=elapsed=>{
    // Independent elliptical flight with height variation, turn banking and
    // fast alternating wing beats. No random teleportation between frames.
    for(let i=0;i<birds.length;i++){
      const bird=birds[i],base=bird.userData.base;
      const speed=.63+i%4*.11,phase=i*2.39996;
      const t=elapsed*speed+phase,r=15+i%5*3.9;
      const dx=Math.cos(t)*r,dz=Math.sin(t*1.31)*r*.67;
      const vx=-Math.sin(t)*r*speed,vz=
        Math.cos(t*1.31)*r*.67*1.31*speed;
      bird.position.set(base.x+dx,
        base.y+Math.sin(t*1.7+i)*1.9+.5*Math.sin(t*.6),
        base.z+dz);
      bird.rotation.set(.05*Math.sin(t*2),Math.atan2(vx,vz),
        -.22*Math.sin(t*.72));
      const wings=bird.userData.wings;
      const flap=Math.sin(elapsed*(14.2+i%3*1.5)+phase)*.53;
      wings.left.rotation.z=-.12-flap;
      wings.right.rotation.z=.12+flap;
    }
    for(const [i,cow]of cows.entries()){
      cow.head.rotation.x=.12+.30*(.5+.5*Math.sin(elapsed*.36+cow.phase));
      cow.tail.rotation.z=.14*Math.sin(elapsed*.95+i);
    }
    for(const [i,animal]of sheep.entries())
      animal.head.rotation.x=.18*Math.sin(elapsed*.59+animal.phase);
  };
  update(0);
  return {update,stats:{cows:cows.length,sheep:sheep.length,
    swallows:birds.length,animalColliders},root,geometries,materials:mat};
}
