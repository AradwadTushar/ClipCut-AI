/**
 * Typed client for the AutoClip API.
 *
 * Same-origin throughout: the server hands out the built bundle, so there is no
 * base URL to configure and no CORS to negotiate.
 */

export interface Source {
  id: string
  type: string
  title: string
  url: string | null
  filename: string | null
  channel: string | null
  duration_s: number
  width: number | null
  height: number | null
  fps: number | null
  has_audio: boolean
  has_video: boolean
  created_at: string
}

export type JobStatus = 'queued' | 'running' | 'failed' | 'done' | 'cancelled'

export interface Job {
  id: string
  source_id: string
  status: JobStatus
  current_stage: string
  progress: number
  error: string | null
  provider: string
  created_at: string
  updated_at: string
  started_at: string | null
  finished_at: string | null
  source: Source | null
}

export interface JobExport {
  id: string
  clip_id: string
  job_id: string
  pipeline_type: 'pipeline_1' | 'pipeline_2' | 'pipeline_3' | string
  title: string
  path: string
  filename: string
  ratio: string
  style: string
  size_bytes: number
  size_mb: number
  download_url: string
  stream_url: string
  exists: boolean
  script: any | null
  created_at: string
}

export interface JobScript {
  id: string
  job_id: string
  version: number
  pipeline_type: string
  angle_title: string
  title: string
  hook: string
  script: {
    title?: string
    hook?: string
    beats?: Array<{
      narration: string
      broll_start_s: number
      broll_end_s: number
    }>
  }
  source_agent: string
  feedback: string | null
  created_at: string
}

export interface YouTubeChannelStatus {
  connected: boolean
  channel_id: string | null
  title: string | null
  custom_url: string | null
  profile_name: string
  subscriber_count: number
  video_count: number
  view_count: number
  message: string
}

export interface YouTubeAnalytics {
  channel_id: string
  channel_title: string
  period_days: number
  start_date: string
  end_date: string
  daily_trends: Array<[string, number, number, number, number, number, number, number]>
  column_headers: string[]
  top_videos: Array<[string, number, number, number, number, number]>
  fetched_at: string
}

export interface YouTubeUploadRecord {
  id: string
  export_id: string
  job_id: string
  video_id: string
  channel_title: string
  title: string
  status: string
  scheduled_at: string | null
  published_at: string | null
  youtube_url: string
  created_at: string
}


export interface ScheduleRecommendation {
  recommended_iso: string
  recommended_local: string
  slot_name: string
  day_label: string
  today_used: number
  today_cap: number
  status_message: string
  upcoming_slots: Array<{
    date: string
    label: string
    slots_used: number
    slots_cap: number
  }>
}

export interface ExportRecord {
  id: string
  clip_id: string
  ratio: string
  style: string
  size_bytes: number
  created_at: string
  download_url: string
}

export type ClipStatus = 'candidate' | 'kept' | 'discarded' | 'exported'

export interface Clip {
  id: string
  job_id: string
  rank: number
  start_s: number
  end_s: number
  duration_s: number
  start_word: number
  end_word: number
  title: string
  hook: string
  score: number
  reason: string
  status: ClipStatus
  user_trimmed: boolean
  caption_style: string
  ratio: string
  exports: ExportRecord[]
}

export interface Word {
  text: string
  start: number
  end: number
  speaker: string | null
}

export interface CropKeyframe {
  t: number
  x: number
  y: number
}

export interface CropSegment {
  start_s: number
  end_s: number
  width: number
  height: number
  keyframes: CropKeyframe[]
  strategy: 'track' | 'wide' | 'general'
  zoom: number
  fit: boolean
}

/** Mirrors autoclip.pipeline.reframe.croppath.CropPath. */
export interface CropPath {
  source_width: number
  source_height: number
  segments: CropSegment[]
}

export interface CaptionStyle {
  key: string
  label: string
  description: string
  preview: {
    font: string
    primary: string
    accent: string | null
    outline: string
    outlineWidth: number
    allCaps: boolean
    sizeRatio: number
    marginRatio: number
    boxed: boolean
    animation: string
    maxWords: number
  }
}

export interface ProviderStatus {
  name: string
  available: boolean
  detail: string
  models: string[]
  requires_key: boolean
  has_key: boolean
}

export interface PackageResult {
  clip_id: string
  package: {
    title: string
    description: string
    hashtags: string[]
    pinned_comment: string
    attribution_credit: string
  }
  saved_to: string
}

export interface PolishResult {
  clip_id: string
  original_title: string
  original_hook: string
  original_score: number
  tier2_provider: string
  applied: boolean
  new_start_s: number
  new_end_s: number
  new_title: string
  polish: {
    optimized_title: string
    curiosity_hook: string
    shock_hook: string
    action_hook: string
    trim_start_s: number
    trim_end_s: number
    refined_score: number
    verdict: string
    creative_tip: string
  }
}

