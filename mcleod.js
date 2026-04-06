/**
 * McLeod Pitch Method (McLeod & Wyvill, 2005).
 * Normalized square difference function → peak picking → parabolic interpolation.
 *
 * @param {Float32Array} data - audio samples (single window)
 * @param {{fs?: number, threshold?: number}} params
 * @returns {{freq: number, clarity: number} | null}
 */
export default function mcleod(data, params) {
  let fs = params?.fs || 44100
  let threshold = params?.threshold ?? 0.9
  let len = data.length
  let half = len >> 1

  // normalized square difference function (NSDF)
  let nsdf = new Float64Array(half)
  for (let tau = 0; tau < half; tau++) {
    let acf = 0, e1 = 0, e2 = 0
    for (let i = 0; i < half; i++) {
      acf += data[i] * data[i + tau]
      e1 += data[i] * data[i]
      e2 += data[i + tau] * data[i + tau]
    }
    nsdf[tau] = e1 + e2 > 0 ? 2 * acf / (e1 + e2) : 0
  }

  // find peaks: positive-going zero crossings, then local maxima
  let peaks = []
  let positive = false
  let maxVal = -Infinity, maxTau = 0

  for (let tau = 1; tau < half; tau++) {
    if (nsdf[tau] > 0 && !positive) {
      positive = true
      maxVal = -Infinity
    }
    if (nsdf[tau] < 0 && positive) {
      if (maxVal > 0) peaks.push({ tau: maxTau, val: maxVal })
      positive = false
    }
    if (positive && nsdf[tau] > maxVal) {
      maxVal = nsdf[tau]
      maxTau = tau
    }
  }
  // catch final region
  if (positive && maxVal > 0) peaks.push({ tau: maxTau, val: maxVal })

  if (!peaks.length) return null

  // pick highest peak above threshold * max
  let best = peaks[0]
  let maxPeak = Math.max(...peaks.map(p => p.val))
  let cutoff = threshold * maxPeak

  for (let p of peaks) {
    if (p.val >= cutoff) { best = p; break }
  }

  // parabolic interpolation
  let tau = best.tau
  if (tau < 1 || tau >= half - 1) return { freq: fs / tau, clarity: best.val }

  let s0 = nsdf[tau - 1], s1 = nsdf[tau], s2 = nsdf[tau + 1]
  let denom = s0 - 2 * s1 + s2
  let shift = denom !== 0 ? (s0 - s2) / (2 * denom) : 0
  let period = tau + shift

  return { freq: fs / period, clarity: best.val }
}
