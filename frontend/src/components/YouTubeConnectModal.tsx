import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Download,
  Copy,
  Check,
  Sparkles,
  X,
  HelpCircle,
  Sliders,
  ShieldCheck,
} from 'lucide-react'

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  )
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onDownloadMp4?: () => void
  exportTitle?: string
}

const YOUTUBE_OAUTH_LLM_PROMPT = `I am using ClipCut AI (an open-source video clipping tool) and I want to enable direct YouTube Shorts auto-uploading.

Please guide me step-by-step through Google Cloud Console to get my OAuth 2.0 Desktop credentials:
1. Where to create a new project in Google Cloud Console.
2. How to enable "YouTube Data API v3" and "YouTube Analytics API".
3. How to configure the "OAuth consent screen" (User type: External, add my Gmail as a test user, add scopes '.../auth/youtube.upload' and '.../auth/yt-analytics.readonly').
4. How to create an OAuth client ID (Application type: Desktop app).
5. How to download the credentials JSON file and rename it to 'client_secrets.json' to place it in my ClipCut directory or upload it in ClipCut Settings.

Please keep instructions simple, numbered, and beginner-friendly!`;

export function YouTubeConnectModal({
  isOpen,
  onClose,
  onDownloadMp4,
  exportTitle,
}: Props) {
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  if (!isOpen) return null

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(YOUTUBE_OAUTH_LLM_PROMPT)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl border border-canvas-200 bg-white p-6 shadow-2xl sm:p-8 my-8 animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-2 text-ink-400 hover:bg-canvas-100 hover:text-ink-900 transition-colors"
          title="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
            <YouTubeIcon className="h-6 w-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-purple-700">
              <Sparkles className="h-3 w-3" />
              <span>Publishing Integration</span>
            </div>
            <h2 className="text-xl font-extrabold text-ink-950">YouTube Account Required</h2>
          </div>
        </div>

        {/* Option 1: 100% Free Instant Download (Highlight) */}
        <div className="mt-5 rounded-2xl border-2 border-emerald-200 bg-emerald-50/70 p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-200/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
                Instant • 0 Credentials Needed
              </span>
              <h3 className="mt-1 text-sm font-bold text-emerald-950">
                Download your rendered MP4 directly!
              </h3>
              <p className="mt-0.5 text-xs text-emerald-800 leading-relaxed">
                Your short {exportTitle ? `"${exportTitle}"` : ''} is completely finished with
                burned-in karaoke captions and 9:16 face-tracking. You can download the file right
                now and manually upload it to YouTube Shorts, Instagram Reels, or TikTok!
              </p>
            </div>
          </div>

          {onDownloadMp4 && (
            <button
              type="button"
              onClick={() => {
                onDownloadMp4()
                onClose()
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-all"
            >
              <Download className="h-4 w-4" />
              <span>Download MP4 Now</span>
            </button>
          )}
        </div>

        {/* Option 2: Direct In-App Publishing via OAuth */}
        <div className="mt-6 space-y-4">
          <div className="border-t border-canvas-200 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-700">
              Want 1-Click Direct In-App Publishing?
            </h4>
            <p className="mt-1 text-xs text-ink-600 leading-relaxed">
              Google requires an official OAuth 2.0 Client credentials file (<code className="font-mono text-purple-700">client_secrets.json</code>)
              so ClipCut can interact with the YouTube Data API securely on your behalf.
            </p>
          </div>

          {/* Copy-Ready Prompt Card */}
          <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 space-y-3">
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
              Paste this prompt into your favorite AI assistant to get guided step-by-step through Google Cloud Console:
            </p>

            <pre className="max-h-32 overflow-y-auto rounded-xl border border-purple-200 bg-white p-3 font-mono text-[11px] text-ink-800 leading-relaxed whitespace-pre-wrap select-all">
              {YOUTUBE_OAUTH_LLM_PROMPT}
            </pre>
          </div>

          {/* Strict Human-in-the-Loop reminder */}
          <div className="flex items-center gap-2 text-[11px] text-ink-500">
            <ShieldCheck className="h-4 w-4 text-purple-700 shrink-0" />
            <span>ClipCut never uploads videos without your explicit review and sign-off.</span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-canvas-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-canvas-300 bg-white px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-canvas-100"
            >
              Close
            </button>
            <Link
              to="/settings"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-700 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-800 transition-colors"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Configure in Settings</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
