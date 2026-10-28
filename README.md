# MegaZacx (eZacx-Comm)

<p align="center">
  <strong>Ultra-lightweight, high-performance Discord-style Voice & Text communication software designed for gamers, squads, and LAN parties.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.2-7C3AED?style=for-the-badge" alt="Version 1.0.2">
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-06B6D4?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/Electron-33.x-475569?style=for-the-badge" alt="Electron">
  <img src="https://img.shields.io/badge/CPU%20Impact-%3C0.05%25-10B981?style=for-the-badge" alt="CPU Impact">
  <img src="https://img.shields.io/badge/In--Game%20FPS%20Drop-0%25-10B981?style=for-the-badge" alt="FPS Drop">
</p>

---

## 🚀 Overview

**MegaZacx** is a standalone, local-first communication application that combines the familiar, sleek aesthetic of Discord with high-speed peer-to-peer WebRTC voice mesh networking. 

Unlike heavy, resource-intensive chat clients that drop in-game frame rates, MegaZacx is engineered specifically for competitive gaming:
- **CPU Load**: Under **0.05%** across all cores (drops to **0.00%** when minimized/inactive).
- **RAM Footprint**: Lightweight modular Chromium/Node runtime.
- **Latency**: True direct P2P mesh audio — audio packets travel directly between squad mates with minimum network hops.

---

## ✨ Features

### 🎙️ Gaming Voice Communication
- **P2P WebRTC Audio Mesh**: Ultra-low-latency direct peer-to-peer audio streams with STUN fallback.
- **Hardware-Accelerated VAD (Voice Activity Detection)**: Real-time frequency analysis with speaking glow indicators and zero continuous paint overhead.
- **Mute & Deafen Controls**: Instant hardware/software microphone mute and deafen toggles with keyboard indicators.
- **Dynamic Voice Stage**: Pop-out visual stage featuring grid cards for every participant in the voice room with speaking status.
- **Zero-Leak Audio Engine**: Microphones, audio contexts, and VAD intervals automatically shut down the millisecond you leave a voice room.

### 💬 Dynamic Channels & Text Chat
- **1-Click Channel Management**:
  - Create custom Text (`#`) and Voice (`🔊`) channels on the fly.
  - **Rename Channels**: Full support for renaming default and custom channels via right-click context menu, channel header button, or sidebar hover actions.
  - **Delete Channels**: Safely remove unused custom rooms while preserving at least one default channel.
  - **Optimistic Sync & Local Persistence**: Channel names update instantly on screen and persist in `localStorage` even if connected to older remote relay servers.
- **Real-Time Text Chat**: Instant chat messaging with timestamps, system notifications, and sound effects.

### ⚡ Ultra-Low Resource Optimization
- **Zero In-Game FPS Drop**: Eliminates continuous CSS animation paint thrashing (`transform: scale` / animated `box-shadow` loops replaced with static hardware-accelerated shaders).
- **Background Throttling**: Chromium background timer throttling and occlusion pausing automatically suspend non-essential rendering when full-screen gaming.
- **Disabled Overhead**: Hunspell spellchecking workers and accessibility loops disabled to conserve CPU cycles.

