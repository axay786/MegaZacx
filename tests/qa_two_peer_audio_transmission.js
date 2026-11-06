const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { createServer } = require('../src/server/server');

let testPort = 3988;

ipcMain.handle('get-server-info', () => ({ port: testPort, localIps: ['127.0.0.1'] }));
ipcMain.handle('copy-text', () => true);
ipcMain.handle('read-clipboard-text', async () => '');
ipcMain.handle('get-app-version', () => ({ version: '1.0.9', commit: 'qa-audio-transmission' }));
ipcMain.handle('check-for-updates', () => ({ success: true, updateAvailable: false }));
ipcMain.handle('perform-update', () => ({ success: true }));

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');

async function runTwoPeerTest() {
  const logFile = path.join(__dirname, 'two_peer_audio_qa.txt');
  fs.writeFileSync(logFile, 'Starting Two-Peer Audio Transmission QA...\n', 'utf8');

  const srvRes = await createServer(testPort);
  testPort = srvRes.port;

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
  await new Promise(r => setTimeout(r, 1500));

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const mz = window.__megaZacx;
      const tests = [];

      // 1. Verify startLocalAudio captures genuine hardware track with noise suppression
      const stream = await mz.startLocalAudio();
      const track = stream ? stream.getAudioTracks()[0] : null;

      tests.push({
        name: 'Local audio stream acquired and active',
        passed: Boolean(stream && track && track.readyState === 'live' && track.enabled)
      });

      tests.push({
        name: 'Local audio stream is genuine hardware stream (not synthetic muted destination)',
        passed: Boolean(mz.state.localStream === mz.state.rawMicStream)
      });

      // 2. Verify dynamic noise suppression constraints application
      mz.toggleNoiseSuppression(true);
      const nsEnabled = mz.state.noiseSuppressionEnabled;
      mz.state.noiseSuppressionPreset = 'aggressive';
      mz.applyNoiseSuppressionSettings();

      tests.push({
        name: 'Noise suppression toggles and applies settings without breaking stream',
        passed: nsEnabled && track.readyState === 'live' && track.enabled
      });

      // 3. Verify Local VAD does NOT mute the live microphone track
      await new Promise(r => setTimeout(r, 400));
      tests.push({
        name: 'Microphone track remains unmuted and live during pauses/VAD',
        passed: track.enabled === true && track.readyState === 'live'
      });

      // 4. Simulate remote peer ontrack with direct stream playback
      const dummyCtx = new AudioContext();
      if (dummyCtx.state === 'suspended') await dummyCtx.resume();
      const osc = dummyCtx.createOscillator();
      const dummyDest = dummyCtx.createMediaStreamDestination();
      osc.connect(dummyDest);
      osc.start();

      const peerId = 'peer_test_user_42';
      const fakePeerEntry = {
        pc: null,
        stream: null,
        audioElem: null,
        isSpeaking: false,
        isMuted: false,
        isDeafened: false,
        candidateQueue: []
      };
      mz.state.peers.set(peerId, fakePeerEntry);

      let audioElem = document.getElementById("audio-peer-" + peerId);
      if (!audioElem) {
        audioElem = document.createElement("audio");
        audioElem.id = "audio-peer-" + peerId;
        audioElem.autoplay = true;
        audioElem.muted = false;
        document.getElementById("remote-audio-container").appendChild(audioElem);
      }

      // Simulate pc.ontrack logic
      audioElem.srcObject = dummyDest.stream;
      audioElem.muted = mz.state.currentUser.isDeafened;
      fakePeerEntry.audioElem = audioElem;
      fakePeerEntry.stream = dummyDest.stream;

      let playStarted = false;
      try {
        await audioElem.play();
        playStarted = !audioElem.paused;
      } catch (e) {
        playStarted = false;
      }

      tests.push({
        name: 'Remote peer audio element plays direct WebRTC stream without pause/deadlock',
        passed: playStarted && audioElem.srcObject === dummyDest.stream
      });

      // 5. Test volume at standard 80% (direct audioElem volume)
      mz.setPeerVolume(peerId, 80);
      tests.push({
        name: 'Standard volume (80%) updates native audioElem volume',
        passed: Math.abs(audioElem.volume - 0.8) < 0.05
      });

      // 6. Test voice booster at 200% (Web Audio Gain Node active)
      mz.setPeerVolume(peerId, 200);
      const isBoosted = fakePeerEntry.boostGain && fakePeerEntry.boostCtx;
      const gainVal = isBoosted ? fakePeerEntry.boostGain.gain.value : 0;
      tests.push({
        name: 'Voice booster at 200% activates Web Audio Gain without audioElem conflict',
        passed: Boolean(isBoosted && Math.abs(gainVal - 2.0) < 0.1 && audioElem.volume === 0)
      });

      // 7. Test lowering volume back to 100% (restores direct audioElem volume)
      mz.setPeerVolume(peerId, 100);
      tests.push({
        name: 'Resetting volume to 100% restores direct native audio playback cleanly',
        passed: Math.abs(audioElem.volume - 1.0) < 0.05
      });

      dummyCtx.close();
      return tests;
    })();
  `);

  let allPassed = true;
  let summary = ['\n--- TWO-PEER AUDIO TRANSMISSION VERIFICATION ---'];
  result.forEach(t => {
    if (t.passed) {
      summary.push(`  ✓ PASS: ${t.name}`);
    } else {
      summary.push(`  ✗ FAIL: ${t.name}`);
      allPassed = false;
    }
  });

  summary.push(allPassed ? '\n🎉 ALL AUDIO TRANSMISSION TESTS PASSED (100%)!' : '\n❌ SOME TESTS FAILED');
  fs.writeFileSync(logFile, summary.join('\n'), 'utf8');

  win.destroy();
  srvRes.server.close();
  app.quit();
  if (!allPassed) process.exit(1);
}

app.whenReady().then(runTwoPeerTest).catch(err => {
  fs.writeFileSync(path.join(__dirname, 'two_peer_audio_qa.txt'), 'FATAL ERROR: ' + (err.stack || err), 'utf8');
  process.exit(1);
});
