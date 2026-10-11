import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WORLD_SIZE,WORLD_HALF,groundHeight} from '../src/world.js';
import {REGIONAL_LINKS} from '../src/road-network.js';
assert.equal(WORLD_SIZE,4100);
assert.equal(WORLD_HALF,WORLD_SIZE/2);
const outer=REGIONAL_LINKS.filter(r=>['tunel-serra','planicie-sul',
  'vale-leste','campos-oeste'].includes(r.id));
assert.equal(outer.length,4);
for(const road of outer){
  assert.ok(road.via.some(([x,z])=>Math.max(Math.abs(x),Math.abs(z))>1000),
    'Outer extension must reach new land: '+road.id);
  for(const [x,z] of road.via){
    assert.ok(Math.abs(x)<WORLD_HALF-80&&Math.abs(z)<WORLD_HALF-80,
      'All road vertices must stay well within terrain bounds: '+road.id);
    assert.ok(Number.isFinite(groundHeight(x,z)));
  }
}
assert.ok(groundHeight(1950,1600)>groundHeight(350,320));
console.log('PASS: continuous 4.1 km world, connected outer roads and safe terrain extents.');
