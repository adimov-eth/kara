# 🎤 Karaoke Queue

A simple, real-time karaoke queue manager built as a Cloudflare Worker with Durable Objects for persistent state.

## Features

- **Two modes** — Karaoke (name-based, epoch fairness) or Jukebox (session-based, personal stacks)
- **Real-time updates** — WebSockets with polling fallback for reliability
- **Mobile-friendly** — Designed for phones at a karaoke party
- **Persistent state** — Queue survives page refreshes and reconnections
- **Admin controls** — Skip, remove, reorder, add songs, switch modes (PIN-protected)
- **Player controls** — Search and add songs from the TV screen
- **Google OAuth** — Cross-device identity for jukebox mode

## Vision
Karaoke should feel effortless: guests add songs from their phones, the crowd votes, and the venue screen plays automatically. The system stays out of the way, keeps the line fair, and never makes the host babysit the queue.

## Architecture Overview
This is a pnpm monorepo with a strict separation of concerns:
- `packages/types/`: shared contracts and protocol types.
- `packages/domain/`: pure queue rules, identity, validation, and YouTube parsing.
- `packages/ui/`: Svelte 5 front-end, built static and inlined into the Worker.
- `worker/`: Cloudflare Worker + Durable Object (RoomDO) as the system-of-record.
- `packages/extension/`: Chrome extension for hands-free venue playback.

Runtime model:
- **Single room = one Durable Object.** Queue, votes, identity, and history live per room.
- **WebSocket-first, HTTP fallback.** Realtime updates when possible, polling when not.
- **UI is inlined into the Worker.** Svelte output is bundled into HTML constants and served directly.
- **Extension controls YouTube.** Background WS sync + content script playback control.

For a deeper architecture and tradeoff breakdown, see `docs/ARCHITECTURE.md`.
For realtime consistency and consensus rationale, see `research/CONSENSUS.md`.
For UX improvements and prioritization, see `docs/UX.md`.

## Design Decisions
1. **Durable Objects as truth** — simplifies concurrency and state consistency.
2. **Round-based fairness** — after you sing, your next song is placed behind everyone who was already waiting when your song ended.
3. **Optional Jukebox mode** — allow upvoted songs to climb above the round order (without preempting the current song).
4. **Type-first contracts** — shared types drive UI, Worker, and extension behavior.
5. **Minimal auth** — 6-digit PINs for name claiming and admin control.
6. **Inline UI** — no separate hosting or asset pipeline at runtime.

## Strengths & Risks
**Strengths**
- Pure domain logic is easy to test and reason about.
- Low ops: single Worker deployment, Durable Object storage.
- Resilient UX: polling fallback and optimistic extension behavior.

**Risks / Weak Points**
- Client-trusted verification can be tightened for PIN claims.
- WebSocket join path should match HTTP validation rules.
- Extension is currently single-room (no room selection UI).
- Unofficial YouTube search endpoint may change over time.

## Roadmap (Pragmatic and High-Leverage)
**Horizon 1: Safety + Consistency**
- Enforce validation/sanitization on WebSocket joins.
- Require server-issued verification token for claimed names.
- Server-side guard: no voting on your own entry.
- ~~Fix Admin popular-songs payload mismatch.~~ ✅

**Horizon 2: Multi-Room Maturity**
- Extension room selector + stored room preference.
- Persist admin sessions in storage with clear expiry UX.
- Room-level settings (queue size, max song length, voting on/off).
- ~~Personal song stacks (auto‑queue next song after your turn).~~ ✅ Jukebox mode
- ~~Google OAuth + anonymous sessions.~~ ✅
- Skip consensus voting (2/3 majority to skip)

**Horizon 3: Product Expansion**
- Spotify integration (search + playback in player view).
- Performance analytics (top songs/singers, time-based stats).
- Moderation tools (soft bans, queue throttling).

## Deployment

### Prerequisites

1. Node.js 18+ and pnpm
2. A Cloudflare account + Wrangler CLI
3. `wrangler login`

### Deploy

```bash
pnpm install
pnpm build
pnpm --filter @karaoke/ui build:inline
pnpm deploy:prod
```

That's it! Wrangler will output your worker URL like:
```
https://karaoke-queue.<your-subdomain>.workers.dev
```

Share this link with your friends at the party.

## How It Works

- **Cloudflare Worker** serves the inlined Svelte UI and routes API calls
- **Durable Object** (`RoomDO`) maintains per-room queue state, votes, and history
- **WebSockets** push realtime updates; **HTTP** provides a polling fallback
- **Chrome extension (optional)** auto-plays YouTube and reports end/error events

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/state` | Full queue state |
| POST | `/api/join` | Join queue (body: `{ name, videoId, title, verified? }`) |
| POST | `/api/vote` | Vote on entry (header: `X-Voter-Id`) |
| POST | `/api/remove` | Remove entry (user or admin) |
| POST | `/api/skip` | Skip current song (user or admin) |
| POST | `/api/next` | Advance queue to next song (admin) |
| POST | `/api/reorder` | Reorder entry (admin) |
| POST | `/api/add` | Add entry to front (admin) |
| GET | `/api/search?q=` | YouTube search results |
| POST | `/api/claim` | Claim a name with PIN |
| POST | `/api/verify` | Verify PIN for claimed name |
| GET | `/api/identity/:name` | Check if name is claimed |
| GET | `/api/room/check` | Check room config existence |
| POST | `/api/room/create` | Create a room + admin PIN |
| POST | `/api/admin/verify` | Verify admin PIN for room |
| GET | `/api/rooms/active` | Active rooms list |

## Customization

Edit the UI in `packages/ui/` (styles in `packages/ui/src/app.css`), then rebuild:
- `pnpm --filter @karaoke/ui build:inline` (regenerates `worker/src/views/generated/`)
- `pnpm deploy:prod`

## Cost

Cloudflare Workers free tier includes:
- 100,000 requests/day
- Durable Objects: 1 million requests/month

More than enough for a karaoke party!

---

Have fun singing! 🎵
