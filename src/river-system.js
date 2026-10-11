import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// High mountain headwaters descend through the east valley into the central
// lowlands. The previous reversed route ended *uphill* in the mountains,
// burying water under terrain and leaving disconnected-looking banks.
// Keep the established crossing near (535,430) for the road network.
export const RIVER_WAYPOINTS=Object.freeze([
  [1260,-1120],[1170,-1025],[1060,-910],[870,-695],
  [745,-435],[675,-185],[545,40],[490,245],[535,430],
  [430,505],[330,485],[250,380],[165,280],[65,175]
]);
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const smooth=x=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
const cross=(a,b)=>a.x*b.z-a.z*b.x;
const nearest=(x,z,a,b)=>{
  const dx=b.x-a.x,dz=b.z-a.z,m=dx*dx+dz*dz;
  const u=m?clamp(((x-a.x)*dx+(z-a.z)*dz)/m,0,1):0;
  const px=a.x+u*dx,pz=a.z+u*dz;
  return {u,distance:Math.hypot(px-x,pz-z),x:px,z:pz};
};
const crossing=(a,b,c,d)=>{
  const r={x:b.x-a.x,z:b.z-a.z},s={x:d.x-c.x,z:d.z-c.z};
  const denom=cross(r,s);
  if(Math.abs(denom)<.00001)return null;
  const q={x:c.x-a.x,z:c.z-a.z};
  const t=cross(q,s)/denom,u=cross(q,r)/denom;
  if(t<0||t>1||u<0||u>1)return null;
  const angle=Math.abs(denom)/(Math.hypot(r.x,r.z)*Math.hypot(s.x,s.z));
  if(angle<.22)return null; // No bridge for river-parallel roads.
  return {x:a.x+t*r.x,z:a.z+t*r.z,angle};
};
const seedRandom=seed=>()=>{
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return seed/4294967296;
};

