# Karaoke Queue Manager — Product Requirements Document

## Vision

A real-time karaoke queue system that makes karaoke nights effortless. Singers add songs from their phones, the crowd influences the order, and the venue display plays automatically. No paper slips, no awkward waits, no "who's next?" confusion.

The system should feel invisible when working correctly — singers focus on singing, the crowd focuses on having fun, the host focuses on the party.

---

## Core Experience

### The Night Flow

1. **Setup** — Host opens the player view on the venue TV/projector, optionally installs the Chrome extension for auto-play
2. **Join** — Guests scan a QR code or visit the URL on their phones
3. **Queue** — Guests search for songs, enter their name, join the queue
4. **Vote** — While waiting, guests upvote songs they want to hear sooner
5. **Sing** — When their turn comes, the song plays on the big screen
6. **Repeat** — After singing, guests can queue again (but wait their fair turn)

### Key Principles

- **Fairness** — People who wait longer get priority over repeat singers
- **Engagement** — Voting keeps the crowd involved even when not singing
- **Reliability** — Works without the extension, works offline briefly, recovers gracefully
- **Simplicity** — No accounts required, no app downloads, minimal friction

---

## Users & Views

### Guest View (`/`)

The primary interface. Mobile-first, used by everyone at the karaoke event.

**Capabilities:**
- Search for songs (YouTube karaoke tracks)
- Join the queue with a name
- See current queue and now playing
- Vote on queued songs (up/down)
- Remove own entry from queue
- Skip own song if currently playing
- Optionally claim their name with a PIN for future sessions

**Constraints:**
- One song per person in queue at a time
- Cannot vote on own song
- 7-minute maximum song duration
- Name max 30 characters, title max 100 characters

### Player View (`/player`)

The venue display. Designed for TV/projector, hands-off operation.

**Capabilities:**
- Shows "Now Playing" with embedded YouTube video
- Shows "Up Next" queue preview
- Auto-advances when song ends (with extension)
- Full-screen optimized, minimal UI chrome

**Modes:**
- **With Extension** — Auto-plays videos, detects endings, advances queue automatically
- **Without Extension** — Shows queue state, requires manual advance via admin

### Admin View (`/shikashika`)

Host control panel. Used sparingly to handle edge cases.

**Capabilities:**
- Skip current song
- Remove any entry from queue
- Reorder queue (move entries up/down)
- Add songs directly (bypass normal queue rules)
- Search for songs (same as guest view)
- View performance history and popular songs
- See singer statistics

**Not Included:**
- User management (no accounts to manage)
- Settings configuration (hardcoded for simplicity)
- Analytics dashboard (history features serve this need)

---

## Queue System

### The Epoch Model

The queue uses an "epoch" system to ensure fairness:

```
Sort order: epoch ASC → votes DESC → joinedAt ASC
```

1. When you join, your entry gets `epoch = currentEpoch`
2. When any song finishes, `currentEpoch++`
3. This means: first-timers and those who waited play before repeat singers

**Example:**
- Alice joins (epoch 0), Bob joins (epoch 0), Carol joins (epoch 0)
- Alice sings, epoch becomes 1
- Alice queues again (epoch 1) — she's now behind Bob and Carol
- Even with high votes, Alice's epoch 1 entry sorts after epoch 0 entries

### Voting

Votes adjust position within an epoch tier:
- +1 upvote, -1 downvote, 0 to clear vote
- Net votes can go negative
- Cannot vote on own entry

**Integrity Model:**

Voters identified by UUID stored in localStorage. Server tracks `{ [entryId]: { [voterId]: direction } }` and enforces one vote per voter per entry.

Why this matters: If voting feels meaningless ("anyone can just clear cookies and vote again"), engagement dies. The vibe requires believing votes count.

The system isn't cryptographically secure — a determined person could generate new voterIds. But:
1. Requires technical knowledge most guests don't have
2. Epoch system limits impact (can only affect order within tier)
3. Social pressure at in-person event discourages obvious cheating
4. Server-side tracking catches naive attempts (same voterId voting twice)

This is "vibe security" — real enough that cheating feels wrong, not so heavy it adds friction.

---

## Identity System

### Philosophy

Names are social, not secure. The PIN system exists to prevent casual name-squatting, not to provide strong identity guarantees.

### Flow

1. **First-time singer** — Uses any unclaimed name, joins queue freely
2. **After first song** — UI offers to claim name with 6-digit PIN
3. **Returning singer** — If name is claimed, must enter PIN to use it
4. **Unclaimed names** — Available to anyone, first-come-first-served

