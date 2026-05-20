/**
 * Parse a HAR (HTTP Archive) file.
 * Supports exports from Stream, Charles, Proxyman, Fiddler, mitmproxy, Chrome DevTools.
 * Extracts cookies and product URLs from Weidian requests.
 */
export function parseHAR(harJson) {
  let har
  try {
    har = typeof harJson === 'string' ? JSON.parse(harJson) : harJson
  } catch {
    throw new Error('HAR 文件格式错误，无法解析 JSON。请确认粘贴的是完整内容。')
  }

  // Support different HAR structures
  let entries = []
  if (har.log?.entries) {
    entries = har.log.entries
  } else if (har.log?.entries?.[0]?.request) {
    entries = har.log.entries
  } else if (Array.isArray(har.entries)) {
    entries = har.entries
  } else if (Array.isArray(har)) {
    entries = har
  } else {
    // Try to find entries anywhere in the object
    for (const key of Object.keys(har)) {
      const val = har[key]
      if (val?.log?.entries) { entries = val.log.entries; break }
      if (Array.isArray(val?.entries)) { entries = val.entries; break }
      if (Array.isArray(val) && val.length > 0 && val[0]?.request) { entries = val; break }
    }
  }

  if (!entries || entries.length === 0) {
    throw new Error(
      '未能从文件中提取到任何请求记录。\n' +
      '请确认导出时选择了 HAR 格式（不是 PDF/CSV）。\n' +
      'Stream: 抓包历史 → 右上角「...」→ 导出 → 选择 HAR → 拷贝'
    )
  }

  // Collect diagnostics
  const allDomains = new Set()
  const weidianEntries = []

  for (const entry of entries) {
    const url = getUrl(entry)
    if (!url) continue

    try {
      const host = new URL(url).hostname
      allDomains.add(host)

      if (isWeidianRelated(host)) {
        weidianEntries.push({ url, host, entry })
      }
    } catch {}
  }

  const diag = {
    totalEntries: entries.length,
    uniqueDomains: [...allDomains].sort(),
    weidianEntries: weidianEntries.length,
    weidianDomains: [...new Set(weidianEntries.map(e => e.host))].sort()
  }

  // If no Weidian requests at all
  if (weidianEntries.length === 0) {
    const domainList = diag.uniqueDomains.slice(0, 15).join('\n  ')
    throw new Error(
      `在 ${diag.totalEntries} 条请求中没有找到微店相关的域名。\n\n` +
      `找到的域名（前15个）：\n  ${domainList || '(无)'}\n\n` +
      '请确认：\n' +
      '1. 抓包时确实打开过微店APP或小程序\n' +
      '2. Stream 开启了 HTTPS 解密（设置 → SSL 证书 → 安装并信任）\n' +
      '3. 导出时选择了「HAR」格式'
    )
  }

  // Extract cookies from Weidian requests
  const cookieMap = new Map()
  for (const { entry } of weidianEntries) {
    extractCookiesFromEntry(entry, cookieMap)
  }

  if (cookieMap.size === 0) {
    throw new Error(
      `找到了 ${diag.weidianEntries.length} 条微店请求，但未提取到 Cookie。\n` +
      `微店域名: ${diag.weidianDomains.join(', ')}\n\n` +
      '可能原因：\n' +
      '1. 微店APP使用了证书绑定（SSL Pinning），Stream 无法解密\n' +
      '2. 请求头中没有 Cookie 字段\n\n' +
      '请尝试用「手动粘贴 Cookie」方式，或换用电脑端抓包工具（mitmproxy/Fiddler）'
    )
  }

  // Extract products
  const products = extractProducts(weidianEntries.map(e => e.entry))

  // Try to find account name
  const accountName = extractAccountName(weidianEntries.map(e => e.entry))

  return {
    cookies: formatCookieString(cookieMap),
    products,
    accountName,
    totalRequests: entries.length,
    diagnostics: diag
  }
}

function getUrl(entry) {
  return entry?.request?.url || entry?.request?.URL || ''
}

