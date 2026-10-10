import assert from 'node:assert/strict';
import {PerformanceMonitor} from '../src/performance.js';

const renderer={info:{render:{calls:87,triangles:120000}}};
const label={textContent:''};
const changes=[];
const perf=new PerformanceMonitor(renderer,label,quality=>changes.push(quality));
// 60 completed frames over one second must report exactly 60 FPS,
// with reciprocal frame time (~16.67 ms), not a median estimate.
for(let i=0;i<60;i++)perf.update(1/60,'high');
assert.equal(perf.current.fps,60);
assert.ok(Math.abs(perf.current.frameMs-1000/60)<.01);
assert.match(label.textContent,/60.*16\.7 ms\/fotograma/);
assert.match(label.textContent,/87 draw calls/);

// 70 frames over 0.9 seconds: counting frames gives ~78 FPS,
// whereas the old median-interframe algorithm would report 100 FPS.
perf.reset();
for(let i=0;i<60;i++)perf.update(.010,'high');
for(let i=0;i<10;i++)perf.update(.030,'high');
assert.equal(perf.current.fps,78);
assert.ok(Math.abs(perf.current.frameMs-900/70)<.01);

// Do not incorrectly cap measured performance to 300 FPS.
perf.reset();
for(let i=0;i<360;i++)perf.update(1/360,'ultra');
assert.equal(perf.current.fps,360);
assert.ok(Math.abs(perf.current.frameMs-1000/360)<.01);

// Long hidden-tab delays and pause state cannot inflate frame time.
perf.reset();
perf.update(.40,'high');
perf.update(4,'high');
assert.equal(perf.frames,0);
assert.equal(perf.seconds,0);
perf.update(.31,'high',false,false);
assert.equal(perf.frames,0);
assert.deepEqual(changes,[]);
console.log('PASS: accurate actual FPS, reciprocal frame milliseconds and hidden-tab handling.');