export class RiverSystem {
  constructor(scene,physics,network,terrainY,quality='high'){
    this.scene=scene;this.physics=physics;this.network=network;
    this.terrainY=terrainY;this.quality=quality;
    this.group=new THREE.Group();this.group.name='Rio da Ribeira Leste · água corrente';
    scene.add(this.group);
    this.bodies=[];this.geometries=[];this.materials=[];
    this.time=0;
    const route=new THREE.CatmullRomCurve3(
      RIVER_WAYPOINTS.map(([x,z])=>new THREE.Vector3(x,0,z)),
      false,'centripetal',.45);
    const sampleCount=quality==='ultra'?1100:quality==='low'?420:780;
    // Parameterisation by *physical distance* is independent of polygon LOD.
    const horizontal=route.getSpacedPoints(sampleCount);
    const chain=[0];
    for(let i=1;i<horizontal.length;i++)
      chain[i]=chain[i-1]+Math.hypot(horizontal[i].x-horizontal[i-1].x,
        horizontal[i].z-horizontal[i-1].z);
    const heights=horizontal.map(p=>terrainY(p.x,p.z)-1.3);
    // Smooth by metres, not by number of vertices. This stops low/ultra mode
    // from shifting the banks and stops the water surface following each bump.
    const softened=heights.map((_,i)=>{
      let weighted=0,total=0;
      for(let j=i;j>=0&&chain[i]-chain[j]<40;j--){
        const w=1-(chain[i]-chain[j])/40;
        weighted+=heights[j]*w;total+=w;
      }
      for(let j=i+1;j<heights.length&&chain[j]-chain[i]<40;j++){
        const w=1-(chain[j]-chain[i])/40;
        weighted+=heights[j]*w;total+=w;
      }
      return weighted/total;
    });
    // Water must travel downhill; do not generate lakes on uphill sections.
    // A fixed fall is integrated into the grade instead of tacked on to a
    // height field after the waterfall (which previously made visible seams).
    const fallStart=Math.round(sampleCount*.30);
    const fallEnd=fallStart+Math.max(5,Math.round(sampleCount*.005));
    this.waterfall={start:fallStart,end:fallEnd,drop:3.7};
    const profile=new Float64Array(horizontal.length);
    profile[0]=Math.min(softened[0],heights[0]-.2);
    for(let i=1;i<profile.length;i++){
      const length=Math.max(.001,chain[i]-chain[i-1]);
      const previous=profile[i-1];
      if(i>fallStart&&i<=fallEnd){
        // Only the waterfall is allowed a sharp drop.
        const t=(i-fallStart)/(fallEnd-fallStart);
        const oldT=(i-fallStart-1)/(fallEnd-fallStart);
        profile[i]=previous-this.waterfall.drop*
          (smooth(t)-smooth(oldT));
      }else{
        profile[i]=Math.min(softened[i],heights[i]-.2,
          previous-length*.0007);
      }
    }
    this.points=horizontal.map((p,i)=>{
      const before=horizontal[Math.max(0,i-1)];
      const after=horizontal[Math.min(sampleCount,i+1)];
      const dx=after.x-before.x,dz=after.z-before.z;
      const len=Math.hypot(dx,dz)||1;
      const width=8.6+2.05*Math.sin(chain[i]*.009)+.82*Math.sin(chain[i]*.021);
      return {x:p.x,z:p.z,y:profile[i],along:chain[i],
        width:Math.max(6.5,width),nx:-dz/len,nz:dx/len};
    });
    // The shoreline and trench now use the same decreasing water level.
    this.bucketSize=42;this.buckets=new Map();
    for(let i=0;i<this.points.length-1;i++){
      const a=this.points[i],b=this.points[i+1],margin=49;
      for(let gx=Math.floor((Math.min(a.x,b.x)-margin)/this.bucketSize);
        gx<=Math.floor((Math.max(a.x,b.x)+margin)/this.bucketSize);gx++)
        for(let gz=Math.floor((Math.min(a.z,b.z)-margin)/this.bucketSize);
          gz<=Math.floor((Math.max(a.z,b.z)+margin)/this.bucketSize);gz++){
          const key=gx+','+gz;
          if(!this.buckets.has(key))this.buckets.set(key,[]);
          this.buckets.get(key).push(i);
        }
    }
    this.crossings=this.findCrossings();
    this.buildWater();
    this.buildWaterfall();
    this.buildBanks();
    this.buildRocks();
    this.buildBankVegetation();
    this.buildBridges();
    this.statistics={
      waterfallDropM:this.waterfall.drop,
      riverLengthM:Math.round(route.getLength()),
      bridgeCount:this.crossings.length,
      boulders:this.rocks,
      bankPlants:this.bankPlants,
      riverSections:this.points.length-1
    };
  }
  lookup(x,z){
    const ids=this.buckets.get(Math.floor(x/this.bucketSize)+','+
      Math.floor(z/this.bucketSize))||[];
    let result=null,best=Infinity;
    for(const i of ids){
      const a=this.points[i],b=this.points[i+1];
      const point=nearest(x,z,a,b);
      if(point.distance>=best)continue;
      best=point.distance;
      result={...point,width:a.width+(b.width-a.width)*point.u,
        waterY:a.y+(b.y-a.y)*point.u,index:i};
    }
    return result;
  }
  contains(x,z,margin=0){
    const p=this.lookup(x,z);
    return !!p&&p.distance<p.width+margin;
  }
  channelHeight(original,p){
    if(!p||p.distance>=p.width+28)return original;
    const bed=p.waterY-1.55;
    const inner=p.width*.68,shore=p.width+4;
    let desired;
    if(p.distance<=inner)desired=bed;
    else if(p.distance<=shore)
      desired=THREE.MathUtils.lerp(bed,p.waterY-.18,
        smooth((p.distance-inner)/(shore-inner)));
    else desired=THREE.MathUtils.lerp(p.waterY-.18,original,
      smooth((p.distance-shore)/24));
    // Erosion cannot create an artificial elevated platform.
    return Math.min(original,desired);
  }
  carveTerrain(geometry){
    const vertices=geometry.getAttribute('position');
    const cols=vertices.count;
    let affected=0;
    for(let i=0;i<cols;i++){
      const x=vertices.getX(i),z=vertices.getZ(i),p=this.lookup(x,z);
      if(!p)continue;
      // A submerged deep channel, gently graded banks and the original
      // terrain must form one continuous piece of geometry. The former
      // constant-depth trench was 8m wider than the water on BOTH sides.
      const current=vertices.getY(i);
      const next=this.channelHeight(current,p);
      if(Math.abs(next-current)<.0005)continue;
      vertices.setY(i,next);
      affected++;
    }
    if(affected){
      vertices.needsUpdate=true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
    }
    this.statistics.terrainVertices=affected;
    return affected;
  }
  findCrossings(){
    const hits=[];
    for(const road of this.network.roads){
      if(!road.points?.length||road.width<5)continue;
      for(let i=0;i<road.points.length-1;i++){
        const a=road.points[i],b=road.points[i+1];
        // A bridge crosses the whole road SEGMENT, not just its midpoint.
        // The old midpoint lookup could discard true crossings before the
        // line-intersection test, especially on long, diagonal or winding roads.
        // Visit the cells touched by the entire segment plus a riverbank
        // margin; a cheap AABB filter keeps the narrow phase fast.
        const segmentIds=new Set();
        const margin=11;
        const x0=Math.floor((Math.min(a.x,b.x)-margin)/this.bucketSize);
        const x1=Math.floor((Math.max(a.x,b.x)+margin)/this.bucketSize);
        const z0=Math.floor((Math.min(a.z,b.z)-margin)/this.bucketSize);
        const z1=Math.floor((Math.max(a.z,b.z)+margin)/this.bucketSize);
        for(let cx=x0;cx<=x1;cx++)for(let cz=z0;cz<=z1;cz++)
          for(const k of this.buckets.get(cx+','+cz)||[])
            segmentIds.add(k);
        for(const k of segmentIds){
          const riverA=this.points[k],riverB=this.points[k+1];
          if(Math.max(riverA.x,riverB.x)+.001<Math.min(a.x,b.x)||
            Math.min(riverA.x,riverB.x)-.001>Math.max(a.x,b.x)||
            Math.max(riverA.z,riverB.z)+.001<Math.min(a.z,b.z)||
            Math.min(riverA.z,riverB.z)-.001>Math.max(a.z,b.z))continue;
          const hit=crossing(a,b,riverA,riverB);
          if(!hit)continue;
          if(hits.some(h=>h.roadId===road.id&&
            Math.hypot(h.x-hit.x,h.z-hit.z)<55))continue;
          const d=Math.hypot(b.x-a.x,b.z-a.z)||1;
          // Use the real drivable road deck, not a fresh sample of the
          // original terrain (different at cut slopes and bridge spans).
          const f=clamp(Math.hypot(hit.x-a.x,hit.z-a.z)/d,0,1);
          const deckY=THREE.MathUtils.lerp(a.y,b.y,f);
          hits.push({...hit,roadId:road.id,road,deckY,
            direction:{x:(b.x-a.x)/d,z:(b.z-a.z)/d}});
        }
      }
    }
    return hits;
  }
  buildWater(){
    const pos=[],uv=[],indices=[],bank=[],speeds=[];
    for(let i=0;i<this.points.length;i++){
      const p=this.points[i];
      const ahead=this.points[Math.min(i+1,this.points.length-1)];
      const behind=this.points[Math.max(0,i-1)];
      const distance=Math.hypot(ahead.x-behind.x,ahead.z-behind.z)||1;
      const slope=Math.max(0,(behind.y-ahead.y)/distance);
      const flow=clamp(.76+slope*10,.72,2.3);
      for(let j=0;j<=8;j++){
        const v=j/8,side=(v*2-1)*p.width;
        pos.push(p.x+p.nx*side,p.y+.08,p.z+p.nz*side);
        // World-metre UVs prevent stretching/jitter as mesh density changes.
        uv.push(v,p.along/8);
        bank.push(Math.abs(v*2-1));
        speeds.push(flow);
      }
      if(i>=this.points.length-1)continue;
      // The falling sheet takes over this section: overlapping the ordinary
      // river ribbon here used to cause shimmering/z-fighting on the lip.
      if(i>=this.waterfall.start&&i<this.waterfall.end)continue;
      for(let j=0;j<8;j++){
        const a=i*9+j,b=a+9;
        indices.push(a,b,a+1,a+1,b,b+1);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setAttribute('bank',new THREE.Float32BufferAttribute(bank,1));
    geometry.setAttribute('flowSpeed',new THREE.Float32BufferAttribute(speeds,1));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    geometry.computeBoundingSphere();this.geometries.push(geometry);
    const material=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uRain:{value:0},
        uSun:{value:new THREE.Vector3(.45,.8,.22)}},
      vertexShader:`
        uniform float uTime;
        attribute float bank;
        attribute float flowSpeed;
        varying vec2 vUV;
        varying float vBank;
        varying float vSpeed;
        varying vec3 vWorld;
        void main(){
          vUV=uv;vBank=bank;vSpeed=flowSpeed;
          vec3 p=position;
          float wave=sin(uv.y*1.65-uTime*2.8*vSpeed+uv.x*16.0)*.042+
            sin(uv.y*2.7-uTime*4.1*vSpeed-uv.x*23.0)*.021;
          // Shore waves taper before meeting the real excavated riverbank.
          p.y+=wave*(1.0-smoothstep(.68,1.0,bank)*.82);
          vec4 world=modelMatrix*vec4(p,1.0);
          vWorld=world.xyz;
          gl_Position=projectionMatrix*viewMatrix*world;
        }`,
      fragmentShader:`
        uniform float uTime;
        uniform float uRain;
        uniform vec3 uSun;
        varying vec2 vUV;
        varying float vBank;
        varying float vSpeed;
        varying vec3 vWorld;
        void main(){
          // Two wind-independent moving current layers, rather than a flat
          // colour or scrolling photographic texture. Depth colour, ripples
          // and foam react to the actual width and speed of this section.
          vec2 current=vec2(vUV.x*6.0,vUV.y*.92);
          float phase=current.y*5.7-uTime*3.6*vSpeed;
          float broad=sin(phase+sin(current.x*2.4)*.65);
          float fine=sin(current.x*21.0+phase*1.9+
            sin(current.y*3.7+uTime*.8)*1.6);
          float capillary=sin(current.x*48.0-phase*3.2);
          float waves=broad*.13+fine*.052+capillary*.018;
          vec3 normal=normalize(vec3(
            -.17*cos(current.x*2.4+phase*.72)
            -.055*cos(current.x*21.0+phase*1.9),
            1.0,
            -.22*cos(phase)-.06*cos(current.x*48.0-phase*3.2)));
          vec3 viewDir=normalize(cameraPosition-vWorld);
          float fresnel=pow(1.0-clamp(dot(normal,viewDir),0.0,1.0),4.0);
          float bank=smoothstep(.55,1.0,vBank);
          float depth=1.0-bank;
          vec3 deep=vec3(.025,.135,.17);
          vec3 shallow=vec3(.14,.32,.31);
          vec3 water=mix(deep,shallow,.25+bank*.53+waves*.30);
          // Deep water stays darker; banks become shallow emerald-green.
          vec3 sky=vec3(.38,.56,.64)+vec3(.19,.18,.12)*max(0.0,uSun.y);
          water=mix(water,sky,.09+fresnel*.55);
          float sparkle=pow(max(0.0,dot(reflect(-normalize(uSun),normal),
            viewDir)),76.0);
          float sunGlints=sparkle*(.25+.75*depth)*
            (.56+.44*smoothstep(.35,.84,normal.y));
          water+=vec3(1.0,.96,.82)*sunGlints*.75;
          float flowFoam=smoothstep(.69,.98,abs(fine*.72+
            broad*.33+capillary*.16))*(.035+.09*uRain);
          flowFoam+=bank*(.12+.065*abs(broad));
          flowFoam+=smoothstep(1.1,2.3,vSpeed)*.12*
            smoothstep(.44,.9,abs(fine*.7+broad*.45));
          // Rivulets accelerate at the lip and swirl into bright whitewater.
          water=mix(water,vec3(.77,.89,.87),clamp(flowFoam,0.0,.48));
          float rainPits=sin(current.x*57.0+uTime*6.4)*
            sin(current.y*32.0-uTime*8.1);
          water+=vec3(.13,.16,.17)*rainPits*.065*uRain;
          // Gradual waterline replaces the unnaturally sharp painted edge.
          float edgeAlpha=1.0-smoothstep(.93,1.0,vBank)*.18;
          gl_FragColor=vec4(water,.945*edgeAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent:true,side:THREE.DoubleSide,depthWrite:false
    });
    this.materials.push(material);this.waterMaterial=material;
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name='Rio · corrente animada, reflexo Fresnel e ondulação';
    mesh.renderOrder=1;
    this.group.add(mesh);this.waterMesh=mesh;
  }
  buildWaterfall(){
    const {start,end,drop}=this.waterfall;
    const upper=this.points[start],lower=this.points[end];
    // Match the entire water ribbon at each end of the cascade: a 94%
    // curtain used to leave two conspicuous empty slits at the banks.
    const halfWidth=Math.min(upper.width,lower.width);
    const pos=[],uv=[],indices=[];
    const layers=30,across=22;
    // Flowing waterfall curtain between the upper lip and the lower pool.
    // It is geographical geometry, not a vertical billboard above the river.
    for(let j=0;j<=layers;j++){
      const t=j/layers;
      // Match the actual river centreline and smoothed drop at every row.
      // A straight upper-to-lower chord twists the falling sheet around bends.
      const segment=Math.min(end-1,Math.floor(start+t*(end-start)));
      const f=clamp(start+t*(end-start)-segment,0,1);
      const a=this.points[segment],b=this.points[segment+1];
      const x=THREE.MathUtils.lerp(a.x,b.x,f);
      const z=THREE.MathUtils.lerp(a.z,b.z,f);
      const lip=THREE.MathUtils.lerp(a.y,b.y,f);
      const nx=THREE.MathUtils.lerp(a.nx,b.nx,f);
      const nz=THREE.MathUtils.lerp(a.nz,b.nz,f);
      const magnitude=Math.hypot(nx,nz)||1;
      const sx=nx/magnitude,sz=nz/magnitude;
      for(let k=0;k<=across;k++){
        const u=k/across,lateral=(u*2-1)*halfWidth;
        const turbulence=(Math.sin(u*19+t*23)*.085*(1-t)+
          Math.sin(u*44-t*31)*.05)*Math.sin(Math.PI*t);
        pos.push(x+sx*lateral-sz*turbulence,
          lip+.08+Math.sin(t*Math.PI)*.12,
          z+sz*lateral+sx*turbulence);
        uv.push(u,t);
      }
      if(j===layers)continue;
      for(let k=0;k<across;k++){
        const a=j*(across+1)+k,b=a+across+1;
        indices.push(a,b,a+1,a+1,b,b+1);
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    geometry.computeBoundingSphere();this.geometries.push(geometry);
    const material=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uRain:{value:0}},
      vertexShader:`
      varying vec2 vUv;uniform float uTime;
      void main(){
        vUv=uv;
        vec3 p=position;
        p.y+=sin(uv.x*40.0+uTime*7.0-uv.y*34.0)*.035;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }`,
      fragmentShader:`
      varying vec2 vUv;uniform float uTime;uniform float uRain;
      void main(){
        float streak=sin(vUv.x*120.0+sin(vUv.y*24.0-uTime*5.0)*3.0);
        float foam=pow(abs(streak),3.0)*.19;
        float spray=smoothstep(.70,1.0,vUv.y)*.18;
        vec3 teal=vec3(.14,.39,.43);
        vec3 whitewater=vec3(.84,.94,.93);
        vec3 color=mix(teal,whitewater,.45+foam+spray+uRain*.08);
        gl_FragColor=vec4(color,.90);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      transparent:true,side:THREE.DoubleSide,depthWrite:false
    });
    this.materials.push(material);
    this.waterfallMaterial=material;
    this.waterfallMesh=new THREE.Mesh(geometry,material);
    this.waterfallMesh.name='Cascata da Ribeira Leste · queda de água dinâmica';
    this.waterfallMesh.renderOrder=2;
    this.group.add(this.waterfallMesh);
    // Low-cost animated turbulent foam at the base of the fall.
    // Confine the foam disc to the active channel (not the dry riverbanks).
    const poolGeo=new THREE.PlaneGeometry(halfWidth*1.76,7.2,22,4);
    poolGeo.rotateX(-Math.PI/2);this.geometries.push(poolGeo);
    const poolMat=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uRain:{value:0}},
      vertexShader:`
      varying vec2 vUv;
      void main(){vUv=uv;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`
      varying vec2 vUv;uniform float uTime;uniform float uRain;
      void main(){
        vec2 q=vUv*vec2(13.0,5.0);
        float ripples=sin(length(q-vec2(6.5,2.5))*4.4-uTime*3.5);
        float foam=smoothstep(.1,.9,ripples);
        float edge=smoothstep(0.0,.15,vUv.x)*(1.0-smoothstep(.85,1.0,vUv.x));
        edge*=smoothstep(0.0,.12,vUv.y)*(1.0-smoothstep(.82,1.0,vUv.y));
        gl_FragColor=vec4(vec3(.83,.92,.91),edge*(.36+.40*foam+uRain*.12));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      transparent:true,side:THREE.DoubleSide,depthWrite:false
    });
    this.materials.push(poolMat);this.waterfallFoamMaterial=poolMat;
    const pool=new THREE.Mesh(poolGeo,poolMat);
    pool.name='Cascata · espuma e remoinhos no poço';
    const tangent=new THREE.Vector3(lower.x-upper.x,0,lower.z-upper.z).normalize();
    pool.position.set(lower.x+tangent.x*3.4,lower.y+.135,
      lower.z+tangent.z*3.4);
    pool.rotation.y=Math.atan2(tangent.x,tangent.z);
    pool.renderOrder=3;this.group.add(pool);this.waterfallPool=pool;
    this.waterfallPosition=new THREE.Vector3(lower.x,lower.y,lower.z);
    const vistaX=lower.x+lower.nx*(lower.width+29);
    const vistaZ=lower.z+lower.nz*(lower.width+29);
    this.waterfallViewpoint=new THREE.Vector3(
      vistaX,this.terrainY(vistaX,vistaZ)+1,vistaZ);
    // The spray is animated entirely on GPU: no per-frame particles, mesh
    // creation, or physics bodies. Mist rises and disperses at the impact.
    const random=seedRandom(20261011);
    const particleCount=this.quality==='low'?85:
      this.quality==='medium'?145:this.quality==='ultra'?370:240;
    const mistPositions=[],phases=[],speeds=[];
    for(let i=0;i<particleCount;i++){
      const side=(random()*2-1)*halfWidth*.88;
      mistPositions.push(lower.x+lower.nx*side+(random()-.5)*2.6,
        lower.y+.22+random()*.65,
        lower.z+lower.nz*side+(random()-.5)*2.6);
      phases.push(random());
      speeds.push(.24+random()*.55);
    }
    const sprayGeo=new THREE.BufferGeometry();
    sprayGeo.setAttribute('position',
      new THREE.Float32BufferAttribute(mistPositions,3));
    sprayGeo.setAttribute('phase',new THREE.Float32BufferAttribute(phases,1));
    sprayGeo.setAttribute('speed',new THREE.Float32BufferAttribute(speeds,1));
    sprayGeo.computeBoundingSphere();this.geometries.push(sprayGeo);
    const sprayMat=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uRain:{value:0}},
      vertexShader:`
      uniform float uTime;attribute float phase;attribute float speed;
      varying float vOpacity;
      void main(){
        float rise=fract(phase+uTime*speed);
        vec3 p=position;
        p.y+=rise*3.1;
        p.x+=sin(uTime*.8+phase*13.0)*rise*1.4;
        p.z+=cos(uTime*.6+phase*9.0)*rise*1.2;
        vec4 view=modelViewMatrix*vec4(p,1.0);
        gl_Position=projectionMatrix*view;
        gl_PointSize=clamp(9.0*(95.0/max(1.0,-view.z)),1.0,26.0);
        vOpacity=sin(rise*3.14159)*.53;
      }`,
      fragmentShader:`
      varying float vOpacity;uniform float uRain;
      void main(){
        float r=length(gl_PointCoord-.5);
        float a=(1.0-smoothstep(.14,.5,r))*vOpacity*(.8+uRain*.2);
        if(a<.01)discard;
        gl_FragColor=vec4(.82,.92,.93,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      depthWrite:false,transparent:true,blending:THREE.NormalBlending
    });
    this.materials.push(sprayMat);this.waterfallSprayMaterial=sprayMat;
    this.waterfallSpray=new THREE.Points(sprayGeo,sprayMat);
    this.waterfallSpray.name='Cascata · névoa dinâmica da queda de água';
    this.waterfallSpray.renderOrder=4;
    this.group.add(this.waterfallSpray);
    const stoneGeo=new THREE.IcosahedronGeometry(1,2);
    const stoneMat=new THREE.MeshStandardMaterial({
      color:0x687068,roughness:.95,flatShading:false,metalness:0
    });
    this.geometries.push(stoneGeo);this.materials.push(stoneMat);
    const stones=new THREE.InstancedMesh(stoneGeo,stoneMat,36);
    const dummy=new THREE.Object3D();
    for(let i=0;i<36;i++){
      const side=i%2===0?1:-1;
      const t=random();
      const p=this.points[Math.round(THREE.MathUtils.lerp(start-4,end+5,t))];
      const scale=.8+random()*2.4;
      const bank=p.width+random()*3.5;
      const sx=p.x+p.nx*bank*side,sz=p.z+p.nz*bank*side;
      const land=this.channelHeight(this.terrainY(sx,sz),this.lookup(sx,sz));
      dummy.position.set(sx,land+scale*.12,sz);
      dummy.rotation.set(random()*.8,random()*6.28,random()*.8);
      dummy.scale.set(scale*(.8+random()*.5),scale*.82,scale*(.65+random()*.7));
      dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);
      stones.setColorAt(i,new THREE.Color(
        [0x7b817a,0x56635f,0x92968d][i%3]));
    }
    stones.instanceMatrix.needsUpdate=true;
    if(stones.instanceColor)stones.instanceColor.needsUpdate=true;
    stones.receiveShadow=true;stones.castShadow=this.quality==='ultra';
    stones.name='Cascata · rochedos nas duas margens';
    this.group.add(stones);this.waterfallRocks=stones;
  }
  buildBanks(){
    const positions=[],colors=[],indices=[];
    const bankMaterial=new THREE.MeshStandardMaterial({
      vertexColors:true,roughness:.97,metalness:0,side:THREE.DoubleSide
    });
    this.materials.push(bankMaterial);
    for(const side of [-1,1]){
      const offset=positions.length/3;
      for(const p of this.points){
        // Three bands: submerged waterline, moist gravel and grassy verge.
        // Sample the same channelHeight() used to deform/collide the terrain,
        // avoiding floating green stripes and hard rectangular bank edges.
        for(const [distance,color] of [
          [p.width+.9,0x68736a],[p.width+6,0x807e70],
          [p.width+23,0x67735d]
        ]){
          const x=p.x+p.nx*distance*side,z=p.z+p.nz*distance*side;
          const y=this.channelHeight(this.terrainY(x,z),
            this.lookup(x,z))+.026;
          positions.push(x,y,z);
          const c=new THREE.Color(color);
          colors.push(c.r,c.g,c.b);
        }
      }
      for(let i=0;i<this.points.length-1;i++){
        const a=offset+i*3,b=a+3;
        for(let j=0;j<2;j++)
          indices.push(a+j,b+j,a+j+1,a+j+1,b+j,b+j+1);
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geo.setIndex(indices);geo.computeVertexNormals();
    geo.computeBoundingSphere();this.geometries.push(geo);
    const mesh=new THREE.Mesh(geo,bankMaterial);
    mesh.name='Margens do rio · taludes naturais em ambas as encostas';
    mesh.receiveShadow=true;this.group.add(mesh);
    this.bankMesh=mesh;
  }

  buildRocks(){
    const random=seedRandom(96355);
    const density=this.quality==='low'?.10:this.quality==='ultra'?.40:.24;
    const count=Math.floor(this.points.length*density);
    const geo=new THREE.IcosahedronGeometry(1,1);
    const material=new THREE.MeshStandardMaterial({
      color:0xc1c2b6,roughness:.96,flatShading:true
    });
    this.geometries.push(geo);this.materials.push(material);
    const mesh=new THREE.InstancedMesh(geo,material,count);
    mesh.name='Rochas húmidas e pedras no leito do rio';
    const obj=new THREE.Object3D();let made=0;
    for(let i=0;i<count*3&&made<count;i++){
      const point=this.points[Math.floor(random()*this.points.length)];
      const side=(random()*2-1)*point.width*1.12;
      const size=.30+random()*2.1;
      const x=point.x+point.nx*side,z=point.z+point.nz*side;
      const base=this.channelHeight(this.terrainY(x,z),this.lookup(x,z));
      // Large boulders must physically sit on the eroded riverbed.
      // Previously their centres were placed at water level, visibly
      // floating over the freshly carved channel.
      obj.position.set(x,base+size*.25,z);
      obj.rotation.set(random()*2,random()*6.28,random()*2);
      obj.scale.set(size,size*.53,size*(.65+random()*.60));
      obj.updateMatrix();mesh.setMatrixAt(made,obj.matrix);
      // A small number of substantial boulders get static contact shapes;
      // pebbles remain visual-only to keep broadphase inexpensive.
      if(size>1.25&&made%9===0){
        const body=new CANNON.Body({mass:0,material:new CANNON.Material('river-rock')});
        body.addShape(new CANNON.Sphere(size*.43));
        body.position.copy(obj.position);
        this.physics.addBody(body);this.bodies.push(body);
      }
      mesh.setColorAt(made,new THREE.Color(
        [0x797e78,0xa7a99c,0x777d75,0xb2b2a5][Math.floor(random()*4)]));
      made++;
    }
    mesh.count=made;mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.castShadow=this.quality==='ultra';mesh.receiveShadow=true;
    this.group.add(mesh);this.rocks=made;
    // Foamy eddies downstream of larger rocks, visibly advecting with flow.
    const foamGeo=new THREE.PlaneGeometry(1,1,3,4);
    foamGeo.rotateX(-Math.PI/2);this.geometries.push(foamGeo);
    // Fragment mask prevents floating white foam rectangles. Subtle pulses
    // travel with the water while the instances remain GPU-batched.
    const foamMat=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uRain:{value:0}},
      vertexShader:`
        varying vec2 vUv;
        void main(){
          vUv=uv;
          gl_Position=projectionMatrix*modelViewMatrix*
            instanceMatrix*vec4(position,1.0);
        }`,
      fragmentShader:`
        varying vec2 vUv;
        uniform float uTime;
        uniform float uRain;
        void main(){
          vec2 q=(vUv-.5)*2.0;
          float oval=1.0-smoothstep(.54,1.0,length(q*vec2(1.0,1.45)));
          float wake=sin(q.y*11.0-uTime*3.8+sin(q.x*7.0)*.8);
          float ripples=pow(max(0.0,wake),2.0)*.30+.27;
          float alpha=oval*ripples*(.65+.35*uRain);
          if(alpha<.008)discard;
          gl_FragColor=vec4(.79,.90,.88,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent:true,depthWrite:false,depthTest:true,
      side:THREE.DoubleSide
    });
    this.foamMaterial=foamMat;
    this.materials.push(foamMat);
    const wakes=new THREE.InstancedMesh(foamGeo,foamMat,Math.floor(count*.55));
    wakes.name='Espuma e corrente à volta das rochas';
    let index=0;
    for(let i=0;i<count*2&&index<wakes.instanceMatrix.count;i++){
      const p=this.points[Math.floor(random()*this.points.length)];
      if(random()>.6)continue;
      // One shared lateral value: independent random x/z offsets were
      // drifting the foam onto the shore or outside the river entirely.
      const side=(random()*2-1)*p.width*.63;
      obj.position.set(p.x+p.nx*side,p.y+.108,p.z+p.nz*side);
      obj.rotation.set(0,Math.atan2(-p.nx,p.nz),0);
      obj.scale.set(.45+random()*.7,1,.65+random()*1.6);
      obj.updateMatrix();wakes.setMatrixAt(index++,obj.matrix);
    }
    wakes.count=index;wakes.instanceMatrix.needsUpdate=true;
    wakes.renderOrder=2;
    this.group.add(wakes);this.foam=wakes;
  }
  buildBankVegetation(){
    // Reeds and rushes are genuinely located on riverbanks, not scattered
    // inside the water or on road bridges. One geometry/material draw batch.
    const random=seedRandom(20261018);
    const samples=Math.floor(this.points.length*
      (this.quality==='low'?.54:this.quality==='ultra'?1.6:1.05));
    const positions=[],colors=[],indices=[];
    // Three crossed tapering leaves per plant (a tiny 3D reed cluster).
    for(let blade=0;blade<3;blade++){
      const angle=blade*Math.PI/3;
      const dx=Math.cos(angle)*.20,dz=Math.sin(angle)*.20;
      const base=positions.length/3;
      positions.push(-dx,0,-dz,dx,0,dz,
        Math.sin(angle*3+1)*.12,1.0,Math.cos(angle*3+1)*.12);
      colors.push(.16,.25,.10,.24,.37,.14,.30,.43,.18);
      indices.push(base,base+1,base+2);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geo.setIndex(indices);geo.computeVertexNormals();
    const mat=new THREE.MeshStandardMaterial({vertexColors:true,
      side:THREE.DoubleSide,roughness:.94,metalness:0});
    this.geometries.push(geo);this.materials.push(mat);
    const mesh=new THREE.InstancedMesh(geo,mat,Math.max(1,samples));
    mesh.name='Juncos e vegetação ripícola nas margens';
    const dummy=new THREE.Object3D();
    let count=0;
    for(let i=0;i<samples*3&&count<samples;i++){
      const p=this.points[Math.floor(random()*this.points.length)];
      const side=random()<.5?-1:1;
      const offset=p.width+4+random()*16;
      const x=p.x+p.nx*side*offset,z=p.z+p.nz*side*offset;
      const near=this.lookup(x,z);
      if(!near||near.distance<near.width+2.5)continue;
      const road=this.network.query?.(x,z);
      // query() returns a *road name string*, not a road specification.
      // A conservative clearance protects even wide carriageways.
      if(road&&road.distance<20)continue;
      const height=this.channelHeight(this.terrainY(x,z),near);
      const scale=.50+random()*1.18;
      dummy.position.set(x,height+.045,z);
      dummy.rotation.set(0,random()*Math.PI*2,0);
      dummy.scale.set(scale,scale*(.7+random()*.6),scale);
      dummy.updateMatrix();mesh.setMatrixAt(count++,dummy.matrix);
    }
    mesh.count=count;
    mesh.instanceMatrix.needsUpdate=true;
    mesh.frustumCulled=true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow=true;
    this.group.add(mesh);
    this.bankVegetation=mesh;this.bankPlants=count;
  }
  buildBridges(){
    const concrete=new THREE.MeshStandardMaterial({color:0xaaa9a0,roughness:.90});
    const steel=new THREE.MeshStandardMaterial({color:0x888f91,roughness:.40,metalness:.70});
    this.materials.push(concrete,steel);
    const cube=new THREE.BoxGeometry(1,1,1);
    this.geometries.push(cube);
    const add=(name,x,y,z,sx,sy,sz,yaw,material)=>{
      const mesh=new THREE.Mesh(cube,material);
      mesh.name=name;mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);
      mesh.rotation.y=yaw;
      mesh.receiveShadow=true;
      this.group.add(mesh);return mesh;
    };
    for(const hit of this.crossings){
      const near=this.lookup(hit.x,hit.z);
      if(!near)continue;
      const length=near.width*2+13,width=hit.road.width;
      const yaw=Math.atan2(hit.direction.x,hit.direction.z);
      const deckY=Number.isFinite(hit.deckY)
        ?hit.deckY:this.terrainY(hit.x,hit.z)+.205;
      add('Ponte rodoviária · viga inferior',
        hit.x,deckY-.50,hit.z,width+.70,.58,length,yaw,concrete);
      for(const sign of [-1,1]){
        const side={x:-hit.direction.z*sign,z:hit.direction.x*sign};
        const x=hit.x+side.x*(width*.5+.61),z=hit.z+side.z*(width*.5+.61);
        add('Ponte · guarda metálica lateral',x,deckY+.66,z,
          .17,1.05,length-.65,yaw,steel);
        for(const advance of [-1,1]){
          const x2=x+hit.direction.x*advance*(length*.36);
          const z2=z+hit.direction.z*advance*(length*.36);
          const local=this.lookup(x2,z2);
          const naturalGround=this.terrainY(x2,z2);
          // Supports terminate at the *actual* excavated channel height.
          // Subtracting 1.55 m everywhere buried the feet below sloped banks.
          const actualGround=this.channelHeight(naturalGround,local);
          const baseY=actualGround-.18;
          const underside=deckY-.72;
          const pillarHeight=Math.max(.7,underside-baseY);
          add('Ponte · apoio no leito rochoso',
            x2,baseY+pillarHeight*.5,z2,
            .72,pillarHeight,1.0,yaw,concrete);
        }
        const collider=new CANNON.Body({mass:0,material:new CANNON.Material('bridge-rail')});
        collider.addShape(new CANNON.Box(new CANNON.Vec3(.09,.525,(length-.65)*.5)));
        collider.position.set(x,deckY+.66,z);
        collider.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),yaw);
        this.physics.addBody(collider);this.bodies.push(collider);
      }
    }
  }
  update(dt,paused=false,rain=false,sun=null){
    if(!paused)this.time+=Math.max(0,Math.min(dt,.08));
    this.waterMaterial.uniforms.uTime.value=this.time;
    this.foamMaterial.uniforms.uTime.value=this.time;
    this.foamMaterial.uniforms.uRain.value=rain?1:0;
    this.waterfallMaterial.uniforms.uTime.value=this.time;
    this.waterfallFoamMaterial.uniforms.uTime.value=this.time;
    this.waterfallSprayMaterial.uniforms.uTime.value=this.time;
    this.waterfallMaterial.uniforms.uRain.value=rain?1:0;
    this.waterfallFoamMaterial.uniforms.uRain.value=rain?1:0;
    this.waterfallSprayMaterial.uniforms.uRain.value=rain?1:0;
    this.waterMaterial.uniforms.uRain.value=rain?1:0;
    if(sun)this.waterMaterial.uniforms.uSun.value.copy(sun).normalize();
  }
  dispose(){
    for(const body of this.bodies)this.physics.removeBody(body);
    this.scene.remove(this.group);
    for(const geo of this.geometries)geo.dispose();
    for(const mat of this.materials)mat.dispose();
  }
}