export interface Settings {
  active_provider: string
  providers: Record<string, { model: string; base_url: string | null }>
  whisper: { model: string; compute_type: string; language: string; diarization: boolean }
  clips: { min_duration_s: number; max_duration_s: number; max_clips: number }
  ingest: {
    ytdlp_format: string
    cookies_from_browser: string
    prefer_youtube_captions: boolean
  }
  export: {
    ratio: string
    caption_style: string
    loudness_lufs: number
    prefer_hardware_encoder: boolean
    crf: number
    write_srt: boolean
  }
  insecure_secret_storage: boolean
  keys_present: Record<string, boolean>
}

export interface SystemStatus {
  ready: boolean
  python_version: string
  platform: string
  ffmpeg_version: string | null
  has_libass: boolean
  nvenc_works: boolean
  accel: string
  gpu_name: string | null
  compute_type: string
  diarization_available: boolean
}

export interface JobSettingsOverrides {
  provider?: string
  whisper_model?: string
  language?: string
  diarization?: boolean
  min_duration_s?: number
  max_duration_s?: number
  max_clips?: number
  caption_style?: string
  ratio?: string
}

/** An API error carrying the server's message and its actionable hint. */
export class ApiError extends Error {
  hint: string
  status: number

  constructor(message: string, status: number, hint = '') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.hint = hint
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    let hint = ''
    try {
      const body = await response.json()
      const detail = body.detail
      if (typeof detail === 'string') {
        message = detail
      } else if (detail && typeof detail === 'object') {
        // The ingest endpoints return {message, hint} so the UI can show the
        // fix alongside the failure.
        message = detail.message ?? message
        hint = detail.hint ?? ''
      }
    } catch {
      /* Response had no JSON body; the status line is the best we have. */
    }
    throw new ApiError(message, response.status, hint)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  health: () => request<{ status: string; version: string }>('/api/health'),
  system: () => request<SystemStatus>('/api/system'),
  fetchModels: () => request<void>('/api/system/models', { method: 'POST' }),

  listSources: () => request<Source[]>('/api/sources'),

  ingestYouTube: (url: string, cookiesFromBrowser?: string) =>
    request<Source>('/api/sources/youtube', {
      method: 'POST',
      body: JSON.stringify({ url, cookies_from_browser: cookiesFromBrowser || null }),
    }),

