const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

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

const DEFAULT_CHANNELS = {
  text: [
    { id: 'general', name: 'general', topic: 'Welcome to MegaZacx! General conversation channel.' },
    { id: 'gaming', name: 'gaming', topic: 'Squad up, share clips, and coordinate game lobbies.' },
    { id: 'memes', name: 'memes', topic: 'Post memes, reaction images, and funny links.' },
    { id: 'announcements', name: 'announcements', topic: 'MegaZacx updates and server announcements.' }
  ],
  voice: [
    { id: 'voice-general', name: '🔊 General Voice', maxUsers: 10 },
    { id: 'voice-squad', name: '🔊 Gaming Squad', maxUsers: 6 },
    { id: 'voice-chill', name: '🔊 Chill Lounge', maxUsers: 8 }
  ]
};

function createServer(port = 3888) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  const rendererPath = path.join(__dirname, '..', 'renderer');
  app.use(express.static(rendererPath));

  const connectedUsers = new Map();
  const channelMessages = new Map();

  DEFAULT_CHANNELS.text.forEach(ch => {
    channelMessages.set(ch.id, [
      {
        id: 'msg_welcome_' + ch.id,
        channelId: ch.id,
        senderId: 'system',
        senderName: 'MegaZacx Bot',
        avatarColor: '#7C3AED',
        avatarInitial: 'M',
        text: 'Welcome to #' + ch.name + '! Start chatting or join one of the voice channels on the left.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        system: true
      }
    ]);
  });

  app.get('/api/status', (req, res) => {
    res.json({
      status: 'online',
      name: 'MegaZacx Server',
      version: '1.0.0',
      connectedUsersCount: connectedUsers.size,
      localIps: getLocalIpAddresses()
    });
  });

  io.on('connection', (socket) => {
    console.log('[MegaZacx Server] Peer connected:', socket.id);

    socket.on('init-user', (userData) => {
      const username = (userData && userData.username ? userData.username.trim() : '') || 'Gamer_' + socket.id.slice(0, 4);
      const avatarColor = (userData && userData.avatarColor) || '#7C3AED';
      const avatarInitial = username.charAt(0).toUpperCase();

      const user = {
        id: socket.id,
        username,
        avatarColor,
        avatarInitial,
        voiceChannel: null,
        isMuted: false,
        isDeafened: false,
        isSpeaking: false,
        joinedAt: Date.now()
      };

      connectedUsers.set(socket.id, user);

      socket.emit('init-success', {
        currentUser: user,
        channels: DEFAULT_CHANNELS,
        users: Array.from(connectedUsers.values()),
        messages: Object.fromEntries(channelMessages.entries())
      });

      io.emit('users-update', Array.from(connectedUsers.values()));
    });

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

      if (oldChannelId === targetChannelId) return;

      if (oldChannelId) {
        socket.leave(oldChannelId);
        socket.to(oldChannelId).emit('peer-left-voice', { peerId: socket.id });
      }

      user.voiceChannel = targetChannelId;
      user.isSpeaking = false;
      socket.join(targetChannelId);

      const peersInRoom = [];
      for (const [id, u] of connectedUsers.entries()) {
        if (id !== socket.id && u.voiceChannel === targetChannelId) {
          peersInRoom.push(u);
        }
      }

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

      const oldChannel = user.voiceChannel;
      user.voiceChannel = null;
      user.isSpeaking = false;
      socket.leave(oldChannel);

      socket.to(oldChannel).emit('peer-left-voice', { peerId: socket.id });
      io.emit('users-update', Array.from(connectedUsers.values()));
    });

    socket.on('webrtc-signal', (data) => {
      if (!data || !data.targetPeerId) return;
      io.to(data.targetPeerId).emit('webrtc-signal', {
        senderPeerId: socket.id,
        signalType: data.signalType,
        signalData: data.signalData
      });
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
      console.log(`[MegaZacx Server] Local Access: http://localhost:${port}`);
      ips.forEach(ip => {
        console.log(`[MegaZacx Server] LAN Access:   http://${ip}:${port}`);
      });
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
