const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const cors = require('cors');

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

// 1 default text channel, 1 default voice channel
const DEFAULT_CHANNELS = {
  text: [
    { id: 'general', name: 'general', topic: 'Main chat room for MegaZacx.' }
  ],
  voice: [
    { id: 'voice-general', name: 'General Voice', maxUsers: 10 }
  ]
};

// In-Memory state
const connectedUsers = new Map();
const channelMessages = new Map();

// Initialize default text channel welcome message
channelMessages.set('general', [
  {
    id: 'welcome_general',
    channelId: 'general',
    senderId: 'system',
    senderName: 'MegaZacx Bot',
    avatarColor: '#7C3AED',
    avatarInitial: 'M',
    text: 'Welcome to #general! Start chatting or join General Voice on the left.',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
]);

function createServer(port = 3888) {
  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json());

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  const rendererPath = path.join(__dirname, '..', 'renderer');
  app.use(express.static(rendererPath));

  app.get('/', (req, res) => {
    res.json({
      status: 'online',
      app: 'MegaZacx 24/7 Cloud Relay',
      connectedUsers: connectedUsers.size,
      uptime: Math.floor(process.uptime()) + 's',
      timestamp: new Date().toISOString()
    });
  });

  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });

  io.on('connection', (socket) => {
    console.log('[MegaZacx Server] Peer connected:', socket.id);

    const handleUserRegistration = (userData) => {
      const user = {
        id: socket.id,
        username: (userData && userData.username) ? userData.username : 'User_' + socket.id.slice(0, 4),
        avatarColor: (userData && userData.avatarColor) ? userData.avatarColor : '#7C3AED',
        avatarInitial: (userData && userData.username && userData.username.length > 0) ? userData.username[0].toUpperCase() : 'U',
        voiceChannel: null,
        isMuted: false,
        isDeafened: false,
        isSpeaking: false
      };

      connectedUsers.set(socket.id, user);

      socket.emit('init-success', {
        currentUser: user,
        channels: DEFAULT_CHANNELS,
        users: Array.from(connectedUsers.values()),
        messages: Object.fromEntries(channelMessages.entries())
      });

      io.emit('users-update', Array.from(connectedUsers.values()));
    };

    socket.on('init-user', handleUserRegistration);
    socket.on('register-user', handleUserRegistration);

    socket.on('create-channel', (data) => {
      if (!data || !data.name || !data.type) return;
      const cleanRaw = data.name.trim();
      const cleanSlug = cleanRaw.toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 32);
      if (!cleanSlug) return;

      if (data.type === 'text') {
        const channelId = 'text-' + Date.now().toString(36) + '-' + cleanSlug;
        const newChan = {
          id: channelId,
          name: cleanSlug,
          topic: `Discussion in #${cleanSlug}`
        };
        DEFAULT_CHANNELS.text.push(newChan);
        channelMessages.set(channelId, [
          {
            id: 'welcome_' + channelId,
            channelId,
            senderId: 'system',
            senderName: 'MegaZacx Bot',
            avatarColor: '#7C3AED',
            avatarInitial: 'M',
            text: `Welcome to #${cleanSlug}! Start chatting with your friends.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        console.log('[MegaZacx Server] Created text channel:', newChan);
      } else if (data.type === 'voice') {
        const channelId = 'voice-' + Date.now().toString(36) + '-' + cleanSlug;
        const displayName = cleanRaw.replace(/^(\?\?|\?|[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}])\s*/u, '').trim().slice(0, 36) || cleanSlug;
        const newChan = {
          id: channelId,
          name: displayName.slice(0, 36),
          maxUsers: 10
        };
        DEFAULT_CHANNELS.voice.push(newChan);
        console.log('[MegaZacx Server] Created voice channel:', newChan);
      }

      io.emit('channels-updated', DEFAULT_CHANNELS);
    });

    const handleRenameChannel = (data) => {
      if (!data) return;
      const channelId = data.channelId || data.id;
      const newNameRaw = (data.name || data.newName || '').trim();
      if (!channelId || !newNameRaw) return;

      // Check text channels
      const textChannel = DEFAULT_CHANNELS.text.find(c => c.id === channelId);
      if (textChannel) {
        const cleanSlug = newNameRaw.toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 32);
        if (!cleanSlug) return;
        const oldName = textChannel.name;
        textChannel.name = cleanSlug;
        if (!textChannel.topic || textChannel.topic === `Discussion in #${oldName}` || textChannel.topic === 'Main chat room for MegaZacx.') {
          textChannel.topic = `Discussion in #${cleanSlug}`;
        }
        if (data.topic && typeof data.topic === 'string') {
          textChannel.topic = data.topic.trim();
        }
        console.log(`[MegaZacx Server] Renamed text channel ${channelId} from '${oldName}' to '${cleanSlug}'`);
        io.emit('channels-updated', DEFAULT_CHANNELS);
        return;
      }

      // Check voice channels
      const voiceChannel = DEFAULT_CHANNELS.voice.find(c => c.id === channelId);
      if (voiceChannel) {
        const displayName = newNameRaw.replace(/^(\?\?|\?|[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}])\s*/u, '').trim().slice(0, 36) || newNameRaw.slice(0, 36);
        if (!displayName) return;
        const oldName = voiceChannel.name;
        voiceChannel.name = displayName;
        console.log(`[MegaZacx Server] Renamed voice channel ${channelId} from '${oldName}' to '${displayName}'`);
        io.emit('channels-updated', DEFAULT_CHANNELS);
        return;
      }
    };

    socket.on('rename-channel', handleRenameChannel);
    socket.on('edit-channel', handleRenameChannel);

    const handleDeleteChannel = (data) => {
      if (!data) return;
      const channelId = data.channelId || data.id;
      if (!channelId) return;

      const textIdx = DEFAULT_CHANNELS.text.findIndex(c => c.id === channelId);
      if (textIdx !== -1) {
        if (DEFAULT_CHANNELS.text.length <= 1) {
          socket.emit('error-msg', { message: 'Cannot delete the only text channel.' });
          return;
        }
        DEFAULT_CHANNELS.text.splice(textIdx, 1);
        channelMessages.delete(channelId);
        console.log(`[MegaZacx Server] Deleted text channel: ${channelId}`);
        io.emit('channels-updated', DEFAULT_CHANNELS);
        return;
      }

      const voiceIdx = DEFAULT_CHANNELS.voice.findIndex(c => c.id === channelId);
      if (voiceIdx !== -1) {
        if (DEFAULT_CHANNELS.voice.length <= 1) {
          socket.emit('error-msg', { message: 'Cannot delete the only voice channel.' });
          return;
        }
        for (const [uid, user] of connectedUsers.entries()) {
          if (user.voiceChannel === channelId) {
            user.voiceChannel = null;
            user.isSpeaking = false;
            const sock = io.sockets.sockets.get(uid);
            if (sock) {
              sock.leave(channelId);
            }
          }
        }
        DEFAULT_CHANNELS.voice.splice(voiceIdx, 1);
        console.log(`[MegaZacx Server] Deleted voice channel: ${channelId}`);
        io.emit('users-update', Array.from(connectedUsers.values()));
        io.emit('channels-updated', DEFAULT_CHANNELS);
        return;
      }
    };

    socket.on('delete-channel', handleDeleteChannel);

    socket.on('send-message', (data) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;
      if (!data || !data.channelId || !data.text || !data.text.trim()) return;

      const channelId = data.channelId;
      const cleanText = data.text.trim();

      const message = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        channelId,
        senderId: user.id,
        senderName: user.username,
        avatarColor: user.avatarColor,
        avatarInitial: user.avatarInitial,
        text: cleanText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      if (!channelMessages.has(channelId)) {
        channelMessages.set(channelId, []);
      }
      const history = channelMessages.get(channelId);
      history.push(message);
      if (history.length > 200) {
        history.shift();
      }

      io.emit('receive-message', message);
    });

    socket.on('join-voice', (data) => {
      const user = connectedUsers.get(socket.id);
      if (!user || !data || !data.channelId) return;

      const targetChannelId = data.channelId;
      const oldChannelId = user.voiceChannel;

      if (oldChannelId) {
        socket.leave(oldChannelId);
        socket.to(oldChannelId).emit('peer-left-voice', { peerId: socket.id });
      }

      user.voiceChannel = targetChannelId;
      user.isSpeaking = false;
      socket.join(targetChannelId);

      const peersInRoom = Array.from(connectedUsers.values())
        .filter(u => u.voiceChannel === targetChannelId && u.id !== socket.id);

      socket.emit('voice-peers-list', {
        channelId: targetChannelId,
        peers: peersInRoom
      });

      socket.to(targetChannelId).emit('peer-joined-voice', {
        peer: user
      });

      io.emit('users-update', Array.from(connectedUsers.values()));
    });

    socket.on('leave-voice', () => {
      const user = connectedUsers.get(socket.id);
      if (!user || !user.voiceChannel) return;

      const currentChannel = user.voiceChannel;
      socket.leave(currentChannel);
      user.voiceChannel = null;
      user.isSpeaking = false;

      socket.to(currentChannel).emit('peer-left-voice', { peerId: socket.id });
      io.emit('users-update', Array.from(connectedUsers.values()));
    });

        socket.on('webrtc-signal', (data) => {
      if (data && data.targetPeerId) {
        socket.to(data.targetPeerId).emit('webrtc-signal', {
          senderPeerId: socket.id,
          signalType: data.signalType,
          signalData: data.signalData
        });
      }
    });

    socket.on('webrtc-offer', (data) => {
      if (data && data.target) {
        socket.to(data.target).emit('webrtc-signal', {
          senderPeerId: socket.id,
          signalType: 'offer',
          signalData: data.sdp
        });
        socket.to(data.target).emit('webrtc-offer', {
          caller: socket.id,
          sdp: data.sdp
        });
      }
    });

    socket.on('webrtc-answer', (data) => {
      if (data && data.target) {
        socket.to(data.target).emit('webrtc-signal', {
          senderPeerId: socket.id,
          signalType: 'answer',
          signalData: data.sdp
        });
        socket.to(data.target).emit('webrtc-answer', {
          caller: socket.id,
          sdp: data.sdp
        });
      }
    });

    socket.on('webrtc-ice-candidate', (data) => {
      if (data && data.target) {
        socket.to(data.target).emit('webrtc-signal', {
          senderPeerId: socket.id,
          signalType: 'ice-candidate',
          signalData: data.candidate
        });
        socket.to(data.target).emit('webrtc-ice-candidate', {
          caller: socket.id,
          candidate: data.candidate
        });
      }
    });

    socket.on('voice-state-update', (state) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      if (typeof state.isMuted === 'boolean') user.isMuted = state.isMuted;
      if (typeof state.isDeafened === 'boolean') user.isDeafened = state.isDeafened;
      if (typeof state.isSpeaking === 'boolean') user.isSpeaking = state.isSpeaking;

      if (user.voiceChannel) {
        socket.to(user.voiceChannel).emit('peer-voice-state', {
          peerId: socket.id,
          isMuted: user.isMuted,
          isDeafened: user.isDeafened,
          isSpeaking: user.isSpeaking
        });
      }

      io.emit('users-update', Array.from(connectedUsers.values()));
    });

    socket.on('disconnect', () => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        if (user.voiceChannel) {
          socket.to(user.voiceChannel).emit('peer-left-voice', { peerId: socket.id });
        }
        connectedUsers.delete(socket.id);
        io.emit('users-update', Array.from(connectedUsers.values()));
      }
      console.log('[MegaZacx Server] Peer disconnected:', socket.id);
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '0.0.0.0', () => {
      const ips = getLocalIpAddresses();
      console.log(`[MegaZacx Server] Listening on port ${port}`);
      resolve({ server, port, ips });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[MegaZacx Server] Port ${port} is in use, trying ${port + 1}...`);
        resolve(createServer(port + 1));
      } else {
        reject(err);
      }
    });
  });
}

if (require.main === module) {
  const port = parseInt(process.env.PORT, 10) || 3888;
  createServer(port);
}

module.exports = { createServer, getLocalIpAddresses, DEFAULT_CHANNELS };
