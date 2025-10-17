
const CACHE = "cfai-9.5-local";
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([
    "./", "./index.html", "./manifest.json",
    "./models/whisper-tiny.bin"
  ])));
});
self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

export async function detectChords(source, audioCtx, whisper, onFrame) {
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.8;
  source.connect(analyser);
  const fft = new Float32Array(analyser.frequencyBinCount);
  const chroma = new Float32Array(12);
  const labels = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

  function estimateChord() {
    analyser.getFloatFrequencyData(fft);
    chroma.fill(0);
    const sr = audioCtx.sampleRate;
    for (let bin=1; bin<fft.length; bin++){
      const freq = bin*sr/analyser.fftSize;
      if (freq<50||freq>5000) continue;
      const mag = Math.pow(10, fft[bin]/20);
      const midi = 69 + 12*Math.log2(freq/440);
      const pc = ((Math.round(midi)%12)+12)%12;
      chroma[pc]+=mag;
    }
    const s = chroma.reduce((a,b)=>a+b,0)+1e-9;
    for (let i=0;i<12;i++) chroma[i]/=s;
    let maxI = chroma.indexOf(Math.max(...chroma));
    return {label: labels[maxI], chroma};
  }

  let currentChord = "N";
  const interval = setInterval(()=>{
    const out = estimateChord();
    currentChord = out.label;
    onFrame && onFrame(out);
  }, 400);

  const file = source.mediaElement.src;
  const resp = await fetch(file);
  const blob = await resp.blob();
  const text = await whisper.transcribe(blob);
  clearInterval(interval);

  const lines = text.split(/\n|\r|\.\s+/).filter(Boolean).map(line=>({
    text: line,
    chords: [currentChord]
  }));
  return { lines };
}
