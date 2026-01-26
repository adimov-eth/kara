# CLAUDE.md

## Project Overview

Real-time karaoke queue manager. YouTube now, Spotify later. Optional Chrome extension provides better UX.

**Live**: https://karaoke-queue.boris-47d.workers.dev

## Commands

```bash
pnpm install       # Install dependencies
pnpm build         # Build all packages
pnpm typecheck     # Type-check all packages
pnpm dev           # Local development
pnpm deploy        # Deploy to Cloudflare (from worker/)
```

## Architecture

```
karaoke/
├── packages/
│   ├── types/          # Zero-dep TypeScript contracts
│   ├── domain/         # Pure business logic (no I/O)
│   └── extension/      # Chrome extension (Manifest V3)
├── worker/             # Cloudflare Worker + Durable Object
│   ├── src/
│   │   ├── index.ts    # Fetch handler, routing, DO proxy
│   │   ├── room.ts     # RoomDO - WebSocket state management
│   │   ├── env.ts      # Environment types
│   │   └── views/      # HTML templates (embedded strings)
│   └── wrangler.toml
└── worker.js           # Legacy single-file (deprecated)
```

## Design Principles

1. **Pure core, effectful shell** — Domain logic has no I/O, handlers are thin adapters
2. **Views stay embedded** — HTML strings in worker until pain demands extraction
3. **Types drive design** — Define contracts first in `@karaoke/types`
4. **WebSocket first, polling fallback** — Real-time updates via DO, HTTP fallback for reliability

## State Management

- **Durable Object (RoomDO)** — Single source of truth for queue state
- **WebSocket** — Real-time state push to connected clients (player, users)
- **HTTP API** — Backwards-compatible REST endpoints routed through DO
- **SQLite storage** — DO persistence (required for Cloudflare free tier)

## Data Model

```typescript
interface LegacyEntry {
  id: string           // Unique ID
  name: string         // Singer name (max 30 chars)
  youtubeUrl: string   // YouTube video URL
  youtubeTitle: string // Video title (max 100 chars)
  votes: number        // Net votes (can go negative)
  epoch: number        // Priority tier (lower = plays first)
  joinedAt: number     // Tiebreaker within same epoch/votes
}
```

## Epoch System (Fair Queue)

Prevents queue-hogging: people who wait get priority over repeat singers.

1. New entries get `epoch = currentEpoch`
2. When song finishes: `currentEpoch++`
3. Sort: epoch ASC → votes DESC → joinedAt ASC

## Views

| Path | Purpose |
|------|---------|
| `/` | Users: add songs, vote, remove own entry |
| `/player` | Big screen: auto-plays queue, shows "up next" |
| `/shikashika` | Admin: skip, add, reorder, remove |

## Identity System

Optional PIN protection for stage names. Simple flow:

1. **Unclaimed names** — Anyone can use them
2. **After first song** — UI offers to claim name with 6-digit PIN
3. **Claimed names** — Require PIN verification to use

```typescript
interface Identity {
  name: string      // Display name (preserves case)
  pinHash: string   // SHA-256(salt + pin)
  salt: string      // Random 16-byte hex
  createdAt: number
}
```

No rate limiting (6 digits = 1M combinations is enough). No device tracking. No reservations.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/state` | Full queue state |
| GET | `/api/search?q=` | Search YouTube |
| POST | `/api/join` | Add to queue (returns `{requiresPin}` if claimed) |
| POST | `/api/claim` | Claim name with PIN |
| POST | `/api/verify` | Verify PIN for claimed name |
| GET | `/api/identity/:name` | Check if name is claimed |
| POST | `/api/vote` | Vote (header: `X-Voter-Id`) |
| POST | `/api/remove` | Remove entry |
| POST | `/api/skip` | Skip current song |
| POST | `/api/next` | Advance queue (idempotent) |
| POST | `/api/reorder` | Admin reorder |
| POST | `/api/add` | Admin add to front |

## WebSocket Protocol

Connect: `wss://karaoke-queue.boris-47d.workers.dev/?upgrade=websocket`

**Client → Server:**
- `{ type: 'subscribe', clientType: 'user' | 'player' | 'admin' | 'extension' }`
- `{ type: 'ping' }`
- `{ type: 'ended', videoId }` — Extension reports video end
- `{ type: 'error', videoId, reason }` — Extension reports video error

**Server → Client:**
- `{ type: 'state', state: QueueState }`
- `{ type: 'pong' }`

## Development Guidelines

### Adding Domain Logic

Add to `packages/domain/src/`:
- Must be pure (no I/O, no side effects)
- Import types from `@karaoke/types`
- Export from index.ts

### Adding API Endpoints

Edit `worker/src/room.ts`:
- Add handler method to RoomDO class
- Add route in fetch() switch
- Use domain functions for logic

### Modifying Views

Edit `worker/src/views/*.ts`:
- Export template literal string
- WebSocket connection with polling fallback
- Keep HTML/CSS/JS self-contained

## Chrome Extension

Located at `packages/extension/`. Provides venue display control via Manifest V3 Chrome extension.

### Building

```bash
cd packages/extension
pnpm build           # Build for production
pnpm dev             # Watch mode for development
```

### Installation

1. Go to `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select `packages/extension/dist`

### Architecture

- **background.ts** — Service worker: WebSocket connection to server, message routing
- **content.ts** — YouTube.com: video end detection, optimistic queue advance
- **popup.ts** — Status display: connection state, now playing info

### Extension Protocol

1. Extension connects via WebSocket, subscribes as `clientType: 'extension'`
2. Server sends `state` updates whenever queue changes
3. When `nowPlaying` changes, background sends `play` command to content script
4. Content script navigates YouTube tab to video URL
5. On video end, content script:
   - Optimistically navigates to next video from local state
   - Sends `ended` message to server
6. Server advances queue and broadcasts new state
7. If mismatch, content script corrects to server state

### Future: Extension Search Routing

- DO tracks extension presence per room
- `/api/search` routes to extension when connected
- Extension searches from venue device = guaranteed playable results
