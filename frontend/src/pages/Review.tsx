import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Download,
  Upload,
  Sparkles,
  Scissors,
  Flame,
  Copy,
  Check,
  Bot,
  CheckCircle2,
  Tag,
  Sliders,
  Sparkle,
} from 'lucide-react'

import {
  api,
  formatDuration,
  type CaptionStyle,
  type Clip,
  type CropPath,
  type Job,
  type JobExport,
  type JobScript,
  type Word,
  type YouTubeChannelStatus,
  type PackageResult,
  type SystemStatus,
} from '../api'
import { CaptionEditor } from '../components/CaptionEditor'
import { SimpleVideoPlayer } from '../components/SimpleVideoPlayer'
import { TrimBar } from '../components/TrimBar'
import { YouTubeUploadModal } from '../components/YouTubeUploadModal'
import { YouTubeConnectModal } from '../components/YouTubeConnectModal'

const RATIOS = [
  { key: '9:16', label: '9:16 Vertical', sub: 'Shorts, Reels & TikTok' },
  { key: '1:1', label: '1:1 Square', sub: 'Instagram Feed' },
  { key: '16:9', label: '16:9 Widescreen', sub: 'Standard YouTube' },
] as const

const LAYOUTS = [
  { key: 'auto', label: 'Auto (Zoom)', desc: 'Active speaker tracking & smooth framing' },
  { key: 'podcast_split', label: 'Podcast Split (50/50)', desc: 'Speaker 1 top + Speaker 2 bottom' },
  { key: 'split_screen', label: 'Split-Screen (Gamer)', desc: 'Facecam top 35% + Gameplay bottom 65%' },
  { key: 'zoom_fit', label: 'Zoom Fit', desc: '1.35x zoom fill over blurred background' },
  { key: 'blur_fit', label: 'Blur Fit', desc: 'Full 16:9 frame over blurred background' },
  { key: 'face_track', label: 'Face Track', desc: 'Dynamic pan to face / speaker' },
  { key: 'centre', label: 'Centre', desc: 'Static centered crop' },
] as const

type LeftSidebarTab = 'clips' | 'exports'
type RightPanelTab = 'words' | 'pipeline2' | 'pipeline3'

