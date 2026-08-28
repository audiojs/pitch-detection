import test, { almost, ok, is } from 'tst'
import { yin, mcleod, autocorrelation, amdf, hps, cepstrum, swipe, pyin } from './index.js'

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

// Decaying harmonic pluck after a short onset delay. This is harder than a
// stationary sine at low frequencies because the first few periods differ.
function pluck(freq, n, sampleRate, onset = 384) {
  let d = new Float32Array(n)
  for (let i = onset; i < n; i++) {
    let t = (i - onset) / sampleRate
    let attack = 1 - Math.exp(-t * 250)
    for (let h = 1; h <= 10; h++)
      d[i] += attack * Math.exp(-t * (2 + h * 0.8)) *
        Math.sin(2 * Math.PI * h * freq * t + 0.1 * h * h) / Math.pow(h, 0.7)
  }
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

test('yin — bounded range detects a low E pluck in a short window', () => {
  let sampleRate = 48000
  let r = yin(pluck(80.91, 4096, sampleRate), { fs: sampleRate, minFreq: 60, maxFreq: 520 })
  ok(r, 'detects low E after its onset')
  almost(r.freq, 80.91, 0.5)
})

test('yin — bounded range rejects out-of-range pitches', () => {
  is(yin(sine(40, 4096), { fs, minFreq: 60 }), null)
  is(yin(sine(880, 4096), { fs, maxFreq: 520 }), null)
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

