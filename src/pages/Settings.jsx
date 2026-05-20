import { useState, useEffect, useCallback } from 'react'
import { getSetting, setSetting, exportConfig, importConfig, resetAll, getAllSettings } from '../db'

const DEFAULT_SETTINGS = {
  interval: 200,
  warmupSeconds: 3,
  cooldownMinutes: 15,
  timeOffset: -100,
  feishuWebhookUrl: '',
  targetTime: '',
  uaRotation: true,
  delayRandomize: true,
  smartCooldown: true,
  warmupMode: true,
  proxyReminder: true,
  notificationsEnabled: true,
}

export default function Settings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [exportName, setExportName] = useState('')
  const [importFile, setImportFile] = useState(null)
  const [statusMsg, setStatusMsg] = useState('')

  const loadSettings = useCallback(async () => {
    const all = await getAllSettings()
    const merged = { ...DEFAULT_SETTINGS }
    for (const [k, v] of Object.entries(all)) {
      if (typeof DEFAULT_SETTINGS[k] === 'boolean') {
        merged[k] = v === 'true' || v === true
      } else if (typeof DEFAULT_SETTINGS[k] === 'number') {
        merged[k] = Number(v)
      } else {
        merged[k] = v || DEFAULT_SETTINGS[k]
      }
    }
    setSettings(merged)
    setLoaded(true)
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  const update = async (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    await setSetting(key, typeof value === 'boolean' ? String(value) : value)
  }

  const handleExport = async () => {
    const json = await exportConfig(exportName || 'backup')
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `weidian-sniper-config-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showStatus('配置已导出')
  }

  const handleImport = async () => {
    if (!importFile) return
    try {
      const text = await importFile.text()
      const result = await importConfig(text)
      showStatus(`已导入：${result.accounts} 个账号，${result.products} 个商品`)
      loadSettings()
    } catch (err) {
      showStatus('导入失败：' + err.message)
    }
  }

  const handleReset = async () => {
    if (!confirm('确定重置所有数据？账号、商品、日志、设置将全部清空，不可恢复！')) return
    await resetAll()
    setSettings(DEFAULT_SETTINGS)
    showStatus('数据已清空')
  }

  const showStatus = (msg) => {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(''), 3000)
  }

  if (!loaded) return <div className="py-8 text-center text-gray-500 text-sm">加载中...</div>

  return (
    <div className="py-4 space-y-4">
      {statusMsg && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 text-sm text-green-400 text-center">
          {statusMsg}
        </div>
      )}

      {/* Account section — Context config */}
      <Section title="Token 配置">
        <p className="text-xs text-gray-600 mb-2">
          从 Fiddler 抓取微店 Context 后粘贴到这里（备用）。去「账号」页为每个账号单独配置会更方便。
        </p>
        <div>
          <label className="text-xs text-gray-500 block mb-1">全局 Context（备用）</label>
          <textarea
            value={settings.context || ''}
            onChange={e => update('context', e.target.value)}
            className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-purple-500 resize-none h-20 font-mono"
            placeholder="从 Fiddler 复制的 context 值..."
          />
        </div>
      </Section>

      {/* Target time */}
      <Section title="开抢时间">
        <p className="text-[10px] text-gray-500 mb-2">设置秒杀活动的预计开始时间，到点前会自动进入预热模式</p>
        <input
          type="datetime-local"
          value={settings.targetTime || ''}
          onChange={e => update('targetTime', e.target.value)}
          className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500 mb-2"
        />
        <p className="text-[10px] text-gray-600 mb-2">
          当前: {settings.targetTime ? new Date(settings.targetTime).toLocaleString('zh-CN') : '未设置'}
        </p>
        {/* Quick presets */}
        <div className="flex gap-1.5 flex-wrap">
          {[
            { label: '1分钟后', get: () => new Date(Date.now() + 60000).toISOString().slice(0, 16) },
            { label: '5分钟后', get: () => new Date(Date.now() + 300000).toISOString().slice(0, 16) },
            { label: '今晚20:00', get: () => { const d = new Date(); d.setHours(20, 0, 0, 0); return d.toISOString().slice(0, 16) } },
            { label: '今晚21:00', get: () => { const d = new Date(); d.setHours(21, 0, 0, 0); return d.toISOString().slice(0, 16) } },
            { label: '明早10:00', get: () => { const d = new Date(Date.now() + 86400000); d.setHours(10, 0, 0, 0); return d.toISOString().slice(0, 16) } },
            { label: '清除', get: () => '' },
          ].map(p => (
            <button
              key={p.label}
              onClick={() => update('targetTime', p.get())}
              className="text-[10px] px-2 py-1 rounded-full bg-[#2a2a4a] text-gray-400 hover:bg-purple-600 hover:text-white transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Feishu */}
      <Section title="飞书通知">
        <input
          type="url"
          value={settings.feishuWebhookUrl || ''}
          onChange={e => update('feishuWebhookUrl', e.target.value)}
          className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
          placeholder="飞书机器人 Webhook URL"
        />
        <p className="text-[10px] text-gray-600 mt-1">在飞书群添加自定义机器人，复制 Webhook 地址</p>
      </Section>

      {/* Timing params */}
      <Section title="请求参数">
        <SliderField
          label="请求间隔"
          value={settings.interval}
          min={50} max={2000} step={10}
          unit=" ms"
          onChange={v => update('interval', v)}
          hint="基线时间，实际会在正态分布范围内随机波动"
        />
        <SliderField
          label="时间偏置"
          value={settings.timeOffset}
          min={-200} max={500} step={10}
          unit=" ms"
          onChange={v => update('timeOffset', v)}
          hint="负值=提前发起请求，正值=延后发起。推荐 -50~-150ms"
        />
        <SliderField
          label="预热秒数"
          value={settings.warmupSeconds}
          min={0} max={30} step={1}
          unit=" s"
          onChange={v => update('warmupSeconds', v)}
          hint="开抢前N秒进入高速轮询模式（50ms间隔）"
        />
        <SliderField
          label="冷却分钟数"
          value={settings.cooldownMinutes}
          min={1} max={120} step={1}
          unit=" min"
          onChange={v => update('cooldownMinutes', v)}
          hint="触发风控后该商品暂停监控的时长"
        />
      </Section>

      {/* Anti-ban toggles */}
      <Section title="防封号策略">
        <ToggleField label="UA 轮换" value={settings.uaRotation} onChange={v => update('uaRotation', v)}
          hint="每次请求随机切换 User-Agent" />
        <ToggleField label="延迟随机化" value={settings.delayRandomize} onChange={v => update('delayRandomize', v)}
          hint="请求间隔按正态分布随机波动" />
        <ToggleField label="智能冷却" value={settings.smartCooldown} onChange={v => update('smartCooldown', v)}
          hint="检测到风控后自动暂停该商品" />
        <ToggleField label="预热加速" value={settings.warmupMode} onChange={v => update('warmupMode', v)}
          hint="开抢前N秒自动加速轮询" />
        <ToggleField label="代理提醒" value={settings.proxyReminder} onChange={v => update('proxyReminder', v)}
          hint="未检测到VPN时提醒用户" />
        <ToggleField label="声音通知" value={settings.notificationsEnabled} onChange={v => update('notificationsEnabled', v)}
          hint="抢到/风控时播放提示音" />
      </Section>

      {/* Data management */}
      <Section title="数据管理">
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={exportName}
              onChange={e => setExportName(e.target.value)}
              className="flex-1 bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
              placeholder="导出名称（可选）"
            />
            <button onClick={handleExport}
              className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg active:scale-95">
              导出配置
            </button>
          </div>
          <div>
            <label className="block">
              <input
                type="file"
                accept=".json"
                onChange={e => setImportFile(e.target.files[0])}
                className="hidden"
                id="import-file"
              />
              <span className="block text-center py-2 bg-[#2a2a4a] text-gray-400 text-sm rounded-lg cursor-pointer hover:text-white active:scale-95 transition-transform">
                {importFile ? `已选: ${importFile.name}` : '选择导入文件'}
              </span>
            </label>
            {importFile && (
              <button onClick={handleImport}
                className="w-full mt-1 py-2 bg-green-600 text-white text-sm rounded-lg active:scale-95">
                执行导入
              </button>
            )}
          </div>
        </div>
      </Section>

      {/* Danger zone */}
      <Section title="危险操作">
        <button onClick={handleReset}
          className="w-full py-3 bg-red-600/10 border border-red-500/30 text-red-400 rounded-xl text-sm font-medium active:scale-95 transition-transform">
          重置所有数据
        </button>
        <p className="text-[10px] text-gray-600 mt-1 text-center">清空所有账号、商品、日志和设置</p>
      </Section>

      <div className="text-center text-[10px] text-gray-700 pb-4">
        微店抢购助手 v1.0 · 仅供安全测试使用
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function SliderField({ label, value, min, max, step, unit, onChange, hint }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs font-mono text-purple-400">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 accent-purple-600"
        style={{ background: `linear-gradient(to right, #7c3aed ${pct}%, #2a2a4a ${pct}%)` }}
      />
      {hint && <p className="text-[10px] text-gray-600 mt-0.5">{hint}</p>}
    </div>
  )
}

function ToggleField({ label, value, onChange, hint }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        {hint && <p className="text-[10px] text-gray-600">{hint}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full transition-colors relative ${value ? 'bg-purple-600' : 'bg-gray-700'}`}
      >
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
          value ? 'left-6' : 'left-1'
        }`} />
      </button>
    </div>
  )
}
