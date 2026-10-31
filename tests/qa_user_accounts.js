const fs = require('fs');
const path = require('path');
const io = require('socket.io-client');
const { createServer } = require('../src/server/server');
const AuthManager = require('../src/server/auth');

async function runQA() {
  console.log('===============================================================');
  console.log('   QA TEST SUITE: MULTI-DEVICE USER ACCOUNTS & AUTH VALIDATION ');
  console.log('===============================================================');

  const TEST_PORT = 3895;
  const TEMP_AUTH_DIR = path.join(__dirname, 'temp_auth_data');

  // Clean test directory
  if (fs.existsSync(TEMP_AUTH_DIR)) {
    fs.rmSync(TEMP_AUTH_DIR, { recursive: true, force: true });
  }

  // Create isolated AuthManager & test server instance
  const customAuth = new AuthManager(TEMP_AUTH_DIR);
  const srv = await createServer(TEST_PORT, customAuth);
  const server = srv.server;
  console.log(`[QA] Test server listening on http://localhost:${TEST_PORT} (isolated auth db)`);

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      testPassed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      testFailed++;
    }
  }

  try {
    // -----------------------------------------------------------------
    // TEST 1: Register primary account (eZacx) on Device 1
    // -----------------------------------------------------------------
    console.log('\n--- 1. Register Primary Account (Device 1: Desktop) ---');
    const client1 = io(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
    await new Promise((resolve) => client1.on('connect', resolve));

    let user1Profile = null;
    let user1Token = null;

    await new Promise((resolve) => {
      client1.emit('auth-register', {
        username: 'eZacx',
        password: 'MasterPassword123!',
        avatarColor: '#7C3AED'
      }, (res) => {
        assert(res.success === true, 'Account "eZacx" registered successfully');
        assert(Boolean(res.token && res.token.startsWith('tok_')), 'Session token generated');
        assert(res.user.username === 'eZacx', 'Username correctly matches "eZacx"');
        assert(res.user.avatarColor === '#7C3AED', 'Avatar color matches "#7C3AED"');
        user1Profile = res.user;
        user1Token = res.token;
        resolve();
      });
    });

    // -----------------------------------------------------------------
    // TEST 2: Duplicate Username Validation (Exact & Case-Insensitive)
    // -----------------------------------------------------------------
    console.log('\n--- 2. Duplicate Username Validation (Exact & Case-Insensitive) ---');

    // 2a: Exact duplicate "eZacx"
    await new Promise((resolve) => {
      client1.emit('auth-register', {
        username: 'eZacx',
        password: 'SomeOtherPassword',
        avatarColor: '#06B6D4'
      }, (res) => {
        assert(res.success === false, 'Exact duplicate username "eZacx" rejected');
        assert(res.error.includes('already taken'), 'Error message states username is already taken');
        resolve();
      });
    });

    // 2b: Lowercase duplicate "ezacx"
    await new Promise((resolve) => {
      client1.emit('auth-register', {
        username: 'ezacx',
        password: 'SomeOtherPassword',
        avatarColor: '#06B6D4'
      }, (res) => {
        assert(res.success === false, 'Lowercase duplicate username "ezacx" rejected');
        assert(res.error.includes('already taken'), 'Error message confirms "ezacx" is taken');
        resolve();
      });
    });

    // 2c: Uppercase duplicate "EZACX"
    await new Promise((resolve) => {
      client1.emit('auth-register', {
        username: 'EZACX',
        password: 'SomeOtherPassword',
        avatarColor: '#06B6D4'
      }, (res) => {
        assert(res.success === false, 'Uppercase duplicate username "EZACX" rejected');
        assert(res.error.includes('already taken'), 'Error message confirms "EZACX" is taken');
        resolve();
      });
    });

    // 2d: Duplicate with leading/trailing spaces "  eZacx  "
    await new Promise((resolve) => {
      client1.emit('auth-register', {
        username: '  eZacx  ',
        password: 'SomeOtherPassword',
        avatarColor: '#06B6D4'
      }, (res) => {
        assert(res.success === false, 'Padded duplicate username "  eZacx  " rejected after trimming');
        assert(res.error.includes('already taken'), 'Error confirms duplicate prevented');
        resolve();
      });
    });

    // -----------------------------------------------------------------
    // TEST 3: Invalid Credentials Protection
    // -----------------------------------------------------------------
    console.log('\n--- 3. Invalid Credentials Protection ---');

    // 3a: Wrong password for existing user
    await new Promise((resolve) => {
      client1.emit('auth-login', {
        username: 'eZacx',
        password: 'WrongPassword456!'
      }, (res) => {
        assert(res.success === false, 'Incorrect password rejected');
        assert(res.error.includes('Incorrect password'), 'Error indicates incorrect password');
        resolve();
      });
    });

    // 3b: Non-existent account
    await new Promise((resolve) => {
      client1.emit('auth-login', {
        username: 'NonExistentUser99',
        password: 'SomePassword'
      }, (res) => {
        assert(res.success === false, 'Non-existent username rejected');
        assert(res.error.includes('does not exist'), 'Error indicates account does not exist');
        resolve();
      });
    });

    // -----------------------------------------------------------------
    // TEST 4: Cross-Device Login (Device 2: Laptop)
    // -----------------------------------------------------------------
    console.log('\n--- 4. Cross-Device Identity (Device 2: Laptop Login) ---');
    const client2 = io(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
    await new Promise((resolve) => client2.on('connect', resolve));

    let user2Profile = null;
    let user2Token = null;

    await new Promise((resolve) => {
      client2.emit('auth-login', {
        username: 'eZacx',
        password: 'MasterPassword123!'
      }, (res) => {
        assert(res.success === true, 'Logged into Device 2 with eZacx credentials');
        assert(res.user.id === user1Profile.id, 'Device 2 received identical persistent account ID as Device 1');
        assert(res.user.username === 'eZacx', 'Device 2 identity matches "eZacx"');
        user2Profile = res.user;
        user2Token = res.token;
        resolve();
      });
    });

    // -----------------------------------------------------------------
    // TEST 5: Cross-Device Message Provenance & Sender ID Alignment
    // -----------------------------------------------------------------
    console.log('\n--- 5. Cross-Device Message Provenance & Account Alignment ---');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for receive-message')), 4000);
      client1.on('receive-message', (msg) => {
        if (msg.text === 'Cross-device greeting from Laptop!') {
          clearTimeout(timer);
          assert(msg.senderId === user1Profile.id, 'Message senderId matches persistent accountId');
          assert(msg.senderName === 'eZacx', 'Message senderName matches "eZacx"');
          assert(msg.avatarColor === '#7C3AED', 'Message avatarColor matches account color');
          resolve();
        }
      });

      client2.emit('send-message', {
        channelId: 'general',
        text: 'Cross-device greeting from Laptop!'
      });
    });

    // -----------------------------------------------------------------
    // TEST 6: Multi-Account Registration & 1-Click Switcher Simulation
    // -----------------------------------------------------------------
    console.log('\n--- 6. Multi-Account Registration & 1-Click Switcher ---');
    let altProfile = null;
    let altToken = null;

    // Register second account "GamerAlt"
    await new Promise((resolve) => {
      client1.emit('auth-register', {
        username: 'GamerAlt',
        password: 'AltPassword789!',
        avatarColor: '#10B981'
      }, (res) => {
        assert(res.success === true, 'Registered second account "GamerAlt"');
        assert(res.user.id !== user1Profile.id, 'Secondary account has unique distinct accountId');
        assert(res.user.username === 'GamerAlt', 'Secondary username is "GamerAlt"');
        altProfile = res.user;
        altToken = res.token;
        resolve();
      });
    });

    // Switch Client 1 back to primary account "eZacx" using saved session token
    await new Promise((resolve) => {
      client1.emit('auth-verify', { token: user1Token }, (res) => {
        assert(res.success === true, '1-Click switch back to "eZacx" via session token succeeded');
        assert(res.user.id === user1Profile.id, 'Active account restored to primary eZacx');
        assert(res.user.username === 'eZacx', 'Active username is eZacx');
        resolve();
      });
    });

    // Switch Client 1 to secondary account "GamerAlt"
    await new Promise((resolve) => {
      client1.emit('auth-verify', { token: altToken }, (res) => {
        assert(res.success === true, '1-Click switch to "GamerAlt" succeeded');
        assert(res.user.id === altProfile.id, 'Active account switched to GamerAlt');
        assert(res.user.username === 'GamerAlt', 'Active username is GamerAlt');
        resolve();
      });
    });

    // -----------------------------------------------------------------
    // TEST 7: Profile Update Across Connected Clients
    // -----------------------------------------------------------------
    console.log('\n--- 7. Profile Update Across Devices ---');
    await new Promise((resolve) => {
      client1.emit('auth-update-profile', {
        username: 'GamerAlt_Pro',
        avatarColor: '#F59E0B'
      }, (res) => {
        assert(res.success === true, 'Profile updated on server');
        assert(res.user.username === 'GamerAlt_Pro', 'Updated username is "GamerAlt_Pro"');
        assert(res.user.avatarColor === '#F59E0B', 'Updated avatar color is "#F59E0B"');
        resolve();
      });
    });

    // -----------------------------------------------------------------
    // TEST 8: Token Session Logout
    // -----------------------------------------------------------------
    console.log('\n--- 8. Session Logout ---');
    client1.emit('auth-logout', { token: altToken });

    // Verify logged out token is rejected
    await new Promise((resolve) => {
      client1.emit('auth-verify', { token: altToken }, (res) => {
        assert(res.success === false, 'Logged out token session is revoked and rejected');
        resolve();
      });
    });

    // Clean up connections
    client1.disconnect();
    client2.disconnect();

  } catch (err) {
    console.error('[QA] Unhandled error during QA execution:', err);
    testFailed++;
  } finally {
    if (server) {
      server.close();
      console.log('[QA] Server closed.');
    }
    if (fs.existsSync(TEMP_AUTH_DIR)) {
      try { fs.rmSync(TEMP_AUTH_DIR, { recursive: true, force: true }); } catch (e) {}
    }
  }

  console.log('\n===============================================================');
  console.log(`QA SUMMARY: ${testPassed} PASSED | ${testFailed} FAILED`);
  console.log('===============================================================');

  process.exit(testFailed === 0 ? 0 : 1);
}

runQA();
