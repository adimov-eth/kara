import type { QueueState } from '@karaoke/types'

// Extension → Server (via background WebSocket)
export type ExtensionToServer =
  | { kind: 'subscribe'; clientType: 'extension' }
  | { kind: 'ended'; videoId: string }
  | { kind: 'error'; videoId: string; reason: string }
  | { kind: 'ping' }

// Server → Extension
export type ServerToExtension =
  | { kind: 'state'; state: QueueState }
  | { kind: 'play'; videoId: string }
  | { kind: 'pong' }

// Background ↔ Content Script
export type BackgroundToContent =
  | { type: 'play'; videoId: string }
  | { type: 'state'; state: QueueState }

export type ContentToBackground =
  | { type: 'videoEnded'; videoId: string }
  | { type: 'videoError'; videoId: string; reason: string }
  | { type: 'ready' }

// Stored state
export interface StoredState {
  connected: boolean
  lastVideoId: string | null
  queueState: QueueState | null
}