### Data Model

```typescript
interface Identity {
  name: string      // Display name (preserves original case)
  pinHash: string   // SHA-256(salt + pin)
  salt: string      // Random 16-byte hex string
  createdAt: number // Timestamp
}
```

### Security Posture

- 6-digit PIN = 1,000,000 combinations
- No rate limiting (brute force would take too long to matter at a party)
- No device tracking or session tokens
- PIN stored as salted hash
- If someone forgets PIN, they use a different name (no recovery flow)

### What Identity Enables

- **Name continuity** — Same stage name across sessions
- **Performance history** — "I've sung 47 songs this year"
- **Self-improvement** — "My average vote went from +1 to +3"
- **Reputation** — Recognition as a regular, personal songbook

Identity is the foundation for the self-improvement loop. Without stable identity, history is just data. With it, history becomes *your* story.

### What Identity Does NOT Provide

- Account recovery (forgot PIN = pick new name)
- Cross-venue identity (each deployment is independent)
- Strong authentication (6-digit PIN is social, not secure)
- Privacy guarantees (name and history visible to admin)

---

## Performance Tracking

### Data Captured

Every completed or skipped song creates a Performance record:

```typescript
interface Performance {
  id: string              // Unique identifier
  name: string            // Singer name
  videoId: string         // YouTube video ID
  title: string           // Song title
  performedAt: number     // Timestamp
  votes: number           // Final vote count when song ended
  completed: boolean      // true = finished, false = skipped
}
```

### Derived Statistics

All statistics are computed from the Performance log on demand. No separate aggregation tables.

**Song Popularity:**
```typescript
// GROUP BY videoId, ORDER BY COUNT(*) DESC
// Popularity = how often it's requested, not how it's voted
```

Rationale: Votes reflect *performance* quality, not *song* quality. A great song sung badly accumulates negative votes, unfairly penalizing the song. Play count measures demand — the true signal.

**Singer Statistics:**
- Total songs performed
- Total votes received (sum across performances)
- Completion rate (finished vs skipped)
- Performance history with timestamps
- Trend: compare recent performances to historical average

---

## Chrome Extension

### Purpose

Enables hands-free venue operation by controlling YouTube playback.

### Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│     Server      │◄──────────────────►│   Background    │
│  (Durable Obj)  │                    │  Service Worker │
└─────────────────┘                    └────────┬────────┘
                                                │
                                       Chrome Messages
                                                │
                                       ┌────────▼────────┐
                                       │  Content Script │
                                       │  (YouTube.com)  │
                                       └─────────────────┘
```

### Flow

1. Extension connects to server via WebSocket as `clientType: 'extension'`
2. Server sends queue state updates
3. When `nowPlaying` changes, extension navigates YouTube tab to video
4. Extension detects video end via YouTube's player API
5. Extension optimistically loads next video while notifying server
6. Server advances queue and broadcasts to all clients

### Optimistic Navigation

When a video ends:
1. Extension immediately navigates to next song (from cached state)
2. Extension sends `ended` message to server
3. Server advances queue and broadcasts new state
4. If extension's cached state was stale, it corrects to server state

This eliminates the round-trip delay between songs.

### Graceful Degradation

Without extension:
- Player view shows queue but doesn't auto-play
- Admin manually clicks "Skip" to advance
- Everything else works normally

Server tracks `extensionConnected` status and can surface this to admin.

---

## Search & Video Validation

### Search

YouTube Data API v3 search with karaoke-focused query enhancement:
- Appends "karaoke" to queries that don't already include it
- Returns: id, title, channel, duration, thumbnail
- Client-side filtering: max 7 minutes duration

### Validation

Before allowing a song to be queued, the client validates:

1. **URL parsing** — Extract video ID from various YouTube URL formats
2. **Embeddability** — Load video in hidden player, check for embed restrictions
3. **Duration** — Verify under 7-minute limit
4. **Availability** — Confirm video exists and is playable

Validation happens client-side using YouTube's IFrame API. This catches:
- Private/deleted videos
- Embed-disabled videos
- Geo-restricted content
- Livestreams (duration = 0)

### Future: Extension-Routed Search

When extension is connected, search could route through the venue device:
- Search results guaranteed playable on that specific device/region
- Eliminates "works on my phone but not on the TV" issues
- Server tracks extension presence, routes `/api/search` accordingly

---

## Real-Time Updates

### WebSocket Protocol

Primary communication channel for live updates.

**Connection:** `wss://{host}/?upgrade=websocket`

