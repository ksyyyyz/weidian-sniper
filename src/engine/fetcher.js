import { buildHeaders, getRequestDelay, detectRisk, isInCooldown, isBanned } from './anti-ban'
import { sleep } from '../utils/delay'
import { info, error, success } from '../utils/logger'
import { getAccount } from '../db'

/**
 * Core fetch wrapper with anti-ban injection.
 *
 * Features:
 * - Automatic UA / header rotation
 * - Normal-distribution random delay
 * - Structured logging (before + after)
 * - Risk detection (429, 403, keywords)
 * - Cookie injection per account
 * - Cooldown / ban gating
 */
export async function apiFetch(url, options = {}) {
  const {
    method = 'GET',
    body = null,
    accountId = null,
    productId = null,
    extraHeaders = {},
    skipDelay = false,
    skipLog = false,
    timeout = 15000,
    referer = null
  } = options

  // Gate: banned account
  if (accountId && isBanned(accountId)) {
    throw new FetchError('账号已被风控限制，请检查账号状态', 'BANNED', 403)
  }

  // Gate: cooldown
  if (accountId && productId && isInCooldown(accountId, productId)) {
    throw new FetchError('商品处于冷却期，暂不请求', 'COOLDOWN', 429)
  }

  // Delay (skip for time-critical snipe requests)
  if (!skipDelay) {
    const delay = await getRequestDelay()
    await sleep(delay)
  }

  // Build headers
  const headers = await buildHeaders(extraHeaders)

  // Inject account cookie
  if (accountId) {
    const acct = await getAccount(accountId)
    if (acct?.cookie) {
      headers['Cookie'] = acct.cookie
    }
  }

  if (referer) {
    headers['Referer'] = referer
  }

  if (body && typeof body === 'object' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const reqBody = body && typeof body === 'object' ? JSON.stringify(body) : body

  // Log request
  const startTime = performance.now()
  if (!skipLog) {
    await info('request', {
      url,
      accountId,
      productId,
      requestHeaders: headers
    })
  }

  // Timeout race
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  let response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: reqBody,
      signal: controller.signal,
      credentials: 'include'
    })
  } catch (err) {
    clearTimeout(timeoutId)
    const duration = Math.round(performance.now() - startTime)

    if (err.name === 'AbortError') {
      await error('timeout', { url, accountId, productId, duration, errorMessage: `请求超时 (${timeout}ms)` })
      throw new FetchError(`请求超时 (${timeout}ms)`, 'TIMEOUT', 0)
    }

    await error('network_error', { url, accountId, productId, duration, errorMessage: err.message })
    throw new FetchError(err.message, 'NETWORK', 0)
  }

  clearTimeout(timeoutId)
  const duration = Math.round(performance.now() - startTime)

  // Read body for logging (clone so caller can still read)
  let responseBody = null
  try {
    const clone = response.clone()
    responseBody = await clone.text()
  } catch {
    // body not readable — ok
  }

  // Log response
  if (!skipLog) {
    const respHeaders = {}
    response.headers.forEach((v, k) => { respHeaders[k] = v })

    if (response.ok) {
      await success('response', {
        url, accountId, productId, statusCode: response.status,
        duration, responseHeaders: respHeaders,
        responseBody: responseBody?.substring(0, 2000)
      })
    } else {
      await error('response', {
        url, accountId, productId, statusCode: response.status,
        duration, responseHeaders: respHeaders,
        responseBody: responseBody?.substring(0, 2000),
        errorMessage: `HTTP ${response.status}`
      })
    }
  }

  // Risk detection
  const risk = await detectRisk(response, accountId, productId)
  if (risk === 'banned') {
    throw new FetchError('账号触发风控被限制', 'BANNED', response.status)
  }
  if (risk === 'cooldown') {
    throw new FetchError('触发频率限制，进入冷却', 'COOLDOWN', response.status)
  }

  return { response, body: responseBody, duration, status: response.status }
}

export class FetchError extends Error {
  constructor(message, code, status) {
    super(message)
    this.name = 'FetchError'
    this.code = code
    this.status = status
  }
}

/**
 * Quick GET helper with auto JSON parse.
 */
export async function apiGet(url, options = {}) {
  const { response, body: raw } = await apiFetch(url, { ...options, method: 'GET' })
  let data = null
  try { data = JSON.parse(raw) } catch { data = raw }
  return { status: response.status, data, headers: response.headers }
}

/**
 * Quick POST helper with auto JSON parse.
 */
export async function apiPost(url, body, options = {}) {
  const { response, body: raw } = await apiFetch(url, { ...options, method: 'POST', body })
  let data = null
  try { data = JSON.parse(raw) } catch { data = raw }
  return { status: response.status, data, headers: response.headers }
}
