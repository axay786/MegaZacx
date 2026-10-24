const assert = require('assert');
const fs = require('fs');
const path = require('path');
const updater = require('../src/main/updater');

console.log('🧪 Starting MegaZacx Auto-Updater Comprehensive Test...\n');

async function runTests() {
  // 1. Verify current version loading
  console.log('Test 1: Reading local version.json');
  const ver = updater.getCurrentVersion();
  console.log('  -> Found version info:', ver);
  assert.ok(ver.version, 'version field should exist');
  assert.ok(ver.commit, 'commit field should exist');
  console.log('  ✅ Test 1 Passed!\n');

  // 2. Verify live GitHub commit check
  console.log('Test 2: Querying GitHub for latest commit on branch main');
  const checkRes = await updater.checkForUpdates();
  console.log('  -> Check response:', checkRes);
  assert.strictEqual(checkRes.success, true, 'check should succeed');
  assert.ok(typeof checkRes.updateAvailable === 'boolean', 'updateAvailable should be boolean');
  assert.ok(checkRes.latestCommit, 'latestCommit should be a non-empty string');
  console.log('  ✅ Test 2 Passed!\n');

  // 3. Verify update detection when version is behind
  console.log('Test 3: Simulating outdated local version');
  const versionFile = path.resolve(__dirname, '..', 'version.json');
  const originalVersionRaw = fs.readFileSync(versionFile, 'utf8');

  try {
    fs.writeFileSync(versionFile, JSON.stringify({ version: '0.9.0', commit: 'outdated000000' }, null, 2));
    const outdatedRes = await updater.checkForUpdates();
    console.log('  -> Outdated check response:', outdatedRes);
    assert.strictEqual(outdatedRes.updateAvailable, true, 'updateAvailable must be true when commit differs');
    console.log('  ✅ Test 3 Passed!\n');
  } finally {
    fs.writeFileSync(versionFile, originalVersionRaw, 'utf8');
  }

  // 4. Verify preload and main IPC contracts
  console.log('Test 4: Checking preload and main exports');
  const preloadRaw = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'main', 'preload.js'), 'utf8');
  assert.ok(preloadRaw.includes('checkForUpdates'), 'preload must expose checkForUpdates');
  assert.ok(preloadRaw.includes('performUpdate'), 'preload must expose performUpdate');
  assert.ok(preloadRaw.includes('getAppVersion'), 'preload must expose getAppVersion');

  const mainRaw = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  assert.ok(mainRaw.includes("ipcMain.handle('check-for-updates'"), 'main must handle check-for-updates');
  assert.ok(mainRaw.includes("ipcMain.handle('perform-update'"), 'main must handle perform-update');
  assert.ok(mainRaw.includes("ipcMain.handle('get-app-version'"), 'main must handle get-app-version');
  console.log('  ✅ Test 4 Passed!\n');

  // 5. Verify renderer UI elements in index.html
  console.log('Test 5: Checking index.html UI elements');
  const htmlRaw = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  assert.ok(htmlRaw.includes('id="app-update-banner"'), 'index.html must have update banner');
  assert.ok(htmlRaw.includes('id="btn-update-now"'), 'index.html must have Update Now button');
  assert.ok(htmlRaw.includes('data-tab="tab-updates"'), 'index.html must have Updates tab button');
  assert.ok(htmlRaw.includes('id="tab-updates"'), 'index.html must have tab-updates panel');
  console.log('  ✅ Test 5 Passed!\n');

  console.log('🎉 ALL AUTO-UPDATER TESTS PASSED SUCCESSFULLY! (5/5)');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
