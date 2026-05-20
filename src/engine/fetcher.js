import { buildHeaders, getRequestDelay, detectRisk, isInCooldown, isBanned } from './anti-ban'
import { sleep } from '../utils/delay'
import { info, error, success } from '../utils/logger'
import { getAccount, buildContext } from '../db'

/**
 * Core fetch wrapper with anti-ban injection.
 *
 * Two auth modes:
 * - Token mode (Weidian API): POST body wrapped as param={json}&context={auth}
 *   Detected automatically when account has context/token data.
 * - Regular mode: standard fetch with optional Cookie header.
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

  // Rewrite Weidian API URLs through proxy to bypass CORS
  // Vite dev server proxy or Vercel rewrites handle forwarding
  url = url.replace(/^https?:\/\/thor\.weidian\.com/, '/api/thor')
    .replace(/^https?:\/\/logtake\.weidian\.com/, '/api/logtake')

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

  // Load account and determine auth mode
  let account = null
  let useTokenAuth = false
  if (accountId) {
    account = await getAccount(accountId)
    useTokenAuth = !!(account && (account.contextRaw || account.contextEncoded || account.token))
  }

  // Build headers
  const headers = await buildHeaders(extraHeaders, { isWeidianAPI: useTokenAuth })

  // Build body based on auth mode
  let reqBody = null
  if (useTokenAuth && method === 'POST' && body) {
    const contextStr = buildContext(account)
    let paramStr
    if (typeof body === 'object') {
      paramStr = encodeURIComponent(JSON.stringify(body))
    } else if (typeof body === 'string') {
      // If already URL-encoded, use as-is; otherwise encode
      paramStr = body.includes('%') ? body : encodeURIComponent(body)
    } else {
      paramStr = String(body)
    }
    reqBody = `param=${paramStr}&context=${contextStr}`
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  } else if (useTokenAuth && method === 'GET' && body) {
    // GET with token auth: append context as query param
    const contextStr = buildContext(account)
    const sep = url.includes('?') ? '&' : '?'
    url = `${url}${sep}context=${contextStr}`
    reqBody = null
  } else if (body && typeof body === 'object') {
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }
    reqBody = JSON.stringify(body)
  } else {
    reqBody = body || null
  }

  if (referer) {
    headers['Referer'] = referer
  }

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
      signal: controller.signal
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
 * When account has token auth, body is auto-wrapped as param+context.
 */
export async function apiPost(url, body, options = {}) {
  const { response, body: raw } = await apiFetch(url, { ...options, method: 'POST', body })
  let data = null
  try { data = JSON.parse(raw) } catch { data = raw }
  return { status: response.status, data, headers: response.headers }
}
