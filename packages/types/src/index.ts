// Core queue entry
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

// Legacy entry format (for migration compatibility)
export interface LegacyEntry {
  id: string
  name: string
  youtubeUrl: string
  youtubeTitle: string
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

// Legacy queue state (for migration compatibility)
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

export interface Performance {
  id: string              // unique id
  name: string            // singer name
  videoId: string         // YouTube video ID
  title: string           // song title
  performedAt: number     // timestamp (Date.now())
  votes: number           // final vote count when song ended
  completed: boolean      // true = finished, false = skipped/bailed
}

export interface Song {
  videoId: string
  title: string
  timesPlayed: number     // total performances
  timesCompleted: number  // performances where completed=true
  totalVotes: number      // sum of all votes received
  avgVotes: number        // totalVotes / timesPlayed
  completionRate: number  // timesCompleted / timesPlayed
  lastPlayedAt: number    // most recent performance timestamp
  firstPlayedAt: number   // first ever performance timestamp
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
  | { type: 'connected'; roomId: string }
  | { type: 'search'; query: string; requestId: string }
  | { type: 'search_result'; results: SearchResult[]; requestId: string }
  | { type: 'play'; videoId: string }
  | { type: 'ended'; videoId: string }
  | { type: 'error'; videoId: string; reason: string }

// API request/response types
export interface JoinRequest {
  name: string
  youtubeUrl: string
  youtubeTitle: string
}

export interface JoinResponse {
  success: boolean
  entry?: Entry
  position?: number
  error?: string
}

export interface VoteRequest {
  entryId: string
  direction: 1 | -1 | 0
}

export interface VoteResponse {
  success: boolean
  newVotes?: number
  error?: string
}

export interface RemoveRequest {
  entryId: string
}

export interface NextRequest {
  currentId?: string | null
}

export interface NextResponse {
  success: boolean
  reason?: string
  nowPlaying: Entry | null
  currentEpoch?: number
}

export interface ReorderRequest {
  entryId: string
  newEpoch?: number
  newPosition?: number
}

export interface AdminAddRequest {
  name: string
  youtubeUrl: string
  youtubeTitle: string
}

// =============================================================================
// WebSocket Protocol
// =============================================================================

// Client connection types
export type ClientType = 'user' | 'player' | 'admin' | 'extension'

// Server -> Client messages
export type ServerMessage =
  | { type: 'state'; state: LegacyQueueState; extensionConnected?: boolean }
  | { type: 'error'; message: string }
  | { type: 'joined'; entry: LegacyEntry; position: number }
  | { type: 'removed'; entryId: string }
  | { type: 'voted'; entryId: string; votes: number }
  | { type: 'skipped'; nowPlaying: LegacyEntry | null }
  | { type: 'advanced'; nowPlaying: LegacyEntry | null; currentEpoch: number }
  | { type: 'extensionStatus'; connected: boolean }
  | { type: 'pong' }

// Client -> Server messages
export type ClientMessage =
  | { type: 'subscribe'; clientType: ClientType }
  | { type: 'join'; name: string; youtubeUrl: string; youtubeTitle: string }
  | { type: 'vote'; entryId: string; direction: 1 | -1 | 0; voterId: string }
  | { type: 'remove'; entryId: string; userName?: string; isAdmin?: boolean }
  | { type: 'skip'; userName?: string; isAdmin?: boolean }
  | { type: 'next'; currentId?: string | null }
  | { type: 'reorder'; entryId: string; newPosition?: number; newEpoch?: number }
  | { type: 'adminAdd'; name: string; youtubeUrl: string; youtubeTitle: string }
  | { type: 'ping' }
  | { type: 'ended'; videoId: string } // Extension reports video end
  | { type: 'error'; videoId: string; reason: string } // Extension reports video error
