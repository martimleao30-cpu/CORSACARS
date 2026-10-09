import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';

const raw=readFileSync(new URL('../desktop/updates.cjs',import.meta.url),'utf8');
const up=new EventEmitter();
let checkCount=0, downloadCount=0, installed=0, timers=[];
up.checkForUpdates=async()=>{
  checkCount++;
  up.emit('update-available',{version:'0.6.3'});
  return {version:'0.6.3'};
};
up.downloadUpdate=async()=>{
  downloadCount++;
  up.emit('download-progress',{percent:51.2});
  up.emit('update-downloaded',{version:'0.6.3'});
  return [];
};
up.quitAndInstall=()=>{installed++};
const ipc=new Map();
const webContents={messages:[],send(name,msg){this.messages.push({name,msg})}};
const window={webContents,isDestroyed:()=>false};
const app={isPackaged:true,getVersion:()=> '0.6.2',on:()=>{}};
const module={exports:{}};
vm.runInNewContext('(function(require,module,process,setTimeout,setInterval,setImmediate,console){'+raw+'\n})',
  { })((name)=>{
    if(name!=='electron-updater')throw new Error('Unexpected require: '+name);
    return {autoUpdater:up};
  },module,{platform:'win32'},
  (fn,ms)=>{timers.push({kind:'timeout',fn,ms});return 1;},
  (fn,ms)=>{timers.push({kind:'interval',fn,ms});return 2;},
  fn=>fn(),
  console
);
module.exports.setupUpdates({
  app,
  ipcMain:{handle(name,fn){ipc.set(name,fn)}},
  getWindow:()=>window
});
const evt={sender:webContents,senderFrame:{url:'corsacars://game/desktop/index.html'}};
const invoke=(name)=>ipc.get('corsacars:update-'+name)(evt);
assert.equal(up.autoDownload,false,'Updates must require user confirmation');
assert.equal(up.autoInstallOnAppQuit,false,'No unexpected restart or install on quit');
assert.equal(up.allowDowngrade,false);
assert.equal(up.allowPrerelease,false);
assert.ok(timers.some(x=>x.kind==='timeout'&&x.ms===8000));
assert.ok(timers.some(x=>x.kind==='interval'&&x.ms===60*60*1000));
assert.equal((await invoke('state')).state,'idle');
assert.equal((await invoke('check')).state,'available');
assert.equal(checkCount,1);
assert.equal(installed,0);
assert.equal(downloadCount,0);
assert.equal((await invoke('download')).state,'ready');
assert.equal(downloadCount,1);
assert.equal(installed,0);
assert.equal((await invoke('install')).ok,true);
assert.equal(installed,1);
assert.equal((await ipc.get('corsacars:update-check')({
  sender:{}, senderFrame:{url:'https://evil.example/'}
})).state,'unavailable');
assert.ok(webContents.messages.some(v=>v.msg.state==='downloading'&&v.msg.progress===51));
assert.ok(webContents.messages.some(v=>v.msg.state==='ready'));

const ui=readFileSync(new URL('../src/desktop-updates.js',import.meta.url),'utf8');
assert.match(ui,/ATUALIZAR AGORA/);
assert.match(ui,/REINICIAR E INSTALAR/);
assert.match(ui,/Mais tarde/);
assert.match(ui,/corsacars:before-update/);
const main=readFileSync(new URL('../desktop/main.cjs',import.meta.url),'utf8');
assert.match(main,/preload\.cjs/);
assert.match(main,/setupUpdates/);
console.log('PASS: simulated update notification, consent, download, progress, install and IPC security.');
