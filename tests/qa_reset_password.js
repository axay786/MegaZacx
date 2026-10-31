const assert = require('assert');
const fs = require('fs');
const path = require('path');
const io = require('socket.io-client');
const { createServer } = require('../src/server/server');
const AuthManager = require('../src/server/auth');

async function runTest() {
  console.log('===============================================================');
  console.log('   QA: PASSWORD RESET & ACCOUNT RECOVERY VERIFICATION          ');
  console.log('===============================================================');

  const TEST_PORT = 3897;
  const TEMP_DIR = path.join(__dirname, 'temp_reset_test');

  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }

  const auth = new AuthManager(TEMP_DIR);
  const srv = await createServer(TEST_PORT, auth);
  const server = srv.server;

  const client = io(`http://localhost:${TEST_PORT}`, { transports: ['websocket'] });
  await new Promise(r => client.on('connect', r));

  try {
    // 1. Register test user with InitialPassword1
    let registerRes = await new Promise(resolve => {
      client.emit('auth-register', {
        username: 'eZacx',
        password: 'InitialPassword1',
        avatarColor: '#7C3AED'
      }, resolve);
    });
    assert.strictEqual(registerRes.success, true, 'User eZacx registered');
    console.log('  ✓ PASS: Registered eZacx with initial password');

    // 2. Try login with wrong password
    let failLoginRes = await new Promise(resolve => {
      client.emit('auth-login', {
        username: 'eZacx',
        password: 'WrongPassword999'
      }, resolve);
    });
    assert.strictEqual(failLoginRes.success, false, 'Login failed with wrong password');
    assert.strictEqual(failLoginRes.error, 'Incorrect password. Please try again.');
    console.log('  ✓ PASS: Login rejected with "Incorrect password. Please try again."');

    // 3. Trigger 1-click password reset to NewPassword456!
    let resetRes = await new Promise(resolve => {
      client.emit('auth-reset-password', {
        username: 'eZacx',
        newPassword: 'NewPassword456!'
      }, resolve);
    });
    assert.strictEqual(resetRes.success, true, 'Password reset succeeded');
    assert.ok(resetRes.token, 'Session token issued');
    assert.strictEqual(resetRes.user.username, 'eZacx', 'Username matches eZacx');
    console.log('  ✓ PASS: Password reset to NewPassword456! successfully');

    // 4. Verify login with NEW password succeeds
    let successLoginRes = await new Promise(resolve => {
      client.emit('auth-login', {
        username: 'eZacx',
        password: 'NewPassword456!'
      }, resolve);
    });
    assert.strictEqual(successLoginRes.success, true, 'Login with new password succeeded');
    assert.strictEqual(successLoginRes.user.username, 'eZacx');
    console.log('  ✓ PASS: Login with new password succeeded');

    // 5. Verify old password no longer works
    let oldPassLoginRes = await new Promise(resolve => {
      client.emit('auth-login', {
        username: 'eZacx',
        password: 'InitialPassword1'
      }, resolve);
    });
    assert.strictEqual(oldPassLoginRes.success, false, 'Old password rejected');
    console.log('  ✓ PASS: Old password rejected after reset');

    console.log('\n===============================================================');
    console.log('   ALL PASSWORD RESET QA TESTS PASSED!                        ');
    console.log('===============================================================');
  } finally {
    client.disconnect();
    server.close();
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  }
}

runTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
