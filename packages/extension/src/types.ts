import type { LegacyQueueState } from '@karaoke/types'

// Extension → Server (via background WebSocket)
export type ExtensionToServer =
  | { type: 'subscribe'; clientType: 'extension' }
  | { type: 'ended'; videoId: string }
  | { type: 'error'; videoId: string; reason: string }
  | { type: 'ping' }

// Server → Extension
export type ServerToExtension =
  | { type: 'state'; state: LegacyQueueState }
  | { type: 'play'; videoId: string }
  | { type: 'pong' }

// Background ↔ Content Script
export type BackgroundToContent =
  | { type: 'play'; videoId: string }
  | { type: 'state'; state: LegacyQueueState }

export type ContentToBackground =
  | { type: 'videoEnded'; videoId: string }
  | { type: 'videoError'; videoId: string; reason: string }
  | { type: 'ready' }

// Stored state
export interface StoredState {
  connected: boolean
  lastVideoId: string | null
  queueState: LegacyQueueState | null
}
