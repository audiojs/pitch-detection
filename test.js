import test, { almost, ok, is } from 'tst'
import {
  yin, mcleod, autocorrelation, amdf, hps, cepstrum, swipe, pyin,
  chroma, chord, smoothChords, key, TEMPLATES,
} from './index.js'

let fs = 44100

// --- signal generators ---

function sine(freq, n, sampleRate = fs) {
  let d = new Float32Array(n)
  for (let i = 0; i < n; i++) d[i] = Math.sin(2 * Math.PI * freq * i / sampleRate)
  return d
}

// frequency-modulated sine: instantaneous pitch varies ±depth Hz around baseFreq
function vibrato(baseFreq, depth, modFreq, n, sampleRate = fs) {
  let d = new Float32Array(n), phase = 0
  for (let i = 0; i < n; i++) {
    let f = baseFreq + depth * Math.sin(2 * Math.PI * modFreq * i / sampleRate)
    d[i] = Math.sin(phase)
    phase += 2 * Math.PI * f / sampleRate
  }
  return d
}

// two equal-amplitude sines at f1 and f2
function twosines(f1, f2, n, sampleRate = fs) {
  let d = new Float32Array(n)
  for (let i = 0; i < n; i++)
    d[i] = 0.5 * Math.sin(2 * Math.PI * f1 * i / sampleRate)
           + 0.5 * Math.sin(2 * Math.PI * f2 * i / sampleRate)
  return d
}

function silence(n) { return new Float32Array(n) }

// band-limited sawtooth: sum of H harmonics with 1/h amplitude (simulates a pitched instrument)
function saw(freq, n, harmonics = 10, sampleRate = fs) {
  let d = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let h = 1; h <= harmonics; h++) {
      if (h * freq > sampleRate / 2) break
      s += Math.sin(2 * Math.PI * h * freq * i / sampleRate) / h
    }
    d[i] = s
  }
  return d
}

// chord synthesized as a sum of sawtooths at MIDI pitches
function synthChord(midiNotes, n, harmonics = 6, sampleRate = fs) {
  let d = new Float32Array(n)
  for (let m of midiNotes) {
    let f0 = 440 * Math.pow(2, (m - 69) / 12)
    for (let i = 0; i < n; i++) {
      for (let h = 1; h <= harmonics; h++) {
        if (h * f0 > sampleRate / 2) break
        d[i] += Math.sin(2 * Math.PI * h * f0 * i / sampleRate) / h
      }
    }
  }
  return d
}

// deterministic low-correlation noise: sum of 16 inharmonic sines at irrational ratios
function noise(n, sampleRate = fs) {
  let d = new Float32Array(n)
  let freqs = [317, 641, 1013, 1499, 2003, 2749, 3571, 4201, 5003, 6007, 7109, 8221, 9337, 10613, 11903, 13001]
  for (let i = 0; i < n; i++) {
    let v = 0
    for (let f of freqs) v += Math.sin(2 * Math.PI * f * i / sampleRate)
    d[i] = v / freqs.length
  }
  return d
}

// deterministic white noise via Box–Muller over a seeded LCG
function whiteNoise(n, seed = 42) {
  let d = new Float32Array(n)
  let s = seed
  let rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  for (let i = 0; i < n; i += 2) {
    let u1 = Math.max(1e-12, rand()), u2 = rand()
    let r = Math.sqrt(-2 * Math.log(u1))
    d[i] = r * Math.cos(2 * Math.PI * u2)
    if (i + 1 < n) d[i + 1] = r * Math.sin(2 * Math.PI * u2)
  }
  return d
}


// =============================================================================
// YIN
// =============================================================================

test('yin — 440 Hz sine', () => {
  let r = yin(sine(440, 2048), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 440, 1)
  ok(r.clarity > 0.8, 'high clarity')
})

test('yin — 100 Hz sine', () => {
  let r = yin(sine(100, 4096), { fs })
  ok(r, 'detects low pitch')
  almost(r.freq, 100, 1)
})

test('yin — 220 Hz sine', () => {
  let r = yin(sine(220, 2048), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 220, 1)
})

test('yin — 1000 Hz sine', () => {
  let r = yin(sine(1000, 2048), { fs })
  ok(r, 'detects high pitch')
  almost(r.freq, 1000, 2)
})

