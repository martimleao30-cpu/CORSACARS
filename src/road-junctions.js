import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// At-grade crossings should never be two independent decks (and Cannon
// colliders) occupying the same asphalt. The higher-priority carriageway owns
// the central junction; the secondary deck and its painted lines are clipped
// precisely to its outer edge, including side walls and gravel shoulders.
const priority={
  circular:110,highway:100,urban:85,'highway-ramp':65,
  test:75,mountain:66,rural:60,dirt:38
};
export function roadPriority(road){
  return road.id==='circular'?110:(priority[road.category]||50)+Math.min(road.width,20)*.1;
}
const center=p=>p?.center||p;
const vec=(a,b)=>({x:b.x-a.x,z:b.z-a.z});
const cross=(a,b)=>a.x*b.z-a.z*b.x;
function intersect(a,b,c,d){
  const r=vec(a,b),s=vec(c,d),div=cross(r,s);
  if(Math.abs(div)<.00001)return null;
  const qp=vec(a,c),t=cross(qp,s)/div,u=cross(qp,r)/div;
  if(t<-.0005||t>1.0005||u<-.0005||u>1.0005)return null;
  const lenA=Math.hypot(r.x,r.z),lenB=Math.hypot(s.x,s.z);
  if(!lenA||!lenB||Math.abs(div)/(lenA*lenB)<.26)return null;
  return {x:a.x+t*r.x,z:a.z+t*r.z,
    y:a.y+t*(b.y-a.y),otherY:c.y+u*(d.y-c.y),
    ax:r.x/lenA,az:r.z/lenA,bx:s.x/lenB,bz:s.z/lenB,
    sin:Math.abs(div)/(lenA*lenB)};
}
export function findAtGradeJunctions(roads){
  // Spatial candidates: road bounding boxes per centre-line segment.
  const STEP=62,cells=new Map(),segments=[];
  for(const road of roads){
    for(let i=0;i<road.points.length-1;i++){
      const a=center(road.points[i]),b=center(road.points[i+1]);
      const seg={road,a,b,id:segments.length};
      segments.push(seg);
      const x1=Math.floor(Math.min(a.x,b.x)/STEP),x2=Math.floor(Math.max(a.x,b.x)/STEP);
      const z1=Math.floor(Math.min(a.z,b.z)/STEP),z2=Math.floor(Math.max(a.z,b.z)/STEP);
      for(let x=x1;x<=x2;x++)for(let z=z1;z<=z2;z++){
        const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);
        cells.get(key).push(seg);
      }
    }
  }
  const visited=new Set(),result=[];
  for(const candidates of cells.values()){
    for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
      const a=candidates[i],b=candidates[j];
      if(a.road===b.road)continue;
      const key=Math.min(a.id,b.id)+':'+Math.max(a.id,b.id);
      if(visited.has(key))continue;
      visited.add(key);
      const x=intersect(a.a,a.b,b.a,b.b);
      if(!x||Math.abs(x.y-x.otherY)>1.5)continue;
      const primary=roadPriority(a.road)>=roadPriority(b.road)?a:b;
      const secondary=primary===a?b:a;
      if(result.some(j=>j.primary===primary.road&&
         j.secondary===secondary.road&&
         Math.hypot(j.x-x.x,j.z-x.z)<6.5))continue;
      const dx=primary.b.x-primary.a.x,dz=primary.b.z-primary.a.z;
      const size=Math.hypot(dx,dz)||1;
      const ux=dx/size,uz=dz/size;
      const halfU=secondary.road.width*.58/Math.max(.28,x.sin)+2.1;
      const halfV=primary.road.width*.5+.035;
      result.push({
        x:x.x,z:x.z,y:(x.y+x.otherY)*.5,
        primary:primary.road,secondary:secondary.road,
        ux,uz,halfU,halfV,angle:x.sin,
        kind:x.sin>.85?'cross':'oblique'
      });
    }
  }
  return result;
}

