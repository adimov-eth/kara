# CLAUDE.md

## Project Overview

Real-time karaoke queue manager. YouTube now, Spotify later. Chrome extension for venue display control.

**Live**: https://bkk.lol (alias: https://karaoke-queue.boris-47d.workers.dev)

## Commands

```bash
pnpm install       # Install dependencies
pnpm build         # Build all packages (types → domain → ui → inline → extension → worker)
pnpm typecheck     # Type-check all packages
pnpm dev           # Local development
cd worker && npx wrangler deploy  # Deploy to Cloudflare
```

## Architecture

```
karaoke/
├── packages/
│   ├── types/          # Zero-dep TypeScript contracts
│   ├── domain/         # Pure business logic (no I/O)
│   ├── ui/             # Svelte 5 frontend (SvelteKit + static adapter)
│   └── extension/      # Chrome extension (Manifest V3)
├── worker/             # Cloudflare Worker + Durable Object
│   ├── src/
│   │   ├── index.ts    # Fetch handler, routing, DO proxy
│   │   ├── room.ts     # RoomDO - WebSocket state management
│   │   ├── env.ts      # Environment types
│   │   └── views/generated/  # Auto-generated HTML from Svelte build
│   └── wrangler.toml
```

## Design Principles

1. **Pure core, effectful shell** — Domain logic has no I/O, handlers are thin adapters
2. **Types drive design** — Define contracts first in `@karaoke/types`
3. **Svelte for views** — Components in `packages/ui/`, inlined into worker at build time
4. **WebSocket first, polling fallback** — Real-time updates via DO, HTTP fallback for reliability

## State Management

- **Durable Object (RoomDO)** — Single source of truth for queue state
- **WebSocket** — Real-time state push to connected clients (player, users, extension)
- **HTTP API** — REST endpoints routed through DO
- **SQLite storage** — DO persistence

## Data Model

```typescript
interface Entry {
  id: string                      // Unique ID
  name: string                    // Singer name (max 30 chars)
  videoId: string                 // YouTube video ID
  title: string                   // Video title (max 100 chars)
  source: 'youtube' | 'spotify'   // Video source
  votes: number                   // Net votes (can go negative)
  epoch: number                   // Priority tier (lower = plays first)
  joinedAt: number                // Tiebreaker within same epoch/votes
}
```

## Queue Modes

Rooms can operate in two modes, switchable by admin:

### Karaoke Mode (default)
Name-based identity with epoch fairness. Users enter a name and add songs.

| Aspect | Behavior |
|--------|----------|
| Identity | Stage name (can be PIN-protected) |
| Queue | Unlimited entries per name |
| Sorting | epoch ASC → votes DESC → joinedAt ASC |
| Fairness | People who wait get priority (epoch increments after each song) |

### Jukebox Mode
Session-based identity with personal stacks. Users sign in (Google or anonymous).

| Aspect | Behavior |
|--------|----------|
| Identity | Session (Google OAuth or anonymous) |
| Queue | 1 song per user in main queue |
| Stack | Additional songs wait in personal stack |
| Sorting | votes DESC → joinedAt ASC (no epochs) |
| Auto-promote | When your song plays, next from stack enters queue |

**Both modes**: Users can always add more songs, even while their current song is queued or playing.

## Routes

| Path | Purpose |
|------|---------|
| `/` | Landing page: enter room code |
| `/{room}` | Guest view: add songs, vote, see queue |
| `/{room}/player` | Big screen: auto-plays queue, shows "up next" |
| `/{room}/admin` | Admin: skip, add, reorder, remove, mode toggle |

## Authentication

Two auth methods supported:

### Google OAuth
- Click "Sign in with Google" → OAuth flow → session cookie
- Cross-device: same Google account = same identity everywhere
- Required for persistent personal stack in jukebox mode

### Anonymous Sessions
- Auto-created on first interaction
- Device-bound (cleared on browser data wipe)
- Can upgrade to Google auth later

## Identity System (Legacy)

Optional PIN protection for stage names (karaoke mode):

1. **Unclaimed names** — Anyone can use them
2. **After first song** — UI offers to claim name with 6-digit PIN
3. **Claimed names** — Require PIN verification to use

## API

All endpoints require `?room={roomId}` query parameter.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/state` | Full queue state |
| GET | `/api/search?q=` | Search YouTube |
| POST | `/api/join` | Add to queue |
| POST | `/api/claim` | Claim name with PIN |
| POST | `/api/verify` | Verify PIN for claimed name |
| GET | `/api/identity/:name` | Check if name is claimed |
| POST | `/api/vote` | Vote (header: `X-Voter-Id`) |
| POST | `/api/remove` | Remove entry |
| POST | `/api/skip` | Skip current song |
| POST | `/api/next` | Advance queue |
| POST | `/api/reorder` | Admin reorder |
| POST | `/api/add` | Admin add to front |
| GET | `/api/room/check` | Check if room exists |
| POST | `/api/room/create` | Create new room with admin PIN |
| GET | `/api/room/config` | Get room configuration |
| POST | `/api/room/config` | Update room config (admin, mode switch) |
| POST | `/api/admin/verify` | Verify admin PIN, get session token |
| GET | `/api/stack` | Get personal stack + queue entry |
| POST | `/api/stack/add` | Add song (to queue or stack) |
| POST | `/api/stack/remove` | Remove song from personal stack |
| POST | `/api/stack/reorder` | Reorder personal stack |
| GET | `/auth/google` | Start Google OAuth flow |
| GET | `/auth/callback` | OAuth callback handler |
| GET | `/auth/session` | Get current session |
| POST | `/auth/anonymous` | Create anonymous session |
| POST | `/auth/logout` | Clear session |

## WebSocket Protocol

Connect: `wss://bkk.lol/{room}?upgrade=websocket`

