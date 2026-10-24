const { createServer } = require('../src/server/server');
const io = require('socket.io-client');

async function testVoiceChatQA() {
  console.log('==============================================');
  console.log('   QA: WebRTC Voice Chat Bidirectional Test   ');
  console.log('==============================================');

  const srv = await createServer(3893);
  const server = srv.server;
  console.log('[QA] Server running on port 3893');

  const u1 = io('http://localhost:3893', { transports: ['websocket'] });
  const u2 = io('http://localhost:3893', { transports: ['websocket'] });

  await new Promise((resolve) => {
    let count = 0;
    u1.on('connect', () => {
      u1.emit('init-user', { username: 'Gamer_1' });
      if (++count === 2) resolve();
    });
    u2.on('connect', () => {
      u2.emit('init-user', { username: 'Gamer_2' });
      if (++count === 2) resolve();
    });
  });

  console.log('[QA] User 1 ID:', u1.id);
  console.log('[QA] User 2 ID:', u2.id);

  // STEP 1: User 1 joins voice channel
  console.log('\n--- STEP 1: User 1 Joins Voice Channel ---');
  u1.emit('join-voice', { channelId: 'voice-general' });
  await new Promise(r => setTimeout(r, 400));
  console.log('[QA] User 1 is in voice channel voice-general');

  // STEP 2: User 2 joins voice channel and gets peers list
  console.log('\n--- STEP 2: User 2 Joins Voice Channel & Discovers Peers ---');
  let peersForUser2 = [];
  const peersReceivedPromise = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('User 2 peers list timeout')), 5000);
    u2.on('voice-peers-list', (data) => {
      peersForUser2 = data.peers;
      clearTimeout(t);
      resolve();
    });
  });

  u2.emit('join-voice', { channelId: 'voice-general' });
  await peersReceivedPromise;

  console.log('[QA] User 2 discovered peers in room:', peersForUser2.map(p => p.username));
  if (peersForUser2.length !== 1 || peersForUser2[0].id !== u1.id) {
    throw new Error('User 2 failed to discover User 1 in room');
  }
  console.log('PASS: User 2 discovered User 1 in voice room!');

  // STEP 3: User 2 sends WebRTC Offer via webrtc-signal, User 1 receives it
  console.log('\n--- STEP 3: User 2 Sends WebRTC Offer -> User 1 ---');
  let offerReceivedByUser1 = null;
  const offerPromise = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('User 1 offer receive timeout')), 5000);
    u1.on('webrtc-signal', (data) => {
      if (data.signalType === 'offer') {
        offerReceivedByUser1 = data;
        clearTimeout(t);
        resolve();
      }
    });
  });

  u2.emit('webrtc-signal', {
    targetPeerId: u1.id,
    signalType: 'offer',
    signalData: { type: 'offer', sdp: 'v=0\r\no=MegaZacxTest 12345 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 5004 RTP/AVP 0\r\n' }
  });

  await offerPromise;
  console.log('[QA] User 1 successfully received WebRTC Offer from User 2! Sender:', offerReceivedByUser1.senderPeerId);
  if (offerReceivedByUser1.senderPeerId !== u2.id) {
    throw new Error('User 1 received offer with wrong sender ID');
  }
  console.log('PASS: WebRTC Offer signal relayed successfully by server!');

  // STEP 4: User 1 sends WebRTC Answer -> User 2
  console.log('\n--- STEP 4: User 1 Sends WebRTC Answer -> User 2 ---');
  let answerReceivedByUser2 = null;
  const answerPromise = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('User 2 answer receive timeout')), 5000);
    u2.on('webrtc-signal', (data) => {
      if (data.signalType === 'answer') {
        answerReceivedByUser2 = data;
        clearTimeout(t);
        resolve();
      }
    });
  });

  u1.emit('webrtc-signal', {
    targetPeerId: u2.id,
    signalType: 'answer',
    signalData: { type: 'answer', sdp: 'v=0\r\no=MegaZacxTestAnswer 12345 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 5004 RTP/AVP 0\r\n' }
  });

  await answerPromise;
  console.log('[QA] User 2 successfully received WebRTC Answer from User 1! Sender:', answerReceivedByUser2.senderPeerId);
  if (answerReceivedByUser2.senderPeerId !== u1.id) {
    throw new Error('User 2 received answer with wrong sender ID');
  }
  console.log('PASS: WebRTC Answer signal relayed successfully by server!');

  // STEP 5: Bidirectional ICE Candidate Exchange
  console.log('\n--- STEP 5: Bidirectional ICE Candidate Exchange ---');
  let u1IceReceived = false;
  let u2IceReceived = false;

  const icePromise = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ICE candidate exchange timeout')), 5000);
    u1.on('webrtc-signal', (data) => {
      if (data.signalType === 'ice-candidate') {
        u1IceReceived = true;
        if (u1IceReceived && u2IceReceived) { clearTimeout(t); resolve(); }
      }
    });
    u2.on('webrtc-signal', (data) => {
      if (data.signalType === 'ice-candidate') {
        u2IceReceived = true;
        if (u1IceReceived && u2IceReceived) { clearTimeout(t); resolve(); }
      }
    });
  });

  u1.emit('webrtc-signal', {
    targetPeerId: u2.id,
    signalType: 'ice-candidate',
    signalData: { candidate: 'candidate:1 1 UDP 2130706431 127.0.0.1 5004 typ host', sdpMid: '0', sdpMLineIndex: 0 }
  });
  u2.emit('webrtc-signal', {
    targetPeerId: u1.id,
    signalType: 'ice-candidate',
    signalData: { candidate: 'candidate:2 1 UDP 2130706431 127.0.0.1 5005 typ host', sdpMid: '0', sdpMLineIndex: 0 }
  });

  await icePromise;
  console.log('[QA] User 1 received ICE candidate from User 2:', u1IceReceived);
  console.log('[QA] User 2 received ICE candidate from User 1:', u2IceReceived);
  console.log('PASS: Bidirectional ICE Candidate exchange verified!');

  console.log('\n==============================================');
  console.log('   ALL 5 WEBRTC VOICE TESTS PASSED 100%!      ');
  console.log('==============================================');

  u1.disconnect();
  u2.disconnect();
  server.close();
  process.exit(0);
}

testVoiceChatQA().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
