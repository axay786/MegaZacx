const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const path = require('path');
const { createServer } = require('../src/server/server');

let mainWindow = null;
let serverInstance = null;
let srvPort = 3889;

// IPC Handlers
ipcMain.handle('get-server-info', () => {
  return {
    port: srvPort,
    localIps: ['192.168.1.2', '127.0.0.1']
  };
});

ipcMain.handle('copy-text', (event, text) => {
  if (typeof text === 'string') {
    clipboard.writeText(text);
    return true;
  }
  return false;
});

ipcMain.handle('read-clipboard-text', async () => {
  return await clipboard.readText();
});

async function runQA() {
  console.log('====================================');
  console.log('   MegaZacx QA: Toast & Clipboard   ');
  console.log('====================================');

  const srv = await createServer(srvPort);
  serverInstance = srv.server;
  console.log('[QA] Test server running on port', srvPort);

  mainWindow = new BrowserWindow({
    width: 1260,
    height: 820,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.on('console-message', (e, level, msg) => {
    console.log('[Renderer Console]', msg);
  });

  await mainWindow.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  console.log('[QA] App loaded in BrowserWindow');

  await new Promise(r => setTimeout(r, 1200));

  // TEST 1: Check Toast CSS positioning and layout geometry
  console.log('\n--- TEST 1: Toast Position & Overlap QA ---');
  const geom = await mainWindow.webContents.executeJavaScript(`
    (() => {
      const toast = document.getElementById('app-toast');
      const chatInput = document.getElementById('chat-input');
      const inputWrapper = document.querySelector('.chat-input-wrapper');
      
      const toastStyle = window.getComputedStyle(toast);
      
      // Temporarily unhide toast to measure its active rendered box
      toast.classList.remove('hidden');
      const toastRect = toast.getBoundingClientRect();
      const inputRect = chatInput.getBoundingClientRect();
      const wrapperRect = inputWrapper.getBoundingClientRect();
      
      // Check for geometric intersection (overlap)
      const overlapsInput = !(
        toastRect.right < inputRect.left ||
        toastRect.left > inputRect.right ||
        toastRect.bottom < inputRect.top ||
        toastRect.top > inputRect.bottom
      );
      
      const overlapsWrapper = !(
        toastRect.right < wrapperRect.left ||
        toastRect.left > wrapperRect.right ||
        toastRect.bottom < wrapperRect.top ||
        toastRect.top > wrapperRect.bottom
      );

      // Re-hide toast
      toast.classList.add('hidden');

      return {
        top: toastStyle.top,
        bottom: toastStyle.bottom,
        right: toastStyle.right,
        left: toastStyle.left,
        pointerEvents: toastStyle.pointerEvents,
        toastY: toastRect.top,
        toastBottom: toastRect.bottom,
        toastRight: toastRect.right,
        inputY: inputRect.top,
        overlapsInput,
        overlapsWrapper
      };
    })()
  `);

  console.log('[QA] Toast computed top:', geom.top);
  console.log('[QA] Toast computed bottom:', geom.bottom);
  console.log('[QA] Toast computed right:', geom.right);
  console.log('[QA] Toast pointerEvents:', geom.pointerEvents);
  console.log('[QA] Toast Y position:', geom.toastY, 'px (should be ~48px)');
  console.log('[QA] Input area Y position:', geom.inputY, 'px (should be >700px near window bottom)');
  console.log('[QA] Overlaps message input box?:', geom.overlapsInput);
  console.log('[QA] Overlaps chat input wrapper?:', geom.overlapsWrapper);

  if (geom.overlapsInput || geom.overlapsWrapper) {
    console.error('FAIL: Toast overlaps the text input area!');
    process.exit(1);
  }
  if (geom.toastY > 150) {
    console.error('FAIL: Toast is not in top region, toastY =', geom.toastY);
    process.exit(1);
  }
  console.log('PASS: Toast is floating at top-right (top=' + geom.toastY + 'px), completely clear of bottom input (Y=' + geom.inputY + 'px)');

  // TEST 2: Test Clipboard Copy from bottom Voice Bar button
  console.log('\n--- TEST 2: Copy Voice Link from Voice Bar ---');
  clipboard.writeText('');
  console.log('[QA] Initial clipboard content cleared');

  await mainWindow.webContents.executeJavaScript(`
    (() => {
      const btn = document.getElementById('btn-copy-voice-bar');
      btn.click();
    })()
  `);

  await new Promise(r => setTimeout(r, 600));

  const copiedVoiceUrl = await clipboard.readText();
  console.log('[QA] Clipboard content after clicking Voice Bar button:', copiedVoiceUrl);
  if (!copiedVoiceUrl || (!copiedVoiceUrl.startsWith('http://') && !copiedVoiceUrl.startsWith('https://'))) {
    console.error('FAIL: Clipboard did not receive valid URL. Got:', copiedVoiceUrl);
    process.exit(1);
  }
  console.log('PASS: Voice Bar button copied valid URL to clipboard:', copiedVoiceUrl);

  // TEST 3: Test Clipboard Copy from Stage Header button
  console.log('\n--- TEST 3: Copy Voice Invite from Stage Header ---');
  clipboard.writeText('');
  await mainWindow.webContents.executeJavaScript(`
    (() => {
      const btn = document.getElementById('btn-copy-stage-invite');
      btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 600));
  const copiedStageUrl = await clipboard.readText();
  console.log('[QA] Clipboard content after clicking Stage Header button:', copiedStageUrl);
  if (!copiedStageUrl || (!copiedStageUrl.startsWith('http://') && !copiedStageUrl.startsWith('https://'))) {
    console.error('FAIL: Stage header copy failed! Got:', copiedStageUrl);
    process.exit(1);
  }
  console.log('PASS: Stage header button copied valid URL to clipboard:', copiedStageUrl);

  // TEST 4: Test Clipboard Copy in Invite Friends Modal
  console.log('\n--- TEST 4: Copy from Invite Friends Modal ---');
  clipboard.writeText('');
  await mainWindow.webContents.executeJavaScript(`
    (() => {
      const btn = document.getElementById('btn-copy-invite-lan');
      btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 600));
  const copiedModalUrl = await clipboard.readText();
  console.log('[QA] Clipboard content after clicking Modal Copy button:', copiedModalUrl);
  if (!copiedModalUrl || (!copiedModalUrl.startsWith('http://') && !copiedModalUrl.startsWith('https://'))) {
    console.error('FAIL: Modal copy failed! Got:', copiedModalUrl);
    process.exit(1);
  }
  console.log('PASS: Modal copy button copied valid URL to clipboard:', copiedModalUrl);

  console.log('\n====================================');
  console.log('   ALL 4 QA TESTS PASSED CLEANLY!   ');
  console.log('====================================');

  if (serverInstance) serverInstance.close();
  app.quit();
  process.exit(0);
}

app.whenReady().then(runQA);
