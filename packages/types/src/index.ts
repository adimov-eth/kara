// =============================================================================
// Branded Types - Prevent mixing different ID/primitive types
// =============================================================================

type Brand<K, T> = K & { readonly __brand: T }

export type EntryId = Brand<string, 'EntryId'>
export type VoterId = Brand<string, 'VoterId'>
export type VideoId = Brand<string, 'VideoId'>
export type RoomId = Brand<string, 'RoomId'>
export type AdminToken = Brand<string, 'AdminToken'>
export type Timestamp = Brand<number, 'Timestamp'>
export type Epoch = Brand<number, 'Epoch'>

// Type constructors (cast at boundaries, use branded types internally)
export const EntryId = (s: string): EntryId => s as EntryId
export const VoterId = (s: string): VoterId => s as VoterId
export const VideoId = (s: string): VideoId => s as VideoId
export const RoomId = (s: string): RoomId => s as RoomId
export const AdminToken = (s: string): AdminToken => s as AdminToken
export const Timestamp = (n: number): Timestamp => n as Timestamp
export const Epoch = (n: number): Epoch => n as Epoch

// =============================================================================
// Exhaustiveness Helper
// =============================================================================

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`)
}

// =============================================================================
// Core Queue Entry
// =============================================================================

export interface Entry {
  id: string
  name: string
  videoId: string
  title: string
  source: 'youtube' | 'spotify'
  votes: number
  epoch: number
  joinedAt: number
}

// Queue state
export interface QueueState {
  queue: Entry[]
  currentEpoch: number
  nowPlaying: Entry | null
}

// Playback sync state - enables multi-device synchronized playback
export interface PlaybackState {
  videoId: string | null
  startedAt: number       // Server timestamp (Date.now()) when playback began
  position: number        // Position in seconds at startedAt
  playing: boolean
}

// Legacy types (kept for storage migration in worker)
export interface LegacyEntry {
  id: string
  name: string
  youtubeUrl: string
  youtubeTitle: string
  votes: number
  epoch: number
  joinedAt: number
}

export interface LegacyQueueState {
  queue: LegacyEntry[]
  currentEpoch: number
  nowPlaying: LegacyEntry | null
}

// Vote tracking
export interface VoteRecord {
  [entryId: string]: {
    [voterId: string]: number // 1, -1, or absent
  }
}

// =============================================================================
// Performances & Song Library
// =============================================================================

export type PerformanceOutcome =
  | { kind: 'completed' }
  | { kind: 'skipped'; by: 'singer' | 'admin' }
  | { kind: 'errored'; reason: string }

export interface Performance {
  id: string              // unique id
  name: string            // singer name
  videoId: string         // YouTube video ID
  title: string           // song title
  performedAt: number     // timestamp (Date.now())
  votes: number           // final vote count when song ended
  outcome: PerformanceOutcome
}

// Legacy performance format (for storage migration)
export interface LegacyPerformance {
  id: string
  name: string
  videoId: string
  title: string
  performedAt: number
  votes: number
  completed: boolean
}

// Song stats derived from Performance log (not stored separately)
export interface SongStats {
  videoId: string
  title: string
  playCount: number
}

// =============================================================================
// Identity & Access Control
// =============================================================================

export interface Identity {
  name: string            // display name (preserves original case)
  pinHash: string         // hex string of SHA-256(salt + pin)
  salt: string            // random 16-byte hex string
  createdAt: number       // timestamp
}

// =============================================================================
// Room Configuration & Admin
// =============================================================================

export interface RoomConfig {
  id: string              // room ID (e.g., "bobs-party")
  displayName: string     // display name (e.g., "Bob's Birthday Karaoke")
  createdAt: number       // timestamp
  maxQueueSize: number    // default: 50
  allowVoting: boolean    // default: true
}

export interface RoomAdmin {
  pinHash: string         // SHA-256(salt + pin)
  salt: string            // random 16-byte hex string
  createdAt: number       // timestamp
}

export interface AdminSession {
  token: string           // random 64-char hex
  createdAt: number       // timestamp
  expiresAt: number       // timestamp (4 hours from creation)
}

// Search result from YouTube or Spotify
export interface SearchResult {
  id: string
  title: string
  channel: string
  duration: string
  durationSeconds: number
  thumbnail: string
  source: 'youtube' | 'spotify'
  playable: boolean // false if embed-blocked or geo-restricted
}

// Extension WebSocket protocol
export type ExtensionMessage =
  | { kind: 'connected'; roomId: string }
  | { kind: 'search'; query: string; requestId: string }
  | { kind: 'search_result'; results: SearchResult[]; requestId: string }
  | { kind: 'play'; videoId: string }
  | { kind: 'ended'; videoId: string }
  | { kind: 'error'; videoId: string; reason: string }

// =============================================================================
// API Result Types (Discriminated Unions)
// =============================================================================

// Join queue result
export type JoinResult =
  | { kind: 'joined'; entry: Entry; position: number }
  | { kind: 'requiresPin' }
  | { kind: 'alreadyInQueue'; name: string }
  | { kind: 'invalidVideo'; reason: string }
  | { kind: 'error'; message: string }

// Vote result
export type VoteResult =
  | { kind: 'voted'; entryId: string; newVotes: number }
  | { kind: 'entryNotFound' }
  | { kind: 'error'; message: string }

// Remove entry result
export type RemoveResult =
  | { kind: 'removed'; entryId: string }
  | { kind: 'entryNotFound' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string }

// Skip song result
export type SkipResult =
  | { kind: 'skipped'; nowPlaying: Entry | null; currentEpoch: number }
  | { kind: 'nothingPlaying' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string }

// Advance queue result (next song)
export type NextResult =
  | { kind: 'advanced'; nowPlaying: Entry | null; currentEpoch: number; firstSong: boolean }
  | { kind: 'stateMismatch'; nowPlaying: Entry | null }
  | { kind: 'error'; message: string }

// Claim name result
export type ClaimResult =
  | { kind: 'claimed' }
  | { kind: 'alreadyClaimed' }
  | { kind: 'invalidPin'; reason: string }
  | { kind: 'error'; message: string }

// Verify PIN result
export type VerifyResult =
  | { kind: 'verified'; name: string }
  | { kind: 'nameNotFound' }
  | { kind: 'invalidPin' }
  | { kind: 'error'; message: string }

// Search result (success/failure)
export type SearchQueryResult =
  | { kind: 'results'; results: SearchResult[] }
  | { kind: 'error'; message: string }

// Reorder result (admin)
export type ReorderResult =
  | { kind: 'reordered'; queue: Entry[] }
  | { kind: 'entryNotFound' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string }

// Popular songs result
export type PopularSongsResult =
  | { kind: 'songs'; songs: SongStats[] }
  | { kind: 'error'; message: string }

// Create room result
export type CreateRoomResult =
  | { kind: 'created'; roomId: string; config: RoomConfig }
  | { kind: 'alreadyExists' }
  | { kind: 'invalidRoomId'; reason: string }
  | { kind: 'invalidPin'; reason: string }
  | { kind: 'error'; message: string }

// Check room existence result
export type CheckRoomResult =
  | { kind: 'exists'; config: RoomConfig }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }

// Admin verify result
export type AdminVerifyResult =
  | { kind: 'verified'; token: string }
  | { kind: 'invalidPin' }
  | { kind: 'roomNotFound' }
  | { kind: 'error'; message: string }

// Admin token validation (internal)
export type AdminTokenResult =
  | { kind: 'valid' }
  | { kind: 'invalid' }
  | { kind: 'expired' }

// =============================================================================
// API Request Types
// =============================================================================

export interface JoinRequest {
  name: string
  videoId: string
  title: string
  verified?: boolean
}

export interface VoteRequest {
  entryId: string
  direction: 1 | -1 | 0
}

export interface RemoveRequest {
  entryId: string
}

export interface NextRequest {
  currentId?: string | null
}

export interface ReorderRequest {
  entryId: string
  newEpoch?: number
  newPosition?: number
}

export interface AdminAddRequest {
  name: string
  videoId: string
  title: string
}

// =============================================================================
// WebSocket Protocol
// =============================================================================

// Client connection types
export type ClientType = 'user' | 'player' | 'admin' | 'extension'

// Server -> Client messages
export type ServerMessage =
  | { kind: 'state'; state: QueueState; playback?: PlaybackState; extensionConnected?: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'joined'; entry: Entry; position: number }
  | { kind: 'removed'; entryId: string }
  | { kind: 'voted'; entryId: string; votes: number }
  | { kind: 'skipped'; nowPlaying: Entry | null }
  | { kind: 'advanced'; nowPlaying: Entry | null; currentEpoch: number }
  | { kind: 'extensionStatus'; connected: boolean }
  | { kind: 'pong'; serverTime?: number; clientTime?: number }
  | { kind: 'sync'; playback: PlaybackState }

// Client -> Server messages
export type ClientMessage =
  | { kind: 'subscribe'; clientType: ClientType }
  | { kind: 'join'; name: string; videoId: string; title: string }
  | { kind: 'vote'; entryId: string; direction: 1 | -1 | 0; voterId: string }
  | { kind: 'remove'; entryId: string; userName?: string; isAdmin?: boolean }
  | { kind: 'skip'; userName?: string; isAdmin?: boolean }
  | { kind: 'next'; currentId?: string | null }
  | { kind: 'reorder'; entryId: string; newPosition?: number; newEpoch?: number }
  | { kind: 'adminAdd'; name: string; videoId: string; title: string }
  | { kind: 'ping'; clientTime?: number }
  | { kind: 'ended'; videoId: string } // Extension reports video end
  | { kind: 'error'; videoId: string; reason: string } // Extension reports video error
  | { kind: 'syncRequest' } // Request current playback state for sync

// =============================================================================
// Feedback Types
// =============================================================================

export type FeedbackCategory = 'bug' | 'suggestion' | 'question' | 'other'

export interface FeedbackRequest {
  feedback: string           // max 2000 chars
  title?: string             // max 100 chars, optional
  category: FeedbackCategory
  page: string               // current URL path
  userAgent: string
  roomId?: string            // if in a room
}

export type FeedbackResult =
  | { kind: 'created'; issueUrl: string; issueNumber: number }
  | { kind: 'rateLimited' }
  | { kind: 'validationError'; message: string }
  | { kind: 'error'; message: string }
