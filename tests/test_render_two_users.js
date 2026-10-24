const io = require('socket.io-client');

const CLOUD_URL = 'https://megazacx-server.onrender.com';

async function testCloudTwoUsers() {
  console.log('==============================================');
  console.log('   TESTING 2 USERS ON LIVE RENDER SERVER      ');
  console.log('   URL:', CLOUD_URL);
  console.log('==============================================');

  const u1 = io(CLOUD_URL, { transports: ['websocket', 'polling'] });
  const u2 = io(CLOUD_URL, { transports: ['websocket', 'polling'] });

  await new Promise((resolve, reject) => {
    let connected = 0;
    const timeout = setTimeout(() => reject(new Error('Connection timeout to Render')), 15000);

    u1.on('connect', () => {
      console.log('[Test] User 1 connected to Render with ID:', u1.id);
      u1.emit('register-user', { username: 'eZacx_Host', avatarColor: '#7C3AED' });
      connected++;
      if (connected === 2) { clearTimeout(timeout); resolve(); }
    });

    u2.on('connect', () => {
      console.log('[Test] User 2 (Friend) connected to Render with ID:', u2.id);
      u2.emit('register-user', { username: 'Friend_Squad', avatarColor: '#06B6D4' });
      connected++;
      if (connected === 2) { clearTimeout(timeout); resolve(); }
    });
  });

  console.log('\n[Test] Both users successfully registered on 24/7 Render cloud!');

  // TEST 1: Cross-Network Text Message Broadcast
  console.log('\n--- TEST 1: Text Messaging Across Internet ---');
  const msgReceived = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Message receive timeout')), 10000);

    u2.on('receive-message', (msg) => {
      if (msg.text === 'Hey bro! MegaZacx 24/7 Cloud is live!') {
        console.log('[Test] User 2 successfully received message:', msg.text, 'from:', msg.senderName);
        clearTimeout(timeout);
        resolve(true);
      }
    });

    // User 1 sends message
    u1.emit('send-message', {
      channelId: 'general',
      text: 'Hey bro! MegaZacx 24/7 Cloud is live!'
    });
  });

  if (!msgReceived) throw new Error('Text message broadcast failed');
  console.log('PASS: Text messaging works seamlessly between users across the internet!');

  // TEST 2: Voice Channel Join & Peer Discovery
  console.log('\n--- TEST 2: Voice Room Discovery Across Internet ---');
  const voiceDiscovered = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Voice peer timeout')), 10000);

    u1.on('peer-joined-voice', (data) => {
      console.log('[Test] User 1 saw User 2 join voice channel:', data.peer.username);
      clearTimeout(timeout);
      resolve(true);
    });

    // User 1 joins voice
    u1.emit('join-voice', { channelId: 'voice-general' });

    // User 2 joins same voice channel
    setTimeout(() => {
      u2.emit('join-voice', { channelId: 'voice-general' });
    }, 500);
  });

  if (!voiceDiscovered) throw new Error('Voice discovery failed');
  console.log('PASS: Voice channel join and discovery verified on Render cloud!');

  // TEST 3: WebRTC Signaling Relay
  console.log('\n--- TEST 3: WebRTC P2P Signaling Relay ---');
  const webrtcRelayed = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebRTC relay timeout')), 10000);

    u2.on('webrtc-offer', (data) => {
      console.log('[Test] User 2 received WebRTC offer from User 1!');
      clearTimeout(timeout);
      resolve(true);
    });

    u1.emit('webrtc-offer', {
      target: u2.id,
      sdp: { type: 'offer', sdp: 'fake-sdp-test-cloud' }
    });
  });

  if (!webrtcRelayed) throw new Error('WebRTC relay failed');
  console.log('PASS: WebRTC voice signaling relay verified on Render cloud!');

  console.log('\n==============================================');
  console.log('   ALL CLOUD INTEGRATION TESTS PASSED 100%!   ');
  console.log('==============================================');

  u1.disconnect();
  u2.disconnect();
  process.exit(0);
}

testCloudTwoUsers().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
