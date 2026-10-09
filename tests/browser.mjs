import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-webgl', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--disable-dev-shm-usage'
  ]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const browserErrors = [];
page.on('pageerror', err => browserErrors.push(err.message));
page.on('console', message => {
  if (message.type() === 'error') browserErrors.push(message.text());
});
try {
  await page.goto('http://127.0.0.1:8080', { waitUntil: 'domcontentloaded' });
  await page.locator('#loading.hidden').waitFor({ timeout: 45000 });
  assert.equal(await page.locator('#startButton').isVisible(), true);
  const hasWebGL = await page.evaluate(() =>
    Boolean(document.querySelector('#game').getContext('webgl2')));
  assert.equal(hasWebGL, true, 'WebGL2 context unavailable');

  await page.locator('#startButton').click();
  await page.keyboard.down('w');
  await page.waitForTimeout(2800);
  await page.keyboard.up('w');
  const speed = Number(await page.locator('#speedValue').textContent());
  assert.ok(speed > 0, 'Car did not accelerate; measured speed=' + speed);

  await page.keyboard.press('c');
  await page.locator('#toast').getByText(/CÂMARA/).waitFor();
  await page.keyboard.press('k');
  await page.locator('#weatherLabel').getByText('CHUVA').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#pauseScreen').isVisible(), true);
  await page.locator('#resumeButton').click();
  assert.equal(await page.locator('#pauseScreen').isVisible(), false);

  await page.screenshot({ path: '/tmp/corsacars-browser-check.png' });
  assert.deepEqual(browserErrors, [], 'Unexpected JavaScript/browser errors');
  console.log('PASS: WebGL scene loaded, car moved, camera/weather/pause interaction succeeded.');
} finally {
  await browser.close();
}
