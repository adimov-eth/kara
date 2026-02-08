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
export type UserId = Brand<string, 'UserId'>
export type SessionId = Brand<string, 'SessionId'>

// =============================================================================
// Exhaustiveness Helper
// =============================================================================

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`)
}

// =============================================================================
// User & Session (Google OAuth + Anonymous)
// =============================================================================

export type AuthProvider = 'google' | 'anonymous'

export interface User {
  id: string                      // Google 'sub' or generated UUID
  provider: AuthProvider
  email?: string                  // Only for Google users
  displayName: string
  picture?: string                // Google profile picture URL
  createdAt: number
}

export interface UserSession {
  id: string                      // Session token (JWT)
  userId: string
  roomId: string
  displayName: string             // Can override per-room
  createdAt: number
  expiresAt: number               // 24 hours from creation
}

// =============================================================================
// Personal Stack (Songs Waiting to Enter General Queue)
// =============================================================================

export interface StackedSong {
  id: string                      // Unique ID for this stack entry
  videoId: string                 // YouTube video ID
  title: string                   // Video title
  source: 'youtube' | 'spotify'
  addedAt: number                 // Timestamp when added to stack
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
  // New fields for jukebox mode (optional for backwards compatibility)
  userId?: string                 // Who added it (user ID)
}

// Queue state (extended for jukebox mode)
export interface QueueState {
  queue: Entry[]
  currentEpoch: number
  nowPlaying: Entry | null
  // Jukebox mode additions (optional for backwards compatibility)
  userStacks?: Record<string, StackedSong[]>  // userId → waiting songs
}

// Playback sync state - enables multi-device synchronized playback
export interface PlaybackState {
  videoId: string | null
  startedAt: number       // Server timestamp (Date.now()) when playback began
  playing: boolean
}

// =============================================================================
// Social Features (Reactions, Chat, Energy)
// =============================================================================

export type ReactionEmoji = 'fire' | 'heart' | 'clap' | 'laugh' | 'boo'

export interface Reaction {
  id: string
  emoji: ReactionEmoji
  userId: string
  displayName: string
  timestamp: number
}

export const REACTION_WEIGHT: Record<ReactionEmoji, number> = {
  fire: 1,
  heart: 1,
  clap: 1,
  laugh: 0.5,
  boo: -2,
}

export interface ChatMessage {
  id: string
  userId: string
  displayName: string
  text: string           // max 200 chars
  timestamp: number
}

export interface EnergyState {
  level: number          // 0-100, 50 = neutral
  trend: 'rising' | 'falling' | 'stable'
}

export interface SocialConfig {
  reactionsEnabled: boolean    // default: true
  chatEnabled: boolean         // default: true
  booEnabled: boolean          // default: false
  energySkipEnabled: boolean   // default: false
  energySkipThreshold: number  // default: 20
  energySkipDuration: number   // seconds below threshold, default: 15
}

export const DEFAULT_SOCIAL_CONFIG: SocialConfig = {
  reactionsEnabled: true,
  chatEnabled: true,
  booEnabled: false,
  energySkipEnabled: false,
  energySkipThreshold: 20,
  energySkipDuration: 15,
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
  | { kind: 'skipped'; by: 'singer' | 'admin' | 'energy' }
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

export type RoomMode = 'jukebox' | 'karaoke'
export type PlaybackDriver = 'iframe' | 'extension' | 'auto'

export interface RoomConfig {
  id: string              // room ID (e.g., "bobs-party")
  displayName: string     // display name (e.g., "Bob's Birthday Karaoke")
  createdAt: number       // timestamp
  maxQueueSize: number    // default: 50
  allowVoting: boolean    // default: true
  // Jukebox mode additions
  mode: RoomMode          // 'jukebox' (new default) or 'karaoke' (legacy)
  requireAuth: boolean    // false allows anonymous users
  maxStackSize: number    // max songs in personal stack (default: 10)
  social?: SocialConfig   // social features config (optional for backwards compatibility)
  playbackDriver?: PlaybackDriver // iframe (default), extension, or auto
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
  | { kind: 'exists'; config: RoomConfig; adminConfigured: boolean }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }

// Claim room admin (legacy rooms without admin)
export type RoomClaimResult =
  | { kind: 'claimed'; token: string }
  | { kind: 'alreadyClaimed' }
  | { kind: 'roomNotFound' }
  | { kind: 'invalidPin'; reason: string }
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
// Auth Result Types
// =============================================================================

// Get session result
export type GetSessionResult =
  | { kind: 'authenticated'; session: UserSession; user: User }
  | { kind: 'anonymous'; session: UserSession }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; message: string }

// Login result (after OAuth callback)
export type LoginResult =
  | { kind: 'success'; session: UserSession; user: User }
  | { kind: 'error'; message: string }

// Anonymous session result
export type AnonymousSessionResult =
  | { kind: 'created'; session: UserSession }
  | { kind: 'error'; message: string }

// Logout result
export type LogoutResult =
  | { kind: 'loggedOut' }
  | { kind: 'error'; message: string }

// =============================================================================
// Stack Management Result Types
// =============================================================================

// Add to stack result
export type AddToStackResult =
  | { kind: 'added'; song: StackedSong; stackPosition: number }
  | { kind: 'addedToQueue'; entry: Entry; queuePosition: number }
  | { kind: 'stackFull'; maxSize: number }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; message: string }

// Remove from stack result
export type RemoveFromStackResult =
  | { kind: 'removed'; songId: string }
  | { kind: 'notFound' }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; message: string }

// Reorder stack result
export type ReorderStackResult =
  | { kind: 'reordered'; stack: StackedSong[] }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; message: string }

// Get my stack result
export type GetMyStackResult =
  | { kind: 'stack'; songs: StackedSong[]; inQueue: Entry | null }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; message: string }

// Set room config result (admin)
export type SetConfigResult =
  | { kind: 'updated'; config: RoomConfig }
  | { kind: 'unauthorized' }
  | { kind: 'roomNotFound' }
  | { kind: 'error'; message: string }

// Extension player pairing
export type PairPlayerResult =
  | { kind: 'paired'; token: string }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string }

export type RevokePlayerResult =
  | { kind: 'revoked' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string }

export interface ExtensionPlayerStatus {
  connected: boolean
  playbackDriver: PlaybackDriver
  lastSeenAt: number | null
  clientVersion: string | null
}

export type GetPlayerStatusResult =
  | { kind: 'status'; status: ExtensionPlayerStatus }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string }

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
  | { kind: 'extensionAuthorized' }
  | { kind: 'error'; message: string }
  | { kind: 'joined'; entry: Entry; position: number }
  | { kind: 'removed'; entryId: string }
  | { kind: 'voted'; entryId: string; votes: number }
  | { kind: 'skipped'; nowPlaying: Entry | null }
  | { kind: 'advanced'; nowPlaying: Entry | null; currentEpoch: number }
  | { kind: 'extensionStatus'; connected: boolean }
  | { kind: 'pong'; serverTime?: number; clientTime?: number }
  | { kind: 'sync'; playback: PlaybackState }
  // Jukebox mode additions
  | { kind: 'stackUpdated'; userId: string; stack: StackedSong[] }
  | { kind: 'promotedToQueue'; userId: string; entry: Entry; remainingStack: StackedSong[] }
  // Social features
  | { kind: 'reaction'; reaction: Reaction }
  | { kind: 'chat'; message: ChatMessage }
  | { kind: 'chatPinned'; message: ChatMessage }
  | { kind: 'chatUnpinned'; messageId: string }
  | { kind: 'energy'; state: EnergyState }
  | { kind: 'energySkip' }
  | { kind: 'configUpdated'; config: RoomConfig }

// Client -> Server messages
export type ClientMessage =
  | { kind: 'subscribe'; clientType: ClientType; sessionToken?: string; playerToken?: string; clientVersion?: string }
  | { kind: 'join'; name: string; videoId: string; title: string }
  | { kind: 'vote'; entryId: string; direction: 1 | -1 | 0; voterId: string }
  | { kind: 'remove'; entryId: string; userName?: string; isAdmin?: boolean }
  | { kind: 'skip'; userName?: string; isAdmin?: boolean }
  | { kind: 'next'; currentId?: string | null }
  | { kind: 'reorder'; entryId: string; newPosition?: number; newEpoch?: number }
  | { kind: 'adminAdd'; name: string; videoId: string; title: string }
  | { kind: 'ping'; clientTime?: number }
  | { kind: 'ended'; videoId: string; entryId?: string } // Extension reports video end
  | { kind: 'error'; videoId: string; reason: string; entryId?: string } // Extension reports video error
  | { kind: 'syncRequest' } // Request current playback state for sync
  // Jukebox mode additions
  | { kind: 'addSong'; videoId: string; title: string; sessionToken: string }
  | { kind: 'removeFromStack'; songId: string; sessionToken: string }
  | { kind: 'reorderStack'; songIds: string[]; sessionToken: string }
  // Social features
  | { kind: 'reaction'; emoji: ReactionEmoji }
  | { kind: 'chat'; text: string }
  | { kind: 'pinChat'; messageId: string }

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
