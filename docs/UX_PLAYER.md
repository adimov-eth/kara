# UX Deep Dive — Player (TV) Experience

Goal: keep the room flowing with zero dead air, clear context, and fast recovery when playback fails.

## Core Flow (Happy Path)
1) Player view opens on venue screen  
2) WebSocket connects → queue state loads  
3) Current song plays; “Up Next” visible  
4) Video ends → next song loads automatically  

## Key UX States
### P0) Loading
Show a minimal loading state with logo, room code, and QR.

### P1) Idle (No Songs)
Show QR + “Scan to join the queue”. If room is empty for >N minutes, show a subtle screensaver animation.

### P2) Playing
Full‑screen video with subtle overlay: room code + “Up Next” preview (3–5 items).

### P3) Transition / Next Up
When a song ends, show a brief transition (3–7s) to avoid sudden black screens.

### P4) Autoplay Blocked
Prominent overlay: “Click to enable playback”. Provide a single big button.

### P5) Realtime Disconnected
If WS is down, show a small “Polling mode” indicator.

## High‑Impact Improvements
### P1) Autoplay Recovery Overlay
**Problem**: Browsers block autoplay for embedded YouTube.  
**Solution**: Big overlay with a single “Enable playback” button.  
**Files**: `packages/ui/src/lib/components/PlayerView.svelte`  
**Acceptance**: 1 click restores playback; overlay disappears on play.

### P2) Idle Screen QR + Instructions
**Problem**: Blank screen looks broken and doesn’t recruit new singers.  
**Solution**: QR + “Scan to join” + room code + short steps.  
**Files**: `PlayerView.svelte`  
**Acceptance**: visible when queue empty and no nowPlaying.

### P3) Extension Status Badge (Admin Overlay)
**Problem**: Host doesn’t know if extension is connected.  
**Solution**: small badge: “Auto‑play: On/Off” (when in admin view or player overlay).  
**Files**: `PlayerView.svelte`, WS state already includes `extensionConnected`.

### P4) Transition Screen
**Problem**: sudden black frame feels like a crash.  
**Solution**: short “Next up in 3…2…1” overlay or animated pause screen.  
**Files**: `PlayerView.svelte`  
**Acceptance**: displayed on song end; hides on next playback.

## Technical Considerations
- **Clock sync** already exists; ensure player seeks when drift > threshold.
- **Fallback polling** should visibly mark status to prevent trust erosion.
- **Autoplay**: YouTube iframe often needs user interaction; the overlay is necessary.
- **Skip consensus**: if skip votes are enabled, show progress toward the 2/3 threshold.

## Edge Cases
- YouTube video unavailable or blocked → show error + skip suggestion.  
- Queue updates while video loading → ensure “current” ID matches before play.  
- Multiple screens open → sync drift correction must be stable.
- Skip vote reaches threshold mid‑song → show “Skipping…” then advance.

## Implementation Checklist
1) Add autoplay overlay state + click handler.  
2) Build idle QR screen (room link + QR).  
3) Add extension status badge (if `extensionConnected`).  
4) Add transition screen or pause overlay.  
5) Add small “Polling mode” indicator.

## Done‑Definition (Player)
- No blank/black screens during idle or transitions  
- Autoplay block is recoverable in one click  
- Clear indication of connection state  
- Up‑next list always visible when songs exist
