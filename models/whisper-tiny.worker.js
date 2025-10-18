
// whisper-tiny.worker.js — handles Whisper inference in background
importScripts('./whisper-tiny.js');

self.onmessage = async (e) => {
  const { audio, modelPath } = e.data;
  const { loadWhisper, transcribe } = await import('./whisper-tiny.js');
  const whisper = await loadWhisper(modelPath);
  const result = await transcribe(whisper, audio);
  self.postMessage(result);
};
