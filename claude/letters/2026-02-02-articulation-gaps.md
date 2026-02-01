# Articulation Gaps: Five Seams Resolved

**Date**: 2026-02-02  
**Session**: Continued from previous context  
**Commits**: 4 total (feddf3a → 56bdc65)

## What Happened

I inherited a codebase with a complete system model (`claude/model-v2.lisp`) identifying seven "seams" — structural gaps where the system knows something but doesn't tell the person. Five of those seams have now been fixed.

### Fixed Seams

1. **Mode switch not reactive on guest**
   - Problem: Admin toggles karaoke↔jukebox, but guest UI stays on old mode
   - Solution: Added `configUpdated` ServerMessage broadcast when admin changes config
   - Implementation: Wire handler in GuestView and AdminView to update `roomConfig` reactively
   - Result: Instant UI sync, toast notification of mode change

2. **Energy skip blamed on admin**
   - Problem: Performance outcome records `{by: 'admin'}` when crowd energy triggers skip
   - Solution: Added `'energy'` as third option in PerformanceOutcome union
   - Implementation: Changed energy skip to use `{by: 'energy'}`
   - Result: Correct attribution, analytics reflect crowd behavior

3. **On-deck warning skipped for direct entry**
   - Problem: User joins queue directly at position #2 or #1 (short queue), never gets "up next" warning
   - Solution: Trigger warning when `previousPosition === null && newPosition <= 2`
   - Implementation: Modified condition to fire on first entry, not just on movement
   - Result: New users at front of queue now get immediate warning

4. **Recap overlay blocks all interaction**
   - Problem: 4-second celebration fullscreen overlay blocks taps, users can't dismiss it early
   - Solution: Make overlay clickable, dismissable on tap
   - Implementation: Added click handler and "tap to dismiss" hint (fades in after 2s)
   - Result: Users can celebrate or get on with it

5. **Admin song removal not notified**
   - Problem: Admin removes your song, it vanishes silently from queue
   - Solution: Personal store listens to `removed` WebSocket message
   - Implementation: Already wired in PR merge (personalStore.handleRemoved), just needed validation
   - Result: Toast notification "Your song was removed from the queue"

### Remaining Seams

1. **No connection indicator**
   - System never tells user whether WebSocket is connected
   - Requires UX design (where, how intrusive, what visual)
   - Low priority: most users stay connected, reconnect is automatic
   - Code infrastructure ready: added `onConnection` handler to WS manager

2. **Legacy admin access**
   - Anyone visiting `/room/admin` has full control if no admin PIN set
   - Security concern, architectural issue
   - Out of scope: requires access control redesign

## Technical Details

### Changes

- **types/index.ts**: Added `configUpdated` ServerMessage, added `'energy'` to PerformanceOutcome
- **worker/src/room.ts**: Broadcast `configUpdated` in `handleSetConfig`, changed energy skip attribution
- **packages/ui/src/lib/ws.ts**: Added `onConfigUpdated` and `onConnection` handler registrations
- **GuestView.svelte**: Wire config update handler, mode change toast, on-deck warning fix, recap dismissal
- **AdminView.svelte**: Wire config update handler for multi-admin sync
- **claude/model-v2.lisp**: Updated seam index to reflect fixes

### Testing

- 334 tests passing (unchanged)
- 0 typecheck errors
- Build successful
- Deployed to staging, then production

## Pattern Recognition

This session crystallized a pattern: **articulation is the work**. The system already had all the plumbing — hibernation support, WebSocket, alarm timers, personal stores. What was missing wasn't features but communication:

- Tell the user when the room heard them (connection indicator)
- Tell the user who decided to skip their song (correct attribution)
- Tell the user they're next (on-deck warning on first entry)
- Tell the user how to dismiss the celebration (tap hint)
- Tell admins the room mode changed (config broadcast)

Each fix was small: 2-5 line changes. But the cumulative effect is moving from "system works for engineers" to "system tells the person what's happening."

## For Next Session

The two remaining seams are design, not plumbing. If tackling them:

1. **Connection indicator**: Add a small visual in header area. Not urgent — reconnection is automatic and mostly invisible.
2. **Admin access**: Requires architectural decision on authentication. Consider:
   - Require PIN to access /room/admin (already done for mode changes)
   - Or make admin features require session token (like mode switch)
   - Document the security model in CLAUDE.md

The model is now accurate: only two seams remain, both known, both scoped.

---

**State of codebase**: Stable, well-tested, ready for feature work or deployment.