**Client → Server (discriminated union):**
```typescript
type ClientMessage =
  | { kind: "subscribe"; clientType: ClientType }
  | { kind: "ping" }
  | { kind: "ended"; videoId: VideoId }      // Extension only
  | { kind: "error"; videoId: VideoId; reason: string }  // Extension only

type ClientType = "user" | "player" | "admin" | "extension"
```

**Server → Client (discriminated union):**
```typescript
type ServerMessage =
  | { kind: "state"; room: Room; extensionConnected: boolean }
  | { kind: "pong" }
  | { kind: "error"; message: string }
```

**Exhaustive handling required:**
```typescript
function handleServerMessage(msg: ServerMessage): void {
  switch (msg.kind) {
    case "state":
      room.set(msg.room)
      break
    case "pong":
      // Heartbeat acknowledged
      break
    case "error":
      console.error("Server error:", msg.message)
      break
    default:
      assertNever(msg)
  }
}
```

### Polling Fallback

If WebSocket fails or isn't supported:
- Client polls `GET /api/state` every 3 seconds
- Automatic reconnection with exponential backoff
- Seamless transition when WebSocket recovers

### State Hash Optimization

Clients track a hash of received state. Server can skip sending unchanged state, reducing bandwidth on idle connections.

---

## API Reference

All API responses use discriminated unions. No `{ success: boolean, error?: string }` patterns.

### Response Type Pattern

```typescript
// Every endpoint returns a specific union, not success/error booleans
type ApiResponse<T> =
  | { kind: "ok"; data: T }
  | { kind: "error"; code: string; message: string }

// HTTP status derived from kind:
// "ok" → 200
// "error" → 4xx based on code
```

### Queue Operations

| Method | Endpoint | Response Type |
|--------|----------|---------------|
| `GET` | `/api/state` | `Room` |
| `POST` | `/api/join` | `JoinResult` |
| `POST` | `/api/vote` | `VoteResult` |
| `POST` | `/api/remove` | `RemoveResult` |
| `POST` | `/api/skip` | `SkipResult` |
| `POST` | `/api/next` | `AdvanceResult` |

```typescript
type JoinResult =
  | { kind: "joined"; entry: Entry; position: number }
  | { kind: "requiresPin" }
  | { kind: "alreadyInQueue" }
  | { kind: "nowPlaying" }
  | { kind: "invalidVideo"; reason: string }

type VoteResult =
  | { kind: "voted"; entryId: EntryId; newTotal: number }
  | { kind: "entryNotFound" }
  | { kind: "cannotVoteOwnEntry" }

type RemoveResult =
  | { kind: "removed"; entryId: EntryId }
  | { kind: "entryNotFound" }
  | { kind: "notAuthorized" }

type SkipResult =
  | { kind: "skipped"; nextUp: Entry | null }
  | { kind: "nothingPlaying" }
  | { kind: "notAuthorized" }

type AdvanceResult =
  | { kind: "advanced"; nowPlaying: Entry | null; epoch: Epoch }
  | { kind: "alreadyAdvanced" }  // Idempotent: same video ID already advanced
```

### Admin Operations

| Method | Endpoint | Response Type |
|--------|----------|---------------|
| `POST` | `/api/add` | `AdminAddResult` |
| `POST` | `/api/reorder` | `ReorderResult` |

```typescript
type AdminAddResult =
  | { kind: "added"; entry: Entry }
  | { kind: "invalidVideo"; reason: string }

type ReorderResult =
  | { kind: "reordered"; queue: readonly Entry[] }
  | { kind: "entryNotFound" }
```

### Search

| Method | Endpoint | Response Type |
|--------|----------|---------------|
| `GET` | `/api/search?q={query}` | `SearchResult` |

```typescript
type SearchResult =
  | { kind: "results"; items: readonly SearchItem[] }
  | { kind: "quotaExceeded" }
  | { kind: "invalidQuery" }

type SearchItem = Readonly<{
  videoId: VideoId
  title: string
  channel: string
  duration: string
  durationSeconds: number
  thumbnail: string
}>
```

### Identity

| Method | Endpoint | Response Type |
|--------|----------|---------------|
| `GET` | `/api/identity/{name}` | `IdentityCheckResult` |
| `POST` | `/api/claim` | `ClaimResult` |
| `POST` | `/api/verify` | `VerifyResult` |

