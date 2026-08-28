/**
 * YIN pitch detection (de Cheveigné & Kawahara, 2002).
 * Difference fn → cumulative mean normalized difference → threshold → parabolic interpolation.
 *
 * @param {Float32Array | Float64Array} data - audio samples (single window, eg. 2048 samples)
 * @param {{fs?: number, threshold?: number, minFreq?: number, maxFreq?: number}} [params]
 * @returns {{freq: number, clarity: number} | null}
 */
export default function yin(data, params) {
  let fs = params?.fs || 44100
  let threshold = params?.threshold ?? 0.15
  let minFreq = params?.minFreq
  let maxFreq = params?.maxFreq
  let len = data.length
  let half = len >> 1

  // With a known lower bound we only need lags through fs/minFreq. Use the
  // remaining samples as a longer fixed comparison window, which materially
  // improves low-pitch detection near an onset without adding latency.
  let bounded = Number.isFinite(minFreq) && minFreq > 0
  let limit = bounded ? Math.min(half, Math.ceil(fs / minFreq) + 2) : half
  let window = bounded ? len - (limit - 1) : half
  if (limit < 4 || window < 1) return null

  // step 1-2: difference function
  let d = new Float64Array(limit)
  for (let tau = 1; tau < limit; tau++) {
    let sum = 0
    for (let i = 0; i < window; i++) {
      let diff = data[i] - data[i + tau]
      sum += diff * diff
    }
    d[tau] = sum
  }

  // step 3: cumulative mean normalized difference
  let cmndf = new Float64Array(limit)
  cmndf[0] = 1
  let running = 0
  for (let tau = 1; tau < limit; tau++) {
    running += d[tau]
    cmndf[tau] = running > 0 ? d[tau] * tau / running : 1
  }

  // step 4: absolute threshold — find first dip below threshold
  let tau = 2
  while (tau < limit - 1) {
    if (cmndf[tau] < threshold) {
      // find local minimum
      while (tau + 1 < limit - 1 && cmndf[tau + 1] < cmndf[tau]) tau++
      break
    }
    tau++
  }
  if (tau >= limit - 1) return null

  // step 5: parabolic interpolation
  let s0 = cmndf[tau - 1], s1 = cmndf[tau], s2 = cmndf[tau + 1]
  let denom = s0 - 2 * s1 + s2
  let shift = denom !== 0 ? (s0 - s2) / (2 * denom) : 0
  let period = tau + shift
  let freq = fs / period

  if (bounded && freq < minFreq) return null
  if (Number.isFinite(maxFreq) && maxFreq > 0 && freq > maxFreq) return null
  return { freq, clarity: 1 - s1 }
}
