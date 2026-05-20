import { apiFetch } from './fetcher'
import { stopMonitoring } from './monitor'
import { sendFeishu, playAlert, sendBrowserNotification } from './notifier'
import { success, error, info } from '../utils/logger'
import { getTemplateSteps, getAccount } from '../db'

const snipeLocks = new Set()

/**
 * Execute purchase by replaying a recorded template.
 * Each step's body is a JSON object (or string) with {{placeholders}}.
 * Placeholders are replaced with actual product values, then passed to apiFetch as an object.
 */
export async function executeTemplateSnipe(templateId, product) {
  const key = `tpl_${templateId}_${product.id}`
  if (snipeLocks.has(key)) return
  snipeLocks.add(key)

  const startTime = performance.now()
  const stepResults = []

  try {
    const steps = await getTemplateSteps(templateId)
    if (!steps.length) {
      await error('snipe_error', {
        productId: product.id,
        accountId: product.accountId,
        errorMessage: '模板没有步骤'
      })
      return { ok: false, error: '模板为空' }
    }

    await info('snipe_started', {
      productId: product.id,
      accountId: product.accountId,
      errorMessage: `开始模板抢购: ${product.name} (${steps.length}步)`
    })

    // Determine itemId from product
    const itemId = product.sku
      || (product.url?.match(/itemID=(\d+)/) || [])[1]
      || (product.url?.match(/item\/(\d+)/) || [])[1]
      || String(product.id)

    const skuId = product.sku || itemId
    const shopId = product.shopId || ''

    for (const step of steps) {
      const stepStart = performance.now()

      // Parse body to object
      let bodyObj
      try {
        bodyObj = typeof step.body === 'string' ? JSON.parse(step.body) : step.body
      } catch {
        bodyObj = {}
      }

      // Replace placeholders in all values
      bodyObj = replacePlaceholders(bodyObj, {
        '{{itemId}}': itemId,
        '{{skuId}}': skuId,
        '{{shopId}}': shopId
      })

      try {
        const result = await apiFetch(step.url, {
          method: 'POST',
          body: bodyObj,
          accountId: product.accountId,
          productId: product.id,
          skipDelay: true,
          timeout: 8000
        })

        const duration = Math.round(performance.now() - stepStart)
        stepResults.push({ step: step.name, duration, ok: result.status < 400 })

        await info('snipe_step', {
          productId: product.id,
          accountId: product.accountId,
          duration,
          responseBody: { step: step.name, status: result.status }
        })
      } catch (err) {
        const duration = Math.round(performance.now() - stepStart)
        stepResults.push({ step: step.name, duration, ok: false, error: err.message })

        await error('snipe_step_failed', {
          productId: product.id,
          accountId: product.accountId,
          duration,
          errorMessage: `步骤「${step.name}」失败: ${err.message}`
        })

        break
      }
    }

    const totalDuration = Math.round(performance.now() - startTime)
    const allOk = stepResults.length > 0 && stepResults.every(s => s.ok)

    if (allOk) {
      await stopMonitoring()
      await success('snipe_success', {
        productId: product.id,
        accountId: product.accountId,
        duration: totalDuration,
        errorMessage: `模板抢购成功! ${product.name} 总耗时 ${totalDuration}ms`
      })

      const acct = product.accountId ? await getAccount(product.accountId) : null

      await sendFeishu('success', {
        productName: product.name,
        accountName: acct?.name || '默认',
        price: product.targetPrice,
        duration: totalDuration,
        message: `步骤: ${stepResults.map(s => `${s.step}=${s.duration}ms`).join(', ')}`
      })

      playAlert('success')
      sendBrowserNotification('抢购成功!', `${product.name} 已下单 (耗时 ${totalDuration}ms)`)
    } else {
      const failed = stepResults.find(s => !s.ok)
      await error('snipe_failed', {
        productId: product.id,
        accountId: product.accountId,
        duration: totalDuration,
        errorMessage: `模板下单失败，「${failed?.step}」失败`
      })
    }

    return { ok: allOk, steps: stepResults, totalDuration }

  } catch (err) {
    const totalDuration = Math.round(performance.now() - startTime)
    await error('snipe_error', {
      productId: product.id,
      accountId: product.accountId,
      duration: totalDuration,
      errorMessage: `模板执行异常: ${err.message}`
    })
    return { ok: false, error: err.message, totalDuration }
  } finally {
    snipeLocks.delete(key)
  }
}

function replacePlaceholders(obj, replacements) {
  if (!obj || typeof obj !== 'object') return obj
  const result = Array.isArray(obj) ? [] : {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      let v = value
      for (const [placeholder, replacement] of Object.entries(replacements)) {
        v = v.replace(placeholder, replacement)
      }
      result[key] = v
    } else if (typeof value === 'object' && value !== null) {
      result[key] = replacePlaceholders(value, replacements)
    } else {
      result[key] = value
    }
  }
  return result
}

export function isTemplateSnipeActive() {
  return snipeLocks.size > 0
}
