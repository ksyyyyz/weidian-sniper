import { useState, useEffect, useCallback } from 'react'
import { getAccounts, addAccount, updateAccount, deleteAccount, getProducts, addProduct, parseAccountContext, getTemplates, addTemplate, addTemplateStep, deleteTemplate, getTemplateSteps } from '../db'
import { parseHAR, getHARSummary, extractPurchaseTemplate } from '../utils/har-parser'

const STATUS_MAP = {
  healthy: { label: '正常', color: 'text-green-400', dot: 'bg-green-500' },
  expired: { label: '已过期', color: 'text-red-400', dot: 'bg-red-500' },
  unknown: { label: '未检测', color: 'text-gray-500', dot: 'bg-gray-500' },
}

function ContextGuide({ onClose, onImport }) {
  const [mode, setMode] = useState(null)
  const [harResult, setHarResult] = useState(null)
  const [harError, setHarError] = useState('')
  const [harLoading, setHarLoading] = useState(false)
  const [harText, setHarText] = useState('')
  const [contextText, setContextText] = useState('')

  const handleHARFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setHarLoading(true)
    setHarError('')
    try {
      const text = await file.text()
      processHAR(text)
    } catch (err) {
      setHarError(err.message)
      setHarLoading(false)
    }
  }

  const handleHARPaste = () => {
    const text = harText.trim()
    if (!text) return
    setHarLoading(true)
    setHarError('')
    processHAR(text)
  }

  const processHAR = (text) => {
    try {
      const result = parseHAR(text)
      if (!result.cookies && !result.products.length) {
        setHarError('未找到微店相关数据，请确认抓包时访问过微店小程序')
        setHarLoading(false)
        return
      }
      setHarResult(result)
    } catch (err) {
      setHarError('解析失败: ' + err.message + '\n请确认粘贴的是完整的 HAR 内容')
    }
    setHarLoading(false)
  }

  const handleHARConfirm = () => {
    if (!harResult) return
    onImport({
      cookie: harResult.cookies || null,
      accountName: harResult.accountName || 'HAR导入',
      products: harResult.products
    })
  }

  const handleManualSubmit = () => {
    const trimmed = contextText.trim()
    if (!trimmed) return
    const parsed = parseAccountContext(trimmed)
    if (!parsed) {
      alert('Context 格式不对。\n\n请确认：\n1. 在 Fiddler 中选中 thor.weidian.com 的 POST 请求\n2. 右侧 Inspectors → WebForms\n3. 找到 context 那一行，复制完整的值\n4. 值应该是以 %7B 开头或 { 开头的 JSON')
      return
    }
    onImport({
      contextData: parsed,
      accountName: null,
      products: []
    })
  }

  // Choose mode screen
  if (!mode) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
        onClick={onClose}>
        <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-2xl p-5 w-full max-w-md min-h-0 max-h-[80vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}>
          <h3 className="text-base font-medium text-white mb-1">获取微店 Token</h3>
          <p className="text-xs text-gray-500 mb-4">用 Fiddler 抓微信PC版微店小程序的包</p>

          <button onClick={() => setMode('manual')}
            className="w-full mb-3 p-4 bg-purple-600/10 border border-purple-500/30 rounded-xl text-left active:scale-[0.98] transition-transform">
            <div className="text-sm font-medium text-purple-300 mb-1">从 Fiddler 复制 Context（推荐）</div>
            <div className="text-xs text-gray-500">Fiddler 抓包 → 找 thor.weidian.com POST 请求 → 复制 context 值 → 粘贴</div>
          </button>

          <button onClick={() => setMode('har')}
            className="w-full mb-3 p-4 bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl text-left active:scale-[0.98] transition-transform">
            <div className="text-sm font-medium text-gray-300 mb-1">HAR 文件导入</div>
            <div className="text-xs text-gray-600">Fiddler/Charles/Stream 导出 HAR → 自动解析 Cookie + 商品</div>
          </button>

          <button onClick={() => setMode('desktop')}
            className="w-full p-4 bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl text-left active:scale-[0.98] transition-transform">
            <div className="text-sm font-medium text-gray-300 mb-1">Fiddler 配置教程</div>
            <div className="text-xs text-gray-600">Fiddler Classic 安装和 HTTPS 解密设置步骤</div>
          </button>

          <button onClick={onClose}
            className="w-full mt-4 py-2.5 bg-[#2a2a4a] text-gray-400 text-sm rounded-xl">
            取消
          </button>
        </div>
      </div>
    )
  }

  // HAR mode
  if (mode === 'har') {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
        onClick={onClose}>
        <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-2xl p-5 w-full max-w-md min-h-0 max-h-[80vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}>

          {!harResult ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <button onClick={() => setMode(null)}
                  className="text-gray-500 hover:text-white text-lg leading-none">&larr;</button>
                <h3 className="text-base font-medium text-white">导入 HAR</h3>
              </div>

              <div className="bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl p-4 mb-4">
                <p className="text-xs text-gray-400 leading-relaxed">
                  <span className="text-purple-400 font-medium">抓包工具导出 HAR：</span><br />
                  <b>Fiddler Classic:</b> File → Export Sessions → All Sessions → 选 HAR JSON<br />
                  <b>Stream (iPhone):</b> 抓包历史 → 「...」→ 导出 → HAR → 拷贝<br />
                  <b>Charles:</b> File → Export → HAR<br />
                  <b>mitmproxy:</b> mitmweb 界面 → File → Save → HAR<br />
                  <b>Chrome DevTools:</b> Network → 右键 → Save all as HAR
                </p>
              </div>

              {harError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3 text-xs text-red-400 whitespace-pre-line">
                  {harError}
                </div>
              )}

              {harLoading ? (
                <div className="text-center py-8">
                  <div className="w-10 h-10 border-3 border-[#333] border-t-purple-500 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-400">解析中...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">粘贴 HAR 内容</label>
                    <textarea
                      value={harText}
                      onChange={e => setHarText(e.target.value)}
                      placeholder="把 HAR 内容粘贴到这里 (Ctrl+V)..."
                      className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-[10px] text-gray-300 font-mono resize-none h-24 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <button onClick={handleHARPaste}
                    disabled={!harText.trim()}
                    className="w-full py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl disabled:opacity-40 active:scale-95 transition-transform">
                    解析 HAR
                  </button>

                  <div className="relative py-2">
                    <div className="absolute inset-x-0 top-1/2 border-t border-[#2a2a4a]" />
                    <span className="relative flex justify-center">
                      <span className="bg-[#1a1a2e] px-3 text-[10px] text-gray-600">或者</span>
                    </span>
                  </div>

                  <label className="block">
                    <input type="file" accept=".har,.json,.txt,text/*" onChange={handleHARFile} className="hidden" />
                    <span className="block w-full text-center py-3 bg-[#0f0f1a] border border-dashed border-[#3a3a5a] rounded-xl cursor-pointer active:scale-[0.98] transition-transform">
                      <span className="text-sm text-gray-400">从文件选择</span>
                      <span className="text-[10px] text-gray-600 block mt-0.5">支持 .har .json .txt 格式</span>
                    </span>
                  </label>
                </div>
              )}

              <button onClick={onClose}
                className="w-full mt-3 py-2.5 bg-[#2a2a4a] text-gray-400 text-sm rounded-xl">
                取消
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">✅</span>
                <h3 className="text-base font-medium text-white">解析完成</h3>
              </div>

              <div className="bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl p-4 mb-4">
                {getHARSummary(harResult).map((line, i) => (
                  <p key={i} className={`text-xs leading-relaxed ${
                    line.startsWith('  ') ? 'text-gray-500 ml-2' : 'text-gray-300'
                  }`}>{line}</p>
                ))}
              </div>

              <button onClick={handleHARConfirm}
                className="w-full py-3 bg-purple-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-transform mb-2">
                确认导入
              </button>
              <button onClick={() => { setHarResult(null); setHarError(''); setHarText('') }}
                className="w-full py-2.5 bg-[#2a2a4a] text-gray-400 text-sm rounded-xl">
                重新输入
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // Fiddler setup guide
  if (mode === 'desktop') {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
        onClick={onClose}>
        <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-2xl p-5 w-full max-w-md min-h-0 max-h-[80vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setMode(null)}
              className="text-gray-500 hover:text-white text-lg leading-none shrink-0">&larr;</button>
            <h3 className="text-base font-medium text-white">Fiddler 配置教程</h3>
          </div>

          <div className="space-y-3 mb-4">
            {[
              { title: '安装 Fiddler Classic', desc: 'Win+R 输入 cmd → 输入 winget install Telerik.Fiddler.Classic → 回车。已装好可跳过。' },
              { title: '开启 HTTPS 解密', desc: '打开 Fiddler → Tools → Options → HTTPS → 勾选 "Decrypt HTTPS traffic" → 点击 Yes 信任证书' },
              { title: '打开微信PC版微店小程序', desc: '微信PC版 → 底部「小程序」→ 搜索「微店」→ 打开微店小程序 → 随便逛几个商品页面' },
              { title: '找到 Context', desc: '回到 Fiddler → 左侧找到 thor.weidian.com 的 POST 请求 → 点击 → 右侧 Inspectors → WebForms' },
              { title: '复制 Context 值', desc: '在 WebForms 中找 context 那一行 → 右键 → Copy Value → 这就是认证令牌' },
              { title: '粘贴 Context', desc: '回到本页面，点下面的「从 Fiddler 复制 Context」→ 粘贴到输入框 → 确认' },
            ].map((s, i) => (
              <div key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <div className="text-xs font-medium text-white">{s.title}</div>
                  <div className="text-xs text-gray-500 leading-relaxed">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4 text-xs text-green-400">
            微信PC版小程序不走 SSL Pinning，Fiddler 可以直接解密。这是目前最可靠的方式。
          </div>

          <button onClick={() => setMode('manual')}
            className="w-full mb-2 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl">
            去粘贴 Context
          </button>
          <button onClick={onClose}
            className="w-full py-2.5 bg-[#2a2a4a] text-gray-400 text-sm rounded-xl">
            关闭
          </button>
        </div>
      </div>
    )
  }

  // Manual mode — paste context from Fiddler
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
      onClick={onClose}>
      <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-2xl p-5 w-full max-w-md min-h-0 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setMode(null)}
            className="text-gray-500 hover:text-white text-lg leading-none shrink-0">&larr;</button>
          <h3 className="text-base font-medium text-white">从 Fiddler 复制 Context</h3>
        </div>

        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4 text-xs text-green-400">
          微信PC版微店小程序不走证书绑定，Fiddler 可直接抓包。一次配置，持续使用。
        </div>

        <div className="space-y-3 mb-4">
          {[
            { icon: '1', title: '启动抓包', desc: '打开 Fiddler Classic，确认左下角是 "Capturing" 状态。打开微信PC版 → 微店小程序 → 随便浏览几个商品。' },
            { icon: '2', title: '定位请求', desc: '回到 Fiddler，左侧列表找到 Host 为 thor.weidian.com 的 POST 请求（通常是深蓝色）。点一下选中。' },
            { icon: '3', title: '复制 Context', desc: '右侧点 Inspectors 标签 → WebForms 子标签 → 在列表里找到 context 那一行 → 双击 Value 那一列 → Ctrl+C 复制。' },
            { icon: '4', title: '粘贴到这里', desc: 'Ctrl+V 粘贴到下方输入框，点击确认。整个 context 值应该以 %7B 或 { 开头。' },
          ].map((s, i) => (
            <div key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {s.icon}
              </span>
              <div>
                <div className="text-xs font-medium text-white">{s.title}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Paste area */}
        <div className="space-y-2 sticky bottom-0 bg-[#1a1a2e] pt-2">
          <textarea
            value={contextText}
            onChange={e => setContextText(e.target.value)}
            placeholder="把 context 值粘贴到这里 (Ctrl+V)..."
            className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-xs text-gray-200 font-mono resize-none h-20 focus:outline-none focus:border-purple-500"
          />
          <button onClick={handleManualSubmit}
            disabled={!contextText.trim()}
            className="w-full py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl disabled:opacity-40 active:scale-95 transition-transform">
            解析并添加账号
          </button>
        </div>

        <button onClick={onClose}
          className="w-full mt-3 py-2.5 bg-[#2a2a4a] text-gray-400 text-sm rounded-xl">
          关闭
        </button>
      </div>
    </div>
  )
}

function TemplateImporter({ accountId, onClose, onImported }) {
  const [step, setStep] = useState(0) // 0=input, 1=preview, 2=done
  const [harText, setHarText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateSteps, setTemplateSteps] = useState([])
  const [totalFound, setTotalFound] = useState(0)
  const [harProducts, setHarProducts] = useState([])
  const [harCookies, setHarCookies] = useState('')
  const [harAccountName, setHarAccountName] = useState('')

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const text = await file.text()
      processHAR(text)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handlePaste = () => {
    const text = harText.trim()
    if (!text) return
    setLoading(true)
    setError('')
    processHAR(text)
  }

  const processHAR = (text) => {
    const tplResult = extractPurchaseTemplate(text)
    if (tplResult.error) {
      setError(tplResult.error)
      setLoading(false)
      return
    }
    setTemplateSteps(tplResult.steps)
    setTotalFound(tplResult.totalFound)
    setTemplateName(tplResult.templateName)

    // Also extract products, cookies, account name from HAR
    try {
      const harResult = parseHAR(text)
      setHarProducts(harResult.products || [])
      setHarCookies(harResult.cookies || '')
      setHarAccountName(harResult.accountName || '')
    } catch {
      setHarProducts([])
      setHarCookies('')
      setHarAccountName('')
    }

    setLoading(false)
    setStep(1)
  }

  const handleSave = async () => {
    if (!templateSteps.length) return
    setLoading(true)
    try {
      const tplId = await addTemplate({ name: templateName, accountId })
      for (let i = 0; i < templateSteps.length; i++) {
        const s = templateSteps[i]
        await addTemplateStep({
          templateId: tplId,
          step: i,
          name: s.name,
          url: s.url,
          body: typeof s.body === 'object' ? JSON.stringify(s.body) : (s.rawParam || s.body),
          order: i
        })
      }

      // Auto-add detected products linked to this account + template
      let savedProducts = 0
      for (const p of harProducts) {
        if (!p.sku) continue
        try {
          await addProduct({
            name: p.name,
            url: p.url || `https://weidian.com/item.html?itemID=${p.sku}`,
            sku: p.sku,
            targetPrice: p.targetPrice || null,
            accountId,
            templateId: tplId,
            enabled: 1
          })
          savedProducts++
        } catch { /* skip duplicates */ }
      }
      // Store saved count for display
      setHarProducts(prev => prev.map(p => ({ ...p, _saved: true })))

      setStep(2)
      onImported?.(tplId, savedProducts)
    } catch (err) {
      setError('保存失败: ' + err.message)
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
      onClick={onClose}>
      <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-2xl p-5 w-full max-w-lg min-h-0 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Step 0: Input HAR */}
        {step === 0 && (
          <>
            <h3 className="text-base font-medium text-white mb-1">录制下单模板</h3>
            <p className="text-xs text-gray-500 mb-4">
              在微店小程序走一遍完整下单流程（浏览→加购→下单），Fiddler 导出 HAR 粘贴到这里
            </p>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4 text-xs text-blue-400">
              <b>操作步骤：</b><br />
              1. 微信PC版 → 微店小程序 → 随便找个商品<br />
              2. 完整走一遍：加购物车 → 去结算 → 提交订单<br />
              3. Fiddler → File → Export Sessions → All Sessions → HAR JSON<br />
              4. 把导出的 HAR 文件内容粘贴或拖到下方
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3 text-xs text-red-400 whitespace-pre-line">
                {error}
              </div>
            )}

            {loading ? (
              <div className="text-center py-8">
                <div className="w-10 h-10 border-3 border-[#333] border-t-purple-500 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-400">解析中...</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">粘贴 HAR 内容</label>
                  <textarea
                    value={harText}
                    onChange={e => setHarText(e.target.value)}
                    placeholder="Ctrl+V 粘贴 HAR 内容..."
                    className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-[10px] text-gray-300 font-mono resize-none h-28 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <button onClick={handlePaste}
                  disabled={!harText.trim()}
                  className="w-full py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl disabled:opacity-40 active:scale-95 transition-transform">
                  解析模板
                </button>

                <div className="relative py-2">
                  <div className="absolute inset-x-0 top-1/2 border-t border-[#2a2a4a]" />
                  <span className="relative flex justify-center">
                    <span className="bg-[#1a1a2e] px-3 text-[10px] text-gray-600">或者上传文件</span>
                  </span>
                </div>

                <label className="block">
                  <input type="file" accept=".har,.json,.txt,text/*" onChange={handleFile} className="hidden" />
                  <span className="block w-full text-center py-3 bg-[#0f0f1a] border border-dashed border-[#3a3a5a] rounded-xl cursor-pointer active:scale-[0.98] transition-transform">
                    <span className="text-sm text-gray-400">选择 HAR 文件</span>
                  </span>
                </label>
              </div>
            )}

            <button onClick={onClose}
              className="w-full mt-3 py-2.5 bg-[#2a2a4a] text-gray-400 text-sm rounded-xl">
              取消
            </button>
          </>
        )}

        {/* Step 1: Preview & confirm */}
        {step === 1 && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">📋</span>
              <div>
                <h3 className="text-base font-medium text-white">识别到下单流程</h3>
                <p className="text-xs text-gray-500">共 {totalFound} 条微店请求，识别 {templateSteps.length} 个下单步骤</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">模板名称</label>
              <input value={templateName} onChange={e => setTemplateName(e.target.value)}
                className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500" />
            </div>

            <div className="space-y-2 mb-4">
              {templateSteps.map((s, i) => (
                <div key={i} className="bg-[#0f0f1a] border border-[#2a2a4a] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-xs font-medium text-white">{s.name}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 truncate">{s.url}</p>
                  {(s.replacements?.length || 0) > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {s.replacements.map((r, i) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                          {r.path} → {r.placeholder}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3 text-xs text-red-400">{error}</div>
            )}

            {/* Detected products */}
            {harProducts.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-gray-400">识别到 {harProducts.length} 个商品</span>
                  {harAccountName && <span className="text-[10px] text-purple-400">账号: {harAccountName}</span>}
                </div>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {harProducts.map((p, i) => (
                    <div key={i} className="bg-[#0f0f1a] border border-[#2a2a4a] rounded-lg px-3 py-2 flex items-center gap-2">
                      <span className="text-[10px] text-gray-600 w-5 shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-200 truncate">{p.name}</p>
                        <p className="text-[10px] text-gray-600 truncate">SKU: {p.sku}</p>
                      </div>
                      {p.targetPrice && (
                        <span className="text-[10px] text-purple-400 shrink-0">¥{p.targetPrice}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={handleSave}
              disabled={loading}
              className="w-full py-3 bg-purple-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-transform mb-2">
              {loading ? '保存中...' : '确认保存模板'}
            </button>
            <button onClick={() => setStep(0)}
              className="w-full py-2.5 bg-[#2a2a4a] text-gray-400 text-sm rounded-xl">
              重新选择
            </button>
          </>
        )}

        {/* Step 2: Done */}
        {step === 2 && (
          <>
            <div className="text-center py-4">
              <span className="text-3xl">✅</span>
              <h3 className="text-base font-medium text-white mt-2">模板保存成功</h3>
              <p className="text-xs text-gray-500 mt-1">
                {templateSteps.length} 个步骤已保存
                {harProducts.length > 0 && <span>，{harProducts.length} 个商品已自动添加到商品列表</span>}
              </p>

              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mt-4 text-xs text-green-400 text-left">
                <b>下一步：</b><br />
                去「商品」页查看已自动添加的商品，开启「启用监控」开关<br />
                然后在「监控」页设置目标时间，点「开始监控」即可
              </div>
            </div>

            <button onClick={onClose}
              className="w-full mt-4 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl">
              完成
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [productCounts, setProductCounts] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', context: '', userAgent: '', proxyNote: '', enabled: true })
  const [showTemplateImporter, setShowTemplateImporter] = useState(null) // accountId to import template for
  const [templateCounts, setTemplateCounts] = useState({})

  const loadData = useCallback(async () => {
    const accts = await getAccounts()
    setAccounts(accts)
    const counts = {}
    const tCounts = {}
    for (const a of accts) {
      const prods = await getProducts(a.id)
      counts[a.id] = prods.length
      const tmpls = await getTemplates(a.id)
      tCounts[a.id] = tmpls.length
    }
    setProductCounts(counts)
    setTemplateCounts(tCounts)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const resetForm = () => {
    setForm({ name: '', context: '', userAgent: '', proxyNote: '', enabled: true })
    setEditing(null)
    setShowForm(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    let contextData = {}
    if (form.context.trim()) {
      const parsed = parseAccountContext(form.context)
      if (!parsed) {
        alert('Context 格式不对。\n\n请确认从 Fiddler 复制的完整 context 参数值。\n值应该是以 { 或 %7B 开头的 JSON 数据。')
        return
      }
      contextData = parsed
    }

    const data = {
      name: form.name,
      contextRaw: contextData.contextRaw || form.context.trim(),
      contextEncoded: contextData.contextEncoded || '',
      token: contextData.token || '',
      refreshToken: contextData.refreshToken || '',
      duid: contextData.duid || '',
      visitorId: contextData.visitorId || '',
      sid: contextData.sid || '',
      wduserID: contextData.wduserID || '',
      appid: contextData.appid || 'wxbuyer',
      wxappid: contextData.wxappid || '',
      platform: contextData.platform || 'windows',
      userType: contextData.userType ?? 0,
      userAgent: form.userAgent || '',
      proxyNote: form.proxyNote || '',
      enabled: form.enabled ? 1 : 0
    }

    if (editing) {
      await updateAccount(editing, data)
    } else {
      await addAccount(data)
    }
    resetForm()
    loadData()
  }

  const handleEdit = (a) => {
    setForm({
      name: a.name,
      context: a.contextRaw || a.cookie || '',
      userAgent: a.userAgent || '',
      proxyNote: a.proxyNote || '',
      enabled: a.enabled === 1
    })
    setEditing(a.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('确定删除这个账号？关联的商品也会一并删除。')) return
    await deleteAccount(id)
    loadData()
  }

  const handleImport = async (data) => {
    setShowGuide(false)

    const acctData = {
      name: data.accountName || '微店账号',
      enabled: 1
    }

    if (data.contextData) {
      Object.assign(acctData, {
        contextRaw: data.contextData.contextRaw,
        contextEncoded: data.contextData.contextEncoded,
        token: data.contextData.token,
        refreshToken: data.contextData.refreshToken,
        duid: data.contextData.duid,
        visitorId: data.contextData.visitorId,
        sid: data.contextData.sid,
        wduserID: data.contextData.wduserID,
        appid: data.contextData.appid,
        wxappid: data.contextData.wxappid,
        platform: data.contextData.platform,
        userType: data.contextData.userType
      })
    } else if (data.cookie) {
      acctData.cookie = data.cookie
    }

    const accountId = await addAccount(acctData)

    let addedCount = 0
    if (data.products && data.products.length > 0) {
      for (const p of data.products) {
        await addProduct({
          name: p.name,
          url: p.url,
          sku: p.sku || '',
          targetPrice: p.targetPrice || null,
          accountId: accountId,
          enabled: 1
        })
        addedCount++
      }
    }

    const tokenInfo = data.contextData?.token ? `Token: 已配置` : ''
    alert(`导入完成！\n账号: ${data.accountName || '微店账号'}\n${tokenInfo}\n商品: ${addedCount} 个`)

    loadData()
  }

  const hasToken = (acct) => {
    return !!(acct.token || acct.contextRaw)
  }

  const getStatus = (acct) => {
    if (!hasToken(acct)) return 'unknown'
    if (acct.cookieStatus === 'expired') return 'expired'
    if (acct.cookieStatus === 'healthy') return 'healthy'
    return 'unknown'
  }

  return (
    <div className="py-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">
          账号列表 ({accounts.length})
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowGuide(true)}
            className="text-xs px-3 py-1.5 border border-purple-500/30 text-purple-400 rounded-lg active:scale-95 transition-transform"
          >
            获取Token教程
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="text-sm px-4 py-1.5 bg-purple-600 text-white rounded-lg active:scale-95 transition-transform"
          >
            + 添加
          </button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm">还没有添加账号</p>
          <p className="text-gray-600 text-xs mt-1">
            点「获取Token教程」按步骤用 Fiddler 抓取，或点「+ 添加」手动粘贴 Context
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map(a => {
            const status = getStatus(a)
            const st = STATUS_MAP[status]
            return (
              <div key={a.id}
                className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${a.enabled ? st.dot : 'bg-gray-600'}`} />
                    <span className="font-medium text-sm text-gray-200">{a.name}</span>
                    <span className={`text-[10px] ${st.color}`}>{st.label}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setShowTemplateImporter(a.id)}
                      className="text-xs px-2 py-1 bg-purple-500/10 text-purple-400 rounded hover:bg-purple-500/20">
                      录制模板
                    </button>
                    <button onClick={() => handleEdit(a)}
                      className="text-xs px-2 py-1 bg-[#2a2a4a] text-gray-400 rounded hover:text-white">
                      编辑
                    </button>
                    <button onClick={() => handleDelete(a.id)}
                      className="text-xs px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20">
                      删除
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-600">Token: </span>
                    <span className={hasToken(a) ? 'text-green-400' : 'text-red-400'}>
                      {hasToken(a) ? '已配置' : '未配置'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">下单模板: </span>
                    <span className={templateCounts[a.id] ? 'text-purple-400' : 'text-gray-500'}>
                      {templateCounts[a.id] || 0} 个
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">关联商品: </span>
                    <span className="text-gray-400">{productCounts[a.id] || 0} 个</span>
                  </div>
                  {a.duid && (
                    <div className="col-span-2">
                      <span className="text-gray-600">用户ID: </span>
                      <span className="text-gray-400">{a.duid}</span>
                    </div>
                  )}
                  {a.userAgent && (
                    <div className="col-span-2">
                      <span className="text-gray-600">自定义UA: </span>
                      <span className="text-gray-500 text-[10px] truncate block">{a.userAgent}</span>
                    </div>
                  )}
                  {a.proxyNote && (
                    <div className="col-span-2">
                      <span className="text-gray-600">代理: </span>
                      <span className="text-gray-400">{a.proxyNote}</span>
                    </div>
                  )}
                  {a.cookieCheckedAt && (
                    <div className="col-span-2">
                      <span className="text-gray-600">最后检测: </span>
                      <span className="text-gray-500">
                        {new Date(a.cookieCheckedAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Context Guide modal */}
      {showGuide && (
        <ContextGuide
          onImport={handleImport}
          onClose={() => setShowGuide(false)}
        />
      )}

      {/* Template Importer modal */}
      {showTemplateImporter && (
        <TemplateImporter
          accountId={showTemplateImporter}
          onClose={() => setShowTemplateImporter(null)}
          onImported={() => { setShowTemplateImporter(null); loadData() }}
        />
      )}

      {/* Add/Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) resetForm() }}>
          <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-2xl p-6 w-full max-w-md min-h-0 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-medium text-white mb-4">
              {editing ? '编辑账号' : '添加账号'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">账号名称 *</label>
                <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
                  placeholder="如：主号" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Context *</label>
                <textarea required value={form.context} onChange={e => setForm({...form, context: e.target.value})}
                  className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-purple-500 resize-none h-24 font-mono"
                  placeholder="从 Fiddler 复制的 context 参数值（以 { 或 %7B 开头）" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">自定义 UA（可选）</label>
                <input value={form.userAgent} onChange={e => setForm({...form, userAgent: e.target.value})}
                  className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-purple-500"
                  placeholder="留空则使用微信PC小程序UA" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">代理备注（可选）</label>
                <input value={form.proxyNote} onChange={e => setForm({...form, proxyNote: e.target.value})}
                  className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
                  placeholder="如：已配置系统代理 / VPN" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.enabled} onChange={e => setForm({...form, enabled: e.target.checked})}
                  className="accent-purple-600 w-4 h-4" />
                <label className="text-xs text-gray-500">启用</label>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={resetForm}
                  className="flex-1 py-2.5 rounded-xl bg-[#2a2a4a] text-gray-400 text-sm">取消</button>
                <button type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium">
                  {editing ? '保存' : '添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
