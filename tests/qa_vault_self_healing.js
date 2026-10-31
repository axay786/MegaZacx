const assert = require('assert');
const fs = require('fs');
const path = require('path');
const io = require('socket.io-client');
const { createServer } = require('../src/server/server');
const AuthManager = require('../src/server/auth');

async function runTest() {
  console.log('===============================================================');
  console.log('   QA: ACCOUNT SELF-HEALING & CLOUD RESTARTS VERIFICATION       ');
  console.log('===============================================================');

  const TEST_PORT = 3896;
  const TEMP_DIR = path.join(__dirname, 'temp_self_healing');

  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }

  // 1. Initial server instance (simulates initial registration)
  const auth1 = new AuthManager(TEMP_DIR);
  const srv1 = await createServer(TEST_PORT, auth1);
  const server1 = srv1.server;

  const client1 = io(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
  await new Promise(r => client1.on('connect', r));

  let savedAccount = null;

  // Register account "eZacx"
  await new Promise(resolve => {
    client1.emit('auth-register', {
      username: 'eZacx',
      password: 'MySecretPassword123!',
      avatarColor: '#7C3AED'
    }, (res) => {
      assert.strictEqual(res.success, true, 'Registration succeeds');
      assert.ok(res.user.passwordHash, 'Server returns passwordHash for client vault');
      savedAccount = {
        id: res.user.id,
        username: res.user.username,
        avatarColor: res.user.avatarColor,
        token: res.token,
        passwordHash: res.user.passwordHash,
        createdAt: res.user.createdAt
      };
      resolve();
    });
  });

  client1.disconnect();
  server1.close();
  console.log('  ✓ Step 1: Initial registration succeeded and vault record acquired.');

  // 2. SIMULATE RENDER SPINDOWN / REDEPLOY (Fresh server with 0 users in memory and empty disk)
  console.log('\n  -> Simulating Cloud Server spin-down / fresh container restart with empty storage...');
  const FRESH_EMPTY_DIR = path.join(__dirname, 'temp_fresh_empty');
  if (fs.existsSync(FRESH_EMPTY_DIR)) {
    fs.rmSync(FRESH_EMPTY_DIR, { recursive: true, force: true });
  }

  const auth2 = new AuthManager(FRESH_EMPTY_DIR);
  assert.strictEqual(auth2.users.size, 0, 'Server starts with zero users');

  const srv2 = await createServer(TEST_PORT, auth2);
  const server2 = srv2.server;

  const client2 = io(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
  await new Promise(r => client2.on('connect', r));

  // Client 2 connects and syncs its vault with the fresh server
  await new Promise(resolve => {
    client2.emit('auth-sync-vault', { accounts: [savedAccount] }, (res) => {
      assert.strictEqual(res.success, true, 'Vault sync accepted by server');
      assert.strictEqual(res.synced, 1, '1 account restored on server');
      assert.strictEqual(auth2.users.size, 1, 'Server now has 1 user in its directory');
      resolve();
    });
  });
  console.log('  ✓ Step 2: Client self-healed the server; account restored on cloud.');

  // Verify that the restored user can immediately log in on the server
  await new Promise(resolve => {
    client2.emit('auth-login', {
      username: 'eZacx',
      password: 'MySecretPassword123!'
    }, (res) => {
      assert.strictEqual(res.success, true, 'Login succeeds on restarted server without "account does not exist"');
      assert.strictEqual(res.user.username, 'eZacx');
      resolve();
    });
  });
  console.log('  ✓ Step 3: Login on restored server succeeded 100%!');

  // Test 4: Another device (Client 3) logging in to the restored server
  const client3 = io(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
  await new Promise(r => client3.on('connect', r));

  await new Promise(resolve => {
    client3.emit('auth-login', {
      username: 'eZacx',
      password: 'MySecretPassword123!'
    }, (res) => {
      assert.strictEqual(res.success, true, 'Client 3 (Device 2) logs into restored account successfully');
      resolve();
    });
  });
  console.log('  ✓ Step 4: Second device successfully logged into the cloud account!');

  // Clean up
  client2.disconnect();
  client3.disconnect();
  server2.close();

  if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  if (fs.existsSync(FRESH_EMPTY_DIR)) fs.rmSync(FRESH_EMPTY_DIR, { recursive: true, force: true });

  console.log('\n===============================================================');
  console.log('🎉 ALL SELF-HEALING & CLOUD RESTARTS TESTS PASSED (100%)!');
  console.log('===============================================================');
}

runTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
