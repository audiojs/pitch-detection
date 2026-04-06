import test, { almost, ok, is } from 'tst'
import { yin, mcleod, autocorrelation } from './index.js'

let fs = 44100

function sine(freq, n, sampleRate) {
  let d = new Float32Array(n)
  for (let i = 0; i < n; i++) d[i] = Math.sin(2 * Math.PI * freq * i / sampleRate)
  return d
}

function silence(n) { return new Float32Array(n) }

function noise(n) {
  let d = new Float32Array(n)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  return d
}

// --- YIN ---

test('yin — 440 Hz sine', () => {
  let data = sine(440, 2048, fs)
  let result = yin(data, { fs })
  ok(result, 'detects pitch')
  almost(result.freq, 440, 2)
  ok(result.clarity > 0.8, 'high clarity')
})

test('yin — 100 Hz sine', () => {
  let data = sine(100, 4096, fs)
  let result = yin(data, { fs })
  ok(result, 'detects low pitch')
  almost(result.freq, 100, 2)
})

test('yin — 1000 Hz sine', () => {
  let data = sine(1000, 2048, fs)
  let result = yin(data, { fs })
  ok(result, 'detects high pitch')
  almost(result.freq, 1000, 2)
})

test('yin — silence returns null', () => {
  is(yin(silence(2048), { fs }), null)
})

// --- McLeod ---

test('mcleod — 440 Hz sine', () => {
  let data = sine(440, 2048, fs)
  let result = mcleod(data, { fs })
  ok(result, 'detects pitch')
  almost(result.freq, 440, 2)
  ok(result.clarity > 0.8, 'high clarity')
})

test('mcleod — 100 Hz sine', () => {
  let data = sine(100, 4096, fs)
  let result = mcleod(data, { fs })
  ok(result, 'detects low pitch')
  almost(result.freq, 100, 2)
})

test('mcleod — 1000 Hz sine', () => {
  let data = sine(1000, 2048, fs)
  let result = mcleod(data, { fs })
  ok(result, 'detects high pitch')
  almost(result.freq, 1000, 2)
})

test('mcleod — silence returns null', () => {
  is(mcleod(silence(2048), { fs }), null)
})

// --- Autocorrelation ---

test('autocorrelation — 440 Hz sine', () => {
  let data = sine(440, 2048, fs)
  let result = autocorrelation(data, { fs })
  ok(result, 'detects pitch')
  almost(result.freq, 440, 5)
})

test('autocorrelation — silence returns null', () => {
  is(autocorrelation(silence(2048), { fs }), null)
})
