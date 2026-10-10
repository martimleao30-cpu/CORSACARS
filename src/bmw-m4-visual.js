import * as THREE from 'three';
import {makeCarPaint,makeAutomotiveGlass} from './materials.js';

// Original geometry inspired by the proportions of the 2025 M4 Competition.
// Not an official BMW digital twin or an unlicensed third-party 3D asset.
const mat=(c,metalness=0,roughness=.5,extras={})=>new THREE.MeshStandardMaterial({
  color:c,metalness,roughness,...extras});
export function createBMWM4Visual(){
  const root=new THREE.Group();
  root.name='BMW M4 Competition · Coupé M xDrive · visual próprio';
  const paint=makeCarPaint(0x35698b);
  const carbon=mat(0x12191e,.26,.40);
  const aluminium=mat(0x88979e,.84,.25);
  const glass=makeAutomotiveGlass();
  const led=mat(0xe5f2ff,.04,.30,{emissive:0xc6e8ff,emissiveIntensity:1.85});
  const red=mat(0x99111c,.15,.36,{emissive:0xf21425,emissiveIntensity:1.30});
  const black=mat(0x0b1116,.28,.35);
  const lights=[];
  function part(name,geo,material,pos,parent=root){
    const mesh=new THREE.Mesh(geo,material);
    mesh.name=name;mesh.position.set(...pos);
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);
    return mesh;
  }
  const box=(name,size,material,pos)=>part(name,
    new THREE.BoxGeometry(...size),material,pos);
  // Smooth subdivided body envelope, narrowed at each bumper.
  const sections=[
    [-2.40,.73,.26],[-2.23,.91,.34],[-1.65,.945,.40],
    [-1.25,.947,.48],[0,.947,.48],[1.25,.947,.44],
    [1.85,.91,.36],[2.28,.89,.31],[2.4,.74,.25]
  ];
  const verts=[],uvs=[],faces=[];
  for(let i=0;i<sections.length;i++){
    const [z,width,roofline]=sections[i];
    const silhouette=[
      [-width,-.18],[-width,.10],[-width*.90,roofline],
      [-width*.64,roofline+.04],[0,roofline+.045],
      [width*.64,roofline+.04],[width*.90,roofline],
      [width,.10],[width,-.18]
    ];
    for(const [x,y] of silhouette){verts.push(x,y,z);uvs.push((x+1)/2.0,(z+2.4)/4.8);}
    if(i>0)for(let j=0;j<silhouette.length-1;j++){
      const a=(i-1)*silhouette.length+j,b=i*silhouette.length+j;
      faces.push(a,a+1,b,a+1,b+1,b);
    }
  }
  const shell=new THREE.BufferGeometry();
  shell.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  shell.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  shell.setIndex(faces);shell.computeVertexNormals();
  part('Carroçaria M4 · painéis curvos',shell,paint,[0,0,0]);
  // Roof slope and windscreen glazing, framed with slim dark profiles.
  const roof=box('Tejadilho carbono', [1.43,.085,2.07],carbon,[0,1.13,-.19]);
  const wind=box('Para-brisas panorâmico',[1.52,.055,.97],glass,[0,.92,.78]);
  wind.rotation.x=-.51;
  const rear=box('Vidro traseiro',[1.47,.055,.78],glass,[0,.91,-1.15]);
  rear.rotation.x=.40;
  for(const side of [-1,1]){
    const window=box('Vidro lateral trapezoidal',[.044,.43,1.55],glass,
      [side*.775,.86,-.26]);
    const sill=box('Friso da janela',[.037,.041,1.76],aluminium,
      [side*.785,.65,-.25]);
    const mirror=box('Retrovisor aerodinâmico',[.29,.15,.30],paint,
      [side*1.07,.71,.57]);
    const cap=box('Base do retrovisor',[.065,.12,.34],carbon,
      [side*.95,.68,.56]);
    for(const z of [-1.33,.47])box('Pilar lateral carbono',
      [.08,.52,.075],carbon,[side*.755,.89,z]);
    box('Saia lateral M', [.105,.14,3.28],carbon,
      [side*.929,-.17,-.01]);
    // Front laser-style LED housings and asymmetric U-shaped signature.
    const head=box('Farol dianteiro LED',[.59,.13,.22],black,
      [side*.57,.25,2.295]);
    const signature=box('Assinatura LED dianteira',[.40,.049,.055],led,
      [side*.57,.29,2.418]);
    signature.rotation.z=side*.10;lights.push(signature);
    const taillamp=box('Ótica traseira LED',[.65,.12,.12],red,
      [side*.57,.24,-2.348]);lights.push(taillamp);
    box('Reflector traseiro',[.23,.04,.075],red,
      [side*.83,-.06,-2.364]);
    for(const dx of [-.13,.13]){
      const exhaust=part('Saída de escape dupla',
        new THREE.TorusGeometry(.081,.021,7,16),
        aluminium,[side*.67+dx,-.17,-2.435]);
      exhaust.rotation.x=Math.PI/2;
    }
    box('Guarda-lamas dianteiro M',[.27,.21,.30],paint,[side*.84,.10,1.46]);
    box('Guarda-lamas traseiro M',[.27,.20,.37],paint,[side*.85,.09,-1.40]);
  }
  // Large vertically divided twin-kidney grille and lower air intakes.
  for(const x of [-.235,.235]){
    const surround=box('Grelha dupla M4 · moldura',[.38,.53,.085],
      aluminium,[x,.08,2.405]);
    const inner=box('Grelha dupla M4 · miolo',[.325,.48,.090],
      black,[x,.08,2.461]);
    for(let j=0;j<7;j++)
      box('Aleta vertical da grelha',[.015,.43,.035],carbon,
        [x-.14+j*.046,.08,2.516]);
  }
  for(const x of [-.70,.70])box('Entrada de ar desportiva',
    [.33,.20,.071],carbon,[x,-.13,2.392]);
  const splitter=box('Lábio aerodinâmico dianteiro',
    [1.81,.045,.30],carbon,[0,-.25,2.26]);
  const diffuser=box('Difusor traseiro',[1.72,.18,.20],carbon,[0,-.23,-2.30]);
  const spoiler=box('Spoiler traseiro', [1.50,.058,.27],
    carbon,[0,.53,-2.22]);
  box('Matrícula dianteira',[.53,.105,.025],mat(0xe1e3dc),[0,-.12,2.507]);
  box('Matrícula traseira',[.53,.105,.024],mat(0xe1e3dc),[0,.16,-2.49]);
  // Side gills, bonnet relief and wheels remain independently steerable using
  // the existing 4 Cannon RaycastVehicle visual wheel pivots.
  for(const x of [-.36,.36])
    box('Nervura capô', [.04,.021,1.12],paint,[x,.48,1.57]);
  return {root,paint,lights};
}
