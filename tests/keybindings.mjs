import assert from 'node:assert/strict';
import {safeBindings} from '../src/interface.js';
const normal=safeBindings({
  accelerate:'t',brake:'s',left:'a',right:'d',handbrake:' ',camera:'c'
});
assert.equal(normal.accelerate,'t','Legitimate remapping must survive');
for(const bad of [null,[],12,'hello',{
  accelerate:'<img src=x onerror=alert(1)>',
  brake:['s'],left:{toString:'x'},right:'q',handbrake:' ',camera:'c'
}]){
  const result=safeBindings(bad);
  assert.equal(Object.keys(result).length,6);
  const assigned=Object.values(result);
  assert.equal(new Set(assigned).size,6,'No duplicate key bindings');
  assert.ok(assigned.every(x=>/^[a-z0-9 ]$/.test(x)));
  assert.ok(assigned.every(x=>x!=='q'&&x!=='m'));
}
assert.deepEqual(safeBindings({accelerate:'w',brake:'w'}).brake,'s');
console.log('PASS: corrupted or unsafe saved keybindings are normalized and never injected into HTML.');
