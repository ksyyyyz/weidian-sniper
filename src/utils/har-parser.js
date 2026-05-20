/**
 * Parse a HAR (HTTP Archive) file exported from Stream/Charles/Proxyman.
 * Extracts cookies and product URLs from Weidian requests.
 */
export function parseHAR(harJson) {
  let har
  try {
    har = typeof harJson === 'string' ? JSON.parse(harJson) : harJson
  } catch {
    throw new Error('HAR 文件格式错误，无法解析 JSON')
  }

  if (!har.log || !har.log.entries || !Array.isArray(har.log.entries)) {
    throw new Error('无效的 HAR 文件：缺少 log.entries')
  }

  const entries = har.log.entries

  // 1. Extract cookies from weidian requests
  const cookies = extractCookies(entries)

  // 2. Extract product URLs
  const products = extractProducts(entries)

  // 3. Try to find account name from response
  const accountName = extractAccountName(entries)

  return { cookies, products, accountName, totalRequests: entries.length }
}

function extractCookies(entries) {
  const cookieMap = new Map()

  for (const entry of entries) {
    const url = entry.request?.url || ''
    if (!isWeidianUrl(url)) continue

    // Parse cookies from request headers
    const cookieHeader = findHeader(entry.request?.headers, 'cookie')
    if (cookieHeader) {
      const pairs = cookieHeader.split(';')
      for (const pair of pairs) {
        const [key, ...valParts] = pair.trim().split('=')
        if (key && valParts.length > 0) {
          const name = key.trim()
          const value = valParts.join('=').trim()
          // Skip analytics/tracking cookies
          if (!isTrackingCookie(name)) {
            cookieMap.set(name, value)
          }
        }
      }
    }

    // Also check parsed cookies array
    if (entry.request?.cookies) {
      for (const c of entry.request.cookies) {
        if (c.name && c.value && !isTrackingCookie(c.name)) {
          cookieMap.set(c.name, c.value)
        }
      }
    }

    // Check Set-Cookie in response
    const setCookie = findHeader(entry.response?.headers, 'set-cookie')
    if (setCookie) {
      const match = setCookie.match(/^([^=]+)=([^;]+)/)
      if (match && !isTrackingCookie(match[1])) {
        cookieMap.set(match[1].trim(), match[2].trim())
      }
    }
  }

  return formatCookieString(cookieMap)
}

function extractProducts(entries) {
  const products = []
  const seen = new Set()

  for (const entry of entries) {
    const url = entry.request?.url || ''
    if (!isWeidianUrl(url)) continue

    // Look for product detail pages
    const itemMatch = url.match(/weidian\.com\/item\.html\?itemID=(\d+)/i)
      || url.match(/h5\.weidian\.com\/item\/(\d+)/i)
      || url.match(/weidian\.com\/detail\/(\d+)/i)

    if (itemMatch) {
      const itemId = itemMatch[1]
      if (seen.has(itemId)) continue
      seen.add(itemId)

      const product = {
        url: entry.request.url,
        sku: itemId,
        name: extractProductName(entry) || `商品 ${itemId.slice(-6)}`,
        source: 'HAR导入'
      }
      products.push(product)
      continue
    }

    // Also check API calls that contain product info
    if (url.includes('/api/item') || url.includes('/api/product') || url.includes('/api/goods')) {
      try {
        const respBody = entry.response?.content?.text
        if (respBody) {
          const json = JSON.parse(respBody)
          const itemData = json.data || json.result || json
          if (itemData.itemId || itemData.itemID || itemData.productId) {
            const id = itemData.itemId || itemData.itemID || itemData.productId
            if (seen.has(String(id))) continue
            seen.add(String(id))
            products.push({
              url: url,
              sku: String(id),
              name: itemData.title || itemData.name || itemData.itemName || `商品 ${String(id).slice(-6)}`,
              targetPrice: itemData.price || itemData.salePrice || null,
              source: 'HAR导入'
            })
          }
        }
      } catch {
        // Can't parse response — skip
      }
    }
  }

  return products
}

function extractAccountName(entries) {
  for (const entry of entries) {
    if (!isWeidianUrl(entry.request?.url)) continue
    try {
      const body = entry.response?.content?.text
      if (body) {
        const json = JSON.parse(body)
        const nickname = json.data?.userInfo?.nickname
          || json.data?.nickname
          || json.result?.nickname
          || json.data?.user?.nickname
        if (nickname) return nickname
      }
    } catch {
      // skip
    }
  }
  return null
}

function extractProductName(entry) {
  // Try response body first
  try {
    const body = entry.response?.content?.text
    if (body) {
      // Try JSON
      const json = JSON.parse(body)
      const name = json.data?.title || json.data?.itemName || json.data?.name
        || json.result?.title || json.result?.name
      if (name) return name
    }
  } catch {
    // Not JSON — try HTML title
    const body = entry.response?.content?.text || ''
    const titleMatch = body.match(/<title>([^<]+)<\/title>/i)
    if (titleMatch) return titleMatch[1].trim()
  }
  return null
}

function findHeader(headers, name) {
  if (!headers) return null
  const lower = name.toLowerCase()
  for (const h of headers) {
    if (h.name?.toLowerCase() === lower) return h.value
  }
  return null
}

function isWeidianUrl(url) {
  try {
    const host = new URL(url).hostname
    return host.includes('weidian.com')
  } catch {
    return false
  }
}

function isTrackingCookie(name) {
  const tracking = ['_ga', '_gid', '_gat', 'Hm_', 'sensorsdata', 'utm_', '_pk_', '_hj']
  return tracking.some(t => name.toLowerCase().startsWith(t.toLowerCase()))
}

function formatCookieString(cookieMap) {
  const parts = []
  // Put known important cookies first
  const priority = ['sessionid', 'token', '_token', 'uid', 'userid', 'user_id', 'login_token', 'auth_token']
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

/**
 * Quick summary of what was found in the HAR.
 */
export function getHARSummary(result) {
  const lines = []
  if (result.cookies) {
    const count = result.cookies.split(';').length
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
  lines.push(`共分析 ${result.totalRequests} 条请求`)
  return lines
}
