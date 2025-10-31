/**
 * ChordEngine v3.0
 * Extends: ChordEngineBase (proven key detection + audio processing)
 * Adds: Simple chord tracking with HMM
 */

class ChordEngine extends ChordEngineBase {
  constructor() {
    super(); // Inherit all proven methods from base!
    
    // Chord templates (from working version)
    this.CHORD_TEMPLATES = {
      major: { intervals: [0, 4, 7], weights: [1.0, 0.9, 0.8], label: '' },
      minor: { intervals: [0, 3, 7], weights: [1.0, 0.9, 0.8], label: 'm' },
      dim: { intervals: [0, 3, 6], weights: [1.0, 0.9, 0.8], label: 'dim' },
      aug: { intervals: [0, 4, 8], weights: [1.0, 0.9, 0.8], label: 'aug' },
      sus2: { intervals: [0, 2, 7], weights: [1.0, 0.85, 0.8], label: 'sus2' },
      sus4: { intervals: [0, 5, 7], weights: [1.0, 0.85, 0.8], label: 'sus4' }
    };
  }

  /**
   * Main analysis function
   * Mode: 'fast' or 'balanced'
   */
  async analyze(audioData, mode = 'balanced') {
    console.log(`[ChordEngine v3.0] Starting analysis (${mode} mode)...`);
    
    // Step 1: Extract features (from base - PROVEN!)
    console.log('[1/4] Extracting features...');
    const feats = this.extractFeatures(audioData);
    
    // Step 2: Detect key (from base - PROVEN!)
    console.log('[2/4] Detecting key...');
    const key = this.estimateKey(feats);
    console.log(`  → Key: ${this.nameSharp(key.root)}${key.minor ? 'm' : ''}`);
    
    // Step 3: Chord tracking with HMM (from old working version)
    console.log('[3/4] Tracking chords...');
    let timeline = this.chordTrackingHMM(feats, key, audioData.bpm);
    
    // Step 4: Post-processing
    console.log('[4/4] Finalizing...');
    timeline = this.finalizeTimeline(timeline, key, audioData.bpm, feats);
    
    console.log(`  → Found ${timeline.length} chord changes`);
    
    return {
      timeline,
      key,
      bpm: audioData.bpm,
      duration: audioData.duration
    };
  }

  /**
   * HMM Chord Tracking (from v10 - WORKING VERSION!)
   * This is the proven algorithm that worked well
   */
  chordTrackingHMM(feats, key, bpm) {
    const { chroma, bassPc, hop, sr, frameE } = feats;
    
    // Build diatonic candidates
    const scale = key.minor ? this.MINOR_SCALE : this.MAJOR_SCALE;
    const diatonic = scale.map(s => this.toPc(key.root + s));
    
    const candidates = [];
    for (const r of diatonic) {
      candidates.push({ root: r, label: this.nameSharp(r) });
      candidates.push({ root: r, label: this.nameSharp(r) + 'm' });
    }

    console.log(`  → ${candidates.length} candidates in ${this.nameSharp(key.root)}${key.minor ? 'm' : ''}`);

    // Emission score function
    const emitScore = (frameIdx, cand) => {
      const c = chroma[frameIdx];
      if (!c) return -Infinity;
      
      const isMinor = /m$/.test(cand.label);
      const mask = this.maskVec(cand.root, isMinor ? [0, 3, 7] : [0, 4, 7]);
      
      // Cosine similarity
      let s = this.cosineSim(c, mask);
      
      // Bass boost
      if (bassPc[frameIdx] >= 0 && cand.root === bassPc[frameIdx]) {
        s += 0.15;
      }
      
      // Energy penalty for low energy frames
      if (frameE[frameIdx] < this.percentile(frameE, 30)) {
        s -= 0.10;
      }
      
      return s;
    };

    // Transition penalty function
    const transitionPenalty = (a, b) => {
      if (a.label === b.label) return 0.0;
      
      const dist = Math.min(
        (b.root - a.root + 12) % 12,
        (a.root - b.root + 12) % 12
      );
      
      const sameQual = /m$/.test(a.label) === /m$/.test(b.label);
      return 0.6 + 0.1 * dist + (sameQual ? 0.0 : 0.05);
    };

    // Viterbi algorithm
    const N = candidates.length;
    const M = chroma.length;
    const dp = new Array(N).fill(0);
    const backptr = Array.from({ length: M }, () => new Array(N).fill(-1));

    // Initialize
    for (let s = 0; s < N; s++) {
      dp[s] = emitScore(0, candidates[s]);
    }

    // Forward pass
    for (let i = 1; i < M; i++) {
      const newdp = new Array(N).fill(-Infinity);
      
      for (let s = 0; s < N; s++) {
        let bestVal = -Infinity;
        let bestJ = -1;
        
        for (let j = 0; j < N; j++) {
          const val = dp[j] - transitionPenalty(candidates[j], candidates[s]);
          if (val > bestVal) {
            bestVal = val;
            bestJ = j;
          }
        }
        
        newdp[s] = bestVal + emitScore(i, candidates[s]);
        backptr[i][s] = bestJ;
      }
      
      for (let s = 0; s < N; s++) {
        dp[s] = newdp[s];
      }
    }

    // Backtrack
    let bestS = 0;
    let bestVal = -Infinity;
    for (let s = 0; s < N; s++) {
      if (dp[s] > bestVal) {
        bestVal = dp[s];
        bestS = s;
      }
    }

    const states = new Array(M);
    states[M - 1] = bestS;
    for (let i = M - 1; i > 0; i--) {
      states[i - 1] = backptr[i][states[i]];
    }

    // Convert states to timeline
    const timeline = [];
    const secPerHop = hop / sr;
    let cur = states[0];
    let start = 0;

    for (let i = 1; i < M; i++) {
      if (states[i] !== cur) {
        timeline.push({
          t: start * secPerHop,
          label: candidates[cur].label,
          fi: start
        });
        cur = states[i];
        start = i;
      }
    }
    
    timeline.push({
      t: start * secPerHop,
      label: candidates[cur].label,
      fi: start
    });

    return timeline;
  }

