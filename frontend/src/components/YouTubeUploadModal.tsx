import { useEffect, useState } from 'react'
import { Clock, Eye, Globe, Lock, ShieldCheck, Upload, X, AlertCircle, Sparkles } from 'lucide-react'
import { api, type JobExport, type YouTubeChannelStatus, type ScheduleRecommendation } from '../api'

interface Props {
  exportItem: JobExport
  sourceTitle?: string
  sourceUrl?: string | null
  sourceChannel?: string | null
  channelStatus: YouTubeChannelStatus | null
  onClose: () => void
  onSuccess: (result: any) => void
}

function formatIsoToDatetimeLocal(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function YouTubeUploadModal({
  exportItem,
  sourceTitle,
  sourceUrl,
  sourceChannel,
  channelStatus,
  onClose,
  onSuccess,
}: Props) {
  const defaultTitle = exportItem.title.includes('#shorts')
    ? exportItem.title
    : `${exportItem.title} #shorts`

  const defaultDescription = [
    sourceTitle ? `Highlight from: ${sourceTitle}` : '',
    '',
    '----------------------------------------',
    'Credit to Original Creator:',
    sourceTitle ? `🎬 Video: "${sourceTitle}"` : '',
    sourceChannel ? `👤 Creator: ${sourceChannel}` : '',
    sourceUrl ? `🔗 Watch Original: ${sourceUrl}` : '',
    'Transformed under Fair Use for educational recap, analysis, and commentary.',
    '----------------------------------------',
    '',
    '#shorts #viral #recap #highlights',
  ]
    .filter(Boolean)
    .join('\n')

  const [title, setTitle] = useState(defaultTitle)
  const [description, setDescription] = useState(defaultDescription)
  const [tags, setTags] = useState('shorts, viral, highlights, entertainment')
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('public')
  const [scheduleTime, setScheduleTime] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [recommendation, setRecommendation] = useState<ScheduleRecommendation | null>(null)
  const [loadingSchedule, setLoadingSchedule] = useState(false)

  useEffect(() => {
    let mounted = true
    const fetchRec = async () => {
      try {
        setLoadingSchedule(true)
        const tzOffset = -new Date().getTimezoneOffset()
        const rec = await api.getScheduleRecommendation(
          tzOffset,
          3,
          channelStatus?.profile_name || 'default'
        )
        if (mounted) {
          setRecommendation(rec)
        }
      } catch (err) {
        console.warn('Failed to load schedule recommendation:', err)
      } finally {
        if (mounted) setLoadingSchedule(false)
      }
    }
    fetchRec()
    return () => {
      mounted = false
    }
  }, [channelStatus?.profile_name])

  const handleApplyRecommendedSlot = () => {
    if (!recommendation?.recommended_iso) return
    setScheduleTime(formatIsoToDatetimeLocal(recommendation.recommended_iso))
    setPrivacy('private') // YouTube scheduled uploads must be initially private/scheduled
  }

  const handleUpload = async () => {
    if (!confirmed) {
      setError('Please check the confirmation box to authorize upload.')
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const res = await api.uploadYouTubeShort({
        export_id: exportItem.id,
        title,
        description,
        tags: tagList,
        privacy,
        schedule_time_iso: scheduleTime ? new Date(scheduleTime).toISOString() : undefined,
        profile_name: channelStatus?.profile_name || 'default',
      })

      onSuccess(res)
    } catch (err: any) {
      setError(err?.message || 'Upload failed. Check YouTube API status.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl border border-canvas-300 bg-white p-6 shadow-2xl sm:p-8">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-lg p-2 text-ink-500 hover:bg-canvas-100 hover:text-ink-900"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
            <Upload className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink-900">Publish Short to YouTube</h2>
            <p className="text-sm text-ink-600">
              Publishing to channel:{' '}
              <span className="font-semibold text-purple-700">
                {channelStatus?.title || 'Connected Channel'} ({channelStatus?.custom_url || '@channel'})
              </span>
            </p>
          </div>
        </div>

        {/* Consent Guard Notice */}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-purple-200 bg-purple-50/70 p-3.5 text-xs text-purple-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-purple-700" />
          <div>
            <strong>Strict Human-in-the-Loop Gate:</strong> ClipCut AI never publishes videos
            automatically. This action requires your explicit review and sign-off.
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-700">
              Short Title (Max 100 chars, includes #shorts)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-canvas-300 bg-canvas-50 px-4 py-2.5 text-sm font-medium text-ink-900 focus:border-purple-600 focus:bg-white focus:outline-none"
              maxLength={100}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-700">
                Description & Creator Attribution
              </label>
              <span className="text-[11px] text-purple-700 font-medium">
                Auto-credited to source
              </span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-xl border border-canvas-300 bg-canvas-50 p-3 text-xs font-mono text-ink-800 focus:border-purple-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-700">
                Tags (Comma separated)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="mt-1 w-full rounded-xl border border-canvas-300 bg-canvas-50 px-3 py-2 text-xs text-ink-900 focus:border-purple-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-700">
                Visibility
              </label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPrivacy('public')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-all ${
                    privacy === 'public'
                      ? 'border-purple-600 bg-purple-50 text-purple-700'
                      : 'border-canvas-300 bg-white text-ink-600 hover:bg-canvas-50'
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" /> Public
                </button>
                <button
                  type="button"
                  onClick={() => setPrivacy('unlisted')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-all ${
                    privacy === 'unlisted'
                      ? 'border-purple-600 bg-purple-50 text-purple-700'
                      : 'border-canvas-300 bg-white text-ink-600 hover:bg-canvas-50'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" /> Unlisted
                </button>
                <button
                  type="button"
                  onClick={() => setPrivacy('private')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-all ${
                    privacy === 'private'
                      ? 'border-purple-600 bg-purple-50 text-purple-700'
                      : 'border-canvas-300 bg-white text-ink-600 hover:bg-canvas-50'
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" /> Private
                </button>
              </div>
            </div>
          </div>

          {/* Smart AI Cadence Recommendation Card */}
          <div className="rounded-2xl border border-purple-200 bg-purple-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                <Sparkles className="h-4 w-4 text-purple-700" />
                <span>AI Audience Retention Cadence (Max 3/Day)</span>
              </div>
              {recommendation && (
                <span className="rounded-full bg-purple-200/80 px-2.5 py-0.5 text-[10px] font-extrabold text-purple-900">
                  {recommendation.today_used}/{recommendation.today_cap} Published Today
                </span>
              )}
            </div>

            {recommendation ? (
              <div className="space-y-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs">
                  <div>
                    <div className="font-bold text-ink-950 flex items-center gap-1.5">
                      <span>Optimal Next Slot:</span>
                      <span className="rounded-md bg-purple-700 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                        {recommendation.day_label} @{' '}
                        {new Date(recommendation.recommended_iso).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-600 mt-1">
                      {recommendation.slot_name} • {recommendation.status_message}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyRecommendedSlot}
                    className="shrink-0 rounded-xl bg-purple-700 px-3.5 py-2 text-xs font-bold text-white shadow-md hover:bg-purple-800 transition-all purple-glow flex items-center gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Apply Optimal Slot</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-ink-500">
                {loadingSchedule ? 'Analyzing channel posting history...' : 'Audience cadence ready.'}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-700">
                Schedule Release (Optional)
              </label>
              {scheduleTime && (
                <button
                  type="button"
                  onClick={() => setScheduleTime('')}
                  className="text-[10px] font-bold text-red-600 hover:underline"
                >
                  Clear Schedule
                </button>
              )}
            </div>
            <div className="relative mt-1">
              <Clock className="absolute left-3.5 top-2.5 h-4 w-4 text-ink-400" />
              <input
                type="datetime-local"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-full rounded-xl border border-canvas-300 bg-canvas-50 py-2 pl-10 pr-4 text-xs text-ink-900 focus:border-purple-600 focus:bg-white focus:outline-none"
              />
            </div>
            {scheduleTime && (
              <p className="mt-1 text-[11px] text-purple-700 font-medium">
                📅 Short will be held private and published automatically at the scheduled time.
              </p>
            )}
          </div>

          {/* Interactive Consent Checkbox */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-canvas-300 bg-canvas-100 p-3 hover:bg-canvas-200/50">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-canvas-400 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-xs text-ink-700">
              I have reviewed this video and explicitly confirm uploading it to{' '}
              <strong className="text-ink-900">{channelStatus?.title || 'my YouTube channel'}</strong>.
            </span>
          </label>
        </div>

        {/* Modal Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-canvas-300 px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-canvas-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!confirmed || isUploading}
            onClick={handleUpload}
            className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all ${
              confirmed && !isUploading
                ? 'bg-purple-600 hover:bg-purple-700 purple-glow'
                : 'cursor-not-allowed bg-ink-300 text-ink-500'
            }`}
          >
            {isUploading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Uploading in Chunks...</span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                <span>Confirm & Publish Short</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

