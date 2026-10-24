const { createServer } = require('../src/server/server');
const io = require('socket.io-client');

async function testChannels() {
  console.log('====================================');
  console.log('   TESTING 1-DEFAULT & CHANNEL ADD  ');
  console.log('====================================');

  const srv = await createServer(3892);
  const server = srv.server;
  console.log('[Test] Server running on port 3892');

  const client = io('http://localhost:3892', { transports: ['websocket'] });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Connect timeout')), 5000);
    client.on('connect', () => {
      clearTimeout(t);
      client.emit('init-user', { username: 'ChannelTester' });
    });

    client.on('init-success', (data) => {
      console.log('[Test] Received init-success!');
      console.log('[Test] Default Text channels:', data.channels.text.map(c => c.name));
      console.log('[Test] Default Voice channels:', data.channels.voice.map(c => c.name));

      if (data.channels.text.length !== 1 || data.channels.text[0].id !== 'general') {
        reject(new Error('Expected exactly 1 default text channel (#general)'));
        return;
      }
      if (data.channels.voice.length !== 1 || data.channels.voice[0].id !== 'voice-general') {
        reject(new Error('Expected exactly 1 default voice channel (?? General Voice)'));
        return;
      }
      console.log('PASS: Exactly 1 default text channel and 1 default voice channel verified!');
      resolve();
    });
  });

  // TEST 2: Create a new text channel
  console.log('\n--- TEST 2: Create New Text Channel ---');
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Text channel creation timeout')), 5000);

    client.on('channels-updated', (channels) => {
      const found = channels.text.find(c => c.name === 'gaming-squad');
      if (found) {
        console.log('[Test] Successfully created and received text channel:', found);
        clearTimeout(t);
        resolve();
      }
    });

    client.emit('create-channel', {
      type: 'text',
      name: 'gaming-squad'
    });
  });
  console.log('PASS: Text channel created and broadcast to all peers!');

  // TEST 3: Create a new voice channel
  console.log('\n--- TEST 3: Create New Voice Channel ---');
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Voice channel creation timeout')), 5000);

    client.on('channels-updated', (channels) => {
      const found = channels.voice.find(c => c.name.includes('Chill Lounge'));
      if (found) {
        console.log('[Test] Successfully created and received voice channel:', found);
        clearTimeout(t);
        resolve();
      }
    });

    client.emit('create-channel', {
      type: 'voice',
      name: 'Chill Lounge'
    });
  });
  console.log('PASS: Voice channel created and broadcast to all peers!');

  console.log('\n====================================');
  console.log('   ALL CHANNEL TESTS PASSED 100%!   ');
  console.log('====================================');

  client.disconnect();
  server.close();
  process.exit(0);
}

testChannels().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
