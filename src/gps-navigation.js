import * as THREE from 'three';

// Live GPS with a transparent, heading-up road map. A fixed transparent
// reference illustration is only shown until navigation is started; routes,
// intersections and the player's position are drawn from actual game data.
const vector=p=>p.center||p;
const roadXY=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const RAD=180/Math.PI;
export function buildNavigationGraph(network){
  const nodes=[],roadNodeIds=new Map(),edges=[];
  function edge(a,b,weight){
    if(a===b)return;
    edges[a].push({id:b,w:weight});
    edges[b].push({id:a,w:weight});
  }
  for(const road of network.roads){
    const ids=[];
    for(const sample of road.points){
      const point=vector(sample);
      const id=nodes.length;nodes.push({id,point,road});
      edges.push([]);
      if(ids.length){
        const last=ids[ids.length-1];
        edge(last,id,Math.max(.1,roadXY(nodes[last].point,point)));
      }
      ids.push(id);
    }
    roadNodeIds.set(road.id,ids);
  }
  function closest(road,x,z){
    const ids=roadNodeIds.get(road.id)||[];
    let found=-1,best=Infinity;
    for(const id of ids){
      const p=nodes[id].point,d=(p.x-x)**2+(p.z-z)**2;
      if(d<best){best=d;found=id;}
    }
    return found;
  }
  // At-grade intersections connect otherwise independent road polylines.
  for(const j of network.junctions||[]){
    const a=closest(j.primary,j.x,j.z),b=closest(j.secondary,j.x,j.z);
    if(a>=0&&b>=0){
      const length=roadXY(nodes[a].point,nodes[b].point);
      if(length<Math.max(j.primary.width,j.secondary.width)+8)
        edge(a,b,Math.max(1,length));
    }
  }
  // Road ends that share a ring/interchange point are also navigable.
  const roads=network.roads;
  for(const road of roads){
    const ids=roadNodeIds.get(road.id);
    if(road.id==='circular')continue;
    for(const end of [ids[0],ids[ids.length-1]]){
      const p=nodes[end].point;
      let best=-1,distance=Infinity;
      for(const other of roads){
        if(other===road)continue;
        const candidate=closest(other,p.x,p.z);
        if(candidate<0)continue;
        const gap=roadXY(nodes[candidate].point,p);
        if(gap<distance){best=candidate;distance=gap;}
      }
      if(best>=0&&distance<Math.max(12,road.width*1.3))edge(end,best,Math.max(1,distance));
    }
  }
  const cellSize=96,spatialCells=new Map();
  for(const node of nodes){
    const key=Math.floor(node.point.x/cellSize)+','+Math.floor(node.point.z/cellSize);
    if(!spatialCells.has(key))spatialCells.set(key,[]);
    spatialCells.get(key).push(node);
  }
  return {nodes,roadNodeIds,edges,closest,spatialCells,cellSize};
}
export function shortestRoute(graph,start,goal){
  if(start<0||goal<0)return null;
  const n=graph.nodes.length,dist=new Float64Array(n).fill(Infinity),
    prev=new Int32Array(n).fill(-1),done=new Uint8Array(n);
  const heap=[];
  function push(id,d){
    let i=heap.length;heap.push({id,d});
    while(i>0){
      const parent=(i-1)>>1;
      if(heap[parent].d<=d)break;
      heap[i]=heap[parent];i=parent;
    }
    heap[i]={id,d};
  }
  function pop(){
    const root=heap[0],last=heap.pop();
    if(heap.length){
      let i=0;
      while(true){
        const left=2*i+1,right=left+1;
        if(left>=heap.length)break;
        const child=right<heap.length&&heap[right].d<heap[left].d?right:left;
        if(heap[child].d>=last.d)break;
        heap[i]=heap[child];i=child;
      }
      heap[i]=last;
    }
    return root;
  }
  dist[start]=0;push(start,0);
  while(heap.length){
    const {id,d}=pop();
    if(done[id]||d>dist[id])continue;
    done[id]=1;if(id===goal)break;
    for(const e of graph.edges[id]){
      const next=d+e.w;
      if(next<dist[e.id]){dist[e.id]=next;prev[e.id]=id;push(e.id,next);}
    }
  }
  if(!Number.isFinite(dist[goal]))return null;
  const path=[];
  for(let id=goal;id!==-1;id=prev[id]){
    path.push(graph.nodes[id].point);
    if(id===start)break;
  }
  path.reverse();
  return {points:path,length:dist[goal]};
}

