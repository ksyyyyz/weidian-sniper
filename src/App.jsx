import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import Monitor from './pages/Monitor'
import Products from './pages/Products'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import Accounts from './pages/Accounts'

const tabs = [
  { path: '/', label: '监控', icon: '◉' },
  { path: '/products', label: '商品', icon: '⊞' },
  { path: '/logs', label: '日志', icon: '☰' },
  { path: '/settings', label: '设置', icon: '⚙' },
  { path: '/accounts', label: '账号', icon: '👤' },
]

function TabBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const current = location.pathname === '/' ? '/' : '/' + location.pathname.split('/')[1]

  return (
    <nav className="shrink-0 bg-[#1a1a2e] border-t border-[#2a2a4a] tab-safe z-50">
      <div className="flex justify-around items-center h-14 max-w-lg mx-auto">
        {tabs.map(tab => (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
              current === tab.path ? 'text-purple-400' : 'text-gray-500'
            }`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span className="text-[10px] mt-0.5">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

function AppContent() {
  const [showInstall, setShowInstall] = useState(false)

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || navigator.standalone
    if (!isStandalone && !localStorage.getItem('install-dismissed')) {
      setShowInstall(true)
    }
  }, [])

  return (
    <div className="flex-1 min-h-0 flex flex-col max-w-lg mx-auto w-full">
      <header className="safe-top px-4 py-3 flex items-center justify-between border-b border-[#2a2a4a] shrink-0">
        <h1 className="text-base font-semibold text-white tracking-wide">微店抢购助手</h1>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/25">
          v3
        </span>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto ios-scroll px-4">
        <Routes>
          <Route path="/" element={<Monitor />} />
          <Route path="/products" element={<Products />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/accounts" element={<Accounts />} />
        </Routes>
      </main>

      <TabBar />

      {showInstall && (
        <div className="fixed top-12 left-4 right-4 bg-[#1e1e3a] border border-purple-500/30 rounded-xl p-4 shadow-lg z-50 max-w-sm mx-auto">
          <p className="text-sm text-gray-300 mb-3">
            添加到主屏幕，体验更流畅的全屏模式
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowInstall(false); localStorage.setItem('install-dismissed', '1') }}
              className="flex-1 py-2 px-4 rounded-lg bg-purple-600 text-white text-sm font-medium"
            >
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  )
}