function extractCookiesFromEntry(entry, cookieMap) {
  const headers = entry.request?.headers || entry.request?.header || []

  // Try "Cookie" header (case-insensitive)
  for (const h of headers) {
    const name = (h.name || h.key || '').toLowerCase()
    if (name === 'cookie' || name === 'Cookie') {
      const pairs = (h.value || '').split(';')
      for (const pair of pairs) {
        const eqIdx = pair.indexOf('=')
        if (eqIdx > 0) {
          const key = pair.substring(0, eqIdx).trim()
          const value = pair.substring(eqIdx + 1).trim()
          if (key && value && !isTrackingCookie(key)) {
            cookieMap.set(key, value)
          }
        }
      }
    }
  }

  // Also check parsed cookies array in request
  const cookies = entry.request?.cookies || []
  for (const c of cookies) {
    if (c.name && c.value && !isTrackingCookie(c.name)) {
      cookieMap.set(c.name, c.value)
    }
  }

  // Check Set-Cookie in response headers
  const respHeaders = entry.response?.headers || entry.response?.header || []
  for (const h of respHeaders) {
    const name = (h.name || h.key || '').toLowerCase()
    if (name === 'set-cookie') {
      const match = (h.value || '').match(/^([^=]+)=([^;]+)/)
      if (match && !isTrackingCookie(match[1])) {
        cookieMap.set(match[1].trim(), match[2].trim())
      }
    }
  }

  // Also check response cookies array
  const respCookies = entry.response?.cookies || []
  for (const c of respCookies) {
    if (c.name && c.value && !isTrackingCookie(c.name)) {
      cookieMap.set(c.name, c.value)
    }
  }
}

function extractProducts(entries) {
  const products = []
  const seen = new Set()

  for (const entry of entries) {
    const url = getUrl(entry)
    if (!url) continue

    // Product detail page patterns
    const patterns = [
      /weidian\.com\/item\.html\?itemID=(\d+)/i,
      /h5\.weidian\.com\/item\/(\d+)/i,
      /weidian\.com\/detail\/(\d+)/i,
      /\/item\/(\d+)/i,
      /itemID[=:](\d+)/i,
    ]

    let itemId = null
    for (const pat of patterns) {
      const m = url.match(pat)
      if (m) { itemId = m[1]; break }
    }

    if (itemId && !seen.has(itemId)) {
      seen.add(itemId)
      products.push({
        url: getUrl(entry),
        sku: itemId,
        name: extractProductName(entry) || `商品 ${itemId.slice(-6)}`,
        source: 'HAR导入'
      })
      continue
    }

    // Parse API responses for product data
    if (url.includes('/api/') || url.includes('item') || url.includes('product') || url.includes('goods')) {
      try {
        const body = entry.response?.content?.text
        if (!body) continue
        const json = JSON.parse(body)
        const data = json.data || json.result || json
        const id = data.itemId || data.itemID || data.productId || data.id
        if (id && !seen.has(String(id))) {
          seen.add(String(id))
          products.push({
            url: url,
            sku: String(id),
            name: data.title || data.name || data.itemName || `商品 ${String(id).slice(-6)}`,
            targetPrice: data.price || data.salePrice || null,
            source: 'HAR导入'
          })
        }
      } catch {}
    }
  }

  return products
}

function extractAccountName(entries) {
  for (const entry of entries) {
    try {
      const body = entry.response?.content?.text
      if (!body) continue
      const json = JSON.parse(body)
      const nickname = json.data?.userInfo?.nickname
        || json.data?.nickname
        || json.result?.nickname
        || json.data?.user?.nickname
        || json.data?.nickName
      if (nickname) return nickname
    } catch {}
  }
  return null
}

function extractProductName(entry) {
  try {
    const body = entry.response?.content?.text
    if (!body) return null
    const json = JSON.parse(body)
    return json.data?.title || json.data?.itemName || json.data?.name
      || json.result?.title || json.result?.name || null
  } catch {
    const body = entry.response?.content?.text || ''
    const m = body.match(/<title[^>]*>([^<]+)<\/title>/i)
    return m ? m[1].trim() : null
  }
}

function isWeidianRelated(hostname) {
  const domains = [
    'weidian.com', 'koudai.com', 'vdian.net',
    'weixinshop.com', 'wdt.com',
  ]
  return domains.some(d => hostname.includes(d))
}

function isTrackingCookie(name) {
  const tracking = ['_ga', '_gid', '_gat', 'hm_', 'sensorsdata', 'utm_', '_pk_', '_hj', 'cnzz', 'tongji']
  return tracking.some(t => name.toLowerCase().startsWith(t))
}

function formatCookieString(cookieMap) {
  const parts = []
  const priority = [
    'sessionid', 'token', '_token', 'uid', 'userid', 'user_id',
    'login_token', 'auth_token', 'access_token', 'JSESSIONID',
    'PHPSESSID', 'sid', 'wdt_token', 'vd_token'
  ]
  for (const key of priority) {
    if (cookieMap.has(key)) {
      parts.push(`${key}=${cookieMap.get(key)}`)
      cookieMap.delete(key)
    }
  }
  for (const [key, value] of cookieMap) {
    parts.push(`${key}=${value}`)
  }
  return parts.join('; ')
}

