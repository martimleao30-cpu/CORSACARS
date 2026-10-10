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
    this.regions=regions;
    this.cells=new Map();
    this.segments=[];
    this.openings=[];
    this.junctions=[];
    this.serviceZones=[];
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
      if(region.kind==='service'){
        this.serviceZones.push({
          anchor:region.roadPoint,
          tangent:region.tangent.clone().setY(0).normalize(),
          outward:region.side.clone().setY(0).normalize()
        });
      }
    }
    this.busBays=this.planBusBays();
  }
  // Reserve a pull-out beside a REAL town or hamlet. Nothing is placed at an
  // arbitrary percentage of the map: the nearest drivable route, nearby
  // settlement, crossings, driveways and the required 48m length all matter.
  planBusBays(){
    const selected=[];
    for(const region of this.regions){
      if(region.kind!=='town'&&region.kind!=='hamlet')continue;
      const road=this.network.roads.find(r=>r.id===region.road);
      if(!road||!['urban','rural','mountain'].includes(road.category))continue;
      let nearest=0,best=Infinity;
      for(let i=0;i<road.points.length;i++){
        const p=road.points[i].center||road.points[i];
        const d=(p.x-region.roadPoint.x)**2+(p.z-region.roadPoint.z)**2;
        if(d<best){best=d;nearest=i;}
      }
      const sides=region.kind==='town'?[region.sideSign,-region.sideSign]:
        [region.sideSign];
      for(const side of sides){
        const stepOrder=[13,16,19,22,25,28,31,35,39,44,49];
        let found=null;
        for(const lead of [side===region.sideSign?-1:1,side===region.sideSign?1:-1]){
          for(const steps of stepOrder){
            const index=nearest+lead*steps;
            if(index<10||index>road.points.length-11)continue;
            const tangent=this.roadTangent(road,index);
            const center=road.points[index].center||road.points[index];
            const outward={x:-tangent.z*side,z:tangent.x*side};
            const offset=road.width*.5+9.7;
            const x=center.x+outward.x*offset,z=center.z+outward.z*offset;
            const poiDistance=Math.hypot(x-region.roadPoint.x,z-region.roadPoint.z);
            if(poiDistance<34||poiDistance>135)continue;
            const collision=selected.some(other=>Math.hypot(x-other.x,z-other.z)<58);
            if(collision)continue;
            let clear=true;
            // Sample the full entrance, parking, exit and passenger pavement.
            for(const delta of [-24,-16,-8,0,8,16,24]){
              const sample=this.alongRoad(road,index,delta);
              const px=sample.x+outward.x*(road.width*.5+4);
              const pz=sample.z+outward.z*(road.width*.5+4);
              if(this.nearJunction(px,pz,2)||
                 this.nearAccess(px,pz,2)||
                 this.insideService(px,pz,3)||
                 this.roadProximity(px,pz,road).edge<4.1){
                clear=false;break;
              }
            }
            if(!clear||this.nearJunction(x,z,4)||
               this.nearAccess(x,z,4)||this.insideService(x,z,4)||
               this.roadProximity(x,z,road).edge<5)continue;
            found={roadId:road.id,regionId:region.id,road,side,index,
              x,z,y:0,tangent,outward,poiDistance,offset};
            break;
          }
          if(found)break;
        }
        if(found)selected.push(found);
      }
    }
    return selected;
  }
  roadTangent(road,index){
    const points=road.points;
    const a=points[Math.max(0,index-1)].center||points[Math.max(0,index-1)];
    const b=points[Math.min(points.length-1,index+1)].center||
      points[Math.min(points.length-1,index+1)];
    const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
    return {x:dx/len,z:dz/len};
  }
  alongRoad(road,index,distance){
    const points=road.points;
    let remaining=Math.abs(distance),i=index,sgn=Math.sign(distance)||1;
    while(remaining>0&&i+sgn>=0&&i+sgn<points.length){
      const a=points[i].center||points[i],b=points[i+sgn].center||points[i+sgn];
      const length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length>=remaining){
        const t=length?remaining/length:0;
        return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
      }
      remaining-=length;i+=sgn;
    }
    const p=points[i].center||points[i];
    return {x:p.x,z:p.z};
  }
  insideBusBay(x,z,margin=0){
    return this.busBays?.some(bay=>{
      const dx=x-bay.x,dz=z-bay.z;
      const along=dx*bay.tangent.x+dz*bay.tangent.z;
      const across=dx*bay.outward.x+dz*bay.outward.z;
      // The paved apron extends towards the road, whilst the shelter stays
      // farther out. Keep the rail/fence support corridor clear.
      return Math.abs(along)<25+margin&&across>-11-margin&&across<3+margin;
    })||false;
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
  insideService(x,z,margin=0){
    return this.serviceZones.some(s=>{
      const dx=x-s.anchor.x,dz=z-s.anchor.z;
      const v=dx*s.outward.x+dz*s.outward.z;
      const along=dx*s.tangent.x+dz*s.tangent.z;
      return v>=15-margin&&v<=86+margin&&
        Math.abs(along)<=55+margin;
    });
  }
  plantAllowed(x,z,kind='grass',radius=0){
    const margin={grass:2.8,flower:3.8,shrub:5.5,tree:9.5,
      roadsideShrub:3.5,rock:1.5}[kind]??4;
    if(this.insideService(x,z,radius+1)){
      this.placed.rejectedPlants++;return false;
    }
    if(this.insideBusBay(x,z,radius+.3)){
      this.placed.rejectedPlants++;return false;
    }
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
    const blocked=this.insideBusBay(x,z,margin)||
      this.insideService(x,z,margin+1)||
      (other.road&&other.edge<4.8+margin)||
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
