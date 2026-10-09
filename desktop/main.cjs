'use strict';

// CORSACARS desktop: a packaged Windows game using local code, not a site shortcut.
const { app, BrowserWindow, protocol } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const SCHEME = 'corsacars';
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: {
    standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true
  } }
]);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.hdr': 'application/octet-stream',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml'
};

async function loadLocalAsset(request) {
  const root = path.resolve(app.getAppPath(), 'dist');
  try {
    const requestUrl = new URL(request.url);
    if (requestUrl.hostname !== 'game') return new Response('Forbidden', { status: 403 });
    const pathname = decodeURIComponent(requestUrl.pathname);
    const filename = path.resolve(root, '.' + pathname);
    if (filename !== root && !filename.startsWith(root + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    const bytes = await readFile(filename);
    const contentType = types[path.extname(filename).toLowerCase()] || 'application/octet-stream';
    return new Response(bytes, {
      status: 200, headers: {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (error) {
    if (error.code === 'ENOENT') return new Response('Not Found', { status: 404 });
    console.error('[CORSACARS] Erro a abrir ficheiro local:', error);
    return new Response('Internal Error', { status: 500 });
  }
}

let gameWindow = null;
function createWindow() {
  gameWindow = new BrowserWindow({
    title: 'CORSACARS — Open Road',
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#08121b',
    autoHideMenuBar: true,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });
  gameWindow.setMenuBarVisibility(false);
  gameWindow.once('ready-to-show', () => gameWindow?.show());
  gameWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  gameWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(SCHEME + '://game/')) event.preventDefault();
  });
  gameWindow.on('closed', () => { gameWindow = null; });
  void gameWindow.loadURL(SCHEME + '://game/desktop/index.html').catch(error => {
    console.error('[CORSACARS] Não foi possível iniciar o jogo:', error);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!gameWindow) return;
    if (gameWindow.isMinimized()) gameWindow.restore();
    gameWindow.focus();
  });
  app.whenReady().then(() => {
    protocol.handle(SCHEME, loadLocalAsset);
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
