import type { QueueState } from '@karaoke/types'
import type { BackgroundToContent, ContentToBackground } from './types.js'

let currentVideoId: string | null = null
let currentEntryId: string | null = null
let video: HTMLVideoElement | null = null
let queueState: QueueState | null = null
let joinUrl: string | null = null
let roomId: string | null = null
let connected = false
let endCheckInterval: number | null = null
let hasReportedEnd = false

let overlayRoot: HTMLDivElement | null = null
let overlayTitle: HTMLDivElement | null = null
let overlaySinger: HTMLDivElement | null = null
let overlayRoom: HTMLDivElement | null = null
let overlayStatus: HTMLDivElement | null = null
let overlayQr: HTMLImageElement | null = null
let autoplayButton: HTMLButtonElement | null = null

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
      playVideo(msg.videoId, msg.entryId)
      break

    case 'state':
      queueState = msg.state
      joinUrl = msg.joinUrl
      roomId = msg.roomId
      connected = msg.connected
      updateOverlay()
      verifyCurrentVideo()
      break
  }
}

function playVideo(videoId: string, entryId?: string): void {
  const currentUrlVideoId = getVideoIdFromUrl()

  if (currentUrlVideoId !== videoId) {
    console.log('[Karaoke] Navigating to video:', videoId)
    window.location.href = `https://www.youtube.com/watch?v=${videoId}`
  }

  currentVideoId = videoId
  currentEntryId = entryId ?? null
  hasReportedEnd = false
  setupEndDetection()
}

function setupEndDetection(): void {
  if (endCheckInterval) {
    clearInterval(endCheckInterval)
    endCheckInterval = null
  }

  video = document.querySelector('video')
  if (!video) {
    console.log('[Karaoke] Video element not found, will retry')
    setTimeout(setupEndDetection, 1000)
    return
  }

  console.log('[Karaoke] Setting up end detection for video')

  video.onended = () => {
    console.log('[Karaoke] Video ended (onended event)')
    handleVideoEnd()
  }

  endCheckInterval = window.setInterval(() => {
    if (!video || hasReportedEnd) return

    const { currentTime, duration } = video
    if (duration > 0 && currentTime >= duration - 0.5) {
      console.log('[Karaoke] Video ended (polling detection)')
      handleVideoEnd()
    }
  }, 500)

  tryPlay()
}

async function tryPlay(): Promise<void> {
  if (!video) return
  try {
    await video.play()
    hideAutoplayPrompt()
  } catch {
    showAutoplayPrompt()
  }
}

function handleVideoEnd(): void {
  if (!currentVideoId || hasReportedEnd) return

  hasReportedEnd = true
  const endedVideoId = currentVideoId
  const endedEntryId = currentEntryId ?? undefined

  if (endCheckInterval) {
    clearInterval(endCheckInterval)
    endCheckInterval = null
  }

  sendToBackground({ type: 'videoEnded', videoId: endedVideoId, entryId: endedEntryId })
}

function verifyCurrentVideo(): void {
  if (!queueState?.nowPlaying) return

  const expectedVideoId = queueState.nowPlaying.videoId
  const actualVideoId = getVideoIdFromUrl()

  if (expectedVideoId && expectedVideoId !== actualVideoId) {
    console.log('[Karaoke] Video mismatch, navigating to correct video')
    playVideo(expectedVideoId, queueState.nowPlaying.id)
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

function ensureOverlay(): void {
  if (overlayRoot) return

  const style = document.createElement('style')
  style.textContent = `
    #karaoke-overlay {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #f0f0f5;
      pointer-events: none;
    }
    #karaoke-overlay .panel {
      background: rgba(10, 10, 15, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 12px 14px;
      width: 260px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    }
    #karaoke-overlay .title {
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #karaoke-overlay .singer {
      font-size: 0.8rem;
      color: rgba(240, 240, 245, 0.7);
      margin-bottom: 8px;
    }
    #karaoke-overlay .room {
      font-size: 0.75rem;
      color: rgba(240, 240, 245, 0.7);
      margin-bottom: 6px;
    }
    #karaoke-overlay .status {
      font-size: 0.75rem;
      color: rgba(240, 240, 245, 0.7);
    }
    #karaoke-overlay img.qr {
      width: 120px;
      height: 120px;
      border-radius: 8px;
      background: #fff;
      padding: 4px;
      margin-top: 8px;
    }
    #karaoke-autoplay {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255, 107, 157, 0.95);
      color: #0a0a0f;
      border: none;
      border-radius: 999px;
      padding: 12px 18px;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      z-index: 2147483647;
      pointer-events: auto;
      display: none;
    }
  `
  document.head.appendChild(style)

  overlayRoot = document.createElement('div')
  overlayRoot.id = 'karaoke-overlay'

  const panel = document.createElement('div')
  panel.className = 'panel'

  overlayTitle = document.createElement('div')
  overlayTitle.className = 'title'

  overlaySinger = document.createElement('div')
  overlaySinger.className = 'singer'

  overlayRoom = document.createElement('div')
  overlayRoom.className = 'room'

  overlayStatus = document.createElement('div')
  overlayStatus.className = 'status'

  overlayQr = document.createElement('img')
  overlayQr.className = 'qr'

  panel.appendChild(overlayTitle)
  panel.appendChild(overlaySinger)
  panel.appendChild(overlayRoom)
  panel.appendChild(overlayStatus)
  panel.appendChild(overlayQr)
  overlayRoot.appendChild(panel)
  document.body.appendChild(overlayRoot)

  autoplayButton = document.createElement('button')
  autoplayButton.id = 'karaoke-autoplay'
  autoplayButton.textContent = 'Click to start playback'
  autoplayButton.addEventListener('click', () => {
    hideAutoplayPrompt()
    tryPlay()
  })
  document.body.appendChild(autoplayButton)
}

function updateOverlay(): void {
  ensureOverlay()
  if (!overlayTitle || !overlaySinger || !overlayRoom || !overlayStatus || !overlayQr) return

  const nowPlaying = queueState?.nowPlaying
  overlayTitle.textContent = nowPlaying?.title ?? 'Nothing playing'
  overlaySinger.textContent = nowPlaying?.name ?? ''
  overlayRoom.textContent = roomId ? `Room: ${roomId}` : 'Room: -'
  overlayStatus.textContent = connected ? 'Connected' : 'Offline'

  if (joinUrl) {
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}&bgcolor=0a0a0f&color=ffffff`
    overlayQr.src = qrSrc
    overlayQr.style.display = 'block'
  } else {
    overlayQr.style.display = 'none'
  }
}

function showAutoplayPrompt(): void {
  ensureOverlay()
  if (autoplayButton) autoplayButton.style.display = 'block'
}

function hideAutoplayPrompt(): void {
  if (autoplayButton) autoplayButton.style.display = 'none'
}

chrome.runtime.onMessage.addListener((msg: BackgroundToContent, _sender, sendResponse) => {
  handleMessage(msg)
  sendResponse({ ok: true })
  return true
})

console.log('[Karaoke] Content script loaded')

observeVideoElement()

const initialVideoId = getVideoIdFromUrl()
if (initialVideoId) {
  currentVideoId = initialVideoId
  setupEndDetection()
}

sendToBackground({ type: 'ready' })