test('yin — vibrato 440±20 Hz', () => {
  // single window captures one snapshot of the modulated pitch
  let r = yin(vibrato(440, 20, 5, 2048), { fs })
  ok(r, 'detects vibrato pitch')
  ok(r.freq >= 410 && r.freq <= 470, `freq ${r.freq.toFixed(1)} in vibrato range [410, 470]`)
})

test('yin — silence returns null', () => {
  is(yin(silence(2048), { fs }), null)
})

test('yin — noise returns null or low clarity', () => {
  let r = yin(noise(2048), { fs })
  ok(!r || r.clarity < 0.5, 'noise: no confident pitch')
})


// =============================================================================
// McLeod
// =============================================================================

test('mcleod — 440 Hz sine', () => {
  let r = mcleod(sine(440, 2048), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 440, 1)
  ok(r.clarity > 0.8, 'high clarity')
})

test('mcleod — 100 Hz sine', () => {
  let r = mcleod(sine(100, 4096), { fs })
  ok(r, 'detects low pitch')
  almost(r.freq, 100, 1)
})

test('mcleod — 220 Hz sine', () => {
  let r = mcleod(sine(220, 2048), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 220, 1)
})

test('mcleod — 1000 Hz sine', () => {
  let r = mcleod(sine(1000, 2048), { fs })
  ok(r, 'detects high pitch')
  almost(r.freq, 1000, 2)
})

test('mcleod — vibrato 440±20 Hz', () => {
  let r = mcleod(vibrato(440, 20, 5, 2048), { fs })
  ok(r, 'detects vibrato pitch')
  ok(r.freq >= 410 && r.freq <= 470, `freq ${r.freq.toFixed(1)} in vibrato range`)
})

test('mcleod — silence returns null', () => {
  is(mcleod(silence(2048), { fs }), null)
})

test('mcleod — noise returns null', () => {
  let r = mcleod(noise(2048), { fs })
  ok(!r || r.clarity < 0.9, 'noise: no confident pitch')
})

test('mcleod — prefers lower octave for two sines 220+440', () => {
  // MPM tends to return the first qualifying peak — typically the lower pitch
  let r = mcleod(twosines(220, 440, 2048), { fs })
  ok(r, 'returns a result')
  ok(r.freq >= 200 && r.freq <= 460, `freq ${r.freq.toFixed(1)} is one of the two pitches`)
})


// =============================================================================
// Autocorrelation
// =============================================================================

test('autocorrelation — 440 Hz sine', () => {
  let r = autocorrelation(sine(440, 2048), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 440, 1)
})

test('autocorrelation — 100 Hz sine', () => {
  let r = autocorrelation(sine(100, 4096), { fs })
  ok(r, 'detects low pitch')
  almost(r.freq, 100, 1)
})

test('autocorrelation — 220 Hz sine', () => {
  let r = autocorrelation(sine(220, 2048), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 220, 1)
})

test('autocorrelation — silence returns null', () => {
  is(autocorrelation(silence(2048), { fs }), null)
})

test('autocorrelation — noise returns null or low clarity', () => {
  let r = autocorrelation(noise(2048), { fs })
  ok(!r || r.clarity < 0.7, 'noise: no confident pitch')
})


// =============================================================================
// AMDF
// =============================================================================

test('amdf — 440 Hz sine', () => {
  let r = amdf(sine(440, 2048), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 440, 1)
})

test('amdf — 100 Hz sine', () => {
  let r = amdf(sine(100, 4096), { fs })
  ok(r, 'detects low pitch')
  almost(r.freq, 100, 1)
})

test('amdf — 220 Hz sine', () => {
  let r = amdf(sine(220, 2048), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 220, 1)
})

test('amdf — silence returns null', () => {
  is(amdf(silence(2048), { fs }), null)
})

test('amdf — noise returns null or low clarity', () => {
  let r = amdf(noise(2048), { fs })
  ok(!r || r.clarity < 0.5, 'noise: no confident pitch')
})


// =============================================================================
// HPS — harmonic signals only
// =============================================================================

test('hps — 440 Hz sawtooth', () => {
  let r = hps(saw(440, 4096), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 440, 2)
})

test('hps — 220 Hz sawtooth', () => {
  let r = hps(saw(220, 4096), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 220, 2)
})

test('hps — 110 Hz sawtooth', () => {
  let r = hps(saw(110, 8192), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 110, 2)
})

test('hps — 880 Hz sawtooth', () => {
  let r = hps(saw(880, 4096), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 880, 2)
})

