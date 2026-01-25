# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A real-time karaoke queue manager with YouTube integration, built as a Cloudflare Worker with KV storage. Users can add songs from YouTube, vote on queue order, and a display view auto-plays videos.

## Commands

```bash
# Deploy to Cloudflare Workers
wrangler deploy

# Local development (requires wrangler login first)
wrangler dev
```

## Architecture

**Single-file architecture**: Everything is in `worker.js` (~2170 lines):
- API handlers (lines 8-300): State management and business logic
- Main fetch handler (lines 302-432): Routes requests to API or views
- `USER_HTML` (lines 434-1278): User view for joining queue and voting
- `PLAYER_HTML` (lines 1279-1634): Display view with YouTube player
- `ADMIN_HTML` (lines 1635-2168): Admin control panel

**Three Views**:
1. `/` - User view: Add songs, vote, see queue
2. `/player` - Display view: YouTube player with auto-advance
3. `/shikashika` - Admin view: Queue management, skip, reorder

**Request flow**:
1. Requests to `/api/*` are handled by API functions
2. View routes serve inline HTML
3. All views poll `/api/state` for updates (2-3 seconds)

## Data Model

```typescript
Entry {
  id: string           // Unique identifier
  name: string         // Singer name (max 30 chars)
  youtubeUrl: string   // YouTube video URL
  youtubeTitle: string // Video title (max 100 chars)
  votes: number        // Net votes (can be negative)
  epoch: number        // Priority tier (lower plays first)
  joinedAt: timestamp  // For tiebreaking
}

State {
  queue: Entry[]       // Sorted by epoch ASC, votes DESC, joinedAt ASC
  currentEpoch: number // Increments when song completes
  nowPlaying: Entry | null
}
```

## Epoch System (Fair Queue Priority)

- New entries get `epoch = currentEpoch`
- When a song finishes: `currentEpoch++`
- Queue sorts by: `epoch ASC, votes DESC, joinedAt ASC`
- This ensures: if you sing while others are waiting, those others play before your next song regardless of votes

## API Endpoints

| Method | Endpoint | Headers | Body | Description |
|--------|----------|---------|------|-------------|
| GET | `/api/state` | - | - | Returns full state: `{ queue, nowPlaying, currentEpoch }` |
| POST | `/api/join` | - | `{ name, youtubeUrl, youtubeTitle }` | Add to queue |
| POST | `/api/vote` | `X-Voter-Id` | `{ entryId, direction: 1/-1/0 }` | Vote on entry |
| POST | `/api/remove` | `X-Admin` or `X-User-Name` | `{ entryId }` | Remove entry |
| POST | `/api/skip` | `X-Admin` or `X-User-Name` | - | Skip current song |
| POST | `/api/next` | - | `{ currentId }` | Advance to next song (called by player, idempotent) |
| POST | `/api/reorder` | `X-Admin` | `{ entryId, newEpoch?, newPosition? }` | Admin reorder |
| POST | `/api/add` | `X-Admin` | `{ name, youtubeUrl, youtubeTitle }` | Admin add (plays next) |

## Client-Side Features

**YouTube URL Validation** (User View):
- Uses YouTube IFrame API to check video duration
- Rejects videos >7 minutes or livestreams
- Extracts video title automatically

**Auto-Advance** (Player View):
- YouTube player detects video end (`onStateChange`)
- Calls `/api/next` to advance queue
- Auto-loads next video

**Voting**:
- One vote per voter per entry (tracked by UUID in localStorage)
- Can toggle vote off or change direction
- Cannot vote on own entry

## Configuration

- **wrangler.toml**: Configures KV namespace binding (`KARAOKE_KV`)
- **CSS variables**: Colors and theming in each HTML view
- **MAX_DURATION**: 420 seconds (7 minutes) in user view
- **Polling intervals**: 3000ms (user), 2000ms (player/admin)
