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
      accountId: null,
      isGuest: true,
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
    selectedAudioInput: localStorage.getItem('megazacx_selected_mic') || '',
    selectedAudioOutput: localStorage.getItem('megazacx_selected_output') || '',
    availableAudioInputs: [],
    availableAudioOutputs: [],
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
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ],
    iceCandidatePoolSize: 10
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
      setTimeout(() => {
        try {
          if (ctx.state !== 'closed') ctx.close();
        } catch (e) {}
      }, 350);
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
    btnAddTextChannel: document.getElementById('btn-add-text-channel'),
    btnAddVoiceChannel: document.getElementById('btn-add-voice-channel'),
    btnRenameHeaderChannel: document.getElementById('btn-rename-header-channel'),
    createChannelModal: document.getElementById('create-channel-modal'),
    createChannelModalTitle: document.getElementById('create-channel-modal-title'),
    btnCloseCreateChannel: document.getElementById('btn-close-create-channel'),
    btnCancelCreateChannel: document.getElementById('btn-cancel-create-channel'),
    btnSubmitCreateChannel: document.getElementById('btn-submit-create-channel'),
    optionTypeText: document.getElementById('option-type-text'),
    optionTypeVoice: document.getElementById('option-type-voice'),
    inputNewChannelName: document.getElementById('input-new-channel-name'),
    createChannelPrefix: document.getElementById('create-channel-prefix'),
    renameChannelModal: document.getElementById('rename-channel-modal'),
    renameChannelModalTitle: document.getElementById('rename-channel-modal-title'),
    btnCloseRenameChannel: document.getElementById('btn-close-rename-channel'),
    btnCancelRenameChannel: document.getElementById('btn-cancel-rename-channel'),
    btnSubmitRenameChannel: document.getElementById('btn-submit-rename-channel'),
    inputRenameChannelName: document.getElementById('input-rename-channel-name'),
    renameChannelPrefix: document.getElementById('rename-channel-prefix'),
    renameChannelHint: document.getElementById('rename-channel-hint'),
    channelContextMenu: document.getElementById('channel-context-menu'),
    ctxRenameChannel: document.getElementById('ctx-rename-channel'),
    ctxDeleteChannel: document.getElementById('ctx-delete-channel'),
    ctxMenuSeparator: document.getElementById('ctx-menu-separator'),
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
    guildHeaderBanner: document.getElementById('guild-header-banner'),
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
    btnResetRenderCloud: document.getElementById('btn-reset-render-cloud'),
    btnResetCloudSettings: document.getElementById('btn-reset-cloud-settings'),
    btnClearHostSettings: document.getElementById('btn-clear-host-settings'),

    // Settings Modal
    settingsModal: document.getElementById('settings-modal'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    selectAudioInput: document.getElementById('select-audio-input'),
    selectAudioOutput: document.getElementById('select-audio-output'),
    micDeviceStatus: document.getElementById('mic-device-status'),
    btnRefreshAudioDevices: document.getElementById('btn-refresh-audio-devices'),
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
    remoteAudioContainer: document.getElementById('remote-audio-container'),

    // User Account & Multi-Device Auth Elements
    userAccountBadge: document.getElementById('user-account-badge'),
    accountMenuPopover: document.getElementById('account-menu-popover'),
    popoverAvatar: document.getElementById('popover-avatar'),
    popoverUsername: document.getElementById('popover-username'),
    popoverStatus: document.getElementById('popover-status'),
    popoverAccountsList: document.getElementById('popover-accounts-list'),
    btnPopoverAddAccount: document.getElementById('btn-popover-add-account'),
    btnPopoverOpenSettings: document.getElementById('btn-popover-open-settings'),
    btnPopoverLogout: document.getElementById('btn-popover-logout'),
    authModal: document.getElementById('auth-modal'),
    authModalTitle: document.getElementById('auth-modal-title'),
    btnCloseAuthModal: document.getElementById('btn-close-auth-modal'),
    authTabLogin: document.getElementById('auth-tab-login'),
    authTabRegister: document.getElementById('auth-tab-register'),
    authErrorBanner: document.getElementById('auth-error-banner'),
    authForm: document.getElementById('auth-form'),
    authUsername: document.getElementById('auth-username'),
    authPassword: document.getElementById('auth-password'),
    authAvatarGroup: document.getElementById('auth-avatar-group'),
    authColorPicker: document.getElementById('auth-color-picker'),
    btnAuthSubmit: document.getElementById('btn-auth-submit'),
    btnContinueGuest: document.getElementById('btn-continue-guest'),
    profileAccountTitle: document.getElementById('profile-account-title'),
    profileAccountType: document.getElementById('profile-account-type'),
    btnOpenAuthFromSettings: document.getElementById('btn-open-auth-from-settings'),

    // Window & System Tray Settings Elements
    selectCloseAction: document.getElementById('select-close-action'),
    trayStatusTitle: document.getElementById('tray-status-title'),
    trayStatusDesc: document.getElementById('tray-status-desc'),
    trayStatusBadge: document.getElementById('tray-status-badge')
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

  // --- Multi-Device Account & Identity Management ---
  let authMode = "login"; // "login" | "register"
  let selectedAuthAvatarColor = "#7C3AED";
  let cachedAccounts = null;

  function getSavedAccounts() {
    if (cachedAccounts) return cachedAccounts;
    try {
      const raw = localStorage.getItem("megazacx_saved_accounts");
      let list = raw ? JSON.parse(raw) : [];
      cachedAccounts = list;
      return list;
    } catch (e) {
      return [];
    }
  }

  // Load from Electron persistent desktop vault if available
  if (window.megaZacxAPI && typeof window.megaZacxAPI.loadAccountVault === "function") {
    window.megaZacxAPI.loadAccountVault().then(vaultAccounts => {
      if (Array.isArray(vaultAccounts) && vaultAccounts.length > 0) {
        const current = getSavedAccounts();
        let changed = false;
        vaultAccounts.forEach(va => {
          if (!current.some(c => c.username && va.username && c.username.toLowerCase() === va.username.toLowerCase())) {
            current.push(va);
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem("megazacx_saved_accounts", JSON.stringify(current));
          cachedAccounts = current;
          renderAccountSwitcher();
        }
      }
    }).catch(() => {});
  }

  function saveAccount(acc) {
    if (!acc || !acc.id) return;
    const accounts = getSavedAccounts();
    const idx = accounts.findIndex(a => a.id === acc.id || (a.username && acc.username && a.username.toLowerCase() === acc.username.toLowerCase()));
    if (idx >= 0) {
      accounts[idx] = { ...accounts[idx], ...acc };
    } else {
      accounts.push(acc);
    }
    cachedAccounts = accounts;
    localStorage.setItem("megazacx_saved_accounts", JSON.stringify(accounts));

    // Save to Electron desktop vault in Windows AppData
    if (window.megaZacxAPI && typeof window.megaZacxAPI.saveAccountVault === "function") {
      window.megaZacxAPI.saveAccountVault(accounts).catch(() => {});
    }
  }

  function removeSavedAccount(accountId) {
    const accounts = getSavedAccounts().filter(a => a.id !== accountId);
    cachedAccounts = accounts;
    localStorage.setItem("megazacx_saved_accounts", JSON.stringify(accounts));
    if (window.megaZacxAPI && typeof window.megaZacxAPI.saveAccountVault === "function") {
      window.megaZacxAPI.saveAccountVault(accounts).catch(() => {});
    }
    renderAccountSwitcher();
  }

  function onAuthSuccess(user, token, showFeedback = false) {
    state.currentUser.id = user.id;
    state.currentUser.accountId = user.id;
    state.currentUser.username = user.username;
    state.currentUser.avatarColor = user.avatarColor || "#7C3AED";
    state.currentUser.avatarInitial = user.avatarInitial || (user.username ? user.username[0].toUpperCase() : "M");
    state.currentUser.isGuest = false;

    localStorage.setItem("megazacx_auth_token", token);
    localStorage.setItem("megazacx_username", user.username);
    localStorage.setItem("megazacx_avatar_color", state.currentUser.avatarColor);

    saveAccount({
      id: user.id,
      username: user.username,
      avatarColor: state.currentUser.avatarColor,
      token,
      passwordHash: user.passwordHash || (user.user && user.user.passwordHash),
      createdAt: user.createdAt
    });

    updateProfileUI();
    renderAccountSwitcher();

    if (showFeedback) {
      showToast(`Welcome, ${user.username}! Signed in.`);
    }
  }

  function connectAsGuest() {
    state.currentUser.isGuest = true;
    state.currentUser.accountId = null;
    if (state.socket && state.socket.connected) {
      state.socket.emit("init-user", {
        username: state.currentUser.username,
        avatarColor: state.currentUser.avatarColor
      });
    }
    updateProfileUI();
    renderAccountSwitcher();
  }

  function authenticateActiveSession() {
    if (!state.socket || !state.socket.connected) return;
    const token = localStorage.getItem("megazacx_auth_token");
    const saved = getSavedAccounts();

    // 1. Synchronize client account vault with server (self-heals server if it was restarted / spun down)
    if (saved && saved.length > 0) {
      state.socket.emit("auth-sync-vault", { accounts: saved }, () => {
        proceedAuthVerify();
      });
    } else {
      proceedAuthVerify();
    }

    function proceedAuthVerify() {
      if (token) {
        state.socket.emit("auth-verify", { token }, (res) => {
          if (res && res.success && res.user) {
            onAuthSuccess(res.user, token, false);
          } else {
            console.warn("[MegaZacx] Stored token invalid or expired. Running as guest.");
            localStorage.removeItem("megazacx_auth_token");
            connectAsGuest();
          }
        });
      } else {
        connectAsGuest();
      }
    }
  }

  function switchAccount(acc) {
    if (!acc) return;
    if (acc.id === state.currentUser.accountId && !state.currentUser.isGuest) {
      if (el.accountMenuPopover) el.accountMenuPopover.classList.add("hidden");
      return;
    }

    if (state.socket && state.socket.connected) {
      // Sync account record to server first in case server restarted
      state.socket.emit("auth-sync-vault", { accounts: [acc] }, () => {
        if (acc.token) {
          state.socket.emit("auth-verify", { token: acc.token }, (res) => {
            if (res && res.success && res.user) {
              onAuthSuccess(res.user, acc.token, true);
              if (el.accountMenuPopover) el.accountMenuPopover.classList.add("hidden");
            } else {
              // Token expired on server: DO NOT REMOVE SAVED ACCOUNT! Prompt password to re-authenticate!
              showToast(`Session expired for ${acc.username}. Please enter your password to sign in.`);
              openAuthModal("login");
              if (el.authUsername) el.authUsername.value = acc.username;
              if (el.authPassword) {
                el.authPassword.value = "";
                el.authPassword.focus();
              }
            }
          });
        } else {
          openAuthModal("login");
          if (el.authUsername) el.authUsername.value = acc.username;
          if (el.authPassword) el.authPassword.focus();
        }
      });
    }
  }

  function logoutCurrentAccount() {
    const token = localStorage.getItem("megazacx_auth_token");
    if (token && state.socket && state.socket.connected) {
      state.socket.emit("auth-logout", { token });
    }
    localStorage.removeItem("megazacx_auth_token");
    connectAsGuest();
    if (el.accountMenuPopover) el.accountMenuPopover.classList.add("hidden");
    showToast("Logged out of account. Running as Guest.");
  }

  function toggleAccountPopover() {
    if (!el.accountMenuPopover) return;
    const isHidden = el.accountMenuPopover.classList.contains("hidden");
    if (isHidden) {
      renderAccountSwitcher();
      el.accountMenuPopover.classList.remove("hidden");
    } else {
      el.accountMenuPopover.classList.add("hidden");
    }
  }

  function renderAccountSwitcher() {
    if (!el.popoverAccountsList) return;

    if (el.popoverAvatar) {
      el.popoverAvatar.textContent = state.currentUser.avatarInitial;
      el.popoverAvatar.style.backgroundColor = state.currentUser.avatarColor;
    }
    if (el.popoverUsername) {
      el.popoverUsername.textContent = state.currentUser.username;
    }
    if (el.popoverStatus) {
      el.popoverStatus.textContent = state.currentUser.isGuest ? "Guest Mode (Temporary session)" : "Online • Verified Account";
      el.popoverStatus.style.color = state.currentUser.isGuest ? "#F59E0B" : "#34D399";
    }

    const saved = getSavedAccounts();
    const otherAccounts = saved.filter(a => a.id !== state.currentUser.accountId);

    el.popoverAccountsList.innerHTML = "";

    if (otherAccounts.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.style.fontSize = "11px";
      emptyMsg.style.color = "var(--text-muted)";
      emptyMsg.style.padding = "6px 2px";
      emptyMsg.textContent = "No other saved accounts on this device.";
      el.popoverAccountsList.appendChild(emptyMsg);
    } else {
      otherAccounts.forEach(acc => {
        const row = document.createElement("div");
        row.className = "saved-account-row";

        const left = document.createElement("div");
        left.className = "saved-account-left";

        const av = document.createElement("div");
        av.className = "saved-account-avatar";
        av.style.backgroundColor = acc.avatarColor || "#7C3AED";
        av.textContent = (acc.username && acc.username[0] ? acc.username[0].toUpperCase() : "?");

        const name = document.createElement("div");
        name.className = "saved-account-name";
        name.textContent = acc.username;

        left.appendChild(av);
        left.appendChild(name);

        const btnSwitch = document.createElement("button");
        btnSwitch.className = "btn-switch-account";
        btnSwitch.textContent = "Switch";
        btnSwitch.onclick = (e) => {
          e.stopPropagation();
          switchAccount(acc);
        };

        row.appendChild(left);
        row.appendChild(btnSwitch);
        el.popoverAccountsList.appendChild(row);
      });
    }
  }

  function openAuthModal(initialMode = "login") {
    authMode = initialMode;
    if (el.accountMenuPopover) el.accountMenuPopover.classList.add("hidden");
    if (el.authErrorBanner) {
      el.authErrorBanner.classList.add("hidden");
      el.authErrorBanner.textContent = "";
    }
    if (el.authPassword) el.authPassword.value = "";
    updateAuthModalTabs();
    if (el.authModal) el.authModal.classList.remove("hidden");
    if (el.authUsername) el.authUsername.focus();
  }

  function closeAuthModal() {
    if (el.authModal) el.authModal.classList.add("hidden");
    if (el.authPassword) el.authPassword.value = "";
    if (el.authErrorBanner) el.authErrorBanner.classList.add("hidden");
  }

  function updateAuthModalTabs() {
    if (authMode === "register") {
      if (el.authTabRegister) el.authTabRegister.classList.add("active");
      if (el.authTabLogin) el.authTabLogin.classList.remove("active");
      if (el.authModalTitle) el.authModalTitle.textContent = "Create MegaZacx Account";
      if (el.authAvatarGroup) el.authAvatarGroup.classList.remove("hidden");
      if (el.btnAuthSubmit) el.btnAuthSubmit.textContent = "Register & Save Account";
    } else {
      if (el.authTabLogin) el.authTabLogin.classList.add("active");
      if (el.authTabRegister) el.authTabRegister.classList.remove("active");
      if (el.authModalTitle) el.authModalTitle.textContent = "Log In to MegaZacx";
      if (el.authAvatarGroup) el.authAvatarGroup.classList.add("hidden");
      if (el.btnAuthSubmit) el.btnAuthSubmit.textContent = "Log In";
    }
  }

  function showAuthError(msg, typedUsername = null) {
    if (el.authErrorBanner) {
      el.authErrorBanner.innerHTML = "";
      const textSpan = document.createElement("span");
      textSpan.textContent = msg;
      el.authErrorBanner.appendChild(textSpan);

      // If user typed a username that does not exist, provide 1-click register shortcut
      if (msg.includes("does not exist") && typedUsername) {
        const actionRow = document.createElement("div");
        actionRow.style.marginTop = "8px";
        const btnRegisterNow = document.createElement("button");
        btnRegisterNow.className = "btn-secondary";
        btnRegisterNow.style.width = "100%";
        btnRegisterNow.style.fontSize = "11px";
        btnRegisterNow.style.padding = "4px 8px";
        btnRegisterNow.textContent = `Create account "${typedUsername}" now`;
        btnRegisterNow.onclick = (e) => {
          e.preventDefault();
          authMode = "register";
          updateAuthModalTabs();
          if (el.authErrorBanner) el.authErrorBanner.classList.add("hidden");
        };
        actionRow.appendChild(btnRegisterNow);
        el.authErrorBanner.appendChild(actionRow);
      }

      // If user typed incorrect password, provide 1-click reset password button
      if (msg.includes("Incorrect password") && typedUsername) {
        const actionRow = document.createElement("div");
        actionRow.style.marginTop = "8px";
        const btnResetNow = document.createElement("button");
        btnResetNow.className = "btn-secondary";
        btnResetNow.style.width = "100%";
        btnResetNow.style.fontSize = "11px";
        btnResetNow.style.padding = "6px 8px";
        btnResetNow.style.borderColor = "rgba(245, 158, 11, 0.4)";
        btnResetNow.style.color = "#fbbf24";
        btnResetNow.style.cursor = "pointer";
        btnResetNow.textContent = `Reset Password for "${typedUsername}" with entered password`;
        btnResetNow.onclick = (e) => {
          e.preventDefault();
          const newPass = (el.authPassword ? el.authPassword.value : "").trim();
          if (!newPass || newPass.length < 4) {
            alert("Please type your desired password (at least 4 characters) in the password box and click Reset again.");
            if (el.authPassword) el.authPassword.focus();
            return;
          }
          btnResetNow.disabled = true;
          btnResetNow.textContent = "Resetting password...";
          state.socket.emit("auth-reset-password", {
            username: typedUsername,
            newPassword: newPass
          }, (res) => {
            if (!res || !res.success) {
              btnResetNow.disabled = false;
              btnResetNow.textContent = `Reset Password for "${typedUsername}" with entered password`;
              alert((res && res.error) ? res.error : "Failed to reset password.");
            } else {
              onAuthSuccess(res.user, res.token, true);
              closeAuthModal();
            }
          });
        };
        actionRow.appendChild(btnResetNow);
        el.authErrorBanner.appendChild(actionRow);
      }

      el.authErrorBanner.classList.remove("hidden");
    }
  }

  function handleAuthSubmit() {
    const username = (el.authUsername ? el.authUsername.value : "").trim();
    const password = (el.authPassword ? el.authPassword.value : "");

    if (!username) {
      showAuthError("Please enter a username.");
      if (el.authUsername) el.authUsername.focus();
      return;
    }
    if (!password || password.length < 4) {
      showAuthError("Password must be at least 4 characters long.");
      if (el.authPassword) el.authPassword.focus();
      return;
    }

    if (!state.socket || !state.socket.connected) {
      showAuthError("Not connected to server. Please check connection.");
      return;
    }

    if (el.btnAuthSubmit) {
      el.btnAuthSubmit.disabled = true;
      el.btnAuthSubmit.textContent = "Processing...";
    }

    if (authMode === "register") {
      state.socket.emit("auth-register", {
        username,
        password,
        avatarColor: selectedAuthAvatarColor
      }, (res) => {
        if (el.btnAuthSubmit) {
          el.btnAuthSubmit.disabled = false;
          el.btnAuthSubmit.textContent = "Register & Save Account";
        }
        if (!res || !res.success) {
          // DUPLICATE USERNAME VALIDATION OR REJECTION DISPLAY
          const errMsg = (res && res.error) ? res.error : "Registration failed. Please choose another username.";
          showAuthError(errMsg);
        } else {
          onAuthSuccess(res.user, res.token, true);
          closeAuthModal();
        }
      });
    } else {
      const savedAccounts = getSavedAccounts();
      const vaultMatch = savedAccounts.find(a => a.username && a.username.toLowerCase() === username.toLowerCase());

      state.socket.emit("auth-login", {
        username,
        password,
        clientVaultAccount: vaultMatch || null
      }, (res) => {
        if (el.btnAuthSubmit) {
          el.btnAuthSubmit.disabled = false;
          el.btnAuthSubmit.textContent = "Log In";
        }
        if (!res || !res.success) {
          const errMsg = (res && res.error) ? res.error : "Login failed. Invalid username or password.";
          showAuthError(errMsg, username);
        } else {
          onAuthSuccess(res.user, res.token, true);
          closeAuthModal();
        }
      });
    }
  }

  function updateProfileUI() {
    el.userAvatar.textContent = state.currentUser.avatarInitial;
    el.userAvatar.style.backgroundColor = state.currentUser.avatarColor;
    el.userDisplayName.textContent = state.currentUser.username;
    el.inputNickname.value = state.currentUser.username;

    if (el.userAccountBadge) {
      if (!state.currentUser.isGuest) {
        el.userAccountBadge.textContent = "Account";
        el.userAccountBadge.style.color = "#34D399";
        el.userAccountBadge.style.borderColor = "rgba(52, 211, 153, 0.4)";
      } else {
        el.userAccountBadge.textContent = "Guest";
        el.userAccountBadge.style.color = "var(--text-muted)";
        el.userAccountBadge.style.borderColor = "transparent";
      }
    }

    if (el.profileAccountTitle) {
      el.profileAccountTitle.textContent = state.currentUser.username;
    }
    if (el.profileAccountType) {
      el.profileAccountType.textContent = state.currentUser.isGuest ? "Guest Mode (Temporary session)" : "Persistent Account (Verified)";
      el.profileAccountType.style.color = state.currentUser.isGuest ? "#F59E0B" : "#34D399";
    }

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

      authenticateActiveSession();
    });

    state.socket.on("init-success", (data) => {
      state.currentUser.id = data.currentUser.id;
      if (data.currentUser.accountId) state.currentUser.accountId = data.currentUser.accountId;
      state.currentUser.isGuest = Boolean(data.currentUser.isGuest);
      if (data.currentUser.username) state.currentUser.username = data.currentUser.username;
      if (data.currentUser.avatarColor) state.currentUser.avatarColor = data.currentUser.avatarColor;
      state.currentUser.avatarInitial = data.currentUser.avatarInitial || (data.currentUser.username ? data.currentUser.username[0].toUpperCase() : "G");
      updateProfileUI();

      state.channels = data.channels;
      applySavedChannelRenames(state.channels);
      state.allUsers = data.users;
      state.messages = data.messages || {};

      // If active text channel was renamed, update header
      const activeText = (state.channels.text || []).find(c => c.id === state.activeTextChannel);
      if (activeText) {
        if (el.activeChannelName) el.activeChannelName.textContent = activeText.name;
        if (el.activeChannelTopic) el.activeChannelTopic.textContent = activeText.topic || `Discussion in #${activeText.name}`;
        if (el.welcomeChannelTitle) el.welcomeChannelTitle.textContent = "Welcome to #" + activeText.name + "!";
        if (el.chatInput) el.chatInput.placeholder = "Message #" + activeText.name + "...";
      }

      renderChannels();
      renderMessages();
      renderMembers();
    });

    state.socket.on("channels-updated", (channels) => {
      state.channels = channels;
      applySavedChannelRenames(state.channels);

      // Update active text channel header if it was renamed
      const activeText = (channels.text || []).find(c => c.id === state.activeTextChannel);
      if (activeText) {
        if (el.activeChannelName) el.activeChannelName.textContent = activeText.name;
        if (el.activeChannelTopic) el.activeChannelTopic.textContent = activeText.topic || `Discussion in #${activeText.name}`;
        if (el.welcomeChannelTitle) el.welcomeChannelTitle.textContent = "Welcome to #" + activeText.name + "!";
        if (el.chatInput) el.chatInput.placeholder = "Message #" + activeText.name + "...";
      } else if (channels.text && channels.text.length > 0) {
        switchTextChannel(channels.text[0].id);
      }

      // Update voice channel display if currently connected
      if (state.activeVoiceChannel) {
        const activeVoice = (channels.voice || []).find(v => v.id === state.activeVoiceChannel);
        if (activeVoice) {
          const cleanVoiceName = (activeVoice.name || "").replace(/^(\?\?|\?|[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}])\s*/u, "").trim() || "Voice Channel";
          if (el.currentVoiceRoomName) el.currentVoiceRoomName.textContent = cleanVoiceName;
          if (el.stageRoomName) el.stageRoomName.textContent = cleanVoiceName;
        } else {
          handleLeaveVoice(false);
          showToast("Voice channel was removed");
        }
      }

      renderChannels();
      showToast("Channels updated!");
    });

    state.socket.on("error-msg", (data) => {
      if (data && data.message) {
        showToast("⚠️ " + data.message);
      }
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
    const localUrl = "http://localhost:" + (state.serverPort || 3888);
    localStorage.setItem("megazacx_server_url", localUrl);
    initSocket(localUrl);
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
      console.log("[WebRTC] Remote track received from:", peerId, event.streams);
      const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
      peerEntry.stream = stream;

      let audioElem = document.getElementById("audio-peer-" + peerId);
      if (!audioElem) {
        audioElem = document.createElement("audio");
        audioElem.id = "audio-peer-" + peerId;
        audioElem.autoplay = true;
        audioElem.muted = false;
        el.remoteAudioContainer.appendChild(audioElem);
      }
      audioElem.srcObject = stream;
      audioElem.volume = 1.0;
      audioElem.muted = state.currentUser.isDeafened;
      if (state.selectedAudioOutput && typeof audioElem.setSinkId === 'function') {
        audioElem.setSinkId(state.selectedAudioOutput).catch(() => {});
      }
      peerEntry.audioElem = audioElem;

      audioElem.play().then(() => {
        console.log("[WebRTC] Audio playback started for peer:", peerId);
      }).catch(err => {
        console.warn("[WebRTC] Audio play error:", err);
      });

      setupRemoteAudioVAD(peerId, stream);
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
      if (peer.vadInterval) {
        clearInterval(peer.vadInterval);
        peer.vadInterval = null;
      }
      if (peer.audioCtx) {
        try {
          if (peer.audioCtx.state !== 'closed') peer.audioCtx.close();
        } catch (e) {}
        peer.audioCtx = null;
      }
      if (peer.pc) {
        try { peer.pc.close(); } catch (e) {}
      }
      if (peer.audioElem) {
        try {
          peer.audioElem.pause();
          peer.audioElem.srcObject = null;
          peer.audioElem.remove();
        } catch (e) {}
      }
      state.peers.delete(peerId);
    }
  }

  function setupRemoteAudioVAD(peerId, stream) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const checkInterval = setInterval(() => {
        if (!state.peers.has(peerId)) {
          clearInterval(checkInterval);
          try {
            if (audioCtx.state !== 'closed') audioCtx.close();
          } catch (e) {}
          return;
        }

        // When document is occluded / minimized, skip DOM speaking ring updates
        if (document.hidden) return;

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
      }, 180);

      const peer = state.peers.get(peerId);
      if (peer) {
        peer.audioCtx = audioCtx;
        peer.vadInterval = checkInterval;
      }
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

  // Bulletproof Multi-Device Microphone Stream Resolution
  async function getMicrophoneStream(preferredDeviceId) {
    const baseAudioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };

    // Strategy 1: Request preferred device using { ideal: preferredDeviceId }
    // (Never use { exact: ... } which causes OverconstrainedError on device change or Windows default)
    if (preferredDeviceId && preferredDeviceId !== 'default' && preferredDeviceId !== 'communications') {
      try {
        const constraints = {
          audio: {
            ...baseAudioConstraints,
            deviceId: { ideal: preferredDeviceId }
          }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream && stream.getAudioTracks().length > 0) {
          console.log("[Audio] Acquired preferred microphone stream:", preferredDeviceId);
          return stream;
        }
      } catch (err) {
        console.warn("[Audio] Could not open preferred mic via ideal constraint, trying default:", err);
      }
    }

    // Strategy 2: Enhanced default audio
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: baseAudioConstraints
      });
      if (stream && stream.getAudioTracks().length > 0) {
        console.log("[Audio] Acquired enhanced default microphone stream");
        return stream;
      }
    } catch (err) {
      console.warn("[Audio] Enhanced default audio failed, trying basic audio:", err);
    }

    // Strategy 3: Basic unconstrained audio
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  }

  function setupLocalVAD() {
    if (!state.localStream) return;

    if (state.audioContext) {
      try {
        if (state.audioContext.state !== 'closed') state.audioContext.close();
      } catch (e) {}
    }

    state.audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    const source = state.audioContext.createMediaStreamSource(state.localStream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 128;
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
    }, 150);
  }

  // Local Voice Capture & VAD with Multi-Device Support
  async function startLocalAudio() {
    if (state.localStream && state.localStream.active && state.localStream.getAudioTracks().some(t => t.readyState === 'live')) {
      return state.localStream;
    }

    try {
      const selectedMic = el.selectAudioInput ? el.selectAudioInput.value : (localStorage.getItem('megazacx_selected_mic') || '');
      state.localStream = await getMicrophoneStream(selectedMic);

      if (!state.localStream) {
        throw new Error("No active audio stream could be captured");
      }

      // Ensure initial track mute state matches currentUser.isMuted
      state.localStream.getAudioTracks().forEach(track => {
        track.enabled = !state.currentUser.isMuted;
      });

      setupLocalVAD();

      // Ensure any existing peers in state.peers receive the newly acquired audio track
      state.peers.forEach((peerEntry, peerId) => {
        if (peerEntry.pc) {
          const track = state.localStream.getAudioTracks()[0];
          const senders = peerEntry.pc.getSenders();
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          if (audioSender && track) {
            audioSender.replaceTrack(track).catch(e => console.warn('[WebRTC] replaceTrack error for peer:', peerId, e));
          } else if (track) {
            try {
              peerEntry.pc.addTrack(track, state.localStream);
            } catch (e) {}
          }
        }
      });

      return state.localStream;
    } catch (err) {
      console.error("[Audio] Could not access microphone:", err);
      showToast("?? Could not access microphone. Please check system permissions.");
      return null;
    }
  }

  // Live Hot-Swapping of Voice Input Device
  async function switchLocalAudioDevice(newDeviceId) {
    localStorage.setItem('megazacx_selected_mic', newDeviceId || '');
    state.selectedAudioInput = newDeviceId || '';

    // If microphone test is active in settings, immediately restart test with new device
    if (state.isTestingMic) {
      await startMicTest();
    }

    // If currently connected to a voice channel, hot-swap the stream & WebRTC tracks
    if (state.activeVoiceChannel) {
      try {
        const newStream = await getMicrophoneStream(newDeviceId);
        if (!newStream) return;

        const newTrack = newStream.getAudioTracks()[0];
        if (newTrack) {
          newTrack.enabled = !state.currentUser.isMuted;
        }

        // Seamlessly update all active WebRTC peer connections
        for (const [peerId, peerEntry] of state.peers.entries()) {
          if (peerEntry.pc) {
            const senders = peerEntry.pc.getSenders();
            const audioSender = senders.find(s => s.track && s.track.kind === 'audio') || senders[0];
            if (audioSender && newTrack) {
              try {
                await audioSender.replaceTrack(newTrack);
                console.log('[WebRTC] Replaced audio track for peer:', peerId);
              } catch (e) {
                console.warn('[WebRTC] Error replacing track for peer:', peerId, e);
              }
            } else if (newTrack) {
              try {
                peerEntry.pc.addTrack(newTrack, newStream);
              } catch (e) {}
            }
          }
        }

        // Stop old stream
        if (state.localStream) {
          try {
            state.localStream.getTracks().forEach(t => t.stop());
          } catch (e) {}
        }

        state.localStream = newStream;
        setupLocalVAD();

        const selectedOption = el.selectAudioInput ? el.selectAudioInput.options[el.selectAudioInput.selectedIndex] : null;
        const micLabel = selectedOption ? selectedOption.textContent : "Microphone";
        showToast("? Switched to " + micLabel);
      } catch (err) {
        console.error("[Audio] Failed to switch microphone device:", err);
        showToast("?? Failed to switch microphone: " + err.message);
      }
    }
  }

  function stopLocalAudio() {
    if (state.vadInterval) {
      clearInterval(state.vadInterval);
      state.vadInterval = null;
    }
    if (state.speakingTimeout) {
      clearTimeout(state.speakingTimeout);
      state.speakingTimeout = null;
    }
    if (state.localStream) {
      try {
        state.localStream.getTracks().forEach(track => {
          try { track.stop(); } catch (e) {}
        });
      } catch (e) {}
      state.localStream = null;
    }
    if (state.audioContext) {
      try {
        if (state.audioContext.state !== 'closed') state.audioContext.close();
      } catch (e) {}
      state.audioContext = null;
    }
    state.analyser = null;
    setLocalSpeaking(false);
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
    const roomName = channelObj ? (channelObj.name || "").replace(/^(\?\?|\?|[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}])\s*/u, "").trim() : "Voice Channel";

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
    stopLocalAudio();

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

  // Channel Context Menu & Rename Modal State
  let targetRenameChannel = { id: null, name: '', type: 'text' };
  let activeContextMenuTarget = null;

  function applySavedChannelRenames(channels) {
    if (!channels) return;
    try {
      const saved = JSON.parse(localStorage.getItem('megazacx_channel_renames') || '{}');
      if (channels.text && Array.isArray(channels.text)) {
        channels.text.forEach(c => {
          if (saved[c.id]) {
            c.name = saved[c.id];
            if (!c.topic || c.topic.startsWith('Discussion in #') || c.topic === 'Main chat room for MegaZacx.') {
              c.topic = `Discussion in #${saved[c.id]}`;
            }
          }
        });
      }
      if (channels.voice && Array.isArray(channels.voice)) {
        channels.voice.forEach(v => {
          if (saved[v.id]) {
            v.name = saved[v.id];
          }
        });
      }
    } catch (e) {
      console.warn('[MegaZacx] Failed to apply saved channel renames:', e);
    }
  }

  function openRenameChannelModal(channelId, currentName, type = 'text') {
    closeChannelContextMenu();
    targetRenameChannel = { id: channelId, name: currentName, type };
    if (el.renameChannelModalTitle) {
      el.renameChannelModalTitle.textContent = type === 'voice' ? 'Rename Voice Channel' : 'Rename Text Channel';
    }
    if (el.renameChannelPrefix) {
      el.renameChannelPrefix.textContent = type === 'voice' ? '🔊' : '#';
    }
    if (el.renameChannelHint) {
      el.renameChannelHint.textContent = type === 'voice'
        ? 'Enter a descriptive name for your voice channel.'
        : 'Channel names will be formatted with lowercase letters, numbers, and dashes.';
    }
    if (el.inputRenameChannelName) {
      el.inputRenameChannelName.value = currentName;
    }
    if (el.renameChannelModal) {
      el.renameChannelModal.classList.remove('hidden');
    }
    setTimeout(() => {
      if (el.inputRenameChannelName) {
        el.inputRenameChannelName.focus();
        el.inputRenameChannelName.select();
      }
    }, 50);
  }

  function closeRenameChannelModal() {
    if (el.renameChannelModal) {
      el.renameChannelModal.classList.add('hidden');
    }
    targetRenameChannel = { id: null, name: '', type: 'text' };
  }

  function submitRenameChannel() {
    if (!targetRenameChannel.id) return;
    const rawName = el.inputRenameChannelName ? el.inputRenameChannelName.value.trim() : '';
    if (!rawName) {
      showToast('⚠️ Please enter a channel name');
      return;
    }

    // Format clean name
    let cleanName = rawName;
    if (targetRenameChannel.type === 'text') {
      cleanName = rawName.toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 32);
      if (!cleanName) {
        showToast('⚠️ Channel name must contain letters, numbers, dashes, or underscores');
        return;
      }
    } else {
      cleanName = rawName.replace(/^(\?\?|\?|[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}])\s*/u, '').trim().slice(0, 36) || rawName.slice(0, 36);
      if (!cleanName) {
        showToast('⚠️ Please enter a valid channel name');
        return;
      }
    }

    // 1. Optimistically update local channel state
    const channelList = targetRenameChannel.type === 'voice' ? state.channels.voice : state.channels.text;
    const targetChan = (channelList || []).find(c => c.id === targetRenameChannel.id);
    if (targetChan) {
      targetChan.name = cleanName;
      if (targetRenameChannel.type === 'text') {
        targetChan.topic = `Discussion in #${cleanName}`;
      }
    }

    // 2. Persist custom rename to localStorage so it survives app restarts and cloud server reboots
    try {
      const saved = JSON.parse(localStorage.getItem('megazacx_channel_renames') || '{}');
      saved[targetRenameChannel.id] = cleanName;
      localStorage.setItem('megazacx_channel_renames', JSON.stringify(saved));
    } catch (e) {
      console.warn('[MegaZacx] Failed to save channel rename to localStorage:', e);
    }

    // 3. Update active headers immediately if the renamed channel is active
    if (targetRenameChannel.id === state.activeTextChannel) {
      if (el.activeChannelName) el.activeChannelName.textContent = cleanName;
      if (el.activeChannelTopic) el.activeChannelTopic.textContent = `Discussion in #${cleanName}`;
      if (el.welcomeChannelTitle) el.welcomeChannelTitle.textContent = "Welcome to #" + cleanName + "!";
      if (el.chatInput) el.chatInput.placeholder = "Message #" + cleanName + "...";
    }

    if (state.activeVoiceChannel && targetRenameChannel.id === state.activeVoiceChannel) {
      if (el.currentVoiceRoomName) el.currentVoiceRoomName.textContent = cleanName;
      if (el.stageRoomName) el.stageRoomName.textContent = cleanName;
    }

    // 4. Re-render the sidebar channels list right away
    renderChannels();
    closeRenameChannelModal();

    // 5. Broadcast to connected server via socket (so other peers see it too if supported)
    if (state.socket && state.socket.connected) {
      state.socket.emit('rename-channel', {
        channelId: targetRenameChannel.id,
        name: cleanName,
        type: targetRenameChannel.type
      });
    }

    showToast(`✓ Channel renamed to "${cleanName}"`);
  }

  function openChannelContextMenu(x, y, channel, type) {
    closeChannelContextMenu();
    activeContextMenuTarget = { channel, type };

    if (!el.channelContextMenu) return;

    const menuWidth = 180;
    const menuHeight = 110;
    const posX = Math.max(10, Math.min(x, window.innerWidth - menuWidth - 10));
    const posY = Math.max(10, Math.min(y, window.innerHeight - menuHeight - 10));

    el.channelContextMenu.style.left = `${posX}px`;
    el.channelContextMenu.style.top = `${posY}px`;
    el.channelContextMenu.classList.remove('hidden');

    const list = type === 'voice' ? state.channels.voice : state.channels.text;
    if (el.ctxDeleteChannel) {
      if (list && list.length <= 1) {
        el.ctxDeleteChannel.style.display = 'none';
        if (el.ctxMenuSeparator) el.ctxMenuSeparator.style.display = 'none';
      } else {
        el.ctxDeleteChannel.style.display = 'flex';
        if (el.ctxMenuSeparator) el.ctxMenuSeparator.style.display = 'block';
      }
    }
  }

  function closeChannelContextMenu() {
    if (el.channelContextMenu) {
      el.channelContextMenu.classList.add('hidden');
    }
    activeContextMenuTarget = null;
  }

  // Rendering Functions
  function renderChannels() {
    el.textChannelsList.innerHTML = "";
    (state.channels.text || []).forEach(ch => {
      const btn = document.createElement("div");
      btn.className = "channel-btn" + (ch.id === state.activeTextChannel ? " active" : "");
      btn.setAttribute("data-channel-id", ch.id);
      btn.setAttribute("data-channel-type", "text");
      btn.setAttribute("title", `#${ch.name} (Right-click or click pencil to rename)`);

      const content = document.createElement("div");
      content.className = "channel-btn-content";
      content.innerHTML = `
        <svg class="channel-icon-svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5.88 21a.5.5 0 0 1-.49-.59L6 17H2.5a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3.86l.71-4H3.5a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3.93l.6-3.41a.5.5 0 0 1 .49-.41h1a.5.5 0 0 1 .49.59L9.52 9h4l.6-3.41a.5.5 0 0 1 .49-.41h1a.5.5 0 0 1 .49.59L15.62 9H19.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-4.24l-.71 4H18.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-4.31l-.6 3.41a.5.5 0 0 1-.49.41h-1a.5.5 0 0 1-.49-.59L12.09 17H8.09l-.6 3.41a.5.5 0 0 1-.49.41h-1.12zM8.45 15h4l.71-4h-4l-.71 4z"/>
        </svg>
        <span class="channel-name-text">${escapeHTML(ch.name)}</span>
      `;

      const actions = document.createElement("div");
      actions.className = "channel-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "btn-channel-action btn-channel-edit";
      editBtn.title = "Rename Channel";
      editBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        </svg>
      `;
      editBtn.onclick = (e) => {
        e.stopPropagation();
        openRenameChannelModal(ch.id, ch.name, "text");
      };
      actions.appendChild(editBtn);

      btn.appendChild(content);
      btn.appendChild(actions);

      btn.onclick = () => switchTextChannel(ch.id);
      btn.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openChannelContextMenu(e.clientX, e.clientY, ch, "text");
      };

      el.textChannelsList.appendChild(btn);
    });

    el.voiceChannelsList.innerHTML = "";
    (state.channels.voice || []).forEach(v => {
      const channelWrap = document.createElement("div");

      // Strip any accidental '??' or emoji prefixes from name
      const cleanVoiceName = escapeHTML((v.name || "").replace(/^(\?\?|\?|[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}])\s*/u, "").trim());

      const btn = document.createElement("div");
      btn.className = "channel-btn" + (v.id === state.activeVoiceChannel ? " active" : "");
      btn.setAttribute("data-channel-id", v.id);
      btn.setAttribute("data-channel-type", "voice");
      btn.setAttribute("title", `${cleanVoiceName} (Right-click or click pencil to rename)`);

      const content = document.createElement("div");
      content.className = "channel-btn-content";
      content.innerHTML = `
        <svg class="channel-icon-svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
        <span class="channel-name-text">${cleanVoiceName}</span>
      `;

      const actions = document.createElement("div");
      actions.className = "channel-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "btn-channel-action btn-channel-edit";
      editBtn.title = "Rename Channel";
      editBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        </svg>
      `;
      editBtn.onclick = (e) => {
        e.stopPropagation();
        openRenameChannelModal(v.id, cleanVoiceName, "voice");
      };
      actions.appendChild(editBtn);

      btn.appendChild(content);
      btn.appendChild(actions);

      btn.onclick = () => handleJoinVoice(v.id);
      btn.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openChannelContextMenu(e.clientX, e.clientY, v, "voice");
      };

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

  // Enhanced Device Enumeration with Permission Probing and Deduplication
  async function loadAudioInputDevices(forceProbe = false) {
    try {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
        if (el.micDeviceStatus) {
          el.micDeviceStatus.textContent = "Media devices not supported in this environment";
          el.micDeviceStatus.className = "device-status-caption error";
        }
        return;
      }

      let devices = await navigator.mediaDevices.enumerateDevices();
      let audioInputs = devices.filter(d => d.kind === "audioinput");

      // In Chromium, device labels can be blank "" until getUserMedia has been invoked once
      const needsProbe = forceProbe || (audioInputs.length > 0 && audioInputs.some(d => !d.label));
      if (needsProbe) {
        try {
          const probeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          probeStream.getTracks().forEach(t => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
          audioInputs = devices.filter(d => d.kind === "audioinput");
        } catch (probeErr) {
          console.warn("[Audio] Device label probe getUserMedia skipped or denied:", probeErr);
        }
      }

      const audioOutputs = devices.filter(d => d.kind === "audiooutput");
      state.availableAudioInputs = audioInputs;
      state.availableAudioOutputs = audioOutputs;

      // 1. Populate Microphone Dropdown
      if (el.selectAudioInput) {
        el.selectAudioInput.innerHTML = "";

        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = "Default Microphone (System Default)";
        el.selectAudioInput.appendChild(defaultOpt);

        const seenLabels = new Set();
        const validInputs = audioInputs.filter(d => {
          if (d.deviceId === 'default' || d.deviceId === 'communications') return false;
          const key = (d.label || d.deviceId).toLowerCase();
          if (seenLabels.has(key)) return false;
          seenLabels.add(key);
          return true;
        });

        if (validInputs.length > 0) {
          validInputs.forEach((d, idx) => {
            const opt = document.createElement("option");
            opt.value = d.deviceId;
            opt.textContent = d.label || `Microphone ${idx + 1}`;
            el.selectAudioInput.appendChild(opt);
          });
        } else {
          audioInputs.forEach((d, idx) => {
            if (d.deviceId !== 'communications') {
              const opt = document.createElement("option");
              opt.value = d.deviceId;
              opt.textContent = d.label || `Microphone ${idx + 1}`;
              el.selectAudioInput.appendChild(opt);
            }
          });
        }

        // Restore saved preference if device is still connected
        const savedMic = localStorage.getItem('megazacx_selected_mic') || '';
        const matchingOpt = Array.from(el.selectAudioInput.options).find(o => o.value === savedMic);
        if (matchingOpt) {
          el.selectAudioInput.value = savedMic;
        } else {
          el.selectAudioInput.value = "";
        }

        if (el.micDeviceStatus) {
          const count = validInputs.length || audioInputs.length;
          el.micDeviceStatus.textContent = count > 0
            ? `? ${count} input device${count > 1 ? 's' : ''} detected & ready`
            : "?? No microphone detected. Please connect an audio input device.";
          el.micDeviceStatus.className = count > 0 ? "device-status-caption ready" : "device-status-caption error";
        }
      }

      // 2. Populate Audio Output Dropdown (Headphones / Speakers)
      if (el.selectAudioOutput) {
        el.selectAudioOutput.innerHTML = "";
        const defaultOutOpt = document.createElement("option");
        defaultOutOpt.value = "";
        defaultOutOpt.textContent = "Default Output (System Default)";
        el.selectAudioOutput.appendChild(defaultOutOpt);

        const seenOutLabels = new Set();
        audioOutputs.forEach((d, idx) => {
          if (d.deviceId === 'default' || d.deviceId === 'communications') return;
          const key = (d.label || d.deviceId).toLowerCase();
          if (seenOutLabels.has(key)) return;
          seenOutLabels.add(key);

          const opt = document.createElement("option");
          opt.value = d.deviceId;
          opt.textContent = d.label || `Speaker/Headset ${idx + 1}`;
          el.selectAudioOutput.appendChild(opt);
        });

        const savedOut = localStorage.getItem('megazacx_selected_output') || '';
        const matchingOut = Array.from(el.selectAudioOutput.options).find(o => o.value === savedOut);
        if (matchingOut) {
          el.selectAudioOutput.value = savedOut;
        } else {
          el.selectAudioOutput.value = "";
        }
      }
    } catch (e) {
      console.warn("[Audio] Could not enumerate audio devices:", e);
    }
  }

  async function setAudioOutputDevice(deviceId) {
    localStorage.setItem('megazacx_selected_output', deviceId || '');
    state.selectedAudioOutput = deviceId || '';

    if (el.remoteAudioContainer) {
      const audioElements = el.remoteAudioContainer.querySelectorAll('audio');
      for (const audioEl of audioElements) {
        if (typeof audioEl.setSinkId === 'function') {
          try {
            await audioEl.setSinkId(deviceId || '');
          } catch (err) {
            console.warn('[Audio] Failed to set sinkId on audio element:', err);
          }
        }
      }
    }
    const selectedOption = el.selectAudioOutput ? el.selectAudioOutput.options[el.selectAudioOutput.selectedIndex] : null;
    const outLabel = selectedOption ? selectedOption.textContent : "Output Device";
    showToast("? Audio output set to " + outLabel);
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
      stopMicTest();
      const deviceId = el.selectAudioInput ? el.selectAudioInput.value : '';
      state.testStream = await getMicrophoneStream(deviceId);
      state.testAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = state.testAudioCtx.createMediaStreamSource(state.testStream);
      state.testAnalyser = state.testAudioCtx.createAnalyser();
      state.testAnalyser.fftSize = 256;
      source.connect(state.testAnalyser);

      state.isTestingMic = true;
      if (el.btnTestMic) {
        el.btnTestMic.textContent = "Stop Testing";
        el.btnTestMic.classList.add("btn-primary");
      }

      const buffer = new Uint8Array(state.testAnalyser.frequencyBinCount);
      const updateVU = () => {
        if (!state.isTestingMic) return;
        state.testAnalyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        const percent = Math.min(100, Math.round((avg / 60) * 100));
        if (el.vuMeterFill) el.vuMeterFill.style.width = percent + "%";
        requestAnimationFrame(updateVU);
      };
      updateVU();
    } catch (e) {
      console.error("Mic test error:", e);
      showToast("?? Could not access microphone for testing.");
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


    // Create Channel Modal Handlers
    let selectedChannelType = 'text';

    const selectChannelType = (type) => {
      selectedChannelType = type;
      if (type === 'text') {
        if (el.optionTypeText) el.optionTypeText.classList.add('active');
        if (el.optionTypeVoice) el.optionTypeVoice.classList.remove('active');
        if (el.createChannelPrefix) el.createChannelPrefix.textContent = '#';
        if (el.inputNewChannelName) el.inputNewChannelName.placeholder = 'new-channel';
        if (el.createChannelModalTitle) el.createChannelModalTitle.textContent = 'Create Text Channel';
      } else {
        if (el.optionTypeVoice) el.optionTypeVoice.classList.add('active');
        if (el.optionTypeText) el.optionTypeText.classList.remove('active');
        if (el.createChannelPrefix) el.createChannelPrefix.textContent = '🔊';
        if (el.inputNewChannelName) el.inputNewChannelName.placeholder = 'Squad Room';
        if (el.createChannelModalTitle) el.createChannelModalTitle.textContent = 'Create Voice Channel';
      }
    };

    const openCreateChannelModal = (defaultType = 'text') => {
      selectChannelType(defaultType);
      if (el.inputNewChannelName) el.inputNewChannelName.value = '';
      if (el.createChannelModal) el.createChannelModal.classList.remove('hidden');
      setTimeout(() => {
        if (el.inputNewChannelName) el.inputNewChannelName.focus();
      }, 50);
    };

    const closeCreateChannelModal = () => {
      if (el.createChannelModal) el.createChannelModal.classList.add('hidden');
      if (el.inputNewChannelName) el.inputNewChannelName.value = '';
    };

    if (el.btnAddTextChannel) el.btnAddTextChannel.onclick = () => openCreateChannelModal('text');
    if (el.btnAddVoiceChannel) el.btnAddVoiceChannel.onclick = () => openCreateChannelModal('voice');
    if (el.btnCloseCreateChannel) el.btnCloseCreateChannel.onclick = closeCreateChannelModal;
    if (el.btnCancelCreateChannel) el.btnCancelCreateChannel.onclick = closeCreateChannelModal;

    if (el.optionTypeText) el.optionTypeText.onclick = () => selectChannelType('text');
    if (el.optionTypeVoice) el.optionTypeVoice.onclick = () => selectChannelType('voice');

    const submitCreateChannel = () => {
      const name = el.inputNewChannelName ? el.inputNewChannelName.value.trim() : '';
      if (!name) {
        showToast('?? Please enter a channel name');
        return;
      }
      if (state.socket) {
        state.socket.emit('create-channel', {
          type: selectedChannelType,
          name: name
        });
        closeCreateChannelModal();
        showToast('? Creating channel: ' + name);
      } else {
        showToast('?? Not connected to server');
      }
    };

    if (el.btnSubmitCreateChannel) el.btnSubmitCreateChannel.onclick = submitCreateChannel;
    if (el.inputNewChannelName) {
      el.inputNewChannelName.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitCreateChannel();
        }
      };
    }

    // Rename Channel Modal Handlers
    if (el.btnCloseRenameChannel) el.btnCloseRenameChannel.onclick = closeRenameChannelModal;
    if (el.btnCancelRenameChannel) el.btnCancelRenameChannel.onclick = closeRenameChannelModal;
    if (el.btnSubmitRenameChannel) el.btnSubmitRenameChannel.onclick = submitRenameChannel;
    if (el.inputRenameChannelName) {
      el.inputRenameChannelName.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitRenameChannel();
        } else if (e.key === 'Escape') {
          closeRenameChannelModal();
        }
      };
    }

    // Header Channel Rename Handlers
    if (el.btnRenameHeaderChannel) {
      el.btnRenameHeaderChannel.onclick = () => {
        const current = (state.channels.text || []).find(c => c.id === state.activeTextChannel);
        if (current) {
          openRenameChannelModal(current.id, current.name, 'text');
        }
      };
    }

    if (el.activeChannelName) {
      el.activeChannelName.style.cursor = 'pointer';
      el.activeChannelName.title = 'Click to rename channel';
      el.activeChannelName.onclick = () => {
        const current = (state.channels.text || []).find(c => c.id === state.activeTextChannel);
        if (current) {
          openRenameChannelModal(current.id, current.name, 'text');
        }
      };
    }

    // Channel Context Menu Handlers
    window.addEventListener('click', () => closeChannelContextMenu());
    window.addEventListener('blur', () => closeChannelContextMenu());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeChannelContextMenu();
        closeRenameChannelModal();
        closeCreateChannelModal();
      }
    });

    if (el.ctxRenameChannel) {
      el.ctxRenameChannel.onclick = (e) => {
        e.stopPropagation();
        if (activeContextMenuTarget) {
          const { channel, type } = activeContextMenuTarget;
          closeChannelContextMenu();
          const currentName = type === 'voice'
            ? (channel.name || '').replace(/^(\?\?|\?|[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}])\s*/u, '').trim()
            : channel.name;
          openRenameChannelModal(channel.id, currentName, type);
        }
      };
    }

    if (el.ctxDeleteChannel) {
      el.ctxDeleteChannel.onclick = (e) => {
        e.stopPropagation();
        if (activeContextMenuTarget) {
          const { channel, type } = activeContextMenuTarget;
          closeChannelContextMenu();
          const displayName = type === 'voice' ? channel.name : `#${channel.name}`;
          if (confirm(`Are you sure you want to delete ${displayName}? This cannot be undone.`)) {
            try {
              const saved = JSON.parse(localStorage.getItem('megazacx_channel_renames') || '{}');
              delete saved[channel.id];
              localStorage.setItem('megazacx_channel_renames', JSON.stringify(saved));
            } catch (err) {}

            const list = type === 'voice' ? state.channels.voice : state.channels.text;
            const idx = (list || []).findIndex(c => c.id === channel.id);
            if (idx !== -1 && list.length > 1) {
              list.splice(idx, 1);
              if (type === 'text' && state.activeTextChannel === channel.id) {
                switchTextChannel(state.channels.text[0].id);
              }
              renderChannels();
            }

            if (state.socket) {
              state.socket.emit('delete-channel', { channelId: channel.id, type });
            }
            showToast(`Channel ${displayName} deleted`);
          }
        }
      };
    }

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

    if (el.btnAddServer) el.btnAddServer.onclick = openJoinModal;
    if (el.guildHeaderBanner) el.guildHeaderBanner.onclick = openJoinModal;
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

    const connectToRenderCloud = () => {
      localStorage.removeItem("megazacx_server_url");
      if (el.inputJoinAddress) el.inputJoinAddress.value = "https://megazacx-server.onrender.com";
      if (el.inputRemoteUrl) el.inputRemoteUrl.value = "https://megazacx-server.onrender.com";
      initSocket("https://megazacx-server.onrender.com");
      if (el.joinServerModal) el.joinServerModal.classList.add("hidden");
      if (el.settingsModal) el.settingsModal.classList.add("hidden");
      showToast("? Connected to 24/7 Render Cloud Server!");
    };

    const clearCustomHost = () => {
      localStorage.removeItem("megazacx_server_url");
      if (el.inputJoinAddress) el.inputJoinAddress.value = "";
      if (el.inputRemoteUrl) el.inputRemoteUrl.value = "";
      initSocket("https://megazacx-server.onrender.com");
      showToast("? Custom host cleared. Connected to default Cloud Server.");
    };

    if (el.btnResetRenderCloud) el.btnResetRenderCloud.onclick = connectToRenderCloud;
    if (el.btnResetCloudSettings) el.btnResetCloudSettings.onclick = connectToRenderCloud;
    if (el.btnClearHostSettings) el.btnClearHostSettings.onclick = clearCustomHost;

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
    if (el.btnQuickSettings) el.btnQuickSettings.onclick = openSettings;
    if (el.btnOpenProfile) {
      el.btnOpenProfile.onclick = (e) => {
        e.stopPropagation();
        toggleAccountPopover();
      };
    }
    el.btnCloseSettings.onclick = closeSettings;

    // Popover actions
    if (el.btnPopoverOpenSettings) {
      el.btnPopoverOpenSettings.onclick = () => {
        if (el.accountMenuPopover) el.accountMenuPopover.classList.add("hidden");
        openSettings();
        const profileTabBtn = document.querySelector(`.settings-tabs .tab-btn[data-tab="tab-profile"]`);
        if (profileTabBtn) profileTabBtn.click();
      };
    }
    if (el.btnPopoverAddAccount) {
      el.btnPopoverAddAccount.onclick = () => {
        openAuthModal("login");
      };
    }
    if (el.btnPopoverLogout) {
      el.btnPopoverLogout.onclick = () => {
        logoutCurrentAccount();
      };
    }

    // Close popover on click outside
    document.addEventListener("click", (e) => {
      if (el.accountMenuPopover && !el.accountMenuPopover.classList.contains("hidden")) {
        if (!el.accountMenuPopover.contains(e.target) && !el.btnOpenProfile.contains(e.target)) {
          el.accountMenuPopover.classList.add("hidden");
        }
      }
    });

    // Auth Modal event listeners
    if (el.btnCloseAuthModal) el.btnCloseAuthModal.onclick = closeAuthModal;
    if (el.btnContinueGuest) {
      el.btnContinueGuest.onclick = () => {
        closeAuthModal();
        connectAsGuest();
        showToast("Continuing as Guest");
      };
    }
    if (el.btnOpenAuthFromSettings) {
      el.btnOpenAuthFromSettings.onclick = () => {
        closeSettings();
        openAuthModal("login");
      };
    }
    if (el.authTabLogin) {
      el.authTabLogin.onclick = () => {
        authMode = "login";
        updateAuthModalTabs();
      };
    }
    if (el.authTabRegister) {
      el.authTabRegister.onclick = () => {
        authMode = "register";
        updateAuthModalTabs();
      };
    }
    if (el.authColorPicker) {
      el.authColorPicker.querySelectorAll(".color-option").forEach(opt => {
        opt.onclick = () => {
          el.authColorPicker.querySelectorAll(".color-option").forEach(o => o.classList.remove("active"));
          opt.classList.add("active");
          selectedAuthAvatarColor = opt.getAttribute("data-color") || "#7C3AED";
        };
      });
    }
    if (el.btnAuthSubmit) {
      el.btnAuthSubmit.onclick = handleAuthSubmit;
    }
    if (el.authForm) {
      el.authForm.onsubmit = (e) => {
        e.preventDefault();
        handleAuthSubmit();
      };
    }

    // Settings tabs
    document.querySelectorAll(".settings-tabs .tab-btn").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll(".settings-tabs .tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const tabId = btn.getAttribute("data-tab");
        const panel = document.getElementById(tabId);
        if (panel) panel.classList.add("active");
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
          if (!state.currentUser.isGuest && state.currentUser.accountId) {
            state.socket.emit("auth-update-profile", {
              username: newName,
              avatarColor: state.currentUser.avatarColor
            }, (res) => {
              if (res && res.success && res.user) {
                const token = localStorage.getItem("megazacx_auth_token");
                saveAccount({
                  id: res.user.id,
                  username: res.user.username,
                  avatarColor: res.user.avatarColor,
                  token
                });
                renderAccountSwitcher();
              }
            });
          } else {
            state.socket.emit("init-user", {
              username: state.currentUser.username,
              avatarColor: state.currentUser.avatarColor
            });
          }
        }
        closeSettings();
        showToast("Profile updated!");
      }
    };

    el.btnTestMic.onclick = toggleMicTest;

    if (el.selectAudioInput) {
      el.selectAudioInput.onchange = (e) => {
        switchLocalAudioDevice(e.target.value);
      };
    }

    if (el.selectAudioOutput) {
      el.selectAudioOutput.onchange = (e) => {
        setAudioOutputDevice(e.target.value);
      };
    }

    if (el.btnRefreshAudioDevices) {
      el.btnRefreshAudioDevices.onclick = async () => {
        await loadAudioInputDevices(true);
        showToast("? Audio device list refreshed");
      };
    }

    // Dynamic hardware change detection (plugging/unplugging headsets or microphones)
    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', async () => {
        console.log('[Audio] Hardware device change detected');
        await loadAudioInputDevices();
        if (state.activeVoiceChannel && state.localStream) {
          const liveTrack = state.localStream.getAudioTracks().find(t => t.readyState === 'live');
          if (!liveTrack) {
            console.warn('[Audio] Active microphone disconnected, falling back to default...');
            await switchLocalAudioDevice('');
          }
        }
      });
    }

    el.sliderSensitivity.value = state.vadThreshold;
    el.sliderSensitivity.oninput = (e) => {
      state.vadThreshold = parseInt(e.target.value, 10);
      localStorage.setItem("megazacx_vad_threshold", state.vadThreshold);
    };

    // Close Action & System Tray Preferences
    function updateCloseBehaviorUI(action) {
      const isTray = action === "tray";
      if (el.selectCloseAction) el.selectCloseAction.value = action;
      if (el.trayStatusTitle) {
        el.trayStatusTitle.textContent = isTray ? "Minimize to Tray" : "Close Completely";
      }
      if (el.trayStatusDesc) {
        el.trayStatusDesc.textContent = isTray
          ? "Keeps MegaZacx running in the background tray so you stay connected to voice and receive messages."
          : "Exits MegaZacx and stops all background connections when closed (Default).";
      }
      if (el.trayStatusBadge) {
        if (isTray) {
          el.trayStatusBadge.textContent = "Tray Active";
          el.trayStatusBadge.style.color = "#34D399";
          el.trayStatusBadge.style.background = "rgba(52, 211, 153, 0.15)";
          el.trayStatusBadge.style.border = "1px solid rgba(52, 211, 153, 0.3)";
        } else {
          el.trayStatusBadge.textContent = "Exit on Close (Default)";
          el.trayStatusBadge.style.color = "#F87171";
          el.trayStatusBadge.style.background = "rgba(239, 68, 68, 0.15)";
          el.trayStatusBadge.style.border = "1px solid rgba(239, 68, 68, 0.3)";
        }
      }
    }

    const savedCloseAction = localStorage.getItem("megazacx_close_action") || "close"; // Default: close completely
    updateCloseBehaviorUI(savedCloseAction);
    if (window.megaZacxAPI && typeof window.megaZacxAPI.setCloseToTray === "function") {
      window.megaZacxAPI.setCloseToTray(savedCloseAction === "tray");
    }

    if (el.selectCloseAction) {
      el.selectCloseAction.onchange = (e) => {
        const val = e.target.value;
        localStorage.setItem("megazacx_close_action", val);
        updateCloseBehaviorUI(val);
        const isTray = val === "tray";
        if (window.megaZacxAPI && typeof window.megaZacxAPI.setCloseToTray === "function") {
          window.megaZacxAPI.setCloseToTray(isTray);
        }
        showToast(isTray ? "MegaZacx will minimize to System Tray on close." : "MegaZacx will exit completely on close.");
      };
    }

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
          if (savedServer) {
            initSocket(savedServer);
          } else if (activeCloudUrl) {
            initSocket(activeCloudUrl);
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

    // Performance & Resource Lifecycle Invariants:
    // Pause any non-essential renderer activities when window is blurred or occluded.
    window.addEventListener('blur', () => {
      document.body.classList.add('window-inactive');
    });
    window.addEventListener('focus', () => {
      document.body.classList.remove('window-inactive');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        document.body.classList.add('window-inactive');
      } else {
        document.body.classList.remove('window-inactive');
      }
    });

    // Immediate cleanup on window exit / reload
    window.addEventListener('beforeunload', () => {
      stopLocalAudio();
      stopMicTest();
      for (const [id] of state.peers.entries()) {
        closePeer(id);
      }
    });
  }


  // ==========================================================================
  // MegaZacx In-App Auto-Updater Logic
  // ==========================================================================
  function initAutoUpdater() {
    const banner = document.getElementById('app-update-banner');
    const bannerMsg = document.getElementById('update-banner-message');
    const btnUpdateNow = document.getElementById('btn-update-now');
    const btnUpdateNowText = document.getElementById('btn-update-now-text');
    const btnDismiss = document.getElementById('btn-dismiss-update');

    const lblVersion = document.getElementById('lbl-installed-version');
    const lblCommit = document.getElementById('lbl-installed-commit');
    const btnCheckSettings = document.getElementById('btn-check-updates-settings');
    const btnCheckSettingsText = document.getElementById('btn-check-updates-text');
    const btnManualUpdate = document.getElementById('btn-manual-update');
    const updateStatusMsg = document.getElementById('update-status-msg');

    if (!window.megaZacxAPI || !window.megaZacxAPI.checkForUpdates) {
      return;
    }

    // Populate current local version in Settings
    if (window.megaZacxAPI.getAppVersion) {
      window.megaZacxAPI.getAppVersion().then(info => {
        if (info) {
          if (lblVersion) lblVersion.textContent = 'v' + (info.version || '1.0.1');
          if (lblCommit) lblCommit.textContent = (info.commit || '').substring(0, 7) || 'latest';
        }
      }).catch(() => {});
    }

    // Dismiss banner handler
    if (btnDismiss && banner) {
      btnDismiss.onclick = () => {
        banner.classList.add('hidden');
      };
    }

    // Perform Update action helper
    async function triggerUpdate(targetButton, textElem) {
      if (!window.megaZacxAPI.performUpdate) return;
      if (targetButton) targetButton.disabled = true;
      if (textElem) textElem.textContent = '? Downloading & Installing Update...';

      showToast('?? Downloading update from GitHub... Please hold on!');

      try {
        const result = await window.megaZacxAPI.performUpdate();
        if (result && result.success) {
          if (textElem) textElem.textContent = '? Update Installed! Restarting...';
          showToast('? MegaZacx updated! Restarting in a moment...');
        } else {
          if (targetButton) targetButton.disabled = false;
          if (textElem) textElem.textContent = 'Retry Update';
          showToast('?? Update failed: ' + (result ? result.error : 'Unknown error'));
        }
      } catch (err) {
        if (targetButton) targetButton.disabled = false;
        if (textElem) textElem.textContent = 'Retry Update';
        showToast('?? Update error: ' + err.message);
      }
    }

    // Click on Update Now in top banner
    if (btnUpdateNow) {
      btnUpdateNow.onclick = () => {
        triggerUpdate(btnUpdateNow, btnUpdateNowText);
      };
    }

    // Click on Manual Update button in settings
    if (btnManualUpdate) {
      btnManualUpdate.onclick = () => {
        triggerUpdate(btnManualUpdate, btnManualUpdate);
      };
    }

    // Check for updates in Settings tab
    if (btnCheckSettings) {
      btnCheckSettings.onclick = async () => {
        if (btnCheckSettingsText) btnCheckSettingsText.textContent = 'Checking GitHub...';
        btnCheckSettings.disabled = true;
        if (updateStatusMsg) {
          updateStatusMsg.className = 'update-status-msg info';
          updateStatusMsg.textContent = 'Querying GitHub repository (axay786/MegaZacx)...';
          updateStatusMsg.classList.remove('hidden');
        }

        try {
          const res = await window.megaZacxAPI.checkForUpdates();
          btnCheckSettings.disabled = false;
          if (btnCheckSettingsText) btnCheckSettingsText.textContent = 'Check for Updates';

          if (res && res.success) {
            if (res.updateAvailable) {
              if (updateStatusMsg) {
                updateStatusMsg.className = 'update-status-msg success';
                updateStatusMsg.textContent = '?? Update Available! New commit ' + res.latestCommit + ': "' + res.commitMessage + '"';
              }
              if (btnManualUpdate) btnManualUpdate.classList.remove('hidden');
              if (banner && bannerMsg) {
                bannerMsg.textContent = 'New update available: ' + res.commitMessage + ' (' + res.latestCommit + ')';
                banner.classList.remove('hidden');
              }
            } else {
              if (updateStatusMsg) {
                updateStatusMsg.className = 'update-status-msg success';
                updateStatusMsg.textContent = '? MegaZacx is up to date! (Build commit: ' + res.currentCommit + ')';
              }
              if (btnManualUpdate) btnManualUpdate.classList.add('hidden');
            }
          } else {
            if (updateStatusMsg) {
              updateStatusMsg.className = 'update-status-msg error';
              updateStatusMsg.textContent = '?? Could not check updates: ' + (res ? res.error : 'Network error');
            }
          }
        } catch (err) {
          btnCheckSettings.disabled = false;
          if (btnCheckSettingsText) btnCheckSettingsText.textContent = 'Check for Updates';
          if (updateStatusMsg) {
            updateStatusMsg.className = 'update-status-msg error';
            updateStatusMsg.textContent = '?? Error checking updates: ' + err.message;
          }
        }
      };
    }

    // Automatic silent background check on startup (after 2.5 seconds)
    setTimeout(async () => {
      try {
        const res = await window.megaZacxAPI.checkForUpdates();
        if (res && res.success && res.updateAvailable) {
          console.log('[AutoUpdater] New update found:', res);
          if (banner && bannerMsg) {
            bannerMsg.textContent = 'New update ready: ' + res.commitMessage + ' (' + res.latestCommit + ')';
            banner.classList.remove('hidden');
          }
        }
      } catch (err) {
        console.warn('[AutoUpdater] Silent background check skipped:', err.message);
      }
    }, 2500);
  }

  // Expose state and audio methods for test QA & automation
  window.__megaZacx = {
    state,
    el,
    getMicrophoneStream,
    startLocalAudio,
    stopLocalAudio,
    switchLocalAudioDevice,
    setAudioOutputDevice,
    loadAudioInputDevices,
    startMicTest,
    stopMicTest,
    handleJoinVoice,
    handleLeaveVoice
  };

  window.addEventListener("DOMContentLoaded", () => {
    updateProfileUI();
    setupEvents();
    loadAudioInputDevices();
    initAutoUpdater();
  });


})();
