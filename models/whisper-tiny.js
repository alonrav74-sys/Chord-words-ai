// This is a minimal API stub. Replace with your real Whisper web bindings.
// Expected API:
/*
export async function loadWhisper({ wasmPath, workerPath, modelPath, language }){
  const inst = { 
    async init(){}, 
    async transcribe(file, onPartial){
      // return { text, segments: [{text,start,end,words:[{w,ts}]}] }
    }, 
    dispose(){}
  };
  return inst;
}
*/
export async function loadWhisper(){ throw new Error("whisper-tiny.js placeholder. Replace with real bindings."); }