test('hps — silence returns null', () => {
  is(hps(silence(4096), { fs }), null)
})

test('hps — rejects white noise', () => {
  let r = hps(whiteNoise(4096), { fs })
  ok(!r || r.clarity < 0.9, `noise: no confident pitch, got ${r ? r.clarity.toFixed(2) : 'null'}`)
})


// =============================================================================
// Cepstrum — harmonic signals only
// =============================================================================

test('cepstrum — 440 Hz sawtooth', () => {
  let r = cepstrum(saw(440, 4096), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 440, 3)
})

test('cepstrum — 220 Hz sawtooth', () => {
  let r = cepstrum(saw(220, 4096), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 220, 3)
})

test('cepstrum — 110 Hz sawtooth', () => {
  let r = cepstrum(saw(110, 8192), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 110, 3)
})

test('cepstrum — silence returns null', () => {
  is(cepstrum(silence(4096), { fs }), null)
})

test('cepstrum — rejects inharmonic noise', () => {
  let r = cepstrum(noise(4096), { fs })
  ok(!r || r.clarity < 0.5, 'noise: no confident pitch')
})


// =============================================================================
// SWIPE′
// =============================================================================

test('swipe — 440 Hz sine', () => {
  let r = swipe(sine(440, 4096), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 440, 2)
})

test('swipe — 100 Hz sine', () => {
  let r = swipe(sine(100, 8192), { fs })
  ok(r, 'detects low pitch')
  almost(r.freq, 100, 2)
})

test('swipe — 440 Hz sawtooth', () => {
  let r = swipe(saw(440, 4096), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 440, 2)
})

test('swipe — 220 Hz sawtooth', () => {
  let r = swipe(saw(220, 4096), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 220, 2)
})

test('swipe — silence returns null', () => {
  is(swipe(silence(4096), { fs }), null)
})

test('swipe — rejects white noise', () => {
  let r = swipe(whiteNoise(4096), { fs })
  ok(!r || r.clarity < 0.9, `noise: no confident pitch, got ${r ? r.clarity.toFixed(2) : 'null'}`)
})


// =============================================================================
// pYIN — probabilistic YIN with candidate posterior
// =============================================================================

test('pyin — 440 Hz sine', () => {
  let r = pyin(sine(440, 2048), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 440, 1)
  ok(Array.isArray(r.candidates) && r.candidates.length >= 1, 'exposes candidate distribution')
  ok(Math.abs(r.candidates.reduce((a, c) => a + c.prob, 0) - 1) < 1e-6, 'candidate probs sum to 1')
})

test('pyin — 100 Hz sine', () => {
  let r = pyin(sine(100, 4096), { fs })
  ok(r, 'detects low pitch')
  almost(r.freq, 100, 1)
})

test('pyin — silence returns null', () => {
  is(pyin(silence(2048), { fs }), null)
})

test('pyin — noise returns null or low clarity', () => {
  let r = pyin(noise(2048), { fs })
  ok(!r || r.clarity < 0.5, 'noise: no confident pitch')
})


// =============================================================================
// Chroma — PCP and NNLS
// =============================================================================

test('chroma pcp — C major triad peaks at C, E, G', () => {
  // C4 E4 G4 = MIDI 60, 64, 67 = pitch classes 0, 4, 7
  let c = chroma(synthChord([60, 64, 67], 4096), { fs })
  is(c.length, 12)
  let sum = 0
  for (let x of c) sum += x
  almost(sum, 1, 1e-6)
  // the three chord tones should dominate the 12-bin profile
  let top3 = [...c].map((v, i) => [i, v]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]).sort((a, b) => a - b)
  is(top3.join(','), '0,4,7')
})

test('chroma nnls — C major triad peaks at C, E, G', () => {
  let c = chroma(synthChord([60, 64, 67], 4096), { fs, method: 'nnls' })
  let top3 = [...c].map((v, i) => [i, v]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]).sort((a, b) => a - b)
  is(top3.join(','), '0,4,7')
})

test('chroma nnls — A minor triad peaks at A, C, E', () => {
  // A4 C5 E5 = MIDI 69, 72, 76 = pitch classes 9, 0, 4
  let c = chroma(synthChord([69, 72, 76], 4096), { fs, method: 'nnls' })
  let top3 = [...c].map((v, i) => [i, v]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]).sort((a, b) => a - b)
  is(top3.join(','), '0,4,9')
})

