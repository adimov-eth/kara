# Phase 5 Test Scenario (Queue & Playback Edge Cases)

Prereq: use staging `https://new.bkk.lol` and a room with Guest view (`/{room}`), Admin view (`/{room}/admin`), and Player view (`/{room}/player`) open. For stack tests, use two Guest tabs with different sessions.

## A. Countdown-to-nothing guard
1) Add two songs so the Player view shows pause screen countdown between songs.
2) While countdown is running, remove all remaining songs from Admin view.
3) Expected: countdown stops early; Player transitions to idle screen with “Queue empty” or idle message (no countdown to nothing).

## B. `/api/next` retry on failure
1) During pause screen countdown, block network requests to `/api/next` (devtools).
2) Let countdown reach zero.
3) Expected: Player retries up to 2 times (approx 1s apart). After final failure:
   - Toast shows “Connection lost — scan to add songs”.
   - Player transitions to idle screen with that message.
4) Unblock network and add a song; Player should recover on next state update.

## C. Stack freshness (multi-device)
1) Ensure room is in jukebox mode.
2) Guest tab A: add 2–3 songs to stack.
3) Guest tab B (different session): add/remove/reorder songs in its own stack.
4) Guest tab A: confirm its stack remains accurate to its own account (no cross‑pollution).
5) Promote: let Guest A’s nowPlaying finish so next stack song is promoted.
6) Expected: Guest A stack updates automatically via WS and shows toast “Your next song entered the queue!”.

## D. Mode switch during add
1) Guest view: search/select a song in karaoke mode.
2) Before clicking “Add to Queue”, admin switches to jukebox mode.
3) Guest clicks add.
4) Expected: a toast “Room mode changed. Please try again.” and form resets; no wrong endpoint call.

## E. Stale name claim hint
1) In karaoke mode, enter a previously claimed name that is not in verifiedNames for this device.
2) Expected: subtle hint under name input: “This name requires a PIN”.
3) Change to an unclaimed name → hint disappears.

## What to record
- Room code, timestamp, browser/version.
- Screenshots/video for countdown guard and retry behavior.
- Notes on WS stack update timing and toast appearance.