  uploadSource: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<Source>('/api/sources/upload', { method: 'POST', body: form })
  },

  listJobs: (limit = 25) => request<Job[]>(`/api/jobs?limit=${limit}`),
  getJob: (id: string) => request<Job>(`/api/jobs/${id}`),

  createJob: (sourceId: string, settings: JobSettingsOverrides = {}) =>
    request<Job>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ source_id: sourceId, settings }),
    }),

  cancelJob: (id: string) => request<Job>(`/api/jobs/${id}/cancel`, { method: 'POST' }),
  retryJob: (id: string) => request<Job>(`/api/jobs/${id}/retry`, { method: 'POST' }),

  listClips: (jobId: string) => request<Clip[]>(`/api/jobs/${jobId}/clips`),
  getClip: (clipId: string) => request<Clip>(`/api/clips/${clipId}`),

  getCropPath: (clipId: string) => request<CropPath>(`/api/clips/${clipId}/crop-path`),
  getClipWords: (clipId: string) => request<Word[]>(`/api/clips/${clipId}/words`),

  patchClip: (
    clipId: string,
    patch: { start_s?: number; end_s?: number; title?: string; status?: ClipStatus },
  ) => request<Clip>(`/api/clips/${clipId}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  patchCaptions: (
    clipId: string,
    patch: { words?: Word[]; caption_style?: string; ratio?: string },
  ) =>
    request<Clip>(`/api/clips/${clipId}/captions`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  exportClip: (
    clipId: string,
    ratio: string,
    style: string,
    writeSrt = false,
    layout = 'auto',
  ) =>
    request<ExportRecord>(`/api/clips/${clipId}/export`, {
      method: 'POST',
      body: JSON.stringify({ ratio, style, write_srt: writeSrt, layout }),
    }),

  polishClip: (clipId: string, provider?: string, apply = true) =>
    request<PolishResult>(
      `/api/clips/${clipId}/polish?apply=${apply}${provider ? `&provider=${encodeURIComponent(provider)}` : ''}`,
      { method: 'POST' },
    ),

  packageClip: (clipId: string, provider?: string) =>
    request<PackageResult>(
      `/api/clips/${clipId}/package${provider ? `?provider=${encodeURIComponent(provider)}` : ''}`,
      { method: 'POST' },
    ),

  renderHybrid: (
    clipId: string,
    payload?: {
      hook_text?: string
      outro_text?: string
      voice?: string
      rate?: string
      style?: string
      layout?: string
      ratio?: string
      hook_mode?: 'prepend_broll' | 'overlay'
      hook_broll_start_s?: number
      hook_duck_volume?: number
    },
  ) =>
    request<{
      export_id: string
      clip_id: string
      path: string
      filename: string
      hook_text: string
      outro_text?: string
      voice: string
      duration_s: number
      size_bytes: number
      download_url: string
    }>(`/api/clips/${clipId}/hybrid`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  summarizeJob: (
    jobId: string,
    payload?: {
      instructions?: string
      voice?: string
      rate?: string
      caption_style?: string
      ambient_volume?: number
      ratio?: string
      target_duration?: number
      provider?: string
      custom_script?: any
    },
  ) =>
    request<{
      export_id: string
      clip_id: string
      job_id: string
      title: string
      hook: string
      script: string
      beats_count: number
      path: string
      filename: string
      voice: string
      duration_s: number
      size_bytes: number
      download_url: string
    }>(`/api/jobs/${jobId}/summarize`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  getJobTranscript: (jobId: string) =>
    request<{
      job_id: string
      source_title: string
      source_duration_s: number
      word_count: number
      text: string
      formatted_text: string
      claude_prompt: string
    }>(`/api/jobs/${jobId}/transcript`),

  transcriptDownloadUrl: (jobId: string, format: 'txt' | 'json' = 'txt') =>
    `/api/jobs/${jobId}/transcript/download?format=${format}`,

  listVoices: () =>
    request<Array<{ preset: string; voice_id: string; gender: string; style: string }>>(
      '/api/tts/voices',
    ),

  captionStyles: () => request<CaptionStyle[]>('/api/caption-styles'),
  providerStatus: () => request<ProviderStatus[]>('/api/providers/status'),

  getSettings: () => request<Settings>('/api/settings'),
  putSettings: (patch: Partial<Settings>) =>
    request<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),

  putSecret: (key: string, value: string) =>
    request<void>('/api/settings/secrets', {
      method: 'PUT',
      body: JSON.stringify({ key, value }),
    }),

  deleteSecret: (key: string) =>
    request<void>(`/api/settings/secrets/${key}`, { method: 'DELETE' }),

  mediaUrl: (jobId: string) => `/api/jobs/${jobId}/media`,

  listJobExports: (jobId: string) => request<JobExport[]>(`/api/jobs/${jobId}/exports`),

  listJobScripts: (jobId: string) => request<JobScript[]>(`/api/jobs/${jobId}/scripts`),

  generateJobScripts: (
    jobId: string,
    instructions?: string,
    target_duration?: number,
    count?: number,
  ) =>
    request<any[]>(`/api/jobs/${jobId}/scripts/generate`, {
      method: 'POST',
      body: JSON.stringify({ instructions, target_duration, count }),
    }),

  iterateJobScript: (
    jobId: string,
    payload: { previous_script_id?: string; feedback: string; target_duration?: number },
  ) =>
    request<any>(`/api/jobs/${jobId}/scripts/iterate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getScheduleRecommendation: (timezoneOffsetMinutes?: number, dailyCap?: number, profile?: string) =>
    request<ScheduleRecommendation>(
      `/api/youtube/schedule/recommendation?timezone_offset_minutes=${timezoneOffsetMinutes ?? new Date().getTimezoneOffset()}&daily_cap=${dailyCap ?? 3}&profile=${profile || 'default'}`,
    ),

  getYouTubeStatus: (profile?: string) =>
    request<YouTubeChannelStatus>(`/api/youtube/status${profile ? `?profile=${profile}` : ''}`),

  getYouTubeAnalytics: (profile?: string, days?: number) =>
    request<YouTubeAnalytics>(
      `/api/youtube/analytics?profile=${profile || 'default'}&days=${days || 30}`,
    ),

  uploadYouTubeShort: (data: {
    export_id: string
    title: string
    description: string
    tags?: string[]
    privacy?: string
    schedule_time_iso?: string
    profile_name?: string
  }) =>
    request<any>('/api/youtube/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listYouTubeUploadsForJob: (jobId: string) =>
    request<YouTubeUploadRecord[]>(`/api/youtube/uploads/${jobId}`),
}

/** Format seconds as m:ss, or h:mm:ss past an hour. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Format seconds as timecode with centiseconds, for trim handles. */
export function formatTimecode(seconds: number): string {
  const total = Math.max(0, seconds)
  const cs = Math.floor((total % 1) * 100)
  const s = Math.floor(total) % 60
  const m = Math.floor(total / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(m)}:${pad(s)}.${pad(cs)}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}
