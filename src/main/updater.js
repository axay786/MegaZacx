const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const GITHUB_REPO = 'axay786/MegaZacx';
const GITHUB_BRANCH = 'main';
const GITHUB_COMMITS_API = `https://api.github.com/repos/${GITHUB_REPO}/commits/${GITHUB_BRANCH}`;
const GITHUB_ZIP_URL = `https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip`;

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const VERSION_FILE = path.join(ROOT_DIR, 'version.json');

function getCurrentVersion() {
  try {
    if (fs.existsSync(VERSION_FILE)) {
      const raw = fs.readFileSync(VERSION_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[Updater] Could not read version.json:', e.message);
  }
  return {
    version: '1.0.0',
    commit: '4491e7ee22f08665d81b78cf39b095f120f0287d',
    name: 'MegaZacx'
  };
}

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.get({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'MegaZacx-Updater',
        'Accept': 'application/vnd.github.v3+json',
        ...headers
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchJson(res.headers.location, headers));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', reject);
  });
}

async function checkForUpdates() {
  const current = getCurrentVersion();
  const currentCommit = current.commit || '';
  const currentShort = currentCommit.substring(0, 7);

  try {
    const commitData = await fetchJson(GITHUB_COMMITS_API);
    const remoteSha = commitData.sha || '';
    const remoteShort = remoteSha ? remoteSha.substring(0, 7) : '';
    const commitMessage = commitData.commit && commitData.commit.message
      ? commitData.commit.message.split('\n')[0]
      : 'New improvements and bugfixes';
    const commitDate = commitData.commit && commitData.commit.author
      ? commitData.commit.author.date
      : new Date().toISOString();

    const isDifferent = Boolean(remoteSha && remoteSha !== currentCommit && remoteShort !== currentShort);

    return {
      success: true,
      updateAvailable: isDifferent,
      currentCommit: currentShort,
      currentVersion: current.version || '1.0.0',
      latestCommit: remoteShort,
      latestFullCommit: remoteSha,
      commitMessage,
      date: commitDate
    };
  } catch (err) {
    console.warn('[Updater] Failed to check for updates:', err.message);
    return {
      success: false,
      updateAvailable: false,
      currentCommit: currentShort,
      currentVersion: current.version || '1.0.0',
      error: err.message
    };
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const get = (targetUrl) => {
      https.get(targetUrl, { headers: { 'User-Agent': 'MegaZacx-Updater' }, timeout: 30000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve(destPath));
        });
        file.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };
    get(url);
  });
}

function copyDirectoryRecursive(src, dest, excludeDirs = ['node_modules', '.git']) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (excludeDirs.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath, excludeDirs);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function performUpdate(app) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'megazacx-update-'));
  const zipPath = path.join(tempDir, 'update.zip');
  const extractDir = path.join(tempDir, 'extracted');

  try {
    console.log('[Updater] Downloading latest release from GitHub...');
    await downloadFile(GITHUB_ZIP_URL, zipPath);

    console.log('[Updater] Extracting update archive...');
    fs.mkdirSync(extractDir, { recursive: true });
    try {
      execSync(`tar -xf "${zipPath}" -C "${extractDir}"`);
    } catch (tarErr) {
      console.warn('[Updater] tar extraction failed, trying PowerShell Expand-Archive:', tarErr.message);
      execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractDir}' -Force"`);
    }

    const extractedEntries = fs.readdirSync(extractDir);
    const rootFolder = extractedEntries.find(e => fs.statSync(path.join(extractDir, e)).isDirectory()) || 'MegaZacx-main';
    const extractedAppDir = path.join(extractDir, rootFolder);

    if (!fs.existsSync(extractedAppDir)) {
      throw new Error('Extracted update structure is invalid: directory not found.');
    }

    console.log('[Updater] Copying updated files to app directory:', ROOT_DIR);

    // Copy src directory
    const srcSource = path.join(extractedAppDir, 'src');
    if (fs.existsSync(srcSource)) {
      copyDirectoryRecursive(srcSource, path.join(ROOT_DIR, 'src'));
    }

    // Copy server-deploy directory
    const serverDeploySource = path.join(extractedAppDir, 'server-deploy');
    if (fs.existsSync(serverDeploySource)) {
      copyDirectoryRecursive(serverDeploySource, path.join(ROOT_DIR, 'server-deploy'));
    }

    // Copy root files
    const rootFiles = ['package.json', 'README.md'];
    for (const file of rootFiles) {
      const filePath = path.join(extractedAppDir, file);
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, path.join(ROOT_DIR, file));
      }
    }

    // Fetch latest commit info to record in version.json
    let latestSha = '';
    try {
      const commitInfo = await fetchJson(GITHUB_COMMITS_API);
      latestSha = commitInfo.sha || '';
    } catch (e) {}

    // Update version.json
    const newVersionData = {
      version: '1.0.1',
      commit: latestSha || 'latest',
      name: 'MegaZacx',
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(VERSION_FILE, JSON.stringify(newVersionData, null, 2), 'utf8');

    // Cleanup temp
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanErr) {
      console.warn('[Updater] Temp cleanup warning:', cleanErr.message);
    }

    console.log('[Updater] Update completed successfully! Relaunching app in 1.2s...');

    if (app) {
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 1200);
    }

    return {
      success: true,
      message: 'Update installed successfully! Restarting MegaZacx...'
    };
  } catch (err) {
    console.error('[Updater] Failed to perform update:', err);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    return {
      success: false,
      error: err.message
    };
  }
}

module.exports = {
  getCurrentVersion,
  checkForUpdates,
  performUpdate
};
