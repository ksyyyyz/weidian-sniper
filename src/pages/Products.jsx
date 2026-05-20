import { useState, useEffect, useCallback } from 'react'
import { getProducts, addProduct, updateProduct, deleteProduct, batchUpdateProducts, batchDeleteProducts, getAccounts, getTemplates } from '../db'

export default function Products() {
  const [products, setProducts] = useState([])
  const [accounts, setAccounts] = useState([])
  const [templates, setTemplates] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [form, setForm] = useState({ name: '', url: '', sku: '', targetPrice: '', accountId: '', templateId: '', enabled: true })

  const loadProducts = useCallback(async () => {
    const [prods, accts] = await Promise.all([getProducts(), getAccounts()])
    setProducts(prods)
    setAccounts(accts)
    const allTpls = await getTemplates()
    setTemplates(allTpls)
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])

  const resetForm = () => {
    setForm({ name: '', url: '', sku: '', targetPrice: '', accountId: '', templateId: '', enabled: true })
    setEditing(null)
    setShowForm(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const data = {
      ...form,
      targetPrice: form.targetPrice ? Number(form.targetPrice) : null,
      accountId: form.accountId ? Number(form.accountId) : null,
      templateId: form.templateId ? Number(form.templateId) : null,
      enabled: form.enabled ? 1 : 0
    }
    if (editing) {
      await updateProduct(editing, data)
    } else {
      await addProduct(data)
    }
    resetForm()
    loadProducts()
  }

  const handleEdit = (p) => {
    setForm({
      name: p.name,
      url: p.url,
      sku: p.sku || '',
      targetPrice: p.targetPrice || '',
      accountId: p.accountId || '',
      templateId: p.templateId || '',
      enabled: p.enabled === 1
    })
    setEditing(p.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('确定删除这个商品？')) return
    await deleteProduct(id)
    loadProducts()
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  const toggleSelect = (id) => {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const toggleAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(products.map(p => p.id)))
    }
  }

  const handleBatchEnable = async (enabled) => {
    if (selected.size === 0) return
    await batchUpdateProducts([...selected], { enabled: enabled ? 1 : 0 })
    loadProducts()
  }

  const handleBatchDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`确定删除选中的 ${selected.size} 个商品？`)) return
    await batchDeleteProducts([...selected])
    setSelected(new Set())
    loadProducts()
  }

  const getAccountName = (accountId) => {
    if (!accountId) return '未绑定'
    const a = accounts.find(a => a.id === accountId)
    return a ? a.name : '未知'
  }

  return (
    <div className="py-4 space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">
          商品列表 ({products.length})
        </h2>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="text-sm px-4 py-1.5 bg-purple-600 text-white rounded-lg active:scale-95 transition-transform"
        >
          + 添加
        </button>
      </div>

      {/* Batch actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 bg-[#1a1a2e] border border-purple-500/30 rounded-lg px-3 py-2">
          <span className="text-xs text-gray-400">已选 {selected.size} 个</span>
          <button onClick={() => handleBatchEnable(true)} className="text-xs px-2 py-1 bg-green-600 text-white rounded">启用</button>
          <button onClick={() => handleBatchEnable(false)} className="text-xs px-2 py-1 bg-gray-600 text-white rounded">禁用</button>
          <button onClick={handleBatchDelete} className="text-xs px-2 py-1 bg-red-600 text-white rounded">删除</button>
        </div>
      )}

      {/* Product list */}
      {products.length === 0 ? (
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm">还没有添加商品</p>
          <p className="text-gray-600 text-xs mt-1">点击「+ 添加」添加要监控的商品</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Select all */}
          <div className="flex items-center gap-2 px-1">
            <input
              type="checkbox"
              checked={selected.size === products.length && products.length > 0}
              onChange={toggleAll}
              className="accent-purple-600 w-4 h-4"
            />
            <span className="text-xs text-gray-500">全选</span>
          </div>

          {products.map(p => (
            <div
              key={p.id}
              className={`bg-[#1a1a2e] border rounded-xl p-4 transition-colors ${
                selected.has(p.id) ? 'border-purple-500/50' : 'border-[#2a2a4a]'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggleSelect(p.id)}
                  className="accent-purple-600 w-4 h-4 mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${p.enabled ? 'bg-green-500' : 'bg-gray-600'}`} />
                    <span className="font-medium text-sm text-gray-200 truncate">{p.name}</span>
                  </div>
                  <p className="text-xs text-gray-600 truncate mb-1">{p.url}</p>
                  <div className="flex items-center gap-3 text-xs">
                    {p.sku && <span className="text-gray-500">SKU: {p.sku}</span>}
                    {p.targetPrice && <span className="text-purple-400">¥{p.targetPrice}</span>}
                    <span className="text-gray-600">{getAccountName(p.accountId)}</span>
                    {p.templateId && (
                      <span className="text-purple-500 bg-purple-500/10 px-1.5 py-0.5 rounded text-[10px]">
                        {templates.find(t => t.id === p.templateId)?.name || '模板'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => handleEdit(p)}
                    className="text-xs px-2 py-1 bg-[#2a2a4a] text-gray-400 rounded hover:text-white">
                    编辑
                  </button>
                  <button onClick={() => handleDelete(p.id)}
                    className="text-xs px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20">
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) resetForm() }}>
          <div className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-2xl p-6 w-full max-w-md min-h-0 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-medium text-white mb-4">
              {editing ? '编辑商品' : '添加商品'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">商品名称 *</label>
                <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
                  placeholder="如：初熟之物 30ml" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">商品URL *</label>
                <input required value={form.url} onChange={e => setForm({...form, url: e.target.value})}
                  className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
                  placeholder="微店商品页面链接" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">SKU ID</label>
                  <input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})}
                    className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
                    placeholder="可选项" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">目标价格</label>
                  <input type="number" step="0.01" value={form.targetPrice} onChange={e => setForm({...form, targetPrice: e.target.value})}
                    className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
                    placeholder="可选项" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">关联账号</label>
                <select value={form.accountId} onChange={e => setForm({...form, accountId: e.target.value})}
                  className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500">
                  <option value="">不绑定</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">下单模板</label>
                <select value={form.templateId} onChange={e => setForm({...form, templateId: e.target.value})}
                  className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500">
                  <option value="">不使用模板</option>
                  {templates.filter(t => !form.accountId || t.accountId === Number(form.accountId)).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {templates.filter(t => !form.accountId || t.accountId === Number(form.accountId)).length === 0 && (
                  <p className="text-[10px] text-gray-600 mt-1">
                    还没有模板，先去「账号」页录制
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.enabled} onChange={e => setForm({...form, enabled: e.target.checked})}
                  className="accent-purple-600 w-4 h-4" />
                <label className="text-xs text-gray-500">启用监控</label>
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
