# UX Deep Dive — Admin Tools

Goal: give hosts fast, confident control with minimal clicks and clear session state.

## Core Flow (Happy Path)
1) Admin view loads → PIN login  
2) Queue appears with action controls  
3) Host reorders, skips, removes, or adds a song  
4) Optionally view history and popular songs  

## High‑Impact Improvements
### A1) Fast Reorder Controls `[PARTIAL]`
**Problem**: Reordering is slow (repeated "move up/down").
**Solution**:
- Add "Make Next" button for any entry `[PROPOSED]`
- Add drag‑and‑drop for power users `[PROPOSED]`
**Current**: Move up/down arrows on each entry (implemented in AdminView and PlayerView admin mode).
**Files**: `packages/ui/src/lib/components/AdminView.svelte`, `PlayerView.svelte`
**Acceptance**: 1 click moves to position 1; drag reorders persist

### A2) Admin Session Clarity `[PARTIAL]`
**Problem**: Token expiration appears as "unauthorized" mid‑action.
**Solution**:
- Show top banner: "Session expired — re‑enter PIN" `[PROPOSED]`
- Auto‑open PIN modal when expired `[PROPOSED]`
**Current**: Admin token stored in sessionStorage; manual re-auth required.
**Files**: `AdminView.svelte`, `packages/ui/src/lib/api.ts`

### A3) Extension Status Visibility `[PROPOSED]`
**Problem**: Host unsure if extension is connected.
**Solution**: "Auto‑play: Connected/Disconnected" banner with instructions.
**Files**: `AdminView.svelte` (use WS `extensionConnected`)

### A4) Bulk Actions `[PROPOSED]`
**Problem**: Removing spam entries takes too long.
**Solution**: multi‑select + "Remove selected" button.
**Files**: `AdminView.svelte`, `RoomDO` endpoint or repeated calls

### A5) Error Recovery Copy `[PROPOSED]`
**Problem**: Error messages are generic.
**Solution**: Replace "Failed" with actionable guidance (re‑login, refresh, retry).
**Files**: `AdminView.svelte`, `api.ts`

## Info Architecture Improvements
- **Split columns**: left for live queue + actions, right for “Add” + “History”.  
- **Sticky action bar**: skip/next/clear at top with big buttons.  
- **Search + Add**: combine search results + select + add in one flow.

## Operational UX
### Admin "Heartbeat" `[PROPOSED]`
Show a small indicator if WS is connected and room state is fresh.
**Acceptance**: visible when polling fallback is active.

### Skip Consensus Control `[PROPOSED]`
Skipping the current song requires a **2/3 vote** from active guests.
Admin can initiate a skip vote and see progress in real time.
Admin override is allowed for emergencies.
**Current**: Admin-only skip or singer can skip their own song.

### Clear Permissions Model `[IMPLEMENTED]`
If admin auth is required, always show "Room is protected" and provide PIN flow.
**Current**: PIN modal on admin view, token stored in sessionStorage.

## Edge Cases
- Room not found or deleted → clear message + option to create new room `[IMPLEMENTED]`
- Extension disconnected → prompt user to open extension `[PROPOSED]`
- Stale queue after idle → refresh prompt `[PROPOSED]`
- Skip vote never reaches 2/3 → auto-expire vote with a clear message `[PROPOSED]`
- User stack abuse → provide admin option to clear a guest's stack `[PROPOSED]`

## Implementation Checklist
1) Add extension status banner `[PROPOSED]`
2) Add "Make Next" action `[PROPOSED]`
3) Add session expired banner + re‑auth flow `[PROPOSED]`
4) Add multi‑select remove `[PROPOSED]`
5) Add drag‑and‑drop reorder `[PROPOSED]`
6) Player view admin controls ✅ (search, skip, reorder, remove)
7) "Add to Queue" + "Add to Front" options ✅

## Done‑Definition (Admin)
- Host can move a song to top in one click  
- Auth expiry is obvious and recoverable  
- Extension connectivity is visible  
- Bulk moderation is <10 seconds for 5+ entries  
