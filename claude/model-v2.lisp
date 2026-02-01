;; model-v2.lisp — The True Model
;; Written 2026-02-01 after reading every source file.
;; One model. Each concept once. The human journey organizes everything.
;;
;; TWO FORMS RECUR:
;;   (edge ...) — where the scaffolding fails the person
;;   (gift ...) — where the design gives something no feature request asked for
;; Both are structural observations. Both are verified against code.
;; A model that only holds edges produces defensive code.
;; A model that holds both produces code that protects flow.

(room
  ;; A room where people gather and share time through music.
  ;; The room has a screen, a queue, and whoever walks in.
  ;; Everything else is scaffolding for permission to participate.

  (id (regex "[a-z0-9][a-z0-9-]{0,28}[a-z0-9]|[a-z0-9]{1,2}"))
  (reserved
    (routing (api player admin))               ;; index.ts: RESERVED_PATHS, blocks HTML serving
    (creation (api player admin shikashika))   ;; room.ts: handleCreateRoom, blocks room creation
    (client (api player admin shikashika landing))) ;; ui: also reserves 'landing'
  (created-with config + admin-pin)
  (mode (| jukebox karaoke)                    ;; jukebox default for new rooms
    ;; jukebox: strangers vote on vibes. session identity. one-in-queue, rest in personal stack.
    ;; karaoke: friends take turns. stage-name identity. unlimited queue entries per name. epoch fairness.
    ;; mode is switchable by admin at any time. queue re-sorts on switch.
    ;; mode affects: identity, ordering, add-song endpoint, stack visibility.
    (gift two-rooms-in-one                       ;; same code serves living room with friends AND bar with strangers
      "the admin reads the room and picks the mode. no reinstall, no config file, one toggle")
    )
  (because cloudflare-idFromName               ;; env.ROOM.idFromName(roomId) gives stable DO ID
    "one Durable Object per room. single-threaded. no races between handlers."))


;; ============================================================================
;; 0. WALKING IN — who am I here?
;; ============================================================================

