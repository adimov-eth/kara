import type { QueueState } from '@karaoke/types'
import type {
  ExtensionToServer,
  ServerToExtension,
  BackgroundToContent,
  ContentToBackground,
  StoredState,
  ExtensionConfig,
} from './types.js'

const MAX_RECONNECT_DELAY = 30000
const KEEPALIVE_INTERVAL = 0.5 // minutes
const CONFIG_KEY = 'extensionConfig'
const START_DEBOUNCE_MS = 5000

let ws: WebSocket | null = null
let reconnectAttempts = 0
let queueState: QueueState | null = null
let config: ExtensionConfig | null = null
let playbackTabId: number | null = null
let lastNowPlayingId: string | null = null
let lastEntryId: string | null = null
let startRequestInFlight = false
let lastStartRequestAt = 0
let joinUrl: string | null = null
let extensionAuthorized = false
let shouldReconnect = true

type PopupMessage =
  | { type: 'saveConfig'; config: ExtensionConfig }
  | { type: 'connect' }
  | { type: 'disconnect' }
  | { type: 'openTab' }

async function saveState(state: Partial<StoredState>): Promise<void> {
  await chrome.storage.local.set(state)
}

async function loadConfig(): Promise<ExtensionConfig | null> {
  const stored = await chrome.storage.local.get([CONFIG_KEY])
  const storedConfig = stored[CONFIG_KEY] as ExtensionConfig | undefined
  if (!storedConfig) return null
  return storedConfig
}

async function persistConfig(nextConfig: ExtensionConfig): Promise<void> {
  config = nextConfig
  playbackTabId = nextConfig.playbackTabId ?? null
  joinUrl = buildJoinUrl(nextConfig)
  await chrome.storage.local.set({ [CONFIG_KEY]: nextConfig })
}

function buildJoinUrl(cfg: ExtensionConfig): string {
  const base = cfg.serverOrigin.replace(/\/$/, '')
  if (cfg.roomId === 'default') return base
  return `${base}/${cfg.roomId}`
}

function buildWsUrl(cfg: ExtensionConfig): string {
  const url = new URL(cfg.serverOrigin)
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${url.host}/?upgrade=websocket&room=${encodeURIComponent(cfg.roomId)}&clientType=extension`
}

function getClientVersion(): string {
  return chrome.runtime.getManifest().version
}

async function connect(): Promise<void> {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  shouldReconnect = true

  if (!config) {
    config = await loadConfig()
    if (config) {
      playbackTabId = config.playbackTabId ?? null
      joinUrl = buildJoinUrl(config)
    }
  }

  if (!config || !config.serverOrigin || !config.roomId || !config.playerToken) {
    await saveState({ connected: false, connectionError: 'Missing configuration' })
    return
  }

  const wsUrl = buildWsUrl(config)

  console.log('[Karaoke] Connecting to WebSocket...', wsUrl)
  ws = new WebSocket(wsUrl)

  ws.onopen = async () => {
    console.log('[Karaoke] WebSocket connected')
    reconnectAttempts = 0
    extensionAuthorized = false
    await saveState({ connected: false, connectionError: null })

    const hello: ExtensionToServer = {
      kind: 'subscribe',
      clientType: 'extension',
      playerToken: config?.playerToken,
      clientVersion: getClientVersion(),
    }
    ws!.send(JSON.stringify(hello))

    chrome.alarms.create('keepalive', { periodInMinutes: KEEPALIVE_INTERVAL })
    sendOverlayState()
  }

  ws.onmessage = (event) => {
    handleMessage(event.data as string)
  }

  ws.onclose = (event) => {
    console.log('[Karaoke] WebSocket closed')
    ws = null
    extensionAuthorized = false
    if (event.code === 4001) {
      shouldReconnect = false
      saveState({ connected: false, connectionError: 'Invalid player token' })
    } else {
      saveState({ connected: false })
    }
    sendOverlayState()
    if (shouldReconnect) {
      scheduleReconnect()
    }
  }

  ws.onerror = (error) => {
    console.error('[Karaoke] WebSocket error:', error)
  }
}

function disconnect(): void {
  shouldReconnect = false
  extensionAuthorized = false
  if (ws) {
    try {
      ws.close()
    } catch {
      // Ignore close errors
    }
    ws = null
  }
  chrome.alarms.clear('keepalive')
  chrome.alarms.clear('reconnect')
  saveState({ connected: false })
  sendOverlayState()
}

function scheduleReconnect(): void {
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY)
  reconnectAttempts++
  console.log(`[Karaoke] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
  chrome.alarms.create('reconnect', { delayInMinutes: delay / 60000 })
}

