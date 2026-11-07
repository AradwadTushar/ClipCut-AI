import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Film,
  ArrowRight,
  RefreshCw,
  Video,
} from 'lucide-react'
import { type Job, formatDuration } from '../api'

export function History() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  const loadJobs = () => {
    setLoading(true)
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((data) => {
        setJobs(Array.isArray(data) ? data : [])
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadJobs()
  }, [])

  return (
    <div className="space-y-8 py-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
            <Film className="h-3.5 w-3.5" />
            <span>Project Archives</span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold text-ink-950">Job History & Vault</h1>
          <p className="text-sm text-ink-600">
            Browse all past ingestion sessions, generated pipelines, scripts, and exported vertical clips.
          </p>
        </div>

        <button
          onClick={loadJobs}
          className="inline-flex items-center gap-2 rounded-xl border border-canvas-300 bg-white px-4 py-2.5 text-xs font-semibold text-ink-800 shadow-sm hover:bg-canvas-100"
        >
          <RefreshCw className={`h-4 w-4 text-purple-700 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh History</span>
        </button>
      </div>

      <div className="rounded-3xl border border-canvas-300 bg-white p-6 sm:p-8 shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm text-ink-500">Loading archived sessions...</div>
        ) : jobs.length === 0 ? (
          <div className="py-16 text-center">
            <Video className="mx-auto h-12 w-12 text-ink-400" />
            <h3 className="mt-4 text-base font-bold text-ink-950">No Sessions Found</h3>
            <p className="mt-1 text-xs text-ink-600">
              Launch your first pipeline from the home page to start clipping videos.
            </p>
            <Link
              to="/create"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-purple-700 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-purple-800"
            >
              <span>Create New Clip</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-canvas-200 text-ink-500">
                  <th className="pb-3 font-semibold uppercase tracking-wider">Video Title</th>
                  <th className="pb-3 font-semibold uppercase tracking-wider">Job ID</th>
                  <th className="pb-3 font-semibold uppercase tracking-wider">Duration</th>
                  <th className="pb-3 font-semibold uppercase tracking-wider">Engine</th>
                  <th className="pb-3 font-semibold uppercase tracking-wider">Status</th>
                  <th className="pb-3 font-semibold uppercase tracking-wider">Created</th>
                  <th className="pb-3 font-semibold uppercase tracking-wider text-right">Studio Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-canvas-200 text-ink-800">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-canvas-100/60">
                    <td className="py-4 font-semibold text-ink-950 max-w-xs truncate">
                      {j.source?.title || 'Untitled Video'}
                    </td>
                    <td className="py-4 font-mono text-[11px] text-purple-700">
                      {j.id.slice(0, 12)}...
                    </td>
                    <td className="py-4 text-ink-600">
                      {j.source ? formatDuration(j.source.duration_s) : '—'}
                    </td>
                    <td className="py-4">
                      <span className="inline-flex rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-800 border border-purple-200">
                        {j.provider || 'gemini'}
                      </span>
                    </td>
                    <td className="py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          j.status === 'done'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : j.status === 'failed'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="py-4 text-ink-500 font-mono text-[11px]">
                      {new Date(j.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-4 text-right">
                      <Link
                        to={`/jobs/${j.id}/clips`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-100 px-3 py-1.5 text-xs font-semibold text-purple-800 hover:bg-purple-200 transition-colors"
                      >
                        <span>Open Studio</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

