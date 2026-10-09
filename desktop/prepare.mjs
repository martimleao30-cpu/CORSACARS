import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
let html = source.replace(/<script\s+type="importmap"[\s\S]*?<\/script>\s*/i, '');
if (html === source) throw new Error('Import map CDN não foi encontrado: confirmar HTML.');
html = html.replaceAll('href="./src/', 'href="../src/')
  .replaceAll('src="./src/', 'src="../src/');
if (!html.includes('../src/main.js') || /cdn\.jsdelivr\.net/.test(html)) {
  throw new Error('A entrada desktop ainda depende do navegador/CDN.');
}
const dir = resolve('desktop');
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, 'index.html'), html);
console.log('PASS: entrada desktop com dependências locais.');
