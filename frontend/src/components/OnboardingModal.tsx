import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  KeyRound,
  Cpu,
  Film,
  Layers,
  Clock,
  Eye,
  EyeOff,
  HelpCircle,
  X,
} from 'lucide-react'
import { api, type SystemStatus, type ProviderStatus } from '../api'

interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
}

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const totalSteps = 5

  // System & Provider States
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    if (isOpen) {
      api.system().then(setSystem).catch(() => {})
      api.providerStatus().then(setProviders).catch(() => {})
    }
  }, [isOpen])

  if (!isOpen) return null

  const geminiStatus = providers.find((p) => p.name === 'gemini')
  const hasExistingKey = geminiStatus?.has_key ?? false

  const handleFinish = async () => {
    if (apiKey.trim()) {
      setSaving(true)
      setError(null)
      try {
        await api.putSecret('gemini_api_key', apiKey.trim())
        // Set active provider to gemini
        await api.putSettings({ active_provider: 'gemini' })
        localStorage.setItem('clipcut_onboarding_completed', 'true')
        onClose()
        navigate('/create')
      } catch (err: any) {
        setError(err.message || 'Failed to save API key. Please verify the key and try again.')
      } finally {
        setSaving(false)
      }
    } else if (hasExistingKey) {
      localStorage.setItem('clipcut_onboarding_completed', 'true')
      onClose()
      navigate('/create')
    } else {
      // Allow proceeding without key if user wants to set it up later
      localStorage.setItem('clipcut_onboarding_completed', 'true')
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-canvas-200 overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Top Gradient Header & Step Indicator */}
        <div className="relative bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-700 px-8 pt-8 pb-6 text-white">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            title="Skip tour"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-0.5 text-xs font-semibold backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-purple-200" />
              Welcome to ClipCut AI
            </span>
            <span className="text-xs text-white/70">
              Step {step} of {totalSteps}
            </span>
          </div>

          <h2 className="text-2xl font-extrabold tracking-tight">
            {step === 1 && 'Your Autonomous Video Powerhouse'}
            {step === 2 && '3 Dedicated Production Pipelines'}
            {step === 3 && 'Hormozi Captions & Dynamic Framing'}
            {step === 4 && 'Algorithmic YouTube Scheduling'}
            {step === 5 && 'Connect Your Free AI Brain'}
          </h2>

          {/* Progress dots */}
          <div className="flex items-center gap-2 mt-4">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i + 1 === step
                    ? 'w-8 bg-white'
                    : i + 1 < step
                    ? 'w-3 bg-white/70'
                    : 'w-3 bg-white/25'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Modal Body Slides */}
        <div className="p-8 flex-1 min-h-[340px] flex flex-col justify-between">
          {/* ---------------- SLIDE 1: Welcome & Overview ---------------- */}
          {step === 1 && (
            <div className="space-y-6">
              <p className="text-base text-ink-700 leading-relaxed">
                ClipCut transforms long-form YouTube videos and podcasts into captivating,
                high-retention <strong>9:16 vertical content</strong> (Shorts, Reels, TikToks)—with{' '}
                <strong>zero monthly subscription fees</strong> and 100% local privacy.
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-4">
                  <div className="h-8 w-8 rounded-xl bg-purple-600/10 text-purple-700 flex items-center justify-center mb-3">
                    <Zap className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-bold text-ink-900">Zero Monthly Fees</h4>
                  <p className="text-xs text-ink-600 mt-1">
                    Powered by your own local GPU or CPU. No subscription tiers, no credit limits.
                  </p>
                </div>

                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
                  <div className="h-8 w-8 rounded-xl bg-indigo-600/10 text-indigo-700 flex items-center justify-center mb-3">
                    <Film className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-bold text-ink-900">3 Video Engines</h4>
                  <p className="text-xs text-ink-600 mt-1">
                    Extract highlights, generate 60–90s B-roll story recaps, or inject viral hooks.
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <div className="h-8 w-8 rounded-xl bg-emerald-600/10 text-emerald-700 flex items-center justify-center mb-3">
                    <Clock className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-bold text-ink-900">Smart Cadence</h4>
                  <p className="text-xs text-ink-600 mt-1">
                    Auto-schedules shorts during peak viewer retention hours without spam penalties.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- SLIDE 2: 3 Video Pipelines ---------------- */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-ink-600">
                Choose the exact right production pipeline depending on the type of content:
              </p>

              <div className="space-y-3">
                <div className="rounded-2xl border border-canvas-200 bg-canvas-50/70 p-3.5 flex items-start gap-3.5">
                  <div className="h-7 w-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                    P1
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-ink-900">
                      Highlight Extractor & Clipper
                    </h4>
                    <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">
                      Slices the highest-energy 15–60s moments with sub-millisecond word snapping.
                      Keeps 100% of raw audio intact with dynamic speaker tracking.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-canvas-200 bg-canvas-50/70 p-3.5 flex items-start gap-3.5">
                  <div className="h-7 w-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                    P2
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-ink-900">
                      60–90s+ Multi-Angle Story Recap (Pristine Studio Audio)
                    </h4>
                    <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">
                      Uses source footage as visual B-roll while synthesizing an original narrative
                      voiceover. 100% clean audio with zero background dialogue bleed.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-canvas-200 bg-canvas-50/70 p-3.5 flex items-start gap-3.5">
                  <div className="h-7 w-7 rounded-lg bg-pink-600 text-white flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                    P3
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-ink-900">
                      The Hybrid Hook Machine
                    </h4>
                    <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">
                      Prepends a viral 4-second teaser hook with AI narration, then punch-cuts into
                      the full raw action moment to maximize retention.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- SLIDE 3: Hormozi Captions & Framing ---------------- */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-ink-600">
                Studio-grade visual polish baked in automatically:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-canvas-200 p-4 bg-canvas-50/50">
                  <div className="flex items-center gap-2 mb-2 text-purple-700 font-bold text-sm">
                    <Sparkles className="h-4 w-4" />
                    <span>Hormozi Subtitle Engine</span>
                  </div>
                  <ul className="text-xs text-ink-600 space-y-1.5 list-disc list-inside">
                    <li>
                      <strong>Hormozi Punch:</strong> Neon green 2-word pop with 125% scale burst.
                    </li>
                    <li>
                      <strong>Neon Gold:</strong> 3-word electric gold pop for high-energy shorts.
                    </li>
                    <li>
                      <strong>Bold Pop & Karaoke:</strong> Chunky outlines with syllable fills.
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-canvas-200 p-4 bg-canvas-50/50">
                  <div className="flex items-center gap-2 mb-2 text-indigo-700 font-bold text-sm">
                    <Layers className="h-4 w-4" />
                    <span>Dynamic Smart Framing</span>
                  </div>
                  <ul className="text-xs text-ink-600 space-y-1.5 list-disc list-inside">
                    <li>
                      <strong>Auto Speaker Tracking:</strong> Follows active speakers with MediaPipe.
                    </li>
                    <li>
                      <strong>Split-Screen (Gamer):</strong> 35% Facecam + 65% Gameplay stacked.
                    </li>
                    <li>
                      <strong>Zoom-Fit (1.35x):</strong> Fills 9:16 vertical without black bars.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3 flex items-center gap-2.5 text-xs text-purple-900">
                <CheckCircle2 className="h-4 w-4 text-purple-600 shrink-0" />
                <span>
                  All captions are rendered with exact sub-millisecond audio timestamps using libass
                  and BT.709 color correction.
                </span>
              </div>
            </div>
          )}

          {/* ---------------- SLIDE 4: Smart Retention Cadence ---------------- */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-ink-600">
                Uploading randomly hurts your YouTube channel algorithm. ClipCut paces your content:
              </p>

              <div className="rounded-2xl border border-canvas-200 overflow-hidden text-xs">
                <div className="bg-canvas-100 font-semibold text-ink-800 p-3 border-b border-canvas-200 grid grid-cols-3">
                  <span>Slot</span>
                  <span>Time</span>
                  <span>Audience State</span>
                </div>
                <div className="p-3 border-b border-canvas-200 grid grid-cols-3 text-ink-700 items-center">
                  <span className="font-bold text-purple-700">Slot 1</span>
                  <span>12:00 PM</span>
                  <span>Midday Lunch Peak</span>
                </div>
                <div className="p-3 border-b border-canvas-200 grid grid-cols-3 text-ink-700 items-center">
                  <span className="font-bold text-purple-700">Slot 2</span>
                  <span>5:30 PM</span>
                  <span>Evening Transit & Commute</span>
                </div>
                <div className="p-3 grid grid-cols-3 text-ink-700 items-center">
                  <span className="font-bold text-purple-700">Slot 3</span>
                  <span>8:30 PM</span>
                  <span>Night Prime Relaxation</span>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3.5 flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 leading-relaxed">
                  <strong>Fair-Use Protection & Human Consent:</strong> ClipCut automatically
                  generates complete creator attribution credits and will{' '}
                  <strong>never publish without your explicit 1-click confirmation</strong>.
                </div>
              </div>
            </div>
          )}

          {/* ---------------- SLIDE 5: API Key & Hardware Diagnostics ---------------- */}
          {step === 5 && (
            <div className="space-y-4">
              {/* Hardware Auto-Configured Badge */}
              <div className="rounded-2xl border border-canvas-200 bg-canvas-50 p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Cpu className="h-4 w-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-ink-900">
                      Hardware Detected & Configured
                    </h5>
                    <p className="text-xs text-ink-600">
                      {system?.accel === 'cuda'
                        ? `NVIDIA CUDA 12 GPU Turbo (${system.gpu_name?.replace(
                            'NVIDIA GeForce ',
                            ''
                          ) || 'GPU'})`
                        : 'Multi-Core CPU Mode (Faster-Whisper int8 active)'}
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  Auto-Optimized
                </span>
              </div>

              {/* API Key Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-ink-800 flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-purple-600" />
                    Google Gemini API Key
                    <span className="font-normal text-ink-500">(Free Forever)</span>
                  </label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-800 hover:underline"
                  >
                    <span>Get Free Key at Google AI Studio</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={hasExistingKey ? '•••••••••••••••••••• (Key Configured)' : 'AIzaSy...'}
                    className="w-full rounded-xl border border-canvas-300 bg-white px-3.5 py-2.5 text-xs text-ink-900 pr-10 focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-2.5 text-ink-400 hover:text-ink-600"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {hasExistingKey && !apiKey && (
                  <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    An active API key is already configured on this machine.
                  </p>
                )}
              </div>

              {/* 30-Second Quick Guide Accordion */}
              <div className="rounded-xl border border-canvas-200 bg-canvas-50/70 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setShowGuide(!showGuide)}
                  className="w-full px-3.5 py-2 text-left font-semibold text-purple-700 flex items-center justify-between hover:bg-canvas-100/60 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5" />
                    Need help getting a free Gemini API key? (30-second guide)
                  </span>
                  <span>{showGuide ? 'Hide' : 'Show'}</span>
                </button>

                {showGuide && (
                  <div className="px-3.5 pb-3 pt-1 text-ink-700 space-y-2 border-t border-canvas-200/80 bg-white">
                    <ol className="list-decimal list-inside space-y-1 text-ink-600">
                      <li>
                        Click{' '}
                        <a
                          href="https://aistudio.google.com/app/apikey"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-purple-700 underline"
                        >
                          Google AI Studio
                        </a>{' '}
                        and sign in with any Google account.
                      </li>
                      <li>Click the blue <strong>"Create API key"</strong> button.</li>
                      <li>Select any project (or default) and copy the generated key string.</li>
                      <li>Paste it into the box above and click "Save & Launch Studio"!</li>
                    </ol>
                    <p className="text-[11px] text-emerald-700 font-medium">
                      💡 No credit card required. Google gives 15 requests/minute completely free.
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="flex items-center justify-between pt-6 border-t border-canvas-200 mt-6">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="inline-flex items-center gap-1.5 rounded-xl border border-canvas-300 bg-white px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-canvas-50 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-ink-500 hover:text-ink-700 font-medium"
              >
                Skip Tour
              </button>
            )}

            {step < totalSteps ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-5 py-2 text-xs font-semibold text-white hover:bg-purple-700 transition-colors shadow-sm"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-2.5 text-xs font-bold text-white hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
              >
                {saving ? (
                  'Saving Key...'
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Launch ClipCut Studio
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

