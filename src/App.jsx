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

function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const current = location.pathname === '/' ? '/' : '/' + location.pathname.split('/')[1]

  return (
    <aside className="w-56 shrink-0 bg-[#1a1a2e] border-r border-[#2a2a4a] flex flex-col select-none">
      <div className="px-5 py-4 border-b border-[#2a2a4a]">
        <h1 className="text-sm font-semibold text-white tracking-wide">微店抢购助手</h1>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/25 inline-block mt-1">
          桌面版
        </span>
      </div>

      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {tabs.map(tab => (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
              current === tab.path
                ? 'bg-purple-600/20 text-purple-400'
                : 'text-gray-500 hover:text-gray-300 hover:bg-[#22223a]'
            }`}
          >
            <span className="text-lg leading-none w-6 text-center">{tab.icon}</span>
            <span className="text-sm">{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-[#2a2a4a]">
        <p className="text-[10px] text-gray-600 text-center">仅供安全测试使用</p>
      </div>
    </aside>
  )
}

function PageHeader() {
  const location = useLocation()
  const current = location.pathname === '/' ? '/' : '/' + location.pathname.split('/')[1]
  const label = tabs.find(t => t.path === current)?.label || '监控'

  return (
    <header className="px-6 py-4 flex items-center justify-between border-b border-[#2a2a4a] shrink-0">
      <h2 className="text-sm font-medium text-gray-300">{label}</h2>
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/25">
        HTTP API 模式
      </span>
    </header>
  )
}

function AppContent() {
  return (
    <div className="h-full flex">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <PageHeader />

        <div className="flex-1 px-6 py-4 max-w-4xl">
          <Routes>
            <Route path="/" element={<Monitor />} />
            <Route path="/products" element={<Products />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/accounts" element={<Accounts />} />
          </Routes>
        </div>
      </main>
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
