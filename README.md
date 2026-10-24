# MegaZacx (eZacx-Comm)

A feature-rich, low-latency Discord-style Voice & Text communication desktop software built for gamers, squads, and LAN parties.

---

## Features

- **Deep Space & Electric Violet Aesthetics**: Authentic dark theme UI layout with guilds sidebar, channels tree, chat messages scroller, user panel, and active members list.
- **Peer-to-Peer WebRTC Voice Mesh**: High-performance, low-latency audio streaming for squad voice rooms without needing costly centralized media servers.
- **Voice Activity Detection (VAD)**: Real-time volume analysis highlighting callers with an animated green glowing aura when speaking.
- **Mute & Deafen Controls**: Toggle microphone mute (software track disable) and headphone deafen (mutes incoming audio & disables mic).
- **Voice Stage Grid**: Pop-out visual stage displaying caller cards with animated avatar rings and volume status.
- **Real-Time Text Chat**: Multiple text channels (`#general`, `#gaming`, `#memes`, `#announcements`) with message history and audio alerts.
- **Embedded Zero-Config Server**: Electron app starts an embedded signaling and chat server on port `3888` automatically.
- **LAN & Multi-Device Support**: Share your LAN link (e.g. `http://192.168.1.X:3888`) so friends on the same network or mobile browsers can join directly!
- **Audio Device & VU Meter Testing**: Built-in settings modal to choose microphone input, adjust sensitivity, and test audio with a live VU meter.

---

## Quick Start

### 1. Launch the Desktop App
Double-click `start.bat` or run:
```bash
cd D:\eZacx-Comm
npm start
```

### 2. Run Standalone Signaling Server (Optional)
If you wish to host a dedicated server instance without GUI:
```bash
cd D:\eZacx-Comm
npm run server
```

---

## Tech Stack
- **Desktop Runtime**: Electron 33+
- **Signaling & Chat**: Node.js, Express, Socket.io
- **Voice Communication**: WebRTC PeerConnection (Mesh P2P with STUN fallback)
- **Frontend**: HTML5, Vanilla CSS3 (Custom Discord Dark System), Modern JavaScript


---

## Cloud Server Deployment
Deploy the `server-deploy` folder to Render.com for 24/7 internet connectivity with friends.