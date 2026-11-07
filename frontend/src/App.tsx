import { ClipCutLogo } from './components/ClipCutLogo'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import { Cpu } from 'lucide-react'

import { api, type SystemStatus, type YouTubeChannelStatus } from './api'

export function App() {
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [ytStatus, setYtStatus] = useState<YouTubeChannelStatus | null>(null)

  useEffect(() => {
    api.system().then(setSystem).catch(() => setSystem(null))
    api.getYouTubeStatus('default').then(setYtStatus).catch(() => setYtStatus(null))
  }, [])

  return (
    <div className="min-h-screen bg-canvas-100 text-ink-900 flex flex-col justify-between selection:bg-purple-200 selection:text-purple-900">
      {/* ---------------- Global Header ---------------- */}
      <header className="sticky top-0 z-40 border-b border-canvas-300 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3.5 lg:px-10">
          {/* Brand Logo */}
          <div className="flex items-center gap-8">
            <NavLink to="/" className="group">
              <ClipCutLogo size="md" />
            </NavLink>

            {/* Main Nav Links */}
            <nav className="hidden items-center gap-1 sm:flex">
              <TopLink to="/" end>
                Home
              </TopLink>
              <TopLink to="/create">Create</TopLink>
              <TopLink to="/history">History</TopLink>
              <TopLink to="/analytics">Analytics</TopLink>
              <TopLink to="/settings">Settings</TopLink>
            </nav>
          </div>

          {/* Right-Side Telemetry Badges */}
          <div className="flex items-center gap-3">
            {/* YouTube Channel Status Badge */}
            <Link
              to="/analytics"
              className="hidden items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50/80 px-3 py-1 text-xs font-semibold text-purple-800 transition-colors hover:bg-purple-100 md:inline-flex"
            >
              <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
              <span>{ytStatus?.title || 'YouTube'}:</span>
              <span className="text-purple-600">{ytStatus?.custom_url || 'Connected'}</span>
            </Link>

            {/* CUDA GPU Telemetry Badge */}
            {system && (
              <div className="hidden items-center gap-2 rounded-full border border-canvas-300 bg-canvas-50 px-3 py-1 text-xs text-ink-700 md:inline-flex">
                <Cpu className="h-3.5 w-3.5 text-emerald-600" />
                <span className="font-semibold text-ink-900">{system.accel.toUpperCase()}</span>
                {system.gpu_name && (
                  <span className="text-ink-500">
                    · {system.gpu_name.replace('NVIDIA GeForce ', '')}
                  </span>
                )}
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ---------------- Main Viewport ---------------- */}
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 pb-20 lg:px-10">
        <Outlet />
      </main>

      {/* ---------------- Footer with Core Attribution ---------------- */}
      <footer className="border-t border-canvas-300 bg-white py-8 text-xs text-ink-600">
        <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-4 px-6 sm:flex-row lg:px-10">
          <div className="flex items-center gap-2 text-ink-700">
            <span className="font-bold text-ink-900">ClipCut Studio</span>
            <span>•</span>
            <span>Autonomous Multi-Pipeline Video Clipping</span>
          </div>

          <div className="flex items-center gap-4 text-ink-500">
            <span>
              Engineered with{' '}
              <a
                href="https://github.com/autoclip"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-purple-700 hover:underline"
              >
                AutoClip Core
              </a>
            </span>
            <span>•</span>
            <Link to="/analytics" className="hover:text-purple-700">
              YouTube Sync
            </Link>
            <span>•</span>
            <Link to="/settings" className="hover:text-purple-700">
              Settings
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function TopLink({
  to,
  end,
  children,
}: {
  to: string
  end?: boolean
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-150',
          isActive
            ? 'bg-purple-100 text-purple-800'
            : 'text-ink-600 hover:bg-canvas-100 hover:text-ink-950',
        ].join(' ')
      }
    >
      {children}
    </NavLink>
  )
}
