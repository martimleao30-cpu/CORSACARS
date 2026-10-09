import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader',
    '--enable-webgl', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.addInitScript(() => {
  window.__CORSACARS_DISABLE_REMOTE_ASSETS__ = true;
  localStorage.setItem('corsacars.settings.v1',
    JSON.stringify({ quality: 'low', fps: 30, ao: false, reflections: false, sound: false }));
});
try {
  await page.goto('http://127.0.0.1:8080', { waitUntil: 'domcontentloaded' });
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 45000 });
  const result = await page.evaluate(async () => {
    const withTimeout = async (task, label) => Promise.race([
      task.then(value => ({ label, ok: true, ...value })).catch(error => ({
        label, ok: false, error: String(error)
      })),
      new Promise(resolve => setTimeout(() =>
        resolve({ label, ok: false, error: 'Asset download timed out' }), 26000))
    ]);
    const tasks = await Promise.allSettled([
      withTimeout((async () => {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const gltf = await new GLTFLoader().loadAsync(
          'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb'
        );
        let meshes = 0;
        gltf.scene.traverse(obj => { if (obj.isMesh) meshes++; });
        return { meshes };
      })(), 'model'),
      withTimeout((async () => {
        const THREE = await import('three');
        const img = await new THREE.TextureLoader().loadAsync(
          'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_diff_1k.jpg'
        );
        return { width: img.image.width, height: img.image.height };
      })(), 'asphalt'),
      withTimeout((async () => {
        const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
        const img = await new RGBELoader().loadAsync(
          'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr'
        );
        return { width: img.image.width, height: img.image.height };
      })(), 'hdri')
    ]);
    return tasks.map(x => x.status === 'fulfilled' ? x.value : {
      label: 'unknown', ok: false, error: String(x.reason)
    });
  });
  for (const item of result) console.log(JSON.stringify(item));
  assert.equal(result.length, 3);
  const car = result.find(x => x.label === 'model');
  const road = result.find(x => x.label === 'asphalt');
  const sky = result.find(x => x.label === 'hdri');
  assert.ok(car?.ok && car.meshes > 0, 'Car glTF download/parse failed');
  assert.ok(road?.ok && road.width >= 1024, 'Photographic asphalt load failed');
  assert.ok(sky?.ok && sky.width >= 512, 'HDRI load failed');
  console.log('PASS: licensed model, photographic asphalt, and HDRI loaded in Chromium.');
} finally {
  await browser.close();
}
