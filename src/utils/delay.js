/**
 * Normal-distribution random delay using Box-Muller transform.
 * mean: user's configured interval (ms)
 * stdDev: mean * 0.15 (default 15% coefficient of variation)
 *
 * ~68% of delays fall within mean ± 15%
 * ~95% of delays fall within mean ± 30%
 * ~99.7% of delays fall within mean ± 45%
 *
 * Occasionally produces extreme delays (human "zoning out")
 * Hard floor at 10ms, hard ceiling at mean * 3
 */
export function normalDelay(mean, stdDev = null) {
  const sigma = stdDev ?? mean * 0.15
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  let delay = mean + z * sigma
  delay = Math.max(10, Math.min(delay, mean * 3))
  return Math.round(delay)
}

/**
 * Adds "extreme outlier" behavior: ~3% chance of a much longer delay
 * simulating distraction / phone put down briefly.
 */
export function humanDelay(baseMs) {
  const roll = Math.random()
  if (roll < 0.03) {
    // 3% chance: 2-8 second distraction
    return baseMs + 2000 + Math.floor(Math.random() * 6000)
  }
  if (roll < 0.07) {
    // 4% chance: mild slowdown (1.5-3x)
    return Math.round(normalDelay(baseMs) * (1.5 + Math.random() * 1.5))
  }
  return normalDelay(baseMs)
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function randomSleep(baseMs) {
  return sleep(humanDelay(baseMs))
}
