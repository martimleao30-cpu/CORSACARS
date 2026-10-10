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
      // A small intentional overlap avoids a hairline hole between two sampled decks.
       const halfV=primary.road.width*.5-.12;
      result.push({
        x:x.x,z:x.z,y:(x.y+x.otherY)*.5,
        primary:primary.road,secondary:secondary.road,
        ux,uz,halfU,halfV,angle:x.sin,
        kind:x.sin>.85?'cross':'oblique'
      });
    }
  }
  // Route endpoints may terminate directly in a ring/highway centreline
  // without crossing it. A strict segment intersection misses these T joins,
  // leaving a second asphalt cap and collider on the main carriageway.
  for(const road of roads){
    if(road.id==='circular'||road.points.length<2)continue;
    if(road.id==='provas')continue;
    const ends=[0,road.points.length-1];
    for(const end of ends){
      const point=center(road.points[end]);
      const near=center(road.points[end===0?1:end-1]);
      const sx=point.x-near.x,sz=point.z-near.z;
      const slen=Math.hypot(sx,sz)||1;
      const candidates=[];
      for(const main of roads){
        if(main===road||roadPriority(main)<=roadPriority(road))continue;
        for(let i=0;i<main.points.length-1;i++){
          const a=center(main.points[i]),b=center(main.points[i+1]);
          const vx=b.x-a.x,vz=b.z-a.z,len2=vx*vx+vz*vz;
          if(len2<.0001)continue;
          const t=Math.max(0,Math.min(1,((point.x-a.x)*vx+(point.z-a.z)*vz)/len2));
          const x=a.x+t*vx,z=a.z+t*vz;
          const d=Math.hypot(point.x-x,point.z-z);
          const y=a.y+t*(b.y-a.y);
          if(d>main.width*.5+.65||Math.abs(point.y-y)>1.2)continue;
          const seglen=Math.sqrt(len2),angle=Math.abs((sx*vz-sz*vx)/(slen*seglen));
          candidates.push({main,x,z,y,d,angle,
            ux:vx/seglen,uz:vz/seglen});
        }
      }
      candidates.sort((a,b)=>a.d-b.d);
      const c=candidates[0];
      if(!c||result.some(j=>j.secondary===road&&j.primary===c.main&&
        Math.hypot(j.x-c.x,j.z-c.z)<Math.max(10,c.main.width)))continue;
      result.push({
        x:c.x,z:c.z,y:c.y,primary:c.main,secondary:road,
        ux:c.ux,uz:c.uz,
        halfU:Math.min(22,road.width*.8/Math.max(.34,c.angle)+1.8),
        halfV:c.main.width*.5-.12,
        angle:c.angle,kind:'endpoint'
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
      const coords=shapes.flatMap(poly=>poly.map(v=>v.p));
      if(coords.every(p=>p[0]<cut.x-margin)||
         coords.every(p=>p[0]>cut.x+margin)||
         coords.every(p=>p[2]<cut.z-margin)||
         coords.every(p=>p[2]>cut.z+margin))continue;
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
// Pull the secondary edge onto the primary road's camber over a short
// transition band. Both the rendered and Cannon geometry use these vertices,
// so there's no floating ledge or abrupt height step at the asphalt seam.
export function blendJunctionHeights(geometry,cuts,terrainY){
  if(!geometry||!cuts?.length||typeof terrainY!=='function')return geometry;
  const vertices=geometry.getAttribute('position');
  let changed=false;
  for(let i=0;i<vertices.count;i++){
    const x=vertices.getX(i),z=vertices.getZ(i);
    let y=vertices.getY(i);
    for(const cut of cuts){
      const dx=x-cut.x,dz=z-cut.z;
      const u=dx*cut.ux+dz*cut.uz;
      const v=-dx*cut.uz+dz*cut.ux;
      const dv=Math.abs(v)-cut.halfV;
      const du=Math.max(0,Math.abs(u)-cut.halfU);
      if(dv<-.18||dv>3.6||du>3.8)continue;
      const t=1-Math.min(1,Math.max(0,dv/3.6));
      const end=1-Math.min(1,du/3.8);
      const blend=t*t*(3-2*t)*end*end*(3-2*end);
      const halfWidth=cut.primary.width*.5;
      const across=Math.min(1,Math.abs(v)/halfWidth);
      const primaryY=terrainY(x,z)+.205+.052*(1-across*across);
      y+=(primaryY-y)*blend;
    }
    if(Math.abs(y-vertices.getY(i))>.000001){
      vertices.setY(i,y);changed=true;
    }
  }
  if(changed){
    vertices.needsUpdate=true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return geometry;
}

// Remove roadwear decals whose instanced quads extend into another road's
// junction. Otherwise opaque tyre skids and gravel appear on top of asphalt
// after the underlying triangles have been clipped.
export function trimRoadWearAtJunctions(wear,cuts){
  if(!wear||!cuts?.length)return 0;
  const matrix=new THREE.Matrix4(),at=new THREE.Vector3(),
    rotation=new THREE.Quaternion(),size=new THREE.Vector3();
  let trimmed=0;
  for(const mesh of [wear.patches,wear.skids,wear.dirt]){
    if(!mesh?.isInstancedMesh)continue;
    let changed=false;
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);
      matrix.decompose(at,rotation,size);
      const radius=Math.max(Math.abs(size.x),Math.abs(size.z))*.5+.4;
      if(cuts.some(cut=>{
        const dx=at.x-cut.x,dz=at.z-cut.z;
        const u=dx*cut.ux+dz*cut.uz;
        const v=-dx*cut.uz+dz*cut.ux;
        return Math.abs(u)<cut.halfU+radius&&
          Math.abs(v)<cut.halfV+radius;
      })){
        matrix.makeScale(.000001,.000001,.000001);
        mesh.setMatrixAt(i,matrix);
        changed=true;trimmed++;
      }
    }
    if(changed){
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
    }
  }
  return trimmed;
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
    blendJunctionHeights(clipped,cuts,network.terrainY);
    road.mesh.geometry=clipped;
    if(road.sides?.geometry){
      const side=clipGeometryAtJunctions(road.sides.geometry,cuts);
      if(side){road.sides.geometry.dispose();road.sides.geometry=side;}
    }
    for(const ribbon of [...(road.shoulders||[]),...(road.drainage||[])]){
      const trimmed=clipGeometryAtJunctions(ribbon.geometry,cuts);
      if(trimmed){ribbon.geometry.dispose();ribbon.geometry=trimmed;}
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
    road.trimmedWear=trimRoadWearAtJunctions(road.wear,cuts);
  }
  return junctions;
}
