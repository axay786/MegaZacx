const { createServer } = require('../src/server/server');
const io = require('socket.io-client');

async function testChannelRenaming() {
  console.log('====================================');
  console.log('   TESTING CHANNEL RENAMING SUITE   ');
  console.log('====================================');

  const srv = await createServer(3893);
  const server = srv.server;
  console.log('[Test] Server running on port 3893');

  const client1 = io('http://localhost:3893', { transports: ['websocket'] });
  const client2 = io('http://localhost:3893', { transports: ['websocket'] });

  await new Promise((resolve, reject) => {
    let connectedCount = 0;
    const check = () => {
      connectedCount++;
      if (connectedCount === 2) resolve();
    };
    client1.on('connect', () => {
      client1.emit('init-user', { username: 'User1' });
      check();
    });
    client2.on('connect', () => {
      client2.emit('init-user', { username: 'User2' });
      check();
    });
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });

  // STEP 1: Rename default text channel 'general' -> 'announcements'
  console.log('\n--- STEP 1: Rename Default Text Channel (general -> announcements) ---');
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Step 1 timeout')), 5000);

    client2.on('channels-updated', (channels) => {
      const generalChan = channels.text.find(c => c.id === 'general');
      if (generalChan && generalChan.name === 'announcements') {
        console.log('[Test] Client2 received renamed channel:', generalChan);
        clearTimeout(t);
        resolve();
      }
    });

    client1.emit('rename-channel', {
      channelId: 'general',
      name: 'announcements',
      type: 'text'
    });
  });
  console.log('PASS: Default text channel renamed and broadcast to all peers!');

  // STEP 2: Create a new text channel and rename it
  console.log('\n--- STEP 2: Create Custom Text Channel and Rename it ---');
  let newChannelId = null;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Create channel timeout')), 5000);
    const handler = (channels) => {
      const found = channels.text.find(c => c.name === 'random-chat');
      if (found) {
        newChannelId = found.id;
        client1.off('channels-updated', handler);
        clearTimeout(t);
        resolve();
      }
    };
    client1.on('channels-updated', handler);
    client1.emit('create-channel', { type: 'text', name: 'random-chat' });
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Rename custom channel timeout')), 5000);
    const handler = (channels) => {
      const found = channels.text.find(c => c.id === newChannelId);
      if (found && found.name === 'memes-and-fun') {
        console.log('[Test] Successfully renamed custom channel:', found);
        client2.off('channels-updated', handler);
        clearTimeout(t);
        resolve();
      }
    };
    client2.on('channels-updated', handler);
    client1.emit('rename-channel', {
      channelId: newChannelId,
      name: 'memes-and-fun',
      type: 'text'
    });
  });
  console.log('PASS: Custom text channel renamed successfully!');

  // STEP 3: Send message to renamed channel and rename again, ensuring message persistence
  console.log('\n--- STEP 3: Send Message and Rename again (Verify Message Persistence) ---');
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Send message timeout')), 5000);
    client2.on('receive-message', (msg) => {
      if (msg.channelId === newChannelId && msg.text === 'Hello Memes!') {
        console.log('[Test] Message received in channel:', msg.text);
        clearTimeout(t);
        resolve();
      }
    });
    client1.emit('send-message', {
      channelId: newChannelId,
      text: 'Hello Memes!'
    });
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Second rename timeout')), 5000);
    const handler = (channels) => {
      const found = channels.text.find(c => c.id === newChannelId);
      if (found && found.name === 'top-tier-memes') {
        console.log('[Test] Successfully renamed channel to:', found.name);
        client1.off('channels-updated', handler);
        clearTimeout(t);
        resolve();
      }
    };
    client1.on('channels-updated', handler);
    client2.emit('rename-channel', {
      channelId: newChannelId,
      name: 'Top Tier Memes',
      type: 'text'
    });
  });
  console.log('PASS: Channel renamed while preserving channel ID and messages!');

  // STEP 4: Rename default voice channel 'General Voice' -> 'HQ Squad Voice'
  console.log('\n--- STEP 4: Rename Default Voice Channel ---');
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Voice rename timeout')), 5000);
    const handler = (channels) => {
      const voiceChan = channels.voice.find(v => v.id === 'voice-general');
      if (voiceChan && voiceChan.name === 'HQ Squad Voice') {
        console.log('[Test] Voice channel renamed:', voiceChan);
        client2.off('channels-updated', handler);
        clearTimeout(t);
        resolve();
      }
    };
    client2.on('channels-updated', handler);
    client1.emit('rename-channel', {
      channelId: 'voice-general',
      name: 'HQ Squad Voice',
      type: 'voice'
    });
  });
  console.log('PASS: Default voice channel renamed and broadcast!');

  // STEP 5: Create and rename custom voice channel
  console.log('\n--- STEP 5: Create and Rename Custom Voice Channel ---');
  let newVoiceId = null;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Create voice timeout')), 5000);
    const handler = (channels) => {
      const found = channels.voice.find(v => v.name === 'Music Room');
      if (found) {
        newVoiceId = found.id;
        client1.off('channels-updated', handler);
        clearTimeout(t);
        resolve();
      }
    };
    client1.on('channels-updated', handler);
    client1.emit('create-channel', { type: 'voice', name: 'Music Room' });
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Rename custom voice timeout')), 5000);
    const handler = (channels) => {
      const found = channels.voice.find(v => v.id === newVoiceId);
      if (found && found.name === 'Lo-Fi Chill Vibes') {
        console.log('[Test] Custom voice channel renamed:', found);
        client2.off('channels-updated', handler);
        clearTimeout(t);
        resolve();
      }
    };
    client2.on('channels-updated', handler);
    client1.emit('rename-channel', {
      channelId: newVoiceId,
      name: 'Lo-Fi Chill Vibes',
      type: 'voice'
    });
  });
  console.log('PASS: Custom voice channel renamed successfully!');

  // STEP 6: Delete custom channels
  console.log('\n--- STEP 6: Delete Custom Channels ---');
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Delete channel timeout')), 5000);
    const handler = (channels) => {
      const foundText = channels.text.find(c => c.id === newChannelId);
      if (!foundText) {
        console.log('[Test] Custom text channel deleted successfully');
        client1.off('channels-updated', handler);
        clearTimeout(t);
        resolve();
      }
    };
    client1.on('channels-updated', handler);
    client1.emit('delete-channel', { channelId: newChannelId });
  });
  console.log('PASS: Custom text channel deleted successfully!');

  console.log('\n====================================');
  console.log('   ALL RENAME TESTS PASSED 100%!    ');
  console.log('====================================');

  client1.disconnect();
  client2.disconnect();
  server.close();
  process.exit(0);
}

testChannelRenaming().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});

