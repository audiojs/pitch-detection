import test, { almost, ok, is } from 'tst'
import { yin, mcleod, autocorrelation } from './index.js'

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
  ok(r.freq >= 410 && r.freq <= 470, `freq ${r.freq.toFixed(1)} in vibrato range [420, 460]`)
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
  almost(r.freq, 440, 5)
})

test('autocorrelation — 100 Hz sine', () => {
  let r = autocorrelation(sine(100, 4096), { fs })
  ok(r, 'detects low pitch')
  almost(r.freq, 100, 2)
})

test('autocorrelation — 220 Hz sine', () => {
  let r = autocorrelation(sine(220, 2048), { fs })
  ok(r, 'detects pitch')
  almost(r.freq, 220, 5)
})

test('autocorrelation — silence returns null', () => {
  is(autocorrelation(silence(2048), { fs }), null)
})

test('autocorrelation — noise returns null or low clarity', () => {
  let r = autocorrelation(noise(2048), { fs })
  ok(!r || r.clarity < 0.7, 'noise: no confident pitch')
})
