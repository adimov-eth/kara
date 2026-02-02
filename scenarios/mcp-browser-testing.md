# Browser MCP Testing Scenario

## Environment
- Staging base: https://new.bkk.lol
- Production base (do NOT use unless asked): https://bkk.lol

## Setup
1) Open the staging landing page and create a brand-new room with a unique room code (e.g., `mcp-YYYYMMDD-hhmm`). Set a 6-digit admin PIN and a display name. Verify you are redirected to `/{room}/admin` and see a success toast.
2) Open three tabs for the same room:
   - Guest view: `/{room}`
   - Admin view: `/{room}/admin`
   - Player view: `/{room}/player`
3) Open a second Guest view in an incognito/profile to simulate another user.

## Scenario A: Core admin controls
1) On Admin view, confirm you are authenticated and can see the empty queue. Expected: no errors, queue shows 0.
2) Switch mode to karaoke, then back to jukebox. Expected: both toggles succeed; Guest view shows mode badge changes shortly after each switch.
3) Toggle social config (chat/reactions/boo). Expected: toggles persist; Guest view reflects enabled/disabled state.

## Scenario B: Karaoke flow
1) Set mode to karaoke. In Guest tab 1, enter a name and search for a song, select result, wait for validation, add to queue. Expected: success toast and queue position.
2) In Guest tab 2, enter a different name and add a second song. Expected: queue shows two entries in correct order.
3) Vote on the other user's song. Expected: vote count increments, toggling removes vote.
4) Remove your own song from Guest tab. Expected: confirmation prompt then the entry disappears.

## Scenario C: Jukebox flow
1) Switch to jukebox mode from Admin. Expected: Guest views switch to jukebox UI (stack appears).
2) In Guest tab 1, add a song without logging in (auto-anonymous). Expected: first song goes to queue, subsequent adds go to stack.
3) Add at least two more songs to stack; reorder stack via drag-drop. Expected: stack order updates and persists on refresh.
4) In Guest tab 2 (separate session), add a song. Expected: it does not affect Guest 1's stack.

## Scenario D: Player view
1) In Player view, confirm now playing/queue list/QR code render. Expected: no blank screen.
2) Let a song end (or use Admin "Skip") and confirm pause screen countdown and transition to next song. Expected: clean transition.

## Scenario E: WebSocket resilience (Phase 1)
1) Chat/reaction queueing during disconnect: in Guest tab 1, open chat panel. Temporarily go offline (or block WebSocket requests only), send a chat message and a reaction, then restore connectivity. Expected: after reconnect, the chat message appears and reaction appears on Player.
2) Guest polling fallback: block WebSocket requests for Guest tab 1 while keeping HTTP allowed (request blocking rule for `*upgrade=websocket*`). In Admin tab, add/remove a song. Expected: within ~3s Guest view updates via polling.
3) Admin polling resumption: block WebSocket requests for Admin tab after it connects. In Guest tab, add a song. Expected: Admin view updates via polling (network shows `/api/state` every ~2s). Unblock WebSocket and ensure polling stops after WS connects.

## Scenario F (Optional): Admin session persistence across DO hibernation
1) Stay logged in as admin. Trigger a DO restart/hibernation (manual redeploy or wait long enough for hibernation if available). Then perform an admin action (skip/reorder). Expected: action succeeds without re-auth.

## What to record
- Room code, timestamp, browser/version, whether incognito used.
- Screenshots on any failure.
- Network logs for `/api/state` polling and WebSocket reconnects where relevant.
- Short notes of expected vs actual behavior per scenario.
