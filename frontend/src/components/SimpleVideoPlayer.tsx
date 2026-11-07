import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { formatTimecode, type CaptionStyle, type CropPath, type Word } from '../api'

interface Props {
  src: string
  isExport: boolean
  startS?: number
  endS?: number
  words?: Word[]
  style?: CaptionStyle
  ratio?: string
  cropPath?: CropPath | null
}

export function SimpleVideoPlayer({
  src,
  isExport,
  startS = 0,
  endS = 0,
  words = [],
  style,
  ratio = '9:16',
  cropPath,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(startS)
  const [duration, setDuration] = useState(Math.max(0.1, endS - startS))
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSeeking, setIsSeeking] = useState(false)

  // Re-sync start time when src or clip boundary changes
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!isExport) {
      video.currentTime = startS
      setCurrentTime(startS)
      setDuration(Math.max(0.1, endS - startS))
    } else {
      video.currentTime = 0
      setCurrentTime(0)
    }
    setPlaying(false)
    video.pause()
  }, [src, startS, endS, isExport])

  // Volume & Mute Sync
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = volume
    video.muted = muted
  }, [volume, muted])

  const handleLoadedMetadata = () => {
    const video = videoRef.current
    if (!video) return
    if (isExport) {
      setDuration(video.duration || 1)
      setCurrentTime(0)
    } else {
      setDuration(Math.max(0.1, endS - startS))
      setCurrentTime(startS)
    }
  }

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video || isSeeking) return

    if (!isExport) {
      if (video.currentTime >= endS) {
        video.pause()
        video.currentTime = startS
        setPlaying(false)
        setCurrentTime(startS)
        return
      }
      setCurrentTime(video.currentTime)
    } else {
      setCurrentTime(video.currentTime)
      if (video.ended) {
        setPlaying(false)
      }
    }
  }, [endS, isExport, isSeeking, startS])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      if (!isExport && (video.currentTime < startS || video.currentTime >= endS)) {
        video.currentTime = startS
      }
      video.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    } else {
      video.pause()
      setPlaying(false)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return
    const val = parseFloat(e.target.value)

    if (isExport) {
      video.currentTime = val
      setCurrentTime(val)
    } else {
      const realTime = startS + val
      video.currentTime = realTime
      setCurrentTime(realTime)
    }
  }

  const toggleMute = () => {
    setMuted((prev) => !prev)
  }

  const toggleFullscreen = () => {
    const container = containerRef.current
    if (!container) return

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  const elapsed = isExport ? currentTime : Math.max(0, currentTime - startS)
  const currentDuration = isExport ? (videoRef.current?.duration || duration) : duration

  // Dynamic Crop style for draft clips
  const cropStyle = !isExport ? cropWindowStyle(cropPath, elapsed) : null

  return (
    <div ref={containerRef} className="w-full flex flex-col items-center">
      {/* Video Screen Container - Clean & Simple */}
      <div
        onClick={togglePlay}
        className="group relative flex items-center justify-center overflow-hidden rounded-2xl bg-black shadow-md border border-canvas-200 cursor-pointer select-none"
        style={{
          aspectRatio: ratio === '1:1' ? '1/1' : ratio === '16:9' ? '16/9' : '9/16',
          maxHeight: ratio === '16:9' ? '280px' : ratio === '1:1' ? '360px' : '430px',
          width: 'auto',
        }}
      >
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="auto"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className={cropStyle ? 'absolute max-w-none' : 'h-full w-full object-contain'}
          style={cropStyle ?? undefined}
        />

        {/* Live Animated Caption Overlay (Draft Mode) */}
        {!isExport && style && words.length > 0 && (
          <CaptionOverlay words={words} time={currentTime} style={style} />
        )}

        {/* Center Play Button Overlay on Pause */}
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-purple-700/85 text-white shadow-xl backdrop-blur-sm transition-transform hover:scale-110">
              <Play className="h-7 w-7 translate-x-0.5 fill-current" />
            </div>
          </div>
        )}
      </div>

      {/* Streamlined Transport Bar */}
      <div className="mt-3 flex w-full max-w-lg items-center gap-3 rounded-xl border border-canvas-200 bg-white px-3.5 py-2 shadow-xs">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-700 hover:bg-canvas-100 hover:text-purple-700 transition-colors"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
        </button>

        {/* Scrubber Timeline Bar */}
        <div className="relative flex-1 flex items-center">
          <input
            type="range"
            min={0}
            max={currentDuration}
            step={0.05}
            value={Math.min(elapsed, currentDuration)}
            onMouseDown={() => setIsSeeking(true)}
            onMouseUp={() => setIsSeeking(false)}
            onChange={handleSeek}
            className="w-full h-1.5 appearance-none rounded-full bg-canvas-200 accent-purple-700 cursor-pointer"
          />
        </div>

        {/* Timecode */}
        <div className="shrink-0 font-mono text-xs text-ink-600">
          <span className="font-semibold text-ink-900">{formatTimecode(elapsed)}</span> /{' '}
          <span>{formatTimecode(currentDuration)}</span>
        </div>

        {/* Volume & Mute */}
        <div className="flex items-center gap-1.5 border-l border-canvas-200 pl-2">
          <button
            type="button"
            onClick={toggleMute}
            className="p-1 text-ink-600 hover:text-purple-700"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted || volume === 0 ? <VolumeX className="h-4 w-4 text-red-500" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const val = parseFloat(e.target.value)
              setVolume(val)
              if (val > 0) setMuted(false)
            }}
            className="w-14 h-1 appearance-none rounded-full bg-canvas-200 accent-purple-700 cursor-pointer"
          />
        </div>

        {/* Fullscreen Toggle */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-1 text-ink-600 hover:text-purple-700 transition-colors"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

/** Interpolate and calculate crop window for draft clips */
function cropWindowStyle(
  cropPath: CropPath | null | undefined,
  elapsed: number,
): React.CSSProperties | null {
  if (!cropPath || cropPath.segments.length === 0) return null

  const segment =
    cropPath.segments.find((s) => elapsed >= s.start_s && elapsed < s.end_s) ??
    cropPath.segments[cropPath.segments.length - 1]

  if (segment.fit) return null

  const { x, y } = interpolate(segment.keyframes, elapsed)
  const { source_width: sourceW, source_height: sourceH } = cropPath

  return {
    width: `${(sourceW / segment.width) * 100}%`,
    height: `${(sourceH / segment.height) * 100}%`,
    left: `${(-x / segment.width) * 100}%`,
    top: `${(-y / segment.height) * 100}%`,
  }
}

function interpolate(
  keyframes: { t: number; x: number; y: number }[],
  t: number,
): { x: number; y: number } {
  if (keyframes.length === 0) return { x: 0, y: 0 }
  if (keyframes.length === 1) return { x: keyframes[0].x, y: keyframes[0].y }

  if (t <= keyframes[0].t) return { x: keyframes[0].x, y: keyframes[0].y }
  const last = keyframes[keyframes.length - 1]
  if (t >= last.t) return { x: last.x, y: last.y }

  for (let i = 0; i < keyframes.length - 1; i += 1) {
    const a = keyframes[i]
    const b = keyframes[i + 1]
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t
      const ratio = span > 0 ? (t - a.t) / span : 0
      return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio }
    }
  }

  return { x: last.x, y: last.y }
}

