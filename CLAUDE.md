# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A real-time karaoke queue manager with YouTube integration, built as a Cloudflare Worker with KV storage. Users add songs via YouTube URL, vote on queue order, and a display view auto-plays videos.

**Live**: https://karaoke-queue.boris-47d.workers.dev

## Commands

```bash
wrangler deploy    # Deploy to Cloudflare Workers
wrangler dev       # Local development
```

## Architecture

**Single-file**: Everything in `worker.js` (~2170 lines)

| Section | Lines | Description |
|---------|-------|-------------|
| API handlers | 8-300 | State management, all `/api/*` endpoints |
| Fetch router | 302-432 | Routes requests to API or HTML views |
| `USER_HTML` | 434-1278 | User view: join queue, vote, see status |
| `PLAYER_HTML` | 1279-1634 | Display view: YouTube player, auto-advance |
| `ADMIN_HTML` | 1635-2168 | Admin: skip, reorder, remove, add entries |

## Views

| Path | Purpose |
|------|---------|
| `/` | Users add songs (name + YouTube URL), vote, remove own entry |
| `/player` | Big screen display, auto-plays queue, shows "up next" |
| `/shikashika` | Admin controls: skip, add, reorder, remove |

## Data Model

```typescript
Entry {
  id: string           // Unique ID
  name: string         // Singer name (max 30 chars)
  youtubeUrl: string   // YouTube video URL
  youtubeTitle: string // Video title (max 100 chars)
  votes: number        // Net votes (can go negative)
  epoch: number        // Priority tier (lower = plays first)
  joinedAt: timestamp  // Tiebreaker within same epoch/votes
}

State {
  queue: Entry[]       // Sorted: epoch ASC, votes DESC, joinedAt ASC
  currentEpoch: number // Increments when song completes
  nowPlaying: Entry | null
}
```

## Epoch System (Fair Queue)

Prevents queue-hogging: people who wait get priority over repeat singers.

1. New entries get `epoch = currentEpoch`
2. When song finishes: `currentEpoch++`
3. Sort: epoch ASC, then votes DESC, then joinedAt ASC

Example: A sings while B waits. A rejoins. B plays next regardless of A's votes (B has lower epoch).

## API Endpoints

| Method | Endpoint | Auth | Body | Description |
|--------|----------|------|------|-------------|
| GET | `/api/state` | - | - | Full state |
| POST | `/api/join` | - | `{ name, youtubeUrl, youtubeTitle }` | Add to queue |
| POST | `/api/vote` | `X-Voter-Id` | `{ entryId, direction: 1/-1/0 }` | Vote |
| POST | `/api/remove` | `X-Admin` or `X-User-Name` | `{ entryId }` | Remove entry |
| POST | `/api/skip` | `X-Admin` or `X-User-Name` | - | Skip current |
| POST | `/api/next` | - | `{ currentId }` | Advance queue (idempotent) |
| POST | `/api/reorder` | `X-Admin` | `{ entryId, newPosition }` | Reorder |
| POST | `/api/add` | `X-Admin` | `{ name, youtubeUrl, youtubeTitle }` | Add to front |

## Key Features

- **YouTube validation**: Client-side duration check (<7 min), rejects livestreams/playlists
- **Auto-advance**: Player calls `/api/next` on video end, with idempotency (prevents double-skip from multiple tabs)
- **Self-service**: Users can skip own song or remove from queue
- **Voting**: One vote per voter per entry, stored in localStorage UUID

## Configuration

- `wrangler.toml`: KV namespace binding (`KARAOKE_KV`)
- `MAX_DURATION`: 420 seconds (7 min) — user view validation
- Polling: 3s (user), 2s (player/admin)
