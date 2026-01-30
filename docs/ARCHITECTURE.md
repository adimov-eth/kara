# Karaoke Queue Architecture

## Goals
- **Frictionless party flow**: guests join, vote, and sing with minimal steps.
- **Fairness**: prevent queue hogging while keeping votes meaningful.
- **Realtime feel**: low-latency updates, graceful fallback when realtime fails.
- **Low ops overhead**: deploy and operate as a single Worker.
- **Composable codebase**: pure domain logic with shared contracts.

## Non‑Goals (Current)
- Full user accounts or social login.
- Advanced analytics dashboard.
- Multi-provider playback (Spotify is a roadmap item).

## System Diagram
```
Guest/Admin UI (Svelte)
        |  WebSocket + HTTP
        v
Cloudflare Worker (router + edge APIs)
        |  Durable Object fetch / WS upgrade
        v
RoomDO (per-room state + logic)
        |
        +--> Durable Object Storage (queue, votes, history, config)
        |
        +--> In-memory caches (search results, admin sessions)

Chrome Extension (optional)
  Background WS  <---------------------->  RoomDO
  Content script -> YouTube playback control
```

## Component Responsibilities
### `@karaoke/types`
Single source of truth for data structures and protocols:
queue entries, vote records, API results, WebSocket messages, and feedback.

### `@karaoke/domain`
Pure functions for:
- Queue ordering (round + votes + joinedAt).
- Entry creation and validation.
- Identity/PIN hashing.
- YouTube parsing utilities.
- Performance history and stats.

### `@karaoke/ui` (Svelte 5)
Client-only SPA rendered from static HTML. It connects via WebSocket and
falls back to polling for resilience. The UI is inlined into the Worker.

### `worker/` (Cloudflare Worker + Durable Objects)
**Worker (edge router):**
- Serves inlined HTML views.
- Proxies `/api/*` to the correct room’s DO.
- Tracks active rooms in KV for the landing page.
- Hosts feedback endpoints (GitHub + optional AI clarification).

**RoomDO (per room):**
- Owns queue state, votes, history, identity, and admin config.
- Broadcasts changes to all WebSocket clients.
- Enforces rate limits and authorization.
- Maintains playback sync state for player screens.

### `@karaoke/extension`
Optional venue auto‑player:
- WS connection as `extension` client.
- Content script controls YouTube playback and detects endings.
- Optimistic advance minimizes dead air.

## Data Model (Highlights)
- **QueueState**: `queue`, `nowPlaying`, `currentRound`.
- **Entry**: name, videoId, title, votes, round, joinedAt.
- **UserSongStack (planned)**: per‑user list of future songs, auto‑queued when their turn completes.
- **Performance**: playback history with outcomes.
- **Identity**: name + salted PIN hash.
- **AdminSession**: ephemeral token with expiry.

Note: the current implementation uses `epoch` as the round index; the plan is to
rename to `round` for clarity while preserving behavior.

## Core Flows
### Join Queue
1. UI validates URL (YouTube ID) and sends `/api/join`.
2. RoomDO validates name, videoId, and PIN‑claimed name.
3. Entry created via domain rules, pushed into queue, sorted.
4. State broadcasted to all clients.

### Vote
1. Client sends `/api/vote` with voter ID.
2. DO applies vote, re-sorts queue, broadcasts updated state.

### Advance/Skip
1. Admin/player triggers `/api/next` or `/api/skip`.
2. DO records performance history, advances queue, updates playback sync.
3. Broadcast new state.

### Auto‑Queue from Song Stack (planned)
1. User preselects a list of songs (“stack”).
2. When their current song ends, the next stack item is enqueued in the **next round**.
3. Votes apply normally based on mode (fair queue or jukebox).

### Playback Sync (Player Screens)
1. DO publishes `playback` state via WebSocket.
2. Player calculates drift using server/client time and seeks if needed.

### Extension Auto‑Play
1. Background script listens to queue updates.
2. On `nowPlaying` change, navigates YouTube tab.
3. Content script detects end/error and reports back.
4. DO advances queue upon confirmation.

## Architecture Choices (Why)
### Durable Object per room
**Why**: strongly consistent per-room state, no external DB coordination,
fast real‑time fanout, and easy horizontal scaling by room ID.

### WebSocket + HTTP fallback
**Why**: realtime UX where possible, resilient polling for bad networks
or blocked WS.

### Round‑based fairness (song‑end snapshot)
**Why**: after you sing, your next song should appear **after everyone who was
already in the queue when your song ended**. This preserves fairness while still
allowing votes to matter.

**Rule**:
- At song end, the current queue defines the **active round**.
- If you rejoin after singing, your new entry is placed in the **next round**.
- Votes reorder within a round by default.

**Jukebox mode (optional)**:
- Admin can allow votes to **cross rounds** so highly‑upvoted songs rise to the top.
- This never preempts the currently playing song; it only affects “next.”

### Skip Consensus (policy)
Skipping the currently playing song requires a **2/3 majority vote** of active guests.
This prevents a single admin or small clique from disrupting the flow.

Open question to lock down during implementation:
- Define the denominator for “active guests” (connected clients? recent voters? last N minutes).
Additional rules:
- Skip votes **reset per song**.
- Admin can **override** the consensus requirement when needed.

### Inline UI in Worker
**Why**: removes a separate hosting layer, keeps deployment single‑step,
and avoids runtime asset fetching.

### Extension‑driven YouTube control
**Why**: reliable autoplay and end detection without fighting browser
autoplay restrictions in the main UI.

## Tradeoffs and Weaknesses
- **PIN verification trust**: current join flow trusts a client flag.
  Needs server‑issued verification to be robust.
- **WS path validation**: WebSocket join should mirror HTTP validation.
- **Extension is single‑room**: no room selection or room‑scoped WS.
- **Unofficial YouTube search**: internal endpoint may change or throttle.
- **Ephemeral admin sessions**: DO restarts clear sessions.

## Build & Deployment Pipeline
1. `pnpm build` builds packages (types/domain/ui/extension/worker).
2. `pnpm --filter @karaoke/ui build:inline` inlines UI into
   `worker/src/views/generated/`.
3. `pnpm deploy` deploys the Worker (wrangler).

## Security & Rate Limiting
- Basic rate limits for search/join/vote/PIN attempts.
- Admin actions require token (or legacy `X-Admin` for default room).
- Feedback uses GitHub token to create issues.
- Secrets must be stored as Wrangler secrets (never committed).

## Roadmap Themes
- **Consistency & Safety**: server‑verified PIN tokens, WS validation parity.
- **Room maturity**: per-room settings, persistent admin sessions.
- **Playback depth**: Spotify support, richer sync, better fallback UX.
- **Observability**: room health metrics, queue latency, failure stats.

## Where to Change Things
- **Types**: `packages/types/src/index.ts`
- **Domain rules**: `packages/domain/src/*`
- **Durable Object**: `worker/src/room.ts`
- **Routing/edge**: `worker/src/index.ts`
- **UI**: `packages/ui/src/`
- **Extension**: `packages/extension/src/`
