import assert from 'node:assert/strict';
import {preloadDrivingWorld} from '../src/world-preload.js';

const sequence=[],progress=[];
const sectors={regions:[{id:'town'},{id:'farm'}],active:new Map(),
  async preloadAll(notify,yieldFrame){
    for(let i=0;i<2;i++){
      this.active.set(this.regions[i].id,{});
      notify(i+1,2,this.regions[i].id);
      await yieldFrame();
    }
    this.preloaded=true;
  }};
const chunks=new Map([['a',{}],['b',{}],['c',{}]]);
const forest={chunks,async preloadAllLods(notify,yieldFrame){
  assert.equal(sectors.active.size,2,'Forest precompilation must happen after POI loading');
  for(let i=0;i<3;i++){
    sequence.push('chunk:'+i);
    notify(i+1,3);
    await yieldFrame();
  }
},update(){sequence.push('forest-visible');}};
const understory={updateLocalGrass(position){
  assert.equal(position.x,10);
  sequence.push('grass-at-spawn');
}};
const world={sectors,forest,understory,scene:{},
  updateForest(camera){forest.update(camera);}};
const renderer={compileAsync:async()=>{sequence.push('shader');}};
const result=await preloadDrivingWorld({
  world,renderer,camera:{position:{x:10}},
  graphicsReady:Promise.resolve().then(()=>{sequence.push('effects');}),
  loadAssets:async()=>{sequence.push('textures');},
  onProgress:(percent,label)=>progress.push([percent,label]),
  yieldFrame:async()=>{sequence.push('yield');}
});
assert.equal(result.regions,2);
assert.equal(result.forestChunks,3);
assert.equal(sectors.preloaded,true);
assert.ok(sequence.indexOf('grass-at-spawn')>sequence.indexOf('chunk:2'));
assert.ok(sequence.indexOf('shader')>sequence.indexOf('textures'));
assert.equal(progress.at(-1)[0],100);
assert.ok(progress.every(([v],i)=>i===0||v>=progress[i-1][0]),
  'Progress display should never jump backwards');
assert.ok(progress.some(([,label])=>label.includes('QUINTAS')));
console.log('PASS: eager startup awaits every POI, all forest LODs, textures and shaders before opening menus.');
