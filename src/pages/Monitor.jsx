import { useState, useEffect, useRef, useCallback } from 'react'
import { getEnabledAccounts, getEnabledProducts, getLogs } from '../db'
import { startMonitoring, stopMonitoring, isMonitoring, onMonitorStateChange } from '../engine/monitor'
import { syncTime, getMsUntilTarget, getCorrectedTime } from '../engine/time-sync'
import { getSetting } from '../db'

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

function Countdown({ hasConfig }) {
  const [display, setDisplay] = useState('--:--:--')
  const [isClose, setIsClose] = useState(false)

  useEffect(() => {
    let timer
    const tick = async () => {
      const ms = await getMsUntilTarget()
      if (ms === null || ms === undefined) {
        setDisplay('未设置时间')
        setIsClose(false)
        return
      }
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
    return () => clearInterval(timer)
  }, [hasConfig])

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
      <Countdown hasConfig={hasConfig} />

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
