# Bring model-v2 to Life

The model observes. This plan removes every obstacle it identified.

Organized into 6 phases by dependency order. Each phase is independently deployable and testable. Phases 1-3 are server foundation. Phases 4-6 are client-facing.

## What's Already Done

From previous sessions (PR #4 merge + articulation fixes):

- WebSocket attachments (`serializeAttachment` / `rebuildMapsFromAttachments`) — DONE
- Alarm-based timers replacing `setTimeout` (pinned messages + energy skip) — DONE
- Personal articulation store (`personal.svelte.ts`) — DONE
- `configUpdated` WebSocket broadcast on mode/social changes — DONE
- Energy skip attribution `{by: 'energy'}` — DONE
- On-deck warnings fire on first entry — DONE
- Recap overlay dismissable by tap — DONE
- Song removal notification via personalStore — DONE

## Phase 1: Server Resilience

**Goal**: Fix silent failures that affect production reliability.

### 1a. Admin sessions survive hibernation

**Problem**: `adminSessions` Map lost on DO restart. Admin gets 401, must re-login.

**Files**: `worker/src/room.ts`

**Approach**: Persist admin sessions to DO storage using the same lazy-load pattern as other data.

- Add `ADMIN_SESSIONS_KEY = 'admin_sessions'`
- Add `private adminSessionsCache: Map<string, AdminSession> | null = null`
- Add `getAdminSessions()` / `saveAdminSessions()` with lazy-load + put
- Update `createAdminSession()`, `isValidAdminToken()`, `cleanExpiredSessions()` to use storage
- Add cleanup of expired sessions in `getAdminSessions()` (prune on read)

### 1b. Tag-based broadcast optimization

**Problem**: `broadcastToClientTypes` iterates all sockets + checks Map. Tags survive hibernation natively.

**Files**: `worker/src/room.ts`

**Approach**: Use `state.getWebSockets(tag)` for role-filtered broadcasts.

- Refactor `broadcastToClientTypes` to call `this.state.getWebSockets(`type:${ct}`)` per clientType
- Keep Maps as secondary source for runtime identity (userId, displayName) — tags are immutable
- Note: subscribe handler can update `clientType` at runtime. Tags set at accept time reflect initial type. For the rare case of clientType change mid-session, update the attachment and fall back to Map check.
- This is an optimization, not a correctness fix (Maps are rebuilt from attachments post-wake)

### 1c. Chat message queueing during reconnect

**Problem**: `ws.send()` silently drops messages when disconnected. Chat messages lost.

**Files**: `packages/ui/src/lib/ws.ts`

**Approach**: Queue messages during disconnect, flush on reconnect.

- Add `pendingMessages: ClientMessage[] = []` to WS manager
- In `send()`: if not connected, push to queue (only for `chat` and `reaction` kinds — skip pings, subscribes)
- In `onopen` handler: after subscribe, flush pending queue
- Cap queue at 20 messages to prevent memory growth
- Add `hasPendingMessages(): boolean` to interface for UI indicator

### 1d. Polling resilience for admin and guest

**Problem**: Admin polling stops on first WS message and never resumes. Guest has no polling at all.

**Files**: `packages/ui/src/lib/components/AdminView.svelte`, `packages/ui/src/lib/components/GuestView.svelte`

**Approach**:

- **AdminView**: Add `ws.onConnection()` handler. On disconnect, restart polling. On reconnect, stop polling.
- **GuestView**: Add polling fallback. Start 3s polling after 2s if WS hasn't connected. Stop on first WS state message. Resume on disconnect.

### 1e. Note on transactionSync

**Not implementing**: `doAdvanceQueueCore` uses async lazy-loading which is incompatible with the synchronous `transactionSync()` callback. The DO is single-threaded, so concurrent corruption isn't possible. The risk is partial writes on I/O errors, which is theoretical — Cloudflare's storage layer handles retries internally. Documenting this as an accepted trade-off in the model rather than introducing complexity.

**Verification**:

- Deploy to staging
- Create room, add songs, play through queue → admin session survives DO restart (test by waiting for hibernation or redeploying)
- Disconnect network briefly → reconnect → chat messages arrive
- Kill WS connection → admin/guest UI continues updating via polling

---

## Phase 2: Identity & Access

**Goal**: Fix the legacy admin access hole and identity edge cases.

### 2a. Legacy room admin upgrade path

**Problem**: Rooms created before admin PIN have no protection. Anyone at `/room/admin` has full control.

**Files**: `worker/src/room.ts`, `packages/ui/src/lib/components/AdminView.svelte`

**Approach**: Add a "claim room" flow for legacy rooms.

- In `handleAdminVerify`: if no admin exists AND request includes a new PIN → create admin with that PIN (first-come-first-serve claim)
- In AdminView: when `authChecked && !isAuthenticated` and room has no admin, show "Set admin PIN" form instead of "Enter PIN" form
- Server: add `POST /api/room/claim` endpoint — creates admin for rooms that have none, requires new PIN
- After claim: room behaves identically to newly created rooms

### 2b. PIN modal closes on mode switch

**Problem**: Admin switches to jukebox while user in PIN modal. Modal stays open — PINs don't exist in jukebox.

**Files**: `packages/ui/src/lib/components/GuestView.svelte`

**Approach**: In the `configUpdated` handler, if mode changed to jukebox, close PIN modal.

- Add `if (config.mode === 'jukebox') { pinMode = 'closed'; }` to configUpdated handler

### 2c. Suppress PIN claim modal in jukebox mode

**Problem**: After song finishes in jukebox mode, recap shows PIN claim. PINs are karaoke-only.

**Files**: `packages/ui/src/lib/components/GuestView.svelte`

**Approach**: Guard the claim modal with mode check.

- Line ~199: wrap `setTimeout(() => { pinName = myName; pinMode = "claim"; }, 1500)` with `if (roomMode === 'karaoke')`

### 2d. Admin token persistence across browser close

**Problem**: Token in sessionStorage — lost on browser close. Admin must re-enter PIN.

**Files**: `packages/ui/src/lib/api.ts` (getAdminToken/setAdminToken), `packages/ui/src/lib/components/AdminView.svelte`

**Approach**: Move admin token to localStorage with per-room key and expiry.

- Change `setAdminToken` to use `localStorage` instead of `sessionStorage`
- Store `{token, expiresAt}` object
- `getAdminToken` checks expiry, clears if expired
- Keep 4h server-side TTL as authority — client-side expiry is a convenience

**Verification**:

- Legacy room (no admin) → admin page shows "Set PIN" → set PIN → room now protected
- Jukebox mode → finish song → no PIN claim modal appears
- Mode switch while in PIN modal → modal closes
- Close browser → reopen admin page → still authenticated (within 4h)

---

## Phase 3: Connection Awareness

**Goal**: The room tells the user whether it can hear them.

### 3a. Connection status indicator

**Problem**: No offline indicator on phones. User speaks into what might be a void.

**Files**: `packages/ui/src/lib/components/GuestView.svelte`, `packages/ui/src/lib/ws.ts`

**Approach**: Small banner at top of GuestView when disconnected.

- `wsConnected` state already exists from previous session (added to GuestView but not yet wired to UI)
- `ws.onConnection()` handler already registered
- Add a subtle top banner: "Reconnecting..." with pulsing animation, shown when `!wsConnected`
- Auto-dismiss with "Connected" flash when WS reconnects
- Same pattern for AdminView

### 3b. Connection status on PlayerView

**Files**: `packages/ui/src/lib/components/PlayerView.svelte`

**Approach**: Small indicator in corner (not a banner — player is the big screen).

- Dot indicator: green when connected, pulsing amber when reconnecting
- Position: top-right corner, small, non-intrusive
- Only show amber state (don't distract with green when everything is fine)

**Verification**:

- Disconnect network → GuestView shows "Reconnecting..." banner
- Reconnect → banner flashes "Connected" then disappears
- PlayerView shows amber dot during disconnect

---

## Phase 4: Search & Validation Robustness

**Goal**: Fix race conditions and false positives in song finding flow.

### 4a. Search abort on new query

**Problem**: No AbortController. Old results can overwrite new results.

**Files**: `packages/ui/src/lib/components/Search.svelte`, `packages/ui/src/lib/api.ts`

**Approach**:

- Add `AbortController` to search function
- On new search: abort previous controller, create new one
- Pass signal to fetch in `searchApi()`
- Catch `AbortError` silently (expected)

### 4b. Video validation race fix

**Problem**: Select song A, then song B while A validates. A's result applies to B's context.

**Files**: `packages/ui/src/lib/components/GuestView.svelte`

**Approach**:

- Track current validation videoId
- On validation callback, compare against current selectedSong
- If mismatch, discard result and re-validate for current selection

### 4c. Reduce false-positive needs_interaction

**Problem**: 1s timeout too aggressive. YouTube can still be buffering.

**Files**: `packages/ui/src/lib/components/PlayerView.svelte`

**Approach**:

- Increase timeout from 1000ms to 2500ms
- Add buffering (state 3) as acceptable state (not needs_interaction)
- If state is still -1 after 2.5s, check one more time at 5s before declaring needs_interaction

### 4d. YouTube API load failure fallback

**Problem**: If `window.YT` fails to load, validation skipped entirely. Could add livestreams.

**Files**: `packages/ui/src/lib/components/GuestView.svelte`

**Approach**:

- Add `ytApiLoaded` flag, set on `window.onYouTubeIframeAPIReady`
- If YT API not loaded after 5s, show warning "Video validation unavailable"
- Still allow adding (current behavior) but show disclaimer
- Not a hard block — graceful degradation

**Verification**:

- Type query, immediately type another → first results never flash
- Select song A, quickly select song B → B validates correctly
- Player: slow video doesn't trigger false "click to start"
- Disable network to YouTube → validation warning shown, can still add

---

## Phase 5: Queue & Playback Edge Cases

**Goal**: Fix the remaining edge cases in the waiting and on-stage experience.

### 5a. Countdown-to-nothing guard

**Problem**: Queue empties during 7s pause countdown. Countdown to nothing.

**Files**: `packages/ui/src/lib/components/PlayerView.svelte`

**Approach**:

- In countdown tick: check `room.queue.length === 0 && !room.nowPlaying`
- If empty, clear countdown early and transition to idle_screen
- Show brief "Queue empty" message instead of abrupt blank

### 5b. Network fail during advance — retry

**Problem**: Countdown fires, `/api/next` fails. Abrupt transition to blank.

**Files**: `packages/ui/src/lib/components/PlayerView.svelte`

**Approach**:

- Add retry logic (up to 2 retries with 1s delay) in `advanceToNext()`
- On final failure: show error toast, transition to idle with message "Connection lost — scan to add songs"
- Don't leave user staring at blank screen

### 5c. Stack freshness on multi-device

**Problem**: Stack loaded once, never updated from WS messages.

**Files**: `packages/ui/src/lib/components/GuestView.svelte`, `packages/ui/src/lib/components/MyStack.svelte`

**Approach**:

- Wire `ws.onState()` to check for `stackUpdated` / `promotedToQueue` messages (these are already in the ServerMessage union)
- Wait — these are separate message kinds, not embedded in state. Need to wire handlers in GuestView:
  - `ws.onStackUpdated` → not yet in ws.ts. Add handler type + registration
  - On `stackUpdated`: refresh MyStack display
  - On `promotedToQueue`: refresh MyStack + show toast "Your next song entered the queue!"

### 5d. Mode switch during song add

**Problem**: Admin switches mode between search and add. Client sends wrong endpoint.

**Files**: `packages/ui/src/lib/components/GuestView.svelte`

**Approach**:

- In `handleJoin` / `handleAddSong`: re-read `roomMode` (now reactive via configUpdated)
- The mode is already `$derived` from `roomConfig` — as long as configUpdated updates roomConfig, the derived value is current
- Add check: if mode changed since search, show toast "Room mode changed. Please try again." and reset form

### 5e. Stale name in localStorage may be claimed

**Problem**: User returns days later, old name pre-filled, might be claimed now.

**Files**: `packages/ui/src/lib/components/GuestView.svelte`

**Approach**:

- On mount, if `myName` restored from localStorage and mode is karaoke:
  - Check `/api/identity/{name}` to see if claimed
  - If claimed and not in `verifiedNames`, show subtle hint "This name requires a PIN"
  - Don't block — just inform

**Verification**:

- Empty queue → player shows countdown → remove all songs → countdown ends early, shows "Queue empty"
- `/api/next` fails → retry → still fails → error message, not blank screen
- Add song on device A → device B stack updates
- Admin switches mode while user is in add flow → user sees "mode changed" toast

---

## Phase 6: Cleanup & Latent Code

**Goal**: Remove dead code, activate useful latent types, update the model.

### 6a. Remove unused types and fields

**Files**: `packages/types/src/index.ts`

- Remove `ExtensionMessage` type (extension uses ClientMessage)
- Remove `UserStack` interface (room.ts uses Record directly)
- Remove `PlaybackState.position` field (set but never read — clients derive from startedAt)
- Remove `Entry.sessionId` field (never assigned)
- Remove branded type cast functions if truly unused (keep the type aliases — they document intent)

### 6b. Activate or remove room.svelte.ts

**Files**: `packages/ui/src/lib/stores/room.svelte.ts`

**Approach**: GuestView manages its own state. The store is latent.

- If personalStore already covers the "reactive state" use case, remove room.svelte.ts
- OR: migrate GuestView's inline state to use room.svelte.ts for centralization
- Decision: **remove** — GuestView's inline state is working, and adding indirection without benefit violates simplicity

### 6c. Update model-v2.lisp

After all phases complete, update the model:

- Mark resolved edges as resolved (with brief note)
- Update section 10 (THE SHAPE) seam/gift index
- Update plan-awakening.lisp to reflect completion status

### 6d. Energy edge cases (low priority)

- `threshold-changed-mid-timer`: Reset energy skip timer when admin changes threshold config
- `no-reactions-no-decay`: Add visual indicator on PlayerView when energy skip timer is active (pulsing energy meter or countdown text)
- Orphaned stacks on karaoke switch: Show warning in admin UI before mode switch if users have stacks

**Verification**:

- Typecheck passes with removed types
- Build succeeds
- All 334+ tests pass
- No runtime errors from removed fields

---

## Execution Order

| Phase                   | Sessions | Dependencies             | Risk                     |
| ----------------------- | -------- | ------------------------ | ------------------------ |
| 1. Server Resilience    | 1        | None                     | Medium (storage changes) |
| 2. Identity & Access    | 1        | Phase 1 (admin sessions) | Low                      |
| 3. Connection Awareness | 0.5      | Phase 1 (WS handlers)    | Low                      |
| 4. Search & Validation  | 1        | None                     | Low                      |
| 5. Queue & Playback     | 1        | Phase 1 (WS queueing)    | Medium                   |
| 6. Cleanup              | 0.5      | All above                | Low                      |

Phases 1-3 are sequential (each builds on prior). Phases 4-5 can run in parallel with each other after Phase 1. Phase 6 is last.

## Testing Strategy

After each phase:

1. `pnpm typecheck` — 0 errors
2. `pnpm test` — 334+ tests pass (add new tests for admin session persistence, message queueing)
3. `pnpm build` — clean build
4. Deploy to staging (`new.bkk.lol`) — manual verification
5. Deploy to production (`bkk.lol`) after staging verification

## Files Modified (Full List)

**Server**:

- `worker/src/room.ts` — admin sessions, tag broadcast, room claim endpoint
- `packages/types/src/index.ts` — type cleanup, new message handlers

**Client**:

- `packages/ui/src/lib/ws.ts` — message queueing, stack handlers, connection callback
- `packages/ui/src/lib/components/GuestView.svelte` — polling, PIN modal, connection indicator, mode checks, name check
- `packages/ui/src/lib/components/AdminView.svelte` — polling resumption, connection indicator
- `packages/ui/src/lib/components/PlayerView.svelte` — countdown guard, retry, interaction timeout, connection dot
- `packages/ui/src/lib/components/Search.svelte` — AbortController
- `packages/ui/src/lib/components/MyStack.svelte` — WS-driven refresh
- `packages/ui/src/lib/api.ts` — admin token to localStorage, abort signal support

**Model**:

- `claude/model-v2.lisp` — edge resolution annotations
- `claude/plan-awakening.lisp` — completion status
