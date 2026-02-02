;; plan-awakening.lisp — prescriptions extracted from model-v2.lisp section 9
;;
;; The model observes. This file prescribes.
;; These are plans that reference the model's observations but don't belong inside it.
;; See: claude/model-v2.lisp section 9 (THE PLATFORM TRUTH) for the observations these address.

;; ============================================================================
;; 1. WEBSOCKET ATTACHMENTS — restore identity across hibernation
;; ============================================================================

(plan serializeAttachment
  ;; STATUS: DONE (2026-02-02)
  ;; Addresses: model section 9, websocket-attachments observation
  ;; (Maps die on wake → identity lost → social features silently break)

  ;; On acceptWebSocket:
  ;;   ws.serializeAttachment({ clientType, userId?, displayName?, connectedAt })
  ;;
  ;; On webSocketMessage (after wake):
  ;;   const meta = ws.deserializeAttachment()
  ;;
  ;; On wake (rebuild from surviving connections):
  ;;   for (const ws of state.getWebSockets()) {
  ;;     const meta = ws.deserializeAttachment()
  ;;     // rebuild socketClients, socketIdentities, extensionSockets from attachment data
  ;;   }
  )

;; ============================================================================
;; 2. WEBSOCKET TAGS — role-based broadcast that survives hibernation
;; ============================================================================

(plan tags-for-broadcast
  ;; STATUS: DONE (2026-02-02)
  ;; Addresses: model section 9, websocket-tags observation
  ;; (system sets tags but iterates Maps instead → broadcasts fail after wake)

  ;; On acceptWebSocket:
  ;;   tags = ['type:{clientType}']
  ;;   if userId: tags.push('user:{userId}')
  ;;   state.acceptWebSocket(ws, tags)
  ;;
  ;; For targeted sends:
  ;;   getWebSockets('user:abc123') → send only to that user
  ;; For broadcast to role:
  ;;   getWebSockets('type:player') → send to all players
  ;;
  ;; CONSTRAINT: tags immutable after accept. Identity established after connect
  ;; must use attachments for mutable metadata, tags for known-at-connect-time data.
  )

;; ============================================================================
;; 3. ALARMS — timers that don't prevent hibernation
;; ============================================================================

(plan alarms-replace-setTimeout
  ;; STATUS: DONE (2026-02-02)
  ;; Addresses: model section 9, alarms observation
  ;; (setTimeout pins DO in memory → rooms never hibernate → costs money)

  ;; Replace setTimeout-based timers with alarm:
  ;;   pinned message expiry: setAlarm(Date.now() + 8000)
  ;;   energy skip timer: setAlarm(Date.now() + duration*1000)
  ;;
  ;; Since only ONE alarm exists per DO, store all pending timers in durable storage:
  ;;   ("timers" → { pinnedExpiry?: number, energySkipExpiry?: number })
  ;;
  ;; alarm() handler checks which timer fired and acts accordingly.
  ;; If both are pending, setAlarm for the sooner one; alarm handler reschedules for the later.
  )

;; ============================================================================
;; 4. TRANSACTIONAL STORAGE — atomic writes in doAdvanceQueueCore
;; ============================================================================

(plan transactionSync
  ;; STATUS: NOT IMPLEMENTED (accepted trade-off)
  ;; Addresses: model section 9, transactional-storage observation
  ;; (sequential puts without rollback → partial writes possible on I/O error)

  ;; doAdvanceQueueCore wraps its mutations:
  ;;   state.storage.transactionSync(() => {
  ;;     storage.put('state', newState)
  ;;     storage.put('votes', votes)
  ;;     storage.put('user_stacks', stacks)
  ;;   })
  ;;
  ;; NOTE: transactionSync callback must be synchronous.
  ;; Current code uses async get() for lazy loading, so migration requires
  ;; ensuring all data is loaded before entering the transaction.
  )

;; ============================================================================
;; 5. CLIENT ARTICULATION — personal meaning from impersonal events
;; ============================================================================

(plan articulation-layer
  ;; STATUS: DONE (2026-02-02)
  ;; Addresses: model section 9, articulation-gap observation
  ;; (events flow but don't land → the system is mute to the person)

  ;; PRINCIPLE: the client derives personal meaning from impersonal events.
  ;; No new server messages needed. No new endpoints. No new state.

  ;; A reactive store (packages/ui/src/lib/stores/personal.svelte.ts) that:
  ;;
  ;; on {kind: 'removed', entryId}:
  ;;   if entryId was mine → toast "Your song was removed"
  ;;
  ;; on {kind: 'state', state} where my entry disappeared:
  ;;   if I had an entry and now I don't, and no 'removed' preceded it
  ;;   → toast "Your song is no longer in the queue"
  ;;
  ;; on {kind: 'energySkip'}:
  ;;   if nowPlaying was mine → toast "The room energy was low — song skipped"
  ;;   (NOT "admin skipped your song")
  ;;
  ;; on {kind: 'state', state} where mode changed:
  ;;   compare state shape to cached roomConfig
  ;;   → toast "Room switched to {mode} mode" + update local config
  ;;
  ;; on WebSocket close/reconnect:
  ;;   → show connection indicator (currently absent)
  ;;   → on reconnect, diff previous state with new state, surface changes

  ;; ONE server change needed:
  ;;   broadcastToClientTypes(['player', 'user'], {kind: 'energySkip'})
  ;;   (currently player-only; widen the audience by one word)

  ;; This also gives room.svelte.ts a reason to exist —
  ;; personal.svelte.ts imports room state to know "which entries are mine."
  ;; GuestView imports personal.svelte.ts instead of handling all ws events inline.
  )

;; ============================================================================
;; MIGRATION ORDER
;; ============================================================================

;; Ordered by "what breaks silently in production right now":
;;
;; 1. serializeAttachment — identity dies on hibernation wake (silent breakage)
;; 2. alarms replacing setTimeout — rooms never hibernate (silent cost)
;; 3. tags for broadcast — role filtering breaks after wake (silent failure)
;; 4. articulation layer — human-facing change, needs stable server foundation
;; 5. transactionSync — correct but no visible corruption yet (single-threaded DO)