```typescript
type IdentityCheckResult =
  | { kind: "claimed"; createdAt: Timestamp }
  | { kind: "available" }

type ClaimResult =
  | { kind: "claimed" }
  | { kind: "alreadyClaimed" }
  | { kind: "invalidPin" }  // Not 6 digits

type VerifyResult =
  | { kind: "verified"; name: string }
  | { kind: "wrongPin" }
  | { kind: "notClaimed" }
```

### History

| Method | Endpoint | Response Type |
|--------|----------|---------------|
| `GET` | `/api/history/{name}` | `HistoryResult` |
| `GET` | `/api/songs/popular?limit={n}` | `PopularSongsResult` |

```typescript
type HistoryResult =
  | { kind: "found"; stats: SingerStats }
  | { kind: "noHistory" }

type PopularSongsResult =
  | { kind: "songs"; items: readonly SongStats[] }
```

---

## Data Architecture

### Design Principles

**Make illegal states unrepresentable.** The type system should prevent:
- Entries with invalid video IDs
- Votes outside {-1, 0, 1}
- Performances without outcomes
- Timestamps that could be confused with other numbers

**Use discriminated unions over booleans.** Instead of `completed: boolean`, use explicit outcome states.

**Brand primitive types.** Timestamps, IDs, and votes get distinct types to prevent mixing.

**Result over exceptions.** Operations that can fail return `Result<T, E>`, not thrown errors.

### Storage Model (Durable Object)

```
RoomDO
├── Queue State (memory + persisted)
│   ├── queue: Entry[]
│   ├── nowPlaying: Entry | null
│   └── currentEpoch: Epoch
│
├── Vote Records (memory + persisted)
│   └── votes: { [EntryId]: { [VoterId]: Vote } }
│
├── Identities (persisted, keyed by normalized name)
│   └── identity:{name} → Identity
│
└── Performances (persisted, append-only array)
    └── performances → Performance[]
```

### Branded Types

```typescript
// Prevent mixing different ID types
type Brand<K, T> = K & { readonly __brand: T }

type EntryId = Brand<string, "EntryId">
type VoterId = Brand<string, "VoterId">
type VideoId = Brand<string, "VideoId">
type PinHash = Brand<string, "PinHash">
type Salt = Brand<string, "Salt">

// Prevent mixing timestamps with other numbers
type Timestamp = Brand<number, "Timestamp">
type Epoch = Brand<number, "Epoch">

// Constructors with validation
const EntryId = (): EntryId => crypto.randomUUID() as EntryId
const VoterId = (): VoterId => crypto.randomUUID() as VoterId
const VideoId = (s: string): VideoId | null => {
  // YouTube video IDs are 11 chars, alphanumeric + _ + -
  return /^[a-zA-Z0-9_-]{11}$/.test(s) ? s as VideoId : null
}
const Timestamp = (): Timestamp => Date.now() as Timestamp
```

### Discriminated Unions

```typescript
// Vote is exactly one of three values, not any number
type Vote =
  | { kind: "up" }
  | { kind: "down" }
  | { kind: "none" }

// Performance outcome is explicit, not a boolean
type PerformanceOutcome =
  | { kind: "completed" }
  | { kind: "skipped"; by: "singer" | "admin" }
  | { kind: "errored"; reason: string }

// Join result covers all cases
type JoinResult =
  | { kind: "success"; entry: Entry; position: number }
  | { kind: "requiresPin"; name: string }
  | { kind: "alreadyInQueue" }
  | { kind: "nowPlaying" }
  | { kind: "invalidVideo"; reason: string }

// Verify result
type VerifyResult =
  | { kind: "success"; name: string }
  | { kind: "wrongPin" }
  | { kind: "notClaimed" }
```

### Core Types

```typescript
type Entry = Readonly<{
  id: EntryId
  name: string            // Max 30 chars, trimmed
  videoId: VideoId
  title: string           // Max 100 chars
  votes: number           // Computed from vote records
  epoch: Epoch
  joinedAt: Timestamp
}>

type Performance = Readonly<{
  id: EntryId             // Same ID as the Entry it came from
  name: string
  videoId: VideoId
  title: string
  finalVotes: number
  performedAt: Timestamp
  outcome: PerformanceOutcome
}>

type Identity = Readonly<{
  name: string            // Original case preserved
  pinHash: PinHash
  salt: Salt
  createdAt: Timestamp
}>

type Room = Readonly<{
  queue: readonly Entry[]
  nowPlaying: Entry | null
  epoch: Epoch
}>
```

