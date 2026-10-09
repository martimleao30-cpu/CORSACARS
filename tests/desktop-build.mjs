import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const entry = await readFile('dist/desktop/index.html', 'utf8');
const src = await readFile('desktop/main.cjs', 'utf8');
const modules = await readdir('dist/assets');
assert.match(entry, /CORSACARS/);
assert.doesNotMatch(entry, /cdn\.jsdelivr\.net|<script[^>]+importmap/);
assert.match(entry, /assets/);
assert.ok(modules.some(f => f.endsWith('.js')), 'Vite não produziu JavaScript offline');
assert.ok(modules.some(f => f.endsWith('.css')), 'Vite não produziu CSS offline');
assert.match(src, /protocol\.handle\(SCHEME, loadLocalAsset\)/);
assert.match(src, /sandbox: true/);
assert.match(src, /nodeIntegration: false/);
assert.match(src, /contextIsolation: true/);
const js = (await Promise.all(modules.filter(f=>f.endsWith('.js')).map(f => readFile(path.join('dist/assets', f),'utf8')))).join('\n');
assert.doesNotMatch(js, /cdn\.jsdelivr\.net\/npm\/(?:three|cannon-es)/);
console.log('PASS: jogo Windows compilado com Three.js/cannon-es local e sem browser remoto.');
