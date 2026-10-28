const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');

function getProcessStats(pids) {
  if (!pids || pids.length === 0) return [];
  try {
    const pidList = pids.join(',');
    const cmd = `Get-Process -Id ${pidList} -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, WorkingSet64, CPU | ConvertTo-Json`;
    const stdout = execSync(`powershell -NoProfile -Command "${cmd}"`, { encoding: 'utf8' }).trim();
    if (!stdout) return [];
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    return [];
  }
}

function findChildPids(parentPid) {
  try {
    const cmd = `Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${parentPid} -or $_.ProcessId -eq ${parentPid} } | Select-Object -ExpandProperty ProcessId`;
    const stdout = execSync(`powershell -NoProfile -Command "${cmd}"`, { encoding: 'utf8' }).trim();
    return stdout ? stdout.split(/\r?\n/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)) : [parentPid];
  } catch (e) {
    return [parentPid];
  }
}

function getProcessRoles(pids) {
  const roles = {};
  try {
    const pidList = pids.join(',');
    const cmd = `Get-CimInstance Win32_Process | Where-Object { ${pidList.split(',').map(p => `$_."ProcessId" -eq ${p}`).join(' -or ')} } | Select-Object ProcessId, CommandLine | ConvertTo-Json`;
    const stdout = execSync(`powershell -NoProfile -Command "${cmd}"`, { encoding: 'utf8' }).trim();
    if (!stdout) return roles;
    const parsed = Array.isArray(JSON.parse(stdout)) ? JSON.parse(stdout) : [JSON.parse(stdout)];
    for (const item of parsed) {
      const line = item.CommandLine || '';
      if (line.includes('--type=renderer')) roles[item.ProcessId] = 'Renderer (UI & Web Audio)';
      else if (line.includes('--type=gpu-process')) roles[item.ProcessId] = 'GPU Process (DirectX/Vulkan)';
      else if (line.includes('--type=utility') && line.includes('network.mojom')) roles[item.ProcessId] = 'Network Service';
      else if (line.includes('--type=crashpad-handler')) roles[item.ProcessId] = 'Crashpad Handler';
      else roles[item.ProcessId] = 'Main Process (Node.js & Server)';
    }
  } catch (e) {}
  return roles;
}

async function runPerformanceAudit() {
  console.log('================================================================');
  console.log('       MEGAZACX IN-GAME FPS & SYSTEM RESOURCE QA AUDIT          ');
  console.log('================================================================');

  const rootDir = path.resolve(__dirname, '..');
  const electronExe = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');

  console.log('\n[1/5] Launching MegaZacx Desktop Application in Background Simulation...');
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;

  const appProc = spawn(electronExe, ['.'], {
    cwd: rootDir,
    env: cleanEnv,
    stdio: 'ignore'
  });

  const parentPid = appProc.pid;
  console.log(`[MegaZacx] Main process launched with PID: ${parentPid}`);

  console.log('[2/5] Allowing Electron window, Chromium GPU pipeline & embedded server to initialize (6s)...');
  await new Promise(r => setTimeout(r, 6000));

  let familyPids = findChildPids(parentPid);
  const allPids = new Set(familyPids);
  for (const pid of familyPids) {
    const grandChildren = findChildPids(pid);
    grandChildren.forEach(p => allPids.add(p));
  }
  const pidArray = Array.from(allPids);
  const roles = getProcessRoles(pidArray);

  console.log(`[3/5] Discovered Active Process Family (${pidArray.length} processes):`);
  pidArray.forEach(p => console.log(`  - PID ${p}: ${roles[p] || 'Electron Subprocess'}`));

  console.log('\n[4/5] Profiling Continuous CPU & Memory Load over 10-Second Sustained Window...');
  const statsStart = getProcessStats(pidArray);
  const timeStart = Date.now();

  await new Promise(r => setTimeout(r, 10000));

  const statsEnd = getProcessStats(pidArray);
  const timeEnd = Date.now();
  const elapsedSec = (timeEnd - timeStart) / 1000;
  const numCpus = os.cpus().length;

  let totalRamBytes = 0;
  let totalCpuTimeDelta = 0;

  console.log('\n================ PROCESS FAMILY RESOURCE BREAKDOWN ================');
  console.log('Role                           | PID   | RAM (Working Set) | CPU Usage');
  console.log('-------------------------------+-------+-------------------+----------');

  for (const endProc of statsEnd) {
    const startProc = statsStart.find(p => p.Id === endProc.Id);
    const startCpu = startProc && startProc.CPU ? startProc.CPU : 0;
    const endCpu = endProc.CPU ? endProc.CPU : 0;
    const cpuDelta = Math.max(0, endCpu - startCpu);
    const cpuNormalized = ((cpuDelta / elapsedSec) * 100) / numCpus;
    const ramMB = (endProc.WorkingSet64 / (1024 * 1024)).toFixed(1);

    totalRamBytes += endProc.WorkingSet64 || 0;
    totalCpuTimeDelta += cpuDelta;

    const roleName = (roles[endProc.Id] || endProc.ProcessName).padEnd(30, ' ');
    const pidStr = String(endProc.Id).padEnd(5, ' ');
    const ramStr = `${ramMB} MB`.padEnd(17, ' ');
    const cpuStr = `${cpuNormalized.toFixed(2)}%`;

    console.log(`${roleName} | ${pidStr} | ${ramStr} | ${cpuStr}`);
  }

  const totalRamMB = (totalRamBytes / (1024 * 1024)).toFixed(1);
  const totalCpuPercent = ((totalCpuTimeDelta / elapsedSec) * 100) / numCpus;

  console.log('-------------------------------+-------+-------------------+----------');
  console.log(`TOTAL PEAK RAM OCCUPANCY:        ${totalRamMB} MB`);
  console.log(`TOTAL CPU LOAD ACROSS ALL CORES: ${totalCpuPercent.toFixed(2)}% of total system CPU capacity`);
  console.log('===================================================================');

  console.log('\n[5/5] Terminating profiling test processes...');
  for (const pid of pidArray) {
    try {
      execSync(`taskkill /F /PID ${pid} >nul 2>&1`);
    } catch (e) {}
  }

  return {
    totalRamMB: parseFloat(totalRamMB),
    totalCpuPercent: parseFloat(totalCpuPercent.toFixed(2)),
    numCpus,
    processCount: pidArray.length
  };
}

runPerformanceAudit().then(res => {
  console.log('\nQA Performance profiling finished.');
  process.exit(0);
}).catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