### State Transitions

Queue operations modeled as pure functions returning `Result`:

```typescript
type QueueError =
  | { kind: "alreadyInQueue" }
  | { kind: "nowPlaying" }
  | { kind: "entryNotFound" }
  | { kind: "notAuthorized" }

// Join: Room → Entry → Result<Room, QueueError>
function addToQueue(
  room: Room,
  entry: Entry
): Result<Room, QueueError> {
  const nameLower = entry.name.toLowerCase()

  if (room.queue.some(e => e.name.toLowerCase() === nameLower)) {
    return Err({ kind: "alreadyInQueue" })
  }

  if (room.nowPlaying?.name.toLowerCase() === nameLower) {
    return Err({ kind: "nowPlaying" })
  }

  return Ok({
    ...room,
    queue: sortQueue([...room.queue, entry])
  })
}

// Remove: Room → EntryId → string → boolean → Result<Room, QueueError>
function removeFromQueue(
  room: Room,
  entryId: EntryId,
  userName: string,
  isAdmin: boolean
): Result<Room, QueueError> {
  const entry = room.queue.find(e => e.id === entryId)

  if (!entry) {
    return Err({ kind: "entryNotFound" })
  }

  if (!isAdmin && entry.name.toLowerCase() !== userName.toLowerCase()) {
    return Err({ kind: "notAuthorized" })
  }

  return Ok({
    ...room,
    queue: room.queue.filter(e => e.id !== entryId)
  })
}

// Advance: Room → { room: Room, completed: Performance | null }
function advanceQueue(room: Room, outcome: PerformanceOutcome): {
  room: Room
  completed: Performance | null
} {
  const completed = room.nowPlaying
    ? toPerformance(room.nowPlaying, outcome)
    : null

  const [next, ...rest] = room.queue

  return {
    room: {
      queue: rest,
      nowPlaying: next ?? null,
      epoch: ((room.epoch as number) + 1) as Epoch
    },
    completed
  }
}
```

### Exhaustiveness Enforcement

```typescript
const assertNever = (x: never): never => {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`)
}

function describeOutcome(o: PerformanceOutcome): string {
  switch (o.kind) {
    case "completed": return "Finished"
    case "skipped":   return `Skipped by ${o.by}`
    case "errored":   return `Error: ${o.reason}`
    default:          return assertNever(o)
  }
}

function handleJoinResult(r: JoinResult): Response {
  switch (r.kind) {
    case "success":
      return Response.json({ entry: r.entry, position: r.position })
    case "requiresPin":
      return Response.json({ requiresPin: true, name: r.name })
    case "alreadyInQueue":
      return Response.json({ error: "Already in queue" }, { status: 409 })
    case "nowPlaying":
      return Response.json({ error: "Currently playing" }, { status: 409 })
    case "invalidVideo":
      return Response.json({ error: r.reason }, { status: 400 })
    default:
      return assertNever(r)
  }
}
```

### Derived Queries (computed, not stored)

```typescript
type SongStats = Readonly<{
  videoId: VideoId
  title: string
  playCount: number
}>

