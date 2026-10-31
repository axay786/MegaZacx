const { app, BrowserWindow, ipcMain, session, clipboard, Tray, Menu } = require('electron');
const path = require('path');
const { createServer, getLocalIpAddresses } = require('../server/server');
const updater = require('./updater');

let mainWindow = null;
let serverInstance = null;
let serverPort = 3888;
let serverIps = [];
let tray = null;
let closeToTray = false; // Default: close completely (do not minimize to tray)
let isQuitting = false;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-speech-api');
app.commandLine.appendSwitch('disable-renderer-accessibility');

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
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
  if (app.isPackaged) return;
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

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'icon.ico');
  try {
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open MegaZacx',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit MegaZacx',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('MegaZacx (Voice & Text)');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });

    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.warn('[Main Process] Failed to initialize system tray icon:', err.message);
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
      sandbox: false,
      backgroundThrottling: true,
      spellcheck: false
    }
  });

  // Grant microphone and audio capture automatically
  // Grant microphone, media, and speaker selection automatically
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem' || permission === 'audio-capture' || permission === 'microphone' || permission === 'speaker-selection') {
      return callback(true);
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media' || permission === 'mediaKeySystem' || permission === 'audio-capture' || permission === 'microphone' || permission === 'speaker-selection') {
      return true;
    }
    return false;
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('close', (event) => {
    if (!isQuitting && closeToTray) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

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

// Auto-Updater IPC Handlers
ipcMain.handle('check-for-updates', async () => {
  return await updater.checkForUpdates();
});

ipcMain.handle('perform-update', async () => {
  return await updater.performUpdate(app);
});

ipcMain.handle('get-app-version', () => {
  return updater.getCurrentVersion();
});

// Close Action & System Tray IPC Handlers
ipcMain.on('set-close-to-tray', (event, enabled) => {
  closeToTray = Boolean(enabled);
  if (closeToTray && !tray) {
    createTray();
  }
});

ipcMain.handle('get-close-to-tray', () => {
  return closeToTray;
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
  if (mainWindow) {
    if (closeToTray && !isQuitting) {
      mainWindow.hide();
    } else {
      mainWindow.close();
    }
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (tray) {
    tray.destroy();
    tray = null;
  }
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
  if (!closeToTray || isQuitting) {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }
});
