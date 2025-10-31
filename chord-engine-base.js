/**
 * ChordEngine Base v3.0
 * Core audio processing and key detection (proven algorithms from v10)
 */

class ChordEngineBase {
  constructor() {
    // Musical constants
    this.NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.NOTES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    this.MAJOR_SCALE = [0,2,4,5,7,9,11];
    this.MINOR_SCALE = [0,2,3,5,7,8,10];
    
    // Krumhansl-Schmuckler profiles (PROVEN!)
    this.KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
    this.KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
  }

  // ===== UTILITY FUNCTIONS =====
  
  toPc(n) {
    return ((n % 12) + 12) % 12;
  }

  nameSharp(i) {
    return this.NOTES_SHARP[this.toPc(i)];
  }

  nameFlat(i) {
    return this.NOTES_FLAT[this.toPc(i)];
  }

  parseRoot(label) {
    const m = label?.match?.(/^([A-G](?:#|b)?)/);
    if (!m) return -1;
    const nm = m[1].replace('b', '#');
    const i = this.NOTES_SHARP.indexOf(nm);
    return i < 0 ? -1 : i;
  }

  inKey(pc, keyRoot, minor) {
    const scale = minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    return scale.includes(this.toPc(pc - keyRoot));
  }

  // ===== AUDIO DECODING =====
  
  async decodeAudio(file) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    try { await ctx.resume(); } catch {}
    const arr = await file.arrayBuffer();

    let buf;
    try {
      buf = await ctx.decodeAudioData(arr.slice(0));
    } catch (e1) {
      try {
        buf = await new Promise((resolve, reject) => {
          ctx.decodeAudioData(arr.slice(0), b => resolve(b), err => reject(err));
        });
      } catch (e2) {
        throw e2 || e1;
      }
    }

    const mono = (buf.numberOfChannels === 1) ? 
                  buf.getChannelData(0) : 
                  this.mixStereo(buf);
    
    const sr0 = buf.sampleRate;
    const sr = 22050;
    const x = this.resampleLinear(mono, sr0, sr);
    const bpm = this.estimateTempo(x, sr);
    
    return { 
      x, 
      sr, 
      bpm, 
      duration: x.length / sr 
    };
  }

  mixStereo(buf) {
    const a = buf.getChannelData(0);
    const b = (buf.numberOfChannels > 1) ? buf.getChannelData(1) : a;
    const m = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
      m[i] = (a[i] + b[i]) * 0.5;
    }
    return m;
  }

  resampleLinear(x, sr, target) {
    const r = target / sr;
    const L = Math.floor(x.length * r);
    const y = new Float32Array(L);
    for (let i = 0; i < L; i++) {
      const t = i / r;
      const i0 = Math.floor(t);
      const i1 = Math.min(x.length - 1, i0 + 1);
      const a = t - i0;
      y[i] = x[i0] * (1 - a) + x[i1] * a;
    }
    return y;
  }

  // ===== TEMPO ESTIMATION (simple autocorrelation) =====
  
  estimateTempo(x, sr) {
    const hop = Math.floor(0.1 * sr);
    const frames = [];
    
    for (let s = 0; s + 4096 <= x.length; s += hop) {
      let e = 0;
      for (let i = 0; i < 4096; i++) {
        e += x[s + i] * x[s + i];
      }
      frames.push(e);
    }

    const env = frames;
    const minLag = Math.floor(0.3 / (hop / sr));
    const maxLag = Math.floor(2.0 / (hop / sr));
    
    let bestLag = minLag;
    let bestR = -Infinity;
    
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i < env.length - lag; i++) {
        r += env[i] * env[i + lag];
      }
      if (r > bestR) {
        bestR = r;
        bestLag = lag;
      }
    }