function handleMessage(data: string): void {
  try {
    const msg = JSON.parse(data) as ServerToExtension

    switch (msg.kind) {
      case 'extensionAuthorized':
        extensionAuthorized = true
        saveState({ connected: true, connectionError: null })
        sendOverlayState()
        break

      case 'state':
        if (!extensionAuthorized) {
          extensionAuthorized = true
          saveState({ connected: true, connectionError: null })
        }
        handleState(msg.state)
        break

      case 'pong':
        break

      case 'error': {
        const lower = msg.message.toLowerCase()
        const tokenError = lower.includes('token') || lower.includes('unauthorized')
        extensionAuthorized = false
        saveState({ connected: false, connectionError: msg.message })
        sendOverlayState()
        if (tokenError) {
          shouldReconnect = false
          try {
            ws?.close(4001, 'unauthorized')
          } catch {
            // Ignore close errors
          }
        }
        break
      }

      default:
        console.log('[Karaoke] Unknown message kind:', (msg as { kind?: string }).kind)
    }
  } catch (err) {
    console.error('[Karaoke] Failed to parse message:', err)
  }
}

async function handleState(state: QueueState): Promise<void> {
  queueState = state
  await saveState({ queueState: state })

  const nowPlaying = state.nowPlaying
  const newVideoId = nowPlaying?.videoId ?? null
  const newEntryId = nowPlaying?.id ?? null

  if (newVideoId && (newVideoId !== lastNowPlayingId || newEntryId !== lastEntryId)) {
    await ensurePlaybackTab(true)
    await sendToPlaybackTab({ type: 'play', videoId: newVideoId, entryId: newEntryId ?? undefined })
  }

  lastNowPlayingId = newVideoId
  lastEntryId = newEntryId

  await sendOverlayState()
  await requestStartIfIdle(state)
}

async function requestStartIfIdle(state: QueueState): Promise<void> {
  if (!config) return
  if (state.nowPlaying || state.queue.length === 0) {
    startRequestInFlight = false
    return
  }

  const now = Date.now()
  if (startRequestInFlight || now - lastStartRequestAt < START_DEBOUNCE_MS) return

  startRequestInFlight = true
  lastStartRequestAt = now

  try {
    await fetch(`${config.serverOrigin.replace(/\/$/, '')}/api/next?room=${encodeURIComponent(config.roomId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentId: null }),
    })
  } catch (err) {
    console.error('[Karaoke] Failed to request next:', err)
  } finally {
    startRequestInFlight = false
  }
}

function sendPing(): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ kind: 'ping' } satisfies ExtensionToServer))
  }
}

async function sendOverlayState(): Promise<void> {
  const connected = extensionAuthorized && ws?.readyState === WebSocket.OPEN
  await sendToPlaybackTab({
    type: 'state',
    state: queueState,
    joinUrl,
    roomId: config?.roomId ?? null,
    connected: Boolean(connected),
  })
}

async function sendToPlaybackTab(msg: BackgroundToContent): Promise<void> {
  if (!playbackTabId) return
  try {
    await chrome.tabs.sendMessage(playbackTabId, msg)
  } catch {
    // Tab might not be ready or content script not loaded
  }
}

async function ensurePlaybackTab(active: boolean): Promise<number | null> {
  if (!config) return null

  if (playbackTabId) {
    try {
      const tab = await chrome.tabs.get(playbackTabId)
      if (tab?.id) {
        if (active) {
          chrome.tabs.update(playbackTabId, { active: true })
        }
        return playbackTabId
      }
    } catch {
      playbackTabId = null
    }
  }

  const tab = await chrome.tabs.create({ url: 'https://www.youtube.com', active })
  if (tab.id) {
    playbackTabId = tab.id
    await persistConfig({
      ...(config ?? { serverOrigin: '', roomId: '', playerToken: '' }),
      playbackTabId,
    })
  }
  return playbackTabId
}

chrome.runtime.onMessage.addListener((message: ContentToBackground | PopupMessage, _sender, sendResponse) => {
  switch (message.type) {
    case 'videoEnded':
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ kind: 'ended', videoId: message.videoId, entryId: message.entryId } satisfies ExtensionToServer))
      }
      break

    case 'videoError':
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          kind: 'error',
          videoId: message.videoId,
          reason: message.reason,
          entryId: message.entryId,
        } satisfies ExtensionToServer))
      }
      break

    case 'ready':
      sendOverlayState()
      if (queueState?.nowPlaying?.videoId) {
        sendToPlaybackTab({
          type: 'play',
          videoId: queueState.nowPlaying.videoId,
          entryId: queueState.nowPlaying.id,
        })
      }
      break

    case 'saveConfig':
      if (message.config) {
        persistConfig(message.config)
        disconnect()
        connect()
      }
      break

    case 'connect':
      shouldReconnect = true
      connect()
      break

    case 'disconnect':
      disconnect()
      break

    case 'openTab':
      ensurePlaybackTab(true)
      break
  }

  sendResponse({ ok: true })
  return true
})

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === playbackTabId) {
    playbackTabId = null
    if (config) {
      persistConfig({ ...config, playbackTabId: undefined })
    }
  }
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'reconnect') {
    connect()
  }
  if (alarm.name === 'keepalive') {
    sendPing()
  }
})

chrome.runtime.onStartup.addListener(() => {
  console.log('[Karaoke] Extension started')
  connect()
})

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Karaoke] Extension installed')
  connect()
})

connect()
