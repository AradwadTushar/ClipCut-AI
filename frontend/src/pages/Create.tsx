import { useCallback, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Scissors,
  Flame,
  Sparkles,
  Upload,
  Link2,
  Sliders,
  ArrowRight,
  AlertCircle,
  ChevronDown,
} from 'lucide-react'

import {
  api,
  type JobSettingsOverrides,
} from '../api'

export function Create() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialPipeline = searchParams.get('pipeline') || 'story_recap'

  const [pipeline, setPipeline] = useState<string>(initialPipeline)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<'url' | 'file' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [targetDuration, setTargetDuration] = useState(75)
  const [captionStyle, setCaptionStyle] = useState('hormozi')
  const [voice, setVoice] = useState('energetic')
  const [dragging, setDragging] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const start = useCallback(
    async (kind: 'url' | 'file', run: () => Promise<{ id: string }>) => {
      setBusy(kind)
      setError(null)
      try {
        const source = await run()
        const overrides: JobSettingsOverrides = {
          caption_style: captionStyle,
          min_duration_s: targetDuration >= 60 ? 45 : 20,
          max_duration_s: targetDuration >= 60 ? 120 : 60,
        }
        const job = await api.createJob(source.id, overrides)
        navigate(`/jobs/${job.id}?pipeline=${pipeline}`)
      } catch (err: any) {
        setError(err?.message || 'Failed to initialize processing job.')
      } finally {
        setBusy(null)
      }
    },
    [captionStyle, navigate, pipeline, targetDuration],
  )

  const submitUrl = (event: React.FormEvent) => {
    event.preventDefault()
    if (!url.trim()) return
    void start('url', () => api.ingestYouTube(url.trim()))
  }

  const submitFile = (file: File) => void start('file', () => api.uploadSource(file))

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('video/')) {
      submitFile(file)
    } else {
      setError('Please drop a valid video file (MP4, MOV, MKV, WebM).')
    }
  }

  return (
    <div className="mx-auto max-w-4xl py-10 space-y-10">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-extrabold text-ink-950 sm:text-4xl">
          Create New Vertical Short
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          Select your target storytelling pipeline, paste a link or drop a video, and let AI do the rest.
        </p>
      </div>

      {/* 1. Pipeline Selector Tabs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setPipeline('viral_cut')}
          className={`flex items-start gap-3.5 rounded-2xl border p-4 text-left transition-all ${
            pipeline === 'viral_cut'
              ? 'border-purple-600 bg-purple-50/70 shadow-sm ring-1 ring-purple-600'
              : 'border-canvas-300 bg-white hover:border-canvas-400'
          }`}
        >
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              pipeline === 'viral_cut' ? 'bg-purple-700 text-white' : 'bg-canvas-200 text-ink-700'
            }`}
          >
            <Scissors className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-purple-700">Pipeline 1</div>
            <div className="text-sm font-bold text-ink-950">Viral Cut</div>
            <p className="mt-0.5 text-xs text-ink-500">Continuous highlights & speaker tracking</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setPipeline('story_recap')}
          className={`flex items-start gap-3.5 rounded-2xl border p-4 text-left transition-all ${
            pipeline === 'story_recap'
              ? 'border-purple-600 bg-purple-50/70 shadow-sm ring-1 ring-purple-600'
              : 'border-canvas-300 bg-white hover:border-canvas-400'
          }`}
        >
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              pipeline === 'story_recap' ? 'bg-purple-700 text-white' : 'bg-canvas-200 text-ink-700'
            }`}
          >
            <Flame className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-purple-700">Pipeline 2</div>
            <div className="text-sm font-bold text-ink-950">Story Recap</div>
            <p className="mt-0.5 text-xs text-ink-500">60–90s+ B-roll hype summary</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setPipeline('hook_injector')}
          className={`flex items-start gap-3.5 rounded-2xl border p-4 text-left transition-all ${
            pipeline === 'hook_injector'
              ? 'border-purple-600 bg-purple-50/70 shadow-sm ring-1 ring-purple-600'
              : 'border-canvas-300 bg-white hover:border-canvas-400'
          }`}
        >
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              pipeline === 'hook_injector' ? 'bg-purple-700 text-white' : 'bg-canvas-200 text-ink-700'
            }`}
          >
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-purple-700">Pipeline 3</div>
            <div className="text-sm font-bold text-ink-950">Hook Injector</div>
            <p className="mt-0.5 text-xs text-ink-500">Curiosity B-roll hook + raw highlight</p>
          </div>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Ingestion Input Card */}
      <div className="rounded-3xl border border-canvas-300 bg-white p-8 shadow-sm space-y-6">
        {/* URL Form */}
        <form onSubmit={submitUrl} className="space-y-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-ink-700">
            Paste Video URL (YouTube, Vimeo, or direct MP4)
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="absolute left-4 top-3.5 h-5 w-5 text-ink-400" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full rounded-2xl border border-canvas-300 bg-canvas-50 py-3 pl-12 pr-4 text-sm text-ink-900 focus:border-purple-600 focus:bg-white focus:outline-none"
                disabled={busy !== null}
              />
            </div>
            <button
              type="submit"
              disabled={busy !== null || !url.trim()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-purple-700 px-7 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-purple-800 disabled:bg-ink-300 purple-glow"
            >
              {busy === 'url' ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <span>Begin Pipeline</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>

        <div className="relative flex items-center justify-center py-2">
          <div className="w-full border-t border-canvas-200" />
          <span className="absolute bg-white px-3 text-xs font-semibold text-ink-400 uppercase">Or</span>
        </div>

        {/* Drag and Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInput.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
            dragging
              ? 'border-purple-600 bg-purple-50'
              : 'border-canvas-300 bg-canvas-50/50 hover:bg-canvas-100/60'
          }`}
        >
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) submitFile(file)
            }}
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
            <Upload className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-bold text-ink-900">
            Drop your raw video file here, or <span className="text-purple-700 underline">browse</span>
          </p>
          <p className="mt-1 text-xs text-ink-500">Supports MP4, MOV, MKV, WebM up to 4K resolution</p>
        </div>

        {/* Advanced Settings Accordion */}
        <div className="border-t border-canvas-200 pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-xs font-semibold text-ink-700 hover:text-purple-700"
          >
            <Sliders className="h-3.5 w-3.5 text-purple-600" />
            <span>Customize Duration & Style Defaults</span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            />
          </button>

          {showAdvanced && (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-ink-700">
                  Target Duration: <span className="text-purple-700 font-bold">{targetDuration}s</span>
                </label>
                <input
                  type="range"
                  min={30}
                  max={90}
                  step={5}
                  value={targetDuration}
                  onChange={(e) => setTargetDuration(Number(e.target.value))}
                  className="mt-2 w-full accent-purple-600"
                />
                <div className="flex justify-between text-[10px] text-ink-400">
                  <span>30s (Short)</span>
                  <span>60s–90s (Extended)</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-700">Caption Style</label>
                <select
                  value={captionStyle}
                  onChange={(e) => setCaptionStyle(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-canvas-300 bg-white px-3 py-2 text-xs text-ink-900 focus:border-purple-600 focus:outline-none"
                >
                  <option value="hormozi">Hormozi Punch (Viral Karaoke Pop)</option>
                  <option value="bold_pop">Bold Pop (High Contrast White/Yellow)</option>
                  <option value="neon_gold">Neon Gold (Electric Gaming)</option>
                  <option value="clean_lower">Clean Lower (Documentary Minimal)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-700">AI Narrator Voice</label>
                <select
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-canvas-300 bg-white px-3 py-2 text-xs text-ink-900 focus:border-purple-600 focus:outline-none"
                >
                  <option value="energetic">Energetic Male (Brian - Viral Hooks)</option>
                  <option value="narrator">Authoritative Male (Christopher - Deep Recaps)</option>
                  <option value="storyteller">Conversational Male (Andrew)</option>
                  <option value="clear_female">Crisp Professional Female (Emma)</option>
                  <option value="vibrant_female">Fast Dynamic Female (Ava)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

