import type { QueueState } from '@karaoke/types'

export interface ExtensionConfig {
  serverOrigin: string
  roomId: string
  playerToken: string
  playbackTabId?: number
}

// Extension → Server (via background WebSocket)
export type ExtensionToServer =
  | { kind: 'subscribe'; clientType: 'extension'; playerToken?: string; clientVersion?: string }
  | { kind: 'ended'; videoId: string; entryId?: string }
  | { kind: 'error'; videoId: string; reason: string; entryId?: string }
  | { kind: 'ping' }

// Server → Extension
export type ServerToExtension =
  | { kind: 'state'; state: QueueState }
  | { kind: 'extensionAuthorized' }
  | { kind: 'play'; videoId: string }
  | { kind: 'pong' }
  | { kind: 'error'; message: string }

// Background ↔ Content Script
export type BackgroundToContent =
  | { type: 'play'; videoId: string; entryId?: string }
  | { type: 'state'; state: QueueState | null; joinUrl: string | null; roomId: string | null; connected: boolean }

export type ContentToBackground =
  | { type: 'videoEnded'; videoId: string; entryId?: string }
  | { type: 'videoError'; videoId: string; reason: string; entryId?: string }
  | { type: 'ready' }

// Stored state
export interface StoredState {
  connected: boolean
  lastVideoId: string | null
  queueState: QueueState | null
  connectionError?: string | null
}
