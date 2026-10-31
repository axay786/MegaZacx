const { app, BrowserWindow, session, ipcMain, clipboard } = require('electron');
const path = require('path');
const { createServer } = require('../src/server/server');

let testServer = null;
let testPort = 3899;

ipcMain.handle('get-server-info', () => ({
  port: testPort,
  localIps: ['127.0.0.1']
}));

ipcMain.handle('copy-text', (event, text) => {
  if (typeof text === 'string') {
    clipboard.writeText(text);
    return true;
  }
  return false;
});

ipcMain.handle('read-clipboard-text', async () => clipboard.readText());
ipcMain.handle('get-app-version', () => ({ version: '1.0.2', commit: 'qa-test' }));
ipcMain.handle('check-for-updates', () => ({ success: true, updateAvailable: false }));
ipcMain.handle('perform-update', () => ({ success: true }));

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

async function runQA() {
  console.log('======================================================');
  console.log('   QA: Multi-Device Voice Input & Detection Suite     ');
  console.log('======================================================');

  const srvRes = await createServer(testPort);
  testServer = srvRes.server;
  testPort = srvRes.port;
  console.log('[QA] Test server running on port:', testPort);

  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(true));
  session.defaultSession.setPermissionCheckHandler(() => true);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../src/main/preload.js'),
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));

  // Wait for initial DOM, audio probe, and socket connection
  await new Promise(r => setTimeout(r, 1500));

  const results = await win.webContents.executeJavaScript(`
    (async () => {
      const mz = window.__megaZacx;
      const suite = [];

      // TEST 1: Device Enumeration & Friendly Labels
      const selectMic = document.getElementById('select-audio-input');
      const selectOut = document.getElementById('select-audio-output');
      const statusCaption = document.getElementById('mic-device-status');

      suite.push({
        test: '1. Device dropdowns populated with friendly labels',
        hasMicSelect: Boolean(selectMic),
        hasOutSelect: Boolean(selectOut),
        micOptionsCount: selectMic ? selectMic.options.length : 0,
        outOptionsCount: selectOut ? selectOut.options.length : 0,
        statusText: statusCaption ? statusCaption.textContent : '',
        micLabels: selectMic ? Array.from(selectMic.options).map(o => ({ value: o.value, text: o.textContent })) : []
      });

      // TEST 2: Multi-device fail-safe capture (ideal vs invalid deviceId)
      // Call startLocalAudio with a non-existent device ID
      localStorage.setItem('megazacx_selected_mic', 'fake-disconnected-device-id-999');
      let streamFallbackSuccess = false;
      let activeTrackLabel = '';
      try {
        const stream = await mz.startLocalAudio();
        if (stream && stream.active && stream.getAudioTracks().length > 0) {
          streamFallbackSuccess = true;
          activeTrackLabel = stream.getAudioTracks()[0].label;
        }
      } catch (err) {
        streamFallbackSuccess = false;
      }

      suite.push({
        test: '2. Fail-safe audio capture on invalid/disconnected device',
        passed: streamFallbackSuccess,
        activeTrackLabel
      });

      // TEST 3: Hot-swapping device in active voice channel
      let joinSuccess = false;
      try {
        await mz.handleJoinVoice('voice-general');
        joinSuccess = (mz.state.activeVoiceChannel === 'voice-general' && mz.state.localStream !== null);
      } catch (e) {}

      // Switch device to default or first available device
      let swapSuccess = false;
      try {
        const targetDev = selectMic && selectMic.options.length > 1 ? selectMic.options[1].value : '';
        await mz.switchLocalAudioDevice(targetDev);
        swapSuccess = Boolean(mz.state.localStream && mz.state.localStream.active && mz.state.selectedAudioInput === targetDev);
      } catch (e) {
        swapSuccess = false;
      }

      suite.push({
        test: '3. Live voice channel join & device hot-swapping',
        joinedVoice: joinSuccess,
        swappedLive: swapSuccess
      });

      // TEST 4: Voice Activity Detection (Speaking detection)
      let vadRunning = false;
      if (mz.state.analyser && mz.state.audioContext) {
        vadRunning = (mz.state.audioContext.state === 'running');
      }

      suite.push({
        test: '4. Voice Activity Detection (VAD) audio analyser active',
        vadRunning
      });

      // TEST 5: Settings Mic Test & VU Meter
      let micTestSuccess = false;
      try {
        await mz.startMicTest();
        micTestSuccess = Boolean(mz.state.isTestingMic && mz.state.testStream && mz.state.testStream.active);
        mz.stopMicTest();
      } catch (e) {
        micTestSuccess = false;
      }

      suite.push({
        test: '5. Settings Mic Test & VU meter stream initialization',
        micTestSuccess
      });

      // TEST 6: Audio Output Device selection
      let outSelectSuccess = false;
      try {
        const outTarget = selectOut && selectOut.options.length > 1 ? selectOut.options[1].value : '';
        await mz.setAudioOutputDevice(outTarget);
        outSelectSuccess = (localStorage.getItem('megazacx_selected_output') === outTarget);
      } catch (e) {}

      suite.push({
        test: '6. Audio Output device routing & persistence',
        outSelectSuccess
      });

      // Clean up voice
      mz.handleLeaveVoice(false);

      return suite;
    })()
  `);

  console.log('\n--- DETAILED QA TEST REPORT ---');
  let allPassed = true;
  for (const item of results) {
    console.log(`\n▶ ${item.test}:`);
    console.log(' ', JSON.stringify(item, null, 2));
    if (item.test.startsWith('1.')) {
      if (!item.hasMicSelect || item.micOptionsCount === 0) allPassed = false;
    } else if (item.test.startsWith('2.')) {
      if (!item.passed) allPassed = false;
    } else if (item.test.startsWith('3.')) {
      if (!item.joinedVoice || !item.swappedLive) allPassed = false;
    } else if (item.test.startsWith('4.')) {
      if (!item.vadRunning) allPassed = false;
    } else if (item.test.startsWith('5.')) {
      if (!item.micTestSuccess) allPassed = false;
    } else if (item.test.startsWith('6.')) {
      if (!item.outSelectSuccess) allPassed = false;
    }
  }

  console.log('\n======================================================');
  if (allPassed) {
    console.log('🎉 ALL MULTI-DEVICE VOICE INPUT TESTS PASSED (6/6)!');
    console.log('======================================================');
  } else {
    console.error('❌ SOME TESTS FAILED!');
    console.log('======================================================');
  }

  if (testServer) testServer.close();
  app.quit();
  process.exit(allPassed ? 0 : 1);
}

app.whenReady().then(runQA);
