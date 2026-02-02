# Phase 3 Test Scenario (Connection Awareness)

Prereq: use staging `https://new.bkk.lol` and a room with active queue updates. Open three tabs for the same room:
- Guest view: `/{room}`
- Admin view: `/{room}/admin`
- Player view: `/{room}/player`

## A. Guest Banner (Reconnecting + Connected flash)
1) In Guest view, ensure the page is connected (normal UI, no banner).
2) Simulate a disconnect:
   - Option A: go offline (browser devtools).
   - Option B: block WebSocket requests for the tab (`*upgrade=websocket*`).
3) Expected: top banner appears with “Reconnecting…” and a pulsing animation.
4) Restore connectivity (re-enable network or unblock WS).
5) Expected: banner flashes “Connected” briefly (~1.2s) and then disappears.

## B. Admin Banner (Reconnecting + Connected flash)
1) In Admin view, confirm normal state (no banner).
2) Simulate a disconnect (offline or block WS).
3) Expected: top banner appears with “Reconnecting…” and a pulsing animation.
4) Restore connectivity.
5) Expected: banner flashes “Connected” briefly and then disappears.

## C. Player Indicator (Amber dot only when disconnected)
1) In Player view, confirm no connection indicator when connected.
2) Simulate a disconnect (offline or block WS).
3) Expected: small amber dot appears in the top-right corner with a subtle pulse.
4) Restore connectivity.
5) Expected: amber dot disappears.

## D. Behavior During Polling Fallback
1) With WS blocked on Guest or Admin, confirm the reconnecting banner stays visible while polling keeps UI updates.
2) Unblock WS. Expected: banner flashes “Connected” and disappears.

## What to record
- Room code, timestamp, browser/version.
- Screenshots or video of banner/dot behavior on disconnect and reconnect.
- Note if banner persists incorrectly or never appears.