### 🔄 In-App Seamless Auto-Updater
- **Silent Background Updates**: 2.5 seconds after launch, MegaZacx checks GitHub (`axay786/MegaZacx`) for new commits.
- **1-Click Update**: Drops down an update notification banner. Clicking **"Update Now"** downloads, replaces files in-place, and relaunches MegaZacx in 1.2 seconds without requiring manual `.exe` reinstallation.
- **Unpacked Packaging (`"asar": false`)**: App files live directly in user space (`AppData\Local\Programs\MegaZacx\resources\app\`), allowing clean in-place updates without Windows permissions or archive errors.

---

## 📊 System Resource & In-Game Benchmark

Audited via `tests/qa_fps_performance.js` across all 6 active processes over a sustained 10-second monitoring window:

| Process Role | PID | Working Set RAM | CPU Usage |
| :--- | :--- | :--- | :--- |
| **Renderer (UI & Web Audio)** | `5088` | 88.8 MB | **0.00%** |
| **Main Process (Node.js & Server)** | `7196` | 104.2 MB | **0.00%** |
| **Embedded Server Workers** | `11392`, `14612` | 165.4 MB | **0.00%** |
| **GPU Process (DirectX/Vulkan)** | `20488` | 92.8 MB | **0.00%** |
| **Network Service** | `3608` | 55.1 MB | **0.05%** |
| **TOTAL LOAD ACROSS ALL CORES** | — | **506.3 MB** | **0.05%** |

- **In-Game FPS Impact**: **< 0.1%** (effectively 0 dropped frames).
- **Background Inactive CPU**: **0.00%**.

---

## 🛠️ Installation & Getting Started

### 1. Windows Setup Installer (Recommended)
You can distribute the standalone installer to anyone wanting to use MegaZacx:
- **Installer File**: `dist/MegaZacx-Setup-1.0.2.exe` (~88 MB)
- Run the installer. It creates Desktop and Start Menu shortcuts and installs MegaZacx into user space (`AppData\Local\Programs\MegaZacx`).

### 2. Run from Source (Development)
Ensure you have [Node.js](https://nodejs.org/) installed:

```bash
# Clone the repository
git clone https://github.com/axay786/MegaZacx.git
cd MegaZacx

# Install dependencies
npm install

# Start MegaZacx Desktop Application
npm start
```
*Or double-click `MegaZacx.bat` on Windows.*

### 3. Build Windows Installer (`.exe`)
To recompile the NSIS installer:
```bash
npm run build:win
```
The output executable will be placed in the `dist/` directory.

---

## 🌐 Networking & Server Modes

MegaZacx supports dual networking topologies:

1. **Embedded Local / LAN Mode (Zero Config)**:
   - MegaZacx automatically starts an internal signaling server on port `3888`.
   - Other PCs on the same Wi-Fi / Local Area Network can connect directly by pasting your LAN IP (e.g., `http://192.168.1.15:3888`) into **Settings** $\rightarrow$ **Connect to Server**.
2. **Cloud Relay Mode (Play over the Internet)**:
   - Connects to the 24/7 hosted relay server (`https://megazacx-server.onrender.com`).
   - Use the `server-deploy/` folder to host your own free private relay on Render, Railway, or Heroku.

---

## 🧪 Automated QA & Test Suites

The codebase includes an extensive suite of automated tests:

```bash
# 1. Test Channel Renaming & Message Persistence
node tests/test_channel_rename.js

# 2. Test Dynamic Channel Creation
node tests/test_channel_creation.js

# 3. Test Audio Stream & VAD Lifecycle Teardown (0 Leaks)
node tests/test_audio_cleanup.js

# 4. Test In-App GitHub Auto-Updater
node tests/test_auto_updater.js

# 5. Measure In-Game FPS & CPU Load Across All Subprocesses
node tests/qa_fps_performance.js
```

---

## 📁 Project Architecture

```text
MegaZacx/
├── dist/                          # Generated Windows installers & unpacked builds
├── server-deploy/                 # Standalone cloud signaling server (Render.com)
│   ├── server.js                  # Express & Socket.IO WebRTC relay
│   ├── render.yaml                # Render deployment blueprint
│   └── package.json
├── src/
│   ├── main/
│   │   ├── main.js                # Electron main process & power switches
│   │   ├── preload.js             # Context isolation bridge & IPC
│   │   └── updater.js             # Silent background in-place auto-updater
│   ├── renderer/
│   │   ├── index.html             # Discord-inspired interface layout
│   │   ├── css/
│   │   │   └── style.css          # Deep Space dark theme & hardware-accelerated styles
│   │   └── js/
│   │       └── app.js             # WebRTC mesh, audio VAD, channel UI & state
│   └── server/
│       └── server.js              # Embedded local signaling server
├── tests/                         # QA automated verification & performance audits
├── MegaZacx.bat                   # Quick Windows launcher
├── package.json                   # App manifest & electron-builder configuration
└── version.json                   # Pinned build version and commit hash
```

---

## 📜 License

MIT License. Designed and maintained by **eZacx** (`axay786`).