// Recursively find fields that should be replaced per product
function detectReplaceableFields(obj, prefix, results) {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      detectReplaceableFields(obj[i], prefix + '[' + i + ']', results)
    }
    return
  }
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? prefix + '.' + key : key
    const lk = key.toLowerCase()
    if (/itemid|vitemid|productid|item_id/.test(lk) && typeof value === 'string') {
      results.push({ path: fullKey, placeholder: '{{itemId}}' })
    } else if (/skuid|item_sku_id|sku_id/.test(lk) && typeof value === 'number') {
      results.push({ path: fullKey, placeholder: '{{skuId}}' })
    } else if (/shopid|vshopid|shop_id/.test(lk) && typeof value === 'string') {
      results.push({ path: fullKey, placeholder: '{{shopId}}' })
    } else if (typeof value === 'object' && value !== null) {
      detectReplaceableFields(value, fullKey, results)
    }
  }
}

// Deep clone an object, replacing values for matched field names with placeholders
function deepCloneWithPlaceholders(obj, replacements) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    return obj.map(v => deepCloneWithPlaceholders(v, replacements))
  }
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    const lk = key.toLowerCase()
    let matched = false
    // Check if this key matches a replacement pattern
    if (/itemid|vitemid|productid|item_id/.test(lk) && typeof value === 'string') {
      result[key] = '{{itemId}}'
      matched = true
    } else if (/skuid|item_sku_id|sku_id/.test(lk) && typeof value === 'number') {
      result[key] = '{{skuId}}'
      matched = true
    } else if (/shopid|vshopid|shop_id/.test(lk) && typeof value === 'string') {
      result[key] = '{{shopId}}'
      matched = true
    }
    if (!matched) {
      result[key] = deepCloneWithPlaceholders(value, replacements)
    }
  }
  return result
}

/**
 * Extract a purchase template from raw HAR data.
 * Auto-identifies: 商品详情 → 创建订单 → 确认订单 → 支付
 * Returns template steps with {{itemId}} {{skuId}} {{shopId}} placeholders.
 */
