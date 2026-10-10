'use strict';

// Windows desktop updater. Release metadata and SHA-512 file hashes are provided
// by electron-builder/electron-updater over GitHub Releases HTTPS.
// Updates are offered, NEVER installed without the player's confirmation.
const { autoUpdater } = require('electron-updater');

function setupUpdates({ app, ipcMain, getWindow }) {
  const canUpdate = app.isPackaged && process.platform === 'win32';
  let status = { state: canUpdate ? 'idle' : 'unavailable', version: app.getVersion() };
  let checking = null;
  let downloading = false;
  let downloaded = false;

  function send(state, extra = {}) {
    status = { state, version: app.getVersion(), ...extra };
    const window = getWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send('corsacars:update-status', status);
    }
    return status;
  }

  function trusted(event) {
    return event.sender === getWindow()?.webContents
      && event.senderFrame?.url?.startsWith('corsacars://game/');
  }

  async function check(silent = true) {
    if (!canUpdate) return send('unavailable');
    if (checking) return checking;
    if (downloading || downloaded) return status;
    send('checking');
    checking = autoUpdater.checkForUpdates().then(result => {
      // The library emits update-available/update-not-available asynchronously.
      return status;
    }).catch(error => {
      console.warn('[CORSACARS] Falha ao procurar atualizações:', error?.message);
      send('error', { message: 'Falha ao consultar as versões publicadas. Verifica a Internet e o GitHub Releases.' });
      return status;
    }).finally(() => { checking = null; });
    return checking;
  }

  async function download() {
    if (!canUpdate || downloaded) return status;
    if (downloading || status.state !== 'available') return status;
    downloading = true;
    send('downloading', { progress: 0 });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      downloading = false;
      send('error', { message: 'O download falhou. Verifica a ligação e tenta novamente.' });
      console.warn('[CORSACARS] Download da atualização falhou:', error?.message);
    }
    return status;
  }

  function install() {
    if (!canUpdate || !downloaded) return { ok: false };
    // quitAndInstall() closes the game; do not auto-restart without user consent.
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { ok: true };
  }

  ipcMain.handle('corsacars:update-state', event =>
    trusted(event) ? status : { state: 'unavailable' });
  ipcMain.handle('corsacars:update-check', event =>
    trusted(event) ? check(false) : { state: 'unavailable' });
  ipcMain.handle('corsacars:update-download', event =>
    trusted(event) ? download() : { state: 'unavailable' });
  ipcMain.handle('corsacars:update-install', event =>
    trusted(event) ? install() : { ok: false });

  if (!canUpdate) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', info =>
    send('available', { nextVersion: info.version }));
  autoUpdater.on('update-not-available', () =>
    send('current'));
  autoUpdater.on('download-progress', info =>
    send('downloading', {
      progress: Math.min(100, Math.max(0, Math.round(info.percent || 0))),
      nextVersion: status.nextVersion
    }));
  autoUpdater.on('update-downloaded', info => {
    downloaded = true;
    downloading = false;
    send('ready', { nextVersion: info.version });
  });
  autoUpdater.on('error', error => {
    downloading = false;
    console.warn('[CORSACARS] Serviço de atualização:', error?.message);
    // Failed startup checks must be visible in Settings rather than remain
    // permanently "idle" until the next hourly poll.
    if (status.state !== 'ready' && status.state !== 'current') {
      send('error', { message: 'Não foi possível contactar o servidor de atualizações. Volta a tentar nas Definições.' });
    }
  });

  // Startup delay prevents update checks from blocking boot/WebGL initialisation.
  const initial = setTimeout(() => { void check(true); }, 8000);
  // New GitHub builds can take a while to publish. Retry automatically even
  // if the first check happened before the release completed.
  const interval = setInterval(() => { void check(true); }, 15 * 60 * 1000);
  app.on('before-quit', () => {
    clearTimeout(initial);
    clearInterval(interval);
  });
}

module.exports = { setupUpdates };
