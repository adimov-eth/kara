# CLAUDE.md

## Project Overview

Real-time karaoke queue manager. YouTube now, Spotify later. Chrome extension for venue display control.

**Live**: https://karaoke-queue.boris-47d.workers.dev

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

## Epoch System (Fair Queue)

Prevents queue-hogging: people who wait get priority over repeat singers.

1. New entries get `epoch = currentEpoch`
2. When song finishes: `currentEpoch++`
3. Sort: epoch ASC → votes DESC → joinedAt ASC

## Routes

| Path | Purpose |
|------|---------|
| `/` | Guest view: add songs, vote, see queue |
| `/player` | Big screen: auto-plays queue, shows "up next" |
| `/shikashika` | Admin: skip, add, reorder, remove |

## Identity System

Optional PIN protection for stage names:

1. **Unclaimed names** — Anyone can use them
2. **After first song** — UI offers to claim name with 6-digit PIN
3. **Claimed names** — Require PIN verification to use

## API

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

## WebSocket Protocol

Connect: `wss://karaoke-queue.boris-47d.workers.dev/?upgrade=websocket`

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
│   │       ├── Toast.svelte
│   │       ├── NowPlaying.svelte
│   │       ├── Entry.svelte
│   │       ├── Queue.svelte
│   │       ├── Search.svelte
│   │       ├── PinModal.svelte
│   │       └── HelpButton.svelte
│   └── routes/
│       ├── +page.svelte            # Guest view (root)
│       ├── player/+page.svelte     # TV display
│       └── shikashika/+page.svelte # Admin controls
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

### Pending (from PRD)
- ❌ Delete `Song` aggregates (derive from Performance)
- ❌ Performance outcome union (`completed` | `skipped` | `errored`)
- ❌ Result types for API responses
- ❌ Branded types (`EntryId`, `VideoId`, etc.)

## Key Files

| File | Purpose |
|------|---------|
| `packages/types/src/index.ts` | All type definitions |
| `packages/domain/src/queue.ts` | Queue operations |
| `packages/domain/src/performances.ts` | History and stats |
| `worker/src/room.ts` | RoomDO handlers |
| `packages/ui/src/lib/ws.ts` | WebSocket client |
| `packages/ui/scripts/inline.js` | Build script |
| `PRD.md` | Full specification |

## Making Changes

1. **Types first** — Define in `@karaoke/types`
2. **Domain logic** — Pure functions in `@karaoke/domain`
3. **Handlers** — Effectful code in `worker/src/room.ts`
4. **Views** — Components in `packages/ui/src/lib/components/`

Flow: Types → Domain → Handlers → Views
