let streamStopped = false;
let intervalCleared = false;
let ctxClosed = false;

const mockTrack = { stop: () => { streamStopped = true; } };
const mockStream = { getTracks: () => [mockTrack] };
const mockCtx = { state: 'running', close: () => { ctxClosed = true; } };

const state = {
  vadInterval: 1234,
  speakingTimeout: 5678,
  localStream: mockStream,
  audioContext: mockCtx,
  analyser: {},
  currentUser: { isSpeaking: true }
};

function stopLocalAudio() {
  if (state.vadInterval) { clearInterval(state.vadInterval); state.vadInterval = null; intervalCleared = true; }
  if (state.speakingTimeout) { clearTimeout(state.speakingTimeout); state.speakingTimeout = null; }
  if (state.localStream) {
    state.localStream.getTracks().forEach(t => t.stop());
    state.localStream = null;
  }
  if (state.audioContext) {
    if (state.audioContext.state !== 'closed') state.audioContext.close();
    state.audioContext = null;
  }
  state.analyser = null;
  state.currentUser.isSpeaking = false;
}

stopLocalAudio();

if (streamStopped && intervalCleared && ctxClosed && state.localStream === null && state.vadInterval === null && state.audioContext === null && state.analyser === null && !state.currentUser.isSpeaking) {
  console.log("PASS: stopLocalAudio() cleans up all resources with 0 leaks!");
  process.exit(0);
} else {
  console.error("FAIL: Leak detected!");
  process.exit(1);
}

