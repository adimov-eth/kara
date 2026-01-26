import type { LegacyQueueState } from '@karaoke/types'
import type { BackgroundToContent, ContentToBackground } from './types.js'

let currentVideoId: string | null = null
let video: HTMLVideoElement | null = null
let queueState: LegacyQueueState | null = null
let endCheckInterval: number | null = null
let hasReportedEnd = false

function extractVideoId(url: string | null | undefined): string | null {
  if (!url) return null
  const normalizedUrl = url.trim()

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*&v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
  ]

  for (const pattern of patterns) {
    const match = normalizedUrl.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

function getVideoIdFromUrl(): string | null {
  try {
    const url = new URL(window.location.href)
    return url.searchParams.get('v')
  } catch {
    return null
  }
}

function sendToBackground(message: ContentToBackground): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Background might not be ready
  })
}

function handleMessage(msg: BackgroundToContent): void {
  switch (msg.type) {
    case 'play':
      playVideo(msg.videoId)
      break

    case 'state':
      queueState = msg.state
      verifyCurrentVideo()
      break
  }
}

function playVideo(videoId: string): void {
  const currentUrlVideoId = getVideoIdFromUrl()

  if (currentUrlVideoId !== videoId) {
    console.log('[Karaoke] Navigating to video:', videoId)
    window.location.href = `https://www.youtube.com/watch?v=${videoId}`
  }

  currentVideoId = videoId
  hasReportedEnd = false
  setupEndDetection()
}

function setupEndDetection(): void {
  // Clear any existing interval
  if (endCheckInterval) {
    clearInterval(endCheckInterval)
    endCheckInterval = null
  }

  video = document.querySelector('video')
  if (!video) {
    console.log('[Karaoke] Video element not found, will retry')
    // Retry after a short delay
    setTimeout(setupEndDetection, 1000)
    return
  }

  console.log('[Karaoke] Setting up end detection for video')

  // Strategy 1: onended event
  video.onended = () => {
    console.log('[Karaoke] Video ended (onended event)')
    handleVideoEnd()
  }

  // Strategy 2: Polling near end
  endCheckInterval = window.setInterval(() => {
    if (!video || hasReportedEnd) return

    const { currentTime, duration } = video

    // Check if we're near the end (within 0.5 seconds) and duration is valid
    if (duration > 0 && currentTime >= duration - 0.5) {
      console.log('[Karaoke] Video ended (polling detection)')
      handleVideoEnd()
    }
  }, 500)
}

function handleVideoEnd(): void {
  if (!currentVideoId || hasReportedEnd) return

  hasReportedEnd = true
  const endedVideoId = currentVideoId

  // Clear the interval
  if (endCheckInterval) {
    clearInterval(endCheckInterval)
    endCheckInterval = null
  }

  // 1. Optimistic: navigate to next video immediately
  const nextVideoId = getNextFromQueue()
  if (nextVideoId) {
    console.log('[Karaoke] Optimistically playing next video:', nextVideoId)
    playVideo(nextVideoId)
  }

  // 2. Report to server (will confirm or correct)
  sendToBackground({ type: 'videoEnded', videoId: endedVideoId })
}

function getNextFromQueue(): string | null {
  if (!queueState || queueState.queue.length === 0) return null
  const next = queueState.queue[0]
  return next ? extractVideoId(next.youtubeUrl) : null
}

function verifyCurrentVideo(): void {
  // Server sent new state - verify we're playing the right video
  if (!queueState?.nowPlaying) return

  const expectedVideoId = extractVideoId(queueState.nowPlaying.youtubeUrl)
  const actualVideoId = getVideoIdFromUrl()

  if (expectedVideoId && expectedVideoId !== actualVideoId) {
    console.log('[Karaoke] Video mismatch, navigating to correct video')
    console.log('[Karaoke] Expected:', expectedVideoId, 'Actual:', actualVideoId)
    playVideo(expectedVideoId)
  }
}

function observeVideoElement(): void {
  const observer = new MutationObserver(() => {
    const newVideo = document.querySelector('video')
    if (newVideo && newVideo !== video) {
      console.log('[Karaoke] New video element detected')
      video = newVideo
      setupEndDetection()
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((msg: BackgroundToContent, _sender, sendResponse) => {
  handleMessage(msg)
  sendResponse({ ok: true })
  return true
})

// Initialize
console.log('[Karaoke] Content script loaded')

// Start observing for video elements
observeVideoElement()

// If we're already on a video page, set up end detection
const initialVideoId = getVideoIdFromUrl()
if (initialVideoId) {
  currentVideoId = initialVideoId
  setupEndDetection()
}

// Notify background that we're ready
sendToBackground({ type: 'ready' })
