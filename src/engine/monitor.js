import { getEnabledProducts, getSetting, getAccount } from '../db'
import { apiGet, apiPost } from './fetcher'
import { isInCooldown, isBanned, isWarmupWindow, getMonitorInterval, coolDown, resetBackoff } from './anti-ban'
import { executeSnipe } from './sniper'
import { executeTemplateSnipe } from './template-sniper'
import { getCorrectedTime, getMsUntilTarget } from './time-sync'
import { sendFeishu, playAlert } from './notifier'
import { info, error, success } from '../utils/logger'
import { sleep } from '../utils/delay'

let running = false
let stopFlag = false
let warmupActive = false
let monitorTimer = null
let lastStates = {} // productId → { status, stock, timestamp }

const listeners = new Set()

export function onMonitorStateChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notifyListeners(state) {
  for (const fn of listeners) fn(state)
}

export function getMonitorState() {
  return { running, warmupActive }
}

export async function startMonitoring() {
  if (running) return
  running = true
  stopFlag = false
  warmupActive = false
  lastStates = {}
  notifyListeners({ running: true, warmupActive: false })

  await info('monitor_started', { errorMessage: '监控已启动' })

  while (!stopFlag) {
    try {
      const products = await getEnabledProducts()
      const activeProducts = products.filter(p => {
        if (p.accountId && isBanned(p.accountId)) return false
        if (isInCooldown(p.accountId, p.id)) return false
        return true
      })

      if (activeProducts.length === 0) {
        await sleep(1000)
        continue
      }

      // Check warmup window
      const msUntil = await getMsUntilTarget()
      const inWarmup = msUntil !== null && msUntil > 0 && msUntil <= (Number(await getSetting('warmupSeconds') || 3) * 1000)

      if (inWarmup && !warmupActive) {
        warmupActive = true
        notifyListeners({ running: true, warmupActive: true })
        await info('warmup_started', { errorMessage: `预热模式启动，距离开抢 ${(msUntil / 1000).toFixed(1)}s` })
        playAlert('warning')
      }
      if (!inWarmup && warmupActive) {
        warmupActive = false
        notifyListeners({ running: true, warmupActive: false })
        await info('warmup_ended', { errorMessage: '预热模式结束' })
      }

      // Poll all active products in parallel
      const results = await Promise.allSettled(
        activeProducts.map(p => pollProduct(p, inWarmup))
      )

      // Log failures
      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        if (r.status === 'rejected') {
          await error('poll_failed', {
            productId: activeProducts[i].id,
            errorMessage: r.reason?.message || '轮询失败'
          })
        }
      }

      // Interval: fast in warmup, normal otherwise
      const interval = inWarmup ? await getMonitorInterval() : Number(await getSetting('interval') || 200)
      await sleep(interval)
    } catch (err) {
      await error('monitor_loop_error', { errorMessage: err.message })
      await sleep(1000)
    }
  }

  running = false
  warmupActive = false
  notifyListeners({ running: false, warmupActive: false })
  await info('monitor_stopped', { errorMessage: '监控已停止' })
}

async function pollProduct(product, isWarmup) {
  const productUrl = product.url
  if (!productUrl) return

  try {
    const startTime = performance.now()

    // Determine if account uses token auth → use POST to Weidian API
    const account = product.accountId ? await getAccount(product.accountId) : null
    const useTokenAuth = account && (account.contextRaw || account.token)

    let result
    if (useTokenAuth) {
      const detailApi = await getSetting('snipe_detail_api') || 'https://thor.weidian.com/detail/getItemDetail/1.0'
      const params = { itemId: String(product.sku || ''), shopId: '' }
      result = await apiPost(detailApi, params, {
        accountId: product.accountId,
        productId: product.id,
        skipDelay: isWarmup,
        timeout: isWarmup ? 5000 : 10000
      })
    } else {
      result = await apiGet(productUrl, {
        accountId: product.accountId,
        productId: product.id,
        skipDelay: isWarmup,
        timeout: isWarmup ? 5000 : 10000
      })
    }

    const { status, data } = result

    const duration = Math.round(performance.now() - startTime)
    const prevState = lastStates[product.id]
    const newState = extractProductState(data, product)

    // Detect state change
    if (prevState) {
      const changed = detectChange(prevState, newState)
      if (changed) {
        await info('state_changed', {
          productId: product.id,
          accountId: product.accountId,
          responseBody: { from: prevState, to: newState },
          errorMessage: `商品状态变化: ${changed}`
        })

        await sendFeishu('stock_change', {
          productName: product.name,
          accountName: null,
          message: `状态变化: ${changed}`
        })

        // If now buyable, trigger snipe
        if (newState.buyable && !prevState.buyable) {
          await info('trigger_snipe', {
            productId: product.id,
            accountId: product.accountId,
            errorMessage: '检测到商品可购买，触发抢购'
          })
          if (product.templateId) {
            executeTemplateSnipe(product.templateId, product)
          } else {
            executeSnipe(product)
          }
        }
      }
    }

    lastStates[product.id] = newState

    // Success: reset backoff for this account
    if (product.accountId) resetBackoff(product.accountId)

  } catch (err) {
    if (err.code === 'BANNED' || err.code === 'COOLDOWN') {
      await coolDown(err.accountId, product.id)
    }
    throw err
  }
}

/**
 * Extract stock state from API response data.
 * This is a template — actual parsing depends on Weidian's API response format.
 */
function extractProductState(data, product) {
  // Default: try to find common patterns in response
  if (!data) return { buyable: false, stock: 0, status: 'unknown' }

  // Try common JSON structures for ecommerce APIs
  const buyable = (
    data?.data?.stock > 0 ||
    data?.data?.buyable === true ||
    data?.data?.status === 'on_sale' ||
    data?.stock > 0 ||
    data?.status === 'on_sale' ||
    data?.sku?.stock > 0 ||
    data?.data?.skuList?.some?.(s => s.stock > 0)
  )

  const stock = (
    data?.data?.stock ??
    data?.stock ??
    data?.data?.totalStock ??
    data?.sku?.stock ??
    0
  )

  const status = (
    data?.data?.status ??
    data?.status ??
    data?.data?.saleStatus ??
    'unknown'
  )

  return { buyable, stock, status, timestamp: Date.now() }
}

function detectChange(prev, curr) {
  const changes = []
  if (prev.buyable !== curr.buyable) changes.push(`可购买: ${prev.buyable} → ${curr.buyable}`)
  if (prev.status !== curr.status) changes.push(`状态: ${prev.status} → ${curr.status}`)
  if (prev.stock !== curr.stock) changes.push(`库存: ${prev.stock} → ${curr.stock}`)
  return changes.length > 0 ? changes.join(', ') : null
}

export async function stopMonitoring() {
  stopFlag = true
  if (monitorTimer) {
    clearTimeout(monitorTimer)
    monitorTimer = null
  }
  // Stop loop will finish naturally
}

export function isMonitoring() {
  return running
}