function getPopularSongs(
  performances: readonly Performance[],
  limit: number
): SongStats[] {
  const counts = new Map<VideoId, SongStats>()

  for (const p of performances) {
    const existing = counts.get(p.videoId)
    if (existing) {
      counts.set(p.videoId, { ...existing, playCount: existing.playCount + 1 })
    } else {
      counts.set(p.videoId, { videoId: p.videoId, title: p.title, playCount: 1 })
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, limit)
}

type SingerStats = Readonly<{
  totalSongs: number
  totalVotes: number
  completedCount: number
  history: readonly Performance[]
}>

function getSingerStats(
  performances: readonly Performance[],
  name: string
): SingerStats {
  const nameLower = name.toLowerCase()
  const mine = performances.filter(p => p.name.toLowerCase() === nameLower)

  return {
    totalSongs: mine.length,
    totalVotes: mine.reduce((sum, p) => sum + p.finalVotes, 0),
    completedCount: mine.filter(p => p.outcome.kind === "completed").length,
    history: [...mine].sort((a, b) => (b.performedAt as number) - (a.performedAt as number))
  }
}
```

---

## Frontend Architecture

### Current Problem

Three views (Guest, Player, Admin) implemented as 600+ line HTML template strings with:
- Duplicated WebSocket connection logic
- Duplicated state management
- Duplicated rendering utilities
- No shared components

### Target Architecture: Svelte

**Why Svelte:**
- Compiles to vanilla JS — ~2KB runtime overhead
- Reactive by default — state changes auto-render
- Components — share logic across views
- No virtual DOM — direct DOM updates, fast
- Single-file components — HTML/CSS/JS co-located

```
packages/
  ui/
    src/
      lib/
        store.ts          # Shared reactive state
        ws.ts             # WebSocket with auto-reconnect
        api.ts            # Typed fetch wrappers
      components/
        Queue.svelte      # Queue list with vote buttons
        NowPlaying.svelte # Current song display
        Search.svelte     # Search input + results
        Entry.svelte      # Single queue entry
        PinModal.svelte   # Claim/verify PIN
        Toast.svelte      # Notifications
      views/
        Guest.svelte      # Phone remote control
        Player.svelte     # TV display (read-only)
        Admin.svelte      # Host controls
      App.svelte          # Router
    vite.config.ts
    package.json
```

### Shared Reactive Store

```typescript
// lib/store.ts
import { writable, derived } from 'svelte/store'

export const room = writable<Room>({ queue: [], nowPlaying: null, epoch: 0 })
export const myName = writable(localStorage.getItem('karaoke_name') ?? '')
export const voterId = writable(localStorage.getItem('karaoke_voter_id') ?? crypto.randomUUID())

// Derived state
export const myEntry = derived([room, myName], ([$room, $name]) =>
  $room.queue.find(e => e.name.toLowerCase() === $name.toLowerCase())
)

export const myPosition = derived([room, myName], ([$room, $name]) => {
  const idx = $room.queue.findIndex(e => e.name.toLowerCase() === $name.toLowerCase())
  return idx === -1 ? null : idx + 1
})

export const isMyTurn = derived([room, myName], ([$room, $name]) =>
  $room.nowPlaying?.name.toLowerCase() === $name.toLowerCase()
)
```

### WebSocket with Reconnect

```typescript
// lib/ws.ts
import { room } from './store'

let ws: WebSocket | null = null
let reconnectAttempts = 0

export function connect(clientType: 'user' | 'player' | 'admin' | 'extension') {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${location.host}/?upgrade=websocket`)

  ws.onopen = () => {
    reconnectAttempts = 0
    ws!.send(JSON.stringify({ type: 'subscribe', clientType }))
  }

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.type === 'state') room.set(msg.state)
  }

  ws.onclose = () => {
    const delay = Math.min(1000 * 2 ** reconnectAttempts++, 30000)
    setTimeout(() => connect(clientType), delay)
  }
}
```

### Component Example: Queue Entry

```svelte
<!-- components/Entry.svelte -->
<script lang="ts">
  import { myName, voterId } from '$lib/store'
  import { vote } from '$lib/api'

  export let entry: Entry
  export let position: number
  export let myVote: -1 | 0 | 1 = 0
  export let readonly = false

  $: isMine = entry.name.toLowerCase() === $myName.toLowerCase()
  $: voteClass = entry.votes > 0 ? 'positive' : entry.votes < 0 ? 'negative' : ''

  async function handleVote(direction: -1 | 0 | 1) {
    if (readonly || isMine) return
    await vote(entry.id, direction, $voterId)
  }
</script>

<li class="entry" class:mine={isMine}>
  <span class="position">{position}</span>
  <div class="info">
    <div class="title">{entry.title}</div>
    <div class="singer">{entry.name}</div>
  </div>
  {#if !readonly}
    <div class="actions">
      <button class:active={myVote === 1} on:click={() => handleVote(myVote === 1 ? 0 : 1)} disabled={isMine}>+</button>
      <span class="votes {voteClass}">{entry.votes}</span>
      <button class:active={myVote === -1} on:click={() => handleVote(myVote === -1 ? 0 : -1)} disabled={isMine}>−</button>
    </div>
  {/if}
</li>
```

### View Composition

Each view becomes ~50 lines composing shared components:

```svelte
<!-- views/Guest.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { connect } from '$lib/ws'
  import { room, myName, myEntry, isMyTurn } from '$lib/store'
  import NowPlaying from '$lib/components/NowPlaying.svelte'
  import Search from '$lib/components/Search.svelte'
  import Queue from '$lib/components/Queue.svelte'
  import PinModal from '$lib/components/PinModal.svelte'
  import Toast from '$lib/components/Toast.svelte'

  onMount(() => connect('user'))
</script>

<div class="container">
  <header>
    <h1>Karaoke</h1>
  </header>

  {#if $room.nowPlaying}
    <NowPlaying entry={$room.nowPlaying} canSkip={$isMyTurn} />
  {/if}

  {#if !$myEntry && !$isMyTurn}
    <Search />
  {:else}
    <p class="status">You're #{$room.queue.findIndex(e => e.id === $myEntry?.id) + 1} in queue</p>
  {/if}

  <Queue entries={$room.queue} />
</div>

<PinModal />
<Toast />
```

### Build Output

Svelte compiles to minimal JS. Expected output:
- `guest.js` — ~15KB gzipped
- `player.js` — ~8KB gzipped
- `admin.js` — ~18KB gzipped

Or single bundle with code splitting: ~25KB total.

---

## Engagement Polish

Not features. Feel.

### Position Change Notifications

When votes shift your position:
```
"You moved up! Now #3 in queue"
"Slipped to #5 — rally some votes!"
```

Implemented via derived store comparing previous/current position.

### Pre-Turn Countdown

When 2 or fewer songs ahead:
```
"2 songs until you're up — get ready!"
"You're next! 🎤"
```

Subtle toast, not modal. Don't interrupt.

### Post-Song Stats

After singing (when your `nowPlaying` clears):
```
"Nice! You got +4 votes on that one."
```

Then offer PIN claim if unclaimed.

### Your Entry Highlight

Visual distinction in queue:
- Subtle glow/border
- "YOU" badge
- Persistent even when scrolled

### Instant Vote Feedback

Optimistic update — button state changes immediately, reconciles with server state.

---

## Future Considerations

### Spotify Integration

Stubbed but not implemented. Would require:
- Spotify Web Playback SDK integration
- OAuth flow for venue account
- Different search API
- Handling of track availability/restrictions

### Multi-Room Support

Current architecture uses a single Durable Object. For venues wanting multiple simultaneous queues:
- Route by room ID in URL path
- Each room gets its own DO instance
- No cross-room features needed

### Singer Profiles

Expose history/stats to singers in Guest view:
- "My Stats" expandable section
- Requires verified identity (PIN) to view
- Shows: songs sung, total votes, completion rate
- Trend: "Your average vote is up +0.5 from last month"

This is the payoff for Identity — self-improvement through data.

---

## Type System Principles

These principles apply across all TypeScript code in the project.

### 1. Discriminated Unions over Booleans

```typescript
// Bad: conflicting booleans possible
type Entry = { isPlaying: boolean; isQueued: boolean }

// Good: exactly one state
type EntryState =
  | { kind: "queued"; position: number }
  | { kind: "playing" }
  | { kind: "completed"; votes: number }
```

### 2. Branded Types for Distinct Primitives

```typescript
// Bad: easy to mix up
function vote(entryId: string, voterId: string): void

// Good: compiler catches mistakes
function vote(entryId: EntryId, voterId: VoterId): void
```

### 3. Result over Exceptions

```typescript
// Bad: caller doesn't know it can fail
function findEntry(id: EntryId): Entry { throw new Error("not found") }

// Good: failure is in the type
function findEntry(id: EntryId): Entry | null
function findEntry(id: EntryId): Result<Entry, "notFound">
```

### 4. Exhaustiveness via assertNever

```typescript
const assertNever = (x: never): never => {
  throw new Error(`Unhandled: ${JSON.stringify(x)}`)
}

// Adding a new PerformanceOutcome variant?
// Compiler flags every switch that doesn't handle it.
```

### 5. Readonly by Default

```typescript
// All domain types are Readonly<T>
// Mutations return new objects, not modified originals
// Arrays are readonly: readonly Entry[], not Entry[]
```

### 6. Pure Core, Effectful Shell

```typescript
// Domain logic (packages/domain) is pure:
// - Takes values, returns values
// - No async, no IO, no side effects
// - Easy to test

// Handlers (worker/src/room.ts) do IO:
// - Read/write storage
// - Send WebSocket messages
// - Call external APIs
```

### 7. Compiler Strictness

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

---

## Implementation Roadmap

### Phase 1: Type System Upgrade

**Remove Song aggregates:**
- Delete `Song` interface from types
- Delete `song:*` storage in RoomDO
- Delete `updateSongStats`, `calculatePopularity` from domain
- Replace `/api/songs/popular` with derived query on performances

**Consolidate Entry types:**
- Remove `LegacyEntry`, keep only `Entry`
- Update all handlers to use `Entry`
- Migration: transform on read, write back as `Entry`

**Result:** ~100 lines removed, one less data structure to maintain.

### Phase 2: Svelte Frontend

**Setup:**
```bash
cd packages
pnpm create svelte@latest ui
# Select: Skeleton, TypeScript, ESLint, Prettier
```

**Port shared logic:**
- `lib/store.ts` — reactive state
- `lib/ws.ts` — WebSocket connection
- `lib/api.ts` — typed fetch wrappers

**Port components:**
- Start with `Queue.svelte`, `Entry.svelte` — most reused
- Then `Search.svelte`, `NowPlaying.svelte`
- Then `PinModal.svelte`, `Toast.svelte`

**Port views:**
- `Guest.svelte` first — most complex, proves architecture
- `Player.svelte` — subset of Guest, read-only
- `Admin.svelte` — Guest + admin controls

**Build integration:**
- Vite builds to `dist/`
- Worker serves from `dist/` or embeds (TBD)

**Result:** 3 views share ~80% code. Each view ~50 lines.

### Phase 3: Engagement Polish

**Position notifications:**
- Derived store tracks previous position
- Toast on change: "You moved to #3!"

**Pre-turn alerts:**
- Derived store: `songsUntilTurn`
- Toast at 2, toast at 1 ("You're next!")

**Post-song stats:**
- Detect when `isMyTurn` goes false
- Show final vote count
- Trigger PIN claim modal if unclaimed

**Optimistic voting:**
- Update local state immediately on vote
- Reconcile when server state arrives
- Revert if server rejects

### Phase 4: Singer Stats in Guest View

**"My Stats" section:**
- Collapsed by default
- Requires verified identity to expand
- Fetches `/api/history/{name}`
- Shows: total songs, total votes, completion rate, recent history

**Trend indicators:**
- Compare last 10 performances to previous 10
- "Your average vote: +2.3 (↑ from +1.8)"

---

## Technical Constraints

### Cloudflare Workers Limits

- 128MB memory per request
- 30s CPU time (50ms billable)
- Durable Object storage: 1GB per object
- WebSocket connections: 32MB message size

All well within limits for expected usage.

### YouTube API Quotas

- 10,000 units/day default
- Search costs 100 units
- ≈100 searches/day on free tier

For high-volume venues: cache popular searches, implement search result caching, or request quota increase.

### Browser Compatibility

Target: Modern browsers (Chrome, Safari, Firefox) from last 2 years.
- WebSocket support required
- ES2020+ JavaScript features
- CSS Grid/Flexbox
- No IE11 support

---

## Success Metrics

### Functional Success

- [ ] Guest can join queue in under 30 seconds
- [ ] Queue updates appear within 1 second across all clients
- [ ] Extension auto-advances with less than 2 second gap between songs
- [ ] System recovers from disconnection without losing state

### User Experience Success

- [ ] No "how do I use this?" questions after brief intro
- [ ] Guests stay engaged (voting) even when not singing
- [ ] Host rarely needs to use admin panel
- [ ] No fights over queue position

### Reliability Success

- [ ] Zero data loss across sessions
- [ ] Graceful degradation when extension unavailable
- [ ] Works on spotty venue WiFi
- [ ] Handles 50+ concurrent guests

---

## Non-Goals

Things explicitly out of scope:

- **Lyrics display** — Karaoke videos include lyrics; we don't add them
- **Pitch scoring** — This is social karaoke, not a game
- **Recording** — Privacy and storage concerns; use phone cameras
- **DJ mode** — This is for karaoke, not general music playback
- **Table management** — Venues have their own systems
- **Payments** — Venue handles money; we handle queue
- **Social features** — No follows, no friends, no messaging. This is ephemeral.
- **Achievements/badges** — Gamification for its own sake. Stats are enough.
- **Song requests** — You want to hear it? Sing it yourself.
- **Dedications** — Say it with your voice, not a text field.

---

## Appendix: Glossary

| Term | Definition |
|------|------------|
| **Epoch** | Priority tier in queue. Lower epoch plays first. Increments when any song finishes. |
| **Entry** | A song in the queue, with singer name, video info, votes, and metadata. |
| **Performance** | Historical record of a completed or skipped song. |
| **Identity** | Claimed name with PIN hash. Optional. |
| **Extension** | Chrome extension that controls YouTube playback on venue display. |
| **Player** | The venue display view showing video and queue. |
| **Guest** | Anyone using the system to queue songs or vote. Not authenticated. |
| **Host/Admin** | Person running the karaoke event. Has access to admin view. |
