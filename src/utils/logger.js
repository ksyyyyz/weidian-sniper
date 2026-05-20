import { addLog } from '../db'

const LEVELS = ['info', 'warn', 'error', 'success']

export function createLog(level, type, data = {}) {
  if (!LEVELS.includes(level)) level = 'info'
  return {
    level,
    type,
    timestamp: Date.now(),
    accountId: data.accountId ?? null,
    productId: data.productId ?? null,
    statusCode: data.statusCode ?? null,
    duration: data.duration ?? null,
    url: data.url?.substring(0, 500) ?? null,
    requestHeaders: data.requestHeaders ? JSON.stringify(data.requestHeaders).substring(0, 2000) : null,
    responseHeaders: data.responseHeaders ? JSON.stringify(data.responseHeaders).substring(0, 2000) : null,
    responseBody: data.responseBody ? JSON.stringify(data.responseBody).substring(0, 5000) : null,
    errorMessage: data.errorMessage ?? null
  }
}

export async function log(level, type, data = {}) {
  const entry = createLog(level, type, data)
  try {
    await addLog(entry)
  } catch {
    // IndexedDB unavailable — silently drop (PWA in private mode etc.)
  }
  return entry
}

// Convenience methods
export const info = (type, data) => log('info', type, data)
export const warn = (type, data) => log('warn', type, data)
export const error = (type, data) => log('error', type, data)
export const success = (type, data) => log('success', type, data)