    const periodSec = bestLag * (hop / sr);
    const bpm = 60 / periodSec;
    return Math.max(60, Math.min(200, Math.round(bpm)));
  }

  // ===== FEATURE EXTRACTION =====
  
  extractFeatures(audioData) {
    const { x, sr } = audioData;
    const hop = Math.floor(0.10 * sr);
    const win = 4096;
    
    // Hann window
    const hann = new Float32Array(win);
    for (let i = 0; i < win; i++) {
      hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (win - 1)));
    }

    // Create frames
    const frames = [];
    for (let s = 0; s + win <= x.length; s += hop) {
      frames.push(x.subarray(s, s + win));
    }

    const chroma = [];
    const bassPc = [];
    const frameE = [];
    const spectralCentroid = [];

    // Process each frame
    for (let i = 0; i < frames.length; i++) {
      const y = new Float32Array(win);
      for (let k = 0; k < win; k++) {
        y[k] = frames[i][k] * hann[k];
      }

      // Energy
      let en = 0;
      for (let k = 0; k < win; k++) {
        en += y[k] * y[k];
      }
      frameE.push(en);

      // FFT
      const { mags, N } = this.fft(y);
      const hz = (b) => (b * sr / N);

      // Chroma
      const c = new Float32Array(12);
      let eSpec = 0;
      let centroidNum = 0;
      let centroidDen = 0;

      for (let b = 1; b < mags.length; b++) {
        const f = hz(b);
        if (f < 80 || f > 5000) continue;
        
        const midi = 69 + 12 * Math.log2(f / 440);
        const pc = this.toPc(Math.round(midi));
        c[pc] += mags[b];
        eSpec += mags[b];
        centroidNum += f * mags[b];
        centroidDen += mags[b];
      }

      // Normalize chroma
      if (eSpec > 0) {
        let s = 0;
        for (let k = 0; k < 12; k++) s += c[k];
        for (let k = 0; k < 12; k++) c[k] /= s;
      }
      chroma.push(c);
      spectralCentroid.push(centroidDen > 0 ? centroidNum / centroidDen : 0);

      // Bass F0 detection
      const bass = this.detectBassF0(mags, N, sr, win);
      bassPc.push(bass);
    }

    // Temporal stability for bass
    const bassPcStable = this.stabilizeBass(bassPc, frameE);

    return {
      chroma,
      bassPc: bassPcStable,
      frameE,
      spectralCentroid,
      hop,
      sr
    };
  }

  // ===== FFT (Cooley-Tukey) =====
  
  fft(input) {
    let n = input.length;
    let N = 1;
    while (N < n) N <<= 1;
    
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    re.set(input);

    // Bit reversal
    let j = 0;
    for (let i = 0; i < N; i++) {
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
      let m = N >> 1;
      while (m >= 1 && j >= m) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }

    // FFT butterfly
    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wlr = Math.cos(ang);
      const wli = Math.sin(ang);
      
      for (let i = 0; i < N; i += len) {
        let wr = 1, wi = 0;
        for (let k = 0; k < (len >> 1); k++) {
          const ur = re[i + k];
          const ui = im[i + k];
          const vr = re[i + k + (len >> 1)] * wr - im[i + k + (len >> 1)] * wi;
          const vi = re[i + k + (len >> 1)] * wi + im[i + k + (len >> 1)] * wr;
          
          re[i + k] = ur + vr;
          im[i + k] = ui + vi;
          re[i + k + (len >> 1)] = ur - vr;
          im[i + k + (len >> 1)] = ui - vi;
          
          const nwr = wr * wlr - wi * wli;
          wi = wr * wli + wi * wlr;
          wr = nwr;
        }
      }
    }

    const mags = new Float32Array(N >> 1);
    for (let k = 0; k < mags.length; k++) {
      mags[k] = Math.hypot(re[k], im[k]);
    }

    return { mags, N };
  }

  // ===== BASS F0 DETECTION (ACF on LPF) =====
  
  detectBassF0(mags, N, sr, win) {
    const hz = (b) => (b * sr / N);
    const fmax = 250;
    
    // Low-pass filter
    const magsLP = new Float32Array(mags.length);
    for (let b = 1; b < mags.length; b++) {
      const f = hz(b);
      if (f <= fmax) magsLP[b] = mags[b];
    }

    // IFFT approximation
    const yLP = new Float32Array(win);
    for (let b = 1; b < magsLP.length; b++) {
      const f = hz(b);
      if (f <= fmax) {
        const omega = 2 * Math.PI * f / sr;
        for (let n = 0; n < win; n++) {
          yLP[n] += magsLP[b] * Math.cos(omega * n);
        }
      }
    }

    // Autocorrelation
    const fmin = 40;
    const f0minLag = Math.floor(sr / fmax);
    const f0maxLag = Math.floor(sr / Math.max(1, fmin));
    
    let bestLag = -1;
    let bestR = -1;
    const mean = yLP.reduce((s, v) => s + v, 0) / win;
    
    let denom = 0;
    for (let n = 0; n < win; n++) {
      const d = yLP[n] - mean;
      denom += d * d;
    }
    denom = Math.max(denom, 1e-9);

    for (let lag = f0minLag; lag <= f0maxLag; lag++) {
      let r = 0;
      for (let n = 0; n < win - lag; n++) {
        const a = yLP[n] - mean;
        const b = yLP[n + lag] - mean;
        r += a * b;
      }
      r /= denom;
      if (r > bestR) {
        bestR = r;
        bestLag = lag;
      }
    }

    // Convert lag to pitch class
    let pcBass = -1;
    if (bestLag > 0) {
      const f0 = sr / bestLag;
      if (f0 >= fmin && f0 <= fmax) {
        const midiF0 = 69 + 12 * Math.log2(f0 / 440);
        pcBass = this.toPc(Math.round(midiF0));
      }
    }

    return pcBass;
  }

  // ===== BASS STABILIZATION =====
  
  stabilizeBass(bassCand, frameE) {
    const thrE = this.percentile(frameE, 40);
    const bassPc = new Array(bassCand.length).fill(-1);

    // Temporal consistency
    for (let i = 1; i < bassCand.length - 1; i++) {
      const v = bassCand[i];
      if (v < 0) continue;
      if (frameE[i] < thrE) continue;
      if ((bassCand[i - 1] === v) || (bassCand[i + 1] === v)) {
        bassPc[i] = v;
      }
    }

    // Close short runs
    let runStart = -1;
    let runVal = -2;
    
    for (let i = 0; i < bassPc.length; i++) {
      const v = bassPc[i];
      if (v >= 0 && runStart < 0) {
        runStart = i;
        runVal = v;
      }
      const end = (i === bassPc.length - 1) || (bassPc[i + 1] !== v);
      if (runStart >= 0 && end) {
        if (i - runStart + 1 >= 2) {
          for (let k = runStart; k <= i; k++) bassPc[k] = runVal;
        } else {
          for (let k = runStart; k <= i; k++) bassPc[k] = -1;
        }
        runStart = -1;
        runVal = -2;
      }
    }

    return bassPc;
  }

  // ===== KEY DETECTION (Krumhansl-Schmuckler) =====
  
  estimateKey(feats) {
    const { chroma } = feats;
    const L = chroma.length;
    
    // Aggregate chroma
    const agg = new Array(12).fill(0);
    for (let i = 0; i < L; i++) {
      for (let p = 0; p < 12; p++) {
        agg[p] += chroma[i][p];
      }
    }
    
    const s = agg.reduce((a, b) => a + b, 0) || 1;
    for (let p = 0; p < 12; p++) {
      agg[p] /= s;
    }

    // Test all 24 keys
    let best = { score: -1, root: 0, minor: false };
    
    for (let r = 0; r < 12; r++) {
      const sMaj = this.ksScore(agg, r, false);
      const sMin = this.ksScore(agg, r, true);
      
      if (sMaj > best.score) {
        best = { score: sMaj, root: r, minor: false };
      }
      if (sMin > best.score) {
        best = { score: sMin, root: r, minor: true };
      }
    }

    console.log(`[KeyDetection] Best: ${this.nameSharp(best.root)}${best.minor ? 'm' : ''} (score: ${best.score.toFixed(3)})`);
    
    return { root: best.root, minor: best.minor };
  }

  ksScore(chromaAgg, root, isMinor) {
    const prof = isMinor ? this.KS_MINOR : this.KS_MAJOR;
    let s = 0;
    for (let i = 0; i < 12; i++) {
      s += chromaAgg[this.toPc(i + root)] * prof[i];
    }
    return s;
  }

  // ===== UTILITIES =====
  
  percentile(arr, p) {
    const a = [...arr].filter(x => Number.isFinite(x)).sort((x, y) => x - y);
    if (!a.length) return 0;
    const i = Math.floor((p / 100) * (a.length - 1));
    return a[i];
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngineBase;
}
