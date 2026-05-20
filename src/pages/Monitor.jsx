import { useState, useEffect, useRef, useCallback } from 'react'
import { getEnabledAccounts, getEnabledProducts, getLogs, getSetting, setSetting } from '../db'
import { startMonitoring, stopMonitoring, isMonitoring, onMonitorStateChange } from '../engine/monitor'
import { syncTime, getMsUntilTarget, getCorrectedTime, getServerOffset } from '../engine/time-sync'

function StatusLight({ running, warmupActive, hasConfig }) {
  let color, label, pulse
  if (!hasConfig) {
    color = 'bg-gray-500'
    label = '未配置'
    pulse = false
  } else if (warmupActive) {
    color = 'bg-yellow-500'
    label = '预热中'
    pulse = true
  } else if (running) {
    color = 'bg-green-500'
    label = '监控中'
    pulse = true
  } else {
    color = 'bg-red-500'
    label = '已停止'
    pulse = false
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`w-4 h-4 rounded-full ${color} ${pulse ? 'animate-pulse' : ''} shadow-lg`} />
      <span className="text-sm font-medium text-gray-300">{label}</span>
    </div>
  )
}

function Countdown({ targetTime }) {
  const [display, setDisplay] = useState('--:--:--')
  const [isClose, setIsClose] = useState(false)
  const targetRef = useRef(null)

  // Parse targetTime and cache target timestamp + offset
  useEffect(() => {
    if (!targetTime) {
      targetRef.current = null
      setDisplay('未设置时间')
      setIsClose(false)
      return
    }
    const targetMs = new Date(targetTime).getTime()
    if (isNaN(targetMs)) {
      targetRef.current = null
      setDisplay('无效时间')
      setIsClose(false)
      return
    }
    targetRef.current = targetMs
  }, [targetTime])

  // Tick every 100ms, computing remaining time locally (no IndexedDB)
  useEffect(() => {
    let timer
    let mounted = true
    const tick = () => {
      const target = targetRef.current
      if (target === null) return
      const ms = target - Date.now()
      if (!mounted) return
      if (ms <= 0) {
        setDisplay('00:00:00')
        setIsClose(true)
        return
      }
      const totalSec = Math.floor(ms / 1000)
      const h = Math.floor(totalSec / 3600)
      const m = Math.floor((totalSec % 3600) / 60)
      const s = totalSec % 60
      setDisplay(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
      setIsClose(ms < 30000)
    }
    tick()
    timer = setInterval(tick, 100)
    return () => { mounted = false; clearInterval(timer) }
  }, [])

  return (
    <div className={`text-center py-4 ${isClose ? 'text-red-400' : 'text-gray-400'}`}>
      <div className="text-xs mb-1 opacity-60">距离开抢</div>
      <div className={`font-mono text-4xl font-bold tracking-wider ${isClose ? 'scale-110 transition-transform' : ''}`}>
        {display}
      </div>
    </div>
  )
}

export default function Monitor() {
  const [running, setRunning] = useState(isMonitoring())
  const [warmup, setWarmup] = useState(false)
  const [hasConfig, setHasConfig] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [recentLogs, setRecentLogs] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [targetTime, setTargetTime] = useState('')
  const [dateInput, setDateInput] = useState('')
  const [timeInput, setTimeInput] = useState('')

  const checkConfig = useCallback(async () => {
    const [accts, prods] = await Promise.all([getEnabledAccounts(), getEnabledProducts()])
    setAccounts(accts)
    const ready = accts.length > 0 && prods.length > 0
    setHasConfig(ready)
    return ready
  }, [])

  useEffect(() => {
    checkConfig()
    const unsub = onMonitorStateChange((state) => {
      setRunning(state.running)
      setWarmup(state.warmupActive)
    })
    return unsub
  }, [checkConfig])

  // Load saved target time
  useEffect(() => {
    (async () => {
      const val = await getSetting('targetTime')
      if (val) {
        setTargetTime(val)
        setDateInput(val.slice(0, 10))
        setTimeInput(val.slice(11, 16))
      }
    })()
  }, [])

  const saveTargetTime = async (val) => {
    setTargetTime(val)
    await setSetting('targetTime', val)
    if (val) {
      setDateInput(val.slice(0, 10))
      setTimeInput(val.slice(11, 16))
    } else {
      setDateInput('')
      setTimeInput('')
    }
  }

  const handleDateBlur = () => {
    const d = dateInput.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return
    const t = timeInput || '20:00'
    saveTargetTime(`${d}T${t}`)
  }

  const handleTimeBlur = () => {
    const t = timeInput.trim()
    if (!/^\d{2}:\d{2}$/.test(t)) return
    const d = dateInput || new Date().toISOString().slice(0, 10)
    saveTargetTime(`${d}T${t}`)
  }

  // Refresh logs periodically when running
  useEffect(() => {
    if (!running) return
    const timer = setInterval(async () => {
      const logs = await getLogs({ limit: 5 })
      setRecentLogs(logs)
    }, 1000)
    return () => clearInterval(timer)
  }, [running])

  const handleStart = async () => {
    const ready = await checkConfig()
    if (!ready) {
      alert('请先配置账号和商品')
      return
    }
    setRunning(true)
    startMonitoring()
  }

  const handleStop = () => {
    stopMonitoring()
    setRunning(false)
    setWarmup(false)
  }

  const handleSync = async () => {
    setSyncing(true)
    const result = await syncTime()
    setSyncResult(result)
    setSyncing(false)
  }

  const statusColor = !hasConfig ? 'text-gray-500' : warmup ? 'text-yellow-400' : running ? 'text-green-400' : 'text-red-400'

  return (
    <div className="py-4 space-y-4">
      {/* Status indicator + sync */}
      <div className="flex items-center justify-between">
        <StatusLight running={running} warmupActive={warmup} hasConfig={hasConfig} />
        <button
          onClick={handleSync}
          disabled={syncing}
          className="text-xs px-3 py-1 rounded-full bg-[#2a2a4a] text-gray-400 hover:text-white transition-colors"
        >
          {syncing ? '同步中...' : '校准时间'}
        </button>
      </div>
      {syncResult && !syncResult.failed && (
        <p className="text-[10px] text-green-500/70">
          {syncResult.cached ? '使用缓存偏移' : '时间已同步'}
          {syncResult.offset ? ` (${syncResult.offset > 0 ? '+' : ''}${(syncResult.offset / 1000).toFixed(2)}s)` : ''}
        </p>
      )}
      {syncResult?.failed && (
        <p className="text-[10px] text-red-500/70">时间同步失败，使用本地时间</p>
      )}

      {/* Countdown */}
      <Countdown targetTime={targetTime} />

      {/* Time setter */}
      {!running && (
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-4">
          <h3 className="text-xs font-medium text-gray-400 mb-3">设定开抢时间</h3>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="text-[10px] text-gray-600 block mb-1">日期</label>
              <input
                type="text"
                value={dateInput}
                onChange={e => setDateInput(e.target.value)}
                onBlur={handleDateBlur}
                className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 text-center focus:outline-none focus:border-purple-500"
                placeholder="2026-05-20"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-600 block mb-1">时间</label>
              <input
                type="text"
                value={timeInput}
                onChange={e => setTimeInput(e.target.value)}
                onBlur={handleTimeBlur}
                className="w-full bg-[#0f0f1a] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-200 text-center focus:outline-none focus:border-purple-500"
                placeholder="20:00"
              />
            </div>
          </div>
          {targetTime && (
            <p className="text-xs text-green-400 mb-2">
              已设: {new Date(targetTime).toLocaleString('zh-CN')}
            </p>
          )}
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
                onClick={() => saveTargetTime(p.get())}
                className="text-[10px] px-2 py-1 rounded-full bg-[#2a2a4a] text-gray-400 hover:bg-purple-600 hover:text-white transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Account selector (when stopped) */}
      {!running && accounts.length > 0 && (
        <div>
          <label className="text-xs text-gray-500 block mb-1">当前账号</label>
          <select
            value={selectedAccount}
            onChange={e => setSelectedAccount(e.target.value)}
            className="w-full bg-[#1a1a2e] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-purple-500"
          >
            <option value="">全部账号</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Start / Stop button */}
      <button
        onClick={running ? handleStop : handleStart}
        disabled={!hasConfig}
        className={`w-full py-4 rounded-xl text-lg font-bold transition-all active:scale-95 ${
          running
            ? 'bg-red-600 text-white shadow-lg shadow-red-600/25'
            : hasConfig
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25 hover:bg-purple-500'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
        }`}
      >
        {running ? '停止监控' : hasConfig ? '开始监控' : '请先配置账号和商品'}
      </button>

      {/* Quick stats when running */}
      {running && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-3">
            <div className="text-[10px] text-gray-500 mb-1">轮询间隔</div>
            <div className="text-sm font-mono text-gray-300">
              {warmup ? '50ms (预热)' : '正态分布随机'}
            </div>
          </div>
          <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-3">
            <div className="text-[10px] text-gray-500 mb-1">模式</div>
            <div className={`text-sm font-mono ${warmup ? 'text-yellow-400' : 'text-green-400'}`}>
              {warmup ? '预热加速' : '正常监控'}
            </div>
          </div>
        </div>
      )}

      {/* No config hint */}
      {!hasConfig && !running && (
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-6 text-center">
          <div className="text-3xl mb-3">⚡</div>
          <p className="text-sm text-gray-400 mb-2">还没配置好</p>
          <p className="text-xs text-gray-600">去「账号」页添加微店账号，去「商品」页添加要监控的商品</p>
        </div>
      )}

      {/* Recent logs */}
      {recentLogs.length > 0 && (
        <div>
          <h3 className="text-xs text-gray-500 mb-2 font-medium">最近日志</h3>
          <div className="space-y-1">
            {recentLogs.map((log, i) => (
              <div key={i} className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${
                log.level === 'error' ? 'bg-red-500/10 text-red-400' :
                log.level === 'success' ? 'bg-green-500/10 text-green-400' :
                log.level === 'warn' ? 'bg-yellow-500/10 text-yellow-400' :
                'bg-[#1a1a2e] text-gray-500'
              }`}>
                <span className="font-mono opacity-60 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString('zh-CN')}
                </span>
                <span className="truncate">{log.errorMessage || `${log.type} ${log.url || ''}`}</span>
                {log.duration != null && (
                  <span className="font-mono shrink-0 opacity-60">{log.duration}ms</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
