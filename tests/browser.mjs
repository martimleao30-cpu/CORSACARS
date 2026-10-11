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
  if (!localStorage.getItem('corsacars.settings.v1')) {
    localStorage.setItem('corsacars.settings.v1', JSON.stringify({
      quality: 'low', fps: 30, ao: false, reflections: false, sound: false
    }));
  }
});
// The title screen checks GitHub Releases. Public CI runners may hit API
// rate limits (HTTP 403) unrelated to our game. Mock ONLY that release API
// endpoint; keep game scripts, controls, WebGL and all local assets real.
await page.route(
  'https://api.github.com/repos/martimleao30-cpu/CORSACARS/releases/latest',
  route=>route.fulfill({
    status:200,
    contentType:'application/json',
    headers:{'access-control-allow-origin':'*'},
    body:JSON.stringify({tag_name:'v0.7.0'})
  })
);
const failedHttpResponses=[];
page.on('response', response=>{
  if(response.status()>=400)
    failedHttpResponses.push(response.status()+' '+response.url());
});
const browserErrors = [];
page.on('pageerror', err => browserErrors.push(err.stack || err.message));
page.on('console', message => {
  if (message.type() === 'error') browserErrors.push(message.text());
});
try {
  await page.goto('http://127.0.0.1:8080', { waitUntil: 'domcontentloaded' });
  // Full-world preload deliberately takes longer than the old incremental boot.
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 120000 })
    .catch(async error=>{
      const diagnostic=await page.evaluate(()=>({
        ready:document.readyState,
        loading:document.querySelector('#loading')?.textContent?.slice(0,400),
        main:document.querySelector('#game')?.getAttribute('width')
      })).catch(e=>({error:e.message}));
      throw new Error('Falha no arranque WebGL: '+error.message+
        '\nErros JavaScript: '+JSON.stringify(browserErrors)+
        '\nEstado da página: '+JSON.stringify(diagnostic));
    });
  await page.waitForFunction(()=>
    document.querySelector('#entryUpdateStatus')?.textContent?.includes('ÚLTIMO LANÇAMENTO · v0.7.0'),
    null,{timeout:15000});
  assert.equal(await page.locator('#loadingProgress').evaluate(el=>el.style.width),'100%',
    'Loading screen must finish all preparation stages before the menu');
  assert.ok(Number(await page.locator('#loading').getAttribute('data-regions'))>=10,
    'Every village, farm and POI must be preloaded before the title screen');
  assert.ok(Number(await page.locator('#loading').getAttribute('data-forest-chunks'))>9,
    'All forest chunks must have been prepared before the title screen');
  assert.equal(await page.locator('#entryScreen').isVisible(),true,
    'PC game must start on a dedicated title gate');
  assert.ok(await page.locator('#entryCheckUpdate').isVisible());
  await page.locator('#entryContinue').click();
  assert.equal(await page.locator('#entryScreen').isVisible(),false);
  assert.equal(await page.locator('#startButton').isVisible(), true);
  const hasWebGL = await page.evaluate(() =>
    Boolean(document.querySelector('#game').getContext('webgl2')));
  assert.equal(hasWebGL, true, 'WebGL2 context unavailable');

  // Premium main menu: all new screens must open and close, not inert mockups.
  await page.locator('#garageStart').click();
  assert.equal(await page.locator('#garageScreen').isVisible(), true);
  await page.locator('#garagePaint').fill('#cc5533');
  await page.locator('#garageModel').selectOption('m4');
  assert.equal(await page.locator('#garageVmax').textContent(),'250 km/h');
  await page.locator('#garageSelect').click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('corsacars.settings.v1')).selectedVehicle),'m4',
    'Chosen BMW M4 must be saved');
  await page.locator('#garageStart').click();
  assert.equal(await page.locator('#garageModel').inputValue(),'m4');
  await page.locator('#garageModel').selectOption('coupe');
  await page.locator('#garageSelect').click();
  assert.equal(await page.locator('#startScreen').isVisible(), true);

  await page.locator('#creditsStart').click();
  assert.equal(await page.locator('#creditsScreen').isVisible(), true);
  await page.locator('#creditsScreen [data-ui-back]').click();

  await page.locator('#hudStart').click();
  assert.equal(await page.locator('#hudEditorScreen').isVisible(), true);
  await page.locator('#hudStyle').selectOption('glass');
  assert.equal(await page.locator('.speed-dial.style-glass').count(), 1,
    'Translucent copper HUD must render as an editable live style');
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
  await page.locator('[data-bind=accelerate]').click();
  await page.keyboard.press('t');
  assert.equal(await page.evaluate(() =>
    JSON.parse(localStorage.getItem('corsacars.settings.v1')).bindings.accelerate),'t');
  await page.locator('#bindingsReset').click();
  assert.equal(await page.evaluate(() =>
    JSON.parse(localStorage.getItem('corsacars.settings.v1')).bindings.accelerate),'w');
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
  await page.locator('#weatherLabel').getByText('NUBLADO').waitFor();
  await page.keyboard.press('k');
  await page.locator('#weatherLabel').getByText('NEVOEIRO').waitFor();
  await page.keyboard.press('k');
  await page.locator('#weatherLabel').getByText('CHUVA').waitFor();
  await page.keyboard.press('k');
  await page.locator('#weatherLabel').getByText('TEMPESTADE').waitFor();
  assert.equal(await page.locator('#weatherSelect').inputValue(),'storm');
  await page.keyboard.press('k');
  await page.locator('#weatherLabel').getByText('CÉU LIMPO').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#pauseScreen').isVisible(), true);
  await page.locator('#mapPause').click();
  assert.equal(await page.locator('#mapScreen').isVisible(), true);
  assert.equal(await page.locator('#gpsCanvas').count(),1,
    'The transparent navigator must be part of the game HUD');
  await page.locator('#gpsDestination').selectOption('service');
  await page.locator('#gpsGo').click();
  assert.equal(await page.locator('#pauseScreen').isVisible(),true,
    'Selecting a route should return to pause, ready to drive');
  assert.equal(await page.locator('#gpsReference').evaluate(el=>el.classList.contains('hidden')),true);
  await page.locator('#resumeButton').click();
  await page.waitForFunction(()=>document.querySelector('#gpsStatus')?.textContent.includes('ÁREA DE SERVIÇO'),
    null,{timeout:10000});
  assert.ok(await page.locator('#gpsReference').evaluate(img=>img.complete&&img.naturalWidth>0),
    'Original transparent GPS graphic should load even when the live route is shown');
  await page.keyboard.press('Escape');
  await page.locator('#mapPause').click();
  await page.locator('#gpsClear').click();
  assert.equal(await page.locator('#gpsReference').evaluate(el=>el.classList.contains('hidden')),false);
  await page.locator('#mapScreen [data-ui-back]').click();
  assert.equal(await page.locator('#pauseScreen').isVisible(), true);
  await page.locator('#resumeButton').click();
  assert.equal(await page.locator('#pauseScreen').isVisible(), false);

  await page.screenshot({ path: '/tmp/corsacars-browser-check.png' });
  assert.deepEqual(browserErrors, [],
    'Unexpected JavaScript/browser errors. HTTP failures: '+JSON.stringify(failedHttpResponses));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#loading').waitFor({ state:'hidden', timeout:120000 });
  await page.locator('#entryScreen').waitFor({state:'visible'});
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#entryScreen').isVisible(),false,
    'Enter should also dismiss the title page');
  assert.equal(await page.locator('.speed-dial.style-racing').count(),1,
    'HUD style did not survive browser reload');
  assert.equal(await page.locator('#renderScale').inputValue(),'0.75',
    'Resolution scale did not survive browser reload');
  assert.equal(await page.locator('#gamepadDeadzone').inputValue(),'0.2',
    'Gamepad deadzone did not survive browser reload');
  console.log('PASS: WebGL scene loaded, car moved, camera/weather/pause interaction succeeded.');
} finally {
  await browser.close();
}
