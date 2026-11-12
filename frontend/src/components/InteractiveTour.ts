import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

export function startInteractiveTour() {
  const driverObj = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    doneBtnText: 'Finish Tour',
    nextBtnText: 'Next →',
    prevBtnText: '← Back',
    steps: [
      {
        element: '#brand-logo',
        popover: {
          title: 'Welcome to ClipCut AI',
          description:
            'Autonomous video repurposing pipeline. ClipCut transforms long YouTube videos into viral 9:16 vertical Shorts with animated captions and speaker face-tracking.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#pipeline-selector',
        popover: {
          title: '3 Dedicated Pipelines',
          description:
            'Choose between Viral Cut (speaker tracking & highlights), Story Recap (B-roll narration hype), or Hook Injector (punchy curiosity opener).',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '#ingest-card',
        popover: {
          title: 'Drop Video or Paste Link',
          description:
            'Paste any YouTube, Vimeo, or direct video URL — or drag-and-drop raw footage up to 4K. Audio is transcribed with WhisperX word-level precision.',
          side: 'top',
          align: 'center',
        },
      },
      {
        element: '#nav-history',
        popover: {
          title: 'History & Candidate Vault',
          description:
            'Review previously processed videos, re-render with different caption themes, and inspect transcript timestamps anytime.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '#nav-analytics',
        popover: {
          title: 'YouTube Shorts Analytics',
          description:
            'Track audience retention (APV), subscriber growth, and peak engagement windows directly from the official YouTube Analytics API.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '#nav-settings',
        popover: {
          title: 'Preferences & Smart Cadence',
          description:
            'Set your daily Shorts quota, customize high-retention posting times, select Whisper speech models, and verify NVIDIA GPU acceleration.',
          side: 'bottom',
          align: 'center',
        },
      },
    ],
  })

  driverObj.drive()
}
