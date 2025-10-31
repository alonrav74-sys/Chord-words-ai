/**
 * ChordEnginePro v3.0
 * Extends: ChordEngine v3 (base + HMM)
 * Adds: Accuracy layers (Quality detection, Inversions, Ornaments, Modal analysis)
 */

class ChordEnginePro extends ChordEngine {
  constructor() {
    super(); // Inherit from ChordEngine v3!
    
    // Extended templates (7ths, 9ths, etc.)
    this.EXTENDED_TEMPLATES = {
      ...this.CHORD_TEMPLATES, // Include basic templates
      
      // 7th chords
      maj7: { intervals: [0, 4, 7, 11], weights: [1.0, 0.9, 0.8, 0.75], label: 'maj7' },
      dom7: { intervals: [0, 4, 7, 10], weights: [1.0, 0.9, 0.8, 0.75], label: '7' },
      m7: { intervals: [0, 3, 7, 10], weights: [1.0, 0.9, 0.8, 0.75], label: 'm7' },
      dim7: { intervals: [0, 3, 6, 9], weights: [1.0, 0.9, 0.8, 0.75], label: 'dim7' },
      m7b5: { intervals: [0, 3, 6, 10], weights: [1.0, 0.9, 0.8, 0.75], label: 'm7b5' },
      
      // Extended
      dom9: { intervals: [0, 4, 7, 10, 14], weights: [1.0, 0.9, 0.8, 0.7, 0.6], label: '9' },
      maj9: { intervals: [0, 4, 7, 11, 14], weights: [1.0, 0.9, 0.8, 0.7, 0.6], label: 'maj9' },
      m9: { intervals: [0, 3, 7, 10, 14], weights: [1.0, 0.9, 0.8, 0.7, 0.6], label: 'm9' }
    };
  }

  /**
   * Main analysis with PRO features
   * Mode: 'balanced' or 'accurate'
   */
  async analyze(audioData, mode = 'accurate') {
    console.log(`[ChordEnginePro v3.0] Starting PRO analysis (${mode} mode)...`);
    
    // Step 1-4: Base analysis (from ChordEngine)
    const result = await super.analyze(audioData, mode);
    let { timeline, key, bpm, duration } = result;
    const feats = this.extractFeatures(audioData);
    
    if (mode === 'accurate') {
      console.log('[PRO] Adding accuracy layers...');
      
      // Layer 1: Quality detection (7ths, 9ths, sus)
      console.log('  [Layer 1/4] Quality detection...');
      timeline = this.detectQualityPro(timeline, feats, key);
      
      // Layer 2: Adjust minor/major in minor keys
      console.log('  [Layer 2/4] Minor/Major adjustment...');
      timeline = this.adjustMinorMajors(timeline, feats, key);
      
      // Layer 3: Add inversions
      console.log('  [Layer 3/4] Inversion detection...');
      timeline = this.addInversionsPro(timeline, feats);
      
      // Layer 4: Classify ornaments
      console.log('  [Layer 4/4] Ornament classification...');
      timeline = this.classifyOrnaments(timeline, bpm, feats);
    }
    
    return {
      timeline,
      key,
      bpm,
      duration
    };
  }

  /**
   * LAYER 1: Quality Detection (7ths, 9ths, sus)
   * Uses template matching for accurate quality
   */
  detectQualityPro(timeline, feats, key) {
    console.log('    → Detecting chord qualities...');
    const out = [];
    
    for (const ev of timeline) {
      const root = this.parseRoot(ev.label);
      if (root < 0) {
        out.push(ev);
        continue;
      }
      
      // Get local chroma average
      const i0 = Math.max(0, ev.fi - 2);
      const i1 = Math.min(feats.chroma.length - 1, ev.fi + 2);
      const avg = new Float32Array(12);
      
      for (let i = i0; i <= i1; i++) {
        const c = feats.chroma[i];
        for (let p = 0; p < 12; p++) {
          avg[p] += c[p] || 0;
        }
      }
      
      for (let p = 0; p < 12; p++) {
        avg[p] /= (i1 - i0 + 1);
      }
      
      // Template matching
      let bestTemplate = null;
      let bestScore = -Infinity;
      
      for (const [name, template] of Object.entries(this.EXTENDED_TEMPLATES)) {
        const score = this.scoreTemplate(avg, root, template);
        if (score > bestScore) {
          bestScore = score;
          bestTemplate = template;
        }
      }
      
      // Build label
      const newLabel = this.nameSharp(root) + (bestTemplate ? bestTemplate.label : '');
      out.push({ ...ev, label: newLabel });
    }
    
    return out;
  }

  /**
   * Score a template against chroma
   */
  scoreTemplate(chroma, root, template) {
    let score = 0;
    const { intervals, weights } = template;
    
    for (let i = 0; i < intervals.length; i++) {
      const pc = this.toPc(root + intervals[i]);
      score += chroma[pc] * weights[i];
    }
    
    return score;
  }