export function extractPurchaseTemplate(harInput) {
  let har
  try {
    const clean = typeof harInput === 'string' ? harInput.replace(/^﻿/, '') : harInput
    har = typeof clean === 'string' ? JSON.parse(clean) : clean
  } catch {
    return { error: 'HAR JSON 解析失败' }
  }

  // Extract entries (same logic as parseHAR)
  let entries = []
  if (har.log?.entries) {
    entries = har.log.entries
  } else if (Array.isArray(har.entries)) {
    entries = har.entries
  } else if (Array.isArray(har)) {
    entries = har
  } else {
    for (const key of Object.keys(har)) {
      const val = har[key]
      if (val?.log?.entries) { entries = val.log.entries; break }
      if (Array.isArray(val?.entries)) { entries = val.entries; break }
      if (Array.isArray(val) && val.length > 0 && val[0]?.request) { entries = val; break }
    }
  }

  if (!entries.length) {
    return { error: '没有找到任何请求记录' }
  }

  // Filter to thor.weidian.com POST requests (skip CONNECT tunnel entries)
  const weidianPosts = entries.filter(e => {
    const url = e?.request?.url || e?.request?.URL || ''
    const method = e?.request?.method?.toUpperCase() || ''
    return url.includes('thor.weidian.com') && method === 'POST'
  })

  if (!weidianPosts.length) {
    return { error: '没有找到 thor.weidian.com 的 POST 请求。\n请确认在微店小程序里走了完整的下单流程。' }
  }

  // URL pattern → step name mapping (Weidian actual API paths)
  const STEP_PATTERNS = [
    { pattern: /detail\/getAppletItemInfo/i, name: '商品详情', step: 0 },
    { pattern: /detail\/getItemSkuInfo/i, name: 'SKU信息', step: 0 },
    { pattern: /vbuy\/CreateOrder/i, name: '创建订单', step: 1 },
    { pattern: /vbuy\/ConfirmOrder/i, name: '确认订单', step: 2 },
    { pattern: /cashier\/pay\.pre/i, name: '支付预检', step: 3 },
    { pattern: /cashier\/pay\.query\.init/i, name: '支付查询', step: 3 },
    { pattern: /cashier\/pay\.query\.result/i, name: '支付结果', step: 4 },
  ]

  const steps = []
  const seen = new Set()

  for (const entry of weidianPosts) {
    const url = entry?.request?.url || entry?.request?.URL || ''

    // Deduplicate same URL pattern
    const dedupeKey = url.replace(/\d+/g, '')
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    // Extract POST body — Fiddler uses postData.params[], standard HAR uses postData.text
    let paramJson = null
    let paramStr = ''
    const params = entry.request?.postData?.params
    const bodyText = entry.request?.postData?.text

    if (params && Array.isArray(params)) {
      // Fiddler HAR format: params is [{name: "param", value: "..."}, {name: "context", value: "..."}]
      for (const p of params) {
        if (p.name === 'param') {
          paramStr = p.value
          try { paramJson = JSON.parse(p.value) } catch { paramJson = null }
          break
        }
      }
    } else if (bodyText) {
      // Standard HAR format: text is "param=...&context=..."
      const paramMatch = bodyText.match(/param=([^&]+)/)
      if (paramMatch) {
        paramStr = decodeURIComponent(paramMatch[1])
        try { paramJson = JSON.parse(paramStr) } catch { paramJson = null }
      } else {
        try {
          paramJson = JSON.parse(decodeURIComponent(bodyText))
          paramStr = decodeURIComponent(bodyText)
        } catch {
          paramStr = bodyText
        }
      }
    } else if (entry.request?.body?.text) {
      // Alternate body location
      const bt = entry.request.body.text
      const pm = bt.match(/param=([^&]+)/)
      if (pm) {
        paramStr = decodeURIComponent(pm[1])
        try { paramJson = JSON.parse(paramStr) } catch { paramJson = null }
      }
    }

    if (!paramStr) continue

    // Match step type
    let matched = null
    for (const sp of STEP_PATTERNS) {
      if (sp.pattern.test(url)) {
        matched = sp
        break
      }
    }
    if (!matched) continue

    // Auto-detect replaceable fields (recursive into nested objects/arrays)
    const replacements = []
    detectReplaceableFields(paramJson, '', replacements)

    // Build replay body: deep clone with {{placeholders}}
    let replayBody = paramJson ? deepCloneWithPlaceholders(paramJson, replacements) : null

    steps.push({
      step: matched.step,
      name: matched.name,
      url,
      body: replayBody,
      rawParam: paramStr,
      paramJson,
      replacements
    })
  }

  if (!steps.length) {
    const foundUrls = weidianPosts.map(e => {
      const u = e?.request?.url || ''
      const path = u.replace(/^https?:\/\/thor\.weidian\.com/, '')
      return '  ' + path
    }).filter((v, i, a) => a.indexOf(v) === i).slice(0, 10).join('\n')
    return { error: `在 thor.weidian.com 中找到了 ${weidianPosts.length} 条 POST 请求，但无法匹配下单步骤。\n\n找到的API路径：\n${foundUrls}\n\n请确认在微店小程序里走了完整下单流程（浏览商品→立即购买→创建订单→确认支付）。` }
  }

  // Sort by step order, deduplicate same step type (keep last)
  steps.sort((a, b) => a.step - b.step)

  const final = []
  const usedSteps = new Set()
  for (const s of steps) {
    if (usedSteps.has(s.step)) {
      const idx = final.findIndex(f => f.step === s.step)
      if (idx >= 0) final[idx] = s
    } else {
      usedSteps.add(s.step)
      final.push(s)
    }
  }

  return {
    steps: final,
    totalFound: weidianPosts.length,
    templateName: `下单模板 ${new Date().toLocaleDateString('zh-CN')}`
  }
}

export function getHARSummary(result) {
  const lines = []
  if (result.cookies) {
    const count = result.cookies.split(';').filter(s => s.trim()).length
    lines.push(`${count} 个 Cookie 字段`)
  }
  if (result.products.length > 0) {
    lines.push(`${result.products.length} 个商品链接`)
    for (const p of result.products.slice(0, 5)) {
      lines.push(`  · ${p.name}`)
    }
    if (result.products.length > 5) {
      lines.push(`  ... 还有 ${result.products.length - 5} 个`)
    }
  }
  if (result.accountName) {
    lines.push(`账号名: ${result.accountName}`)
  }
  if (result.diagnostics) {
    lines.push(`共分析 ${result.totalRequests} 条请求，微店相关 ${result.diagnostics.weidianEntries} 条`)
  }
  return lines
}
