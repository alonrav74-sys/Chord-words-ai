
// whisper-tiny.js — Whisper Tiny Local Runtime (Hebrew + English)
// Loads whisper-tiny.wasm and runs local ggml-tiny.bin model
import initWhisper from './whisper-tiny.wasm';

export async function loadWhisper(modelPath = './ggml-tiny.bin') {
  const response = await fetch(modelPath);
  const buffer = await response.arrayBuffer();
  const module = await initWhisper();
  const instance = await module.init(buffer);
  return instance;
}

export async function transcribe(instance, audioBuffer) {
  const result = await instance.transcribe(audioBuffer, { language: 'auto' });
  return result;
}
