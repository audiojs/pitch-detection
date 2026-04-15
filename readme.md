# pitch-detection [![test](https://github.com/audiojs/pitch-detection/actions/workflows/test.yml/badge.svg)](https://github.com/audiojs/pitch-detection/actions/workflows/test.yml) [![npm](https://img.shields.io/npm/v/pitch-detection)](https://www.npmjs.com/package/pitch-detection) [![MIT](https://img.shields.io/badge/MIT-%E0%A5%90-white)](https://github.com/krishnized/license)

Monophonic pitch estimation — YIN, McLeod, and autocorrelation. Zero dependencies, time-domain.

<table><tr><td valign="top">

**[YIN](#yindata-opts)**<br>
<sub>Difference fn → cumulative mean normalization → threshold → parabolic interpolation</sub>

**[McLeod](#mcleoddata-opts)**<br>
<sub>Normalized square difference → positive-region peak picking → parabolic interpolation</sub>

</td><td valign="top">

**[Autocorrelation](#autocorrelationdata-opts)**<br>
<sub>Normalized autocorrelation → first peak after initial descent</sub>

</td></tr></table>


## Install

```
npm install pitch-detection
```


## Usage

```js
import { yin, mcleod, autocorrelation } from 'pitch-detection'

let fs = 44100
let window = new Float32Array(2048)  // fill from your audio source

let result = yin(window, { fs })
// → { freq: 440.1, clarity: 0.97 }  or  null (silence / noise / polyphony)

result.freq     // fundamental frequency in Hz
result.clarity  // confidence in [0, 1] — 1 = perfectly periodic
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

**Choosing threshold** — controls clarity/sensitivity tradeoff:

```js
yin(frame, { fs, threshold: 0.10 })  // stricter: fewer detections, more accurate
yin(frame, { fs, threshold: 0.20 })  // looser: more detections, more octave errors
```


## How it works

All three algorithms share the same structure:

```
  raw window  →  periodicity function  →  peak pick  →  parabolic interpolation  →  { freq, clarity }
```

They differ in what periodicity function they compute and how they pick the peak.

**YIN** computes the *cumulative mean normalized difference function* (CMND) — a normalized measure of how different a signal is from a delayed copy of itself. A dip below the threshold means the signal repeats at that lag: reliable, resistant to noise.

**McLeod** computes the *normalized square difference function* (NSDF) — equivalent to normalized autocorrelation, but expressed as `1 - d(τ)/norm`. Peaks above zero correspond to periodic lags; the first peak above a fraction of the global maximum is chosen. Needs only 2 periods in the window, so it works with smaller windows and tracks vibrato more tightly.

**Autocorrelation** directly correlates the signal with its shifted self. The first large peak after the initial self-correlation peak is the period. Simplest, fastest to understand, most prone to octave errors.

### Return value

All functions return `{ freq, clarity } | null`:

- `freq` — fundamental frequency in Hz
- `clarity` — algorithm-specific confidence in `[0, 1]`. For YIN: `1 − CMND(τ)` at the chosen lag (higher = cleaner). For McLeod: NSDF peak value (higher = more periodic). For autocorrelation: normalized `r(τ)` at the first peak.
- `null` — when no periodic structure is found (silence, noise, polyphonic content)


## YIN `(data, opts)`

**de Cheveigné & Kawahara, 2002.** The reference algorithm for monophonic pitch estimation. Most cited, most tested, most robust.

```js
import yin from 'pitch-detection/yin.js'
// or
import { yin } from 'pitch-detection'

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
**Complexity:** $O(N^2/4)$ — two nested passes over half the window. FFT acceleration possible but not needed at typical window sizes.


## McLeod `(data, opts)`

**McLeod & Wyvill, 2005.** Normalized square difference with smarter peak picking. Handles smaller windows — good for vibrato and fast pitch changes.

```js
import mcleod from 'pitch-detection/mcleod.js'
// or
import { mcleod } from 'pitch-detection'

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


## Autocorrelation `(data, opts)`

Normalized autocorrelation — the simplest pitch estimator. Educational baseline.

```js
import autocorrelation from 'pitch-detection/autocorrelation.js'
// or
import { autocorrelation } from 'pitch-detection'

let result = autocorrelation(samples, { fs: 44100 })
```

**Steps:**

1. **Autocorrelation** — $r(\tau) = \sum_j x_j x_{j+\tau}$ for $\tau = 0 \ldots W/2$
2. **Normalize** — divide by $r(0)$ so $r(0) = 1$
3. **Peak pick** — descend past the initial region, climb to the first peak above threshold
4. **Output** — $f_0 = f_s / \tau$, $\text{clarity} = r(\tau)$

| Param | Default | |
|---|---|---|
| `fs` | `44100` | Sample rate (Hz) |
| `threshold` | `0.5` | Minimum normalized autocorrelation value to accept |

**Use when:** Learning, quick prototypes, signals with strong dominant periodicity and low noise.<br>
**Not for:** Production — octave errors are common without additional heuristics.<br>
**Ref:** Rabiner, ["Use of autocorrelation analysis for pitch detection"](https://doi.org/10.1109/TASSP.1977.1162905), IEEE TASSP 1977.<br>
**Complexity:** $O(N^2/4)$.


## Comparison

| | YIN | McLeod | Autocorrelation |
|---|---|---|---|
| **Accuracy** | ★★★★★ | ★★★★ | ★★★ |
| **Noise robustness** | ★★★★★ | ★★★★ | ★★★ |
| **Octave errors** | rare | rare | common |
| **Min window** | ~4 periods | ~2 periods | ~4 periods |
| **Clarity metric** | `1 − CMND(τ)` | `NSDF peak` | `r(τ)/r(0)` |
| **Threshold param** | CMND dip level | fraction of peak | min correlation |
| **Best for** | general purpose | vibrato, small windows | baseline / learning |

**Accuracy** — precision on clean pitched signals at typical window sizes.

**Octave errors** — reporting half or double the true pitch. YIN's cumulative normalization suppresses large-tau false minima. Autocorrelation has no such suppression.

**Min window** — minimum samples needed for reliable detection. At $f_0 = 100\,\text{Hz}$, $f_s = 44100$: period $= 441$ samples → YIN needs $\sim 4 \times 441 = 1764$, McLeod needs $\sim 2 \times 441 = 882$.

### Choosing an algorithm

**Use YIN** when you need the most reliable result and can afford a full-size window (2048–4096 samples). The threshold directly controls how strict the periodicity requirement is.

**Use McLeod** when tracking fast pitch changes or vibrato, or when you want a smaller window. The NSDF peak selection naturally avoids sub-octave errors by choosing the first qualifying peak rather than the global minimum.

**Use autocorrelation** as a teaching tool or a sanity check. It shows the core idea without extra machinery — useful for understanding why YIN and McLeod improve on it.


## See also

- [beat-detection](https://github.com/audiojs/beat-detection) — onset detection, tempo estimation, beat tracking
- [digital-filter](https://github.com/audiojs/digital-filter) — filter design and processing
- [time-stretch](https://github.com/audiojs/time-stretch) — time stretching and pitch shifting
- [pitch-shift](https://github.com/audiojs/pitch-shift) — pitch shifting algorithms
