import assert from 'node:assert/strict';
import {FrameProfiler} from '../src/frame-profiler.js';

const renderer={info:{memory:{textures:17,geometries:53},
  render:{calls:100,triangles:98000}}};
const perf=new FrameProfiler(renderer);
for(let i=0;i<100;i++)
  perf.record({frame:i%20===0?36:27.9,
    cpu:12,physics:5,world:3,effects:1,render:2});
let state=perf.snapshot();
assert.equal(state.cpu,12);
assert.ok(state.frame>27&&state.frame<30);
assert.equal(state.p95Frame,36,
  'F3 should reveal 95th-percentile spikes alongside average FPS');
assert.equal(state.physics,5);
assert.equal(state.world,3);
assert.equal(state.gpu,null);
assert.equal(state.bottleneck,'Física (GPU não medida)');
assert.equal(state.textures,17);
assert.equal(state.geometries,53);
assert.equal(state.drawCalls,100);
assert.equal(state.triangles,98000);
assert.ok(perf.samples.cpu.length<=80);
assert.equal(perf.samples.physics.length,80);
perf.dispose();
const fakeGl={
  QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,
  createQuery:()=>({id:7}),
  deleteQuery:()=>{},
  beginQuery:()=>{},
  endQuery:()=>{},
  getQueryParameter:(q,type)=>type===1?true:14000000,
  getParameter:()=>false,
  getExtension:(name)=>name==='EXT_disjoint_timer_query_webgl2'
    ?{TIME_ELAPSED_EXT:88,GPU_DISJOINT_EXT:99}:null
};
const realGpu=new FrameProfiler({...renderer,getContext:()=>fakeGl});
realGpu.frame=11;
realGpu.gpuBegin();
realGpu.gpuEnd();
realGpu.pollGpu();
assert.equal(realGpu.snapshot().gpu,14);
assert.match(realGpu.snapshot().bottleneck,/GPU/);
realGpu.dispose();
console.log('PASS: accurate nonblocking GPU timing, CPU subsystem attribution and memory counters.');
