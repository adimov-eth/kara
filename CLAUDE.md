# CLAUDE.md

## Project Overview

Real-time karaoke queue manager. YouTube now, Spotify later. Chrome extension for venue display control.

**Live**: https://bkk.lol (alias: https://karaoke-queue.boris-47d.workers.dev)
**Staging**: https://new.bkk.lol (alias: https://karaoke-queue-staging.boris-47d.workers.dev)

## Commands

```bash
pnpm install       # Install dependencies
pnpm build         # Build all packages (types → domain → ui → inline → extension → worker)
pnpm typecheck     # Type-check all packages
pnpm dev           # Local development
pnpm deploy:prod   # Deploy to Cloudflare (prod)
```

## Deployment

Two separate Cloudflare Workers with fully isolated data (KV, Durable Objects, secrets).

| | Production | Staging |
|---|---|---|
| URL | https://bkk.lol | https://new.bkk.lol |
| Worker | `karaoke-queue` | `karaoke-queue-staging` |
| Deploy | `pnpm deploy:prod` | `pnpm deploy:staging` |
| KV | `31425b61...` | `7b619514...` |
| DOs | Separate instances | Separate instances |
| Secrets | Set independently | Set independently |

Rooms, users, and state on staging don't exist on production and vice versa.

### Why separate workers
Cloudflare's native versioning (Gradual Deployments) shares KV and DOs — no data isolation. `--env staging` in `wrangler.toml` creates a fully separate worker.

### Rollback
Cloudflare dashboard → Workers → karaoke-queue → Deployments → Roll back

**Storage caveat**: rollback reverts code, not data. If a deploy changes the storage schema, old code reads new-format data. Current codebase handles this via migration-on-read, but migration is one-directional.

### First-time staging setup (manual, already done)
1. Cloudflare Workers dashboard: add custom domain `new.bkk.lol` on `karaoke-queue-staging`
2. Google Cloud Console: add `https://new.bkk.lol/auth/callback` to authorized redirect URIs
3. Set secrets: `wrangler secret put GOOGLE_CLIENT_ID --env staging` (etc.)

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
- **DO key-value storage** — JSON-serialized, lazy-loaded, migrates legacy formats on read

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

## How to See

Before acting on any system, see it. Not the documentation of it. Not your assumptions. The thing itself.

### Principles

- **See before you act.** Build a model of what exists before proposing what should change. Read the code, not the docs — docs describe intent, code describes reality. Where they diverge, the code is right.
- **Root in purpose, not technology.** Every system exists for someone. Find that root and name the system from their perspective. Name parts for what they do, not what implements them. Names shape thought.
- **Hold what is, not what should be.** A model that prescribes is a plan. A model that observes is a mirror. Note tensions, seams, inconsistencies — without resolving them. A field defined but never assigned is information. Two paths that do the same thing differently is information.
- **Both layers, always.** The human experience (what it feels like to use) and the machine reality (why it's built this way, what constraints shaped it). If either is missing, you don't understand the system.
- **Containment is the question.** Architecture is about what's inside what. S-expressions make containment structural — if it's indented inside the parens, it's contained. Use them for models (`claude/model-v2.lisp`).
- **Latent, not dead.** Things that exist but don't flow yet aren't waste — they're possibility. An unused type is an intention not yet crossed into. An unimplemented variant is a door not yet opened.
- **Clear mind, then act.** If the mind is pattern-forcing, it will see patterns that aren't there and miss what is. Settle first.

## System Models

Three artifacts in `claude/`:

| File | Purpose |
|------|---------|
| `claude/model-v2.lisp` | The true model. Human journey organizes everything. Each concept once. Two recurring forms: `(edge ...)` for where the scaffolding fails, `(gift ...)` for where the design succeeds. Verified against source code. |
| `claude/plan-awakening.lisp` | Prescriptions extracted from the model. Hibernation fixes, transactional storage, client articulation layer. Ordered by silent production breakage. The model observes; this file prescribes. |
| `claude/model.lisp` | v1 model. Superseded by model-v2. Kept for reference — shows the three-pass approach that didn't cohere. |

Read `model-v2.lisp` before making changes. It holds the system's shape — what works, what breaks, what's latent.

## On Building Models

What previous instances found by building `claude/model.lisp` and `claude/model-v2.lisp` — and getting it wrong, and revising.

### What this system is

The system is articulate to itself and mute to its humans. Every mutation broadcasts full state. Every advance records a performance. Every vote is tracked. The machine knows everything that happened.

The person doesn't. Removed your song — no notification. Lost your message — no feedback. Changed the mode — stale UI. Skipped your song by crowd energy — blamed on the admin.

This is the structural recognition. Not a bug list. The thread that runs through the whole system: the gap between what the machine knows and what it says. A model that doesn't surface these silences is describing the architecture, not the system.

### How to model (corrections from practice)

The first model started with data structures. Accurate parts list, disconnected understanding. The second pass added state machines. The third added meaning. Three passes, three voices, three artifacts that didn't cohere. What follows is what replaced that approach.

- **Start from the human journey.** Walk in → become someone → find a song → wait → sing → the room responds. Let types, wiring, and machine constraints appear where they explain why a moment works the way it does. A model organized by architecture produces a parts list. A model organized by experience produces understanding.
- **Say each thing once, where it first matters.** Epochs were explained three times in v1 — in the data model, in queue sorting, in the fairness section. Each concept belongs where the human first encounters it. If you're writing something you already wrote elsewhere, one location is wrong.
- **Edge cases next to the states they disrupt.** The seams section named seven silences but lived 500 lines from the mechanical details. An edge case belongs inline. A closing section can name the pattern across them, but shouldn't re-explain.
- **One voice.** Three passes with different intentions produced clinical S-expressions, narrative strings, and philosophical comments. Choose one form and hold it. If you're switching registers, the understanding wasn't integrated.
- **Verify against code.** The first model claimed DOs can't fetch externally. Wrong. Machine details — storage backends, API formats, connection URLs, platform capabilities — are the claims most likely to be wrong. State machines derived from reading component code are the claims most likely to be right.

## Letters to Future Self

A tradition: after meaningful sessions, write a letter to your future self in `claude/letters/`.

These letters capture:
- What happened in the session
- What you learned
- State of the codebase
- Guidance for next time

Read them when you return. They help maintain continuity across sessions.

Format: `YYYY-MM-DD-short-description.md`
