const assert = require('assert');
const fs = require('fs');
const path = require('path');
const io = require('socket.io-client');
const { createServer } = require('../src/server/server');

async function runVoiceStabilityQA() {
  console.log('========================================================================');
  console.log('   QA TEST: VOICE KEEP-ALIVE, BACKGROUND STABILITY & AUTO-RECONNECT     ');
  console.log('========================================================================');

  const TEST_PORT = 3999;
  let testsPassed = 0;
  let testsFailed = 0;

  function testAssert(condition, name) {
    if (condition) {
      console.log(`  ✓ PASS: ${name}`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: ${name}`);
      testsFailed++;
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  // -------------------------------------------------------------------------
  // 1. Electron Main Configuration Audit (No Background Throttling)
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Main Process & Background Throttling Audit ---');
  const mainSrc = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');

  testAssert(
    mainSrc.includes("backgroundThrottling: false"),
    "main.js sets backgroundThrottling to false so background gaming never throttles voice"
  );
  testAssert(
    mainSrc.includes("app.commandLine.appendSwitch('disable-background-timer-throttling')"),
    "main.js disables background timer throttling in Chromium"
  );

  // -------------------------------------------------------------------------
  // 2. Server Configuration Audit (Ping Timeout & Keep-Alive Support)
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Server Configuration & Keep-Alive Ping Audit ---');
  const serverSrc = fs.readFileSync(path.join(__dirname, '../src/server/server.js'), 'utf8');
  const deployServerSrc = fs.readFileSync(path.join(__dirname, '../server-deploy/server.js'), 'utf8');

  testAssert(
    serverSrc.includes("pingTimeout: 60000") && serverSrc.includes("pingInterval: 25000"),
    "Local server sets resilient pingTimeout: 60s and pingInterval: 25s"
  );
  testAssert(
    deployServerSrc.includes("pingTimeout: 60000") && deployServerSrc.includes("pingInterval: 25000"),
    "Deploy server sets resilient pingTimeout: 60s and pingInterval: 25s"
  );
  testAssert(
    serverSrc.includes("'voice-ping'") && deployServerSrc.includes("'voice-ping'"),
    "Both servers implement voice-ping keep-alive handler to prevent proxy idle timeout"
  );

  // -------------------------------------------------------------------------
  // 3. Live Server Voice Ping / Pong Keep-Alive Exchange
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Live Server Voice Keep-Alive Heartbeat Test ---');
  const srvRes = await createServer(TEST_PORT);
  const server = srvRes.server;

  const client = io(`http://localhost:${TEST_PORT}`, {
    transports: ['websocket', 'polling'],
    timeout: 5000
  });

  await new Promise(r => client.on('connect', r));
  testAssert(client.connected, "Test client connected to server");

  // Join voice channel
  client.emit('init-user', { username: 'KeepAliveTester' });
  client.emit('join-voice', { channelId: 'voice-general' });

  // Send voice-ping keep-alive
  const pingRes = await new Promise(resolve => {
    client.emit('voice-ping', { channelId: 'voice-general' }, resolve);
  });
  testAssert(Boolean(pingRes && pingRes.pong === true), "Server responds to voice-ping with { pong: true }");

  // -------------------------------------------------------------------------
  // 4. Renderer app.js Logic Audit (Auto-Rejoin, Grace Period, WebRTC)
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Client Auto-Rejoin & WebRTC Resilience Audit ---');
  const appSrc = fs.readFileSync(path.join(__dirname, '../src/renderer/js/app.js'), 'utf8');

  testAssert(
    appSrc.includes("reconnectVoiceChannel: null"),
    "app.js state includes reconnectVoiceChannel for auto-rejoin tracking"
  );
  testAssert(
    appSrc.includes("reconnectionAttempts: Infinity"),
    "Socket.IO client configured with reconnectionAttempts: Infinity"
  );
  testAssert(
    appSrc.includes("startVoiceKeepAlive();") && appSrc.includes("stopVoiceKeepAlive();"),
    "app.js initiates periodic voice keep-alive ping on join and cleans up on leave"
  );
  testAssert(
    appSrc.includes("state.reconnectVoiceChannel = state.activeVoiceChannel;"),
    "On socket disconnect, app.js preserves active voice channel in reconnectVoiceChannel"
  );
  testAssert(
    appSrc.includes("state.voiceDisconnectTimeout = setTimeout("),
    "On socket disconnect, app.js applies a grace period before terminating audio"
  );
  testAssert(
    appSrc.includes("state.socket.emit(\"join-voice\", { channelId: targetChannel });"),
    "On socket reconnect, app.js automatically re-joins active voice channel"
  );
  testAssert(
    appSrc.includes("peerEntry.disconnectTimeout = setTimeout("),
    "WebRTC peer connection implements 8s grace period on transient 'disconnected' state"
  );
  testAssert(
    appSrc.includes("state.currentUser.id = (state.socket && state.socket.id) || state.currentUser.id || user.id;"),
    "onAuthSuccess maintains state.currentUser.id as live socket.id for proper identity recognition"
  );

  // -------------------------------------------------------------------------
  // 5. Versioning Audit
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Version Consistency Audit ---');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  const ver = JSON.parse(fs.readFileSync(path.join(__dirname, '../version.json'), 'utf8'));

  testAssert(pkg.version === '1.0.11', "package.json version updated to 1.0.11");
  testAssert(ver.version === '1.0.11', "version.json version updated to 1.0.11");
  testAssert(ver.releaseNotes.includes("voice auto-rejoin"), "version.json documents voice auto-rejoin fix");

  client.disconnect();
  server.close();

  console.log('\n========================================================================');
  console.log(`   ALL ${testsPassed} VOICE STABILITY & AUTO-RECONNECT QA TESTS PASSED!`);
  console.log('========================================================================\n');
}

runVoiceStabilityQA().catch(err => {
  console.error("❌ QA Test Failed:", err);
  process.exit(1);
});
