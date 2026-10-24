/* ==========================================================================
   MegaZacx (eZacx-Comm) — Client Application Logic
   ========================================================================== */

(function () {
  'use strict';

  // Global State
  const DEFAULT_CLOUD_SERVER_URL = 'https://megazacx-server.onrender.com'; // Set your 24/7 Render/Railway URL here

  const state = {
    socket: null,
    currentUser: {
      id: null,
      username: localStorage.getItem('megazacx_username') || 'Gamer_' + Math.floor(1000 + Math.random() * 9000),
      avatarColor: localStorage.getItem('megazacx_avatar_color') || '#7C3AED',
      avatarInitial: 'G',
      voiceChannel: null,
      isMuted: false,
      isDeafened: false,
      isSpeaking: false
    },
    activeTextChannel: 'general',
    activeVoiceChannel: null,
    channels: { text: [], voice: [] },
    allUsers: [],
    messages: {},
    peers: new Map(), // peerId -> { pc, stream, audioElem, isSpeaking, isMuted, isDeafened, candidateQueue }
    localStream: null,
    audioContext: null,
    analyser: null,
    vadInterval: null,
    vadThreshold: parseInt(localStorage.getItem('megazacx_vad_threshold'), 10) || 12,
    speakingTimeout: null,
    isTestingMic: false,
    testStream: null,
    testAudioCtx: null,
    testAnalyser: null,
    serverPort: 3888,
    serverIps: [],
    currentServerUrl: null
  };

  state.currentUser.avatarInitial = state.currentUser.username.charAt(0).toUpperCase();

  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };

  function playSound(type) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'message') {
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'join') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'leave') {
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(350, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {}
  }

  // DOM Elements
  const el = {
    serverPill: document.getElementById('server-pill'),
    serverStatusText: document.getElementById('server-status-text'),
    btnShareLan: document.getElementById('btn-share-lan'),
    btnMinimize: document.getElementById('btn-minimize'),
    btnMaximize: document.getElementById('btn-maximize'),
    btnClose: document.getElementById('btn-close'),
    textChannelsList: document.getElementById('text-channels-list'),
    voiceChannelsList: document.getElementById('voice-channels-list'),
    voiceConnectedBar: document.getElementById('voice-connected-bar'),
    currentVoiceRoomName: document.getElementById('current-voice-room-name'),
    btnCopyVoiceBar: document.getElementById('btn-copy-voice-bar'),
    copyVoiceBarLabel: document.getElementById('copy-voice-bar-label'),
    btnDisconnectVoice: document.getElementById('btn-disconnect-voice'),
    userAvatar: document.getElementById('user-avatar'),
    userDisplayName: document.getElementById('user-display-name'),
    btnToggleMic: document.getElementById('btn-toggle-mic'),
    btnToggleDeafen: document.getElementById('btn-toggle-deafen'),
    iconMic: document.getElementById('icon-mic'),
    iconDeafen: document.getElementById('icon-deafen'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    btnQuickSettings: document.getElementById('btn-quick-settings'),
    btnAddServer: document.getElementById('btn-add-server'),
    btnOpenProfile: document.getElementById('btn-open-profile'),
    activeChannelName: document.getElementById('active-channel-name'),
    activeChannelTopic: document.getElementById('active-channel-topic'),
    welcomeChannelTitle: document.getElementById('welcome-channel-title'),
    btnToggleVoiceStage: document.getElementById('btn-toggle-voice-stage'),
    btnToggleMembers: document.getElementById('btn-toggle-members'),
    voiceStage: document.getElementById('voice-stage'),
    stageRoomName: document.getElementById('stage-room-name'),
    stageCount: document.getElementById('stage-count'),
    btnCopyStageInvite: document.getElementById('btn-copy-stage-invite'),
    copyStageLabel: document.getElementById('copy-stage-label'),
    voiceGridCards: document.getElementById('voice-grid-cards'),
    messagesContainer: document.getElementById('messages-container'),
    messagesList: document.getElementById('messages-list'),
    chatInput: document.getElementById('chat-input'),
    btnSendMessage: document.getElementById('btn-send-message'),
    membersSidebar: document.getElementById('members-sidebar'),
    onlineMembersCount: document.getElementById('online-members-count'),
    membersList: document.getElementById('members-list'),

    // Join Server Modal
    joinServerModal: document.getElementById('join-server-modal'),
    btnCloseJoinModal: document.getElementById('btn-close-join-modal'),
    inputJoinAddress: document.getElementById('input-join-address'),
    btnSubmitJoin: document.getElementById('btn-submit-join'),
    btnResetLocalhost: document.getElementById('btn-reset-localhost'),

    // Invite Modal
    inviteModal: document.getElementById('invite-modal'),
    btnCloseInviteModal: document.getElementById('btn-close-invite-modal'),
    inviteLanInput: document.getElementById('invite-lan-input'),
    btnCopyInviteLan: document.getElementById('btn-copy-invite-lan'),

    // Settings Modal
    settingsModal: document.getElementById('settings-modal'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    selectAudioInput: document.getElementById('select-audio-input'),
    vuMeterFill: document.getElementById('vu-meter-fill'),
    btnTestMic: document.getElementById('btn-test-mic'),
    sliderSensitivity: document.getElementById('slider-sensitivity'),
    inputNickname: document.getElementById('input-nickname'),
    btnSaveProfile: document.getElementById('btn-save-profile'),
    colorOptions: document.querySelectorAll('.color-option'),
    netServerStatus: document.getElementById('net-server-status'),
    netServerIp: document.getElementById('net-server-ip'),
    inputRemoteUrl: document.getElementById('input-remote-url'),
    btnConnectRemote: document.getElementById('btn-connect-remote'),
    appToast: document.getElementById('app-toast'),
    toastMessage: document.getElementById('toast-message'),
    remoteAudioContainer: document.getElementById('remote-audio-container')
  };

  function showToast(msg) {
    if (el.appToast && el.toastMessage) {
      el.toastMessage.textContent = msg;
      el.appToast.classList.remove('hidden');
      setTimeout(() => {
        el.appToast.classList.add('hidden');
      }, 3000);
    }
  }

  async function copyToClipboard(text) {
    if (!text) return false;
    let copied = false;

    // Layer 1: Electron native clipboard bridge (direct C++ Windows clipboard)
    if (window.megaZacxAPI && typeof window.megaZacxAPI.copyText === 'function') {
      try {
        const res = window.megaZacxAPI.copyText(text);
        if (res !== false) copied = true;
      } catch (err) {
        console.warn('[Clipboard] megaZacxAPI.copyText error:', err);
      }
    }

    // Layer 2: Modern Web Clipboard API
    if (!copied && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (err) {
        console.warn('[Clipboard] navigator.clipboard error:', err);
      }
    }

    // Layer 3: Fallback hidden textarea with execCommand
    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, 99999);
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (err) {
        console.error('[Clipboard] execCommand error:', err);
      }
    }

    console.log('[MegaZacx] copyToClipboard result:', copied, 'text:', text);
    return copied;
  }

  function getVoiceInviteUrl() {
    const savedServer = localStorage.getItem('megazacx_server_url');
    if (savedServer && !savedServer.includes('localhost') && !savedServer.includes('127.0.0.1')) {
      return savedServer;
    }
    if (DEFAULT_CLOUD_SERVER_URL && DEFAULT_CLOUD_SERVER_URL.trim()) {
      return DEFAULT_CLOUD_SERVER_URL.trim();
    }
    const lanIp = (state.serverIps && state.serverIps.length > 0) ? state.serverIps[0] : null;
    if (lanIp) {
      return `http://${lanIp}:${state.serverPort}`;
    }
    return `http://127.0.0.1:${state.serverPort}`;
  }

  async function copyVoiceChannelInvite(btnElement, labelElement) {
    const url = getVoiceInviteUrl();
    await copyToClipboard(url);
    showToast('? Voice link copied! Send this to your friend so they can click "+" and join.');

    if (btnElement) {
      btnElement.classList.add('copied');
      const originalText = labelElement ? labelElement.textContent : '';
      if (labelElement) labelElement.textContent = 'Copied!';
      setTimeout(() => {
        btnElement.classList.remove('copied');
        if (labelElement) labelElement.textContent = originalText;
      }, 2500);
    }
  }

  function updateProfileUI() {
    el.userAvatar.textContent = state.currentUser.avatarInitial;
    el.userAvatar.style.backgroundColor = state.currentUser.avatarColor;
    el.userDisplayName.textContent = state.currentUser.username;
    el.inputNickname.value = state.currentUser.username;

    el.colorOptions.forEach(opt => {
      if (opt.getAttribute('data-color') === state.currentUser.avatarColor) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });
  }

  function initSocket(serverUrl) {
    if (state.socket) {
      state.socket.disconnect();
    }

    let socketTarget = serverUrl;
    if (!socketTarget || socketTarget.startsWith("file:")) {
      socketTarget = "http://localhost:" + state.serverPort;
    }

    state.currentServerUrl = socketTarget;
    console.log("[MegaZacx] Connecting to signaling server:", socketTarget);

    const isLocal = socketTarget.includes("localhost") || socketTarget.includes("127.0.0.1");
    el.serverStatusText.textContent = isLocal ? `Hosting (:3888)` : `Connected: ${socketTarget.replace(/^https?:\/\//, "")}`;

    state.socket = io(socketTarget, {
      reconnectionAttempts: 10,
      timeout: 10000
    });

    state.socket.on("connect", () => {
      console.log("[MegaZacx] Connected to server, socket ID:", state.socket.id);
      el.serverStatusText.textContent = isLocal ? `Hosting (:3888)` : `Online: ${socketTarget.replace(/^https?:\/\//, "")}`;
      el.netServerIp.textContent = socketTarget;

      state.socket.emit("init-user", {
        username: state.currentUser.username,
        avatarColor: state.currentUser.avatarColor
      });
    });

    state.socket.on("init-success", (data) => {
      state.currentUser.id = data.currentUser.id;
      state.channels = data.channels;
      state.allUsers = data.users;
      state.messages = data.messages || {};

      renderChannels();
      renderMessages();
      renderMembers();
    });

    state.socket.on("users-update", (users) => {
      state.allUsers = users;
      renderChannels();
      renderMembers();
      renderVoiceStage();
    });

    state.socket.on("receive-message", (message) => {
      if (!state.messages[message.channelId]) {
        state.messages[message.channelId] = [];
      }
      state.messages[message.channelId].push(message);

      if (message.channelId === state.activeTextChannel) {
        appendMessage(message);
        if (message.senderId !== state.currentUser.id) {
          playSound("message");
        }
      }
    });

    state.socket.on("voice-peers-list", async ({ channelId, peers }) => {
      console.log("[WebRTC] Received peers in channel:", peers);
      for (const peer of peers) {
        await initPeerConnection(peer.id, true);
      }
    });

    state.socket.on("peer-joined-voice", async ({ peer }) => {
      console.log("[WebRTC] Peer joined room:", peer.id);
    });

    state.socket.on("peer-left-voice", ({ peerId }) => {
      console.log("[WebRTC] Peer left room:", peerId);
      closePeer(peerId);
      renderVoiceStage();
      renderChannels();
    });

    state.socket.on("webrtc-signal", async ({ senderPeerId, signalType, signalData }) => {
      await handleWebRTCSignal(senderPeerId, signalType, signalData);
    });

    state.socket.on("peer-voice-state", ({ peerId, isMuted, isDeafened, isSpeaking }) => {
      const peer = state.peers.get(peerId);
      if (peer) {
        peer.isMuted = isMuted;
        peer.isDeafened = isDeafened;
        peer.isSpeaking = isSpeaking;
      }
      renderVoiceStage();
      renderChannels();
    });

    state.socket.on("disconnect", () => {
      el.serverStatusText.textContent = "Disconnected";
      handleLeaveVoice(false);
    });

    state.socket.on("connect_error", (err) => {
      console.warn("[MegaZacx] Socket connection error:", err.message);
      el.serverStatusText.textContent = "Connection Failed";
    });
  }

  function connectToRemoteServer(targetUrl) {
    let clean = targetUrl.trim();
    if (!clean) return;
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = "http://" + clean;
    }
    localStorage.setItem("megazacx_server_url", clean);
    initSocket(clean);
  }

  function resetToLocalHost() {
    localStorage.removeItem("megazacx_server_url");
    initSocket("http://localhost:" + state.serverPort);
  }

  // WebRTC Peer Connection Core (with ICE Candidate Queue)
  async function initPeerConnection(peerId, isInitiator) {
    if (state.peers.has(peerId)) {
      return state.peers.get(peerId).pc;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peerEntry = {
      pc,
      stream: null,
      audioElem: null,
      isSpeaking: false,
      isMuted: false,
      isDeafened: false,
      candidateQueue: []
    };
    state.peers.set(peerId, peerEntry);

    if (state.localStream) {
      state.localStream.getAudioTracks().forEach(track => {
        pc.addTrack(track, state.localStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        state.socket.emit("webrtc-signal", {
          targetPeerId: peerId,
          signalType: "ice-candidate",
          signalData: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log("[WebRTC] Remote track received from:", peerId);
      peerEntry.stream = event.streams[0];

      let audioElem = document.getElementById("audio-peer-" + peerId);
      if (!audioElem) {
        audioElem = document.createElement("audio");
        audioElem.id = "audio-peer-" + peerId;
        audioElem.autoplay = true;
        el.remoteAudioContainer.appendChild(audioElem);
      }
      audioElem.srcObject = event.streams[0];
      audioElem.muted = state.currentUser.isDeafened;
      peerEntry.audioElem = audioElem;

      setupRemoteAudioVAD(peerId, event.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        closePeer(peerId);
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        state.socket.emit("webrtc-signal", {
          targetPeerId: peerId,
          signalType: "offer",
          signalData: offer
        });
      } catch (err) {
        console.error("[WebRTC] Offer error:", err);
      }
    }

    return pc;
  }

  async function handleWebRTCSignal(senderId, type, data) {
    let peerEntry = state.peers.get(senderId);
    let pc = peerEntry ? peerEntry.pc : null;

    if (type === "offer") {
      if (!pc) {
        pc = await initPeerConnection(senderId, false);
        peerEntry = state.peers.get(senderId);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(data));

      if (peerEntry && peerEntry.candidateQueue.length > 0) {
        for (const cand of peerEntry.candidateQueue) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
        }
        peerEntry.candidateQueue = [];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      state.socket.emit("webrtc-signal", {
        targetPeerId: senderId,
        signalType: "answer",
        signalData: answer
      });
    } else if (type === "answer") {
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        if (peerEntry && peerEntry.candidateQueue.length > 0) {
          for (const cand of peerEntry.candidateQueue) {
            try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
          }
          peerEntry.candidateQueue = [];
        }
      }
    } else if (type === "ice-candidate") {
      if (data) {
        if (!pc || !pc.remoteDescription) {
          if (!peerEntry) {
            pc = await initPeerConnection(senderId, false);
            peerEntry = state.peers.get(senderId);
          }
          peerEntry.candidateQueue.push(data);
        } else {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data));
          } catch (e) {
            console.warn("[WebRTC] ICE candidate error:", e);
          }
        }
      }
    }
  }

  function closePeer(peerId) {
    const peer = state.peers.get(peerId);
    if (peer) {
      if (peer.pc) peer.pc.close();
      if (peer.audioElem) {
        peer.audioElem.pause();
        peer.audioElem.srcObject = null;
        peer.audioElem.remove();
      }
      state.peers.delete(peerId);
    }
  }

  function setupRemoteAudioVAD(peerId, stream) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const checkInterval = setInterval(() => {
        if (!state.peers.has(peerId)) {
          clearInterval(checkInterval);
          audioCtx.close();
          return;
        }

        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;

        const peer = state.peers.get(peerId);
        if (peer) {
          const speakingNow = avg > 14 && !peer.isMuted;
          if (peer.isSpeaking !== speakingNow) {
            peer.isSpeaking = speakingNow;
            updatePeerSpeakingUI(peerId, speakingNow);
          }
        }
      }, 100);
    } catch (e) {
      console.warn("VAD remote error:", e);
    }
  }

  function updatePeerSpeakingUI(peerId, isSpeaking) {
    const nestedAvatar = document.querySelector(`.voice-user-row[data-user-id="${peerId}"] .voice-user-avatar`);
    if (nestedAvatar) {
      if (isSpeaking) nestedAvatar.classList.add("speaking");
      else nestedAvatar.classList.remove("speaking");
    }
    const card = document.querySelector(`.voice-card[data-user-id="${peerId}"]`);
    if (card) {
      if (isSpeaking) card.classList.add("speaking");
      else card.classList.remove("speaking");
    }
  }

  // Local Voice Capture & VAD
  async function startLocalAudio() {
    if (state.localStream) return state.localStream;

    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      const selectedMic = el.selectAudioInput.value;
      if (selectedMic) {
        constraints.audio.deviceId = { exact: selectedMic };
      }

      state.localStream = await navigator.mediaDevices.getUserMedia(constraints);

      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = state.audioContext.createMediaStreamSource(state.localStream);
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 256;
      source.connect(state.analyser);

      const buffer = new Uint8Array(state.analyser.frequencyBinCount);

      if (state.vadInterval) clearInterval(state.vadInterval);
      state.vadInterval = setInterval(() => {
        if (!state.localStream || state.currentUser.isMuted) {
          if (state.currentUser.isSpeaking) {
            setLocalSpeaking(false);
          }
          return;
        }

        state.analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;

        if (avg >= state.vadThreshold) {
          if (!state.currentUser.isSpeaking) {
            setLocalSpeaking(true);
          }
          if (state.speakingTimeout) clearTimeout(state.speakingTimeout);
          state.speakingTimeout = setTimeout(() => {
            setLocalSpeaking(false);
          }, 350);
        }
      }, 80);

      return state.localStream;
    } catch (err) {
      console.error("[Audio] Could not access microphone:", err);
      alert("Microphone access is required for voice chat. Please check your system audio permissions.");
      return null;
    }
  }

  function setLocalSpeaking(speaking) {
    state.currentUser.isSpeaking = speaking;

    if (speaking) {
      el.userAvatar.classList.add("speaking");
    } else {
      el.userAvatar.classList.remove("speaking");
    }

    updatePeerSpeakingUI(state.currentUser.id, speaking);

    if (state.socket) {
      state.socket.emit("voice-state-update", {
        isSpeaking: speaking,
        isMuted: state.currentUser.isMuted,
        isDeafened: state.currentUser.isDeafened
      });
    }
  }

  async function handleJoinVoice(channelId) {
    if (state.activeVoiceChannel === channelId) return;

    const stream = await startLocalAudio();
    if (!stream) return;

    playSound("join");
    state.activeVoiceChannel = channelId;
    state.currentUser.voiceChannel = channelId;

    const channelObj = state.channels.voice.find(v => v.id === channelId);
    const roomName = channelObj ? channelObj.name : "Voice Channel";

    el.voiceConnectedBar.classList.remove("hidden");
    el.currentVoiceRoomName.textContent = roomName;
    el.stageRoomName.textContent = roomName;
    el.voiceStage.classList.remove("hidden");

    state.socket.emit("join-voice", { channelId });
    renderVoiceStage();
    renderChannels();
  }

  function handleLeaveVoice(notifyServer = true) {
    if (!state.activeVoiceChannel) return;

    playSound("leave");
    if (notifyServer && state.socket) {
      state.socket.emit("leave-voice");
    }

    state.activeVoiceChannel = null;
    state.currentUser.voiceChannel = null;
    setLocalSpeaking(false);

    for (const [id] of state.peers.entries()) {
      closePeer(id);
    }

    el.voiceConnectedBar.classList.add("hidden");
    el.voiceStage.classList.add("hidden");

    renderVoiceStage();
    renderChannels();
  }

  function toggleMute() {
    state.currentUser.isMuted = !state.currentUser.isMuted;

    if (state.localStream) {
      state.localStream.getAudioTracks().forEach(track => {
        track.enabled = !state.currentUser.isMuted;
      });
    }

    if (state.currentUser.isMuted) {
      el.btnToggleMic.classList.add("active-muted");
    } else {
      el.btnToggleMic.classList.remove("active-muted");
    }

    if (state.socket) {
      state.socket.emit("voice-state-update", {
        isMuted: state.currentUser.isMuted,
        isDeafened: state.currentUser.isDeafened,
        isSpeaking: false
      });
    }

    renderVoiceStage();
    renderChannels();
  }

  function toggleDeafen() {
    state.currentUser.isDeafened = !state.currentUser.isDeafened;

    if (state.currentUser.isDeafened) {
      if (!state.currentUser.isMuted) toggleMute();
      el.btnToggleDeafen.classList.add("active-muted");
    } else {
      el.btnToggleDeafen.classList.remove("active-muted");
    }

    for (const [, peer] of state.peers.entries()) {
      if (peer.audioElem) {
        peer.audioElem.muted = state.currentUser.isDeafened;
      }
    }

    if (state.socket) {
      state.socket.emit("voice-state-update", {
        isMuted: state.currentUser.isMuted,
        isDeafened: state.currentUser.isDeafened,
        isSpeaking: false
      });
    }

    renderVoiceStage();
    renderChannels();
  }

  // Rendering Functions
  function renderChannels() {
    el.textChannelsList.innerHTML = "";
    (state.channels.text || []).forEach(ch => {
      const btn = document.createElement("div");
      btn.className = "channel-btn" + (ch.id === state.activeTextChannel ? " active" : "");
      btn.innerHTML = `
        <svg class="channel-icon-svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5.88 21a.5.5 0 0 1-.49-.59L6 17H2.5a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3.86l.71-4H3.5a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3.93l.6-3.41a.5.5 0 0 1 .49-.41h1a.5.5 0 0 1 .49.59L9.52 9h4l.6-3.41a.5.5 0 0 1 .49-.41h1a.5.5 0 0 1 .49.59L15.62 9H19.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-4.24l-.71 4H18.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-4.31l-.6 3.41a.5.5 0 0 1-.49.41h-1a.5.5 0 0 1-.49-.59L12.09 17H8.09l-.6 3.41a.5.5 0 0 1-.49.41h-1.12zM8.45 15h4l.71-4h-4l-.71 4z"/>
        </svg>
        <span>${ch.name}</span>
      `;
      btn.onclick = () => switchTextChannel(ch.id);
      el.textChannelsList.appendChild(btn);
    });

    el.voiceChannelsList.innerHTML = "";
    (state.channels.voice || []).forEach(v => {
      const channelWrap = document.createElement("div");

      const btn = document.createElement("div");
      btn.className = "channel-btn" + (v.id === state.activeVoiceChannel ? " active" : "");
      btn.innerHTML = `
        <svg class="channel-icon-svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
        <span>${v.name}</span>
      `;
      btn.onclick = () => handleJoinVoice(v.id);
      channelWrap.appendChild(btn);

      const roomMembers = state.allUsers.filter(u => u.voiceChannel === v.id);
      if (roomMembers.length > 0) {
        const nestedList = document.createElement("div");
        nestedList.className = "voice-users-nested";

        roomMembers.forEach(user => {
          const userRow = document.createElement("div");
          userRow.className = "voice-user-row";
          userRow.setAttribute("data-user-id", user.id);

          const isSpeaking = user.id === state.currentUser.id ? state.currentUser.isSpeaking : (state.peers.get(user.id)?.isSpeaking || false);
          const isMuted = user.id === state.currentUser.id ? state.currentUser.isMuted : user.isMuted;
          const isDeafened = user.id === state.currentUser.id ? state.currentUser.isDeafened : user.isDeafened;

          userRow.innerHTML = `
            <div class="voice-user-avatar ${isSpeaking ? "speaking" : ""}" style="background-color: ${user.avatarColor}">
              ${user.avatarInitial || user.username.charAt(0).toUpperCase()}
            </div>
            <span class="voice-user-name">${user.username}${user.id === state.currentUser.id ? " (You)" : ""}</span>
            <div class="voice-user-badges">
              ${isMuted ? "<span class=\"badge-muted\">&#x1F507;</span>" : ""}
              ${isDeafened ? "<span class=\"badge-deafened\">&#x1F3A7;</span>" : ""}
            </div>
          `;
          nestedList.appendChild(userRow);
        });

        channelWrap.appendChild(nestedList);
      }

      el.voiceChannelsList.appendChild(channelWrap);
    });
  }

  function switchTextChannel(channelId) {
    state.activeTextChannel = channelId;
    const ch = state.channels.text.find(c => c.id === channelId);
    if (ch) {
      el.activeChannelName.textContent = ch.name;
      el.activeChannelTopic.textContent = ch.topic;
      el.welcomeChannelTitle.textContent = "Welcome to #" + ch.name + "!";
      el.chatInput.placeholder = "Message #" + ch.name + "...";
    }
    renderChannels();
    renderMessages();
  }

  function renderMessages() {
    el.messagesList.innerHTML = "";
    const list = state.messages[state.activeTextChannel] || [];
    list.forEach(msg => appendMessage(msg));
    scrollChatToBottom();
  }

  function appendMessage(msg) {
    const row = document.createElement("div");
    row.className = "message-row";
    row.innerHTML = `
      <div class="message-avatar" style="background-color: ${msg.avatarColor || "#7C3AED"}">
        ${msg.avatarInitial || (msg.senderName ? msg.senderName.charAt(0).toUpperCase() : "M")}
      </div>
      <div class="message-content-wrap">
        <div class="message-header">
          <span class="message-author" style="color: ${msg.avatarColor || "var(--text-header)"}">${escapeHTML(msg.senderName)}</span>
          <span class="message-timestamp">${msg.timestamp}</span>
        </div>
        <div class="message-text">${escapeHTML(msg.text)}</div>
      </div>
    `;
    el.messagesList.appendChild(row);
    scrollChatToBottom();
  }

  function scrollChatToBottom() {
    el.messagesContainer.scrollTop = el.messagesContainer.scrollHeight;
  }

  function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, tag => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      "\"": "&quot;"
    }[tag] || tag));
  }

  function renderMembers() {
    el.membersList.innerHTML = "";
    el.onlineMembersCount.textContent = state.allUsers.length;

    state.allUsers.forEach(user => {
      const row = document.createElement("div");
      row.className = "member-row";
      const isVoice = user.voiceChannel ? "🔊 In Voice" : "Online";
      row.innerHTML = `
        <div class="member-avatar-wrap">
          <div class="member-avatar" style="background-color: ${user.avatarColor}">
            ${user.avatarInitial || user.username.charAt(0).toUpperCase()}
          </div>
          <div class="user-status-dot online"></div>
        </div>
        <div class="member-info">
          <span class="member-name">${escapeHTML(user.username)}${user.id === state.currentUser.id ? " (You)" : ""}</span>
          <span class="member-status-text">${isVoice}</span>
        </div>
      `;
      el.membersList.appendChild(row);
    });
  }

  function renderVoiceStage() {
    if (!state.activeVoiceChannel) {
      el.voiceStage.classList.add("hidden");
      return;
    }

    el.voiceStage.classList.remove("hidden");
    const participants = state.allUsers.filter(u => u.voiceChannel === state.activeVoiceChannel);
    el.stageCount.textContent = `${participants.length} connected`;
    el.voiceGridCards.innerHTML = "";

    participants.forEach(user => {
      const isMe = user.id === state.currentUser.id;
      const isSpeaking = isMe ? state.currentUser.isSpeaking : (state.peers.get(user.id)?.isSpeaking || false);
      const isMuted = isMe ? state.currentUser.isMuted : user.isMuted;
      const isDeafened = isMe ? state.currentUser.isDeafened : user.isDeafened;

      const card = document.createElement("div");
      card.className = `voice-card ${isSpeaking ? "speaking" : ""}`;
      card.setAttribute("data-user-id", user.id);
      card.innerHTML = `
        <div class="voice-card-icons">
          ${isMuted ? "<span class=\"badge-muted\">&#x1F507;</span>" : ""}
          ${isDeafened ? "<span class=\"badge-deafened\">&#x1F3A7;</span>" : ""}
        </div>
        <div class="voice-card-avatar" style="background-color: ${user.avatarColor}">
          ${user.avatarInitial || user.username.charAt(0).toUpperCase()}
        </div>
        <div class="voice-card-name">${escapeHTML(user.username)}${isMe ? " (You)" : ""}</div>
      `;
      el.voiceGridCards.appendChild(card);
    });
  }

  function sendMessage() {
    const text = el.chatInput.value.trim();
    if (!text || !state.socket) return;

    state.socket.emit("send-message", {
      channelId: state.activeTextChannel,
      text
    });

    el.chatInput.value = "";
    el.chatInput.focus();
  }

  async function loadAudioInputDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      el.selectAudioInput.innerHTML = "";
      const audioInputs = devices.filter(d => d.kind === "audioinput");

      if (audioInputs.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Default Microphone";
        el.selectAudioInput.appendChild(opt);
      } else {
        audioInputs.forEach((d, idx) => {
          const opt = document.createElement("option");
          opt.value = d.deviceId;
          opt.textContent = d.label || `Microphone ${idx + 1}`;
          el.selectAudioInput.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn("Could not enumerate audio devices:", e);
    }
  }

  async function toggleMicTest() {
    if (state.isTestingMic) {
      stopMicTest();
    } else {
      await startMicTest();
    }
  }

  async function startMicTest() {
    try {
      const deviceId = el.selectAudioInput.value;
      const constraints = { audio: deviceId ? { deviceId: { exact: deviceId } } : true };
      state.testStream = await navigator.mediaDevices.getUserMedia(constraints);
      state.testAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = state.testAudioCtx.createMediaStreamSource(state.testStream);
      state.testAnalyser = state.testAudioCtx.createAnalyser();
      state.testAnalyser.fftSize = 256;
      source.connect(state.testAnalyser);

      state.isTestingMic = true;
      el.btnTestMic.textContent = "Stop Testing";
      el.btnTestMic.classList.add("btn-primary");

      const buffer = new Uint8Array(state.testAnalyser.frequencyBinCount);
      const updateVU = () => {
        if (!state.isTestingMic) return;
        state.testAnalyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        const percent = Math.min(100, Math.round((avg / 60) * 100));
        el.vuMeterFill.style.width = percent + "%";
        requestAnimationFrame(updateVU);
      };
      updateVU();
    } catch (e) {
      console.error("Mic test error:", e);
      alert("Could not access microphone for testing.");
    }
  }

  function stopMicTest() {
    state.isTestingMic = false;
    if (state.testStream) {
      state.testStream.getTracks().forEach(t => t.stop());
      state.testStream = null;
    }
    if (state.testAudioCtx) {
      state.testAudioCtx.close();
      state.testAudioCtx = null;
    }
    el.vuMeterFill.style.width = "0%";
    el.btnTestMic.textContent = "Test Microphone";
    el.btnTestMic.classList.remove("btn-primary");
  }

  function setupEvents() {
    el.btnSendMessage.onclick = sendMessage;
    el.chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    el.btnDisconnectVoice.onclick = () => handleLeaveVoice(true);
    el.btnToggleMic.onclick = toggleMute;
    el.btnToggleDeafen.onclick = toggleDeafen;

    // Always-visible Voice Channel Copy Actions!
    if (el.btnCopyVoiceBar) {
      el.btnCopyVoiceBar.onclick = () => {
        copyVoiceChannelInvite(el.btnCopyVoiceBar, el.copyVoiceBarLabel);
      };
    }
    if (el.btnCopyStageInvite) {
      el.btnCopyStageInvite.onclick = () => {
        copyVoiceChannelInvite(el.btnCopyStageInvite, el.copyStageLabel);
      };
    }

    el.btnToggleVoiceStage.onclick = () => el.voiceStage.classList.toggle("hidden");
    el.btnToggleMembers.onclick = () => el.membersSidebar.classList.toggle("hidden");

    // Join Server Modal Handlers
    const openJoinModal = () => {
      const saved = localStorage.getItem("megazacx_server_url") || "";
      el.inputJoinAddress.value = saved;
      el.joinServerModal.classList.remove("hidden");
      el.inputJoinAddress.focus();
    };
    const closeJoinModal = () => {
      el.joinServerModal.classList.add("hidden");
    };

    el.btnAddServer.onclick = openJoinModal;
    el.serverPill.onclick = openJoinModal;
    el.btnCloseJoinModal.onclick = closeJoinModal;

    el.btnSubmitJoin.onclick = () => {
      const addr = el.inputJoinAddress.value.trim();
      if (addr) {
        connectToRemoteServer(addr);
        closeJoinModal();
      }
    };

    el.inputJoinAddress.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        el.btnSubmitJoin.click();
      }
    });

    el.btnResetLocalhost.onclick = () => {
      resetToLocalHost();
      closeJoinModal();
    };

    // Invite Modal Handlers
    const openInviteModal = () => {
      const hostIp = state.serverIps.length > 0 ? state.serverIps[0] : "127.0.0.1";
      el.inviteLanInput.value = `http://${hostIp}:${state.serverPort}`;
      el.inviteModal.classList.remove("hidden");
    };
    const closeInviteModal = () => {
      el.inviteModal.classList.add("hidden");
    };

    el.btnShareLan.onclick = openInviteModal;
    el.btnCloseInviteModal.onclick = closeInviteModal;

    el.btnCopyInviteLan.onclick = async () => {
      await copyToClipboard(el.inviteLanInput.value);
      el.btnCopyInviteLan.textContent = "Copied!";
      showToast("✓ Invite link copied to clipboard!");
      setTimeout(() => { el.btnCopyInviteLan.textContent = "Copy"; }, 2000);
    };

    // Settings Modal
    const openSettings = () => {
      el.settingsModal.classList.remove("hidden");
      loadAudioInputDevices();
    };
    const closeSettings = () => {
      stopMicTest();
      el.settingsModal.classList.add("hidden");
    };

    el.btnOpenSettings.onclick = openSettings;
    el.btnQuickSettings.onclick = openSettings;
    el.btnOpenProfile.onclick = openSettings;
    el.btnCloseSettings.onclick = closeSettings;

    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const tabId = btn.getAttribute("data-tab");
        document.getElementById(tabId).classList.add("active");
      };
    });

    el.colorOptions.forEach(opt => {
      opt.onclick = () => {
        el.colorOptions.forEach(o => o.classList.remove("active"));
        opt.classList.add("active");
        state.currentUser.avatarColor = opt.getAttribute("data-color");
      };
    });

    el.btnSaveProfile.onclick = () => {
      const newName = el.inputNickname.value.trim();
      if (newName) {
        state.currentUser.username = newName;
        state.currentUser.avatarInitial = newName.charAt(0).toUpperCase();
        localStorage.setItem("megazacx_username", newName);
        localStorage.setItem("megazacx_avatar_color", state.currentUser.avatarColor);
        updateProfileUI();

        if (state.socket) {
          state.socket.emit("init-user", {
            username: state.currentUser.username,
            avatarColor: state.currentUser.avatarColor
          });
        }
        closeSettings();
      }
    };

    el.btnTestMic.onclick = toggleMicTest;
    el.sliderSensitivity.value = state.vadThreshold;
    el.sliderSensitivity.oninput = (e) => {
      state.vadThreshold = parseInt(e.target.value, 10);
      localStorage.setItem("megazacx_vad_threshold", state.vadThreshold);
    };

    el.btnConnectRemote.onclick = () => {
      const target = el.inputRemoteUrl.value.trim();
      if (target) {
        connectToRemoteServer(target);
        closeSettings();
      }
    };

    // Electron Titlebar Controls & Initial Connection
    if (window.megaZacxAPI && window.megaZacxAPI.isElectron) {
      el.btnMinimize.onclick = () => window.megaZacxAPI.minimizeWindow();
      el.btnMaximize.onclick = () => window.megaZacxAPI.maximizeWindow();
      el.btnClose.onclick = () => window.megaZacxAPI.closeWindow();

      window.megaZacxAPI.getServerInfo().then(info => {
        if (info) {
          state.serverPort = info.port;
          state.serverIps = info.localIps || [];

          const hostIp = state.serverIps.length > 0 ? state.serverIps[0] : "127.0.0.1";
          el.inviteLanInput.value = `http://${hostIp}:${info.port}`;

          const activeCloudUrl = DEFAULT_CLOUD_SERVER_URL && DEFAULT_CLOUD_SERVER_URL.trim() ? DEFAULT_CLOUD_SERVER_URL.trim() : null;
          el.inviteLanInput.value = activeCloudUrl || `http://${state.serverIps[0] || '127.0.0.1'}:${info.port}`;

          const savedServer = localStorage.getItem("megazacx_server_url");
          if (savedServer && !savedServer.includes('localhost') && !savedServer.includes('127.0.0.1')) {
            initSocket(savedServer);
          } else if (activeCloudUrl) {
            initSocket(activeCloudUrl);
          } else if (savedServer) {
            initSocket(savedServer);
          } else {
            initSocket(`http://localhost:${info.port}`);
          }
        }
      });
    } else {
      el.btnMinimize.style.display = "none";
      el.btnMaximize.style.display = "none";
      el.btnClose.style.display = "none";

      const savedServer = localStorage.getItem("megazacx_server_url");
      initSocket(savedServer || window.location.origin);
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    updateProfileUI();
    setupEvents();
    loadAudioInputDevices();
  });

})();