/** Group words for animated caption overlay */
function CaptionOverlay({
  words,
  time,
  style,
}: {
  words: Word[]
  time: number
  style: CaptionStyle | undefined
}) {
  if (!style || words.length === 0) return null

  const groups = groupWords(words, style.preview.maxWords)
  const active = groups.find((group) => time >= group[0].start && time <= group[group.length - 1].end)
  if (!active) return null

  const { primary, accent, allCaps, outlineWidth, boxed, marginRatio, sizeRatio } = style.preview

  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex justify-center px-[6%]"
      style={{ bottom: `${marginRatio * 100}%` }}
    >
      <p
        className="text-center leading-[1.15]"
        style={{
          fontFamily: style.preview.font === 'Anton' ? 'Anton, Impact, sans-serif' : undefined,
          fontSize: `clamp(0.75rem, ${sizeRatio * 100}cqh, 2.5rem)`,
          fontWeight: boxed || style.preview.font === 'Anton' ? 400 : 700,
          textTransform: allCaps ? 'uppercase' : 'none',
          color: primary,
          textShadow: boxed
            ? undefined
            : `0 0 ${outlineWidth}px #000, 0 0 ${outlineWidth * 2}px #000`,
          background: boxed ? 'rgba(0,0,0,0.85)' : undefined,
          padding: boxed ? '0.2em 0.5em' : undefined,
        }}
      >
        {active.map((word, index) => {
          const isActive = time >= word.start && time <= word.end
          return (
            <span
              key={`${word.start}-${index}`}
              style={{
                color: isActive && accent ? accent : undefined,
                display: 'inline-block',
                transform: isActive && accent ? 'scale(1.1)' : undefined,
                transition: 'transform 100ms ease-out',
                marginInline: '0.12em',
              }}
            >
              {allCaps ? word.text.toUpperCase() : word.text}
            </span>
          )
        })}
      </p>
    </div>
  )
}

function groupWords(words: Word[], maxWords: number): Word[][] {
  const groups: Word[][] = []
  let current: Word[] = []

  for (const [index, word] of words.entries()) {
    if (current.length > 0) {
      const gap = word.start - current[current.length - 1].end
      if (gap > 0.4 || current.length >= maxWords) {
        groups.push(current)
        current = []
      }
    }
    current.push(word)
    if (/[.!?…]$/.test(word.text.trim()) && index !== words.length - 1) {
      groups.push(current)
      current = []
    }
  }
  if (current.length > 0) groups.push(current)
  return groups
}
