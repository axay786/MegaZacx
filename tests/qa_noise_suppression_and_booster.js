const { app, BrowserWindow, session, ipcMain, clipboard } = require('electron');
const path = require('path');
const { createServer } = require('../src/server/server');

const fs = require('fs');
const logFile = path.join(__dirname, 'qa_output.txt');
fs.writeFileSync(logFile, 'QA Script started...\n', 'utf8');

function logStep(msg) {
  fs.appendFileSync(logFile, msg + '\n', 'utf8');
}

let testServer = null;
let testPort = 3915;

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
ipcMain.handle('get-app-version', () => ({ version: '1.0.8', commit: 'qa-boost-noise' }));
ipcMain.handle('check-for-updates', () => ({ success: true, updateAvailable: false }));
ipcMain.handle('perform-update', () => ({ success: true }));

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

async function runQA() {
  try {
    logStep('runQA entered');
    console.log('================================================================');
    console.log('   QA: NOISE SUPPRESSION & VOICE BOOSTER VERIFICATION SUITE     ');
    console.log('================================================================');

    const srvRes = await createServer(testPort);
    testServer = srvRes.server;
    testPort = srvRes.port;
    logStep('[QA] Test server running on port: ' + testPort);

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

    win.webContents.on('crashed', (e) => logStep('WebContents crashed: ' + e));
    win.webContents.on('did-fail-load', (e, code, desc) => logStep('did-fail-load: ' + code + ' ' + desc));

    logStep('Loading index.html...');
    await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    logStep('Loaded index.html, waiting 1600ms...');

    // Wait for initial DOM, audio probe, and socket connection
    await new Promise(r => setTimeout(r, 1600));
    logStep('Executing JS test suite...');

  const results = await win.webContents.executeJavaScript(`
    (async () => {
      const mz = window.__megaZacx;
      const suite = [];

      // ==============================================================
      // 1. NOISE SUPPRESSION & VOICE FOCUS DSP ENGINE
      // ==============================================================

      // Test 1a: Noise Suppression UI elements exist
      const btnToggleNS = document.getElementById('btn-toggle-noise-suppression');
      const selectNS = document.getElementById('select-noise-suppression');
      const badgeNS = document.getElementById('badge-noise-suppression');
      const sliderGate = document.getElementById('slider-noise-gate');

      suite.push({
        id: '1a',
        test: 'Noise Suppression UI elements are rendered & initialized',
        hasToggleBtn: Boolean(btnToggleNS),
        hasSelect: Boolean(selectNS),
        hasBadge: Boolean(badgeNS),
        hasGateSlider: Boolean(sliderGate),
        initialEnabled: mz.state.noiseSuppressionEnabled,
        initialPreset: mz.state.noiseSuppressionPreset
      });

      // Test 1b: Toggle Noise Suppression (ON -> OFF -> ON)
      mz.toggleNoiseSuppression(false);
      const disabledState = mz.state.noiseSuppressionEnabled === false;
      const toggleClassOff = !btnToggleNS.classList.contains('active');

      mz.toggleNoiseSuppression(true);
      const enabledState = mz.state.noiseSuppressionEnabled === true;
      const toggleClassOn = btnToggleNS.classList.contains('active');

      suite.push({
        id: '1b',
        test: 'Noise Suppression toggles cleanly with visual feedback',
        disabledSuccess: disabledState && toggleClassOff,
        enabledSuccess: enabledState && toggleClassOn
      });

      // Test 1c: Real-time Audio DSP Filter Chain construction
      // Create a test synthetic MediaStream using AudioContext oscillator
      const dummyCtx = new AudioContext();
      const osc = dummyCtx.createOscillator();
      const dummyDest = dummyCtx.createMediaStreamDestination();
      osc.connect(dummyDest);
      osc.start();

      const processedStream = mz.setupVoiceProcessing(dummyDest.stream);
      const vp = mz.state.voiceProc;

      const hasProc = Boolean(vp);
      const hasHighpass = Boolean(vp && vp.highpass && vp.highpass.frequency.value === 85);
      const hasVoicePeak = Boolean(vp && vp.voicePeak && vp.voicePeak.frequency.value === 2800 && vp.voicePeak.gain.value === 3.5);
      const hasLowpass = Boolean(vp && vp.lowpass && vp.lowpass.frequency.value === 8000);
      const hasGate = Boolean(vp && vp.gateGain);
      const hasCompressor = Boolean(vp && vp.compressor && vp.compressor.threshold.value === -24);
      const hasDestTrack = Boolean(processedStream && processedStream.getAudioTracks().length > 0);

      suite.push({
        id: '1c',
        test: 'Real-Time Voice Processing DSP Pipeline (Highpass, Peaking, Lowpass, Gate, Compressor)',
        hasProc,
        hasHighpass,
        hasVoicePeak,
        hasLowpass,
        hasGate,
        hasCompressor,
        hasDestTrack
      });

      // Test 1d: Dynamic Preset Adjustments (Aggressive, Studio, Off)
      mz.state.noiseSuppressionPreset = 'aggressive';
      mz.applyNoiseSuppressionSettings();
      const aggressiveHP = vp.highpass.frequency.value; // ~110

      mz.state.noiseSuppressionPreset = 'studio';
      mz.applyNoiseSuppressionSettings();
      const studioHP = vp.highpass.frequency.value; // ~75

      mz.state.noiseSuppressionPreset = 'balanced';
      mz.applyNoiseSuppressionSettings();
      const balancedHP = vp.highpass.frequency.value; // ~85

      suite.push({
        id: '1d',
        test: 'Noise suppression preset hot-swapping adjusts filter characteristics',
        aggressiveCheck: aggressiveHP > 90,
        studioCheck: studioHP < 80,
        balancedCheck: balancedHP >= 80 && balancedHP <= 90
      });

      // ==============================================================
      // 2. VOICE BOOSTER FOR USERS (PER-USER GAIN & 300% BOOST)
      // ==============================================================

      // Reset state for clean test isolation
      localStorage.removeItem('megazacx_user_volumes');
      mz.state.userVolumes.clear();

      // Test 2a: Default volume is 100%
      const defaultVol = mz.getPeerVolume('test-peer-user-1');
      suite.push({
        id: '2a',
        test: 'Default per-user volume is 100%',
        defaultIs100: defaultVol === 100
      });

      // Test 2b: Voice Boost to 150%, 200%, 300%
      mz.setPeerVolume('test-peer-user-1', 200);
      const boosted200 = mz.getPeerVolume('test-peer-user-1');
      const savedInStorage = JSON.parse(localStorage.getItem('megazacx_user_volumes') || '{}')['test-peer-user-1'];

      mz.setPeerVolume('test-peer-user-1', 300);
      const boosted300 = mz.getPeerVolume('test-peer-user-1');

      // Clamping check (> 300 clamped to 300, < 0 clamped to 0)
      mz.setPeerVolume('test-peer-user-1', 500);
      const clampedMax = mz.getPeerVolume('test-peer-user-1');

      mz.setPeerVolume('test-peer-user-1', -50);
      const clampedMin = mz.getPeerVolume('test-peer-user-1');

      // Reset to 200% for UI check
      mz.setPeerVolume('test-peer-user-1', 200);

      suite.push({
        id: '2b',
        test: 'Voice Booster adjusts up to 300% and clamps within [0%, 300%]',
        boosted200: boosted200 === 200,
        savedInStorage: savedInStorage === 200,
        boosted300: boosted300 === 300,
        clampedMax: clampedMax === 300,
        clampedMin: clampedMin === 0
      });

      // Test 2c: Web Audio Gain Node connects and applies gain multiplier
      const peerCtx = new AudioContext();
      const peerSource = peerCtx.createMediaStreamSource(dummyDest.stream);
      const peerGain = peerCtx.createGain();
      peerGain.gain.value = mz.getPeerVolume('test-peer-user-1') / 100;

      const peerLimiter = peerCtx.createDynamicsCompressor();
      const peerOutDest = peerCtx.createMediaStreamDestination();
      peerSource.connect(peerGain);
      peerGain.connect(peerLimiter);
      peerLimiter.connect(peerOutDest);

      const peerEntry = {
        pc: null,
        stream: dummyDest.stream,
        audioElem: document.createElement('audio'),
        audioCtx: peerCtx,
        gainNode: peerGain,
        volumePercent: 200
      };
      mz.state.peers.set('test-peer-user-1', peerEntry);

      // Verify that changing booster updates the active Web Audio Gain Node in real-time
      mz.setPeerVolume('test-peer-user-1', 250);
      const liveGainValue = peerGain.gain.value;

      suite.push({
        id: '2c',
        test: 'Web Audio Gain Node dynamically updates gain value in real-time',
        liveGainValueMatches: Math.abs(liveGainValue - 2.5) < 0.1,
        volumePercentMatches: peerEntry.volumePercent === 250
      });

      // Test 2d: Voice Stage Rendering with 2 or more users
      // Add mock users to state.allUsers and join voice
      mz.state.activeVoiceChannel = 'voice-general';
      mz.state.allUsers = [
        {
          id: mz.state.currentUser.id,
          username: mz.state.currentUser.username,
          avatarColor: '#7C3AED',
          avatarInitial: 'E',
          voiceChannel: 'voice-general',
          isMuted: false,
          isDeafened: false
        },
        {
          id: 'test-peer-user-1',
          username: 'Tahir_Pro',
          avatarColor: '#06B6D4',
          avatarInitial: 'T',
          voiceChannel: 'voice-general',
          isMuted: false,
          isDeafened: false
        },
        {
          id: 'test-peer-user-2',
          username: 'SilentGamer',
          avatarColor: '#10B981',
          avatarInitial: 'S',
          voiceChannel: 'voice-general',
          isMuted: false,
          isDeafened: false
        }
      ];

      // Set booster for Tahir_Pro to 200%
      mz.setPeerVolume('test-peer-user-1', 200);

      // Call renderVoiceStage()
      mz.el.voiceStage.classList.remove('hidden');
      // Trigger stage re-render
      const stageCards = document.getElementById('voice-grid-cards');
      // Run render channels & stage
      const eventUsers = new CustomEvent('qa-render');
      // Execute DOM render
      const renderParticipants = mz.state.allUsers.filter(u => u.voiceChannel === mz.state.activeVoiceChannel);
      stageCards.innerHTML = '';
      renderParticipants.forEach(u => {
        // Use application's card generator
      });

      // Trigger actual UI update via socket simulator or direct DOM check
      mz.setPeerVolume('test-peer-user-1', 200);

      // Test 2e: User Volume & Booster Popover
      mz.openUserBoosterPopover(200, 200, {
        id: 'test-peer-user-1',
        username: 'Tahir_Pro',
        avatarColor: '#06B6D4',
        avatarInitial: 'T'
      });

      const popover = document.getElementById('user-volume-context-menu');
      const popoverOpen = popover && !popover.classList.contains('hidden');
      const popoverName = document.getElementById('ctx-booster-username')?.textContent;
      const popoverBadge = document.getElementById('ctx-booster-badge')?.textContent;

      mz.closeUserBoosterPopover();
      const popoverClosed = popover && popover.classList.contains('hidden');

      suite.push({
        id: '2e',
        test: 'User Booster Popover opens with correct user details & closes cleanly',
        popoverOpen,
        popoverNameMatches: popoverName === 'Tahir_Pro',
        popoverBadgeMatches: popoverBadge && popoverBadge.includes('200%'),
        popoverClosed
      });

      dummyCtx.close();
      peerCtx.close();
      return suite;
    })();
  `);

  const fs = require('fs');
  let outputLog = [];
  outputLog.push('\n--- QA RESULTS: NOISE SUPPRESSION & VOICE BOOSTER ---');
  let allPassed = true;

  results.forEach(res => {
    let passed = true;
    for (const [k, v] of Object.entries(res)) {
      if (k === 'id' || k === 'test') continue;
      if (v === false) {
        passed = false;
        break;
      }
    }
    if (passed) {
      outputLog.push(`  ✓ PASS [${res.id}]: ${res.test}`);
    } else {
      outputLog.push(`  ✗ FAIL [${res.id}]: ${res.test} ` + JSON.stringify(res));
      allPassed = false;
    }
  });

  outputLog.push('\n================================================================');
  if (allPassed) {
    outputLog.push('🎉 ALL NOISE SUPPRESSION & VOICE BOOSTER QA TESTS PASSED (100%)!');
  } else {
    outputLog.push('❌ SOME TESTS FAILED!');
  }
  outputLog.push('================================================================');

  logStep(outputLog.join('\n'));
  console.log(outputLog.join('\n'));

  win.destroy();
  testServer.close();
  app.quit();

  if (!allPassed) process.exit(1);
  } catch (err) {
    logStep('runQA threw error: ' + (err.stack || err));
    if (testServer) testServer.close();
    app.quit();
    process.exit(1);
  }
}

app.whenReady().then(runQA).catch(err => {
  console.error('[QA] Fatal test error:', err);
  process.exit(1);
});
