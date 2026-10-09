'use strict';

// Read-only, narrow IPC bridge. Web game scripts never receive Node/Electron APIs.
const { contextBridge, ipcRenderer } = require('electron');

const ACTIONS = Object.freeze({
  check: 'corsacars:update-check',
  download: 'corsacars:update-download',
  install: 'corsacars:update-install'
});

contextBridge.exposeInMainWorld('corsacarsDesktop', Object.freeze({
  platform: 'windows',
  version: () => ipcRenderer.invoke('corsacars:update-state'),
  checkUpdates: () => ipcRenderer.invoke(ACTIONS.check),
  downloadUpdate: () => ipcRenderer.invoke(ACTIONS.download),
  installUpdate: () => ipcRenderer.invoke(ACTIONS.install),
  onUpdate: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => {
      // Only serialisable, plain status data can cross this bridge.
      callback({
        state: String(data?.state || 'idle'),
        version: String(data?.version || ''),
        nextVersion: String(data?.nextVersion || ''),
        progress: Number(data?.progress) || 0,
        message: String(data?.message || '')
      });
    };
    ipcRenderer.on('corsacars:update-status', listener);
    return () => ipcRenderer.removeListener('corsacars:update-status', listener);
  }
}));
