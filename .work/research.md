
## Initial request

* pitch-detection package, as part of audiojs infrastructure. Some similar examples: ~/projects/pitch-shift, ~/projects/time-stretch, ~/projects/beat-detection, ~/projects/digital-filter.

## Expectation

* Collection of pitch and chord detection algorithms - some online services sell it for big money - we should give it for free. A person drops a song and gets a complete analysis of its constituents.
* Eventually we merge that into audiojs/audio for detecting pitch.

### 1. `pitch-detection` — monophonic pitch estimation

Zero dependencies. Time-domain algorithms only.

```
pitch-detection/
├── yin.js              — YIN (de Cheveigné 2002)
├── mcleod.js           — McLeod Pitch Method (McLeod 2005)
├── autocorrelation.js  — normalized autocorrelation (baseline)
├── index.js
├── test.js
├── package.json
└── readme.md
```

**API**:
```js
import { yin, mcleod } from 'pitch-detection'
yin(buffer, { fs }) → { freq, clarity } | null
mcleod(buffer, { fs }) → { freq, clarity } | null
```

**YIN** (~60 lines): difference function d(τ) → cumulative mean normalized d'(τ) → first dip below threshold (default 0.15) → parabolic interpolation for sub-sample accuracy.

**McLeod** (~80 lines): normalized square difference function (NSDF) → positive-going zero crossings → highest peak after first → parabolic interpolation. Needs only 2 periods → smaller windows → better vibrato tracking.

**Autocorrelation** (~30 lines): normalized, no tricks. Educational baseline, prone to octave errors.

**Conventions**:
- Input: Float32Array window (typically 2048 samples at 44100 Hz)
- Returns null on noise/silence/polyphony
- Caller slides window for continuous tracking
- No streaming API yet (offline first)
- threshold param controls clarity/accuracy tradeoff

**Test signals**: pure sine (exact freq match), vibrato sine (tracks modulation), silence (returns null), white noise (returns null), two sines (returns dominant or null), real instrument samples.

**Plots** (SVG, readme): pitch track over time for speech/instrument sample.
