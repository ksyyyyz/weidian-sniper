import { getSetting, setSetting } from '../db'
import { info, error } from '../utils/logger'

// Time APIs to try (in order of preference)
const TIME_APIS = [
  'https://api.taobao.com/rest/api3.do?api=mtop.common.getTimestamp&data=%7B%7D',
  'https://api.m.jd.com/client.action?functionId=time',
  'https://worldtimeapi.org/api/timezone/Asia/Shanghai',
]

let cachedOffset = 0
let lastSyncTime = 0

/**
 * Try to get server time from a URL.
 * Returns parsed timestamp in ms, or null.
 */
async function fetchServerTime(url) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const resp = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    clearTimeout(timeout)
    const text = await resp.text()

    // Try parsing JSON
    try {
      const json = JSON.parse(text)
      // Common patterns:
      //淘宝: { data: { t: "1716200000000" } }
      // worldtimeapi: { unixtime: 1716200000 }
      if (json.data?.t) return Number(json.data.t)
      if (json.unixtime) return json.unixtime * 1000
      if (json.datetime) return new Date(json.datetime).getTime()
    } catch {
      // Not JSON
    }

    // Try parsing as plain number
    const num = Number(text.trim())
    if (!isNaN(num)) {
      return num > 1e12 ? num : num * 1000
    }
  } catch {
    // Failed
  }
  return null
}

/**
 * Sync time with remote server.
 * Stores computed offset in settings.
 */
export async function syncTime() {
  for (const url of TIME_APIS) {
    const serverTime = await fetchServerTime(url)
    if (serverTime) {
      const localTime = Date.now()
      cachedOffset = serverTime - localTime
      lastSyncTime = localTime
      await setSetting('_timeOffset', String(cachedOffset))
      await setSetting('_lastSyncTime', String(lastSyncTime))
      await info('time_synced', {
        url,
        errorMessage: `时间同步完成，偏移量: ${cachedOffset}ms (${(cachedOffset / 1000).toFixed(2)}s)`
      })
      return { offset: cachedOffset, serverTime, localTime }
    }
  }

  // Fallback: load last known offset
  const saved = await getSetting('_timeOffset')
  if (saved) {
    cachedOffset = Number(saved)
    lastSyncTime = Number(await getSetting('_lastSyncTime') || 0)
    return { offset: cachedOffset, serverTime: null, localTime: Date.now(), cached: true }
  }

  await error('time_sync_failed', { errorMessage: '无法获取服务器时间，使用本地时间' })
  return { offset: 0, serverTime: null, localTime: Date.now(), failed: true }
}

/**
 * Get current corrected time (local + server offset + user bias).
 */
export async function getCorrectedTime() {
  if (!lastSyncTime || Date.now() - lastSyncTime > 3600000) {
    await syncTime()
  }
  const bias = Number(await getSetting('timeOffset') || 0)
  return Date.now() + cachedOffset + bias
}

/**
 * Get the raw server offset without user bias.
 */
export function getServerOffset() {
  return cachedOffset
}

/**
 * Calculate when to trigger the buy action.
 * Returns targetTime (absolute ms).
 */
export async function getBuyTarget() {
  const targetScheduled = await getSetting('targetTime') // user-set time as ISO string
  if (!targetScheduled) return null
  const target = new Date(targetScheduled).getTime()
  const bias = Number(await getSetting('timeOffset') || 0)
  // Apply server offset and user bias (negative bias = fire earlier)
  return target - bias - cachedOffset
}

/**
 * Get ms remaining until target time (corrected).
 */
export async function getMsUntilTarget() {
  const target = await getBuyTarget()
  if (!target) return null
  return target - Date.now()
}
