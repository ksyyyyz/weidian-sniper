import { useState, useEffect, useCallback } from 'react'
import { getLogs, clearLogs, exportLogs, getLogStats } from '../db'

const LEVELS = ['all', 'info', 'warn', 'error', 'success']
const LEVEL_LABELS = { all: '全部', info: '信息', warn: '警告', error: '错误', success: '成功' }
const LEVEL_COLORS = {
  info: 'bg-blue-500/10 text-blue-400',
  warn: 'bg-yellow-500/10 text-yellow-400',
  error: 'bg-red-500/10 text-red-400',
  success: 'bg-green-500/10 text-green-400'
}

export default function Logs() {
  const [logs, setLogs] = useState([])
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [stats, setStats] = useState({ total: 0, success: 0, errors: 0, avgDuration: 0, successRate: 0 })

  const loadData = useCallback(async () => {
    const [logData, statData] = await Promise.all([
      getLogs({ level: filter === 'all' ? null : filter, limit: 200 }),
      getLogStats()
    ])
    setLogs(logData)
    setStats(statData)
  }, [filter])

  useEffect(() => { loadData() }, [loadData])

  const handleClear = async () => {
    if (!confirm('确定清空所有日志？此操作不可撤销。')) return
    await clearLogs()
    loadData()
  }

  const handleExport = async () => {
    const json = await exportLogs()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `weidian-sniper-logs-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleExpand = (id) => {
    setExpanded(expanded === id ? null : id)
  }

  return (
    <div className="py-4 space-y-3">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-2 text-center">
          <div className="text-lg font-mono font-bold text-gray-200">{stats.total}</div>
          <div className="text-[10px] text-gray-500">总请求</div>
        </div>
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-2 text-center">
          <div className="text-lg font-mono font-bold text-green-400">{stats.successRate}%</div>
          <div className="text-[10px] text-gray-500">成功率</div>
        </div>
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-2 text-center">
          <div className="text-lg font-mono font-bold text-red-400">{stats.errors}</div>
          <div className="text-[10px] text-gray-500">错误</div>
        </div>
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-2 text-center">
          <div className="text-lg font-mono font-bold text-purple-400">{stats.avgDuration}</div>
          <div className="text-[10px] text-gray-500">平均ms</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {LEVELS.map(l => (
            <button
              key={l}
              onClick={() => setFilter(l)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                filter === l
                  ? 'bg-purple-600 text-white'
                  : 'bg-[#2a2a4a] text-gray-500 hover:text-gray-300'
              }`}
            >
              {LEVEL_LABELS[l]}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button onClick={handleExport}
            className="text-xs px-2 py-1 bg-[#2a2a4a] text-gray-400 rounded hover:text-white">
            导出
          </button>
          <button onClick={handleClear}
            className="text-xs px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20">
            清空
          </button>
        </div>
      </div>

      {/* Log list */}
      {logs.length === 0 ? (
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm">还没有日志</p>
          <p className="text-gray-600 text-xs mt-1">开始监控后会自动记录请求日志</p>
        </div>
      ) : (
        <div className="space-y-1">
          {logs.map(log => {
            const isExpanded = expanded === log.id
            return (
              <div key={log.id} className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleExpand(log.id)}
                  className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-[#22223a] transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    log.level === 'success' ? 'bg-green-500' :
                    log.level === 'error' ? 'bg-red-500' :
                    log.level === 'warn' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`} />
                  <span className="text-[10px] font-mono text-gray-600 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString('zh-CN')}
                  </span>
                  <span className={`text-xs rounded px-1.5 py-0.5 ${LEVEL_COLORS[log.level] || ''}`}>
                    {log.level}
                  </span>
                  <span className="text-xs text-gray-400 truncate flex-1 min-w-0">
                    {log.errorMessage || log.type || ''}
                  </span>
                  {log.duration != null && (
                    <span className="text-[10px] font-mono text-gray-600 shrink-0">{log.duration}ms</span>
                  )}
                  {log.statusCode && (
                    <span className={`text-[10px] font-mono shrink-0 ${
                      log.statusCode < 300 ? 'text-green-500' :
                      log.statusCode < 400 ? 'text-yellow-500' : 'text-red-500'
                    }`}>
                      {log.statusCode}
                    </span>
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 py-3 border-t border-[#2a2a4a] space-y-2 text-xs">
                    {log.url && (
                      <div>
                        <span className="text-gray-600">URL: </span>
                        <span className="text-gray-400 break-all">{log.url}</span>
                      </div>
                    )}
                    {log.requestHeaders && (
                      <div>
                        <span className="text-gray-600">请求头: </span>
                        <pre className="text-gray-500 mt-1 bg-[#0f0f1a] p-2 rounded text-[10px] overflow-x-auto max-h-32">
                          {formatJson(log.requestHeaders)}
                        </pre>
                      </div>
                    )}
                    {log.responseHeaders && (
                      <div>
                        <span className="text-gray-600">响应头: </span>
                        <pre className="text-gray-500 mt-1 bg-[#0f0f1a] p-2 rounded text-[10px] overflow-x-auto max-h-32">
                          {formatJson(log.responseHeaders)}
                        </pre>
                      </div>
                    )}
                    {log.statusCode && (
                      <div>
                        <span className="text-gray-600">状态码: </span>
                        <span className={log.statusCode < 300 ? 'text-green-400' : 'text-red-400'}>
                          {log.statusCode}
                        </span>
                      </div>
                    )}
                    {log.duration != null && (
                      <div>
                        <span className="text-gray-600">耗时: </span>
                        <span className="text-gray-400">{log.duration}ms</span>
                      </div>
                    )}
                    {log.productId && (
                      <div>
                        <span className="text-gray-600">商品ID: </span>
                        <span className="text-gray-400">{log.productId}</span>
                      </div>
                    )}
                    {log.accountId && (
                      <div>
                        <span className="text-gray-600">账号ID: </span>
                        <span className="text-gray-400">{log.accountId}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatJson(str) {
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}
