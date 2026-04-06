/**
 * Normalized autocorrelation pitch detection (baseline).
 * Simplest approach — prone to octave errors without additional heuristics.
 *
 * @param {Float32Array} data - audio samples (single window)
 * @param {{fs?: number, threshold?: number}} params
 * @returns {{freq: number, clarity: number} | null}
 */
export default function autocorrelation(data, params) {
  let fs = params?.fs || 44100
  let threshold = params?.threshold ?? 0.5
  let len = data.length
  let half = len >> 1

  // autocorrelation
  let r = new Float64Array(half)
  for (let tau = 0; tau < half; tau++) {
    let sum = 0
    for (let i = 0; i < half; i++) sum += data[i] * data[i + tau]
    r[tau] = sum
  }

  // normalize by r[0]
  if (r[0] === 0) return null
  let r0 = r[0]
  for (let i = 0; i < half; i++) r[i] /= r0

  // find first peak after first dip
  let tau = 1
  while (tau < half - 1 && r[tau] > r[tau + 1]) tau++ // descend past initial peak
  while (tau < half - 1 && r[tau] < r[tau + 1]) tau++ // climb to first real peak

  if (tau >= half - 1 || r[tau] < threshold) return null

  return { freq: fs / tau, clarity: r[tau] }
}
