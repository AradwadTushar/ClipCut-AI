import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

export function startInteractiveTour(navigate?: (path: string) => void) {
  // If not on /create, transition to /create so all interactive pipeline & ingestion elements are live
  if (navigate && window.location.pathname !== '/create') {
    navigate('/create')
    setTimeout(() => runTour(), 250)
    return
  }

  runTour()
}

function runTour() {
  const steps: DriveStep[] = [
    {
      element: '#brand-logo',
      popover: {
        title: 'Welcome to ClipCut AI',
        description:
          'Your autonomous vertical content engine. ClipCut transforms long YouTube videos, podcasts, and streams into high-retention 9:16 Shorts with animated captions and speaker face-tracking.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '#pipeline-selector',
      popover: {
        title: '3 Dedicated AI Pipelines',
        description:
          'Choose your storytelling format: Viral Cut (speaker tracking & highlights), Story Recap (60–90s B-roll narration), or Hook Injector (punchy 4-second curiosity opener).',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '#ingest-card',
      popover: {
        title: 'Drop Video or Paste Link',
        description:
          'Paste any YouTube, Vimeo, or direct video URL — or drag-and-drop raw footage up to 4K. ClipCut handles transcription with WhisperX word-level precision.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: '#nav-history',
      popover: {
        title: 'History & Candidate Vault',
        description:
          'Review previously processed jobs, preview rendered candidate highlights, re-export with different caption themes, and inspect timestamps anytime.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '#nav-analytics',
      popover: {
        title: 'YouTube Shorts Analytics',
        description:
          'Monitor audience retention rates (APV), subscriber growth, and peak velocity directly from the official YouTube Analytics API.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '#nav-settings',
      popover: {
        title: 'Preferences & Smart Cadence',
        description:
          'Configure your daily Shorts quota, set custom high-traffic posting times, choose your Whisper speech model, and verify GPU hardware acceleration.',
        side: 'bottom',
        align: 'center',
      },
    },
  ]

  // Filter only elements currently in the DOM
  const activeSteps = steps.filter((s) => {
    if (typeof s.element === 'string') {
      return document.querySelector(s.element) !== null
    }
    return true
  })

  const driverObj = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    smoothScroll: true,
    overlayColor: '#090d16',
    overlayOpacity: 0.72,
    stagePadding: 8,
    stageRadius: 16,
    popoverOffset: 14,
    popoverClass: 'clipcut-tour-popover',
    doneBtnText: 'Finish Tour',
    nextBtnText: 'Next →',
    prevBtnText: '← Back',
    progressText: '{{current}} of {{total}}',
    steps: activeSteps.length > 0 ? activeSteps : steps,
  })

  driverObj.drive()
}
