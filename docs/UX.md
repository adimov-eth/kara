# UX Optimization Plan

This document captures concrete UX improvements to make the guest, admin, and player
experiences feel faster, clearer, and more reliable. It focuses on “friction reducers”
and “confidence builders” that prevent confusion in a loud, social environment.

## Principles
1) **Reduce typing**: reuse known data, provide defaults, and make paths short.
2) **Explain status**: show “connected / polling / offline” clearly.
3) **Make fairness visible**: show why ordering changes and when it will be your turn.
4) **Optimize for interruptions**: guests glance, tap, and return — minimize state loss.
5) **Make failures self‑healing**: retry, recover, and guide the user.
6) **Protect the room**: high‑impact actions (skip) require group consensus.
7) **Reduce repeat friction**: let guests pre‑plan their songs (stack) without breaking fairness.

## Deep Dives
- `docs/UX_GUEST.md` — guest flow details, edge cases, and metrics
- `docs/UX_PLAYER.md` — TV/player experience and recovery states
- `docs/UX_ADMIN.md` — admin tooling, moderation, and session UX

## Guest Experience (Phone)
### G1) Quick‑Join Name Chip `[PROPOSED]`
**Problem**: Re‑typing a name is friction, especially for repeat singers.
**Solution**: Show a "Continue as {name}" chip if localStorage has a name, plus a small edit icon.
**Impact**: Reduces entry time; increases re‑use and adoption.

### G2) Sticky "Your Turn" Card with ETA `[PROPOSED]`
**Problem**: Users don't know when they'll sing.
**Solution**: A fixed card at the top showing position + ETA (avg song length × songs ahead).
**Impact**: Reduces anxiety; improves perception of fairness.

### G3) Connection State Pill `[PARTIAL]`
**Problem**: Users don't know if updates are live or stale.
**Solution**: Show **Realtime / Polling / Offline** status based on WS state.
**Current**: Implemented in PlayerView; pending for GuestView.
**Impact**: Builds trust, reduces confusion after network drops.

### G4) Search Flow Polishing `[PROPOSED]`
**Problem**: Unclear why a result is unselectable.
**Solution**: Explicit "Too long (max 7 minutes)" overlay + tooltip; allow clearing search quickly.
**Impact**: Fewer failed joins and frustrated taps.

### G5) Vote Feedback & Undo `[PROPOSED]`
**Problem**: Votes feel noisy if state updates lag.
**Solution**: Animate vote deltas and allow undo for a few seconds.
**Impact**: Feels responsive and forgiving.

## Queue & Fairness UX
### Q1) Explain Reordering `[PROPOSED]`
**Problem**: Users see the queue shift unexpectedly.
**Solution**: Add a "Fairness" tip near the queue or in Help: "new singers come first."
**Impact**: Reduces perceived unfairness.

### Q2) Queue Caps Visibility `[PROPOSED]`
**Problem**: Some guests add too many songs.
**Solution**: Surface a limit (if enabled) before they join.
**Impact**: Prevents conflict; reduces admin load.

## Player (TV / Venue Screen)
### P1) Autoplay Recovery Overlay `[PROPOSED]`
**Problem**: Autoplay restrictions can block playback.
**Solution**: If player is blocked, show "Click to enable playback" overlay.
**Impact**: Prevents dead air.

### P2) Idle State with QR `[IMPLEMENTED]`
**Problem**: When no songs are queued, the screen feels dead.
**Solution**: Show QR + short invite: "Scan to join the queue."
**Current**: PlayerView shows room URL when idle.
**Impact**: Encourages participation.

### P3) Extension Status Banner (Host View) `[PROPOSED]`
**Problem**: Hosts don't know if the extension is active.
**Solution**: Show connected/disconnected badge with a link to instructions.
**Impact**: Reduces troubleshooting time.

### P4) Player Controls Panel `[IMPLEMENTED]`
**Problem**: PC/venue operators need quick control without switching to admin view.
**Solution**: Search + add songs, admin mode toggle with skip/reorder/remove.
**Current**: Full controls panel in PlayerView with PIN-protected admin mode.

## Admin Experience
### A1) Fast Reorder Controls `[PARTIAL]`
**Problem**: Moving songs is slow with repeated clicks.
**Solution**: "Make next" button + drag‑and‑drop reorder.
**Current**: Move up/down arrows implemented; "Make next" and drag-and-drop pending.
**Impact**: Faster moderation.

### A2) Admin Session Clarity `[PARTIAL]`
**Problem**: Sessions can expire silently.
**Solution**: When token is invalid, show "Session expired, please re‑enter PIN."
**Current**: Token stored in sessionStorage; manual re-auth required.
**Impact**: Avoids confusion.

### A3) Bulk Actions `[PROPOSED]`
**Problem**: Clearing spam or duplicates is tedious.
**Solution**: Allow multi‑select remove for admin.
**Impact**: Faster queue hygiene.

### A4) Add to Queue Option `[IMPLEMENTED]`
**Problem**: Admin could only add songs to front (priority).
**Solution**: Two buttons: "Add to Queue" (normal position) + "Add to Front" (priority).
**Current**: Both options available in AdminView and PlayerView admin mode.

## UX‑Driven Technical Additions
### T1) State Version + Idempotency `[PROPOSED]`
Add a `stateVersion` and idempotent `requestId` for client actions to reduce inconsistent UI
after retries or out‑of‑order events. (See `research/CONSENSUS.md`.)

### T2) Client‑side Caching of Queue State `[PROPOSED]`
Persist last known state and replay on load to avoid blank screens during reconnect.

## Proposed Implementation Order
**Phase 1 (fast wins)**  
G1, G3, P2, A2, Q1

**Phase 2 (medium)**  
G2, P1, P3, Q2

**Phase 3 (advanced)**  
G5, A1, A3, T1, T2

## Success Metrics
- Time‑to‑join (guest) decreases by 20–30%.
- Reduced “what’s happening” questions (qualitative feedback).
- Fewer failed joins due to invalid selections.
- Lower admin intervention per session.
