import type { QueueState } from '@karaoke/types'
import type { ExtensionToServer, BackgroundToContent, ContentToBackground, StoredState } from './types.js'

const WS_URL = 'wss://karaoke-queue.boris-47d.workers.dev/?upgrade=websocket&clientType=extension'
const MAX_RECONNECT_DELAY = 30000
const KEEPALIVE_INTERVAL = 0.5 // minutes

let ws: WebSocket | null = null
let reconnectAttempts = 0
let queueState: QueueState | null = null

async function saveState(state: Partial<StoredState>): Promise<void> {
  await chrome.storage.local.set(state)
}

async function connect(): Promise<void> {
  if (ws && ws.readyState === WebSocket.OPEN) return

  console.log('[Karaoke] Connecting to WebSocket...')

  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    console.log('[Karaoke] WebSocket connected')
    reconnectAttempts = 0
    ws!.send(JSON.stringify({ kind: 'subscribe', clientType: 'extension' } satisfies ExtensionToServer))

    // Start keepalive alarm
    chrome.alarms.create('keepalive', { periodInMinutes: KEEPALIVE_INTERVAL })

    saveState({ connected: true })
  }

  ws.onmessage = (event) => {
    handleMessage(event.data as string)
  }

  ws.onclose = () => {
    console.log('[Karaoke] WebSocket closed')
    ws = null
    saveState({ connected: false })
    scheduleReconnect()
  }

  ws.onerror = (error) => {
    console.error('[Karaoke] WebSocket error:', error)
  }
}

function scheduleReconnect(): void {
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY)
  reconnectAttempts++
  console.log(`[Karaoke] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
  chrome.alarms.create('reconnect', { delayInMinutes: delay / 60000 })
}

function handleMessage(data: string): void {
  try {
    const msg = JSON.parse(data) as { kind: string; state?: QueueState }

    switch (msg.kind) {
      case 'state':
        if (msg.state) {
          const previousNowPlaying = queueState?.nowPlaying
          queueState = msg.state
          saveState({ queueState: msg.state })

          // Forward state to content script
          sendToYouTubeTabs({ type: 'state', state: msg.state })

          // If nowPlaying changed, send play command
          if (msg.state.nowPlaying) {
            const newVideoId = msg.state.nowPlaying.videoId
            const oldVideoId = previousNowPlaying?.videoId ?? null

            if (newVideoId && newVideoId !== oldVideoId) {
              console.log('[Karaoke] Now playing changed, sending play command:', newVideoId)
              sendToYouTubeTabs({ type: 'play', videoId: newVideoId })
            }
          }
        }
        break

      case 'pong':
        // Connection still alive
        break

      default:
        console.log('[Karaoke] Unknown message kind:', msg.kind)
    }
  } catch (err) {
    console.error('[Karaoke] Failed to parse message:', err)
  }
}

function handleVideoEnded(videoId: string): void {
  console.log('[Karaoke] Video ended:', videoId)

  // Report to server
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ kind: 'ended', videoId } satisfies ExtensionToServer))
  }
}

function handleVideoError(videoId: string, reason: string): void {
  console.log('[Karaoke] Video error:', videoId, reason)

  // Report to server
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ kind: 'error', videoId, reason } satisfies ExtensionToServer))
  }
}

function sendPing(): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ kind: 'ping' } satisfies ExtensionToServer))
  }
}

async function sendToYouTubeTabs(msg: BackgroundToContent): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' })
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {
          // Tab might not have content script loaded yet
        })
      }
    }
  } catch (err) {
    console.error('[Karaoke] Failed to send to YouTube tabs:', err)
  }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message: ContentToBackground, _sender, sendResponse) => {
  switch (message.type) {
    case 'videoEnded':
      handleVideoEnded(message.videoId)
      break

    case 'videoError':
      handleVideoError(message.videoId, message.reason)
      break

    case 'ready':
      // Content script is ready, send current state if we have it
      if (queueState) {
        sendToYouTubeTabs({ type: 'state', state: queueState })
        if (queueState.nowPlaying?.videoId) {
          sendToYouTubeTabs({ type: 'play', videoId: queueState.nowPlaying.videoId })
        }
      }
      break
  }

  sendResponse({ ok: true })
  return true
})

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'reconnect') {
    connect()
  }
  if (alarm.name === 'keepalive') {
    sendPing()
  }
})

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[Karaoke] Extension started')
  connect()
})

// Handle extension install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Karaoke] Extension installed')
  connect()
})

// Initial connection
connect()