export function Review() {
  const { jobId } = useParams()
  const [job, setJob] = useState<Job | null>(null)
  const [clips, setClips] = useState<Clip[]>([])
  const [exportsList, setExportsList] = useState<JobExport[]>([])
  const [scriptsList, setScriptsList] = useState<JobScript[]>([])
  const [styles, setStyles] = useState<CaptionStyle[]>([])
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [activeExportId, setActiveExportId] = useState<string | null>(null)
  const [words, setWords] = useState<Word[]>([])
  const [cropPath, setCropPath] = useState<CropPath | null>(null)
  const [wordsDirty, setWordsDirty] = useState(false)
  const [savingWords, setSavingWords] = useState(false)
  const [selectedLayout, setSelectedLayout] = useState<string>('auto')
  const [selectedRatio, setSelectedRatio] = useState<string>('9:16')
  const [selectedStyle, setSelectedStyle] = useState<string>('hormozi')

  const [leftTab, setLeftTab] = useState<LeftSidebarTab>('clips')
  const [rightTab, setRightTab] = useState<RightPanelTab>('words')
  const [error, setError] = useState<Error | null>(null)

  // YouTube Upload Modal & Fallback Connect Modal
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [exportToUpload, setExportToUpload] = useState<JobExport | null>(null)
  const [ytStatus, setYtStatus] = useState<YouTubeChannelStatus | null>(null)
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [uploadSuccessUrl, setUploadSuccessUrl] = useState<string | null>(null)

  // Claude Directing Modal
  const [showClaudeModal, setShowClaudeModal] = useState(false)
  const [copiedClaudePrompt, setCopiedClaudePrompt] = useState(false)
  const [copiedJobId, setCopiedJobId] = useState(false)
  const [copiedWords, setCopiedWords] = useState(false)

  // Pipeline 1 Export State
  const [exportingHighlight, setExportingHighlight] = useState(false)

  // Pipeline 2 (Story Recap) controls
  const [p2Instructions, setP2Instructions] = useState('')
  const [p2Duration, setP2Duration] = useState(75)
  const [p2Voice, setP2Voice] = useState('energetic')
  const [p2Feedback, setP2Feedback] = useState('')
  const [generatingScripts, setGeneratingScripts] = useState(false)
  const [iteratingScript, setIteratingScript] = useState(false)
  const [renderingBroll, setRenderingBroll] = useState(false)

  // Pipeline 3 (Hybrid) controls
  const [hybridVoice, setHybridVoice] = useState('energetic')
  const [hybridHook, setHybridHook] = useState('')
  const [hybridOutro, setHybridOutro] = useState('')
  const [renderingHybrid, setRenderingHybrid] = useState(false)

  // SEO Package controls
  const [packageResult, setPackageResult] = useState<PackageResult | null>(null)
  const [generatingSEO, setGeneratingSEO] = useState(false)

  // Load Initial Job Data
  const loadJobData = useCallback(async () => {
    if (!jobId) return
    try {
      const [j, c, s, exps, scr, yt, sys] = await Promise.all([
        api.getJob(jobId),
        api.listClips(jobId),
        api.captionStyles(),
        api.listJobExports(jobId).catch(() => []),
        api.listJobScripts(jobId).catch(() => []),
        api.getYouTubeStatus('default').catch(() => null),
        api.system().catch(() => null),
      ])
      setJob(j)
      setClips(c)
      setStyles(s)
      setExportsList(exps)
      setScriptsList(scr)
      setYtStatus(yt)
      setSystem(sys)

      if (c.length > 0 && !selectedClipId) {
        setSelectedClipId(c[0].id)
      }
      if (exps.length > 0 && !activeExportId) {
        setActiveExportId(exps[0].id)
      }
    } catch (err: any) {
      setError(err)
    }
  }, [activeExportId, jobId, selectedClipId])

  useEffect(() => {
    loadJobData()
  }, [loadJobData])

  // Periodic poll to catch any renders triggered by Claude Desktop via MCP
  useEffect(() => {
    if (!jobId) return
    const interval = setInterval(() => {
      api.listJobExports(jobId).then((newExports) => {
        setExportsList(newExports)
      }).catch(() => undefined)
    }, 4000)
    return () => clearInterval(interval)
  }, [jobId])

  const selectedClip = useMemo(
    () => clips.find((c) => c.id === selectedClipId) ?? clips[0] ?? null,
    [clips, selectedClipId],
  )

  const activeExport = useMemo(
    () => exportsList.find((e) => e.id === activeExportId) ?? exportsList[0] ?? null,
    [activeExportId, exportsList],
  )

  // Load words & crop path when selected clip changes
  useEffect(() => {
    if (!selectedClip) return
    let active = true

    api.getClipWords(selectedClip.id)
      .then((resWords) => {
        if (active) {
          setWords(resWords)
          setWordsDirty(false)
        }
      })
      .catch(() => undefined)

    api.getCropPath(selectedClip.id)
      .then((cp) => {
        if (active) setCropPath(cp)
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [selectedClip?.id])

  // Save edited words
  const handleSaveWords = async () => {
    if (!selectedClip || !wordsDirty) return
    setSavingWords(true)
    try {
      await api.patchCaptions(selectedClip.id, { words })
      setWordsDirty(false)
    } catch (err: any) {
      alert(`Save words error: ${err?.message || err}`)
    } finally {
      setSavingWords(false)
    }
  }

  // Handle Trim Commit
  const handleTrimCommit = async (newStart: number, newEnd: number) => {
    if (!selectedClip) return
    try {
      const updated = await api.patchClip(selectedClip.id, {
        start_s: newStart,
        end_s: newEnd,
      })
      setClips((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    } catch (err: any) {
      alert(`Trim update error: ${err?.message || err}`)
    }
  }

  // Trigger YouTube Modal (or fallback connect dialog if disconnected)
  const openUploadModal = (exp?: JobExport) => {
    const target = exp || activeExport || exportsList[0]
    if (target) {
      setExportToUpload(target)
      if (!ytStatus?.connected) {
        setShowConnectModal(true)
      } else {
        setShowUploadModal(true)
      }
    }
  }

  // Render Pipeline 1 Highlight Clip
  const handleExportHighlight = async () => {
    if (!selectedClip) return
    setExportingHighlight(true)
    try {
      await api.exportClip(selectedClip.id, selectedRatio, selectedStyle, false, selectedLayout)
      const updatedExps = await api.listJobExports(jobId!)
      setExportsList(updatedExps)
      if (updatedExps.length > 0) {
        setActiveExportId(updatedExps[0].id)
        setLeftTab('exports')
      }
    } catch (err: any) {
      alert(`Export highlight error: ${err?.message || err}`)
    } finally {
      setExportingHighlight(false)
    }
  }

  // Generate 3 Script Angles for Pipeline 2
  const handleGenerateScripts = async () => {
    if (!jobId) return
    setGeneratingScripts(true)
    try {
      await api.generateJobScripts(jobId, p2Instructions, p2Duration, 3)
      const updated = await api.listJobScripts(jobId)
      setScriptsList(updated)
      setRightTab('pipeline2')
    } catch (err: any) {
      alert(`Script generation error: ${err?.message || err}`)
    } finally {
      setGeneratingScripts(false)
    }
  }

  // Iterate Script with user critique
  const handleIterateScript = async () => {
    if (!jobId || !scriptsList[0]) return
    setIteratingScript(true)
    try {
      await api.iterateJobScript(jobId, {
        previous_script_id: scriptsList[0].id,
        feedback: p2Feedback || 'Improve pacing and make intro hook punchier',
        target_duration: p2Duration,
      })
      const updated = await api.listJobScripts(jobId)
      setScriptsList(updated)
      setP2Feedback('')
    } catch (err: any) {
      alert(`Script iteration error: ${err?.message || err}`)
    } finally {
      setIteratingScript(false)
    }
  }

  // Render Pipeline 2 B-Roll Short
  const handleRenderBroll = async (scriptData?: any) => {
    if (!jobId) return
    setRenderingBroll(true)
    try {
      const res = await api.summarizeJob(jobId, {
        instructions: p2Instructions,
        target_duration: p2Duration,
        voice: p2Voice,
        ambient_volume: 0.0, // 100% clean studio voiceover, zero bleed
        caption_style: selectedStyle,
        ratio: selectedRatio,
        custom_script: scriptData,
      })
      const updatedExps = await api.listJobExports(jobId)
      setExportsList(updatedExps)
      setActiveExportId(res.export_id)
      setLeftTab('exports')
    } catch (err: any) {
      alert(`Render failed: ${err?.message || err}`)
    } finally {
      setRenderingBroll(false)
    }
  }

  // Render Pipeline 3 Hybrid Short
  const handleRenderHybrid = async () => {
    if (!selectedClip) return
    setRenderingHybrid(true)
    try {
      const res = await api.renderHybrid(selectedClip.id, {
        hook_text: hybridHook || undefined,
        outro_text: hybridOutro || undefined,
        voice: hybridVoice,
        style: selectedStyle,
        ratio: selectedRatio,
        layout: selectedLayout,
        hook_mode: 'prepend_broll',
        hook_duck_volume: 0.0,
      })
      const updatedExps = await api.listJobExports(jobId!)
      setExportsList(updatedExps)
      setActiveExportId(res.export_id)
      setLeftTab('exports')
    } catch (err: any) {
      alert(`Hybrid render failed: ${err?.message || err}`)
    } finally {
      setRenderingHybrid(false)
    }
  }

  // Generate SEO Kit
  const handleGenerateSEO = async () => {
    if (!selectedClip) return
    setGeneratingSEO(true)
    try {
      const res = await api.packageClip(selectedClip.id)
      setPackageResult(res)
    } catch (err: any) {
      alert(`SEO packaging error: ${err?.message || err}`)
    } finally {
      setGeneratingSEO(false)
    }
  }

  const copyTranscriptWords = () => {
    const fullText = words.map((w) => w.text).join(' ')
    navigator.clipboard.writeText(fullText)
    setCopiedWords(true)
    setTimeout(() => setCopiedWords(false), 2000)
  }

  const claudePrompt = `Connect to ClipCut MCP for job "${jobId}".
1. Call get_transcript("${jobId}") to read timestamped dialogue.
2. Call generate_script_options("${jobId}") to review 3 creative angles (Viral Hype, Numbers/Shock, Story Arc).
3. Once I approve the script, call create_broll_summary_short to render the vertical Short.
4. Call get_job_exports("${jobId}") to inspect finished videos.`

  return (
    <div className="space-y-6 py-6">
      {/* ---------------- Top Studio Command Bar ---------------- */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-canvas-300 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link to="/history" className="text-xs font-semibold text-purple-700 hover:underline">
              ← Job Archives
            </Link>
            <span className="text-ink-300">•</span>
            <span className="font-mono text-xs text-ink-500">ID: {jobId}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(jobId || '')
                setCopiedJobId(true)
                setTimeout(() => setCopiedJobId(false), 2000)
              }}
              className="inline-flex items-center gap-1 rounded bg-canvas-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-600 hover:bg-canvas-200"
            >
              {copiedJobId ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              <span>{copiedJobId ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <h1 className="text-2xl font-black text-ink-950 truncate max-w-2xl">
            {job?.source?.title || 'Video Review Studio'}
          </h1>
          <p className="text-xs text-ink-500">
            {exportsList.length} rendered videos • {clips.length} candidate highlights •{' '}
            {job?.source ? formatDuration(job.source.duration_s) : ''}
          </p>
        </div>

        {/* Top Studio Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Claude MCP Prompt Button - only show if Claude Desktop MCP is connected */}
          {system?.claude_mcp_connected && (
            <button
              onClick={() => setShowClaudeModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-xs font-bold text-purple-800 hover:bg-purple-100 transition-colors"
            >
              <Bot className="h-4 w-4 text-purple-700" />
              <span>Direct with Claude MCP</span>
            </button>
          )}

          {/* Quick Upload Button */}
          <button
            onClick={() => openUploadModal()}
            title={
              ytStatus?.connected
                ? 'Publish directly to YouTube channel'
                : 'YouTube account not connected. Click for setup guide & instant MP4 download'
            }
            className="inline-flex items-center gap-2 rounded-xl bg-purple-700 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-purple-800 purple-glow transition-all"
          >
            <Upload className="h-4 w-4" />
            <span>Publish Short</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <strong>Notice:</strong> {error.message || String(error)}
        </div>
      )}

      {uploadSuccessUrl && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-900 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Upload Successful!</strong> Your video is live on YouTube with original creator credits.
            </span>
          </div>
          <a
            href={uploadSuccessUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline text-emerald-800"
          >
            Open Short ↗
          </a>
        </div>
      )}

      {/* ---------------- Main Studio Layout ---------------- */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* ========================================================= */}
        {/* LEFT COLUMN: Clips & Exports Drawer (3 of 12 cols)        */}
        {/* ========================================================= */}
        <div className="xl:col-span-3">
          <div className="h-[710px] flex flex-col rounded-3xl border border-canvas-300 bg-white p-4 shadow-sm">
            {/* Drawer Switch Header */}
            <div className="flex shrink-0 rounded-2xl border border-canvas-300 bg-canvas-100 p-1 text-xs font-bold mb-3">
              <button
                type="button"
                onClick={() => setLeftTab('clips')}
                className={`flex-1 rounded-xl py-2 transition-all text-center ${
                  leftTab === 'clips'
                    ? 'bg-white text-purple-800 shadow-sm'
                    : 'text-ink-600 hover:text-ink-950'
                }`}
              >
                Highlights ({clips.length})
              </button>
              <button
                type="button"
                onClick={() => setLeftTab('exports')}
                className={`flex-1 rounded-xl py-2 transition-all text-center ${
                  leftTab === 'exports'
                    ? 'bg-white text-purple-800 shadow-sm'
                    : 'text-ink-600 hover:text-ink-950'
                }`}
              >
                Finished ({exportsList.length})
              </button>
            </div>

            {/* List 1: Candidate Highlights */}
            {leftTab === 'clips' && (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
                {clips.length === 0 ? (
                  <p className="py-8 text-center text-xs text-ink-500">No candidate clips found.</p>
                ) : (
                  clips.map((c, idx) => {
                    const isSelected = selectedClipId === c.id && !activeExportId
                    const isExported = c.status === 'exported'
                    const score = Math.round(c.score)
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedClipId(c.id)
                          setActiveExportId(null)
                          setRightTab('words')
                        }}
                        className={`group cursor-pointer rounded-2xl border p-3.5 transition-all ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50/70 shadow-sm ring-1 ring-purple-600'
                            : 'border-canvas-200 bg-canvas-50 hover:border-canvas-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Score Badge */}
                          <div
                            className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl font-mono text-xs font-extrabold shadow-sm ${
                              score >= 90
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : 'bg-canvas-200 text-ink-800'
                            }`}
                          >
                            <span className="text-[13px] leading-none">{score}</span>
                            <span className="text-[8px] uppercase tracking-wider text-ink-500">pts</span>
                          </div>

                          {/* Clip Info */}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] font-bold text-ink-500">#{idx + 1}</span>
                              <div className="flex items-center gap-1">
                                {isExported && (
                                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">
                                    Exported
                                  </span>
                                )}
                                <span className="font-mono text-[10px] text-ink-500">
                                  {formatDuration(c.duration_s)}
                                </span>
                              </div>
                            </div>
                            <h4 className="text-xs font-bold text-ink-950 line-clamp-2 leading-snug">
                              {c.title}
                            </h4>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* List 2: Finished Rendered Exports */}
            {leftTab === 'exports' && (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2.5">
                {exportsList.length === 0 ? (
                  <div className="py-8 text-center text-xs text-ink-500">
                    No videos rendered yet. Use the Story Recap or Hybrid tabs to render your first Short!
                  </div>
                ) : (
                  exportsList.map((exp) => {
                    const isSelected = activeExportId === exp.id
                    return (
                      <div
                        key={exp.id}
                        onClick={() => {
                          setActiveExportId(exp.id)
                        }}
                        className={`cursor-pointer rounded-2xl border p-3.5 transition-all ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50/70 shadow-sm ring-1 ring-purple-600'
                            : 'border-canvas-200 bg-canvas-50 hover:border-canvas-300 hover:bg-white'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="badge-purple rounded px-1.5 py-0.5 text-[9px] font-bold uppercase">
                              {exp.pipeline_type}
                            </span>
                            <span className="text-[10px] font-bold text-ink-500">
                              {exp.size_mb} MB
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-ink-950 line-clamp-2">
                            {exp.title}
                          </h4>
                          <div className="flex items-center justify-between pt-1 border-t border-canvas-200">
                            <span className="text-[10px] text-ink-500">9:16 Vertical • {exp.style}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openUploadModal(exp)
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-purple-700 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-purple-800"
                            >
                              <Upload className="h-3 w-3" />
                              <span>Upload</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* CENTER COLUMN: Simple Video Studio Player (5 of 12 cols)  */}
        {/* ========================================================= */}
        <div className="xl:col-span-5">
          <div className="h-[710px] flex flex-col justify-between rounded-3xl border border-canvas-300 bg-white p-5 shadow-sm">
            {/* Active Item Title & Badge */}
            <div className="flex shrink-0 items-center justify-between">
              <div className="min-w-0 flex-1">
                <span className="badge-purple rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  {activeExport
                    ? `Rendered • ${activeExport.pipeline_type}`
                    : `Highlight Candidate • ${selectedClip ? `Score ${Math.round(selectedClip.score)}/100` : 'Draft'}`}
                </span>
                <h3 className="mt-1 font-bold text-ink-950 truncate">
                  {activeExport ? activeExport.title : selectedClip?.title || 'Clip Preview'}
                </h3>
              </div>

              {activeExport && (
                <div className="text-right shrink-0 ml-2">
                  <div className="text-xs font-bold text-purple-700">{activeExport.size_mb} MB</div>
                  <div className="text-[10px] text-ink-400">1080x1920 • 9:16</div>
                </div>
              )}
            </div>

            {/* Simple Video Studio Player - Clean, Sleek, No Phone Bezels! */}
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center my-1">
              <SimpleVideoPlayer
                src={activeExport ? activeExport.stream_url : (job?.id ? api.mediaUrl(job.id) : '')}
                isExport={!!activeExport}
                startS={selectedClip?.start_s || 0}
                endS={selectedClip?.end_s || 0}
                words={words}
                style={styles.find((s) => s.key === selectedStyle)}
                ratio={selectedRatio}
                cropPath={cropPath}
              />
            </div>

            {/* Word-boundary Trim Bar (only visible in candidate clip preview) */}
            {!activeExport && selectedClip && (
              <div className="shrink-0 space-y-1 pt-1">
                <div className="flex items-center justify-between text-[11px] text-ink-600">
                  <span className="font-semibold">Word-Snapping Trim Bar</span>
                  <span className="font-mono">
                    {formatDuration(selectedClip.start_s)} - {formatDuration(selectedClip.end_s)} (
                    {formatDuration(selectedClip.duration_s)})
                  </span>
                </div>
                <TrimBar
                  words={words}
                  startS={selectedClip.start_s}
                  endS={selectedClip.end_s}
                  originalStart={selectedClip.start_s}
                  originalEnd={selectedClip.end_s}
                  onCommit={handleTrimCommit}
                />
              </div>
            )}

            {/* Player Bottom Quick Actions */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-canvas-200 pt-3">
              <div className="flex items-center gap-2">
                {activeExport ? (
                  <a
                    href={activeExport.download_url}
                    download
                    className="inline-flex items-center gap-1.5 rounded-xl border border-canvas-300 bg-white px-3.5 py-2 text-xs font-bold text-ink-800 shadow-sm hover:bg-canvas-100"
                  >
                    <Download className="h-3.5 w-3.5 text-purple-700" />
                    <span>Download MP4</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={exportingHighlight}
                    onClick={handleExportHighlight}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-purple-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-800 purple-glow disabled:bg-ink-300"
                  >
                    <Scissors className="h-3.5 w-3.5" />
                    <span>{exportingHighlight ? 'Exporting...' : 'Export Highlight'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => openUploadModal(activeExport || undefined)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-purple-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-800 purple-glow"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Publish Short</span>
                </button>
              </div>

              <span className="text-[11px] font-medium text-ink-500">
                {activeExport ? 'Clean Studio Audio' : 'Live Draft Preview'}
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: Director Studio: Words, P2, P3 (4 of 12)    */}
        {/* ========================================================= */}
        <div className="xl:col-span-4">
          <div className="h-[710px] flex flex-col rounded-3xl border border-canvas-300 bg-white p-5 shadow-sm">
            {/* Top Tabs: Words | P2 | P3 */}
            <div className="flex shrink-0 rounded-2xl border border-canvas-300 bg-canvas-200/80 p-1 text-xs font-bold mb-3">
              <button
                type="button"
                onClick={() => setRightTab('words')}
                className={`flex-1 rounded-xl py-2 transition-all text-center ${
                  rightTab === 'words' ? 'bg-white text-purple-800 shadow-sm' : 'text-ink-600 hover:text-ink-950'
                }`}
              >
                Words & Dialogue
              </button>
              <button
                type="button"
                onClick={() => setRightTab('pipeline2')}
                className={`flex-1 rounded-xl py-2 transition-all text-center ${
                  rightTab === 'pipeline2' ? 'bg-white text-purple-800 shadow-sm' : 'text-ink-600 hover:text-ink-950'
                }`}
              >
                Story Recap (P2)
              </button>
              <button
                type="button"
                onClick={() => setRightTab('pipeline3')}
                className={`flex-1 rounded-xl py-2 transition-all text-center ${
                  rightTab === 'pipeline3' ? 'bg-white text-purple-800 shadow-sm' : 'text-ink-600 hover:text-ink-950'
                }`}
              >
                Hybrid Hook (P3)
              </button>
            </div>

            {/* TAB 1: Words & Dialogue */}
            {rightTab === 'words' && (
              <div className="flex-1 min-h-0 flex flex-col space-y-3">
                {/* Why This Clip Hooked the AI */}
                {selectedClip?.reason && (
                  <div className="shrink-0 rounded-2xl border border-purple-200 bg-purple-50/70 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                      <Sparkles className="h-3.5 w-3.5 text-purple-700" />
                      <span>Why This Clip Hooked the AI</span>
                    </div>
                    <p className="text-xs text-purple-950 leading-relaxed line-clamp-2">
                      {selectedClip.reason}
                    </p>
                  </div>
                )}

                {/* Transcript Toolbar */}
                <div className="shrink-0 flex items-center justify-between border-b border-canvas-200 pb-2">
                  <span className="text-xs font-bold text-ink-700 uppercase tracking-wider">
                    Dialogue ({words.length} words)
                  </span>
                  <button
                    type="button"
                    onClick={copyTranscriptWords}
                    className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:underline"
                  >
                    {copiedWords ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedWords ? 'Copied' : 'Copy Words'}</span>
                  </button>
                </div>

                {/* Word-level Interactive Caption Editor */}
                <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                  <CaptionEditor
                    words={words}
                    onChange={(nextWords) => {
                      setWords(nextWords)
                      setWordsDirty(true)
                    }}
                    onSave={handleSaveWords}
                    saving={savingWords}
                    dirty={wordsDirty}
                  />
                </div>

                {wordsDirty && (
                  <button
                    type="button"
                    disabled={savingWords}
                    onClick={handleSaveWords}
                    className="shrink-0 w-full rounded-xl bg-purple-700 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-purple-800"
                  >
                    {savingWords ? 'Saving edits...' : 'Save Transcript Changes'}
                  </button>
                )}
              </div>
            )}

            {/* TAB 2: Story Recap (Pipeline 2) */}
            {rightTab === 'pipeline2' && (
              <div className="flex-1 min-h-0 flex flex-col space-y-3 overflow-y-auto pr-1">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-700 uppercase">
                    <Flame className="h-4 w-4" />
                    <span>Pipeline 2 • 60–90s+ Story Recap</span>
                  </div>
                  <h4 className="mt-1 font-bold text-ink-950">Multi-Angle Creative Script Studio</h4>
                  <p className="text-xs text-ink-500">
                    Generates 3 diverse narrative angles. Narration runs with 100% clean studio audio (zero audio bleed).
                  </p>
                </div>

                {/* Target Duration Slider */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink-700">
                    <span>Target Runtime:</span>
                    <span className="font-mono text-purple-700 font-bold">{p2Duration} seconds</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="120"
                    step="5"
                    value={p2Duration}
                    onChange={(e) => setP2Duration(Number(e.target.value))}
                    className="w-full accent-purple-700"
                  />
                </div>

                {/* Voice Style Selector */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-ink-700">Narration Voice Style</label>
                  <select
                    value={p2Voice}
                    onChange={(e) => setP2Voice(e.target.value)}
                    className="w-full rounded-xl border border-canvas-300 bg-canvas-50 px-3 py-2 text-xs text-ink-900 focus:border-purple-600 focus:outline-none"
                  >
                    <option value="energetic">Energetic (High Energy, Viral Hype)</option>
                    <option value="narrator">Narrator (Authoritative & Crisp)</option>
                    <option value="storyteller">Storyteller (Dramatic & Cinematic)</option>
                  </select>
                </div>

                {/* Instructions */}
                <div className="space-y-2">
                  <input
                    type="text"
                    value={p2Instructions}
                    onChange={(e) => setP2Instructions(e.target.value)}
                    placeholder="Focus guidance (e.g. emphasize the $1 sinking boat to $1B)..."
                    className="w-full rounded-xl border border-canvas-300 bg-canvas-50 px-3 py-2 text-xs text-ink-900 focus:border-purple-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={generatingScripts}
                    onClick={handleGenerateScripts}
                    className="w-full rounded-xl bg-purple-100 py-2.5 text-xs font-bold text-purple-800 hover:bg-purple-200 transition-colors"
                  >
                    {generatingScripts ? 'Generating 3 Angles with Gemini...' : '⚡ Generate 3 Script Angles'}
                  </button>
                </div>

                {/* Script Angles */}
                {scriptsList.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-ink-700">
                      Saved Script Options ({scriptsList.length})
                    </span>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {scriptsList.map((s, idx) => (
                        <div
                          key={s.id}
                          className="rounded-xl border border-canvas-200 bg-canvas-50 p-3 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="badge-purple rounded px-1.5 py-0.5 text-[9px] font-bold">
                              {s.angle_title || `Angle ${idx + 1}`}
                            </span>
                            <button
                              type="button"
                              disabled={renderingBroll}
                              onClick={() => handleRenderBroll(s.script)}
                              className="rounded bg-purple-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-purple-800"
                            >
                              Render This Angle
                            </button>
                          </div>
                          <p className="text-xs font-bold text-ink-950">{s.title}</p>
                          <p className="text-[11px] text-ink-600 italic">"{s.hook}"</p>
                        </div>
                      ))}
                    </div>

                    {/* Feedback Iteration */}
                    <div className="space-y-2 pt-2 border-t border-canvas-200">
                      <label className="block text-xs font-bold text-ink-700">
                        Critique & Refine Script:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={p2Feedback}
                          onChange={(e) => setP2Feedback(e.target.value)}
                          placeholder="e.g. make hook punchier, focus on helicopter beat..."
                          className="flex-1 rounded-xl border border-canvas-300 bg-canvas-50 px-3 py-1.5 text-xs text-ink-900 focus:border-purple-600 focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={iteratingScript || !p2Feedback.trim()}
                          onClick={handleIterateScript}
                          className="rounded-xl bg-purple-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-800 disabled:bg-ink-300"
                        >
                          {iteratingScript ? 'Revising...' : 'Revise'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Hybrid Hook (Pipeline 3) */}
            {rightTab === 'pipeline3' && (
              <div className="flex-1 min-h-0 flex flex-col space-y-3 overflow-y-auto pr-1">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-700 uppercase">
                    <Sparkles className="h-4 w-4" />
                    <span>Pipeline 3 • Hook Injector</span>
                  </div>
                  <h4 className="mt-1 font-bold text-ink-950">Prepend Teaser Hook to Highlight</h4>
                  <p className="text-xs text-ink-500">
                    Adds a 4–8s B-roll teaser hook while keeping 100% of raw clip audio intact.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-700">Voice Narration Style</label>
                    <select
                      value={hybridVoice}
                      onChange={(e) => setHybridVoice(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-canvas-300 bg-canvas-50 px-3 py-2 text-xs text-ink-900 focus:border-purple-600 focus:outline-none"
                    >
                      <option value="energetic">Energetic (High Energy, Viral Hype)</option>
                      <option value="narrator">Narrator (Authoritative & Crisp)</option>
                      <option value="storyteller">Storyteller (Dramatic & Cinematic)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink-700">Spoken Teaser Hook</label>
                    <input
                      type="text"
                      value={hybridHook}
                      onChange={(e) => setHybridHook(e.target.value)}
                      placeholder="Leave empty to auto-generate high-retention hook..."
                      className="mt-1 w-full rounded-xl border border-canvas-300 bg-canvas-50 px-3 py-2 text-xs text-ink-900 focus:border-purple-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink-700">Outro CTA (Optional)</label>
                    <input
                      type="text"
                      value={hybridOutro}
                      onChange={(e) => setHybridOutro(e.target.value)}
                      placeholder="e.g. Subscribe for part 2!"
                      className="mt-1 w-full rounded-xl border border-canvas-300 bg-canvas-50 px-3 py-2 text-xs text-ink-900 focus:border-purple-600 focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={renderingHybrid}
                    onClick={handleRenderHybrid}
                    className="w-full rounded-xl bg-purple-700 py-3 text-xs font-bold text-white shadow-md hover:bg-purple-800 purple-glow"
                  >
                    {renderingHybrid ? 'Rendering Hybrid Short...' : '⚡ Render Hybrid Short (Pipeline 3)'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* BOTTOM CONSOLE: Framing, Styling & YouTube Packaging Deck */}
          {/* ========================================================= */}
          <div className="rounded-3xl border border-canvas-300 bg-white p-6 shadow-sm space-y-6">
            <div className="flex flex-col gap-1 border-b border-canvas-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-purple-700" />
                  <h3 className="font-extrabold text-ink-950 text-base">Short Styling, Framing & YouTube Packaging</h3>
                </div>
                <p className="text-xs text-ink-500">
                  Global aspect ratio, animated caption presets, dynamic camera framing, and fair-use creator attribution.
                </p>
              </div>

              {/* Ready to Publish Button */}
              <div className="flex items-center gap-2 pt-2 sm:pt-0">
                <button
                  type="button"
                  disabled={exportingHighlight || !selectedClip}
                  onClick={handleExportHighlight}
                  className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-xs font-bold text-purple-800 hover:bg-purple-100 disabled:opacity-50"
                >
                  {exportingHighlight ? 'Rendering...' : 'Render Highlight'}
                </button>
                <button
                  type="button"
                  onClick={() => openUploadModal()}
                  className="rounded-xl bg-purple-700 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-purple-800 purple-glow"
                >
                  <Upload className="inline-block mr-1.5 h-3.5 w-3.5" />
                  <span>Publish Short</span>
                </button>
              </div>
            </div>

            {/* 4-Column Control Grid */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* 1. Aspect Ratio (3 cols) */}
              <div className="space-y-3 lg:col-span-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-700">
                  1. Aspect Ratio
                </label>
                <div className="space-y-2">
                  {RATIOS.map((r) => {
                    const isSelected = selectedRatio === r.key
                    return (
                      <div
                        key={r.key}
                        onClick={() => setSelectedRatio(r.key)}
                        className={`cursor-pointer rounded-2xl border p-3 text-xs transition-all ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50 font-bold text-purple-900 shadow-sm ring-1 ring-purple-600'
                            : 'border-canvas-200 bg-canvas-50 text-ink-700 hover:border-canvas-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{r.label}</span>
                          {isSelected && <Check className="h-4 w-4 text-purple-700" />}
                        </div>
                        <p className="mt-0.5 text-[10px] text-ink-500 font-normal">{r.sub}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 2. Caption Style Presets (4 cols) */}
              <div className="space-y-3 lg:col-span-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-700">
                  2. Caption Style Preset
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {styles.map((s) => {
                    const isSelected = selectedStyle === s.key
                    return (
                      <div
                        key={s.key}
                        onClick={() => setSelectedStyle(s.key)}
                        className={`cursor-pointer rounded-xl border p-2.5 text-xs transition-all ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50 text-purple-900 font-bold shadow-sm'
                            : 'border-canvas-200 bg-canvas-50 text-ink-700 hover:border-canvas-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="capitalize">{s.label}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-purple-700" />}
                        </div>
                        <p className="mt-0.5 text-[10px] text-ink-500 font-normal line-clamp-1">{s.description}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 3. Framing & Speaker Tracking (5 cols) */}
              <div className="space-y-3 lg:col-span-5">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-700">
                  3. Framing & Speaker Tracking
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {LAYOUTS.map((l) => {
                    const isSelected = selectedLayout === l.key
                    return (
                      <div
                        key={l.key}
                        onClick={() => setSelectedLayout(l.key)}
                        className={`cursor-pointer rounded-xl border p-2.5 text-xs transition-all ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50 text-purple-900 font-bold shadow-sm'
                            : 'border-canvas-200 bg-canvas-50 text-ink-700 hover:border-canvas-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{l.label}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-purple-700" />}
                        </div>
                        <p className="mt-0.5 text-[10px] text-ink-500 font-normal line-clamp-1">{l.desc}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Sub-Card: 4. YouTube SEO Packaging & Original Creator Fair-Use Credits */}
            <div className="rounded-2xl border border-canvas-200 bg-canvas-50 p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-ink-800">
                  <Tag className="h-4 w-4 text-purple-700" />
                  <span>Original Creator Attribution & Viral Metadata</span>
                </div>
                <button
                  type="button"
                  disabled={generatingSEO || !selectedClip}
                  onClick={handleGenerateSEO}
                  className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-bold text-purple-800 hover:bg-purple-50"
                >
                  <Sparkle className="h-3.5 w-3.5 text-purple-700" />
                  <span>{generatingSEO ? 'Analyzing Viral Angles...' : '✨ Generate YouTube SEO Kit'}</span>
                </button>
              </div>

              {/* Automatic Creator Attribution Banner */}
              <div className="rounded-xl border border-purple-200 bg-white p-3 text-xs text-ink-700 space-y-1">
                <span className="font-bold text-purple-900 text-[11px] uppercase tracking-wider">
                  Mandatory Source Attribution (Auto-included in upload description):
                </span>
                <p className="font-mono text-[11px] text-ink-800">
                  Original Video: {job?.source?.title || 'MrBeast Challenge'} • Creator:{' '}
                  {job?.source?.channel || 'Source Channel'} • URL: {job?.source?.url || 'https://youtube.com'}
                </p>
              </div>

              {packageResult && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-600">
                      Optimized Viral Title
                    </label>
                    <p className="mt-1 font-bold text-xs text-ink-950 bg-white p-2.5 rounded-xl border border-canvas-200">
                      {packageResult.package.title}
                    </p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-600">
                      Tags & Hashtags
                    </label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {packageResult.package.hashtags.map((t, idx) => (
                        <span key={idx} className="rounded-md bg-white border border-canvas-200 px-1.5 py-0.5 text-[10px] font-mono text-ink-700">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

      {/* ---------------- Claude Desktop MCP Directing Modal ---------------- */}
      {showClaudeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-3xl border border-canvas-300 bg-white p-7 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-700 font-bold text-base">
                <Bot className="h-5 w-5" />
                <span>Direct with Claude Desktop (MCP)</span>
              </div>
              <button
                onClick={() => setShowClaudeModal(false)}
                className="rounded-lg p-1 text-ink-400 hover:bg-canvas-100 hover:text-ink-900"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-ink-600 leading-relaxed">
              Open your Claude Desktop app. Paste the command prompt below. Claude will inspect this
              exact job's transcript, design 3 creative angles, iterate with your feedback, and render
              the Short. All renders will appear here in the Web UI automatically!
            </p>

            <div className="rounded-2xl border border-canvas-300 bg-canvas-100 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-ink-700">
                <span>Prompt to Paste into Claude Desktop:</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(claudePrompt)
                    setCopiedClaudePrompt(true)
                    setTimeout(() => setCopiedClaudePrompt(false), 2000)
                  }}
                  className="flex items-center gap-1 text-purple-700 hover:underline"
                >
                  {copiedClaudePrompt ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedClaudePrompt ? 'Copied!' : 'Copy Prompt'}</span>
                </button>
              </div>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-ink-800 bg-white p-3 rounded-xl border border-canvas-200">
                {claudePrompt}
              </pre>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowClaudeModal(false)}
                className="rounded-xl bg-purple-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-purple-800 shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- YouTube Upload Safe Consent Modal ---------------- */}
      {showUploadModal && exportToUpload && (
        <YouTubeUploadModal
          exportItem={exportToUpload}
          sourceTitle={job?.source?.title}
          sourceUrl={job?.source?.url}
          sourceChannel={job?.source?.channel}
          channelStatus={ytStatus}
          onClose={() => setShowUploadModal(false)}
          onSuccess={(res) => {
            setShowUploadModal(false)
            setUploadSuccessUrl(res.youtube_url)
          }}
        />
      )}

      {/* ---------------- YouTube Disconnected Fallback Dialog ---------------- */}
      <YouTubeConnectModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        exportTitle={exportToUpload?.title}
        onDownloadMp4={
          exportToUpload
            ? () => {
                const a = document.createElement('a')
                a.href = exportToUpload.download_url
                a.download = `${exportToUpload.title || 'short'}.mp4`
                a.click()
              }
            : undefined
        }
      />
    </div>
  )
}
