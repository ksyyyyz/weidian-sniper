import { useState, useEffect, useCallback, useRef } from 'react'
import { getAccounts, addAccount, updateAccount, deleteAccount, getProducts } from '../db'
import jsQR from 'jsqr'

const STATUS_MAP = {
  healthy: { label: '正常', color: 'text-green-400', dot: 'bg-green-500' },
  expired: { label: '已过期', color: 'text-red-400', dot: 'bg-red-500' },
  unknown: { label: '未检测', color: 'text-gray-500', dot: 'bg-gray-500' },
}

function QRScanner({ onScan, onClose }) {
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const fileRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setScanning(true)
    setError('')

    try {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.src = url
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })

      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)

      if (!code) {
        setError('未识别到二维码，请确保拍摄清晰且包含完整二维码')
        setScanning(false)
        return
      }

      // Parse the JSON from QR
      try {
        const data = JSON.parse(code.data)
        if (data.t === 'wd' && data.c) {
          onScan({ cookie: data.c })
          onClose()
          return
        }
      } catch {
        // Not JSON, try as plain text
        if (code.data.includes('=') && code.data.length > 20) {
          onScan({ cookie: code.data })
          onClose()
          return
        }
      }

      setError('不是有效的微店 Cookie 二维码')
    } catch (err) {
      setError('图片读取失败: ' + err.message)
    }
    setScanning(false)
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
      onClick={onClose}>
      <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-2xl p-6 w-full max-w-sm mx-4"
        onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-medium text-white mb-2">扫码同步 Cookie</h3>
        <p className="text-xs text-gray-500 mb-4">
          用电脑 Chrome 打开微店并登录，点击扩展图标生成二维码，用手机扫一扫
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {scanning ? (
          <div className="text-center py-8">
            <div className="w-10 h-10 border-3 border-[#333] border-t-purple-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">识别中...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFile}
                className="hidden"
              />
              <span className="block w-full text-center py-12 bg-[#0f0f1a] border-2 border-dashed border-[#3a3a5a] rounded-xl cursor-pointer hover:border-purple-500 transition-colors">
                <span className="text-4xl block mb-2">📷</span>
                <span className="text-sm text-gray-400">点击拍照</span>
              </span>
            </label>
            <button onClick={onClose}
              className="w-full py-2.5 bg-[#2a2a4a] text-gray-400 text-sm rounded-xl">
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [productCounts, setProductCounts] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
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

  const handleQRScan = (data) => {
    setForm(prev => ({
      ...prev,
      cookie: data.cookie,
      name: prev.name || '扫码导入'
    }))
    setShowScanner(false)
    setShowForm(true)
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
            onClick={() => setShowScanner(true)}
            className="text-xs px-3 py-1.5 border border-purple-500/30 text-purple-400 rounded-lg active:scale-95 transition-transform"
          >
            扫码同步
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
            点「扫码同步」用二维码获取，或点「+ 添加」手动粘贴 Cookie
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

      {/* QR Scanner modal */}
      {showScanner && (
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setShowScanner(false)}
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
                  placeholder="从微店抓取的 Cookie 字符串，或扫码同步" />
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
