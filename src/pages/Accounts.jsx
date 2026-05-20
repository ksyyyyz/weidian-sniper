import { useState, useEffect, useCallback, useRef } from 'react'
import { getAccounts, addAccount, updateAccount, deleteAccount, getProducts, addProduct } from '../db'
import { parseHAR, getHARSummary } from '../utils/har-parser'

const STATUS_MAP = {
  healthy: { label: '正常', color: 'text-green-400', dot: 'bg-green-500' },
  expired: { label: '已过期', color: 'text-red-400', dot: 'bg-red-500' },
  unknown: { label: '未检测', color: 'text-gray-500', dot: 'bg-gray-500' },
}

function CookieGuide({ onClose, onImport }) {
  const [mode, setMode] = useState(null) // null = choose, 'har' = HAR import, 'manual' = step guide
  const [harResult, setHarResult] = useState(null)
  const [harError, setHarError] = useState('')
  const [harLoading, setHarLoading] = useState(false)

  // Manual mode
  const [text, setText] = useState('')
  const [step, setStep] = useState(0)

  const steps = [
    { title: '下载 Stream', desc: 'App Store 搜索 "Stream" 下载安装', icon: '1' },
    { title: '开始抓包', desc: '打开 Stream → 点「开始抓包」→ 切到微店随便逛几个页面', icon: '2' },
    { title: '找到 Cookie', desc: '回到 Stream → 点「停止抓包」→ 点「抓包历史」→ 找一条 weidian.com 的请求点进去', icon: '3' },
    { title: '复制粘贴', desc: '点「请求」标签 → 长按 Cookie 那一行 → 全选复制，粘贴到下面', icon: '4' },
  ]

  const handleHARFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setHarLoading(true)
    setHarError('')
    try {
      const text = await file.text()
      const result = parseHAR(text)
      if (!result.cookies) {
        setHarError('HAR 文件中未找到微店 Cookie，请确认抓包时访问过微店')
        setHarLoading(false)
        return
      }
      setHarResult(result)
    } catch (err) {
      setHarError(err.message)
    }
    setHarLoading(false)
  }

  const handleHARConfirm = () => {
    if (!harResult) return
    onImport({
      cookie: harResult.cookies,
      accountName: harResult.accountName || 'HAR导入',
      products: harResult.products
    })
  }

  const handleManualSubmit = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (!trimmed.includes('=')) {
      alert('Cookie 格式不对，请确保复制了完整的 Cookie 行')
      return
    }
    onImport({ cookie: trimmed, accountName: null, products: [] })
  }

  const handleNext = () => { if (step < steps.length - 1) setStep(step + 1) }
  const handlePrev = () => { if (step > 0) setStep(step - 1) }

  // Choose mode screen
  if (!mode) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center"
        onClick={onClose}>
        <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md safe-bottom"
          onClick={e => e.stopPropagation()}>
          <h3 className="text-base font-medium text-white mb-1">获取微店 Cookie</h3>
          <p className="text-xs text-gray-500 mb-5">选择一种方式，只需操作一次，之后自动保鲜</p>

          <button onClick={() => setMode('har')}
            className="w-full mb-3 p-4 bg-purple-600/10 border border-purple-500/30 rounded-xl text-left hover:border-purple-500/60 transition-colors">
            <div className="text-sm font-medium text-purple-300 mb-1">一键导入 HAR（推荐）</div>
            <div className="text-xs text-gray-500">Stream 导出 HAR 文件 → 导入 → 自动识别 Cookie + 商品</div>
          </button>

          <button onClick={() => setMode('manual')}
            className="w-full p-4 bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl text-left hover:border-[#3a3a5a] transition-colors">
            <div className="text-sm font-medium text-gray-300 mb-1">手动粘贴 Cookie</div>
            <div className="text-xs text-gray-600">从 Stream 请求详情里手动复制 Cookie 粘贴</div>
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
      <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center"
        onClick={onClose}>
        <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md safe-bottom"
          onClick={e => e.stopPropagation()}>

          {!harResult ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <button onClick={() => setMode(null)}
                  className="text-gray-500 hover:text-white text-lg leading-none">&larr;</button>
                <h3 className="text-base font-medium text-white">导入 HAR 文件</h3>
              </div>

              <div className="bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl p-4 mb-4">
                <p className="text-xs text-gray-400 leading-relaxed">
                  <span className="text-purple-400 font-medium">Stream 导出步骤：</span><br />
                  1. Stream 抓包历史 → 点右上角「...」<br />
                  2. 选择「导出」→ 格式选 HAR<br />
                  3. 保存到「文件」App<br />
                  4. 回到这里点下方按钮导入
                </p>
              </div>

              {harError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3 text-xs text-red-400">
                  {harError}
                </div>
              )}

              {harLoading ? (
                <div className="text-center py-8">
                  <div className="w-10 h-10 border-3 border-[#333] border-t-purple-500 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-400">解析中...</p>
                </div>
              ) : (
                <label className="block">
                  <input type="file" accept=".har,.json" onChange={handleHARFile} className="hidden" />
                  <span className="block w-full text-center py-10 bg-[#0f0f1a] border-2 border-dashed border-purple-500/40 rounded-xl cursor-pointer hover:border-purple-500 transition-colors">
                    <span className="text-3xl block mb-2">📂</span>
                    <span className="text-sm text-gray-400">点击选择 HAR 文件</span>
                    <span className="text-[10px] text-gray-600 block mt-1">.har / .json</span>
                  </span>
                </label>
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
              <button onClick={() => { setHarResult(null); setHarError('') }}
                className="w-full py-2.5 bg-[#2a2a4a] text-gray-400 text-sm rounded-xl">
                重新选择
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // Manual mode
  const current = steps[step]
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}>
      <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md safe-bottom"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setMode(null)}
            className="text-gray-500 hover:text-white text-lg leading-none">&larr;</button>
          <h3 className="text-base font-medium text-white">手动粘贴 Cookie</h3>
        </div>

        <div className="flex gap-1 mb-4">
          {steps.map((_, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full ${i <= step ? 'bg-purple-500' : 'bg-[#2a2a4a]'}`} />
          ))}
        </div>

        <div className="bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="w-8 h-8 rounded-full bg-purple-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
              {current.icon}
            </span>
            <span className="text-sm font-medium text-white">{current.title}</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">{current.desc}</p>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={handlePrev} disabled={step === 0}
            className={`px-3 py-1.5 text-xs rounded-lg ${step === 0 ? 'bg-[#1a1a2e] text-gray-700' : 'bg-[#2a2a4a] text-gray-400 hover:text-white'}`}>
            上一步
          </button>
          {step < steps.length - 1 ? (
            <button onClick={handleNext}
              className="flex-1 py-1.5 bg-purple-600 text-white text-xs rounded-lg">
              下一步
            </button>
          ) : (
            <span className="flex-1" />
          )}
        </div>

        {step === steps.length - 1 && (
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="把复制的 Cookie 粘贴到这里..."
              className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-xs text-gray-200 font-mono resize-none h-20 focus:outline-none focus:border-purple-500"
            />
            <button onClick={handleManualSubmit}
              className="w-full py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl active:scale-95 transition-transform">
              确认并添加账号
            </button>
          </div>
        )}

        <button onClick={onClose}
          className="w-full mt-3 py-2.5 bg-[#2a2a4a] text-gray-400 text-sm rounded-xl">
          关闭
        </button>
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
  const [form, setForm] = useState({ name: '', cookie: '', userAgent: '', proxyNote: '', enabled: true })

  const loadData = useCallback(async () => {
    const accts = await getAccounts()
    setAccounts(accts)
    const counts = {}
    for (const a of accts) {
      const prods = await getProducts(a.id)
      counts[a.id] = prods.length
    }
    setProductCounts(counts)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const resetForm = () => {
    setForm({ name: '', cookie: '', userAgent: '', proxyNote: '', enabled: true })
    setEditing(null)
    setShowForm(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const data = { ...form, enabled: form.enabled ? 1 : 0 }
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
      cookie: a.cookie || '',
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

    // Create account
    const accountId = await addAccount({
      name: data.accountName || '微店账号',
      cookie: data.cookie,
      enabled: 1
    })

    // Auto-add products
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

    alert(`导入完成！\n账号: ${data.accountName || '微店账号'}\nCookie: 已配置\n商品: ${addedCount} 个`)

    loadData()
  }

  const getStatus = (acct) => {
    if (!acct.cookie) return 'unknown'
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
            获取Cookie教程
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
            点「获取Cookie教程」按步骤获取，或点「+ 添加」手动粘贴
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
                    <span className="text-gray-600">关联商品: </span>
                    <span className="text-gray-400">{productCounts[a.id] || 0} 个</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Cookie: </span>
                    <span className={a.cookie ? 'text-green-400' : 'text-red-400'}>
                      {a.cookie ? '已配置' : '未配置'}
                    </span>
                  </div>
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

      {/* Cookie Guide modal */}
      {showGuide && (
        <CookieGuide
          onImport={handleImport}
          onClose={() => setShowGuide(false)}
        />
      )}

      {/* Add/Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) resetForm() }}>
          <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md safe-bottom"
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
                <label className="text-xs text-gray-500 block mb-1">Cookie *</label>
                <textarea required value={form.cookie} onChange={e => setForm({...form, cookie: e.target.value})}
                  className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-purple-500 resize-none h-24 font-mono"
                  placeholder="用 Stream 抓包获取的 Cookie 字符串" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">自定义 UA（可选）</label>
                <input value={form.userAgent} onChange={e => setForm({...form, userAgent: e.target.value})}
                  className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-purple-500"
                  placeholder="留空则使用随机UA池" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">代理备注（可选）</label>
                <input value={form.proxyNote} onChange={e => setForm({...form, proxyNote: e.target.value})}
                  className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
                  placeholder="如：已开 Surge / 小火箭" />
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
