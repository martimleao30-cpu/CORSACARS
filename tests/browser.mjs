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
await page.addInitScript(() => {
  // CI normally runs WebGL through SwiftShader CPU rendering. Keep driving test deterministic.
  window.__CORSACARS_DISABLE_REMOTE_ASSETS__ = true;
  localStorage.setItem('corsacars.settings.v1', JSON.stringify({
    quality: 'low', fps: 30, ao: false, reflections: false, sound: false
  }));
});
const browserErrors = [];
page.on('pageerror', err => browserErrors.push(err.message));
page.on('console', message => {
  if (message.type() === 'error') browserErrors.push(message.text());
});
try {
  await page.goto('http://127.0.0.1:8080', { waitUntil: 'domcontentloaded' });
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 45000 });
  assert.equal(await page.locator('#startButton').isVisible(), true);
  const hasWebGL = await page.evaluate(() =>
    Boolean(document.querySelector('#game').getContext('webgl2')));
  assert.equal(hasWebGL, true, 'WebGL2 context unavailable');

  // Premium main menu: all new screens must open and close, not inert mockups.
  await page.locator('#garageStart').click();
  assert.equal(await page.locator('#garageScreen').isVisible(), true);
  await page.locator('#garagePaint').fill('#cc5533');
  await page.locator('#garageSelect').click();
  assert.equal(await page.locator('#startScreen').isVisible(), true);

  await page.locator('#creditsStart').click();
  assert.equal(await page.locator('#creditsScreen').isVisible(), true);
  await page.locator('#creditsScreen [data-ui-back]').click();

  await page.locator('#hudStart').click();
  assert.equal(await page.locator('#hudEditorScreen').isVisible(), true);
  await page.locator('#hudStyle').selectOption('racing');
  await page.locator('#hudUnit').selectOption('mph');
  await page.locator('#hudColor').fill('#22aaff');
  await page.locator('#hudApply').click();
  assert.equal(await page.locator('#startScreen').isVisible(), true);
  assert.equal(await page.locator('.speed-dial.style-racing').count(), 1);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('corsacars.hud.v2')).unit), 'mph');

  await page.locator('#startScreen [data-open-settings]').click();
  assert.equal(await page.locator('#settingsScreen').isVisible(), true);
  await page.locator('[data-tab=controls]').click();
  await page.locator('#gamepadDeadzone').fill('0.2');
  await page.locator('[data-tab=graphics]').click();
  await page.locator('#renderScale').selectOption('0.75');
  await page.locator('#settingsBack').click();
  assert.equal(await page.locator('#startScreen').isVisible(), true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('corsacars.settings.v1')).renderScale), 0.75);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('corsacars.settings.v1')).gamepadDeadzone), 0.2);

  await page.locator('#startButton').click();
  await page.keyboard.down('w');
  await page.waitForFunction(() => Number(document.querySelector('#speedValue')?.textContent) > 0,
    null, { timeout: 23000, polling: 250 }).catch(async error => {
    throw new Error('Sem aceleração com WebGL em software: ' + error.message +
      '. Console: ' + JSON.stringify(browserErrors));
  });
  await page.keyboard.up('w');
  const speed = Number(await page.locator('#speedValue').textContent());
  assert.ok(speed > 0, 'Car did not accelerate; measured speed=' + speed);

  await page.keyboard.press('c');
  await page.locator('#toast').getByText(/CÂMARA/).waitFor();
  await page.keyboard.press('k');
  await page.locator('#weatherLabel').getByText('CHUVA').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#pauseScreen').isVisible(), true);
  await page.locator('#mapPause').click();
  assert.equal(await page.locator('#mapScreen').isVisible(), true);
  await page.locator('#mapScreen [data-ui-back]').click();
  assert.equal(await page.locator('#pauseScreen').isVisible(), true);
  await page.locator('#resumeButton').click();
  assert.equal(await page.locator('#pauseScreen').isVisible(), false);

  await page.screenshot({ path: '/tmp/corsacars-browser-check.png' });
  assert.deepEqual(browserErrors, [], 'Unexpected JavaScript/browser errors');
  console.log('PASS: WebGL scene loaded, car moved, camera/weather/pause interaction succeeded.');
} finally {
  await browser.close();
}
