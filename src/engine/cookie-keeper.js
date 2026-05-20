import { getEnabledAccounts, updateAccount } from '../db'
import { apiGet } from './fetcher'
import { error, warn, info } from '../utils/logger'
import { sendFeishu } from './notifier'

function sendBrowserNotification(title, body) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icons/icon-192.png' })
  }
}

const HEARTBEAT_INTERVAL = 5 * 60 * 1000 // 5 minutes
const heartbeatTimers = new Map()

// Lightweight endpoints to ping for cookie keep-alive
const HEARTBEAT_URLS = [
  'https://weidian.com',
  'https://h5.weidian.com',
]

/**
 * Start heartbeat for all enabled accounts.
 */
export async function startCookieKeeper() {
  const accounts = await getEnabledAccounts()
  for (const acct of accounts) {
    startHeartbeat(acct)
  }
}

/**
 * Start heartbeat for a single account.
 */
export function startHeartbeat(account) {
  if (heartbeatTimers.has(account.id)) return

  const run = async () => {
    try {
      await apiGet(HEARTBEAT_URLS[0], { accountId: account.id, skipLog: true, skipDelay: true, timeout: 8000 })
      // Mark cookie as healthy
      await updateAccount(account.id, { cookieStatus: 'healthy', cookieCheckedAt: Date.now() })
    } catch (err) {
      if (err.code === 'BANNED' || err.status === 401 || err.status === 403) {
        // Cookie expired or banned
        await updateAccount(account.id, { cookieStatus: 'expired', cookieCheckedAt: Date.now() })
        await error('cookie_expired', { accountId: account.id, errorMessage: 'Cookie 已过期，请更新' })
        await sendBrowserNotification('Cookie过期', `账号「${account.name}」的Cookie已过期，请更新`)
        await sendFeishu('cookie_expired', {
          title: 'Cookie 已过期',
          accountName: account.name,
          message: '请重新获取 Cookie 并更新到设置中'
        })
        stopHeartbeat(account.id)
      } else if (err.code === 'COOLDOWN') {
        await warn('cookie_heartbeat_blocked', { accountId: account.id, errorMessage: '心跳请求被限流' })
      }
      // Network errors are expected sometimes — silently retry next cycle
    }
  }

  run() // immediate first ping
  const timer = setInterval(run, HEARTBEAT_INTERVAL)
  heartbeatTimers.set(account.id, timer)
}

/**
 * Stop heartbeat for an account.
 */
export function stopHeartbeat(accountId) {
  const timer = heartbeatTimers.get(Number(accountId))
  if (timer) {
    clearInterval(timer)
    heartbeatTimers.delete(Number(accountId))
  }
}

/**
 * Stop all heartbeats.
 */
export function stopAllHeartbeats() {
  for (const [id, timer] of heartbeatTimers) {
    clearInterval(timer)
  }
  heartbeatTimers.clear()
}

/**
 * Refresh heartbeats after account changes (reload).
 */
export async function refreshHeartbeats() {
  stopAllHeartbeats()
  await startCookieKeeper()
  await info('heartbeat_refreshed', { errorMessage: 'Cookie保鲜已刷新' })
}