  /**
   * Finalize timeline (from v10 - WORKING!)
   * Removes too-short chords, snaps to beats
   */
  finalizeTimeline(tl, key, bpm, feats) {
    const spb = 60 / Math.max(60, Math.min(200, bpm || 120));
    const minDur = Math.max(0.5, 0.45 * spb);
    const out = [];

    // Remove too-short chords
    for (let i = 0; i < tl.length; i++) {
      const a = tl[i];
      const b = tl[i + 1];
      const dur = (b ? b.t : a.t + 4 * spb) - a.t;

      if (dur < minDur && out.length) {
        const fiA = a.fi;
        const fiB = b ? b.fi : fiA + 1;
        const bpA = feats.bassPc[fiA] ?? -1;
        const bpB = feats.bassPc[Math.min(feats.bassPc.length - 1, fiB)] ?? -1;
        const bassChanged = (bpA >= 0 && bpB >= 0 && bpA !== bpB);

        if (!bassChanged) {
          const prev = out[out.length - 1];
          const r = this.parseRoot(a.label);
          const pr = this.parseRoot(prev.label);
          const inA = this.inKey(r, key.root, key.minor);
          const inP = this.inKey(pr, key.root, key.minor);
          
          if (!inA || inP) {
            continue; // Skip this chord
          }
        }
      }

      out.push(a);
    }

    // Snap to beat grid
    const snapped = [];
    for (const ev of out) {
      const q = Math.max(0, Math.round(ev.t / spb) * spb);
      if (!snapped.length || snapped[snapped.length - 1].label !== ev.label) {
        snapped.push({ t: q, label: ev.label, fi: ev.fi });
      }
    }

    return snapped;
  }

  /**
   * Helper: Create chord mask vector
   */
  maskVec(root, intervals) {
    const v = new Array(12).fill(0);
    intervals.forEach(iv => {
      v[this.toPc(root + iv)] = 1;
    });
    return v;
  }

  /**
   * Helper: Cosine similarity
   */
  cosineSim(a, b) {
    const dot = a.reduce((s, x, i) => s + x * b[i], 0);
    const normA = Math.sqrt(a.reduce((s, x) => s + x * x, 0)) || 1;
    const normB = Math.sqrt(b.reduce((s, x) => s + x * x, 0)) || 1;
    return dot / (normA * normB);
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEngine;
}
