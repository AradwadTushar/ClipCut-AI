import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Sparkles,
  Bot,
  Copy,
  Check,
  ArrowRight,
  Terminal,
} from 'lucide-react'

import { formatDuration } from '../api'
import { useJobStream } from '../useJobStream'

const STAGES = [
  { key: 'prepare', label: 'Audio Ingest', desc: 'Demuxing audio & video streams' },
  { key: 'transcribe', label: 'Whisper AI', desc: 'Word-level timestamp extraction' },
  { key: 'highlights', label: 'Director Planning', desc: 'Detecting viral hooks & story beats' },
  { key: 'reframe', label: 'Face Tracking', desc: 'Active speaker tracking & vertical framing' },
  { key: 'captions', label: 'Hormozi Captions', desc: 'Generating animated subtitle timings' },
  { key: 'export', label: 'FFmpeg Render', desc: 'Burning captions & neural voiceover' },
] as const

export function JobProgress() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { job, progress } = useJobStream(jobId)

  const [copiedId, setCopiedId] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  // Redirect to review clips once job reaches done
  useEffect(() => {
    if (job?.status === 'done') {
      const timer = setTimeout(() => navigate(`/jobs/${job.id}/clips`), 1000)
      return () => clearTimeout(timer)
    }
  }, [job?.status, job?.id, navigate])

  if (!job) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
        <p className="mt-4 text-xs font-semibold text-ink-600">Connecting to job event stream...</p>
      </div>
    )
  }

  const activeIndex = STAGES.findIndex((s) => s.key === job.current_stage)
  const percent = Math.round((progress?.overall ?? job.progress) * 100)

  const claudePrompt = `Connect to ClipCut MCP for job "${job.id}".
1. Call get_transcript("${job.id}") to read the complete word-level transcript.
2. Call generate_script_options("${job.id}") to review 3 creative angles (Viral Hype, Numbers/Shock, and Story Arc).
3. Once I pick or refine the script, render the B-roll short using create_broll_summary_short.
4. Call get_job_exports("${job.id}") to verify the output.`

  const copyJobId = () => {
    navigator.clipboard.writeText(job.id)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  const copyPromptText = () => {
    navigator.clipboard.writeText(claudePrompt)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2000)
  }

  return (
    <div className="mx-auto max-w-4xl py-10 space-y-10">
      {/* Top Status Bar */}
      <div className="rounded-3xl border border-canvas-300 bg-white p-8 shadow-sm space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
              <span className="h-2 w-2 rounded-full bg-purple-600 animate-pulse" />
              <span className="capitalize">{job.status}</span>
              <span>•</span>
              <span className="font-mono text-[11px]">{job.id.slice(0, 10)}</span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold text-ink-950 sm:text-3xl max-w-2xl truncate">
              {job.source?.title || 'Processing Video'}
            </h1>
            {job.source && (
              <p className="mt-1 text-xs text-ink-500">
                Duration: {formatDuration(job.source.duration_s)} • {job.source.width}×{job.source.height} • Engine: {job.provider}
              </p>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black text-purple-700">{percent}</span>
            <span className="text-xl font-bold text-ink-400">%</span>
          </div>
        </div>

        {/* Big Progress Bar */}
        <div className="h-3 w-full overflow-hidden rounded-full bg-canvas-200">
          <div
            className="h-full bg-gradient-to-r from-purple-700 to-pink-600 transition-all duration-300 purple-glow"
            style={{ width: `${Math.max(4, percent)}%` }}
          />
        </div>

        {/* 6 Stage Timeline */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 pt-2">
          {STAGES.map((s, idx) => {
            const isDone = activeIndex > idx || job.status === 'done'
            const isCurrent = activeIndex === idx && job.status === 'running'
            return (
              <div
                key={s.key}
                className={`rounded-2xl border p-3 text-center transition-all ${
                  isDone
                    ? 'border-emerald-300 bg-emerald-50/50 text-emerald-900'
                    : isCurrent
                      ? 'border-purple-600 bg-purple-50 text-purple-900 shadow-sm ring-1 ring-purple-600'
                      : 'border-canvas-200 bg-canvas-100/50 text-ink-400 opacity-60'
                }`}
              >
                <div className="text-[11px] font-bold uppercase tracking-wider">{s.label}</div>
                <div className="mt-1 text-[10px] text-ink-600 leading-tight truncate">{s.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ---------------- The Director Fork Modal / Card ---------------- */}
      <div className="rounded-3xl border-2 border-purple-200 bg-gradient-to-br from-purple-50/80 via-white to-canvas-100 p-8 shadow-md space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">
              <Bot className="h-3.5 w-3.5" />
              <span>Creative Director Options</span>
            </div>
            <h3 className="text-xl font-bold text-ink-950">How would you like to direct this video?</h3>
            <p className="text-xs text-ink-600">
              You can let Gemini build the scripts autonomously, or take full creative control in Claude Desktop via MCP.
            </p>
          </div>

          <button
            onClick={() => navigate(`/jobs/${job.id}/clips`)}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-canvas-300 bg-white px-4 py-2 text-xs font-semibold text-ink-800 shadow-sm hover:bg-canvas-100"
          >
            <span>Skip to Review Studio</span>
            <ArrowRight className="h-3.5 w-3.5 text-purple-700" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Option A: Gemini Autonomous */}
          <div className="rounded-2xl border border-canvas-300 bg-white p-6 shadow-sm flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-purple-700 font-bold text-sm">
                <Sparkles className="h-4 w-4" />
                <span>Option A: Gemini Autonomous</span>
              </div>
              <p className="text-xs text-ink-600 leading-relaxed">
                Gemini will automatically analyze the transcript, formulate 3 high-retention script angles,
                pick the best viral cut, and render the vertical Short directly inside this window.
              </p>
            </div>
            <div className="pt-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                Running in background automatically
              </span>
            </div>
          </div>

          {/* Option B: Claude Desktop via MCP */}
          <div className="rounded-2xl border-2 border-purple-500 bg-white p-6 shadow-sm flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-purple-800 font-bold text-sm">
                  <Terminal className="h-4 w-4" />
                  <span>Option B: Claude Desktop (MCP)</span>
                </div>
                <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-700 uppercase">
                  Pro Control
                </span>
              </div>
              <p className="text-xs text-ink-600 leading-relaxed">
                Open Claude Desktop, paste the prompt below, and collaborate with Claude to write,
                critique, and render your video. Any renders Claude triggers show up here live!
              </p>

              {/* Copy Job ID Row */}
              <div className="flex items-center justify-between rounded-xl border border-canvas-200 bg-canvas-100 px-3 py-2">
                <span className="text-xs text-ink-500 font-mono">Job ID: {job.id}</span>
                <button
                  type="button"
                  onClick={copyJobId}
                  className="flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-900"
                >
                  {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedId ? 'Copied' : 'Copy ID'}</span>
                </button>
              </div>

              {/* Copy Claude Prompt Row */}
              <button
                type="button"
                onClick={copyPromptText}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-700 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-purple-800 transition-colors"
              >
                {copiedPrompt ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
                <span>{copiedPrompt ? 'Prompt Copied to Clipboard!' : 'Copy Prompt for Claude Desktop'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
