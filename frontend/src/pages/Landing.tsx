import { Link } from 'react-router-dom'
import {
  Scissors,
  Sparkles,
  Flame,
  Zap,
  ArrowRight,
  ExternalLink,
  Cpu,
  BarChart3,
} from 'lucide-react'

export function Landing() {
  return (
    <div className="space-y-20 py-8 lg:py-14">
      {/* ---------------- Hero Section ---------------- */}
      <section className="relative mx-auto max-w-4xl text-center group">
        {/* Dynamic Multi-Layer Animated Radial Glow Auras */}
        <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-96 w-[640px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-purple-600/20 via-pink-500/15 to-indigo-600/20 blur-3xl transition-transform duration-700 group-hover:scale-110" />
        <div className="pointer-events-none absolute top-10 left-1/3 -z-10 h-64 w-64 rounded-full bg-purple-400/25 blur-2xl transition-all duration-700 group-hover:scale-125" />

        {/* Shimmering Pill Badge with Hover Glow */}
        <div className="inline-flex items-center gap-2 rounded-full border border-purple-200/90 bg-white/80 px-4 py-1.5 text-xs font-bold text-purple-800 shadow-sm backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-purple-400 hover:shadow-lg hover:shadow-purple-500/20">
          <Sparkles className="h-3.5 w-3.5 text-purple-600 animate-pulse" />
          <span>ClipCut Studio • Autonomous Multi-Pipeline Video Engine</span>
        </div>

        <h1 className="mt-6 text-4xl font-black tracking-tight text-ink-950 sm:text-6xl sm:leading-[1.15] transition-all duration-300">
          Turn Long Videos Into{' '}
          <span className="bg-gradient-to-r from-purple-700 via-purple-600 to-pink-600 bg-clip-text text-transparent hover:drop-shadow-[0_0_28px_rgba(168,85,247,0.45)] transition-all duration-300 inline-block cursor-default">
            High-Retention Shorts
          </span>{' '}
          in Seconds.
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base text-ink-700 sm:text-lg leading-relaxed">
          Transform YouTube videos and podcasts into captivating 9:16 vertical content. Choose between
          automated Gemini generation or deep human-in-the-loop directing via Claude Desktop.
        </p>

        {/* CTA Buttons with Tactile Hover Lift & Glow */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/create"
            className="group/btn flex items-center gap-2 rounded-2xl bg-purple-700 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-purple-600/25 transition-all duration-200 hover:scale-105 hover:bg-purple-800 hover:shadow-2xl hover:shadow-purple-600/40 active:scale-95 purple-glow"
          >
            <Zap className="h-4 w-4 transition-transform group-hover/btn:rotate-12" />
            <span>Launch Studio</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
          </Link>
          <Link
            to="/analytics"
            className="flex items-center gap-2 rounded-2xl border border-canvas-300 bg-white px-6 py-3.5 text-sm font-bold text-ink-800 shadow-sm transition-all duration-200 hover:scale-105 hover:border-purple-300 hover:shadow-lg hover:shadow-purple-100 hover:text-purple-900 active:scale-95"
          >
            <BarChart3 className="h-4 w-4 text-purple-700" />
            <span>Channel Analytics</span>
          </Link>
        </div>
      </section>

      {/* ---------------- 3 Pipelines Cards ---------------- */}
      <section className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
            Choose Your Video Pipeline
          </h2>
          <p className="mt-2 text-sm text-ink-600">
            Three specialized architectures engineered for maximum viewer retention and viral reach.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Pipeline 1 Card */}
          <div className="glass-card glass-card-hover group flex flex-col justify-between rounded-2xl p-7">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                  <Scissors className="h-6 w-6" />
                </div>
                <span className="badge-purple rounded-full px-3 py-1 text-xs font-semibold">
                  Pipeline 1
                </span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-ink-950 group-hover:text-purple-700 transition-colors">
                  Viral Cut
                </h3>
                <p className="text-xs font-medium text-purple-600">Precision Continuous Highlight</p>
              </div>
              <p className="text-xs leading-relaxed text-ink-600">
                Detects the single most intense, funny, or viral unbroken moments from the video.
                Features active speaker face tracking, automatic center crop, and synchronized
                karaoke Hormozi captions.
              </p>
              <div className="space-y-1.5 pt-2 text-xs text-ink-700">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                  <span>30–60s Target Duration</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                  <span>Dual-Speaker & Face Tracking</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                  <span>Raw dialogue intact</span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <Link
                to="/create?pipeline=viral_cut"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-canvas-200 py-2.5 text-xs font-semibold text-ink-900 transition-colors group-hover:bg-purple-700 group-hover:text-white"
              >
                <span>Launch Viral Cut</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Pipeline 2 Card */}
          <div className="glass-card glass-card-hover group relative flex flex-col justify-between rounded-2xl border-2 border-purple-400 p-7 shadow-md">
            <div className="absolute -top-3 right-6 rounded-full bg-gradient-to-r from-purple-700 to-pink-600 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
              Most Popular
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                  <Flame className="h-6 w-6 text-purple-700" />
                </div>
                <span className="badge-purple rounded-full px-3 py-1 text-xs font-semibold">
                  Pipeline 2
                </span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-ink-950 group-hover:text-purple-700 transition-colors">
                  Story Recap
                </h3>
                <p className="text-xs font-medium text-purple-600">B-Roll Hype Mini-Doc</p>
              </div>
              <p className="text-xs leading-relaxed text-ink-600">
                Transforms full long-form challenges into high-speed 60–90s mini-documentaries. Cuts
                B-roll across the entire timeline with third-person hype narration and 100% clean studio
                audio.
              </p>
              <div className="space-y-1.5 pt-2 text-xs text-ink-700">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                  <span>60–90s+ Extended Runtime</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                  <span>3 Creative Script Angles (Hype, Numbers, Arc)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                  <span>100% Muted raw dialogue (Zero Bleed)</span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <Link
                to="/create?pipeline=story_recap"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-700 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-purple-800"
              >
                <span>Launch Story Recap</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Pipeline 3 Card */}
          <div className="glass-card glass-card-hover group flex flex-col justify-between rounded-2xl p-7">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                  <Sparkles className="h-6 w-6" />
                </div>
                <span className="badge-purple rounded-full px-3 py-1 text-xs font-semibold">
                  Pipeline 3
                </span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-ink-950 group-hover:text-purple-700 transition-colors">
                  Hook Injector
                </h3>
                <p className="text-xs font-medium text-purple-600">Hybrid Teaser Short</p>
              </div>
              <p className="text-xs leading-relaxed text-ink-600">
                Solves the first 3-second dropoff. Injects an AI-spoken curiosity hook with teaser B-roll
                before seamlessly releasing into the raw clip's full volume, closing with a punchy outro.
              </p>
              <div className="space-y-1.5 pt-2 text-xs text-ink-700">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                  <span>3–5s B-roll Teaser Hook</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                  <span>100% Native Speech Preserved</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                  <span>Continuous Hormozi Captions</span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <Link
                to="/create?pipeline=hook_injector"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-canvas-200 py-2.5 text-xs font-semibold text-ink-900 transition-colors group-hover:bg-purple-700 group-hover:text-white"
              >
                <span>Launch Hook Injector</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- How It Works Flowchart ---------------- */}
      <section className="rounded-3xl border border-canvas-300 bg-white p-8 sm:p-12 shadow-sm space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-ink-950">How ClipCut Studio Works</h2>
          <p className="mt-1 text-sm text-ink-600">From raw link to uploaded Short in 4 seamless steps.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3 rounded-2xl border border-canvas-200 bg-canvas-100 p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-700 text-xs font-bold text-white">
              01
            </div>
            <h4 className="font-bold text-ink-950">Ingest & Transcribe</h4>
            <p className="text-xs leading-relaxed text-ink-600">
              Provide a YouTube URL or MP4. Local Whisper extracts word-level timestamps and speaker diarization.
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-canvas-200 bg-canvas-100 p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-700 text-xs font-bold text-white">
              02
            </div>
            <h4 className="font-bold text-ink-950">The Director Fork</h4>
            <p className="text-xs leading-relaxed text-ink-600">
              Choose Gemini for 1-click autonomous generation, or copy your Job ID to Claude Desktop via MCP.
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-canvas-200 bg-canvas-100 p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-700 text-xs font-bold text-white">
              03
            </div>
            <h4 className="font-bold text-ink-950">Render & Frame</h4>
            <p className="text-xs leading-relaxed text-ink-600">
              FFmpeg renders 1080x1920 vertical video with neural voiceover, karaoke captions, and face tracking.
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-canvas-200 bg-canvas-100 p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-700 text-xs font-bold text-white">
              04
            </div>
            <h4 className="font-bold text-ink-950">Safe YouTube Drop</h4>
            <p className="text-xs leading-relaxed text-ink-600">
              Review playback in browser, check creator attribution, and publish with explicit Human-in-the-Loop consent.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- About & Open Source Attribution ---------------- */}
      <section className="rounded-3xl border border-purple-100 bg-gradient-to-br from-purple-50/70 via-white to-canvas-100 p-8 sm:p-10 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-700">
              <Cpu className="h-4 w-4" />
              <span>Engine Architecture & Credits</span>
            </div>
            <h3 className="text-xl font-bold text-ink-950">
              Powered by Open-Source AutoClip Core
            </h3>
            <p className="text-xs leading-relaxed text-ink-700">
              ClipCut Studio is built upon the foundational local video processing architecture created by{' '}
              <strong>AutoClip</strong>, extended with multi-agent MCP controls, 3-tier video pipelines,
              YouTube Data API scheduling, and channel retention analytics.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/autoclip"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-white px-4 py-2.5 text-xs font-semibold text-purple-900 shadow-sm hover:bg-purple-50"
            >
              <span>AutoClip Repository</span>
              <ExternalLink className="h-3.5 w-3.5 text-purple-600" />
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}

