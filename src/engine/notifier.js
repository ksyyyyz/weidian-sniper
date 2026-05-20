import { getSetting } from '../db'
import { error } from '../utils/logger'

// Rate limit: Feishu bot allows max 20 msg/min
const sendHistory = []

function checkRateLimit() {
  const now = Date.now()
  const oneMinAgo = now - 60000
  while (sendHistory.length && sendHistory[0] < oneMinAgo) {
    sendHistory.shift()
  }
  return sendHistory.length < 20
}

const CARD_COLORS = {
  success: 'green',
  stock_change: 'yellow',
  warning: 'red',
  cookie_expired: 'red',
  info: 'blue'
}

const CARD_TITLES = {
  success: '抢购成功',
  stock_change: '库存变化',
  warning: '风控警告',
  cookie_expired: 'Cookie 已过期',
  info: '状态通知'
}

/**
 * Send a Feishu card message.
 * @param {'success'|'stock_change'|'warning'|'cookie_expired'|'info'} type
 * @param {object} data — { title, accountName, productName, price, duration, message }
 */
export async function sendFeishu(type, data = {}) {
  const webhookUrl = await getSetting('feishuWebhookUrl')
  if (!webhookUrl) return

  if (!checkRateLimit()) {
    await error('feishu_rate_limited', { errorMessage: '飞书通知频率达到上限（20条/分钟），已丢弃' })
    return
  }

  const color = CARD_COLORS[type] || 'blue'
  const title = data.title || CARD_TITLES[type] || '通知'

  const card = {
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: title },
        template: color
      },
      elements: [
        {
          tag: 'div',
          fields: buildFields(data)
        },
        {
          tag: 'hr'
        },
        {
          tag: 'note',
          elements: [
            { tag: 'plain_text', content: `微店抢购助手 · ${new Date().toLocaleTimeString('zh-CN')}` }
          ]
        }
      ]
    }
  }

  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card)
    })
    sendHistory.push(Date.now())
    if (!resp.ok) {
      await error('feishu_send_failed', { statusCode: resp.status, errorMessage: '飞书消息发送失败' })
    }
  } catch (err) {
    await error('feishu_send_error', { errorMessage: err.message })
  }
}

function buildFields(data) {
  const fields = []
  if (data.accountName) {
    fields.push({ tag: 'plain_text', content: `账号：${data.accountName}` }, { tag: 'plain_text', content: '' })
  }
  if (data.productName) {
    fields.push({ tag: 'plain_text', content: `商品：${data.productName}` }, { tag: 'plain_text', content: '' })
  }
  if (data.price) {
    fields.push({ tag: 'plain_text', content: `价格：¥${data.price}` }, { tag: 'plain_text', content: '' })
  }
  if (data.duration != null) {
    fields.push({ tag: 'plain_text', content: `耗时：${data.duration}ms` }, { tag: 'plain_text', content: '' })
  }
  if (data.message) {
    fields.push({ tag: 'plain_text', content: data.message, lines: 1 }, { tag: 'plain_text', content: '' })
  }
  // Need even number of fields
  if (fields.length % 2 !== 0) {
    fields.push({ tag: 'plain_text', content: '' })
  }
  // Flatten pairs into rows
  const rows = []
  for (let i = 0; i < fields.length; i += 2) {
    rows.push(fields[i])
    if (fields[i + 1]) rows.push(fields[i + 1])
  }
  // Feishu expects an array of field objects in { is_short: true/false, text: ... }
  return rows.map((f, idx) => ({
    is_short: idx % 2 === 0,
    text: f
  }))
}

/**
 * Play audio alert via Web Audio API.
 */
let audioCtx = null

export function playAlert(type = 'success') {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()

    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)

    if (type === 'success') {
      // Rising two-tone
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, audioCtx.currentTime)
      osc.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3)
      osc.start(audioCtx.currentTime)
      osc.stop(audioCtx.currentTime + 0.3)
    } else {
      // Warning buzz
      osc.type = 'square'
      osc.frequency.setValueAtTime(440, audioCtx.currentTime)
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5)
      osc.start(audioCtx.currentTime)
      osc.stop(audioCtx.currentTime + 0.5)
    }
  } catch {
    // Audio not available
  }
}

/**
 * Send browser notification.
 */
export function sendBrowserNotification(title, body) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icons/icon-192.png' })
  }
}