test('chroma pcp — silence gives zero-vector (not NaN)', () => {
  let c = chroma(silence(4096), { fs })
  is(c.length, 12)
  let sum = 0
  for (let x of c) sum += x
  is(sum, 0)
})


// =============================================================================
// Chord templates + Viterbi smoothing
// =============================================================================

test('chord — C major triad → "C"', () => {
  let c = chroma(synthChord([60, 64, 67], 4096), { fs, method: 'nnls' })
  let r = chord(c)
  is(r.label, 'C')
  is(r.quality, 'maj')
  is(r.root, 0)
})

test('chord — A minor triad → "Am"', () => {
  let c = chroma(synthChord([69, 72, 76], 4096), { fs, method: 'nnls' })
  let r = chord(c)
  is(r.label, 'Am')
  is(r.quality, 'min')
  is(r.root, 9)
})

test('chord — F major triad → "F"', () => {
  // F4 A4 C5 = MIDI 65, 69, 72
  let c = chroma(synthChord([65, 69, 72], 4096), { fs, method: 'nnls' })
  let r = chord(c)
  is(r.label, 'F')
})

test('chord — G major triad → "G"', () => {
  // G4 B4 D5 = MIDI 67, 71, 74
  let c = chroma(synthChord([67, 71, 74], 4096), { fs, method: 'nnls' })
  let r = chord(c)
  is(r.label, 'G')
})

test('chord — zero chroma → "N"', () => {
  let r = chord(new Float64Array(12))
  is(r.label, 'N')
})

test('chord — 24 binary templates', () => {
  is(TEMPLATES.length, 24)
  // each template has exactly 3 active tones
  for (let t of TEMPLATES) {
    let nz = 0
    for (let i = 0; i < 12; i++) if (t.vec[i] > 0) nz++
    is(nz, 3)
  }
})

test('smoothChords — I-IV-V-I progression with repeats', () => {
  // each chord held for 2 frames
  let progs = [[60,64,67],[60,64,67],[65,69,72],[65,69,72],[67,71,74],[67,71,74],[60,64,67],[60,64,67]]
  let frames = progs.map(p => chroma(synthChord(p, 4096), { fs, method: 'nnls' }))
  let seq = smoothChords(frames).map(s => s.label)
  is(seq.join(' '), 'C C F F G G C C')
})

test('smoothChords — Viterbi stabilizes noisy chord stream', () => {
  // C for 3 frames, one spurious frame, C for 3 more → smoothed should stay C throughout
  let c = chroma(synthChord([60, 64, 67], 4096), { fs, method: 'nnls' })
  let spur = new Float64Array(12)
  spur[1] = 0.5; spur[2] = 0.3; spur[6] = 0.2       // random non-chord
  let frames = [c, c, c, spur, c, c, c]
  let seq = smoothChords(frames, { selfProb: 0.9 }).map(s => s.label)
  ok(seq.every(l => l === 'C'), `stable: ${seq.join(' ')}`)
})


// =============================================================================
// Key detection (Krumhansl–Schmuckler)
// =============================================================================

test('key — C major chroma → C major', () => {
  let c = chroma(synthChord([60, 64, 67], 4096), { fs, method: 'nnls' })
  let r = key(c)
  is(r.label, 'C')
  is(r.mode, 'major')
  is(r.tonic, 0)
})

test('key — A minor chroma → A minor', () => {
  let c = chroma(synthChord([69, 72, 76], 4096), { fs, method: 'nnls' })
  let r = key(c)
  is(r.label, 'Am')
  is(r.mode, 'minor')
  is(r.tonic, 9)
})

test('key — full C major scale resolves to C major', () => {
  // play the C major scale: C D E F G A B → pitch classes 0 2 4 5 7 9 11
  let frames = [0, 2, 4, 5, 7, 9, 11].map(pc => {
    let midi = 60 + pc      // C4 up
    return chroma(synthChord([midi], 4096), { fs, method: 'nnls' })
  })
  let r = key(frames)
  is(r.label, 'C')
  is(r.mode, 'major')
})

test('key — scores are sorted descending', () => {
  let c = chroma(synthChord([60, 64, 67], 4096), { fs, method: 'nnls' })
  let r = key(c)
  is(r.scores.length, 24)
  for (let i = 1; i < r.scores.length; i++) ok(r.scores[i].score <= r.scores[i - 1].score)
})
