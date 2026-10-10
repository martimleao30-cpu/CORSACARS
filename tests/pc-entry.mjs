import assert from 'node:assert/strict';
import {setupPCEntry} from '../src/pc-entry.js';
const nodes=new Map(),documentHandlers={},calls=[];
function node(id){
  const handlers={};
  const classes=new Set(['hidden']);
  return {
    id,hidden:id==='entryUpdateAction',disabled:false,textContent:'',
    classList:{add(x){classes.add(x);},remove(x){classes.delete(x);},
      contains(x){return classes.has(x);}},
    addEventListener(event,fn){handlers[event]=fn;},
    click(){handlers.click?.({target:this});},
    async run(event){return handlers[event]?.({target:this});},
    focus(){calls.push('focused:'+id);},
    closest(){return null},
    handlers
  };
}
for(const id of ['entryScreen','entryContinue','entryCheckUpdate',
  'entryUpdateAction','entryUpdateVersion','entryUpdateStatus',
  'entryUpdateDetail','startScreen','startButton'])nodes.set(id,node(id));
nodes.get('startScreen').querySelector=()=>nodes.get('startButton');
globalThis.document={body:{},getElementById(id){return nodes.get(id)||null;},
  addEventListener(type,handler){documentHandlers[type]=handler;}};
globalThis.fetch=async()=>({ok:true,json:async()=>({
  tag_name:'v0.7.99',html_url:'https://github.com/example/'
})});
globalThis.AbortSignal=globalThis.AbortSignal||{timeout:()=>undefined};
globalThis.window={open(url){calls.push(url);},corsacarsDesktop:null};
const web=setupPCEntry();
assert.ok(web,'Title gate must mount');
assert.equal(nodes.get('entryScreen').classList.contains('hidden'),false);
await web.check();
assert.match(nodes.get('entryUpdateStatus').textContent,/v0.7.99/);
assert.equal(nodes.get('entryUpdateAction').hidden,false);
await nodes.get('entryUpdateAction').run('click');
assert.ok(calls.some(x=>x.includes('/releases/tag/v0.7.99')),
  'Web uses the actual GitHub release, not an unsupported installer');
nodes.get('entryContinue').click();
assert.equal(nodes.get('entryScreen').classList.contains('hidden'),true);
assert.ok(calls.some(x=>x.startsWith('focused:')));
web.dispose();
const eventHandlers={};
let installed=0,downloaded=0,checks=0;
window.corsacarsDesktop={
  onUpdate(fn){eventHandlers.status=fn;return ()=>{};},
  version:async()=>({state:'current',version:'0.7.99'}),
  checkUpdates:async()=>{checks++;return {state:'available',version:'0.7.99',nextVersion:'0.7.100'};},
  downloadUpdate:async()=>{downloaded++;return {state:'downloading',progress:19,nextVersion:'0.7.100'};},
  installUpdate:async()=>{installed++;return {ok:true};}
};
window.dispatchEvent=(evt)=>calls.push('event:'+evt.type);
globalThis.Event=class {constructor(type){this.type=type;}};
nodes.get('entryScreen').classList.add('hidden');
const desktop=setupPCEntry();
await desktop.check();
assert.equal(checks,1);
assert.equal(nodes.get('entryUpdateAction').hidden,false);
await nodes.get('entryUpdateAction').run('click');
assert.equal(downloaded,1);
eventHandlers.status({state:'ready',version:'0.7.99',nextVersion:'0.7.100'});
await nodes.get('entryUpdateAction').run('click');
assert.equal(installed,1);
assert.ok(calls.includes('event:corsacars:before-update'),
  'An explicit installation must save session through the existing event');
desktop.dispose();
console.log('PASS: PC title gate, web release information and secure desktop updates with user confirmation.');
