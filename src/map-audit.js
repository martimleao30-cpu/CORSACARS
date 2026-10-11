// Deterministic map inspection: no rendering, no object creation and no
// scene mutation. Runs once at boot, not during the driving loop.
const length2=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const unique=items=>new Set(items);
const center=p=>p?.center||p;
export function auditMap({network,terrainY,river=null,railway=null,
  forest=null,signage=null}){
  const issues=[],metrics={roads:0,roadSegments:0,junctions:0,
    clippedJunctions:0,physicsDecks:0,bridgeCrossings:0,
    forestSamples:0,signMeshes:0,railSamples:0};
  const add=(kind,roadId,location,detail)=>issues.push({
    kind,roadId,x:location?.x??0,z:location?.z??0,detail
  });
  const roads=network?.roads||[];
  const junctions=network?.junctions||[];
  metrics.roads=roads.length;metrics.junctions=junctions.length;
  for(const road of roads){
    if(!road.points?.length)continue;
    const profile=road.profile;
    if(profile?.pavedWidth&&Math.abs(profile.pavedWidth-road.width)>.1)
      add('width',road.id,center(road.points[0]),
        'Largura diferente do perfil rodoviário');
    for(let i=1;i<road.points.length;i++){
      const a=center(road.points[i-1]),b=center(road.points[i]);
      metrics.roadSegments++;
      const gap=length2(a,b);
      if(!Number.isFinite(gap)||gap<.00001||gap>20)
        add('road-segment',road.id,a,'Troço degenerado ou demasiado comprido');
      if(!Number.isFinite(a.y)||!Number.isFinite(b.y))
        add('road-height',road.id,a,'Altura inválida');
      const centerGrade=gap>0?Math.abs(b.y-a.y)/gap:0;
      if(centerGrade>.34)add('road-grade',road.id,a,
        'Inclinação local superior a 34%');
    }
    if(!road.mesh)continue;
    const geo=road.mesh.geometry;
    const position=geo?.getAttribute('position'),idx=geo?.index;
    if(!position||!idx||!idx.count){
      add('road-mesh',road.id,center(road.points[0]),
        'Falta a malha pavimentada');continue;
    }
    if(road.body?.shapes?.length){
      const collider=road.body.shapes[0];
      if(collider.type===5||collider.indices){
        metrics.physicsDecks++;
        if(collider.indices?.length!==idx.count)
          add('collision-mismatch',road.id,center(road.points[0]),
            'A malha de colisão não coincide com o número de faces visíveis');
      }
    }else if(road.id!=='circular')add('road-collider',road.id,
      center(road.points[0]),'Falta colisão do asfalto');
    const cuts=road.junctionCuts||[];
    if(cuts.length){
      metrics.clippedJunctions+=cuts.length;
      if(!geo.userData.junctionClipped)
        add('junction-clip',road.id,center(road.points[0]),
          'Troço secundário não foi recortado no cruzamento');
    }
    // Sample only representative triangles, including the last segment,
    // avoiding costly full-mesh validation during startup.
    const step=Math.max(3,Math.floor(idx.count/500/3)*3);
    for(let k=0;k<idx.count;k+=step){
      const i0=idx.getX(k),i1=idx.getX(Math.min(k+1,idx.count-1));
      const i2=idx.getX(Math.min(k+2,idx.count-1));
      const ax=position.getX(i0),az=position.getZ(i0);
      const bx=position.getX(i1),bz=position.getZ(i1);
      const cx=position.getX(i2),cz=position.getZ(i2);
      const area=Math.abs((bx-ax)*(cz-az)-(bz-az)*(cx-ax))*.5;
      if(area<.00000001)
        add('degenerate-triangle',road.id,{x:ax,z:az},
          'Triângulo de asfalto degenerado');
      if(cuts.some(cut=>{
        const mx=(ax+bx+cx)/3,mz=(az+bz+cz)/3;
        const dx=mx-cut.x,dz=mz-cut.z;
        const u=dx*cut.ux+dz*cut.uz;
        const v=-dx*cut.uz+dz*cut.ux;
        return Math.abs(u)<cut.halfU-.12&&Math.abs(v)<cut.halfV-.12;
      }))add('junction-overlap',road.id,{x:ax,z:az},
        'Triângulo secundário continua dentro da interseção');
    }
  }
  for(const road of roads){
    if(!road.profileGeometry?.paved)continue;
    for(const shoulder of road.profileGeometry.paved){
      if(!shoulder?.geometry?.index?.count)continue;
      const id=road.id||road.name;
      const idx=shoulder.geometry.index.count;
      if(idx<12)add('shoulder',id,center(road.points[0]),
        'Berma asfaltada incompleta');
    }
  }
  if(river){
    const crossings=river.crossings||[];
    metrics.bridgeCrossings=crossings.length;
    const piers=river.group?.children?.filter(mesh=>
      mesh.name==='Ponte · apoio no leito rochoso')||[];
    if(piers.length!==crossings.length*4)
      add('river-piers','river',null,'Faltam apoios em pontes do rio');
    for(const pier of piers){
      const local=river.lookup?.(pier.position.x,pier.position.z);
      const original=terrainY(pier.position.x,pier.position.z);
      const bed=river.channelHeight(original,local);
      const footer=pier.position.y-pier.scale.y*.5;
      if(footer>bed+.10)
        add('floating-bridge','river',pier.position,
          'Pilar termina acima do leito do rio');
    }
  }
  if(railway?.line?.points){
    const points=railway.line.points;
    for(let i=0;i<points.length;i+=Math.max(1,Math.floor(points.length/80))){
      const p=points[i];metrics.railSamples++;
      const ground=terrainY(p.x,p.z);
      if(p.y<ground-.4)
        add('buried-rail','railway',p,'Via férrea enterrada no terreno');
    }
  }
  if(forest?.chunks){
    const chunks=forest.chunks.values?.()||[];
    for(const chunk of chunks){
      const trees=chunk.items||[];
      for(let i=0;i<trees.length;i+=Math.max(1,Math.ceil(trees.length/10))){
        const t=trees[i];metrics.forestSamples++;
        const nearby=network?.query?.(t.x,t.z);
        if(nearby&&nearby.distance<2.5)
          add('tree-on-road','forest',t,'Árvore no corredor rodoviário');
      }
    }
  }
  if(signage?.meshes)metrics.signMeshes=signage.meshes.length;
  // De-duplicate noisy reports at the same 20m site while retaining type.
  const emitted=unique([]);
  const compact=issues.filter(issue=>{
    const key=issue.kind+':'+issue.roadId+':'+
      Math.floor(issue.x/20)+':'+Math.floor(issue.z/20);
    if(emitted.has(key))return false;
    emitted.add(key);return true;
  });
  return {ok:compact.length===0,issues:compact,metrics,
    counts:compact.reduce((acc,{kind})=>
      (acc[kind]=(acc[kind]||0)+1,acc),{})};
}