(walking-in
  ;; Four doors. Each grants a different identity.
  ;; All four can coexist in the same room at the same time.

  ;; --- Door 1: Google OAuth ---
  (google-oauth
    ;; cross-device identity. same Google account = same person everywhere.
    (flow authorization-code
      (redirect /auth/google?room=X&return=/room)
      (→ google → /auth/callback?code=&state=)
      (exchange-code → access-token → /userinfo)
      (user-id (concat "google_" sub))
      (display-name (or name (email-prefix))))
    (handled-at edge                           ;; worker/src/index.ts, not in DO
      (because "OAuth is a redirect dance. Cookie Set-Cookie headers and redirect responses
                belong at the routing layer. DOs can fetch externally — this is separation
                of concerns, not capability limitation."))
    (jwt
      (fields sub sid rid dn prv iat exp)
      (signed HS256 with SESSION_SECRET)
      (cookie karaoke_session httponly samesite-lax 24h)))

  ;; --- Door 2: Anonymous Session ---
  (anonymous
    (user-id (concat "anon_" (random-hex 16)))
    (display-name (concat "Guest " (random 1000 9999)))
    (same-jwt-format-as google)
    (cookie same-as-google)
    (device-bound                              ;; cleared on browser data wipe
      "upgrade to Google later without losing current session"))

  ;; --- Door 3: Stage Name (karaoke mode) ---
  (stage-name
    (states
      (unnamed → named (on type-name. stored in localStorage karaoke_name))
      (named → join-attempt (on click-add))
      (join-attempt
        → in-queue (on server-joined)
        → pin-required (on server-requires-pin)
        → named (on server-error))
      (pin-required
        → verified (on correct-pin. stored in localStorage karaoke_verified)
        → named (on click-change-name)
        → pin-required (on wrong-pin. shows error))
      (verified → join-attempt (auto-retry)))
    (pin-protection
      (unclaimed names → anyone can use)
      (after first song → UI offers to claim with 6-digit PIN)
      (claimed names → require PIN verification to use)
      (storage "identity:{normalized-name}" → Identity{name pinHash salt createdAt})
      (hash SHA-256(salt + pin). salt = random 16-byte hex))
    (edge
      (name-persists-in-localStorage           ;; user returns days later, old name pre-filled
        "might be claimed by someone else now")
      (same-name-two-devices-unclaimed         ;; both can add songs, both see each other's entries
        "no conflict by design")
      (mode-switch-while-in-pin-modal          ;; admin switches to jukebox
        "modal stays open. PIN concept doesn't exist in jukebox. confusing")))

  ;; --- Door 4: Admin ---
  (admin
    (states
      (loading                                 ;; checking room admin status
        → authenticated (on saved-token-valid-in-sessionStorage)
        → authenticated (on no-admin-configured ;; legacy fallback
          "room/check returns notFound → auto-grant access. X-Admin:true accepted by server")
        → login-screen (on room-has-admin))
      (login-screen → authenticating (on submit-pin))
      (authenticating
        → authenticated (on pin-correct. token stored in sessionStorage per-room key)
        → login-screen (on pin-wrong)
        → login-screen (on rate-limited))      ;; 5 attempts/60s
      (authenticated
        → login-screen (on token-expires)      ;; 4h TTL
        → login-screen (on explicit-logout)
        → login-screen (on any-401-response))) ;; auto-logout on unauthorized
    (token random-64-hex in-memory-on-server 4h-ttl)
    (edge
      (legacy-rooms-wide-open                  ;; no admin PIN → anyone at /room/admin is admin
        "no UI to set admin PIN on existing room. no upgrade path")
      (token-in-sessionStorage                 ;; closes with browser
        "admin reopens → must re-enter PIN. expectation mismatch")
      (admin-sessions-in-JS-memory             ;; lost on DO hibernation
        (because DO-hibernation "websockets survive sleep, JS memory doesn't")
        "admin token valid client-side but server forgot it. first API call → 401 → re-login")))

  ;; --- What the system doesn't say ---
  ;; Session expires → stack silently clears, no explanation.
  ;; Legacy admin → anyone who finds the URL has control.
  ;; Google display name as karaoke name → irrelevant in karaoke mode, empty name field.
  )


;; ============================================================================
;; 1. CONNECTING — can the room hear me?
;; ============================================================================

(connecting
  (websocket
    (url "wss://host/?upgrade=websocket&room=X")
    (states
      (disconnected → connecting (on mount. no UI indicator on phones)
        "user sees empty page. doesn't know if loading or broken")
      (connecting → connected (on ws-open + subscribe-ack))
      (connecting → reconnecting (on ws-error))
      (connected → disconnected (on ws-close))
      (reconnecting → connecting (on timer-fires)
        (delay exponential 1s→30s + jitter)))
    (on-connect
      (send {kind: subscribe, clientType: user|player|admin|extension})
      (server responds with QueueState + extensionConnected. no playback in initial subscribe)
      (client must syncRequest or wait for broadcastState to get PlaybackState)
      (server stores socket→role in socketClients, socket→identity in socketIdentities))
    (heartbeat 30s
      (client sends {kind: ping, clientTime: Date.now()})
      (server responds {kind: pong, serverTime, clientTime})
      (client computes offset = serverTime - clientTime - roundTrip/2)
      (assumption "symmetric network latency" ;; false on mobile. offset error ≤ half RTT)))

  (http-fallback
    (admin 2s-polling-until-ws-connects        ;; then stops and NEVER resumes
      "if WS connects then drops, admin has no updates until page refresh")
    (guest no-polling
      "getState() exists in api.ts, never called by GuestView"
      "if WS fails, guest sees empty/stale queue forever")
    (player conditional-polling
      "if WS hasn't connected after 2000ms, starts 2s polling fallback"
      "stops when WS connects. same stop-never-resume pattern as admin"))

  (who-hears-what
    (state → all)                              ;; full QueueState on every mutation
    (reaction energy chatPinned chatUnpinned → player only)
    (chat → user + admin only)
    (extensionStatus → all)
    (stackUpdated promotedToQueue → all))

  (message-protocol
    (client→server
      subscribe join vote remove skip next reorder adminAdd
      ping ended error syncRequest
      addSong removeFromStack reorderStack
      reaction chat pinChat)
    (server→client
      state error joined removed voted skipped advanced
      extensionStatus pong sync stackUpdated promotedToQueue
      reaction chat chatPinned chatUnpinned energy energySkip))

  ;; THE FIRST SEAM: the system never tells the user whether it can hear them.
  ;; No offline indicator on phones. Chat messages sent during reconnect are silently dropped.
  ;; The user speaks into what they believe is a room. It might be a void.
  )


;; ============================================================================
;; 2. FINDING A SONG — the song I've been humming
;; ============================================================================

(finding-a-song

  (search
    (states
      (idle → searching (on submit-query. popular-songs visible))
      (searching → results (on results-found. spinner during wait))
      (searching → no-results (on empty-response))
      (searching → error (on network-fail))
      (results → searching (on new-query))
      (results → song-selected (on click-result)))
    (mechanics
      (youtube-innertube-scrape                ;; POST to youtube.com/youtubei/v1/search
        (client WEB version 2.20240101.00.00)
        (parsed by parseSearchResponse in domain))
      (cache in-memory 5min per-normalized-query max-100-entries
        (cleanup when cache.size > 100))
      (rate-limit 20/min per-client-IP))
    (edge
      (no-search-cancellation                  ;; new query doesn't cancel in-flight request
        "type 'beatles', results loading, type 'queen', beatles results arrive first"
        "UI briefly shows beatles results, then queen results replace them")))

  (validation
    (states
      (unchecked → checking (on song-selected. hidden YouTube iframe created 1x1px))
      (checking → valid (on duration-ok. ≤420s ie 7min))
      (checking → invalid (on duration-too-long | livestream duration=0 | video-not-found))
      (checking → invalid (on 10s-timeout)))
    (mechanics
      (ytPlayer created in hidden div. onReady checks getDuration. onError catches failures)
      (validation-functions from domain: validateName validateTitle validateVideoId)
      (sanitize: sanitizeName(30 chars) sanitizeTitle(100 chars)))
    (edge
      (validation-race                         ;; select song A, then song B while A validates
        "ytPlayer DOM element overwritten. song A's validation might complete for song B's context")
      (false-positive-needs-interaction         ;; 1s timeout checks UNSTARTED state
        "YouTube can return UNSTARTED during normal loading"
        "user sees 'click to start' when video would have auto-played")
      (no-yt-api-fallback                      ;; if window.YT fails to load
        "validation skipped entirely. trust the URL. could add livestream")))

  (adding
    ;; The moment of commitment. Two paths diverge here.
    (karaoke-path                              ;; POST /api/join
      (requires name videoId title)
      (checks canJoinQueue: no duplicate name in queue or nowPlaying)
      (checks identity: if name claimed and not verified → requiresPin)
      (creates entry with currentEpoch, sorts by epoch→votes→joinedAt))
    (jukebox-path                              ;; POST /api/stack/add or WS addSong
      (requires session cookie/token)
      (checks canAddToGeneralQueue: no entry with same userId in queue or nowPlaying)
      (if can-add → creates entry in queue, userId stamped)
      (if cannot → adds to personal stack (max 10 default)))
    (edge
      (mode-switch-during-join                 ;; admin switches mode between search and add
        "client sends to old-mode endpoint. server now in new mode"
        "server may accept or reject. confusing error message")
      (auto-anon-on-jukebox-add               ;; user clicks add without session
        "system creates anonymous session automatically"
        "if creation fails, user sees auth error instead of song error")))
  )


;; ============================================================================
;; 3. WAITING — not knowing when
;; ============================================================================

(waiting

  ;; --- Queue Ordering (epochs defined HERE, once, completely) ---
  (ordering
    (karaoke (sort epoch ASC → votes DESC → joinedAt ASC)
      ;; epoch = fairness tier. everyone who adds in the same epoch is equal.
      ;; epoch increments every time a song finishes (currentEpoch + 1 in advanceQueue).
      ;; someone who waited through 3 songs has epoch 3. new joiner has epoch 6.
      ;; epoch 3 plays first. within same epoch, more votes go first. tiebreak by arrival.
      ;; admin add-to-front: epoch = -1, always plays next.
      (gift patience-rewarded                    ;; the shy person who waited goes before the loud person who just arrived
        "no config needed. epochs encode waiting automatically. fairness without rules")
      )
    (jukebox (sort votes DESC → joinedAt ASC)
      ;; epoch present on entry but ignored. votes are the only priority.
      ;; the room decides what plays next by collective opinion.
      (gift collective-curation                  ;; strangers build a playlist nobody planned but everybody shaped
        "voting is lightweight (tap), visible (count on entry), and reversible (toggle off)")
      ))

  ;; --- Position Awareness ---
  (position-awareness
    (states
      (not-in-queue (ui-shows search-prompt))
      (in-queue (ui-shows position-number. position > 2))
      (on-deck (position = 2
        (notification "2 songs until you're up!")
        (ui-shows orange-banner)))
      (next-up (position = 1
        (notification "You're next! Get ready!")
        (ui-shows green-banner)))
      (now-playing
        (notification "You're up! Time to shine!" + haptic)))
    (gift anticipation-gradient                  ;; nervousness builds through three named stages
      "position number → orange banner → green banner → haptic buzz. the system paces the courage")
    (tracking
      (previousPosition compared to newPosition on every state update)
      (toast for movement: "You moved up! Now #X" or "Slipped to #X")
      (notifications fire on threshold crossings))
    (edge
      (on-deck-notification-requires-gap       ;; code checks previousPosition > 2 for position 2
        "the '2 songs until you're up!' notification only fires if previousPosition > 2"
        "so if you enter the queue at position 2 directly, you never get the warning"
        "the 'you're next' notification at position 1 checks previousPosition > 1, so #2→#1 works")
      (position-jump                           ;; admin reorders, many songs removed at once
        "jumps from #5 to #1 in one state update. intermediate notifications skipped"
        "only the final position notification fires")
      (removed-without-explanation             ;; admin removes entry
        "entry disappears from queue. no toast on guest's phone"
        "user checks phone: song is gone. no idea why")))

  ;; --- Voting ---
  (voting
    (states
      (unvoted → upvoted (on click-plus))
      (unvoted → downvoted (on click-minus))
      (upvoted → unvoted (on click-plus-again))  ;; toggle off
      (upvoted → downvoted (on click-minus))
      (downvoted → unvoted (on click-minus-again))
      (downvoted → upvoted (on click-plus)))
    (mechanics
      (optimistic-update                       ;; UI updates instantly, API call async
        "vote count changes before server confirms"
        "if API fails, reverts locally + shows error toast")
      (voter-id in-localStorage karaoke_voter_id ;; UUID, persistent across sessions
        "clearing localStorage = fresh votes on everything")
      (votes-record in-localStorage karaoke_votes ;; Record<entryId, direction>
        "client-side memory of what you voted on")
      (server-side VoteRecord per-entry per-voter ;; stored in DO storage key 'votes'
        "VoteRecord type is {entryId: {voterId: number}}. number, not 1|-1"
        "VoteRequest direction is 1|-1|0. applyVote: 0 deletes the voter key, not stores 0"))
    (edge
      (no-session-validation-karaoke           ;; voterId is self-assigned
        "multiple devices = multiple votes per human. no prevention, by design")
      (cant-vote-on-own-song                   ;; Entry.svelte: isMine check
        "enforced client-side only. server doesn't verify")))

  ;; --- My Stack (jukebox mode) ---
  (my-stack
    (constraint one-in-queue-per-user)
    (stacked-song (id videoId title source addedAt))
    (max-size (from config.maxStackSize default 10))
    (promotion                                 ;; when your song finishes, next song enters queue
      (pop first from stack → create entry with userId → add to queue → sort → broadcast))
    (drag-reorder → POST /api/stack/reorder with songIds array)
    (gift load-and-forget                        ;; add five songs, put phone in pocket, enjoy the party
      "auto-promotion means your songs keep entering the queue without you touching your phone")
    (edge
      (stack-loaded-once                       ;; loaded on mount, refreshed only after user actions
        "if another device modifies stack, this device shows stale data")
      (promotion-during-remove                 ;; user removes song while server auto-promotes
        "network race: remove call for song X, but X already promoted to queue")))

  ;; THE SECOND SEAM: admin removes your song. No notification. You check your phone.
  ;; It's gone. Did you imagine adding it?
  )


;; ============================================================================
;; 4. ON STAGE — the moment
;; ============================================================================

(on-stage

  ;; --- The Screen State Machine ---
  (screen
    (states
      (idle_screen                             ;; empty room, no songs
        (ui-shows qr-code + "scan to add" + musical-notes)
        (gift low-barrier-entry                  ;; scan a QR code and you're in. no app, no account, no download)
        → playing_song (on queue-gets-first-song via advanceToNext))

      (needs_interaction                       ;; browser blocked autoplay
        (ui-shows big-play-button + song-title + singer-name)
        (detected after 1000ms timeout if player state is UNSTARTED(-1) or CUED(5))
        → playing_song (on human-clicks-play or onStateChange=PLAYING))

      (playing_song                            ;; video active in iframe
        (ui-shows youtube-iframe + now-playing-bar + up-next-list)
        (ui-shows energy-meter + floating-reactions + pinned-messages) ;; if social enabled
        → pause_screen (on video-ends via onStateChange=ENDED)
        → pause_screen (on video-errors via onError)
        → needs_interaction (on 1s-load-timeout ;; flaky detection))

      (pause_screen                            ;; intermission between songs
        (ui-shows up-next-singer + song-title + countdown + qr-code)
        (countdown 7s with-backup-timeout 7.5s)
        → playing_song (on countdown-zero + queue-has-songs → advanceToNext)
        → idle_screen (on countdown-zero + queue-empty)
        → idle_screen (on network-error-during-advance))
      (gift the-breath                           ;; the only moment the NEXT person is celebrated before they perform
        "their name on the big screen. seven seconds where the room's attention shifts to them")))

  ;; --- Playback Synchronization ---
  (playback-sync
    (clock-sync                                ;; from heartbeat pong
      (offset = serverTime - clientTime - roundTrip/2)
      "first sync arrives before first ping/pong. serverTimeOffset=0 uncalibrated"
      "first ~30s of first song may be slightly desynced across devices")
    (position-sync                             ;; every 10s (SYNC_CHECK_INTERVAL_MS)
      (expected = position + (adjustedNow - startedAt) / 1000)
      (drift-threshold 200ms SYNC_DRIFT_THRESHOLD_MS)
      (if drift > threshold → player.seekTo(targetPosition, true))
      (if player not PLAYING after seek → player.playVideo())))

  ;; --- The Performance Ending ---

  ;; For the singer (on their phone):
  (singer-experience
    (recap-overlay                             ;; 4s cinematic celebration z-index overlay
      (shows applause-emoji + vote-count)
      (not-dismissible for 4 seconds)
      (then
        (if name-not-verified → after 1.5s show pin-claim-modal)
        (else → toast "you got N votes! add another?")))
    (edge
      (recap-blocks-interaction                ;; 4s of frozen UI
        "if queue advances fast, user misses seeing next state changes"
        "can't add another song, can't vote, can't chat during recap")
      (claim-modal-after-mode-switch           ;; admin switched to jukebox during song
        "modal appears offering PIN claim. jukebox doesn't use PINs")))

  ;; For the room (server-side):
  (advance-queue-core                          ;; doAdvanceQueueCore in room.ts. THE central mutation.
    ;; called on: video end, skip, error, energy skip, /api/next
    (steps
      1. record-performance (entry + outcome → performances storage)
      2. (advanceQueue state) → pop queue[0] to nowPlaying, increment currentEpoch
      3. clean-votes (delete votes for completed entry)
      4. jukebox-only: promote-from-stack (pop first from finished user's stack → queue)
      5. save-queue-state
      6. update-playback (startPlayback or stopPlayback → broadcastSync)
      7. broadcast-advanced + broadcastState)
    (because full-state-broadcast              ;; no deltas, no patches
      "every mutation sends entire QueueState to every connected socket"
      "simple, correct, bandwidth-expensive. no missed updates."))

  (edge
    (pause-countdown-queue-empties             ;; admin removes all songs during 7s countdown
      "countdown continues visually. reaches zero. advance finds empty queue → idle"
      "user sees countdown to nothing. confusing but recovers")
    (double-end-detection                      ;; extension AND iframe both detect video end
      "both trigger advance. server checks videoId match (idempotent)"
      "second advance ignored. safe but extension sends stale report")
    (network-fail-during-advance               ;; pause countdown fires, /api/next fails
      "catch block sets playerMode=idle_screen. no retry, no error toast"
      "abrupt transition: countdown → blank idle screen")
    (sync-before-calibration                   ;; first sync before first ping/pong
      "serverTimeOffset = 0. position calculation off by network latency"))

  ;; THE THIRD SEAM: the 4s celebration overlay blocks all interaction.
  ;; Can't dismiss it. If the next song loads fast, you miss seeing who's next.
  ;; Celebration intended as reward becomes a wall.
  )


;; ============================================================================
;; 5. WHO DECIDES — the admin and the room's voice
;; ============================================================================

(who-decides

  ;; --- Queue Operations ---
  (queue-ops
    (skip                                      ;; immediate, no confirmation
      (who-can admin-always, singer-own-song via userName match)
      (records performance outcome: skipped by admin|singer)
      (→ doAdvanceQueueCore))
    (remove                                    ;; browser confirm() dialog on admin view
      (who-can admin-always, singer-own-song via userName match)
      (no notification to the song owner)
      (cleans votes for removed entry))
    (reorder
      (karaoke: sets entry.epoch directly → re-sort)
      (jukebox: reorderEntry by position → adjusts epoch/joinedAt to maintain position))
    (add-to-front                              ;; admin search + add
      (epoch = -1 → unshift to queue[0]. always plays next)))

  ;; --- Mode Switching ---
  (mode-switching
    (confirm-dialog-required                   ;; browser confirm() with contextual message)
    (server re-sorts queue on switch
      (karaoke→jukebox: sortByVotes. epochs preserved but ignored)
      (jukebox→karaoke: sortQueue. epochs reactivate))
    (edge
      (user-adds-during-switch                 ;; ~200ms window between server switch and client state
        "user sends to old-mode endpoint. server in new mode. confusing error")
      (mode-not-reactive-on-guest              ;; roomConfig fetched ONCE on mount via getRoomConfig()
        "admin switches mode. guest still shows old mode badge"
        "guest's add-song uses old mode logic. wrong endpoint called"
        "FIX: listen to mode changes via WS state updates")
      (stacks-orphaned-on-karaoke-switch       ;; personal stacks still in storage
        "UI hides MyStack component. data inaccessible until mode switches back")))

  ;; --- The Room Breathing: Social Features ---
  ;; All social state is ephemeral. All gated by admin config booleans.
  ;; The room speaks only as much as the admin allows.
  (breathing
    (config                                    ;; SocialConfig in RoomConfig.social
      (reactionsEnabled true by-default)
      (chatEnabled true by-default)
      (booEnabled false by-default)
      (energySkipEnabled false by-default)
      (energySkipThreshold 20 range 10-40)
      (energySkipDuration 15s range 5-30))
    (admin-update optimistic-with-rollback     ;; revert on unauthorized or error)

    (reactions
      (emoji (| fire heart clap laugh boo))
      (weight fire:1 heart:1 clap:1 laugh:0.5 boo:-2)
      (in-memory 30s-window. pruned on next calculation)
      (rate-limit 10/5s per-userId)
      (visible-on player-only)                 ;; floating emoji animations
      (requires-session                        ;; "Sign in to send reactions" if no identity
        ))

    (chat
      (message: id userId displayName text(max 200) timestamp)
      (in-memory last-100. oldest shifted on overflow)
      (rate-limit 5/10s per-userId)
      (visible-on user+admin only)             ;; phones see chat, screen doesn't
      (pin-to-screen
        (rate-limit 2/30s per-userId. admin exempt)
        (ttl 8s. one-at-a-time. new pin clears old)
        (pinned-message → player via chatPinned/chatUnpinned)
        (gift phone-to-big-screen                ;; anyone can put words on the big screen for 8 seconds
          "encourage the singer. dedicate a song. make the room laugh. phone → screen → everyone")))

    (energy
      (formula (clamp 0 100 (+ 50 (* weighted-sum 2))))
      (trend (| rising falling stable) ;; diff from last level. < 2 = stable)
      (visible-on player-only)                 ;; vertical bar, color-coded
      (no-periodic-decay                       ;; level only changes when new reactions arrive
        "silent room = frozen energy at 50 indefinitely"))

    (energy-skip-trigger
      (states
        (normal (energy >= threshold)
          → declining (on energy-drops-below-threshold. timer starts))
        (declining (energy < threshold, timer counting)
          → normal (on energy-rises-above-threshold. timer reset)
          → auto-skip (on timer-exceeds-duration*1000 ms))
        (auto-skip
          (records performance {kind: skipped, by: admin}) ;; blame misattributed
          (broadcasts energySkip to player)
          (→ doAdvanceQueueCore)
          → normal))
      (edge
        (energy-skip-labeled-as-admin          ;; { by: 'admin' } not { by: 'room' }
          "singer sees 'admin skipped your song'. the admin didn't touch anything"
          "the room went quiet. blame misattributed to the admin")
        (no-reactions-no-decay                 ;; room goes quiet
          "energy stays at whatever it was. could be 15 (below threshold)"
          "timer keeps counting. song gets auto-skipped because nobody reacted")
        (threshold-changed-mid-timer           ;; admin adjusts while declining
          "new threshold applies immediately. timer keeps its start time"
          "if new threshold is higher, energy has been below it 'longer' than intended"))))

  ;; --- Race Conditions ---
  (races
    (concurrent-skip                           ;; singer + admin skip simultaneously
      "single-threaded DO prevents true concurrency"
      "but sequential processing: first skip advances. second skip's videoId check prevents double-skip"
      "safe because doAdvanceQueueCore checks videoId match (for extension-triggered) or just advances")
    (remove-while-voting                       ;; admin removes entry while user votes
      "optimistic UI shows +1 on ghost entry. API returns error. reverts")
    (admin-add-during-reorder
      "add-to-front inserts at [0] with epoch=-1. reorder calculates based on pre-add state"))

  ;; THE STRUCTURAL OBSERVATION:
  ;; The admin is the only entity that can change how much the room speaks.
  ;; Reactions, chat, energy, boo — all gated by config booleans.
  ;; The room breathes only as much as the admin allows.
  ;; But the room IS the people. The admin controls the room's voice through configuration.
  )


;; ============================================================================
;; 6. MEMORY — what the room remembers
;; ============================================================================

(memory

  ;; --- Durable (SQLite-backed DO storage) ---
  ;; wrangler.toml: new_sqlite_classes = ["RoomDO"]
  ;; API: state.storage.get/put/delete — KV-style, SQLite underneath
  ;; Format: JSON-serialized values
  ;; Lazy-loading: first access triggers storage.get, then cached in-memory
  ;; Migration: runs transparently on first read (legacy Entry format, legacy Performance format)
  ;; No transactions: sequential puts, not atomic. advance-queue does 3+ puts in sequence.
  (durable-keys
    ("state"          → QueueState)            ;; queue, nowPlaying, currentEpoch
    ("votes"          → VoteRecord)            ;; {entryId: {voterId: number}}
    ("performances"   → Performance[])         ;; who sang what when, outcome, votes
    ("config"         → RoomConfig)            ;; merges DEFAULT_SOCIAL_CONFIG on every read
    ("admin"          → RoomAdmin)             ;; pinHash, salt
    ("user_stacks"    → Record<userId, StackedSong[]>)
    ("identity:{name}" → Identity))            ;; per claimed name

  ;; --- Ephemeral (JS memory, lost on DO hibernation) ---
  ;; PROBLEM: the system uses setTimeout (pinned message TTL, energy skip timer)
  ;; which PREVENTS hibernation. The DO stays in memory paying for idle time.
  ;; And when hibernation does occur (no timers running), all Maps/Sets are lost
  ;; with no recovery path — socketClients, socketIdentities, extensionSockets
  ;; are rebuilt empty, breaking targeted sends and identity tracking.
  (ephemeral
    (survives-nothing
      adminSessions                            ;; Map<token, AdminSession>
      rateLimits                               ;; Map<"type:clientId", {attempts, windowStart}>
      searchCache                              ;; Map<query, {results, expiresAt}> max-100
      socketClients                            ;; Map<WebSocket, ClientType>
      socketIdentities                         ;; Map<WebSocket, {userId, displayName}>
      extensionSockets                         ;; Set<WebSocket>
      playbackState                            ;; {videoId, startedAt, position, playing}
      recentReactions                          ;; Reaction[] last 30s
      chatMessages                             ;; ChatMessage[] last 100
      pinnedMessage + pinnedMessageAt + pinnedMessageTimeout
      energyBelowThresholdSince
      lastEnergyLevel)
    )
    ;; See claude/plan-awakening.lisp for which ephemeral state could survive hibernation and how.

  ;; --- Edge (KV namespace, not in DO) ---
  (edge-kv
    (KARAOKE_KV binding)
    (active_rooms → Record<roomId, {lastActivity, queueSize, nowPlaying}>)
    (pattern best-effort. silent fail. non-blocking. 24h TTL)
    (tracked on /api/state requests at the worker edge, not by DO))

  ;; --- Performance History ---
  (performance
    (record id name videoId title performedAt votes outcome)
    (outcome (| completed (skipped by singer|admin) (errored reason)))
    (queries
      (popular-songs: group by videoId → play count)
      (singer-history: filter by name)
      (singer-stats: total songs, total votes, completed songs))
    (legacy migration: {completed: bool} → {outcome: {kind: ...}}))

  ;; The room remembers outcomes but not feelings.
  ;; Every mutation broadcasts. Every advance records. The machine knows everything.
  )


;; ============================================================================
;; 7. SURFACES — the windows into the room
;; ============================================================================

(surfaces
  (landing                                     ;; / (root path)
    (enter-room-code → navigate to /{roomId}))

  (phone                                       ;; /{roomId} → GuestView.svelte (1135 lines)
    ;; The monolith. All state managed internally via $state runes.
    ;; identity + search + validation + queue + voting + my-stack + chat + reactions + recap
    ;; Does NOT import room.svelte.ts store (latent: exported, never imported by GuestView))

  (screen                                      ;; /{roomId}/player → PlayerView.svelte
    ;; YouTube iframe + pause screen + QR code + energy meter + floating reactions + pinned messages
    ;; State machine: idle_screen | needs_interaction | playing_song | pause_screen
    ;; QR code: external service api.qrserver.com, 200x200 white on dark)

  (remote                                      ;; /{roomId}/admin → AdminView.svelte
    ;; PIN auth + mode toggle + social config + queue control + search + add
    ;; 2s polling fallback, stops on first WS message, never resumes)

  (extension                                   ;; Chrome extension, Manifest V3
    ;; background.ts: service worker, WebSocket, message routing
    ;; content.ts: YouTube.com, video end detection
    ;; popup.ts: status display
    ;; connects as clientType=extension. navigates YouTube tab on nowPlaying change
    ;; reports video end/error back to server. server advances queue)

  (build-pipeline
    (SvelteKit + static-adapter → vite → dist/)
    (inline.js → esbuild → single-HTML-string-constants per view)
    (output → worker/src/views/generated/{landing,guest,player,admin}.ts)
    (worker imports HTML constants, serves as Response bodies)
    (no CDN, no static files, just string responses))

  (svelte-5-runes
    ($state for reactive state)
    ($derived for computed values)
    ($effect for side effects))
  )


;; ============================================================================
;; 8. LATENT — potential energy
;; ============================================================================

(latent
  ;; These are not dead code. They are intentions that never became necessary.

  (branded-types                               ;; 9 constructors, none called at runtime
    EntryId VoterId VideoId RoomId AdminToken
    Timestamp Epoch UserId SessionId
    "defined in types/src/index.ts. cast functions exist. no call site uses them")

  (entry.sessionId                             ;; on the Entry interface, never assigned
    "userId gets assigned in jukebox mode. sessionId never does")

  (ExtensionMessage                            ;; type exists in types/
    "extension defines its own protocol but uses ClientMessage on the wire")

  (UserStack                                   ;; interface with userId + songs[]
    "room.ts uses plain Record<string, StackedSong[]> instead")

  (PlaybackState.position                      ;; set to 0, clients derive from startedAt + elapsed
    "the field is written but never read meaningfully")

  (source spotify                              ;; in the union 'youtube' | 'spotify'
    "every createEntry and createStackedSong hardcodes 'youtube'")

  (room.svelte.ts                              ;; exported runes store
    "defined in packages/ui/src/lib/stores/room.svelte.ts"
    "never imported by GuestView. GuestView manages its own state internally"))


;; ============================================================================
;; 9. THE PLATFORM TRUTH — what Cloudflare gives and what the system ignores
;; ============================================================================

(platform-truth

  ;; The system is half-hibernation-aware and half-not.
  ;; It uses acceptWebSocket (correct) but not serializeAttachment (broken).
  ;; It uses setTimeout (blocks hibernation) instead of Alarms (survives it).
  ;; It tracks per-socket state in Maps (die on wake) instead of attachments (survive).

  (websocket-attachments                       ;; ws.serializeAttachment(value) / ws.deserializeAttachment()
    ;; Arbitrary serializable data stored WITH the WebSocket connection.
    ;; Survives hibernation. Mutable (can re-serialize at any time).
    ;; The system stores per-connection identity in Maps (socketClients, socketIdentities,
    ;; extensionSockets). These Maps die on hibernation wake. After wake:
    ;;   - social features silently break (no identity in Map)
    ;;   - extension tracking lost (hasExtensionConnected returns false)
    ;;   - targeted broadcasts fail (Map empty, no recipients)
    ;;   - users see "Sign in to send reactions" despite being signed in
    ;; serializeAttachment exists, survives hibernation, and is unused.)

  (websocket-tags                              ;; up to 10 tags per socket, 256 chars each
    ;; Immutable after acceptWebSocket(). Survive hibernation.
    ;; getWebSockets(tag) returns filtered set — no need to iterate all and check Map.
    ;; The system already sets ['type:user'] in acceptWebSocket but then ignores it:
    ;;   broadcastToClientTypes iterates ALL sockets and checks the socketClients Map.
    ;;   After hibernation wake, the Map is empty, so role-filtered broadcasts reach nobody.
    ;; Tags survive and filter natively. The system sets them and doesn't use them.)

  (alarms                                      ;; ctx.storage.setAlarm(timestampMs)
    ;; One alarm per DO. Survives hibernation. At-least-once. 6 retries.
    ;; Does NOT prevent hibernation (unlike setTimeout which pins DO in memory).
    ;; The system uses setTimeout for:
    ;;   - pinned message expiry (8000ms)
    ;;   - energy skip timer (song duration * 1000ms)
    ;; These setTimeouts prevent the DO from ever hibernating.
    ;; Rooms with social features enabled stay in memory indefinitely.)

  (transactional-storage                       ;; state.storage.transactionSync(() => { ... })
    ;; SQLite-backed. Synchronous callback. Real transaction with rollback.
    ;; doAdvanceQueueCore does 3+ sequential puts (state, votes, user_stacks).
    ;; If any put fails, state is partially written. No rollback exists.
    ;; The DO is single-threaded, so this hasn't caused visible corruption —
    ;; but partial writes are possible on I/O errors.)

  )


;; ============================================================================
;; 10. THE SHAPE — what the model reveals
;; ============================================================================

(the-shape
  ;; Not a re-listing of seams. The pattern they share.

  ;; Three timescales:
  ;;   1. Mechanical time — WebSocket messages, state broadcasts, API calls (milliseconds)
  ;;   2. Queue time — songs playing, countdowns, epoch increments (minutes)
  ;;   3. Human time — building courage, feeling nervous, celebrating (unbounded)
  ;;
  ;; Most edge cases live at the boundary between timescales.
  ;; The pause countdown (mechanical) vs the singer's nerves (human).
  ;; The mode switch (instant) vs the guest's stale UI (until refresh).
  ;; The chat message (mechanical) vs the encouragement intended (human).

  ;; The system is articulate to the server.
  ;; Every mutation broadcasts full state. Every advance records a performance.
  ;; Every vote is tracked. The machine knows everything.

  ;; The system is mute to the person.
  ;; No offline indicator. No removal notification. No mode-change propagation.
  ;; No honest attribution of energy skips. The recap overlay that blocks instead of celebrates.
  ;;
  ;; WHY it's mute — not missing data, but missing connection:
  ;; The server already sends event messages (removed, skipped, advanced, energySkip).
  ;; The client already knows who "I" am (myName, session, voterId).
  ;; The gap: the client receives impersonal events but doesn't connect them to "me."
  ;; energySkip reaches the player only. The singer never hears about it.
  ;; removed reaches all clients, but GuestView doesn't check if the removed entry was mine.
  ;; The information already flows. It just doesn't land.

  ;; Seven structural seams where the system knows something the person doesn't:
  ;; - (connecting) "the room never tells the user whether it can hear them"
  ;; - (waiting) "on-deck warning requires gap: entering at #2 directly skips the warning"
  ;; - (waiting) "admin removes song. no notification. song just vanishes"
  ;; - (on-stage) "4s recap overlay blocks all interaction"
  ;; - (who-decides) "energy skip records {by: admin}. blame misattributed"
  ;; - (who-decides) "mode switch not reactive on guest. UI lies about current mode"
  ;; - (walking-in) "legacy rooms: anyone at /room/admin has full control"

  ;; Not dead code, but dead communication.
  ;; The code is scaffolding for permission to participate. It already knew (line 8 of this model).

  ;; Seven structural gifts where the design gives something no feature request asked for:
  ;; - (room) two-rooms-in-one: one toggle adapts friends-night to bar-night
  ;; - (waiting) patience-rewarded: epochs encode fairness without rules
  ;; - (waiting) collective-curation: strangers build a playlist nobody planned
  ;; - (waiting) anticipation-gradient: nervousness paced through three stages
  ;; - (waiting) load-and-forget: stack auto-promotes, phone goes in pocket
  ;; - (on-stage) the-breath: seven seconds where the room sees the next person's name
  ;; - (who-decides) phone-to-big-screen: anyone can put words in front of everyone for 8 seconds

  ;; The seams interrupt the gifts.
  ;; Every seam is a place where the scaffolding blocks what it was built to carry.
  ;; Fixing them isn't adding features. It's removing obstacles.
  )
