import * as THREE from 'three';
import {ROAD_SECTION} from './road-upgrades.js';
import {clipGeometryAtJunctions} from './road-junctions.js';

// Paint is projected on the EXACT road deck vertices, not a second terrain
// height calculation or long BoxGeometry floating above steep curved roads.
export const PAINT_LIFT=0.018;
export const LINE_STYLES=Object.freeze(['continuous','dashed','double']);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

export function createRoadSampler(road){
  if(!road?.mesh?.geometry?.getAttribute('position'))throw new Error('Road needs a rendered 3D deck');
  const attribute=(road.sourceGeometry||road.mesh.geometry).getAttribute('position');
  const stride=ROAD_SECTION.length;
  if(attribute.count!==road.points.length*stride)
    throw new Error('Road paint must match the original cross section');
  const chain=[0];
  for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1].center||road.points[i-1];
    const b=road.points[i].center||road.points[i];
    chain.push(chain[i-1]+Math.hypot(b.x-a.x,b.z-a.z));
  }
  const total=chain[chain.length-1];
  function point(distance,lateral=0,lift=PAINT_LIFT){
    const d=clamp(distance,0,total);
    const offset=clamp(2*lateral/road.width,-.98,.98);
    let low=0,high=chain.length-1;
    while(high-low>1){
      const mid=(low+high)>>1;
      if(chain[mid]<=d)low=mid;else high=mid;
    }
    const i=Math.min(low,chain.length-2);
    const blend=clamp((d-chain[i])/Math.max(1e-8,chain[i+1]-chain[i]),0,1);
    let j=0;
    while(j<stride-2&&offset>ROAD_SECTION[j+1])j++;
    const widthBlend=clamp((offset-ROAD_SECTION[j])/
      (ROAD_SECTION[j+1]-ROAD_SECTION[j]),0,1);
    const raw=attribute.array;
    function v(row,col,axis){return raw[(row*stride+col)*3+axis];}
    const out=[];
    for(let axis=0;axis<3;axis++){
      const v0=v(i,j,axis)*(1-widthBlend)+v(i,j+1,axis)*widthBlend;
      const v1=v(i+1,j,axis)*(1-widthBlend)+v(i+1,j+1,axis)*widthBlend;
      out.push(v0+(v1-v0)*blend);
    }
    return new THREE.Vector3(out[0],out[1]+lift,out[2]);
  }
  return {road,total,chain,point};
}

