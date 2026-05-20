import { apiGet, apiPost, apiFetch } from './fetcher'
import { stopMonitoring } from './monitor'
import { sendFeishu, playAlert, sendBrowserNotification } from './notifier'
import { success, error, info } from '../utils/logger'
import { getSetting, getAccount } from '../db'

const snipeLocks = new Set()

/**
 * Execute full purchase flow for a product.
 * Flow: verify stock → add cart → create order → confirm pay
 */
export async function executeSnipe(product) {
  const key = `${product.accountId}_${product.id}`
  if (snipeLocks.has(key)) return // already sniping this product
  snipeLocks.add(key)

  const startTime = performance.now()
  const steps = []

  try {
    await info('snipe_started', {
      productId: product.id,
      accountId: product.accountId,
      errorMessage: `开始抢购: ${product.name}`
    })

    // Step 1: Verify stock / get item detail
    const detailUrl = product.url || await getSetting('snipe_detail_url') || `https://h5.weidian.com/item/${product.sku}`
    const step1Start = performance.now()
    const { status: s1s, data: detail } = await apiGet(detailUrl, {
      accountId: product.accountId,
      productId: product.id,
      skipDelay: true, // Time critical!
      timeout: 8000
    })
    steps.push({ step: 'detail', duration: Math.round(performance.now() - step1Start), ok: s1s < 400 })
    await info('snipe_step', {
      productId: product.id,
      accountId: product.accountId,
      duration: steps[steps.length - 1].duration,
      responseBody: { step: 'detail', status: s1s }
    })

    // Step 2: Add to cart
    const cartUrl = await getSetting('snipe_cart_url') || buildCartUrl(product)
    const step2Start = performance.now()
    const cartBody = { skuId: product.sku, itemId: product.url?.match(/item\/(\d+)/)?.[1], quantity: 1 }
    const { status: s2s, data: cartData } = await apiPost(cartUrl, cartBody, {
      accountId: product.accountId,
      productId: product.id,
      skipDelay: true,
      referer: detailUrl,
      timeout: 8000
    })
    steps.push({ step: 'cart', duration: Math.round(performance.now() - step2Start), ok: s2s < 400 })
    await info('snipe_step', {
      productId: product.id,
      accountId: product.accountId,
      duration: steps[steps.length - 1].duration,
      responseBody: { step: 'cart', status: s2s }
    })

    // Step 3: Create order
    const orderUrl = await getSetting('snipe_order_url') || 'https://h5.weidian.com/order/create'
    const step3Start = performance.now()
    const orderBody = {
      ...cartBody,
      addressId: await getSetting('snipe_address_id'),
      payType: await getSetting('snipe_pay_type') || 'wechat'
    }
    const { status: s3s, data: orderData } = await apiPost(orderUrl, orderBody, {
      accountId: product.accountId,
      productId: product.id,
      skipDelay: true,
      referer: cartUrl,
      timeout: 8000
    })
    steps.push({ step: 'order', duration: Math.round(performance.now() - step3Start), ok: s3s < 400 })
    await info('snipe_step', {
      productId: product.id,
      accountId: product.accountId,
      duration: steps[steps.length - 1].duration,
      responseBody: { step: 'order', status: s3s }
    })

    // Step 4: Confirm pay (optional, depends on platform)
    const confirmUrl = await getSetting('snipe_confirm_url')
    if (confirmUrl) {
      const step4Start = performance.now()
      const { status: s4s } = await apiPost(confirmUrl, { orderId: orderData?.data?.orderId || orderData?.orderId }, {
        accountId: product.accountId,
        productId: product.id,
        skipDelay: true,
        timeout: 8000
      })
      steps.push({ step: 'confirm', duration: Math.round(performance.now() - step4Start), ok: s4s < 400 })
      await info('snipe_step', {
        productId: product.id,
        accountId: product.accountId,
        duration: steps[steps.length - 1].duration,
        responseBody: { step: 'confirm', status: s4s }
      })
    }

    const totalDuration = Math.round(performance.now() - startTime)
    const allOk = steps.every(s => s.ok)

    if (allOk) {
      await stopMonitoring()
      await success('snipe_success', {
        productId: product.id,
        accountId: product.accountId,
        duration: totalDuration,
        errorMessage: `抢购成功! ${product.name} 总耗时 ${totalDuration}ms`
      })

      const acct = product.accountId ? await getAccount(product.accountId) : null

      await sendFeishu('success', {
        productName: product.name,
        accountName: acct?.name || '默认',
        price: product.targetPrice,
        duration: totalDuration,
        message: `步骤耗时: ${steps.map(s => `${s.step}=${s.duration}ms`).join(', ')}`
      })

      playAlert('success')
      sendBrowserNotification('抢购成功!', `${product.name} 已下单 (耗时 ${totalDuration}ms)`)
    } else {
      const failedStep = steps.find(s => !s.ok)
      await error('snipe_failed', {
        productId: product.id,
        accountId: product.accountId,
        duration: totalDuration,
        errorMessage: `下单失败，步骤「${failedStep?.step}」失败 (总耗时 ${totalDuration}ms)`
      })
    }

    return { ok: allOk, steps, totalDuration }

  } catch (err) {
    const totalDuration = Math.round(performance.now() - startTime)
    await error('snipe_error', {
      productId: product.id,
      accountId: product.accountId,
      duration: totalDuration,
      errorMessage: `下单异常: ${err.message}`
    })

    await sendFeishu('warning', {
      productName: product.name,
      message: `下单异常: ${err.message}`
    })

    playAlert('warning')
    return { ok: false, error: err.message, totalDuration }
  } finally {
    snipeLocks.delete(key)
  }
}

function buildCartUrl(product) {
  // Default Weidian add-to-cart URL pattern
  const itemId = product.url?.match(/item\/(\d+)/)?.[1]
  if (itemId) {
    return `https://h5.weidian.com/cart/add/${itemId}`
  }
  return 'https://h5.weidian.com/cart/add'
}

let snipeActive = false

export function isSnipeActive() {
  return snipeActive
}
