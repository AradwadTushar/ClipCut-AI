interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  showBadge?: boolean
  className?: string
}

export function ClipCutLogo({ size = 'md', showBadge = true, className = '' }: LogoProps) {
  const iconSizes = {
    sm: 'h-7 w-7',
    md: 'h-9 w-9',
    lg: 'h-12 w-12',
  }

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-3xl',
  }

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Geometric SVG Brandmark */}
      <div
        className={`relative flex items-center justify-center rounded-xl bg-gradient-to-tr from-purple-800 via-purple-600 to-indigo-600 shadow-md shadow-purple-500/25 ring-1 ring-purple-400/30 transition-transform duration-300 group-hover:scale-105 ${iconSizes[size]}`}
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-[68%] w-[68%] drop-shadow-sm"
        >
          {/* Top Left Blade */}
          <path
            d="M6 8L20 4L14 15L6 8Z"
            fill="url(#blade-gradient-1)"
          />
          {/* Bottom Right Blade / Play chevron */}
          <path
            d="M14 17L26 24L12 28L14 17Z"
            fill="url(#blade-gradient-2)"
          />
          {/* Center Electric Energy Spark / Play Triangle */}
          <path
            d="M12 9L23 16L12 23V9Z"
            fill="white"
            fillOpacity="0.95"
          />
          {/* Accent Neon Flare */}
          <circle cx="23" cy="16" r="2.5" fill="#F43F5E" />

          <defs>
            <linearGradient id="blade-gradient-1" x1="6" y1="4" x2="20" y2="15" gradientUnits="userSpaceOnUse">
              <stop stopColor="#DDD6FE" />
              <stop offset="1" stopColor="#C084FC" />
            </linearGradient>
            <linearGradient id="blade-gradient-2" x1="12" y1="17" x2="26" y2="28" gradientUnits="userSpaceOnUse">
              <stop stopColor="#818CF8" />
              <stop offset="1" stopColor="#4F46E5" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Brand Text & Optional Studio Badge */}
      <div className="flex items-baseline gap-1.5">
        <span className={`font-black tracking-tight text-ink-950 font-display ${textSizes[size]}`}>
          Clip<span className="text-purple-700">Cut</span>
        </span>
        {showBadge && (
          <span className="rounded-md bg-purple-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-purple-800 ring-1 ring-purple-300/60">
            Studio
          </span>
        )}
      </div>
    </div>
  )
}

