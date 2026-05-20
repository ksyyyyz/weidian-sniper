import { apiFetch } from './fetcher'
import { stopMonitoring } from './monitor'
import { sendFeishu, playAlert, sendBrowserNotification } from './notifier'
import { success, error, info } from '../utils/logger'
import { getTemplateSteps, getAccount } from '../db'

const snipeLocks = new Set()

/**
 * Execute purchase by replaying a recorded template.
 * Replaces {{itemId}}, {{skuId}}, {{shopId}} in each step's body with actual product values.
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

    for (const step of steps) {
      const stepStart = performance.now()

      // Replace placeholders in body
      let body = step.body
      if (product.sku) {
        body = body.replace(/\{\{itemId\}\}/g, product.sku)
        body = body.replace(/\{\{skuId\}\}/g, product.sku)
      }
      if (product.shopId) {
        body = body.replace(/\{\{shopId\}\}/g, product.shopId)
      }

      // Try to extract itemId from product URL as fallback
      const urlMatch = product.url?.match(/itemID=(\d+)/) || product.url?.match(/item\/(\d+)/)
      if (urlMatch) {
        body = body.replace(/\{\{itemId\}\}/g, urlMatch[1])
      }

      // For remaining unreplaced placeholders, try the product's own ID
      body = body.replace(/\{\{itemId\}\}/g, product.sku || String(product.id))
      body = body.replace(/\{\{skuId\}\}/g, product.sku || String(product.id))
      body = body.replace(/\{\{shopId\}\}/g, product.shopId || '')

      try {
        const result = await apiFetch(step.url, {
          method: 'POST',
          body,
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

        // Don't continue if a step fails (unless it's the last)
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

export function isTemplateSnipeActive() {
  return snipeLocks.size > 0
}