// World north is -Z. Keep the circular minimap north-up: screen right
// always means world +X, so a clockwise/right turn can never be mirrored by
// the scrolling road map. The car arrow rotates, not the entire geography.
export function gpsBearing(quaternion){
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(quaternion).setY(0);
  if(forward.lengthSq()<.0001)return 0;
  forward.normalize();
  return Math.atan2(forward.x,-forward.z);
}
export function gpsProjection(position,canvasWidth,canvasHeight,scale=.70){
  const x0=canvasWidth*.5,y0=canvasHeight*.5;
  return p=>({x:x0+(p.x-position.x)*scale,
    y:y0+(p.z-position.z)*scale});
}

export class NavigationHUD{
  constructor(canvas,network,regions=[],status=null){
    this.canvas=canvas;this.ctx=canvas?.getContext('2d');
    this.network=network;this.regions=regions;
    this.status=status;
    this.graph=buildNavigationGraph(network);
    this.destinationId=null;
    this.targetNode=-1;this.currentNode=-1;
    this.route=null;this.lastUpdate=0;
    this.currentRoad=null;
    this.destination=null;
    this.lastDraw=0;
  }
  setDestination(id){
    const region=this.regions.find(r=>r.id===id);
    this.destination=region||null;
    this.destinationId=region?.id||null;
    this.targetNode=region?this.closestNode(region.roadPoint||region.point):-1;
    this.currentNode=-1;this.route=null;
    if(this.status){
      this.status.textContent=region?'RUMO A '+region.name.toUpperCase():'EXPLORAÇÃO LIVRE';
      this.status.hidden=!region;
    }
    return Boolean(region);
  }
  closestNode(position){
    const {nodes,spatialCells,cellSize}=this.graph;
    const cx=Math.floor(position.x/cellSize),cz=Math.floor(position.z/cellSize);
    let best=-1,distance=Infinity;
    const scan=candidates=>{
      for(const node of candidates){
        const dx=node.point.x-position.x,dz=node.point.z-position.z;
        const d=dx*dx+dz*dz;
        if(d<distance){distance=d;best=node.id;}
      }
    };
    for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)
      scan(spatialCells.get(x+','+z)||[]);
    // Guaranteed exact when the closest candidate lies inside one cell:
    // any still-closer candidate must occupy one of these nine cells.
    if(distance>cellSize*cellSize)scan(nodes);
    return best;
  }
  update(position,quaternion,elapsed=0){
    if(!this.ctx||!position||!quaternion)return;
    const next=elapsed||performance.now();
    if(next-this.lastDraw<90)return;
    this.lastDraw=next;
    const start=this.closestNode(position);
    if(this.targetNode>=0&&(start!==this.currentNode||!this.route)){
      this.currentNode=start;
      this.route=shortestRoute(this.graph,start,this.targetNode);
    }
    this.draw(position,quaternion);
  }
  draw(position,quaternion){
    const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height;
    ctx.clearRect(0,0,w,h);
    const x0=w*.5,y0=h*.5;
    const project=gpsProjection(position,w,h,.75);
    // A round, north-up minimap. Road coordinates retain their real
    // orientation; the vehicle itself shows every left/right turn.
    ctx.save();
    ctx.beginPath();ctx.arc(x0,y0,Math.min(w,h)*.5-8,0,Math.PI*2);ctx.clip();
    ctx.fillStyle='rgba(9,22,30,.84)';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(133,168,178,.16)';ctx.lineWidth=1;
    for(let r=45;r<=95;r+=50){
      ctx.beginPath();ctx.arc(x0,y0,r,0,Math.PI*2);ctx.stroke();
    }
    ctx.lineCap='round';ctx.lineJoin='round';
    const drawLine=(points,width,color,glow=0)=>{
      if(points.length<2)return;
      ctx.beginPath();
      points.forEach((p,i)=>{
        const v=project(p);
        if(i===0)ctx.moveTo(v.x,v.y);else ctx.lineTo(v.x,v.y);
      });
      ctx.lineWidth=width;ctx.strokeStyle=color;
      ctx.shadowColor=color;ctx.shadowBlur=glow;ctx.stroke();ctx.shadowBlur=0;
    };
    for(const road of this.network.roads){
      const samples=road.points.map(vector);
      // Fast range reject by closest point (very remote roads not visible).
      if(!samples.some((p,i)=>i%Math.max(1,Math.floor(samples.length/20))===0&&
        roadXY(p,position)<270))continue;
      drawLine(samples,Math.max(2.3,road.width*.27),'rgba(238,248,249,.32)');
      drawLine(samples,.75,'rgba(255,255,255,.49)');
    }
    if(this.route?.points.length>1){
      const points=[position,...this.route.points];
      drawLine(points,10,'rgba(11,210,251,.22)',15);
      drawLine(points,5.3,'#28e8ff',8);
      drawLine(points,1.8,'rgba(239,255,255,.91)',3);
      const goal=project(this.destination.point);
      if(goal.x>0&&goal.x<w&&goal.y>0&&goal.y<h){
        ctx.beginPath();ctx.arc(goal.x,goal.y,6,0,2*Math.PI);
        ctx.fillStyle='#31eeff';ctx.fill();
        ctx.lineWidth=2;ctx.strokeStyle='#0a2439';ctx.stroke();
      }
    }else{
      // Free drive: show only a short preview of the current centreline.
      const road=this.graph.nodes[this.closestNode(position)]?.road;
      if(road){
        const ids=this.graph.roadNodeIds.get(road.id)||[];
        let index=0,best=Infinity;
        for(let i=0;i<ids.length;i++){
          const d=roadXY(position,this.graph.nodes[ids[i]].point);
          if(d<best){best=d;index=i;}
        }
        const path=road.points.slice(Math.max(0,index-2),Math.min(road.points.length,index+16))
          .map(vector);
        drawLine(path,5,'rgba(37,231,254,.64)',9);
      }
    }
    // Distinctive white/navy vehicle chevron from the supplied GPS design.
    ctx.save();ctx.translate(x0,y0);
    ctx.rotate(gpsBearing(quaternion));
    ctx.shadowColor='rgba(4,20,40,.9)';ctx.shadowBlur=9;
    ctx.beginPath();
    ctx.moveTo(0,-14);ctx.lineTo(9,10);ctx.lineTo(0,6);ctx.lineTo(-9,10);
    ctx.closePath();ctx.fillStyle='#f9fcff';ctx.strokeStyle='#1a2342';
    ctx.lineWidth=3.5;ctx.fill();ctx.stroke();ctx.restore();
    ctx.restore();
    // Geographical north is fixed at the top of the display.
    ctx.font='bold 12px system-ui,sans-serif';
    ctx.textAlign='center';ctx.fillStyle='#d7edef';
    ctx.shadowColor='rgba(7,20,28,.9)';ctx.shadowBlur=4;
    ctx.fillText('N',x0,19);
    ctx.shadowBlur=0;
    if(this.status&&this.destination){
      const remain=Math.round((this.route?.length||0)+
        roadXY(position,this.route?.points[0]||position));
      this.status.textContent=remain<22?'CHEGASTE · '+this.destination.name.toUpperCase():
        this.destination.name.toUpperCase()+' · '+(remain>=1000?(remain/1000).toFixed(1)+' KM':remain+' M');
    }
  }
}
