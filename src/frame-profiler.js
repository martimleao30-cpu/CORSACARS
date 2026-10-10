// Diagnostic sampler; never changes render resolution, object quality or
// physics accuracy. GPU timers are optional and non-blocking (WebGL2 only).
const average=items=>items.length
  ?items.reduce((sum,value)=>sum+value,0)/items.length:0;
export class FrameProfiler{
  constructor(renderer){
    this.renderer=renderer;
    this.gl=renderer.getContext?.()||null;
    this.extension=this.gl?.getExtension?.('EXT_disjoint_timer_query_webgl2')||null;
    this.query=null;
    this.collecting=false;
    this.frame=0;
    this.samples={frame:[],cpu:[],physics:[],world:[],effects:[],render:[],gpu:[]};
    this.lastGpuMs=null;
    this.recordings=0;
  }
  gpuBegin(){
    const gl=this.gl,ext=this.extension;
    if(!gl||!ext)return;
    this.pollGpu();
    // One outstanding query at a time; no synchronous GPU readbacks.
    if(this.query||this.collecting||++this.frame%12!==0)return;
    const query=gl.createQuery();
    if(!query)return;
    try{
      gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
      this.query=query;this.collecting=true;
    }catch{gl.deleteQuery(query);}
  }
  gpuEnd(){
    if(!this.collecting)return;
    try{this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);}
    finally{this.collecting=false;}
  }
  pollGpu(){
    if(!this.query||this.collecting)return;
    const gl=this.gl,ext=this.extension;
    let available=false;
    try{
      available=gl.getQueryParameter(this.query,gl.QUERY_RESULT_AVAILABLE);
      if(!available)return;
      const valid=!gl.getParameter(ext.GPU_DISJOINT_EXT);
      if(valid){
        this.lastGpuMs=gl.getQueryParameter(this.query,gl.QUERY_RESULT)/1000000;
        this.push('gpu',this.lastGpuMs);
      }
    }catch{
      // A lost WebGL context can invalidate the query mid-frame.
      available=true;
    }finally{
      if(available){
        try{gl.deleteQuery(this.query);}catch{/* Context already lost. */}
        this.query=null;
      }
    }
  }
  push(name,ms){
    if(!Number.isFinite(ms)||ms<0)return;
    const list=this.samples[name];
    list.push(ms);
    if(list.length>80)list.shift();
  }
  record({frame,cpu,physics,world,effects,render}){
    this.recordings++;
    this.push('frame',frame);
    this.push('cpu',cpu);this.push('physics',physics);
    this.push('world',world);this.push('effects',effects);
    this.push('render',render);
    this.pollGpu();
  }
  snapshot(){
    const gl=this.renderer.info||{};
    const mem=gl.memory||{},render=gl.render||{};
    const heap=typeof performance!=='undefined'&&performance.memory
      ?performance.memory.usedJSHeapSize/(1024*1024):null;
    const sorted=this.samples.frame.slice().sort((a,b)=>a-b);
    const p95Frame=sorted.length
      ?sorted[Math.ceil(sorted.length*.95)-1]:0;
    const result={
      frame:average(this.samples.frame),
      p95Frame,
      cpu:average(this.samples.cpu),
      physics:average(this.samples.physics),
      world:average(this.samples.world),
      effects:average(this.samples.effects),
      render:average(this.samples.render),
      gpu:this.samples.gpu.length?average(this.samples.gpu):null,
      heapMB:heap,
      textures:mem.textures||0,
      geometries:mem.geometries||0,
      drawCalls:render.calls||0,
      triangles:render.triangles||0
    };
    result.bottleneck=this.bottleneck(result);
    return result;
  }
  bottleneck(result){
    if(result.gpu!=null&&result.gpu>result.cpu*1.25)return 'GPU (sombras/efeitos/desenho)';
    const parts=[['Física',result.physics],['Mundo e vegetação',result.world],
      ['Reflexos e efeitos',result.effects],['CPU do render',result.render]];
    const [name,cost]=parts.sort((a,b)=>b[1]-a[1])[0];
    if(result.gpu==null)return name+' (GPU não medida)';
    if(cost<1)return 'Misto / sem gargalo evidente';
    return name;
  }
  dispose(){
    if(this.query&&this.gl){
      if(this.collecting)this.gpuEnd();
      this.gl.deleteQuery(this.query);
      this.query=null;
    }
  }
}
