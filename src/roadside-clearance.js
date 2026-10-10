// Exact 2D clearance around every drivable deck, its shoulders, intersections,
// ramp joins and entrances to named locations. One shared road-space index
// prevents disconnected scenery systems from putting objects on asphalt.
const CELL=48;
const BOX_MARGIN=35;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=(x,z)=>Math.floor(x/CELL)+','+Math.floor(z/CELL);
export function segmentDistance(x,z,a,b){
  const dx=b.x-a.x,dz=b.z-a.z;
  const norm=dx*dx+dz*dz;
  const t=norm?clamp(((x-a.x)*dx+(z-a.z)*dz)/norm,0,1):0;
  const cx=a.x+dx*t,cz=a.z+dz*t;
  return {distance:Math.hypot(cx-x,cz-z),x:cx,z:cz,t};
}
function segmentPair(a,b,c,d){
  const ux=b.x-a.x,uz=b.z-a.z,vx=d.x-c.x,vz=d.z-c.z;
  const w0x=a.x-c.x,w0z=a.z-c.z;
  const A=ux*ux+uz*uz,B=ux*vx+uz*vz,C=vx*vx+vz*vz;
  const D=ux*w0x+uz*w0z,E=vx*w0x+vz*w0z;
  const den=A*C-B*B;
  let s=den>1e-8?clamp((B*E-C*D)/den,0,1):0;
  const t=clamp((B*s+E)/(C||1),0,1);
  s=clamp((B*t-D)/(A||1),0,1);
  const p={x:a.x+ux*s,z:a.z+uz*s};
  const q={x:c.x+vx*t,z:c.z+vz*t};
  return {x:(p.x+q.x)*.5,z:(p.z+q.z)*.5,
    distance:Math.hypot(p.x-q.x,p.z-q.z)};
}
export class RoadsideClearance{
  constructor(network,regions=[]){
    this.network=network;
    this.cells=new Map();
    this.segments=[];
    this.openings=[];
    this.junctions=[];
    this.placed={plants:0,rejectedPlants:0,fences:0,rejectedFences:0};
    for(const road of network.roads){
      const points=road.points;
      for(let i=0;i<points.length-1;i++){
        const a=points[i].center||points[i],b=points[i+1].center||points[i+1];
        const seg={road,a,b,index:i,id:this.segments.length};
        this.segments.push(seg);
        const x1=Math.floor((Math.min(a.x,b.x)-BOX_MARGIN)/CELL);
        const x2=Math.floor((Math.max(a.x,b.x)+BOX_MARGIN)/CELL);
        const z1=Math.floor((Math.min(a.z,b.z)-BOX_MARGIN)/CELL);
        const z2=Math.floor((Math.max(a.z,b.z)+BOX_MARGIN)/CELL);
        for(let x=x1;x<=x2;x++)for(let z=z1;z<=z2;z++){
          const key=x+','+z;
          if(!this.cells.has(key))this.cells.set(key,[]);
          this.cells.get(key).push(seg);
        }
      }
      if(road.id!=='circular' && points.length>2){
        const first=points[0].center||points[0];
        const last=points[points.length-1].center||points[points.length-1];
        this.addJunction(first.x,first.z,road.width*.5+11);
        this.addJunction(last.x,last.z,road.width*.5+11);
      }
    }
    // Locate real intersections between road centerlines, including a regional
    // route crossing the ring halfway and side streets crossing other streets.
    const checked=new Set();
    for(const seg of this.segments){
      const mx=(seg.a.x+seg.b.x)*.5,mz=(seg.a.z+seg.b.z)*.5;
      const near=this.candidates(mx,mz);
      const ux=seg.b.x-seg.a.x,uz=seg.b.z-seg.a.z;
      const ul=Math.hypot(ux,uz)||1;
      for(const other of near){
        if(seg.road===other.road)continue;
        const key=Math.min(seg.id,other.id)+':'+Math.max(seg.id,other.id);
        if(checked.has(key))continue;
        checked.add(key);
        const vx=other.b.x-other.a.x,vz=other.b.z-other.a.z;
        const cross=Math.abs((ux*vz-uz*vx)/(ul*(Math.hypot(vx,vz)||1)));
        if(cross<.35)continue;
        const distance=segmentPair(seg.a,seg.b,other.a,other.b);
        if(distance.distance<Math.max(2.2,(seg.road.width+other.road.width)*.20)){
          this.addJunction(distance.x,distance.z,
            Math.max(seg.road.width,other.road.width)*.5+10);
        }
      }
    }
    for(const region of regions){
      const a=region.roadPoint,b=region.point;
      this.openings.push({a,b,width:Math.max(6,region.kind==='service'?10:7),
        kind:region.kind});
      this.addJunction(a.x,a.z,region.kind==='service'?16:13);
    }
  }
  addJunction(x,z,radius){
    const existing=this.junctions.find(j=>Math.hypot(j.x-x,j.z-z)<13);
    if(existing){existing.radius=Math.max(existing.radius,radius);return;}
    this.junctions.push({x,z,radius});
  }
  candidates(x,z){
    // The index includes a 35-metre bounding margin; 3×3 neighbourhood
    // safely handles segment endpoints at grid borders.
    const cx=Math.floor(x/CELL),cz=Math.floor(z/CELL);
    const unique=new Set();
    const result=[];
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      for(const seg of this.cells.get((cx+dx)+','+(cz+dz))||[]){
        if(!unique.has(seg.id)){unique.add(seg.id);result.push(seg);}
      }
    }
    return result;
  }
  roadProximity(x,z,excludeRoad=null){
    let best={distance:Infinity,edge:Infinity,road:null};
    for(const seg of this.candidates(x,z)){
      if(excludeRoad&&(seg.road===excludeRoad||seg.road.id===excludeRoad))continue;
      const d=segmentDistance(x,z,seg.a,seg.b).distance;
      const edge=d-seg.road.width*.5;
      if(edge<best.edge)best={distance:d,edge,road:seg.road};
    }
    return best;
  }
  nearJunction(x,z,margin=0){
    return this.junctions.some(j=>
      Math.hypot(j.x-x,j.z-z)<j.radius+margin);
  }
  nearAccess(x,z,margin=0){
    return this.openings.some(o=>
      segmentDistance(x,z,o.a,o.b).distance<o.width*.5+margin);
  }
  plantAllowed(x,z,kind='grass',radius=0){
    const margin={grass:2.8,flower:3.8,shrub:5.5,tree:9.5,
      roadsideShrub:3.5,rock:1.5}[kind]??4;
    const boundary=this.roadProximity(x,z);
    if(boundary.road&&boundary.edge<margin+radius){
      this.placed.rejectedPlants++;return false;
    }
    const junctionMargin={grass:1,flower:2,shrub:4,tree:7,
      roadsideShrub:3,rock:2}[kind]??2;
    if(this.nearJunction(x,z,junctionMargin+radius)||
       this.nearAccess(x,z,junctionMargin+radius)){
      this.placed.rejectedPlants++;return false;
    }
    this.placed.plants++;return true;
  }
  fenceAllowed(x,z,road,margin=1){
    const other=this.roadProximity(x,z,road);
    const blocked=(other.road&&other.edge<4.8+margin)||
      this.nearJunction(x,z,margin+1.3)||
      this.nearAccess(x,z,margin+2);
    if(blocked)this.placed.rejectedFences++;
    else this.placed.fences++;
    return !blocked;
  }
  // Check quarter-points too, so a 7-metre beam never cuts across the mouth
  // of an entrance while its two endpoints happen to be outside it.
  fenceSegmentAllowed(a,b,road,margin=1){
    for(const t of [0,.25,.5,.75,1]){
      const x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      if(!this.fenceAllowed(x,z,road,margin))return false;
    }
    return true;
  }
}
