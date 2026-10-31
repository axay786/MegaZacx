const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('   QA TEST SUITE: WINDOW CLOSE ACTION & SYSTEM TRAY SETTINGS   ');
console.log('===============================================================');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// 1. Verify index.html UI markup
test('index.html contains Window & Tray Settings Tab button', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  assert.ok(html.includes('data-tab="tab-system"'), 'Settings tabs must include tab-system button');
  assert.ok(html.includes('Window & Tray'), 'Tab button label should be "Window & Tray"');
});

test('index.html contains select-close-action with Close and Tray options', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  assert.ok(html.includes('id="select-close-action"'), 'select-close-action dropdown must exist');
  assert.ok(html.includes('value="close"'), 'Must have option value="close"');
  assert.ok(html.includes('value="tray"'), 'Must have option value="tray"');
  // Check default text
  assert.ok(html.includes('Close Completely (Exit Application) — Default'), 'Must mark Close Completely as Default');
});

test('index.html contains live status indicator badge and description', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  assert.ok(html.includes('id="tray-status-title"'), 'tray-status-title must exist');
  assert.ok(html.includes('id="tray-status-desc"'), 'tray-status-desc must exist');
  assert.ok(html.includes('id="tray-status-badge"'), 'tray-status-badge must exist');
});

// 2. Verify preload.js IPC bridge
test('preload.js exposes setCloseToTray and getCloseToTray', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../src/main/preload.js'), 'utf8');
  assert.ok(preload.includes('setCloseToTray:'), 'preload.js must expose setCloseToTray');
  assert.ok(preload.includes('getCloseToTray:'), 'preload.js must expose getCloseToTray');
  assert.ok(preload.includes("ipcRenderer.send('set-close-to-tray'"), 'setCloseToTray must send set-close-to-tray IPC');
  assert.ok(preload.includes("ipcRenderer.invoke('get-close-to-tray')"), 'getCloseToTray must invoke get-close-to-tray IPC');
});

// 3. Verify main.js Tray & Close logic
test('main.js imports Tray and Menu from electron', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
  assert.ok(main.includes('Tray'), 'main.js must import Tray');
  assert.ok(main.includes('Menu'), 'main.js must import Menu');
});

test('main.js defaults closeToTray to false (exit completely)', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
  assert.ok(/let closeToTray = false;/.test(main), 'closeToTray must default to false');
});

test('main.js implements createTray with Open and Quit actions', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
  assert.ok(main.includes('function createTray()'), 'createTray function must exist');
  assert.ok(main.includes("label: 'Open MegaZacx'"), 'Tray menu must include "Open MegaZacx"');
  assert.ok(main.includes("label: 'Quit MegaZacx'"), 'Tray menu must include "Quit MegaZacx"');
});

test('main.js handles set-close-to-tray and get-close-to-tray IPC events', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
  assert.ok(main.includes("ipcMain.on('set-close-to-tray'"), 'main.js must listen for set-close-to-tray');
  assert.ok(main.includes("ipcMain.handle('get-close-to-tray'"), 'main.js must handle get-close-to-tray');
});

test('main.js intercepts close event to hide window only when closeToTray is enabled', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
  assert.ok(main.includes("mainWindow.on('close'"), 'main.js must listen to mainWindow close event');
  assert.ok(main.includes("event.preventDefault()"), 'main.js must prevent default when closeToTray is true');
  assert.ok(main.includes("mainWindow.hide()"), 'main.js must hide mainWindow when minimized to tray');
});

// 4. Verify app.js Renderer settings and persistence
test('app.js initializes and binds selectCloseAction', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../src/renderer/js/app.js'), 'utf8');
  assert.ok(appJs.includes("selectCloseAction: document.getElementById('select-close-action')"), 'app.js must register selectCloseAction element');
  assert.ok(appJs.includes("localStorage.getItem(\"megazacx_close_action\") || \"close\""), 'app.js must read megazacx_close_action with default "close"');
  assert.ok(appJs.includes("window.megaZacxAPI.setCloseToTray(savedCloseAction === \"tray\")"), 'app.js must sync closeToTray state to main process on load');
  assert.ok(appJs.includes("el.selectCloseAction.onchange"), 'app.js must listen to onchange on selectCloseAction');
});

test('app.js updates live UI badge and toast notification on close action change', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../src/renderer/js/app.js'), 'utf8');
  assert.ok(appJs.includes('updateCloseBehaviorUI'), 'updateCloseBehaviorUI helper must exist');
  assert.ok(appJs.includes('Tray Active'), 'Must show "Tray Active" when tray is selected');
  assert.ok(appJs.includes('Exit on Close (Default)'), 'Must show "Exit on Close (Default)" when close is selected');
});

console.log('\n===============================================================');
console.log(`QA SUMMARY: ${passed} PASSED | ${failed} FAILED`);
console.log('===============================================================');

process.exit(failed === 0 ? 0 : 1);

