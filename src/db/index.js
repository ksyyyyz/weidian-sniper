import Dexie from 'dexie'

const db = new Dexie('weidian-sniper')

db.version(1).stores({
  accounts: '++id, name, enabled, createdAt',
  products: '++id, name, enabled, accountId, createdAt',
  logs: '++id, timestamp, level, type, accountId, productId, statusCode',
  settings: '&key',
  configSnapshots: '++id, name, timestamp'
})

// Accounts
export async function getAccounts() {
  return db.accounts.orderBy('createdAt').reverse().toArray()
}

export async function getEnabledAccounts() {
  return db.accounts.where('enabled').equals(1).toArray()
}

export async function getAccount(id) {
  return db.accounts.get(Number(id))
}

export async function addAccount(data) {
  return db.accounts.add({
    ...data,
    enabled: data.enabled ?? 1,
    createdAt: Date.now(),
    updatedAt: Date.now()
  })
}

export async function updateAccount(id, data) {
  return db.accounts.update(Number(id), { ...data, updatedAt: Date.now() })
}

export async function deleteAccount(id) {
  await db.accounts.delete(Number(id))
  await db.products.where('accountId').equals(Number(id)).delete()
}

/**
 * Parse a raw context string from Fiddler.
 * Accepts URL-encoded or plain JSON.
 */
export function parseAccountContext(raw) {
  if (!raw || !raw.trim()) return null
  let str = raw.trim()
  // If it's the full POST body (param=...&context=...), extract context part
  if (str.includes('&context=')) {
    const m = str.match(/[&?]context=([^&]+)/)
    if (m) str = m[1]
  } else if (str.startsWith('param=')) {
    // Full body, extract context
    const m = str.match(/context=([^&]+)/)
    if (m) str = m[1]
  }
  // URL-decode if needed
  if (str.includes('%')) {
    try { str = decodeURIComponent(str) } catch {}
  }
  // Parse JSON
  try {
    const ctx = JSON.parse(str)
    return {
      contextRaw: str,
      contextEncoded: encodeURIComponent(str),
      token: ctx.token || '',
      refreshToken: ctx.refreshToken || '',
      duid: ctx.duid || ctx.uid || ctx.userID || '',
      visitorId: ctx.visitor_id || ctx.anonymousId || '',
      sid: ctx.sid || '',
      wduserID: ctx.wduserID || '',
      appid: ctx.appid || 'wxbuyer',
      wxappid: ctx.wxappid || '',
      platform: ctx.platform || 'windows',
      userType: ctx.userType ?? 0
    }
  } catch {
    return null
  }
}

/**
 * Build the context JSON string from stored account data.
 */
export function buildContext(account) {
  if (account.contextEncoded) {
    return account.contextEncoded
  }
  if (account.contextRaw) {
    return encodeURIComponent(account.contextRaw)
  }
  // Fallback: build from individual fields
  const ctx = {
    appid: account.appid || 'wxbuyer',
    platform: 'windows',
    anonymousId: account.visitorId || '',
    visitor_id: account.visitorId || '',
    token: account.token || '',
    duid: account.duid || '',
    sid: account.sid || '',
    uid: account.duid || '',
    refreshToken: account.refreshToken || '',
    userType: account.userType ?? 0,
    userID: account.duid || '',
    wduserID: account.wduserID || '',
    wxappid: account.wxappid || ''
  }
  return encodeURIComponent(JSON.stringify(ctx))
}

// Products
export async function getProducts(accountId) {
  let q = db.products.orderBy('createdAt').reverse()
  if (accountId) q = q.filter(p => p.accountId === Number(accountId))
  return q.toArray()
}

export async function getEnabledProducts(accountId) {
  let q = db.products.where('enabled').equals(1)
  if (accountId) q = q.filter(p => p.accountId === Number(accountId))
  return q.toArray()
}

export async function getProduct(id) {
  return db.products.get(Number(id))
}

export async function addProduct(data) {
  return db.products.add({ ...data, enabled: data.enabled ?? 1, createdAt: Date.now() })
}

export async function updateProduct(id, data) {
  return db.products.update(Number(id), data)
}

export async function deleteProduct(id) {
  return db.products.delete(Number(id))
}

export async function batchUpdateProducts(ids, data) {
  return db.products.where('id').anyOf(ids.map(Number)).modify(data)
}

export async function batchDeleteProducts(ids) {
  return db.products.where('id').anyOf(ids.map(Number)).delete()
}

// Logs
export async function getLogs(filters = {}) {
  let q = db.logs.orderBy('timestamp').reverse()
  if (filters.level) q = q.filter(l => l.level === filters.level)
  if (filters.type) q = q.filter(l => l.type === filters.type)
  if (filters.accountId) q = q.filter(l => l.accountId === Number(filters.accountId))
  if (filters.productId) q = q.filter(l => l.productId === Number(filters.productId))
  return q.limit(filters.limit || 500).toArray()
}

export async function addLog(data) {
  return db.logs.add({ ...data, timestamp: Date.now() })
}

export async function clearLogs() {
  return db.logs.clear()
}

export async function getLogStats() {
  const all = await db.logs.toArray()
  const total = all.length
  const success = all.filter(l => l.level === 'success').length
  const errors = all.filter(l => l.level === 'error').length
  const avgDuration = total > 0
    ? Math.round(all.reduce((s, l) => s + (l.duration || 0), 0) / total)
    : 0
  return { total, success, errors, avgDuration, successRate: total > 0 ? Math.round(success / total * 100) : 0 }
}

export async function exportLogs() {
  const all = await db.logs.orderBy('timestamp').reverse().toArray()
  return JSON.stringify(all, null, 2)
}

// Settings
export async function getSetting(key) {
  const s = await db.settings.get(key)
  return s ? s.value : null
}

export async function setSetting(key, value) {
  return db.settings.put({ key, value })
}

export async function getAllSettings() {
  const all = await db.settings.toArray()
  const obj = {}
  for (const s of all) obj[s.key] = s.value
  return obj
}

// Config snapshots (import/export)
export async function exportConfig(name) {
  const [accounts, products, settings] = await Promise.all([
    db.accounts.toArray(),
    db.products.toArray(),
    db.settings.toArray()
  ])
  const data = { accounts, products, settings, version: 1, exportedAt: Date.now() }
  await db.configSnapshots.add({ name: name || 'backup', timestamp: Date.now(), data: JSON.stringify(data) })
  return JSON.stringify(data, null, 2)
}

export async function importConfig(jsonStr) {
  const data = JSON.parse(jsonStr)
  if (data.version !== 1) throw new Error('不支持的配置版本')
  await db.transaction('rw', db.accounts, db.products, db.settings, async () => {
    await db.accounts.clear()
    await db.products.clear()
    await db.settings.clear()
    if (data.accounts?.length) await db.accounts.bulkAdd(data.accounts)
    if (data.products?.length) await db.products.bulkAdd(data.products)
    if (data.settings?.length) await db.settings.bulkAdd(data.settings)
  })
  return { accounts: data.accounts?.length || 0, products: data.products?.length || 0 }
}

export async function resetAll() {
  await db.transaction('rw', db.accounts, db.products, db.logs, db.settings, db.configSnapshots, () => {
    db.accounts.clear()
    db.products.clear()
    db.logs.clear()
    db.settings.clear()
    db.configSnapshots.clear()
  })
}

export default db