// Single indexed BufferGeometry for any number of continuous and interrupted
// surface ribbons. Sampling at ~1.1 m follows camber, vertical relief and bends.
function canvasBuffer(){
  const positions=[],uv=[],indices=[];
  function strip(sampler,start,end,lateral,width,step=1.1){
    if(end-start<=.01)return;
    const first=positions.length/3;
    const intervals=Math.max(1,Math.ceil((end-start)/step));
    for(let i=0;i<=intervals;i++){
      const distance=start+(end-start)*i/intervals;
      for(const side of [-1,1]){
        const p=sampler.point(distance,lateral+side*width*.5);
        positions.push(p.x,p.y,p.z);
        uv.push(side===-1?0:1,distance);
      }
      if(i>0){
        const k=first+(i-1)*2;
        indices.push(k,k+2,k+1,k+1,k+2,k+3);
      }
    }
  }
  function polygon(sampler,coordinates){
    if(coordinates.length<3)return;
    const base=positions.length/3;
    for(const [d,lateral] of coordinates){
      const p=sampler.point(d,lateral,PAINT_LIFT+.003);
      positions.push(p.x,p.y,p.z);
      uv.push(lateral,d);
    }
    for(let k=1;k<coordinates.length-1;k++)indices.push(base,base+k,base+k+1);
  }
  function build(){
    if(!indices.length)return null;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
  return {strip,polygon,build};
}

const paintMaterials=Object.freeze({
  white:new THREE.MeshBasicMaterial({
    color:0xe5e7e2,side:THREE.DoubleSide,transparent:true,opacity:.93,
    depthTest:true,depthWrite:false,polygonOffset:true,
    polygonOffsetFactor:-2,polygonOffsetUnits:-2
  }),
  yellow:new THREE.MeshBasicMaterial({
    color:0xf0c85f,side:THREE.DoubleSide,transparent:true,opacity:.95,
    depthTest:true,depthWrite:false,polygonOffset:true,
    polygonOffsetFactor:-2,polygonOffsetUnits:-2
  })
});

// Intersections reserve a paint-free envelope on BOTH the primary and
// secondary road. Clipping the secondary deck alone leaves stray centre lines
// crossing an otherwise valid junction on the main carriageway.
export function junctionPaintGaps(sampler,junctions=[],padding=3.8){
  const road=sampler.road;
  const gaps=[];
  for(const join of junctions){
    if(join.primary!==road&&join.secondary!==road)continue;
    let closest=0,best=Infinity;
    for(let i=0;i<road.points.length;i++){
      const p=road.points[i].center||road.points[i];
      const dist=(p.x-join.x)**2+(p.z-join.z)**2;
      if(dist<best){best=dist;closest=i;}
    }
    const center=sampler.chain[closest];
    const local=road===join.primary
      ?join.halfU:join.halfV/Math.max(.32,join.angle);
    const radius=Math.min(21,Math.max(4.5,local+padding));
    gaps.push([Math.max(0,center-radius),
      Math.min(sampler.total,center+radius)]);
  }
  gaps.sort((a,b)=>a[0]-b[0]);
  const merged=[];
  for(const [a,b]of gaps){
    if(merged.length&&a<=merged[merged.length-1][1])
      merged[merged.length-1][1]=Math.max(b,merged[merged.length-1][1]);
    else merged.push([a,b]);
  }
  return merged;
}

export function paintIntervals(total,start,end,excluded=[]){
  let intervals=[[clamp(start,0,total),clamp(end,0,total)]];
  for(const [lo,hi]of excluded){
    intervals=intervals.flatMap(([a,b])=>{
      if(hi<=a||lo>=b)return [[a,b]];
      const out=[];
      if(lo>a+.10)out.push([a,Math.min(b,lo)]);
      if(hi<b-.10)out.push([Math.max(a,hi),b]);
      return out;
    });
  }
  return intervals.filter(([a,b])=>b-a>.25);
}

// Solid no-overtaking areas are localized to genuinely sharp mountain bends.
// Rural roads default to dashed centre lines; highways use lane separators.
export function roadCenterMarking(road,sampler,gaps=[]){
  if(road.category==='highway')return {style:'dashed',solid:[]};
  if(road.category!=='mountain')return {style:'dashed',solid:[]};
  const solid=[];
  for(let i=5;i<road.points.length-5;i+=3){
    const a=road.points[i-4],p=road.points[i],b=road.points[i+4];
    const v1=new THREE.Vector2(p.x-a.x,p.z-a.z).normalize();
    const v2=new THREE.Vector2(b.x-p.x,b.z-p.z).normalize();
    const angle=Math.acos(clamp(v1.dot(v2),-1,1));
    if(angle>.29){
      const center=sampler.chain[i];
      solid.push([Math.max(0,center-14),Math.min(sampler.total,center+14)]);
    }
  }
  // Never put prohibition lines across the conflict area.
  const intervals=[];
  for(const [a,b]of solid)intervals.push(...paintIntervals(sampler.total,a,b,gaps));
  intervals.sort((a,b)=>a[0]-b[0]);
  const merged=[];
  for(const range of intervals){
    if(merged.length&&range[0]<=merged[merged.length-1][1]+4)
      merged[merged.length-1][1]=Math.max(range[1],merged[merged.length-1][1]);
    else merged.push([...range]);
  }
  // Merging nearby curve warnings may bridge a junction gap. Clip AGAIN
  // after joining the intervals so no solid segment crosses an intersection.
  return {style:'dashed',solid:merged.flatMap(([a,b])=>
    paintIntervals(sampler.total,a,b,gaps))};
}

export function createLineGeometry(sampler,{style='continuous',lateral=0,width=.13,
    start=0,end=sampler.total,dash=3.6,gap=5.4,spacing=.27,
    excluded=[]}={}){
  if(!LINE_STYLES.includes(style))throw new Error('Unknown line type: '+style);
  const out=canvasBuffer();
  const a=clamp(start,0,sampler.total),b=clamp(end,0,sampler.total);
  if(b<=a)return null;
  const intervals=paintIntervals(sampler.total,a,b,excluded);
  const paint=offset=>{
    if(style==='dashed'){
      for(let d=a;d<b;d+=dash+gap){
        const last=Math.min(d+dash,b);
        for(const [lo,hi]of intervals){
          if(hi<=d||lo>=last)continue;
          out.strip(sampler,Math.max(lo,d),Math.min(hi,last),offset,width);
        }
      }
    }else for(const [lo,hi]of intervals)out.strip(sampler,lo,hi,offset,width);
  };
  if(style==='double'){
    paint(lateral-spacing*.5);
    paint(lateral+spacing*.5);
  }else paint(lateral);
  const mesh=out.build();
  if(mesh)mesh.userData={kind:style,first:a,last:b,lateral,width,excluded};
  return mesh;
}

export function createCrosswalkGeometry(sampler,distance,{stripe=.57,gap=.47,
    length=2.8,margin=.65}={}){
  const out=canvasBuffer();
  const half=sampler.road.width*.5-margin;
  for(let offset=-half+stripe*.5;offset<half-stripe*.5;offset+=stripe+gap){
    out.strip(sampler,Math.max(0,distance-length*.5),
      Math.min(sampler.total,distance+length*.5),offset,stripe,.35);
  }
  const result=out.build();
  if(result)result.userData={kind:'crosswalk',distance};
  return result;
}

export function createArrowGeometry(sampler,distance,lateral=0,direction='straight'){
  const out=canvasBuffer();
  const bend=direction==='left'?-1.05:direction==='right'?1.05:0;
  const longitudinal=direction==='straight'?3.25:2.5;
  const back=distance-3.2,front=distance+longitudinal;
  if(back<0||front>sampler.total)return null;
  // 3D arrow silhouette follows the same sampled centre and width as the road.
  const coords=[
    [back,lateral-.16],[distance-.28,lateral-.16],
    [distance-.28,lateral-.78],
    [front,lateral+bend],
    [distance-.28,lateral+.78],
    [distance-.28,lateral+.16],
    [back,lateral+.16]
  ];
  // Arrow consists of a shaft quad + a triangular head (avoids concave fan).
  out.polygon(sampler,[
    [back,lateral-.16],[distance,lateral-.16],
    [distance,lateral+.16],[back,lateral+.16]
  ]);
  out.polygon(sampler,[
    [distance-.46,lateral-.84],[front,lateral+bend],
    [distance-.46,lateral+.84]
  ]);
  const g=out.build();
  if(g)g.userData={kind:'arrow',direction,distance,lateral,outline:coords};
  return g;
}

function crosswalkIndices(road){
  const last=road.points.length-1;
  return road.id==='nacional'?[26,68,106].filter(i=>i<last-2):
    road.category==='urban'?[Math.floor(last*.48)]:[];
}

export class RoadSignage {
  constructor(scene,network,quality='high'){
    this.scene=scene;
    this.network=network;
    this.quality=quality;
    this.meshes=[];
    this.samplers=new Map();
    this.statistics={continuous:0,dashed:0,double:0,arrows:0,crosswalks:0,
      geometries:0,roadCount:0};
    for(const road of network.roads) {
      if(road.surface==='dirt'||road.surface==='gravel')continue;
      if(!road.mesh)continue;
      const before=this.meshes.length;
      this.buildRoad(road);
      // Paint cannot float above the master carriageway at T/X junctions.
      if(road.junctionCuts?.length){
        for(const mesh of this.meshes.slice(before)){
          const trimmed=clipGeometryAtJunctions(mesh.geometry,road.junctionCuts);
          if(trimmed){
            mesh.geometry.dispose();
            mesh.geometry=trimmed;
          }
        }
      }
    }
  }

  add(meshGeometry,label,color='white'){
    if(!meshGeometry)return;
    const mesh=new THREE.Mesh(meshGeometry,paintMaterials[color]);
    mesh.name=label;
    mesh.renderOrder=3;
    mesh.frustumCulled=true;
    mesh.castShadow=false;
    mesh.receiveShadow=false;
    this.scene.add(mesh);
    this.meshes.push(mesh);
    this.statistics.geometries++;
    if(meshGeometry.userData.kind==='arrow')this.statistics.arrows++;
    else if(meshGeometry.userData.kind==='crosswalk')this.statistics.crosswalks++;
    return mesh;
  }

  buildRoad(road){
    const sampler=createRoadSampler(road),w=road.width,n=road.points.length-1;
    this.samplers.set(road.id,sampler);
    this.statistics.roadCount++;
    const highway=road.category==='highway';
    const connector=road.category==='highway-ramp';
    const length=sampler.total;
    const edge=w*.5-.45;
    const skipEnd=Math.min(length*.05,4.5);
    const start=skipEnd,end=length-skipEnd;
    if(end<=start)return;
    const gaps=junctionPaintGaps(sampler,this.network.junctions||[]);
    const clean=(at,margin=0)=>!gaps.some(([a,b])=>at>=a-margin&&at<=b+margin);
    // Interruption on both joined decks keeps painted lines from running
    // through the middle of an intersection or pointing into the wrong lane.
    for(const offset of [-edge,edge]){
      this.add(createLineGeometry(sampler,{style:'continuous',lateral:offset,
        width:.13,start,end,excluded:gaps}),
        road.name+' · Linha lateral contínua');
      this.statistics.continuous++;
    }
    if(!highway&&!connector){
      const center=roadCenterMarking(road,sampler,gaps);
      const solid=center.solid;
      // The ordinary centre is dashed. Where a genuine sharp bend occurs,
      // remove dash paint first and place one clean unbroken prohibition line.
      this.add(createLineGeometry(sampler,{style:center.style,lateral:0,
        start,end,dash:3.8,gap:5.2,width:.125,
        excluded:[...gaps,...solid]}),
        road.name+' · Linha central descontínua');
      this.statistics.dashed++;
      for(const [a,b]of solid){
        for(const [lo,hi]of paintIntervals(length,a,b,gaps)){
          if(hi-lo<3)continue;
          this.add(createLineGeometry(sampler,{style:'continuous',
            lateral:0,width:.14,start:Math.max(start,lo),
            end:Math.min(end,hi)}),
            road.name+' · Linha contínua de curva perigosa');
          this.statistics.continuous++;
        }
      }
    }
    if(highway){
      // Centreline belongs to the median barrier. Mark real lane divisions
      // only; never paint a fictional double line under the central rail.
      for(const lateral of [-w*.25,w*.25]){
        this.add(createLineGeometry(sampler,{style:'dashed',lateral,
          width:.13,start,end,dash:5.6,gap:7.4,excluded:gaps}),
          road.name+' · Linha entre vias');
        this.statistics.dashed++;
      }
    }
    const crosswalks=crosswalkIndices(road);
    for(const k of crosswalks){
      const at=sampler.chain[k];
      if(!clean(at,3.5))continue;
      this.add(createCrosswalkGeometry(sampler,at),
        road.name+' · Passadeira pintada');
    }
    if(road.category==='urban'){
      for(const idx of crosswalks){
        const center=sampler.chain[idx];
        for(const side of [-1,1]){
          const d=center-(side===-1?24:37);
          if(d>8&&d<length-8&&clean(d,7)){
            const lateral=side*w*.23;
            this.add(createArrowGeometry(sampler,d,lateral,
              side===-1?'straight':'right'),road.name+' · Seta direcional');
          }
        }
      }
    }else if(highway||connector){
      for(let d=28;d<length-16;d+=Math.max(85,length/4)){
        if(!clean(d,8))continue;
        const lanes=highway?[-w*.36,w*.36]:[0];
        for(const lateral of lanes)this.add(createArrowGeometry(sampler,d,lateral,
          connector?'right':'straight'),road.name+' · Seta de orientação');
      }
    }
  }

  dispose(){
    for(const mesh of this.meshes){
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.length=0;
    this.samplers.clear();
  }
}
