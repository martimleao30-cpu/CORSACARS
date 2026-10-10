import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {roadDeckHeight} from './road-upgrades.js';
import {roadProfile} from './road-standards.js';

// Road-class-dependent paved shoulders and highway central reservation.
// Reuses each road's static physics body, avoiding thousands of new bodies.
const tangent=(points,i)=>{
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
  const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1;
  return {x:-dz/l,z:dx/l};
};
const buildMesh=(vertices,uv,colors,indices,mat,name)=>{
  if(!indices.length)return null;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh=new THREE.Mesh(geo,mat);
  mesh.receiveShadow=true;mesh.name=name;
  return mesh;
};
const beside=(road,i,lateral,terrainY,height=0)=>{
  const p=road.points[i],n=tangent(road.points,i);
  const x=p.x+n.x*lateral,z=p.z+n.z*lateral;
  return [x,roadDeckHeight(terrainY,x,z,lateral,road.width)+height,z];
};
const unionMesh=(scene,road,terrainY,offset,extents,color=1)=>{
  const pos=[],uv=[],colors=[],idx=[];
  let along=0;
  for(let i=0;i<road.points.length;i++){
    if(i)along+=Math.hypot(road.points[i].x-road.points[i-1].x,
      road.points[i].z-road.points[i-1].z);
    for(const outer of extents){
      const lateral=offset*(road.width*.5+outer);
      const [x,y,z]=beside(road,i,lateral,terrainY,.005);
      pos.push(x,y,z);
      uv.push((lateral+road.width*.5)/5,along/5);
      colors.push(color,color,color);
    }
    if(!i)continue;
    const a=(i-1)*extents.length,b=i*extents.length;
    for(let j=0;j<extents.length-1;j++){
      if(offset>0)idx.push(a+j,a+j+1,b+j,a+j+1,b+j+1,b+j);
      else idx.push(a+j,b+j,a+j+1,a+j+1,b+j,b+j+1);
    }
  }
  const mesh=buildMesh(pos,uv,colors,idx,
    road.mesh.material,road.name+' · Berma pavimentada de emergência');
  mesh.geometry.userData.roadShoulderWidth=extents.at(-1);
  scene.add(mesh);
  if(road.body)road.body.addShape(new CANNON.Trimesh(pos,idx));
  return mesh;
};
const nearIntersection=(road,p,junctions,radius)=>{
  return junctions.some(j=>(j.primary===road||j.secondary===road)&&
    Math.hypot(j.x-p.x,j.z-p.z)<radius);
};
function highwayMedian(scene,road,terrainY,junctions){
  const width=roadProfile(road).median;
  if(!width)return null;
  const deckMat=new THREE.MeshStandardMaterial({
    color:0x92918a,roughness:.98,metalness:0,side:THREE.DoubleSide,
    vertexColors:true
  });
  const concrete=new THREE.MeshStandardMaterial({
    color:0xb4b7b7,roughness:.78,metalness:.08,side:THREE.DoubleSide,
    vertexColors:true
  });
  const deck=[],rail=[],uv=[],railUv=[],colors=[],railColors=[],deckIdx=[],railIdx=[];
  const source=road.points;
  let along=0;
  for(let i=0;i<source.length;i++){
    if(i)along+=Math.hypot(source[i].x-source[i-1].x,
      source[i].z-source[i-1].z);
    const deckHeights=[[-width*.5,.09],[0,.14],[width*.5,.09]];
    for(const [lateral,rise] of deckHeights){
      const v=beside(road,i,lateral,terrainY,rise);
      deck.push(...v);uv.push(lateral/5,along/5);
      colors.push(.75,.79,.74);
    }
    for(const [lateral,h] of [[-.24,.10],[-.22,.80],[.22,.80],[.24,.10]]){
      const v=beside(road,i,lateral,terrainY,h);
      rail.push(...v);railUv.push(lateral/2,along/4);
      railColors.push(.85,.87,.90);
    }
    if(!i)continue;
    const a=i-1,b=i;
    if(nearIntersection(road,source[i],junctions,18)||
      nearIntersection(road,source[i-1],junctions,18))continue;
    for(let k=0;k<2;k++){
      const c=a*3+k,n=b*3+k;
      deckIdx.push(c,c+1,n,c+1,n+1,n);
    }
    for(let k=0;k<3;k++){
      const c=a*4+k,n=b*4+k;
      railIdx.push(c,c+1,n,c+1,n+1,n);
    }
  }
  const mesh=buildMesh(deck,uv,colors,deckIdx,deckMat,
    road.name+' · Separador central de 4 m');
  const barrier=buildMesh(rail,railUv,railColors,railIdx,concrete,
    road.name+' · Barreira de contenção central');
  mesh.geometry.userData.medianWidth=width;
  if(mesh)scene.add(mesh);
  if(barrier)scene.add(barrier);
  if(road.body&&railIdx.length)road.body.addShape(new CANNON.Trimesh(rail,railIdx));
  return {mesh,barrier};
}
export function buildRoadProfileGeometry(scene,road,terrainY,junctions=[]){
  const profile=roadProfile(road);
  const paved=[];
  // Right-side hard shoulders flank both directions of the simulated
  // four-lane section. Also provide EN hard shoulders on national routes.
  if(profile.median>0||road.id==='nacional'||road.id==='circular'||
    road.category==='ring'){
    for(const side of [-1,1])
      paved.push(unionMesh(scene,road,terrainY,side,
        [.055,profile.outerShoulder],.93));
  }
  const median=profile.median?highwayMedian(scene,road,terrainY,junctions):null;
  return {paved,median,profile};
}
