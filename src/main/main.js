const { app, BrowserWindow, ipcMain, session, clipboard } = require('electron');
const path = require('path');
const { createServer, getLocalIpAddresses } = require('../server/server');

let mainWindow = null;
let serverInstance = null;
let serverPort = 3888;
let serverIps = [];

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function initServer() {
  try {
    const res = await createServer(serverPort);
    serverInstance = res.server;
    serverPort = res.port;
    serverIps = res.ips;
    console.log('[Main Process] Embedded server running on port:', serverPort);
  } catch (err) {
    console.error('[Main Process] Failed to launch embedded server:', err);
  }
}


function ensureDesktopShortcut() {
  if (process.platform !== 'win32') return;
  try {
    const fs = require('fs');
    const desktop = app.getPath('desktop');
    const lnkPath = path.join(desktop, 'MegaZacx.lnk');
    if (!fs.existsSync(lnkPath)) {
      const rootDir = path.resolve(__dirname, '..', '..');
      const iconPath = path.join(rootDir, 'src', 'renderer', 'assets', 'icon.ico');
      const { shell } = require('electron');
      shell.writeShortcutLink(lnkPath, 'create', {
        target: process.execPath,
        args: `"${rootDir}"`,
        cwd: rootDir,
        icon: iconPath,
        iconIndex: 0,
        description: 'MegaZacx - Voice and Text Chat'
      });
      console.log('[Main Process] Automatically created desktop shortcut at:', lnkPath);
    }
  } catch (err) {
    console.warn('[Main Process] Could not auto-create desktop shortcut:', err);
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 1260,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    frame: false,
    title: 'MegaZacx (eZacx-Comm)',
    backgroundColor: '#0F172A',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Grant microphone and audio capture automatically
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem' || permission === 'audio-capture') {
      return callback(true);
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media' || permission === 'mediaKeySystem' || permission === 'audio-capture') {
      return true;
    }
    return false;
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers

// Clipboard IPC Handlers
ipcMain.handle('copy-text', (event, text) => {
  if (typeof text === 'string') {
    clipboard.writeText(text);
    return true;
  }
  return false;
});

ipcMain.handle('read-clipboard-text', () => {
  return clipboard.readText();
});

ipcMain.handle('get-server-info', () => {
  return {
    port: serverPort,
    localIps: serverIps && serverIps.length ? serverIps : getLocalIpAddresses()
  };
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

app.whenReady().then(async () => {
  await initServer();
  ensureDesktopShortcut();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      ensureDesktopShortcut();
  createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