**Client → Server:**
- `{ kind: 'subscribe', clientType: 'user' | 'player' | 'admin' | 'extension' }`
- `{ kind: 'ping' }`
- `{ kind: 'ended', videoId }` — Extension reports video end
- `{ kind: 'error', videoId, reason }` — Extension reports video error

**Server → Client:**
- `{ kind: 'state', state: QueueState }`
- `{ kind: 'pong' }`

## Svelte UI

Located at `packages/ui/`. Built with SvelteKit + static adapter.

### Structure
```
packages/ui/
├── src/
│   ├── lib/
│   │   ├── api.ts              # Typed fetch wrappers
│   │   ├── ws.ts               # WebSocket manager
│   │   ├── stores/
│   │   │   ├── room.svelte.ts  # Reactive room state (Svelte 5 runes)
│   │   │   └── toast.svelte.ts # Toast notifications
│   │   └── components/
│   │       ├── AdminView.svelte    # Admin panel (mode toggle, queue control)
│   │       ├── Entry.svelte        # Queue entry card
│   │       ├── FeedbackModal.svelte # User feedback form
│   │       ├── GuestView.svelte    # Main user interface
│   │       ├── HelpButton.svelte   # Usage guide
│   │       ├── LoginButton.svelte  # Google OAuth + anonymous auth
│   │       ├── MyStack.svelte      # Personal song stack (jukebox mode)
│   │       ├── NowPlaying.svelte   # Current song display
│   │       ├── PinModal.svelte     # Name claim verification
│   │       ├── PlayerView.svelte   # TV/venue display
│   │       ├── PopularSongs.svelte # Room song history
│   │       ├── Queue.svelte        # Queue list
│   │       ├── Search.svelte       # YouTube search
│   │       └── Toast.svelte        # Notifications
│   └── routes/
│       ├── +page.svelte            # Landing page (room code entry)
│       ├── [room]/+page.svelte     # Guest view
│       ├── [room]/player/+page.svelte  # TV display
│       └── [room]/admin/+page.svelte   # Admin controls
└── scripts/
    └── inline.js               # Bundles Svelte output into worker
```

### Build Pipeline
1. `pnpm build` in ui/ runs Vite → outputs to `dist/`
2. `pnpm inline` uses esbuild to bundle all JS/CSS into single HTML strings
3. Outputs to `worker/src/views/generated/{guest,player,admin}.ts`
4. Worker imports and serves these HTML constants

## Chrome Extension

Located at `packages/extension/`. Provides venue display control.

### Installation

1. `pnpm build` (or just the extension: `cd packages/extension && pnpm build`)
2. Go to `chrome://extensions`
3. Enable Developer mode
4. Click "Load unpacked"
5. Select `packages/extension/dist`

### How It Works

1. Extension connects via WebSocket as `clientType: 'extension'`
2. Server sends `state` updates whenever queue changes
3. When `nowPlaying` changes, extension navigates YouTube tab to video
4. Content script detects video end, reports to server
5. Server advances queue, broadcasts new state

### Files
- **background.ts** — Service worker: WebSocket, message routing
- **content.ts** — YouTube.com: video end detection
- **popup.ts** — Status display in extension popup

---

## Current State

### Completed
- ✅ Svelte 5 migration with runes-based stores
- ✅ `type` → `kind` discriminator for all unions
- ✅ `Entry` with `videoId`/`title` (LegacyEntry kept for storage migration)
- ✅ Build pipeline: Svelte → esbuild inline → worker serves HTML
- ✅ Chrome extension with auto-play and end detection
- ✅ Help button with usage guide
- ✅ Performance outcome union (`completed` | `skipped` | `errored`)
- ✅ Result types for API responses
- ✅ Branded types (`EntryId`, `VideoId`, etc.)
- ✅ Room-based routing (`/{room}`, `/{room}/admin`, etc.)
- ✅ Google OAuth + anonymous session auth
- ✅ Jukebox mode with personal stacks
- ✅ Admin mode switching (jukebox/karaoke)
- ✅ Player view controls (search, add, admin skip/reorder/remove)
- ✅ Dynamic OAuth callback URL (works on all domains)

### Pending
- ❌ Spotify integration

## Key Files

| File | Purpose |
|------|---------|
| `packages/types/src/index.ts` | All type definitions |
| `packages/domain/src/queue.ts` | Queue operations, mode-aware sorting |
| `packages/domain/src/performances.ts` | History and stats |
| `worker/src/index.ts` | Routing, auth middleware |
| `worker/src/room.ts` | RoomDO handlers, stack management |
| `worker/src/auth.ts` | OAuth flow, session management |
| `packages/ui/src/lib/api.ts` | Typed API client |
| `packages/ui/src/lib/ws.ts` | WebSocket client |
| `packages/ui/scripts/inline.js` | Build script |

## Making Changes

1. **Types first** — Define in `@karaoke/types`
2. **Domain logic** — Pure functions in `@karaoke/domain`
3. **Handlers** — Effectful code in `worker/src/room.ts`
4. **Views** — Components in `packages/ui/src/lib/components/`

Flow: Types → Domain → Handlers → Views

## Letters to Future Self

A tradition: after meaningful sessions, write a letter to your future self in `claude/letters/`.

These letters capture:
- What happened in the session
- What you learned
- State of the codebase
- Guidance for next time

Read them when you return. They help maintain continuity across sessions.

Format: `YYYY-MM-DD-short-description.md`
