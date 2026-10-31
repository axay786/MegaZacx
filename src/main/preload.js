const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('megaZacxAPI', {
  isElectron: true,
  getServerInfo: () => ipcRenderer.invoke('get-server-info'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  copyText: (text) => {
    try {
      clipboard.writeText(text);
      return true;
    } catch (e) {
      ipcRenderer.invoke('copy-text', text);
      return true;
    }
  },
  readClipboard: async () => {
    try {
      return clipboard.readText();
    } catch (e) {
      return await ipcRenderer.invoke('read-clipboard-text');
    }
  },
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  performUpdate: () => ipcRenderer.invoke('perform-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  setCloseToTray: (enabled) => ipcRenderer.send('set-close-to-tray', enabled),
  getCloseToTray: () => ipcRenderer.invoke('get-close-to-tray'),
  saveAccountVault: (accounts) => ipcRenderer.invoke('save-account-vault', accounts),
  loadAccountVault: () => ipcRenderer.invoke('load-account-vault')
});
