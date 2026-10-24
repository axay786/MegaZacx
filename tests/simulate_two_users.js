const io = require("socket.io-client");

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3888";

console.log("==================================================================");
console.log("  MegaZacx QA Simulation: 2 Users Voice & Chat Real-Time Test");
console.log("  Target Server:", SERVER_URL);
console.log("==================================================================");

async function runQATest() {
  const results = [];
  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      results.push({ pass: true, message });
    } else {
      console.error(`  [FAIL] ${message}`);
      results.push({ pass: false, message });
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // 1. Connect Client 1 (Alice)
  console.log("\n[Step 1] Connecting Alice (Host)...");
  const alice = io(SERVER_URL, { timeout: 5000 });
  await new Promise((res, rej) => {
    alice.on("connect", res);
    alice.on("connect_error", rej);
  });
  assert(alice.connected, "Alice socket connected successfully");

  // Init Alice
  const aliceInitPromise = new Promise(res => alice.once("init-success", res));
  alice.emit("init-user", { username: "Alice", avatarColor: "#7C3AED" });
  const aliceInit = await aliceInitPromise;
  assert(aliceInit.currentUser.username === "Alice", "Alice registered identity");

  // 2. Connect Client 2 (Bob)
  console.log("\n[Step 2] Connecting Bob (Peer)...");
  const bob = io(SERVER_URL, { timeout: 5000 });
  await new Promise((res, rej) => {
    bob.on("connect", res);
    bob.on("connect_error", rej);
  });
  assert(bob.connected, "Bob socket connected successfully");

  // Init Bob
  const bobInitPromise = new Promise(res => bob.once("init-success", res));
  bob.emit("init-user", { username: "Bob", avatarColor: "#06B6D4" });
  const bobInit = await bobInitPromise;
  assert(bobInit.currentUser.username === "Bob", "Bob registered identity");
  assert(bobInit.users.length >= 2, "Bob sees Alice in initial user list");

  // 3. Alice joins Voice Channel 'voice-general'
  console.log("\n[Step 3] Alice joins 'voice-general'...");
  const aliceJoinVoicePromise = new Promise(res => alice.once("voice-peers-list", res));
  alice.emit("join-voice", { channelId: "voice-general" });
  const alicePeersList = await aliceJoinVoicePromise;
  assert(alicePeersList.channelId === "voice-general", "Alice confirmed in voice-general");
  assert(alicePeersList.peers.length === 0, "Alice is first in the room, 0 existing peers");

  // 4. Bob joins Voice Channel 'voice-general'
  console.log("\n[Step 4] Bob joins 'voice-general'...");
  const bobJoinVoicePromise = new Promise(res => bob.once("voice-peers-list", res));
  const aliceSeesBobJoinPromise = new Promise(res => alice.once("peer-joined-voice", res));

  bob.emit("join-voice", { channelId: "voice-general" });
  const [bobPeersList, aliceSeesBob] = await Promise.all([bobJoinVoicePromise, aliceSeesBobJoinPromise]);

  assert(bobPeersList.peers.some(p => p.id === alice.id), "Bob's peers list contains Alice");
  assert(aliceSeesBob.peer.id === bob.id, "Alice receives notification that Bob joined room");

  // 5. WebRTC Signaling Simulation (Offer / Answer / ICE)
  console.log("\n[Step 5] Simulating WebRTC P2P Signaling exchange...");
  const mockOfferSDP = { type: "offer", sdp: "v=0\r\no=bob 1234 1 IN IP4 127.0.0.1\r\ns=MegaZacx Audio\r\nt=0 0\r\nm=audio 5004 RTP/AVP 0\r\n" };
  const mockAnswerSDP = { type: "answer", sdp: "v=0\r\no=alice 5678 1 IN IP4 127.0.0.1\r\ns=MegaZacx Audio\r\nt=0 0\r\nm=audio 5004 RTP/AVP 0\r\n" };
  const mockIceCandidate = { candidate: "candidate:1 1 UDP 2130706431 127.0.0.1 5004 typ host", sdpMid: "0", sdpMLineIndex: 0 };

  // Bob sends Offer to Alice
  const aliceGotOfferPromise = new Promise(res => alice.once("webrtc-signal", res));
  bob.emit("webrtc-signal", {
    targetPeerId: alice.id,
    signalType: "offer",
    signalData: mockOfferSDP
  });
  const aliceOfferSignal = await aliceGotOfferPromise;
  assert(aliceOfferSignal.senderPeerId === bob.id && aliceOfferSignal.signalType === "offer", "Alice received WebRTC SDP offer from Bob");

  // Alice sends Answer to Bob
  const bobGotAnswerPromise = new Promise(res => bob.once("webrtc-signal", res));
  alice.emit("webrtc-signal", {
    targetPeerId: bob.id,
    signalType: "answer",
    signalData: mockAnswerSDP
  });
  const bobAnswerSignal = await bobGotAnswerPromise;
  assert(bobAnswerSignal.senderPeerId === alice.id && bobAnswerSignal.signalType === "answer", "Bob received WebRTC SDP answer from Alice");

  // Alice sends ICE Candidate to Bob
  const bobGotIcePromise = new Promise(res => bob.once("webrtc-signal", res));
  alice.emit("webrtc-signal", {
    targetPeerId: bob.id,
    signalType: "ice-candidate",
    signalData: mockIceCandidate
  });
  const bobIceSignal = await bobGotIcePromise;
  assert(bobIceSignal.senderPeerId === alice.id && bobIceSignal.signalType === "ice-candidate", "Bob received ICE candidate from Alice");

  // 6. Voice Activity (VAD Speaking & Mute) Simulation
  console.log("\n[Step 6] Simulating Voice Activity & Speaking Indicators...");
  const aliceSeesBobSpeakingPromise = new Promise(res => alice.once("peer-voice-state", res));
  bob.emit("voice-state-update", {
    isSpeaking: true,
    isMuted: false,
    isDeafened: false
  });
  const bobSpeakingState = await aliceSeesBobSpeakingPromise;
  assert(bobSpeakingState.peerId === bob.id && bobSpeakingState.isSpeaking === true, "Alice observed Bob speaking (Cyan VAD trigger)");

  // Alice Mutes
  const bobSeesAliceMutedPromise = new Promise(res => bob.once("peer-voice-state", res));
  alice.emit("voice-state-update", {
    isSpeaking: false,
    isMuted: true,
    isDeafened: false
  });
  const aliceMutedState = await bobSeesAliceMutedPromise;
  assert(aliceMutedState.peerId === alice.id && aliceMutedState.isMuted === true, "Bob observed Alice muted");

  // 7. Real-Time Text Chat Simulation
  console.log("\n[Step 7] Simulating Real-Time Text Messaging...");
  const bobGotMessagePromise = new Promise(res => bob.once("receive-message", res));
  alice.emit("send-message", {
    channelId: "general",
    text: "Hey Bob! Can you hear me on the voice channel?"
  });
  const message1 = await bobGotMessagePromise;
  assert(message1.channelId === "general" && message1.senderName === "Alice", "Bob received chat message from Alice");
  assert(message1.text === "Hey Bob! Can you hear me on the voice channel?", "Message text matches exactly");

  // Bob replies
  const aliceGotReplyPromise = new Promise(res => alice.once("receive-message", res));
  bob.emit("send-message", {
    channelId: "general",
    text: "Yes Alice, audio is crystal clear and low latency!"
  });
  const message2 = await aliceGotReplyPromise;
  assert(message2.senderName === "Bob" && message2.text.includes("crystal clear"), "Alice received Bob's reply");

  // 8. Leaving Voice Channel
  console.log("\n[Step 8] Bob leaves voice channel...");
  const aliceSeesBobLeavePromise = new Promise(res => alice.once("peer-left-voice", res));
  bob.emit("leave-voice");
  const bobLeft = await aliceSeesBobLeavePromise;
  assert(bobLeft.peerId === bob.id, "Alice notified Bob left voice channel");

  // Cleanup
  alice.disconnect();
  bob.disconnect();

  console.log("\n==================================================================");
  console.log(`  ALL ${results.length} QA CHECKS PASSED SUCCESSFULLY!`);
  console.log("==================================================================");
  process.exit(0);
}

runQATest().catch(err => {
  console.error("\n[FATAL QA ERROR]:", err);
  process.exit(1);
});
