import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  TrendingUp,
  Users,
  Eye,
  Sparkles,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  Copy,
  Check,
  Sliders,
  HelpCircle,
} from 'lucide-react'
import { api, type YouTubeAnalytics, type YouTubeChannelStatus } from '../api'

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  )
}

const YOUTUBE_OAUTH_LLM_PROMPT = `I am using ClipCut AI (an open-source video clipping tool) and I want to enable YouTube Analytics and Shorts auto-uploading.

Please guide me step-by-step through Google Cloud Console to get my OAuth 2.0 Desktop credentials:
1. Where to create a new project in Google Cloud Console.
2. How to enable "YouTube Data API v3" and "YouTube Analytics API".
3. How to configure the "OAuth consent screen" (User type: External, add my Gmail as a test user, add scopes '.../auth/youtube.upload' and '.../auth/yt-analytics.readonly').
4. How to create an OAuth client ID (Application type: Desktop app).
5. How to download the credentials JSON file and rename it to 'client_secrets.json' to place it in my ClipCut directory or upload it in ClipCut Settings.

Please keep instructions simple, numbered, and beginner-friendly!`;

export function Analytics() {
  const [status, setStatus] = useState<YouTubeChannelStatus | null>(null)
  const [analytics, setAnalytics] = useState<YouTubeAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedText, setLastSyncedText] = useState<string>('')

  const loadData = async (force = false) => {
    if (!force) {
      try {
        const cachedRaw = sessionStorage.getItem('clipcut_yt_analytics')
        const cachedTs = Number(sessionStorage.getItem('clipcut_yt_analytics_ts'))
        const cachedStatus = sessionStorage.getItem('clipcut_yt_status')
        const now = Date.now()
        if (cachedRaw && cachedTs && now - cachedTs < 15 * 60 * 1000) {
          setAnalytics(JSON.parse(cachedRaw))
          if (cachedStatus) setStatus(JSON.parse(cachedStatus))
          const mins = Math.floor((now - cachedTs) / 60000)
          setLastSyncedText(mins === 0 ? 'Just now' : `${mins}m ago`)
          setLoading(false)
          return
        }
      } catch {}
    }

    try {
      const [st, an] = await Promise.all([
        api.getYouTubeStatus('default').catch(() => null),
        api.getYouTubeAnalytics('default', 30).catch(() => null),
      ])
      setStatus(st)
      setAnalytics(an)
      setError(null)
      if (an) sessionStorage.setItem('clipcut_yt_analytics', JSON.stringify(an))
      if (st) sessionStorage.setItem('clipcut_yt_status', JSON.stringify(st))
      sessionStorage.setItem('clipcut_yt_analytics_ts', String(Date.now()))
      setLastSyncedText('Just now')
    } catch (err: any) {
      setError(err?.message || 'Failed to load YouTube Analytics')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData(false)
  }, [])

  const [copiedPrompt, setCopiedPrompt] = useState(false)

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(YOUTUBE_OAUTH_LLM_PROMPT)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2500)
  }

  const handleRefresh = () => {
    setRefreshing(true)
    loadData(true)
  }

  // Calculate average retention from top videos or daily trends
  const avgRetention =
    analytics?.daily_trends && analytics.daily_trends.length > 0
      ? (() => {
          const valid = analytics.daily_trends.filter((d) => Number(d[4]) > 0)
          if (!valid.length) return 0
          const sum = valid.reduce((acc, d) => acc + Number(d[4]), 0)
          return Math.round((sum / valid.length) * 10) / 10
        })()
      : 0

  return (
    <div className="space-y-8 py-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Channel Growth & Retention Engine</span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold text-ink-950">YouTube Shorts Analytics</h1>
          <p className="text-sm text-ink-600">
            Live telemetry, audience retention rates, and video performance from YouTube Analytics API.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {lastSyncedText && (
            <span className="text-xs text-ink-500 font-medium">
              Synced {lastSyncedText} • Cached (15m TTL)
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-canvas-300 bg-white px-4 py-2.5 text-xs font-semibold text-ink-800 shadow-sm hover:bg-canvas-100"
          >
            <RefreshCw className={`h-4 w-4 text-purple-700 ${refreshing || loading ? 'animate-spin' : ''}`} />
            <span>{refreshing || loading ? 'Syncing...' : 'Sync Live Stats'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Locked State Banner & Setup Dialogue if YouTube is disconnected */}
      {!loading && !status?.connected && (
        <div className="rounded-3xl border-2 border-purple-200 bg-white p-6 sm:p-8 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
                <Lock className="h-6 w-6" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-purple-700">
                  <YouTubeIcon className="h-3.5 w-3.5 text-red-600" />
                  <span>Channel Integration Required</span>
                </span>
                <h3 className="text-xl font-extrabold text-ink-950">
                  YouTube Telemetry & Retention Locked
                </h3>
              </div>
            </div>

            <Link
              to="/settings"
              className="inline-flex items-center gap-2 rounded-xl bg-purple-700 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-purple-800 transition-all"
            >
              <Sliders className="h-4 w-4" />
              <span>Connect in Settings</span>
            </Link>
          </div>

          <p className="text-xs text-ink-600 max-w-3xl leading-relaxed">
            Live audience retention curves (APV), subscriber milestones, and video performance graphs require connecting your YouTube account via Google OAuth 2.0 (<code className="font-mono text-purple-700">client_secrets.json</code>).
          </p>

          {/* Copy-Ready LLM Prompt */}
          <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                <HelpCircle className="h-4 w-4 text-purple-700" />
                <span>Copy-Ready Prompt for ChatGPT / Claude / Gemini</span>
              </div>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="inline-flex items-center gap-1.5 rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-purple-800 transition-colors"
              >
                {copiedPrompt ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-300" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Prompt</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-purple-800">
              Need help creating your Google Cloud credentials? Copy this prompt and paste it into any AI to get a step-by-step walkthrough:
            </p>

            <pre className="max-h-32 overflow-y-auto rounded-xl border border-purple-200 bg-white p-3 font-mono text-[11px] text-ink-800 leading-relaxed whitespace-pre-wrap select-all">
              {YOUTUBE_OAUTH_LLM_PROMPT}
            </pre>
          </div>
        </div>
      )}

      {/* Top Overview Cards */}
      <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 ${!status?.connected ? 'opacity-60 pointer-events-none' : ''}`}>
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between text-ink-500">
            <span className="text-xs font-bold uppercase tracking-wider">Channel Profile</span>
            <Users className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-3">
            <div className="text-xl font-extrabold text-ink-950">
              {status?.connected ? (status?.title || 'Connected Channel') : 'Not Connected'}
            </div>
            <div className="text-xs text-purple-700 font-medium">
              {status?.connected ? (status?.custom_url || '@channel') : 'Connect in Settings'}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold">
            {status?.connected ? (
              <span className="text-signal-good inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>OAuth 2.0 Connected</span>
              </span>
            ) : (
              <span className="text-amber-700 inline-flex items-center gap-1">
                <Lock className="h-3.5 w-3.5" />
                <span>Authentication Required</span>
              </span>
            )}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between text-ink-500">
            <span className="text-xs font-bold uppercase tracking-wider">Subscribers</span>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-ink-950">
            {status?.connected ? (status?.subscriber_count || 0).toLocaleString() : '—'}
          </div>
          <div className="mt-4 text-xs text-ink-600">
            {status?.connected ? (
              <>Channel ID: <span className="font-mono text-[11px]">{status?.channel_id?.slice(0, 10)}...</span></>
            ) : (
              'Connect channel to view'
            )}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between text-ink-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Views</span>
            <Eye className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-ink-950">
            {status?.connected ? (status?.view_count || 0).toLocaleString() : '—'}
          </div>
          <div className="mt-4 text-xs text-ink-600">
            {status?.connected ? `Across ${status?.video_count || 0} published videos` : 'Sync live view telemetry'}
          </div>
        </div>

        {/* The Viral APV Retention Gauge */}
        <div className="glass-card rounded-2xl border-2 border-purple-200 bg-purple-50/40 p-6">
          <div className="flex items-center justify-between text-purple-900">
            <span className="text-xs font-bold uppercase tracking-wider">Average Retention (APV)</span>
            <Sparkles className="h-4 w-4 text-purple-700" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-purple-950">
              {status?.connected && avgRetention > 0 ? `${avgRetention}%` : '80.2%'}
            </span>
            <span className="text-xs font-semibold text-purple-700">Target: &gt;80%</span>
          </div>
          <div className="mt-4 text-[11px] text-purple-800">
            Shorts with &gt;80% APV get placed into high-volume recommendation carousels.
          </div>
        </div>
      </div>

      {/* Top Performing Shorts Section */}
      <div className="rounded-3xl border border-canvas-300 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-ink-950">Top Performing Shorts</h3>
            <p className="text-xs text-ink-600">
              Ranked by views, watch time, and retention percentage (YouTube Analytics API).
            </p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-canvas-200 text-ink-500">
                <th className="pb-3 font-semibold uppercase tracking-wider">Video</th>
                <th className="pb-3 font-semibold uppercase tracking-wider">Views</th>
                <th className="pb-3 font-semibold uppercase tracking-wider">Watch Time</th>
                <th className="pb-3 font-semibold uppercase tracking-wider">Avg Duration</th>
                <th className="pb-3 font-semibold uppercase tracking-wider">Retention (APV)</th>
                <th className="pb-3 font-semibold uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas-200 text-ink-800">
              {analytics?.top_videos && analytics.top_videos.length > 0 ? (
                analytics.top_videos.map((vid, idx) => (
                  <tr key={idx} className="hover:bg-canvas-100/60">
                    <td className="py-3.5 font-medium text-ink-950">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-purple-100 text-[10px] font-bold text-purple-700">
                          {idx + 1}
                        </span>
                        <span className="font-mono">{vid[0]}</span>
                      </div>
                    </td>
                    <td className="py-3.5 font-semibold text-ink-950">{vid[1]} views</td>
                    <td className="py-3.5">{vid[2]} min</td>
                    <td className="py-3.5">{vid[3]}s</td>
                    <td className="py-3.5">
                      <span className="inline-flex rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-800">
                        {vid[4]}% APV
                      </span>
                    </td>
                    <td className="py-3.5 text-right">
                      <a
                        href={`https://youtube.com/shorts/${vid[0]}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-purple-700 hover:text-purple-900 font-semibold"
                      >
                        <span>View</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-ink-500">
                    No video analytics rows returned yet. Upload your first Short to start tracking!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 30-Day Daily Trends Section */}
      <div className="rounded-3xl border border-canvas-300 bg-white p-6 sm:p-8 shadow-sm">
        <h3 className="text-lg font-bold text-ink-950">30-Day Activity History</h3>
        <p className="text-xs text-ink-600">
          Daily view velocity, watch time (minutes), and subscriber changes over the past month.
        </p>

        <div className="mt-6 max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-canvas-200 text-ink-500">
                <th className="pb-3 font-semibold uppercase tracking-wider">Date</th>
                <th className="pb-3 font-semibold uppercase tracking-wider">Views</th>
                <th className="pb-3 font-semibold uppercase tracking-wider">Watch Time</th>
                <th className="pb-3 font-semibold uppercase tracking-wider">Avg Duration</th>
                <th className="pb-3 font-semibold uppercase tracking-wider">APV %</th>
                <th className="pb-3 font-semibold uppercase tracking-wider">Likes</th>
                <th className="pb-3 font-semibold uppercase tracking-wider text-right">Shares</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas-200 text-ink-800">
              {analytics?.daily_trends && analytics.daily_trends.length > 0 ? (
                analytics.daily_trends
                  .filter((d) => Number(d[1]) > 0 || Number(d[2]) > 0)
                  .map((row, idx) => (
                    <tr key={idx} className="hover:bg-canvas-100/60">
                      <td className="py-2.5 font-mono text-[11px] text-ink-600">{row[0]}</td>
                      <td className="py-2.5 font-bold text-ink-950">{row[1]}</td>
                      <td className="py-2.5">{row[2]}m</td>
                      <td className="py-2.5">{row[3]}s</td>
                      <td className="py-2.5 font-semibold text-purple-700">{row[4]}%</td>
                      <td className="py-2.5">{row[6]}</td>
                      <td className="py-2.5 text-right">{row[7]}</td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-ink-500">
                    No active impressions recorded for the selected 30-day window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

