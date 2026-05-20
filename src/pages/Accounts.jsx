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
  const [harText, setHarText] = useState('')

  // Manual cookie text
  const [cookieText, setCookieText] = useState('')

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
      if (!result.cookies) {
        setHarError('未找到微店 Cookie，请确认抓包时访问过微店')
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
      cookie: harResult.cookies,
      accountName: harResult.accountName || 'HAR导入',
      products: harResult.products
    })
  }

  const handleManualSubmit = () => {
    const trimmed = cookieText.trim()
    if (!trimmed) return
    if (!trimmed.includes('=')) {
      alert('Cookie 格式不对，请确保复制了完整的 Cookie 行')
      return
    }
    onImport({ cookie: trimmed, accountName: null, products: [] })
  }

  // Choose mode screen
  if (!mode) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
        onClick={onClose}>
        <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-2xl p-5 w-full max-w-md min-h-0 max-h-[80vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}>
          <h3 className="text-base font-medium text-white mb-1">获取微店 Cookie</h3>
          <p className="text-xs text-gray-500 mb-4">只需操作一次，之后自动保鲜</p>

          <button onClick={() => setMode('manual')}
            className="w-full mb-3 p-4 bg-purple-600/10 border border-purple-500/30 rounded-xl text-left active:scale-[0.98] transition-transform">
            <div className="text-sm font-medium text-purple-300 mb-1">直接粘贴 Cookie（推荐）</div>
            <div className="text-xs text-gray-500">Stream 抓包 → 点开请求详情 → 拷贝 Cookie 行 → 粘贴到这里</div>
          </button>

          <button onClick={() => setMode('har')}
            className="w-full mb-3 p-4 bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl text-left active:scale-[0.98] transition-transform">
            <div className="text-sm font-medium text-gray-300 mb-1">HAR 文件导入</div>
            <div className="text-xs text-gray-600">Stream/Charles/Fiddler 导出 HAR → 自动解析 Cookie + 商品</div>
          </button>

          <button onClick={() => setMode('desktop')}
            className="w-full p-4 bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl text-left active:scale-[0.98] transition-transform">
            <div className="text-sm font-medium text-gray-300 mb-1">电脑端抓包（mitmproxy）</div>
            <div className="text-xs text-gray-600">Windows 装 mitmproxy → iPhone 设代理 → 电脑上看 Cookie</div>
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

              {/* Stream instructions */}
              <div className="bg-[#0f0f1a] border border-[#2a2a4a] rounded-xl p-4 mb-4">
                <p className="text-xs text-gray-400 leading-relaxed">
                  <span className="text-purple-400 font-medium">抓包工具导出 HAR：</span><br />
                  <b>Stream (iPhone):</b> 抓包历史 → 「...」→ 导出 → HAR → 拷贝<br />
                  <b>Charles:</b> File → Export → HAR<br />
                  <b>Fiddler:</b> File → Export Sessions → HAR<br />
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
                      <span className="text-[10px] text-gray-600 block mt-0.5">先存到「文件」App，再从这里选</span>
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

  // Desktop proxy mode — mitmproxy guide
  if (mode === 'desktop') {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
        onClick={onClose}>
        <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-2xl p-5 w-full max-w-md min-h-0 max-h-[80vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setMode(null)}
              className="text-gray-500 hover:text-white text-lg leading-none shrink-0">&larr;</button>
            <h3 className="text-base font-medium text-white">电脑端抓包</h3>
          </div>

          <div className="space-y-3 mb-4">
            {[
              { title: '安装 mitmproxy', desc: '浏览器打开 mitmproxy.org → 下载 Windows 版 → 安装' },
              { title: '启动 mitmweb', desc: 'Win+R 输入 cmd 回车 → 输入 mitmweb 回车 → 浏览器自动打开 http://localhost:8081' },
              { title: 'iPhone 设代理', desc: 'iPhone 设置 → WiFi → 点当前网络右边的 ⓘ → HTTP 代理 → 手动 → 服务器填电脑IP，端口 8080' },
              { title: '安装证书', desc: 'iPhone Safari 打开 mitm.it → 点 Apple 图标下载证书 → 设置 → 通用 → VPN与设备管理 → 安装' },
              { title: '信任证书', desc: '设置 → 通用 → 关于本机 → 证书信任设置 → 开启 mitmproxy 证书' },
              { title: '抓取 Cookie', desc: 'iPhone 上打开微店APP逛逛 → 电脑 mitmweb 界面找 weidian.com 的请求 → 点 Request → 复制 Cookie 那一行' },
              { title: '粘贴 Cookie', desc: '回到本页面，点下面的「直接粘贴 Cookie」粘贴即可' },
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

          <button onClick={() => setMode('manual')}
            className="w-full mb-2 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl">
            去粘贴 Cookie
          </button>
          <button onClick={onClose}
            className="w-full py-2.5 bg-[#2a2a4a] text-gray-400 text-sm rounded-xl">
            关闭
          </button>
        </div>
      </div>
    )
  }

  // Manual mode — all steps visible, scrollable
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
      onClick={onClose}>
      <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-2xl p-5 w-full max-w-md min-h-0 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setMode(null)}
            className="text-gray-500 hover:text-white text-lg leading-none shrink-0">&larr;</button>
          <h3 className="text-base font-medium text-white">直接粘贴 Cookie</h3>
        </div>

        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4 text-xs text-green-400">
          这是最可靠的方式。HAR 导入可能因微店 SSL 证书绑定而失败，但手动复制 Cookie 总是能用。
        </div>

        {/* All steps on one scrollable view */}
        <div className="space-y-3 mb-4">
          {[
            { icon: '1', title: 'iPhone 装 Stream', desc: 'App Store 搜索 "Stream" 下载。打开后按提示安装 HTTPS 证书并信任。' },
            { icon: '2', title: '开始抓包', desc: 'Stream 点「开始抓包」→ 切到微店 APP 随便逛几个页面 → 回到 Stream 点「停止抓包」' },
            { icon: '3', title: '复制 Cookie', desc: '点「抓包历史」→ 找一条域名含 weidian.com 的请求 → 点它 → 点「请求」标签 → 找到 Cookie 那一行 → 长按 → 全选 → 拷贝' },
            { icon: '4', title: '粘贴到这里', desc: '在电脑上打开此页面，把复制的 Cookie 发到电脑（微信/QQ 发送），Ctrl+V 粘贴到下方输入框' },
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
            value={cookieText}
            onChange={e => setCookieText(e.target.value)}
            placeholder="把 Cookie 粘贴到这里 (Ctrl+V)..."
            className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-xs text-gray-200 font-mono resize-none h-20 focus:outline-none focus:border-purple-500"
          />
          <button onClick={handleManualSubmit}
            disabled={!cookieText.trim()}
            className="w-full py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl disabled:opacity-40 active:scale-95 transition-transform">
            确认并添加账号
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
