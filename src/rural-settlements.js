import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Streamed rural architecture: original farm buildings, working yards, fields,
// machinery, hay stacks and village houses. All buildings sit above terrain,
// oriented along the connected access road, and have physical collision.
const mat=(c,roughness=.8,metalness=0)=>new THREE.MeshStandardMaterial({
  color:c,roughness,metalness});
const MATERIALS={
  plaster:mat(0xd9d0bb,.94),stone:mat(0x979180,.98),roof:mat(0x643c36,.78),
  tile:mat(0x846049,.91),timber:mat(0x665143,.95),steel:mat(0x747c7f,.58,.55),
  window:mat(0x344e55,.33,.23),paint:mat(0xe9dfc3,.86),soil:mat(0x70614d,.99),
  crop:mat(0x7e924f,.93),cropDry:mat(0xb5a06c,.95),bale:mat(0x98834e,.95),
  green:mat(0x43573d,.9),asphalt:mat(0x575b57,.96)
};
function localFrame(region,terrain){
  const tangent=region.tangent.clone().setY(0).normalize();
  const outward=region.side.clone().setY(0).normalize();
  const yaw=Math.atan2(tangent.x,tangent.z);
  const factor=Math.sign(tangent.z*outward.x-tangent.x*outward.z)||1;
  const origin=region.roadPoint;
  const ground=(lateral,along)=>{
    const x=origin.x+outward.x*lateral+tangent.x*along;
    const z=origin.z+outward.z*lateral+tangent.z*along;
    return {x,z,y:terrain(x,z)};
  };
  return {yaw,factor,origin,ground};
}
export function buildRuralSettlement(group,physics,bodies,region,terrain){
  const frame=localFrame(region,terrain);
  const root=new THREE.Group();
  root.name=region.kind==='hamlet'?'Aldeia habitada · casas e largos':'Exploração agrícola · estruturas rurais';
  root.position.set(frame.origin.x,terrain(frame.origin.x,frame.origin.z),frame.origin.z);
  root.rotation.y=frame.yaw;
  group.add(root);
  const ownedGeometries=[],stats={buildings:0,fields:0,hayBales:0,objects:0,
    fenceSections:0,colliders:0};
  function box(name,out,along,w,h,d,material,collision=false,raise=0){
    const geo=new THREE.BoxGeometry(w,h,d);ownedGeometries.push(geo);
    const mesh=new THREE.Mesh(geo,MATERIALS[material]);
    const foot=frame.ground(out,along);
    mesh.position.set(frame.factor*out,foot.y-root.position.y+h*.5+raise,along);
    mesh.castShadow=h>1;mesh.receiveShadow=true;mesh.name=name;root.add(mesh);
    if(collision){
      const body=new CANNON.Body({mass:0});
      body.addShape(new CANNON.Box(new CANNON.Vec3(w*.5,h*.5,d*.5)));
      body.position.set(foot.x,foot.y+h*.5+raise,foot.z);
      body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),frame.yaw);
      physics.addBody(body);bodies.push(body);stats.colliders++;
    }
    stats.objects++;return mesh;
  }
  function cylinder(name,out,along,r,height,material,rotate=false){
    const geo=new THREE.CylinderGeometry(r*.94,r,height,12);ownedGeometries.push(geo);
    const mesh=new THREE.Mesh(geo,MATERIALS[material]);
    const foot=frame.ground(out,along);
    mesh.position.set(frame.factor*out,foot.y-root.position.y+height*.5,along);
    if(rotate)mesh.rotation.z=Math.PI/2;
    mesh.castShadow=height>1;mesh.name=name;root.add(mesh);stats.objects++;
    return mesh;
  }
  function house(out,along,width=10,depth=8,color='plaster'){
    box('Casa rural · paredes',out,along,width,5.4,depth,color,true);
    box('Casa rural · telhado cerâmico',out,along,width+1.15,.46,depth+1.2,'roof',false,5.4);
    for(const side of [-1,1])for(const z of [-2.3,2.3]){
      box('Janela e portadas',out+side*(width*.50+.035),along+z,
        .13,1.15,1.05,'window',false,1.9);
    }
    box('Porta de madeira',out,along+depth*.51,.09,2.3,1.25,'timber',false,0);
    stats.buildings++;
  }
  function barn(out,along,width=20,depth=15){
    box('Celeiro agrícola · pedra e reboco',out,along,width,6.3,depth,'stone',true);
    box('Celeiro · cobertura de duas águas',out,along,width+1.1,.65,depth+1.0,'roof',false,6.3);
    box('Celeiro · portão de correr',out,along+depth*.51,.1,4.2,4.9,'timber',false,.75);
    for(const x of [-width*.4,width*.4])
      box('Celeiro · vigas',out+x,along, .25,6.4,depth,'timber');
    stats.buildings++;
  }
  function fence(outA,outB,alongA,alongB){
    // Each fence section is wholly on private farmland; never bridges the
    // public road or the driveway opening beside the gate.
    const horizontal=Math.hypot(outB-outA,alongB-alongA);
    if(horizontal<.5)return;
    const x=(outA+outB)/2,z=(alongA+alongB)/2;
    const beam=box('Vedação do campo',x,z,.13,1.1,horizontal,'timber');
    beam.rotation.y=Math.atan2(outA-outB,alongB-alongA);
    for(const [out,along] of [[outA,alongA],[outB,alongB]])
      box('Estaca de vedação',out,along,.16,1.4,.16,'timber');
    stats.fenceSections++;
  }
  // Driveable dirt access connects the public road with the farm entrance or
  // village courtyard. Tiles follow terrain to avoid a long floating slab.
  for(let out=9;out<=38;out+=4.7){
    box('Acesso rural de gravilha',out,0,4.95,.10,5.0,'asphalt',false);
  }
  if(region.kind==='hamlet'){
    // A small rural settlement, not a random roadside prop. The bus stop
    // should be near these houses, on the road's opposite verge.
    for(const [out,along,w,d] of [[34,-40,10,9],[35,-13,9,9],
      [34,15,11,9],[38,41,9,8],[56,-2,10,9]]){
      house(out,along,w,d,'plaster');
    }
    box('Largo da aldeia · calçada',18,0,20,.16,34,'stone');
    box('Aldeia · poço',25,29,2.1,1.2,2.1,'stone',true);
    cylinder('Aldeia · sombra de oliveira',42,58,.25,4.9,'timber');
  }else{
    house(34,-29,11,8);
    barn(46,13,21,15);
    // Second agricultural shed further from the road.
    box('Abrigo de alfaias agrícolas',61,-29,13,4.3,9,'timber',true);
    box('Abrigo de alfaias · telhado',61,-29,14,.4,10,'roof',false,4.3);
    stats.buildings+=3;
    // Grain silo, haystack and parked tractor; visually distinct from cubes
    // filling the map with generic houses.
    cylinder('Silo de cereais',77,27,3.5,8.8,'steel');
    const siloRoof=new THREE.ConeGeometry(3.75,2.1,12);ownedGeometries.push(siloRoof);
    const roofMesh=new THREE.Mesh(siloRoof,MATERIALS.roof);
    roofMesh.position.set(frame.factor*77,
      frame.ground(77,27).y-root.position.y+9.8,27);
    roofMesh.name='Silo · cobertura cónica';root.add(roofMesh);
    for(const z of [-37,-33,-29,-25])for(const out of [74,80,86]){
      cylinder('Fardo de feno',out,z,.92,1.22,'bale',true);
      stats.hayBales++;
    }
    box('Trator agrícola · carroçaria',62,3,3.1,1.65,4.3,'green');
    box('Trator · cabina',62,1.9,2.35,1.55,1.95,'window');
    for(const side of [-1,1])for(const along of [1.5,4.9]){
      cylinder('Trator · pneu',62+side*1.65,along,.75,.4,'timber',true);
    }
    // Field strips with alternating crop tones and clear central access.
    for(let row=0;row<12;row++){
      const out=80+row*4.2;
      const along=55;
      const crop=box('Campo cultivado · talhão',out,along,1.45,.25,51,
        row%3===0?'cropDry':'crop');
      crop.castShadow=false;
      stats.fields++;
    }
    // Boundary fencing stops at the vehicle gate between ±7 m.
    for(const z of [-70,70])fence(25,132,z,z);
    fence(132,132,-70,70);
    fence(25,25,-70,-8);fence(25,25,8,70);
    for(const along of [-8,8]){
      box('Quinta · portão aberto',25,along,.23,1.65,.22,'steel');
    }
  }
  root.userData.ruralStats=stats;
  root.userData.ruralDispose=()=>{
    for(const geo of ownedGeometries)geo.dispose();
  };
  return {root,stats};
}