function lerpVertex(a,b,t){
  const obj={};
  for(const k of Object.keys(a)){
    if(k==='p'||k==='uv'||k==='color')obj[k]=a[k].map((v,i)=>v+(b[k][i]-v)*t);
  }
  return obj;
}
function clipPolygon(poly,axis,keepInside){
  const result=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const da=axis(a.p),db=axis(b.p);
    const inA=keepInside?da>=0:da<=0,inB=keepInside?db>=0:db<=0;
    if(inA)result.push(a);
    if(inA!==inB){
      const t=da/(da-db);
      result.push(lerpVertex(a,b,Math.max(0,Math.min(1,t))));
    }
  }
  return result;
}
function subtractRect(triangle,cut){
  const dirX=cut.ux,dirZ=cut.uz,normalX=-dirZ,normalZ=dirX;
  const local=p=>({u:(p[0]-cut.x)*dirX+(p[2]-cut.z)*dirZ,
    v:(p[0]-cut.x)*normalX+(p[2]-cut.z)*normalZ});
  const halfU=cut.halfU,halfV=cut.halfV;
  const edges=[
    p=>local(p).u+halfU,
    p=>halfU-local(p).u,
    p=>local(p).v+halfV,
    p=>halfV-local(p).v
  ];
  let remaining=[triangle],kept=[];
  for(const edge of edges){
    const inside=[];
    for(const p of remaining){
      const outside=clipPolygon(p,edge,false);
      if(outside.length>=3)kept.push(outside);
      const part=clipPolygon(p,edge,true);
      if(part.length>=3)inside.push(part);
    }
    remaining=inside;
    if(!remaining.length)break;
  }
  return kept;
}
export function clipGeometryAtJunctions(geometry,cuts){
  if(!cuts?.length)return null;
  const pos=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),
    color=geometry.getAttribute('color'),index=geometry.index;
  if(!pos||!index)return null;
  const vertices=[],uvs=[],colors=[],indices=[];
  const get=i=>({p:[pos.getX(i),pos.getY(i),pos.getZ(i)],
    ...(uv?{uv:[uv.getX(i),uv.getY(i)]}:{}),
    ...(color?{color:[color.getX(i),color.getY(i),color.getZ(i)]}:{})});
  let removed=0,clipped=0;
  for(let i=0;i<index.count;i+=3){
    let shapes=[[get(index.getX(i)),get(index.getX(i+1)),get(index.getX(i+2))]];
    for(const cut of cuts){
      const margin=Math.hypot(cut.halfU,cut.halfV)+12;
      if(shapes.every(poly=>poly.every(v=>Math.abs(v.p[0]-cut.x)>margin||
         Math.abs(v.p[2]-cut.z)>margin)))continue;
      const next=[];
      for(const shape of shapes){
        const result=subtractRect(shape,cut);
        if(result.length!==1||result[0].length!==shape.length)clipped++;
        next.push(...result);
      }
      shapes=next;
      if(!shapes.length){removed++;break;}
    }
    for(const poly of shapes){
      const start=vertices.length/3;
      for(const v of poly){
        vertices.push(...v.p);
        if(uv)uvs.push(...v.uv);
        if(color)colors.push(...v.color);
      }
      for(let j=1;j<poly.length-1;j++)indices.push(start,start+j,start+j+1);
    }
  }
  if(!clipped&&!removed)return null;
  if(!indices.length)return null;
  const result=new THREE.BufferGeometry();
  result.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  if(uv)result.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  if(color)result.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  result.setIndex(indices);
  result.computeVertexNormals();
  result.computeBoundingSphere();
  result.userData={...geometry.userData,junctionClipped:true,
    removedTriangles:removed,clippedTriangles:clipped};
  return result;
}
export function resolveRoadJunctions(network,physics){
  const junctions=findAtGradeJunctions(network.roads);
  network.junctions=junctions;
  for(const road of network.roads){
    if(!road.mesh||!road.body)continue; // circular deck handled by world
    const cuts=junctions.filter(j=>j.secondary===road);
    if(!cuts.length)continue;
    // Keep the original centreline sampler for paint & lane geometries; the
    // edited mesh is the actual visual + physical carriageway.
    road.sourceGeometry=road.mesh.geometry;
    const clipped=clipGeometryAtJunctions(road.sourceGeometry,cuts);
    if(!clipped)continue;
    road.mesh.geometry=clipped;
    if(road.sides?.geometry){
      const side=clipGeometryAtJunctions(road.sides.geometry,cuts);
      if(side){road.sides.geometry.dispose();road.sides.geometry=side;}
    }
    for(const shoulder of road.shoulders||[]){
      const trimmed=clipGeometryAtJunctions(shoulder.geometry,cuts);
      if(trimmed){shoulder.geometry.dispose();shoulder.geometry=trimmed;}
    }
    // Remove duplicate Cannon triangles: physics must match what the player
    // sees, rather than maintaining invisible overlapping collision decks.
    physics.removeBody(road.body);
    const old=road.body;
    const replacement=new CANNON.Body({mass:0,material:old.material});
    replacement.addShape(new CANNON.Trimesh(
      Array.from(clipped.getAttribute('position').array),
      Array.from(clipped.index.array)));
    physics.addBody(replacement);
    road.body=replacement;
    road.junctionCuts=cuts;
  }
  return junctions;
}
