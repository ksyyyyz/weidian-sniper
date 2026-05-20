import { randomUA, randomDeviceId, randomIP } from '../utils/ua-pool'
import { humanDelay, sleep } from '../utils/delay'
import { warn } from '../utils/logger'
import { getSetting } from '../db'

// Cooldown state per product/account
const cooldowns = new Map()
const backoffCounters = new Map()
const banFlags = new Map()

function cooldownKey(accountId, productId) {
  return `${accountId ?? 'anon'}_${productId ?? 'global'}`
}

/**
 * L1 — Build a disguised request headers set.
 */
export async function buildHeaders(baseHeaders = {}) {
  const ua = randomUA()
  const deviceId = randomDeviceId()
  const headers = {
    'User-Agent': ua,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': randomAcceptLanguage(),
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'X-Device-Id': deviceId,
    'X-Forwarded-For': randomIP(),
    ...baseHeaders
  }
  return headers
}

const LANGUAGES = [
  'zh-CN,zh;q=0.9,en;q=0.8',
  'zh-CN,zh;q=0.9',
  'zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7',
  'zh-CN,zh-TW;q=0.9,en;q=0.8',
]

function randomAcceptLanguage() {
  return LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)]
}

/**
 * L2 — Get randomized delay for a request cycle.
 * Configurable base interval from settings.
 */
export async function getRequestDelay() {
  const interval = await getSetting('interval') || 200
  return humanDelay(Number(interval))
}

/**
 * L3 — Exponential backoff. Returns ms to wait.
 */
export function applyBackoff(accountId) {
  const key = cooldownKey(accountId, null)
  const current = backoffCounters.get(key) || 0
  const next = Math.min(current + 1, 5)
  backoffCounters.set(key, next)
  return Math.pow(2, next) * 1000 // 2s → 4s → 8s → 16s → 32s
}

export function resetBackoff(accountId) {
  const key = cooldownKey(accountId, null)
  backoffCounters.delete(key)
}

/**
 * L3 — Product-level cooldown after detecting risk.
 */
export async function coolDown(accountId, productId) {
  const minutes = await getSetting('cooldownMinutes') || 15
  const key = cooldownKey(accountId, productId)
  cooldowns.set(key, Date.now() + minutes * 60 * 1000)
  warn('cooldown_activated', {
    accountId,
    productId,
    errorMessage: `商品进入冷却期，${minutes}分钟后恢复`
  })
}

export function isInCooldown(accountId, productId) {
  const key = cooldownKey(accountId, productId)
  const until = cooldowns.get(key)
  if (!until) return false
  if (Date.now() > until) {
    cooldowns.delete(key)
    return false
  }
  return true
}

export function getCooldownRemaining(accountId, productId) {
  const key = cooldownKey(accountId, productId)
  const until = cooldowns.get(key)
  if (!until) return 0
  return Math.max(0, Math.ceil((until - Date.now()) / 1000))
}

/**
 * L3 — Flag an account as banned (persistent, until manual reset).
 */
export function flagBanned(accountId, reason = 'unknown') {
  banFlags.set(Number(accountId), { reason, time: Date.now() })
}

export function isBanned(accountId) {
  return banFlags.has(Number(accountId))
}

export function clearBan(accountId) {
  banFlags.delete(Number(accountId))
}

/**
 * L4 — Check if we're in warmup window.
 * Returns true if within warmupSeconds before the target time.
 */
export async function isWarmupWindow(targetTime) {
  if (!targetTime) return false
  const warmup = await getSetting('warmupSeconds') || 3
  const offset = await getSetting('timeOffset') || 0
  const now = Date.now() + offset
  const msUntil = targetTime - now
  return msUntil > 0 && msUntil <= warmup * 1000
}

/**
 * L4 — Get monitor interval adjusted for warmup.
 */
export async function getMonitorInterval() {
  const base = await getSetting('interval') || 200
  const warmup = await getSetting('warmupSeconds') || 3
  const offset = await getSetting('timeOffset') || 0
  // During warmup window: use faster interval (50ms or base/4, whichever is lower)
  return Math.min(50, Math.round(Number(base) / 4))
}

/**
 * Detect risk signals from response and react accordingly.
 * Returns 'ok' | 'cooldown' | 'backoff' | 'banned'
 */
export async function detectRisk(response, accountId, productId) {
  const status = response.status

  if (status === 403 || status === 401) {
    flagBanned(accountId, `HTTP ${status}`)
    warn('account_banned', { accountId, productId, statusCode: status, errorMessage: `账号被限制 (HTTP ${status})` })
    return 'banned'
  }

  if (status === 429) {
    const waitMs = applyBackoff(accountId)
    await coolDown(accountId, productId)
    warn('rate_limited', { accountId, productId, statusCode: 429, errorMessage: `触发频率限制，退避 ${waitMs}ms` })
    await sleep(waitMs)
    return 'cooldown'
  }

  // Check response body for risk keywords
  try {
    const clone = response.clone()
    const text = await clone.text()
    const lower = text.toLowerCase()
    const riskKeywords = ['频繁', '风控', '验证', 'captcha', 'block', 'forbidden', 'too many', 'rate limit']
    if (riskKeywords.some(kw => lower.includes(kw))) {
      await coolDown(accountId, productId)
      warn('risk_detected_in_body', { accountId, productId, statusCode: status, errorMessage: '响应体检测到风控关键词' })
      return 'cooldown'
    }
  } catch {
    // Can't read body — proceed
  }

  return 'ok'
}
