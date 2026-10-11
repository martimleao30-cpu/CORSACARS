// Engineered road vertical alignments. The original mesh sampled unmodified
// ground height at each wheel-side vertex, making absurd sideways cambers on
// hillsides and sharp longitudinal grades. All visual and collision consumers
// must use the same graded profile and its indexed cross-section sampler.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const ease=x=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
export const ROAD_MAX_GRADE=Object.freeze({
  highway:.065,'highway-ramp':.085,urban:.085,ring:.075,
  mountain:.105,rural:.095,dirt:.13,test:.075
});
export const ROAD_MAX_CROSS_SLOPE=.025;
export const gradeLimit=road=>ROAD_MAX_GRADE[road.category]??.09;
const center=p=>p.center||p;
const arcLength=points=>{
  const distances=[0];
  for(let i=1;i<points.length;i++){
    const a=center(points[i-1]),b=center(points[i]);
    distances.push(distances[i-1]+Math.hypot(a.x-b.x,a.z-b.z));
  }
  return distances;
};

// Fix endpoint elevations to join the existing circular ring and parent
// ramps; smooth the interior, then project it onto a feasible ±grade envelope.
// Repeating both passes prevents alternating uphill kinks at hairpins.
export function engineerRoadGrade(points,terrainY,{
  maxGrade=.095,smoothingMetres=35,closed=false,
  startY=null,endY=null
}={}){
  if(points.length<2)return points;
  const chain=arcLength(points),natural=points.map(p=>{
    const v=center(p);return Number.isFinite(v.y)?v.y:terrainY(v.x,v.z)+.21;
  });
  const baseline=natural.map((h,i)=>{
    let sum=h*1.65,weight=1.65;
    for(let j=i-1;j>=0&&chain[i]-chain[j]<smoothingMetres;j--){
      const w=1-(chain[i]-chain[j])/smoothingMetres;
      sum+=natural[j]*w;weight+=w;
    }
    for(let j=i+1;j<natural.length&&chain[j]-chain[i]<smoothingMetres;j++){
      const w=1-(chain[j]-chain[i])/smoothingMetres;
      sum+=natural[j]*w;weight+=w;
    }
    return sum/weight;
  });
  const first=startY??natural[0],last=closed?first:endY??natural.at(-1);
  const minGrade=Math.abs(last-first)/Math.max(1e-6,chain.at(-1));
  // Hard endpoints may themselves require a steeper connector. Accommodate
  // the geometric minimum instead of creating a discontinuity at a junction.
  const limit=Math.max(maxGrade,minGrade+1e-5);
  const grades=baseline.slice();grades[0]=first;grades[grades.length-1]=last;
  for(let iteration=0;iteration<10;iteration++){
    grades[0]=first;
    for(let i=1;i<grades.length;i++){
      const max=limit*Math.max(1e-6,chain[i]-chain[i-1]);
      grades[i]=clamp(grades[i],grades[i-1]-max,grades[i-1]+max);
    }
    grades[grades.length-1]=last;
    for(let i=grades.length-2;i>=0;i--){
      const max=limit*Math.max(1e-6,chain[i+1]-chain[i]);
      grades[i]=clamp(grades[i],grades[i+1]-max,grades[i+1]+max);
    }
    // Smooth jagged rate changes without moving either anchored end.
    if(iteration<9){
      const copy=grades.slice();
      for(let i=1;i<grades.length-1;i++){
        const d0=chain[i]-chain[i-1],d1=chain[i+1]-chain[i];
        const linear=(copy[i-1]*d1+copy[i+1]*d0)/Math.max(1e-6,d0+d1);
        grades[i]=copy[i]*.8+linear*.2;
      }
    }
  }
  grades[0]=first;grades[grades.length-1]=last;
  for(let i=0;i<points.length;i++)center(points[i]).y=grades[i];
  return {points,chain,maxGrade:limit,totalLength:chain.at(-1),
    longestCut:Math.max(...natural.map((v,i)=>Math.abs(v-grades[i])))};
}

// Returns "ground" height directly below a *road deck*: no hillside
// crossfall inside the carriageway, consistent shoulders outside it.
// A local grid avoids scanning kilometres of road for each paved vertex.
export function roadGradeTerrain(points,terrainY,width,{
  shoulder=8,blend=18,cellSize=32
}={}){
  const rows=points.map(center),cells=new Map(),size=cellSize;
  const r=width*.5+shoulder+blend;
  for(let i=0;i<rows.length-1;i++){
    const a=rows[i],b=rows[i+1];
    for(let cx=Math.floor((Math.min(a.x,b.x)-r)/size);
      cx<=Math.floor((Math.max(a.x,b.x)+r)/size);cx++)
      for(let cz=Math.floor((Math.min(a.z,b.z)-r)/size);
        cz<=Math.floor((Math.max(a.z,b.z)+r)/size);cz++){
        const key=cx+','+cz;
        if(!cells.has(key))cells.set(key,[]);
        cells.get(key).push(i);
      }
  }
  const f=(x,z)=>{
    const original=terrainY(x,z);
    const candidates=cells.get(Math.floor(x/size)+','+Math.floor(z/size))||[];
    let dist2=Infinity,grade=null;
    for(const i of candidates){
      const a=rows[i],b=rows[i+1],dx=b.x-a.x,dz=b.z-a.z;
      const span=dx*dx+dz*dz;
      const t=span?clamp(((x-a.x)*dx+(z-a.z)*dz)/span,0,1):0;
      const ox=x-a.x-t*dx,oz=z-a.z-t*dz;
      const d=ox*ox+oz*oz;
      if(d<dist2){dist2=d;grade=a.y+(b.y-a.y)*t-.21;}
    }
    if(grade===null)return original;
    const distance=Math.sqrt(dist2),edge=width*.5+shoulder;
    if(distance<=edge)return grade;
    if(distance>=edge+blend)return original;
    return grade+(original-grade)*ease((distance-edge)/blend);
  };
  f.isEngineeredRoadGrade=true;
  f.width=width;
  return f;
}

export function roadGradeStatistics(points){
  let max=0,bad=0,distance=0;
  for(let i=1;i<points.length;i++){
    const a=center(points[i-1]),b=center(points[i]);
    const d=Math.hypot(b.x-a.x,b.z-a.z);
    if(!d)continue;
    distance+=d;
    const grade=Math.abs(b.y-a.y)/d;
    max=Math.max(max,grade);if(!Number.isFinite(grade))bad++;
  }
  return {maxGrade:max,roadLength:distance,invalidSegments:bad};
}
