# pitch-detection [![test](https://github.com/audiojs/pitch-detection/actions/workflows/test.yml/badge.svg)](https://github.com/audiojs/pitch-detection/actions/workflows/test.yml) [![npm](https://img.shields.io/npm/v/pitch-detection)](https://www.npmjs.com/package/pitch-detection) [![MIT](https://img.shields.io/badge/MIT-%E0%A5%90-white)](https://github.com/krishnized/license)

Pitch, chroma, chord and key detection. YIN, McLeod, pYIN, HPS, cepstrum, SWIPE, autocorrelation, AMDF, NNLS chroma, chord templates, Krumhansl-Schmuckler.

<table><tr><td valign="top">

### Pitch

**[YIN](#yin)** — cumulative mean normalized difference<br>
**[McLeod](#mcleod)** — normalized square difference (MPM)<br>
**[pYIN](#pyin)** — probabilistic YIN with Beta prior<br>
**[Autocorrelation](#autocorrelation)** — normalized autocorrelation<br>
**[AMDF](#amdf)** — average magnitude difference<br>

</td><td valign="top">

### Spectral pitch

**[HPS](#hps)** — harmonic product spectrum<br>
**[Cepstrum](#cepstrum)** — real cepstrum peak picking<br>
**[SWIPE](#swipe)** — sawtooth waveform inspired estimator<br>

</td><td valign="top">

### Harmony

**[Chroma](#chroma)** — PCP / NNLS pitch-class profiles<br>
**[Chord](#chord)** — template matching + Viterbi smoothing<br>
**[Key](#key)** — Krumhansl-Schmuckler key finding<br>

</td></tr></table>


## Install

```
npm install pitch-detection
```


## Usage

```js
import { yin, mcleod, chroma, chord, key } from 'pitch-detection'

let fs = 44100
let frame = new Float32Array(2048)  // fill from your audio source

// pitch
let result = yin(frame, { fs })
// → { freq: 440.1, clarity: 0.97 }  or  null

// chroma → chord → key
let c = chroma(frame, { fs, method: 'nnls' })
let ch = chord(c)
// → { root: 0, quality: 'maj', label: 'C', confidence: 0.92 }
let k = key(c)
// → { tonic: 0, mode: 'major', label: 'C', confidence: 0.85, scores: [...] }
```

> Works in Node.js and browser. No Web Audio API needed — operates on raw `Float32Array` samples.

**Sliding windows** — call repeatedly as new samples arrive:

```js
let hop = 512
for (let i = 0; i + 2048 <= samples.length; i += hop) {
  let frame = samples.subarray(i, i + 2048)
  let result = yin(frame, { fs })
  if (result) console.log(i / fs, result.freq.toFixed(1))
}
```

**Full pipeline** — pitch → chroma → chord → key on a sequence of frames:

```js
import { chroma, chord, smoothChords, key } from 'pitch-detection'

let frames = []
for (let i = 0; i + 4096 <= samples.length; i += 2048) {
  frames.push(chroma(samples.subarray(i, i + 4096), { fs, method: 'nnls' }))
}
let chords = smoothChords(frames, { selfProb: 0.5 })
// → [{ root: 0, quality: 'maj', label: 'C' }, ...]
let k = key(frames)
// → { tonic: 0, mode: 'major', label: 'C', confidence: 0.85, scores: [...] }
```


## API

All pitch algorithms return `{ freq, clarity } | null`:

- `freq` — fundamental frequency in Hz
- `clarity` — algorithm-specific confidence in `[0, 1]`
- `null` — no periodic structure found (silence, noise, polyphony)

Time-domain algorithms (YIN, McLeod, pYIN, autocorrelation, AMDF) accept any buffer length. Spectral algorithms (HPS, cepstrum, SWIPE, chroma) require power-of-2 length.


---


## YIN

**de Cheveigné & Kawahara, 2002.** The reference algorithm for monophonic pitch estimation. Most cited, most tested, most robust.

```js
import yin from 'pitch-detection/yin.js'

let result = yin(samples, { fs: 44100 })
```

**Steps:**

1. **Difference function** — $d(\tau) = \sum_{j=1}^{W} (x_j - x_{j+\tau})^2$ for lags $\tau = 1 \ldots W/2$
2. **Cumulative mean normalized difference** — $d'(\tau) = d(\tau) \cdot \tau \, / \sum_{j=1}^{\tau} d(j)$, with $d'(0) = 1$
3. **Absolute threshold** — find the first $\tau$ where $d'(\tau) < \text{threshold}$, then descend to the local minimum
4. **Parabolic interpolation** — sub-sample period using neighbors of the chosen $\tau$
5. **Output** — $f_0 = f_s / \tau'$, $\text{clarity} = 1 - d'(\tau)$

| Param | Default | |
|---|---|---|
| `fs` | `44100` | Sample rate (Hz) |
| `threshold` | `0.15` | CMND threshold — lower = stricter, fewer detections |

**Use when:** General-purpose monophonic pitch tracking — speech, singing, solo instruments. The most reliable choice when in doubt.<br>
**Not for:** Polyphonic audio (returns dominant or null), real-time with hard latency budgets (needs full window).<br>
**Ref:** de Cheveigné & Kawahara, ["YIN, a fundamental frequency estimator for speech and music"](https://doi.org/10.1121/1.1458024), JASA 2002.<br>
**Complexity:** $O(N^2/4)$ — two nested passes over half the window.


## McLeod

**McLeod & Wyvill, 2005.** Normalized square difference with smarter peak picking. Handles smaller windows — good for vibrato and fast pitch changes.

```js
import mcleod from 'pitch-detection/mcleod.js'

let result = mcleod(samples, { fs: 44100 })
```

**Steps:**

1. **NSDF** — $\text{NSDF}(\tau) = 2 \sum_j x_j x_{j+\tau} \;/\; \bigl(\sum_j x_j^2 + \sum_j x_{j+\tau}^2\bigr)$, ranges $[-1, 1]$
2. **Positive-region peaks** — collect the local maximum in each positive run that follows a negative region (skipping the self-correlation region at $\tau = 0$)
3. **Threshold** — pick the first peak $\geq k \cdot \max(\text{peaks})$ (default $k = 0.9$)
4. **Parabolic interpolation** — sub-sample the peak
5. **Output** — $f_0 = f_s / \tau'$, $\text{clarity} = \text{NSDF}(\tau)$

| Param | Default | |
|---|---|---|
| `fs` | `44100` | Sample rate (Hz) |
| `threshold` | `0.9` | Peak selection threshold as fraction of global max |

**Use when:** Vibrato tracking, small hop sizes, singing voice where YIN occasionally double-triggers.<br>
**Not for:** Highly noisy signals (NSDF is less thresholded than YIN's CMND).<br>
**Ref:** McLeod & Wyvill, ["A smarter way to find pitch"](https://www.cs.otago.ac.nz/research/publications/oucs-2008-03.pdf), ICMC 2005.<br>
**Complexity:** $O(N^2/4)$ — same asymptotic cost as YIN.


## pYIN

**Mauch & Dixon, 2014.** Probabilistic YIN — runs YIN at multiple thresholds weighted by a Beta(2, 18) prior, producing a distribution over candidate pitches instead of a single hard pick. More robust than YIN on ambiguous frames.

```js
import pyin from 'pitch-detection/pyin.js'

let result = pyin(samples, { fs: 44100 })
// → { freq: 440.1, clarity: 0.92, candidates: [{ freq: 440.1, prob: 0.85 }, ...] }
```

**Steps:**

1. **CMND** — same cumulative mean normalized difference as YIN
2. **Multi-threshold sweep** — for thresholds [0.05, 0.10, …, 0.50], find the first τ where CMND dips below the threshold, then descend to local minimum
3. **Beta weighting** — each threshold's contribution is weighted by Beta(2, 18) pdf, concentrating mass on low thresholds (strict picks)
4. **Aggregation** — probability mass is accumulated per τ; voicing probability = $\max(0, \min(1, 1 - \text{CMND}(\tau)))$
5. **Parabolic interpolation** — sub-sample the most probable τ
6. **Output** — `{ freq, clarity, candidates }` where `candidates` is the full posterior sorted by probability

| Param | Default | |
|---|---|---|
| `fs` | `44100` | Sample rate (Hz) |
| `minFreq` | `50` | Minimum detectable frequency (Hz) |
| `maxFreq` | `2000` | Maximum detectable frequency (Hz) |

**Use when:** Ambiguous pitched content — breathy vocals, noisy recordings, or when you need a pitch posterior for downstream HMM tracking.<br>
**Not for:** Clean signals where YIN already works well (pYIN is ~10× slower due to multi-threshold sweep).<br>
**Ref:** Mauch & Dixon, ["pYIN: A Fundamental Frequency Estimator Using Probabilistic Threshold Distributions"](https://doi.org/10.1109/ICASSP.2014.6853678), ICASSP 2014.


## Autocorrelation

Normalized autocorrelation — the simplest pitch estimator. Educational baseline.

```js
import autocorrelation from 'pitch-detection/autocorrelation.js'

let result = autocorrelation(samples, { fs: 44100 })
```

**Steps:**

1. **Autocorrelation** — $r(\tau) = \sum_{j=0}^{W-\tau-1} x_j x_{j+\tau}$ for $\tau = 0 \ldots W/2$
2. **Normalize** — divide by $r(0)$ so $r(0) = 1$
3. **Peak pick** — descend past the initial region, climb to the first peak above threshold
4. **Parabolic interpolation** — sub-sample the peak using neighbors of $\tau$
5. **Output** — $f_0 = f_s / \tau'$, $\text{clarity} = r(\tau)$

| Param | Default | |
|---|---|---|
| `fs` | `44100` | Sample rate (Hz) |
| `threshold` | `0.5` | Minimum normalized autocorrelation value to accept |

**Use when:** Learning, quick prototypes, signals with strong dominant periodicity and low noise.<br>
**Not for:** Production — octave errors are common without additional heuristics.<br>
**Ref:** Rabiner, ["Use of autocorrelation analysis for pitch detection"](https://doi.org/10.1109/TASSP.1977.1162905), IEEE TASSP 1977.<br>
**Complexity:** $O(N^2/4)$.


## AMDF

**Ross et al., 1974.** Average Magnitude Difference Function — the classical predecessor to YIN. Measures average absolute difference between a signal and its delayed copy; minima indicate periodicity.

```js
import amdf from 'pitch-detection/amdf.js'

let result = amdf(samples, { fs: 44100 })
```

**Steps:**

1. **AMDF** — $d(\tau) = \frac{1}{N - \tau} \sum_{i=0}^{N-\tau-1} |x_i - x_{i+\tau}|$ for valid lag range
2. **Normalize** — divide by max so threshold is scale-invariant
3. **First minimum** — find the first local minimum below threshold
4. **Parabolic interpolation** — sub-sample the minimum
5. **Output** — $f_0 = f_s / \tau'$, $\text{clarity} = 1 - d(\tau)$

| Param | Default | |
|---|---|---|
| `fs` | `44100` | Sample rate (Hz) |
| `minFreq` | `50` | Minimum detectable frequency (Hz) |
| `maxFreq` | `2000` | Maximum detectable frequency (Hz) |
| `threshold` | `0.3` | Normalized AMDF dip threshold |

**Use when:** Low-complexity environments, embedded systems. Simpler and cheaper than YIN (no squaring, no cumulative normalization).<br>
**Not for:** Noisy signals — lacks YIN's cumulative normalization that suppresses octave errors.<br>
**Ref:** Ross et al., ["Average magnitude difference function pitch extractor"](https://doi.org/10.1109/TASSP.1974.1162598), IEEE TASSP 1974.<br>
**Complexity:** $O(N^2/4)$.


---


## HPS

**Schroeder, 1968.** Harmonic Product Spectrum — multiplies the spectrum by its downsampled copies so that harmonic peaks align at the fundamental. Robust to the missing-fundamental problem.

```js
import hps from 'pitch-detection/hps.js'

let result = hps(samples, { fs: 44100 })
```

**Steps:**

1. **FFT** — magnitude spectrum via `rfft`
2. **Log-spaced candidates** — at configurable cent resolution (default 10 cents)
3. **Interpolated harmonic product** — $H(f_0) = \sum_{h=1}^{K} \log \hat{X}(h \cdot f_0)$ with linear interpolation on the magnitude spectrum to avoid bin-alignment bias
4. **Parabolic interpolation** — in log-frequency for sub-cent accuracy
5. **Clarity** — ratio of peak height to second non-adjacent local maximum

| Param | Default | |
|---|---|---|
| `fs` | `44100` | Sample rate (Hz) |
| `harmonics` | `5` | Number of harmonic products |
| `minFreq` | `50` | Minimum detectable frequency (Hz) |
| `maxFreq` | `4000` | Maximum detectable frequency (Hz) |
| `cents` | `10` | Candidate spacing in cents |
| `threshold` | `0.1` | Minimum clarity to accept |

**Use when:** Harmonic-rich signals (guitar, piano, brass). Naturally handles missing fundamentals.<br>
**Not for:** Pure sinusoids (only one harmonic), very noisy signals.<br>
**Ref:** Schroeder, ["Period histogram and product spectrum"](https://doi.org/10.1121/1.1910902), JASA 1968.<br>
**Requires:** Power-of-2 window length.


## Cepstrum

**Noll, 1967.** Real cepstrum — $c(\tau) = \text{IFFT}(\log |\text{FFT}(x)|)$. A peak at quefrency $\tau$ corresponds to period $\tau$ in the time domain.

```js
import cepstrum from 'pitch-detection/cepstrum.js'

let result = cepstrum(samples, { fs: 44100 })
```

**Steps:**

1. **FFT** — complex FFT via `fft`
2. **Log magnitude** — $\log(\sqrt{\text{re}^2 + \text{im}^2} + \epsilon)$
3. **IFFT** — real cepstrum via `ifft`
4. **Peak pick** — largest peak in valid quefrency range $[f_s / f_{\max}, f_s / f_{\min}]$
5. **Parabolic interpolation** — sub-sample the peak
6. **Clarity** — ratio of peak height to second-highest local maximum

| Param | Default | |
|---|---|---|
| `fs` | `44100` | Sample rate (Hz) |
| `minFreq` | `50` | Minimum detectable frequency (Hz) |
| `maxFreq` | `2000` | Maximum detectable frequency (Hz) |
| `threshold` | `0.3` | Minimum clarity to accept |

**Use when:** Harmonic signals where you want a clean spectral-domain method. Good pedagogical complement to time-domain algorithms.<br>
**Not for:** Low-pitched signals (quefrency resolution is limited by window length).<br>
**Ref:** Noll, ["Cepstrum pitch determination"](https://doi.org/10.1121/1.1911537), JASA 1967.<br>
**Requires:** Power-of-2 window length.


## SWIPE

**Camacho & Harris, 2008.** SWIPE' (Sawtooth Waveform Inspired Pitch Estimator, prime harmonics). Measures spectral similarity between the window and a sawtooth template whose lobes sit at prime harmonics. More accurate than HPS on clean instrumental signals; robust against octave errors because only prime harmonics contribute.

Simplified single-window form: uses one FFT instead of the multi-resolution loudness pyramid of the original paper — sufficient for stationary windows.

```js
import swipe from 'pitch-detection/swipe.js'

let result = swipe(samples, { fs: 44100 })
```

**Steps:**

1. **Hann window** — shapes the main lobe for accurate parabolic interpolation
2. **FFT** — magnitude spectrum via `rfft`, then $\sqrt{|X(f)|}$ to emphasize weaker harmonics
3. **Log-spaced candidates** — at configurable cent resolution (default 10 cents)
4. **Cosine kernel** — $K(f; f_k, f_0) = \cos(2\pi(f - f_k) / f_0)$ for $|f - f_k| \leq f_0/2$; positive central lobe rewards harmonic energy, negative sidelobes penalize inter-harmonic energy
5. **Prime harmonics** — only harmonics at orders [1, 2, 3, 5, 7, 11], weighted $1/\sqrt{k}$
6. **Parabolic interpolation** — in log-frequency, then refinement against the nearest spectral peak
7. **Clarity** — normalized peak strength

| Param | Default | |
|---|---|---|
| `fs` | `44100` | Sample rate (Hz) |
| `minFreq` | `60` | Minimum detectable frequency (Hz) |
| `maxFreq` | `4000` | Maximum detectable frequency (Hz) |
| `cents` | `10` | Candidate spacing in cents |
| `threshold` | `0.15` | Minimum clarity to accept |

**Use when:** Clean instrumental signals, studio recordings, where sub-Hz accuracy matters.<br>
**Not for:** Very noisy or reverberant signals (single-window form lacks multi-resolution robustness of the full SWIPE').<br>
**Ref:** Camacho & Harris, ["A sawtooth waveform inspired pitch estimator for speech and music"](https://doi.org/10.1121/1.2951592), JASA 2008.<br>
**Requires:** Power-of-2 window length.


---


## Chroma

**Fujishima, 1999 (PCP) / Mauch & Dixon, 2010 (NNLS).** Chroma feature — a 12-D vector where each bin holds the energy attributed to one pitch class (C, C#, ..., B).

```js
import chroma from 'pitch-detection/chroma.js'

// PCP — classical spectral folding
let c = chroma(samples, { fs: 44100 })

// NNLS — nonnegative least squares (cleaner for polyphonic audio)
let c2 = chroma(samples, { fs: 44100, method: 'nnls' })
```

### PCP (default)

Each spectral bin is mapped to its nearest pitch class and squared magnitudes are accumulated. Simple and fast.

### NNLS

Fits the observed $\sqrt{\text{spectrum}}$ as a nonnegative combination of synthetic pitch-tone profiles (fundamental plus geometrically decaying overtones, Gaussian lobes in log-frequency with σ = 0.5 semitones). Uses multiplicative NMF updates: $a \leftarrow a \cdot (D^\top s) / (D^\top D a + \varepsilon)$. Suppresses octave and harmonic confusion on polyphonic audio.

Pitch dictionary covers MIDI 24–96 (C1–C7) with configurable harmonics per tone.

| Param | Default | |
|---|---|---|
| `fs` | `44100` | Sample rate (Hz) |
| `method` | `'pcp'` | `'pcp'` or `'nnls'` |
| `minFreq` | `65` | Min frequency for PCP mapping (~C2) |
| `maxFreq` | `2093` | Max frequency for PCP mapping (~C7) |
| `harmonics` | `8` | Overtones per pitch (NNLS only) |
| `iterations` | `30` | NMF iterations (NNLS only) |

**Returns:** `Float64Array(12)`, L1-normalized.

**Use when:** Building chord/key detectors, music information retrieval, audio fingerprinting. NNLS for polyphonic; PCP for speed.<br>
**Ref (PCP):** Fujishima, ["Realtime chord recognition of musical sound"](https://doi.org/10.1109/ICMC.1999.318003), ICMC 1999.<br>
**Ref (NNLS):** Mauch & Dixon, ["Approximate Note Transcription for the Improved Identification of Difficult Chords"](https://doi.org/10.5281/zenodo.1416026), ISMIR 2010.<br>
**Requires:** Power-of-2 window length.


## Chord

**Fujishima, 1999 (templates) / Viterbi smoothing.** Classifies chroma frames as one of 24 major/minor triads via cosine similarity with binary templates.

```js
import chord, { TEMPLATES, smooth as smoothChords } from 'pitch-detection/chord.js'

// single frame
let c = chord(chromaVec)
// → { root: 0, quality: 'maj', label: 'C', confidence: 0.92 }

// smoothed sequence
let chords = smoothChords(chromaFrames, { selfProb: 0.5 })
// → [{ root: 0, quality: 'maj', label: 'C' }, ...]
```

### `chord(chromaVec, opts)`

Cosine similarity against 24 binary templates (12 major + 12 minor triads). Returns the best match with confidence score.

| Param | Default | |
|---|---|---|
| `minConfidence` | `0.3` | Below this, returns quality `'N'` (no chord) |

**Returns:** `{ root, quality, label, confidence }` where quality is `'maj'`, `'min'`, or `'N'`.

### `smooth(frames, opts)`

Viterbi decoding with a sticky self-transition prior. Observation log-likelihood = 8 × cosine similarity (temperature 8 gives reasonably sharp distributions).

| Param | Default | |
|---|---|---|
| `selfProb` | `0.5` | Self-transition probability (higher = smoother) |

**Returns:** `{ root, quality, label }[]` — one chord per frame.

### `TEMPLATES`

Exported array of 24 chord templates: `{ root, quality, label, vec }` where `vec` is a `Float64Array(12)` with 1 on chord tones.

**Use when:** Quick chord labeling from chroma features. Combine with NNLS chroma for best results.<br>
**Ref:** Fujishima, ["Realtime chord recognition of musical sound"](https://doi.org/10.1109/ICMC.1999.318003), ICMC 1999.


## Key

**Krumhansl & Schmuckler.** Detects musical key from chroma via Pearson correlation against 24 rotated major/minor key profiles (Krumhansl-Kessler probe-tone ratings).

```js
import key, { KK_MAJOR, KK_MINOR } from 'pitch-detection/key.js'

let k = key(chromaVec)
// → { tonic: 0, mode: 'major', label: 'C', confidence: 0.85, scores: [...] }

// from multiple frames (averages internally)
let k2 = key(chromaFrames)
```

**Steps:**

1. **Average** — if given an array of frames, compute mean chroma
2. **Correlate** — Pearson correlation of input chroma against each of 24 rotated key profiles
3. **Rank** — sort by correlation; highest wins

| Param | Default | |
|---|---|---|
| `profile` | `{ major: KK_MAJOR, minor: KK_MINOR }` | Custom key profiles |

**Returns:** `{ tonic, mode, label, confidence, scores }` where `scores` is all 24 keys sorted descending.

### Exported profiles

- `KK_MAJOR` — Krumhansl-Kessler major profile: `[6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]`
- `KK_MINOR` — Krumhansl-Kessler minor profile: `[6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]`

**Use when:** Key detection for music analysis, automatic transposition, music information retrieval.<br>
**Ref:** Krumhansl, [*Cognitive Foundations of Musical Pitch*](https://doi.org/10.1093/acprof:oso/9780195148367.001.0001), Oxford 1990.<br>
**Ref:** Temperley, ["What's Key for Key?"](https://doi.org/10.1525/mp.1999.17.1.65), Music Perception 1999.


---


## Comparison

### Pitch algorithms

| | YIN | McLeod | pYIN | AMDF | HPS | Cepstrum | SWIPE |
|---|---|---|---|---|---|---|---|
| **Domain** | time | time | time | time | spectral | spectral | spectral |
| **Accuracy** | ★★★★★ | ★★★★ | ★★★★★ | ★★★ | ★★★★ | ★★★ | ★★★★★ |
| **Noise robustness** | ★★★★★ | ★★★★ | ★★★★★ | ★★★ | ★★★ | ★★★ | ★★★★ |
| **Octave errors** | rare | rare | rare | common | rare | occasional | rare |
| **Missing fundamental** | no | no | no | no | yes | yes | yes |
| **Min window** | ~4 periods | ~2 periods | ~4 periods | ~4 periods | power of 2 | power of 2 | power of 2 |
| **Best for** | general | vibrato | ambiguous | embedded | harmonic-rich | pedagogical | studio |

### Choosing an algorithm

**Use YIN** when you need the most reliable result and can afford a full-size window (2048–4096 samples). The threshold directly controls how strict the periodicity requirement is.

**Use McLeod** when tracking fast pitch changes or vibrato, or when you want a smaller window. The NSDF peak selection naturally avoids sub-octave errors.

**Use pYIN** when the signal is ambiguous (breathy vocals, noisy recordings) and you want a pitch posterior for downstream smoothing.

**Use AMDF** in constrained environments. Simpler than YIN — no squaring, no cumulative normalization — but more prone to octave errors.

**Use HPS** for harmonic-rich timbres (guitar, piano, brass) — naturally handles missing fundamentals by aligning harmonic peaks.

**Use Cepstrum** as a spectral-domain complement to time-domain methods, or for pedagogical purposes.

**Use SWIPE** when you need sub-Hz accuracy on clean instrumental signals or studio recordings.


## See also

- [fourier-transform](https://github.com/scijs/fourier-transform) — FFT used by spectral algorithms
- [beat-detection](https://github.com/audiojs/beat-detection) — onset detection, tempo estimation, beat tracking
- [digital-filter](https://github.com/audiojs/digital-filter) — filter design and processing
- [time-stretch](https://github.com/audiojs/time-stretch) — time stretching and pitch shifting
- [pitch-shift](https://github.com/audiojs/pitch-shift) — pitch shifting algorithms
