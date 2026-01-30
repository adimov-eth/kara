# UX Deep Dive — Guest Flow

Goal: minimize friction to add a song, make wait time feel fair, and keep trust in realtime updates.

## Core Flow (Happy Path)
1) Open room URL → landing guest view  
2) Name → search/select song → validation → join  
3) See position + ETA → vote while waiting  
4) When playing → “You’re up” cue → post‑song recap → rejoin

## States & UX Expectations
### S0) First visit
- Show value quickly: name input + “Search a song”
- Allow “Continue as {last name}” if stored

### S1) Joining
- Validation feedback: URL valid / too long / blocked
- Clear button states: “Checking…”, “Ready to add”, “Joining…”

### S2) Waiting
- Position + ETA visible
- Gentle reminders when close to turn (2 songs / next / now)

### S3) Playing
- “You’re up” toast + subtle haptics
- Option to skip own song (if allowed)

### S4) Finished
- Show recap (votes) + prompt to claim name if unclaimed

### S5) Skip Vote (Consensus)
- If the room enables skip voting, guests can vote to skip the current song.
- Skip triggers only when **>= 2/3 of active guests** vote to skip.

### S6) Song Stack (Planned)
- Guests can curate a list of future songs (“stack”).
- After their song ends, the next item is auto‑queued into the **next round**.
- The user can reorder or remove items from their stack.

## Highest Impact Improvements
### G1) Quick‑Join Name Chip
**UI**: small chip above name input: “Continue as {name}” + edit icon  
**Files**: `packages/ui/src/lib/components/GuestView.svelte`  
**Acceptance**: 1‑tap to restore name; edit clears stored value

### G2) Sticky Position + ETA Card
**UI**: top card showing `#position`, “~X min” (avg song length × songs ahead)  
**Files**: `GuestView.svelte`, `NowPlaying.svelte`  
**Acceptance**: card stays visible while scrolling; hides when not in queue

### G3) Connection Status Pill
**UI**: “Realtime / Polling / Offline” indicator  
**Files**: `packages/ui/src/lib/ws.ts`, `GuestView.svelte`  
**Acceptance**: status updates within 2s of WS reconnect/fallback

### G4) Search Quality
**UI**: disable results with clear “Too long (max 7 min)” badge  
**Files**: `Search.svelte`  
**Acceptance**: no ambiguous disabled states

### G5) Vote Feedback & Undo
**UI**: animate vote change + short “Undo” toast  
**Files**: `Entry.svelte`, `Toast.svelte`, `GuestView.svelte`  
**Acceptance**: undo works for 3–5 seconds

## Friction Audit (Where People Drop)
- **Typing name** → reduce with quick‑join  
- **Searching** → unclear “no results” or disabled results  
- **Validation** → errors not obvious or too technical  
- **Queue movement** → feels random without fairness explanation (round‑based order)  

## Error & Recovery Copy (Draft)
- “You’re offline — showing last known queue”
- “Realtime lost — switching to polling”
- “Song too long (max 7 min)”
- “That name is claimed — enter PIN or choose a different name”
- “Skip requires 2/3 guest votes”
- “Added to your stack — will queue after your turn”

## Data & State Persistence
- `localStorage`: name, votes, verified names, voterId  
- **Add**: last‑known room state to avoid blank screen on load

## Edge Cases
- WS drops mid‑join → retry with requestId  
- Duplicate joins on refresh  
- User opens multiple tabs → name conflicts  
- Claimed name with missing PIN → safe recovery path

## Instrumentation Ideas
- Time from page load → “joined”  
- Join failure reasons (invalid URL, claimed name, rate limit)  
- WS reconnect count per session

## Implementation Checklist
1) Quick‑join chip UI + edit flow  
2) Connection pill in header  
3) ETA calculation (simple average for now)  
4) Persist and display last known state  
5) Vote feedback + undo  
6) Song stack UI + auto‑queue logic

## Done‑Definition (Guest)
- New users can add a song in <30 seconds  
- Returning users can join in <10 seconds  
- Clear status if realtime is down  
- No ambiguous disabled actions
