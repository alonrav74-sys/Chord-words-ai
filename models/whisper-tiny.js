// Placeholder whisper-tiny.js for dev/testing
export async function loadWhisper(opts){
  return {
    async init(){ /* no-op */ },
    async transcribe(file, onPartial){
      // Fake partials to show the UI works; real lib should yield segments+words with timestamps.
      const demoSegs=[
        { text: "Hello from the demo ", start: 0.0, end: 2.5, words:[{w:"Hello",ts:0.0},{w:"from",ts:0.6},{w:"the",ts:1.0},{w:"demo",ts:1.4}]},
        { text: "this will be synced ", start: 2.5, end: 5.0, words:[{w:"this",ts:2.5},{w:"will",ts:3.0},{w:"be",ts:3.4},{w:"synced",ts:3.8}]}
      ];
      for(const s of demoSegs){ onPartial && onPartial({text:s.text}); await new Promise(r=>setTimeout(r,150)); }
      return { text: demoSegs.map(s=>s.text).join(""), segments: demoSegs };
    },
    dispose(){}
  };
}