  /**
   * LAYER 2: Minor/Major Adjustment (in minor keys)
   * Fixes III, V, VII degrees in minor keys
   */
  adjustMinorMajors(timeline, feats, key) {
    if (!key.minor) return timeline;
    
    console.log('    → Adjusting minor/major in minor key...');
    const out = [];
    
    for (const ev of timeline) {
      let label = ev.label;
      const r = this.parseRoot(label);
      
      if (r < 0) {
        out.push(ev);
        continue;
      }
      
      const hasDecor = /(sus|dim|aug|maj7|7|9|add9|m7b5|11|13|6|alt)/.test(label);
      const isMinor = /(^[A-G](?:#|b)?)(m)(?!aj)/.test(label);
      
      if (hasDecor || !isMinor) {
        out.push(ev);
        continue;
      }
      
      const rel = this.toPc(r - key.root);
      const degreeIsIII = (rel === this.MINOR_SCALE[2]); // 3rd degree
      const degreeIsV = (rel === this.MINOR_SCALE[4]);   // 5th degree
      const degreeIsVII = (rel === this.MINOR_SCALE[6]); // 7th degree
      
      if (!(degreeIsIII || degreeIsV || degreeIsVII)) {
        out.push(ev);
        continue;
      }
      
      // Check if M3 is stronger than m3
      const i0 = Math.max(0, ev.fi - 2);
      const i1 = Math.min(feats.chroma.length - 1, ev.fi + 2);
      const avg = new Float32Array(12);
      
      for (let i = i0; i <= i1; i++) {
        const c = feats.chroma[i];
        for (let p = 0; p < 12; p++) {
          avg[p] += c[p] || 0;
        }
      }
      
      for (let p = 0; p < 12; p++) {
        avg[p] /= (i1 - i0 + 1);
      }
      
      const M3 = avg[this.toPc(r + 4)] || 0;
      const m3 = avg[this.toPc(r + 3)] || 0;
      
      // If major third is significantly stronger, make it major
      if (M3 > m3 * 1.25 && M3 > 0.08) {
        label = label.replace(/m(?!aj)/, '');
      }
      
      out.push({ ...ev, label });
    }
    
    return out;
  }

  /**
   * LAYER 3: Inversion Detection
   * Adds /bass notation when bass != root
   */
  addInversionsPro(timeline, feats, bassMul = 1.2) {
    console.log('    → Detecting inversions...');
    const out = [];
    
    for (const ev of timeline) {
      const r = this.parseRoot(ev.label);
      if (r < 0) {
        out.push(ev);
        continue;
      }
      
      // Parse chord tones from label
      const isMinor = /m(?!aj)/.test(ev.label);
      const isSus2 = /sus2/.test(ev.label);
      const isSus4 = /sus4/.test(ev.label);
      const has7 = /7/.test(ev.label);
      const hasMaj7 = /maj7/.test(ev.label);
      const has9 = /9/.test(ev.label) || /add9/.test(ev.label);
      
      let triad = isSus2 ? [0, 2, 7] : 
                   (isSus4 ? [0, 5, 7] : 
                   (isMinor ? [0, 3, 7] : [0, 4, 7]));
      
      if (has7 && !hasMaj7) triad.push(10);
      if (hasMaj7) triad.push(11);
      if (has9) triad.push(2);
      
      const bassPc = feats.bassPc[ev.fi] ?? -1;
      if (bassPc < 0 || bassPc === r) {
        out.push(ev);
        continue;
      }
      
      const rel = this.toPc(bassPc - r);
      const inChord = triad.includes(rel);
      
      if (inChord) {
        const c = feats.chroma[ev.fi] || new Float32Array(12);
        const confidence = c[bassPc] || 0;
        
        // Check temporal stability
        let stableCount = 0;
        const checkRange = 2;
        for (let j = Math.max(0, ev.fi - checkRange); j <= Math.min(feats.bassPc.length - 1, ev.fi + checkRange); j++) {
          if (feats.bassPc[j] === bassPc) stableCount++;
        }
        
        const isStable = stableCount >= 3;
        
        if ((confidence > 0.10 / Math.max(1, bassMul * 0.9)) && isStable) {
          const rootName = ev.label.match(/^([A-G](?:#|b)?)/)?.[1] || '';
          const suffix = ev.label.slice(rootName.length);
          const invLbl = rootName + suffix + '/' + this.nameSharp(bassPc);
          out.push({ ...ev, label: invLbl });
          continue;
        }
      }
      
      out.push(ev);
    }
    
    return out;
  }

  /**
   * LAYER 4: Ornament Classification
   * Identifies passing chords, neighbor chords, pedal points
   */
  classifyOrnaments(timeline, bpm, feats) {
    console.log('    → Classifying ornaments...');
    const spb = 60 / (bpm || 120);
    const out = [];
    
    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      const prev = i > 0 ? timeline[i - 1] : null;
      const next = i < timeline.length - 1 ? timeline[i + 1] : null;
      const dur = next ? (next.t - ev.t) : spb;
      
      let ornamentType = 'structural';
      
      // Passing chord: short duration, stepwise motion
      if (dur < 0.35 * spb && prev && next) {
        const rPrev = this.parseRoot(prev.label);
        const r = this.parseRoot(ev.label);
        const rNext = this.parseRoot(next.label);
        
        if (rPrev >= 0 && r >= 0 && rNext >= 0) {
          const d1 = Math.abs(r - rPrev);
          const d2 = Math.abs(rNext - r);
          if ((d1 <= 2 || d1 >= 10) && (d2 <= 2 || d2 >= 10)) {
            ornamentType = 'passing';
          }
        }
      }
      
      // Neighbor chord: returns to previous
      if (dur < 0.4 * spb && prev && next && prev.label === next.label) {
        ornamentType = 'neighbor';
      }
      
      // Pedal point: bass stays same
      if (prev) {
        const bassCur = feats.bassPc[ev.fi] ?? -1;
        const bassPrev = feats.bassPc[prev.fi] ?? -1;
        if (bassCur >= 0 && bassPrev >= 0 && bassCur === bassPrev) {
          const rCur = this.parseRoot(ev.label);
          const rPrev = this.parseRoot(prev.label);
          if (rCur >= 0 && rPrev >= 0 && rCur !== rPrev) {
            ornamentType = 'pedal';
          }
        }
      }
      
      out.push({ ...ev, ornamentType });
    }
    
    return out;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChordEnginePro;
}
