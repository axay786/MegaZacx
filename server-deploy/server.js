const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

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

const DEFAULT_CHANNELS = {
  text: [
    { id: 'general', name: 'general', topic: 'Welcome to MegaZacx! General conversation channel.' },
    { id: 'gaming', name: 'gaming', topic: 'Squad up, share clips, and coordinate game lobbies.' },
    { id: 'memes', name: 'memes', topic: 'Post memes, reaction images, and funny links.' },
    { id: 'announcements', name: 'announcements', topic: 'MegaZacx updates and server announcements.' }
  ],
  voice: [
    { id: 'voice-general', name: '?? General Voice', maxUsers: 10 },
    { id: 'voice-squad', name: '?? Gaming Squad', maxUsers: 6 },
    { id: 'voice-chill', name: '?? Chill Lounge', maxUsers: 8 }
  ]
};

// In-Memory state
const connectedUsers = new Map();
const channelMessages = new Map();

// Initialize channel history with welcome messages
DEFAULT_CHANNELS.text.forEach(ch => {
  channelMessages.set(ch.id, [
    {
      id: 'welcome_' + ch.id,
      channelId: ch.id,
      senderId: 'system',
      senderName: 'MegaZacx Bot',
      avatarColor: '#7C3AED',
      avatarInitial: 'M',
      text: 'Welcome to #' + ch.name + '! Start chatting or join one of the voice channels on the left.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
});

// Health check endpoint for cloud uptime monitoring
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
  console.log('[MegaZacx Cloud] Peer connected:', socket.id);

  socket.on('register-user', (userData) => {
    const user = {
      id: socket.id,
      username: userData.username || 'User_' + socket.id.slice(0, 4),
      avatarColor: userData.avatarColor || '#7C3AED',
      avatarInitial: (userData.username || 'U')[0].toUpperCase(),
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

  socket.on('webrtc-offer', (data) => {
    if (data && data.target) {
      socket.to(data.target).emit('webrtc-offer', {
        caller: socket.id,
        sdp: data.sdp
      });
    }
  });

  socket.on('webrtc-answer', (data) => {
    if (data && data.target) {
      socket.to(data.target).emit('webrtc-answer', {
        caller: socket.id,
        sdp: data.sdp
      });
    }
  });

  socket.on('webrtc-ice-candidate', (data) => {
    if (data && data.target) {
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
    console.log('[MegaZacx Cloud] Peer disconnected:', socket.id);
  });
});

const PORT = parseInt(process.env.PORT, 10) || 3888;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[MegaZacx Cloud Server] Listening on port ${PORT}`);
  console.log(`[MegaZacx Cloud Server] Health check available at http://0.0.0.0:${PORT}/`);
});
