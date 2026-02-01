;; ============================================================================
;; PART I: THE PLATONIC MODEL — what exists
;; ============================================================================

(room
  ;; A room where people gather and share time through music.
  ;; The room has a screen, a queue, and whoever walks in.
  ;; Everything else is scaffolding for permission to participate.

  ;; === THE GATHERING ===
  (gathering
    (default-mode jukebox)                ;; new rooms default to jukebox

    (mode karaoke                         ;; "we know each other, we take turns"
      (identity
        (name string)                     ;; the face you show the room
        (pin? (hash salt))                ;; "this name is mine"
        (epoch number))                   ;; those who waited go first
      (participation
        (add-song → queue)
        (fairness epoch-based)))          ;; epoch increments after each performance

    (mode jukebox                         ;; "we're strangers, we vote on vibes"
      (identity
        (session
          (provider (| google anonymous))
          (user-id string)
          (display-name string)
          (expires-at timestamp)))
      (participation
        (add-song → queue-or-stack)       ;; one in queue, rest wait in your stack
        (fairness vote-based)))           ;; the room decides what plays next

    ;; Entry carries both: name (always) + userId? (jukebox)
    ;; sessionId? on Entry: defined, never assigned
    )

  ;; === THE QUEUE: who wants to participate ===
  (queue
    (entry
      (id string)
      (name string)                       ;; who
      (video-id string)                   ;; what
      (title string)
      (source (| youtube spotify))        ;; spotify: defined, only youtube flows
      (votes number)                      ;; the room's opinion (can go negative)
      (epoch number)                      ;; karaoke: fairness tier. jukebox: present, ignored
      (joined-at number)                  ;; when you raised your hand
      (user-id? string)                   ;; jukebox: who added it. karaoke: absent
      (session-id? string))               ;; ghost field: defined, never set

    (ordering
      (karaoke (by epoch :asc votes :desc joined-at :asc))
      (jukebox (by votes :desc joined-at :asc)))

    (state
      (entries (list entry))              ;; the line
      (now-playing (| entry nil))         ;; who's on stage
      (current-epoch number)              ;; how many songs deep we are
      (user-stacks? (map user-id (list stacked-song)))))
      ;; stacks: broadcast copy, source of truth lives in DO storage separately

  ;; === THE STACK: songs waiting their turn (jukebox) ===
  (stack
    (constraint one-in-queue-per-user)
    (stacked-song
      (id string) (video-id string) (title string)
      (source (| youtube spotify)) (added-at number))
    (max-size (from config default 10))
    (promotion                            ;; when your song finishes, next one enters queue
      (pop-first → create-entry → add-to-queue → broadcast))
    ;; server sends stack-updated over WebSocket
    ;; client component polls HTTP instead of listening
    )

  ;; === THE SCREEN: where the room's attention gathers ===
  (screen
    (player
      (youtube-iframe)
      (states (| idle needs-interaction playing pause-screen))
      (pause-screen
        (countdown 7s)
        (up-next display))
      (playback-sync
        (video-id (| string nil))
        (started-at timestamp)            ;; server clock
        (position seconds)                ;; set but clients compute from startedAt + elapsed
        (playing bool)))
    (qr-code (join-url for-this-room))
    (advance
      (on-video-end → /api/next)
      (on-extension-report → advance-queue)))

  ;; === THE ROOM BREATHING: social features ===
  (breathing
    (config
      (reactions-enabled bool)
      (chat-enabled bool)
      (boo-enabled bool)
      (energy-skip-enabled bool)
      (energy-skip-threshold (range 10 40))
      (energy-skip-duration (range 5 30)))

    (reactions                            ;; the crowd's pulse
      (emoji (| fire heart clap laugh boo))
      (weight (fire 1) (heart 1) (clap 1) (laugh 0.5) (boo -2))
      (in-memory 30s-window)
      (rate-limit 10/5s per-user)
      (visible-on screen-only))           ;; floating emoji animations

    (chat                                 ;; the room talking to itself
      (message (text max-200) (who) (when))
      (in-memory last-100)
      (rate-limit 5/10s per-user)
      (visible-on phones-only)            ;; guests and admin see chat, screen doesn't
      (pin → screen                       ;; promote a message to the big screen
        (ttl 8s)
        (one-at-a-time)))

    (energy                               ;; aggregate mood
      (level (clamp 0 100 (+ 50 (* reaction-weights 2))))
      (trend (| rising falling stable))
      (visible-on screen-only)            ;; vertical bar, color-coded
      (skip-trigger                       ;; if energy stays low, room vetoes the song
        (when (< level threshold) (for duration) → auto-advance)))

    ;; all breathing state is ephemeral
    ;; lost on restart, rebuilds from new activity
    ;; no tests cover this subsystem
    )

  ;; === HISTORY: what the room remembers ===
  (history
    (performance
      (outcome (| (completed) (skipped (by (| singer admin))) (errored (reason string))))
      (record (who what when outcome votes)))
    (queries
      (popular-songs (group-by video-id → play-count))
      (singer-history (filter-by name))
      (singer-stats (total-songs total-votes completed-songs)))
    (legacy (completed bool) → (outcome kind)))

  ;; === DOORS: how you get in ===
  (doors
    (google-oauth                         ;; cross-device identity
      (flow authorization-code)
      (handled-at edge not-in-room)
      (jwt (sub user-id) (sid session-id) (rid room-id) (dn display-name) (prv provider))
      (cookie karaoke_session httponly samesite-lax 24h))
    (anonymous                            ;; device-bound, walk-in
      (id (concat "anon_" (random-hex 16)))
      (display-name (concat "Guest " (random 1000 10000)))
      (same-jwt-format))
    (admin                                ;; room owner
      (pin 6-digit hashed-with-salt)
      (token random-64-hex in-memory 4h-ttl)
      (legacy-fallback X-Admin-true when-no-admin-configured))
    ;; WebSocket: identity from cookie at connect → stored in socketIdentities
    ;;   stack ops also verify JWT from message body (redundant path)
    ;; HTTP: identity from cookie per-request
    )

  ;; === WIRING: how the parts talk ===
  (wiring
    (websocket
      (connect wss://host/?upgrade=websocket&room=X)
      (roles (| user player admin extension))
      (heartbeat 30s with-clock-sync)
      (reconnect exponential-backoff 1s→30s jitter)

      (phone→room                         ;; what people can say
        subscribe join vote remove skip next reorder
        admin-add ping ended error sync-request
        add-song remove-from-stack reorder-stack
        reaction chat pin-chat)

      (room→everyone                      ;; what the room says back
        state error joined removed voted skipped advanced
        extension-status pong sync stack-updated promoted-to-queue
        reaction chat chat-pinned chat-unpinned energy energy-skip)

      (who-hears-what
        (state → all)                     ;; full state, every queue mutation
        (reactions energy pinned → screen)
        (chat → phones)
        (extension-status → all)))

    (http                                 ;; fallback, same operations
      (cors allow-all)
      (rate-limited per-client-id)
      (routes
        (queue  join vote remove skip next reorder add)
        (search (youtube-scrape cached-5min max-100))
        (identity claim verify check)
        (room check create config admin-verify)
        (stack get add remove reorder)
        (history singer popular-songs)
        (auth google callback session anonymous logout)
        (feedback → github-issue)
        (admin migrate rooms-active)))

    ;; two add-song paths:
    ;;   join (karaoke, by name, no auth) / addSong+stack (jukebox, by session, auth required)
    )

  ;; === SURFACES: what each person sees ===
  (surfaces
    (landing  (enter-room-code → navigate))
    (phone    (identity + search + queue + my-stack + chat + reactions))
    (screen   (video + pause + qr + energy-meter + floating-reactions + pinned-messages))
    (remote   (pin-auth + mode-toggle + social-config + queue-control + search))
    (extension (auto-play + video-end-detection → room)))

  ;; === MEMORY: what persists ===
  (memory
    (durable per-room
      (queue-state)                       ;; migrates from legacy format on read
      (votes)                             ;; type says 1|-1, actual type is number, 0 = unvote
      (performances)                      ;; migrates legacy format on read
      (config)                            ;; merges defaults on every read, saves if changed
      (admin-pin)
      (stacks)                            ;; per-user song stacks
      (claimed-names))                    ;; PIN-protected identities
    (ephemeral per-room
      (admin-sessions)                    ;; in-memory, lost on restart
      (rate-limits)
      (search-cache max-100)
      (connections)                       ;; socket→role, socket→identity
      (playback-sync)
      (reactions last-30s)
      (chat last-100)
      (pinned-message + timeout))
    (edge
      (room-activity best-effort)))       ;; KV tracking, not in room

  ;; === THE MACHINE: implementation reality ===
  (machine
    (cloudflare-worker                    ;; the edge: stateless, globally distributed
      (role gateway)                      ;; routes requests, serves HTML, handles OAuth
      (why-auth-here                      ;; not capability — DOs can fetch externally
        "OAuth is a redirect dance: user → Google → callback → cookie → redirect"
        "Cookie Set-Cookie headers and redirect responses belong at the routing layer"
        "Separation of concerns: stateless auth flow at edge, stateful rooms in DO")
      (html-serving                       ;; Svelte → esbuild → HTML string constants
        (build-pipeline
          (svelte-kit → vite → dist/)
          (inline.js → esbuild → single-html-strings)
          (output → worker/src/views/generated/{guest,player,admin,landing}.ts))
        (served-as constant-strings))     ;; no CDN, no static files, just string responses
      (room-routing
        (id-from-name → one-DO-per-room)  ;; Cloudflare idFromName gives stable DO ID
        (validation "[a-z0-9][a-z0-9-]{0,28}[a-z0-9]|[a-z0-9]{1,2}")
        (reserved (api player admin shikashika))))

    (durable-object RoomDO               ;; the room: stateful, single-threaded, per-room
      (runtime single-threaded)           ;; all handlers run sequentially, no races
      (hibernation                        ;; Cloudflare evicts idle DOs
        (websocket-hibernation-api         ;; sockets survive DO sleep
          (state.acceptWebSocket tag)
          (state.getWebSockets)
          (webSocketMessage callback)
          (webSocketClose callback))
        (what-survives                    ;; persistent storage + websocket connections
          storage websockets)
        (what-dies                        ;; everything in JS memory
          admin-sessions rate-limits search-cache
          socket-clients socket-identities
          playback-state reactions chat pinned-message
          "this is why social state is ephemeral — not a choice, a constraint"))
      (storage                            ;; SQLite-backed, accessed via KV-style API
        (backend sqlite)                  ;; wrangler.toml: new_sqlite_classes = ["RoomDO"]
        (api state.storage.get/put/delete) ;; same API as KV, SQLite underneath
        (format json-serialized)
        (keys
          (state → QueueState)
          (votes → VoteRecord)
          (performances → Performance[])
          (config → RoomConfig)
          (admin → RoomAdmin)
          (user_stacks → Record<userId, StackedSong[]>)
          ("identity:{name}" → Identity)))
        (lazy-loading                     ;; not loaded in constructor
          "first access triggers storage.get, then cached in-memory"
          "migration runs transparently on first read")
        (no-transactions                  ;; sequential puts, not atomic
          "advance-queue does 3+ puts in sequence"
          "if one fails, state is partially written"))
      (broadcast
        (state.getWebSockets → iterate all)
        (full-state-on-every-mutation)    ;; no deltas, no patches
        (filtered-by socket-tag)))        ;; tags set on acceptWebSocket

    (kv-namespace                         ;; edge-level key-value
      (purpose room-activity-tracking)
      (pattern best-effort)               ;; silent fail, non-blocking
      (not-accessed-by DO))               ;; only worker reads/writes

    (build-system
      (monorepo pnpm-workspaces)
      (packages
        (types → domain → ui → worker)    ;; dependency order
        (extension separate))             ;; chrome extension, own build
      (deploy "cd worker && npx wrangler deploy")))

  ;; === DEFINED BUT NOT FLOWING ===
  (latent
    (branded-types                        ;; 9 constructors, none called
      EntryId VoterId VideoId RoomId AdminToken
      Timestamp Epoch UserId SessionId)
    (entry.session-id)                    ;; on the type, never assigned
    (ExtensionMessage)                    ;; type exists, extension defines own types but uses ClientMessage on wire
    (UserStack)                           ;; interface exists, room uses plain Record
    (PlaybackState.position)              ;; set, but clients derive from startedAt
    (source spotify)))                    ;; in the union, waiting


;; ============================================================================
;; PART II: THE LIVING SYSTEM — what happens
;; ============================================================================
;; State machines, transitions, edge cases.
;; Organized by the human journey, not the component hierarchy.
;; The system exists to serve moments. The moments are what matter.

(journeys

  ;; === WALKING IN: how someone becomes a participant ===
  (walking-in

    ;; --- The Connection (shared by all surfaces) ---
    (connection
      (states
        (disconnected                     ;; no socket, no data
          (ui-shows nothing)              ;; no offline indicator exists
          (user-knows-nothing)            ;; this is the first problem
          (→ connecting (on mount)))
        (connecting                       ;; handshake in progress
          (ui-shows nothing)              ;; no loading state
          (→ connected (on ws-open + subscribe-ack))
          (→ reconnecting (on ws-error)))
        (connected                        ;; receiving state
          (ui-shows live-badge)           ;; player only; phones show nothing
          (→ disconnected (on ws-close)))
        (reconnecting                     ;; backoff loop
          (delay exponential 1s→30s +jitter)
          (ui-shows nothing)              ;; silent. user sees stale data
          (→ connected (on ws-open))
          (→ reconnecting (on ws-error))))

      (edge-cases
        (no-offline-indicator             ;; guest and admin have no connection badge
          "user types message, sends to void, no feedback")
        (stale-data-invisible             ;; after 30s disconnect, queue could be completely different
          "user votes on entry that was removed. user thinks they're #2, they're #5")
        (no-http-fallback-in-guest        ;; getState() exists in api.ts, never called by GuestView
          "if WS fails for 60s, guest UI is frozen")
        (admin-polls-but-stops            ;; admin has 2s polling, stops when WS connects
          "if WS connects then drops, polling doesn't resume")))

    ;; --- Becoming Someone (karaoke mode) ---
    (identity-karaoke
      (states
        (unnamed                          ;; just arrived, empty name field
          (→ named (on type-name)))
        (named                            ;; name entered, stored in localStorage
          (→ unnamed (on clear-name))
          (→ join-attempt (on click-add)))
        (join-attempt                     ;; trying to add song with this name
          (→ in-queue (on server-joined))
          (→ pin-required (on server-requires-pin))
          (→ named (on server-error)))
        (pin-required                     ;; someone claimed this name
          (→ verified (on correct-pin))
          (→ named (on click-change-name))
          (→ pin-required (on wrong-pin))) ;; stays, shows error
        (verified                         ;; PIN confirmed, localStorage remembers
          (→ join-attempt (auto-retry))))  ;; retries the pending join

      (edge-cases
        (name-in-localstorage             ;; persists across sessions
          "user returns days later, old name pre-filled, might be claimed now")
        (mode-switch-while-in-pin-modal   ;; admin switches to jukebox
          "modal stays open. PIN concept doesn't exist in jukebox. submit succeeds but confusing")
        (same-name-two-devices            ;; two phones, same name, unclaimed
          "both can add songs. both see each other's entries. no conflict")
        (claimed-name-on-second-device    ;; phone A claimed, phone B tries same name
          "phone B gets pin-required. correct behavior, but no explanation of WHO claimed it")))

    ;; --- Becoming Someone (jukebox mode) ---
    (identity-jukebox
      (states
        (unauthenticated                  ;; no session cookie
          (ui-shows sign-in-button + name-input)
          (→ google-authed (on oauth-complete))
          (→ anonymous-session (on continue-as-guest))
          (→ auto-anon (on add-song-without-session)))
        (auto-anon                        ;; system creates anon session during add-song
          (→ anonymous-session (on session-created))
          (→ unauthenticated (on session-creation-fails)))
        (anonymous-session                ;; device-bound, "Guest 4827"
          (→ google-authed (on oauth-link))
          (→ unauthenticated (on logout)))
        (google-authed                    ;; cross-device, persistent
          (→ unauthenticated (on logout))))

      (edge-cases
        (auto-anon-fails-silently         ;; createAnonymousSession fails
          "user clicked 'add song', got error about auth instead of about the song")
        (google-display-name-as-karaoke-name ;; mode switches jukebox→karaoke
          "user is logged in as 'john@gmail.com', karaoke mode expects a stage name"
          "name field is empty, logged-in state is irrelevant, user confused")
        (session-expires-mid-interaction   ;; 24h cookie expires
          "stack operations return 'unauthenticated' silently"
          "stack clears, no explanation, user thinks songs were deleted")))

    ;; --- The Admin Walking In ---
    (identity-admin
      (states
        (loading                          ;; checking room admin status
          (→ login-screen (on room-has-admin))
          (→ authenticated (on saved-token-valid))
          (→ authenticated (on no-admin-configured))) ;; legacy fallback
        (login-screen                     ;; PIN entry
          (→ authenticating (on submit-pin)))
        (authenticating                   ;; server verifying
          (→ authenticated (on pin-correct))
          (→ login-screen (on pin-wrong))
          (→ login-screen (on rate-limited))) ;; 5 attempts/60s
        (authenticated                    ;; has valid token in sessionStorage
          (→ login-screen (on token-expires))  ;; 4h TTL
          (→ login-screen (on explicit-logout))
          (→ login-screen (on any-401-response)))) ;; auto-logout

      (edge-cases
        (legacy-rooms-wide-open           ;; no admin PIN → X-Admin:true fallback
          "anyone who navigates to /room/admin can skip, remove, reorder"
          "no upgrade path in UI to set admin PIN on existing room")
        (token-in-session-storage         ;; closes with browser
          "admin closes laptop, reopens → must re-enter PIN"
          "expectation mismatch: 'I was just logged in'")
        (concurrent-admin-tabs            ;; same room, two admin tabs
          "both share sessionStorage token. one logs out → both lose token"
          "but server doesn't know about second tab. no session count"))))

  ;; === FINDING A SONG: the search-validate-add pipeline ===
  (finding-a-song

    (search
      (states
        (idle                             ;; empty search box, popular songs visible
          (→ searching (on submit-query)))
        (searching                        ;; API call in flight
          (ui-shows spinner)
          (→ results (on results-found))
          (→ no-results (on empty-response))
          (→ error (on network-fail)))
        (results                          ;; thumbnail grid visible
          (→ searching (on new-query))
          (→ song-selected (on click-result)))
        (no-results                       ;; "try a different search"
          (→ searching (on new-query)))
        (error
          (→ searching (on retry))))

      (edge-cases
        (no-search-cancellation           ;; new query doesn't cancel in-flight request
          "type 'beatles', results loading, type 'queen', beatles results arrive first"
          "UI briefly shows beatles results, then queen results replace them")
        (popular-songs-during-search      ;; user clicks popular song while search results showing
          "popular song selected, search results still visible underneath"
          "which context is active? confusing")))

    (validation
      (states
        (unchecked                        ;; song selected, not yet validated
          (→ checking (on youtube-iframe-loads)))
        (checking                         ;; hidden iframe testing video
          (timeout 10s)
          (→ valid (on duration-ok))
          (→ invalid (on duration-too-long))   ;; >7min
          (→ invalid (on livestream))          ;; duration=0
          (→ invalid (on video-not-found))
          (→ invalid (on timeout)))
        (valid                            ;; ready to add
          (→ unchecked (on select-different-song)))
        (invalid                          ;; can't add, reason shown
          (→ unchecked (on select-different-song))))

      (edge-cases
        (validation-race                  ;; select song A, validation starts. select song B.
          "both validations run in parallel. ytPlayer DOM element overwritten"
          "song A's validation might complete and set state for song B's context")
        (false-positive-needs-interaction  ;; 1s timeout checks UNSTARTED state
          "YouTube can return UNSTARTED during normal loading"
          "user sees 'click to start' when video would have auto-played")
        (no-yt-api-fallback               ;; if window.YT fails to load
          "validation skipped entirely. trust the URL. could add livestream")))

    (adding                               ;; the moment of commitment
      (states
        (ready                            ;; validation passed, identity established
          (→ joining (on click-add)))
        (joining                          ;; API call in flight
          (→ success (on server-joined))
          (→ requires-pin (on server-requires-pin))
          (→ already-in-queue (on server-duplicate))
          (→ stack-full (on server-stack-full))
          (→ error (on server-error)))
        (success                          ;; toast + haptic + form reset
          (→ idle (auto)))
        (requires-pin                     ;; → PIN modal (karaoke only)
          (→ joining (on pin-verified)))   ;; retries with verified flag
        (already-in-queue
          (→ ready (user-changes-name)))
        (stack-full                        ;; jukebox: max songs in stack
          (→ ready (user-removes-from-stack)))
        (error
          (→ ready (user-retries))))

      (edge-cases
        (two-add-paths                    ;; karaoke: /api/join. jukebox: /api/stack/add
          "different endpoints, different auth, different error shapes"
          "mode determines which path at runtime")
        (mode-switch-during-join          ;; admin switches mode while user clicks add
          "client sends to old-mode endpoint. server now in new mode"
          "server might reject or handle differently. confusing error"))))

  ;; === WAITING: the queue experience ===
  (waiting

    (position-awareness
      (states
        (not-in-queue                     ;; no entry, or removed
          (ui-shows search-prompt))
        (in-queue                         ;; position > 2
          (ui-shows position-number)
          (→ on-deck (on position-becomes-2))
          (→ not-in-queue (on removed)))
        (on-deck                          ;; position = 2
          (ui-shows orange-banner "one song until your turn")
          (notification "2 songs until you're up!")
          (→ next-up (on position-becomes-1)))
        (next-up                          ;; position = 1
          (ui-shows green-banner "you're up next!")
          (notification "You're next! Get ready!")
          (→ now-playing (on song-starts)))
        (now-playing                      ;; on stage
          (notification "You're up! Time to shine!" + haptic)
          (→ song-finished (on song-ends))))

      (edge-cases
        (position-jump                    ;; moves from #5 → #1 in one state update
          "intermediate notifications skipped. user misses '2 songs' and 'you're next'"
          "only the final position notification fires")
        (position-2-to-1-bug              ;; code checks previousPosition > 2
          "moving from exactly #2 to #1 doesn't trigger 'you're next' notification")
        (removed-without-explanation      ;; admin removes entry
          "entry disappears from queue. no toast on guest's phone"
          "user refreshes, their song is gone, no idea why")))

    (voting
      (states
        (unvoted                          ;; no opinion
          (→ upvoted (on click-plus))
          (→ downvoted (on click-minus)))
        (upvoted                          ;; +1 cast
          (→ unvoted (on click-plus-again))  ;; toggle off
          (→ downvoted (on click-minus)))
        (downvoted                        ;; -1 cast
          (→ unvoted (on click-minus-again)) ;; toggle off
          (→ upvoted (on click-plus))))

      (mechanics
        (optimistic-update                ;; UI updates instantly, API call async
          "vote count changes before server confirms"
          "if API fails, reverts locally + shows error toast")
        (voter-id-in-localStorage         ;; persistent across sessions
          "clearing localStorage = fresh votes on everything")
        (no-session-validation-karaoke    ;; voterId is self-assigned
          "multiple devices = multiple votes per human"
          "no prevention, by design"))

      (edge-cases
        (vote-on-removed-entry            ;; admin removed song between render and click
          "optimistic update shows +1 on ghost entry. API returns error. reverts")
        (cant-vote-on-own-song            ;; Entry.svelte: isMine check
          "enforced client-side only. server doesn't verify")))

    (my-stack                             ;; jukebox mode personal queue
      (states
        (loading                          ;; fetching stack from server
          (→ empty (on loaded-empty))
          (→ has-songs (on loaded-with-songs))
          (→ error (on fetch-fails)))
        (empty                            ;; no songs waiting
          (→ has-songs (on add-song)))
        (has-songs                        ;; songs waiting for promotion
          (ui-shows drag-to-reorder + remove-buttons)
          (→ empty (on remove-last-song)))
        (error                            ;; fetch failed
          (→ loading (on retry))))

      (edge-cases
        (no-polling                       ;; stack loaded once, refreshed only after user actions
          "if another device modifies stack, this device shows stale data")
        (drag-race                        ;; rapid reorder operations
          "each drag sends reorderStack API call immediately"
          "multiple in-flight reorders. server processes in arrival order. last write wins")
        (promotion-during-remove          ;; user removes song while server auto-promotes
          "network race: remove call for song X, but X already promoted to queue"
          "server returns error or succeeds on wrong song"))))

  ;; === ON STAGE: the performance ===
  (on-stage

    ;; --- The Screen's Journey ---
    (screen-state-machine
      (states
        (idle                             ;; empty room, no songs
          (ui-shows qr-code + "scan to add" + musical-notes)
          (→ playing (on queue-gets-first-song via auto-advance))
          (→ needs-interaction (on autoplay-blocked)))

        (needs-interaction                ;; browser blocked autoplay
          (ui-shows big-play-button + song-title + singer-name)
          (→ playing (on human-clicks-play))
          (→ playing (on browser-unblocks-autoplay)))

        (playing                          ;; video active in iframe
          (ui-shows youtube-iframe + now-playing-bar + up-next-list)
          (ui-shows energy-meter + floating-reactions + pinned-messages) ;; if social enabled
          (→ pause-screen (on video-ends))
          (→ pause-screen (on video-errors))
          (→ needs-interaction (on load-timeout-1s)) ;; flaky detection
          (→ playing (on new-song-loaded)))  ;; skip or advance loads next

        (pause-screen                     ;; intermission between songs
          (ui-shows up-next-singer + song-title + countdown + qr-code)
          (countdown 7s with-backup-timeout 7.5s)
          (→ playing (on countdown-zero + queue-has-songs))
          (→ idle (on countdown-zero + queue-empty))
          (→ playing (on admin-skips-during-countdown)) ;; cancels timer, loads next
          (→ idle (on network-error-during-advance))))

      (edge-cases
        (pause-countdown-queue-empties    ;; admin removes all songs during 7s countdown
          "countdown continues visually. reaches zero. advance finds empty queue → idle"
          "user sees countdown to nothing. confusing but recovers")
        (double-end-detection             ;; extension AND iframe both detect video end
          "both trigger advance. server idempotent: checks videoId match"
          "second advance ignored. safe but extension sends stale report")
        (network-fail-during-advance      ;; pause countdown fires, /api/next fails
          "catch block jumps to idle. no retry, no error toast"
          "abrupt transition: countdown → blank idle screen"
          "FIX: should retry with backoff, stay in pause-screen")
        (sync-before-clock-calibration    ;; first sync arrives before first ping/pong
          "serverTimeOffset = 0 (uncalibrated). position calculation off by network latency"
          "first ~30s of first song may be slightly desynced across devices")))

    ;; --- Playback Synchronization ---
    (playback-sync
      (mechanics
        (clock-sync                       ;; ping/pong every 30s
          (offset (- server-time client-time (/ round-trip 2)))
          (assumption "symmetric network latency" ;; false on mobile networks
            "asymmetric latency → offset error ≤ half round-trip"))
        (position-sync                    ;; every 10s or on sync message
          (expected (+ position (/ (- adjusted-now started-at) 1000)))
          (drift-threshold 200ms)         ;; only seek if drift exceeds this
          (seek player.seekTo)))

      (edge-cases
        (reconnect-position-jump          ;; WS drops for 5s, reconnects
          "server sends state with startedAt from original start"
          "client calculates position as if playing continuously"
          "seeks forward, skipping the 5s that were missed"
          "corrects within 10s on next sync check")))

    ;; --- The Performance Ending ---
    (song-finished

      ;; For the singer (on their phone)
      (singer-experience
        (recap-overlay                    ;; 4s cinematic celebration, z-index:1000
          (shows applause-emoji + vote-count)
          (not-dismissible)               ;; blocks all interaction for 4s
          (then (if unverified-name
                  (after 1.5s → pin-claim-modal)
                  (toast "you got N votes! add another?"))))

        (edge-cases
          (recap-blocks-interaction       ;; 4s of frozen UI
            "if queue advances fast, user misses seeing next state changes"
            "can't add another song, can't vote, can't chat during recap")
          (claim-modal-after-mode-switch  ;; admin switched to jukebox during song
            "modal appears offering PIN claim. jukebox doesn't use PINs"
            "user claims successfully but claim is meaningless in current mode")))

      ;; For the room (on the screen)
      (room-transition
        (video-ends → pause-screen → countdown → advance → next-song)
        (or video-ends → extension-reports → server-advances → screen-receives-state))))

  ;; === THE ADMIN: who decides ===
  (the-admin

    (queue-operations
      (skip                               ;; immediate, no confirmation dialog
        (who-can admin-always singer-own-song)
        (server records-performance-outcome)
        (→ advance-queue))
      (remove                             ;; browser confirm() dialog
        (who-can admin-always singer-own-song)
        (no-success-toast)                ;; silent success. admin doesn't know if click registered
        (→ entry-removed + broadcast))
      (reorder                            ;; move up/down buttons
        (immediate no-confirmation)
        (karaoke sets-epoch-directly)
        (jukebox swaps-position))
      (add-to-front                       ;; search + add with epoch=-1
        (→ unshift-to-queue-position-0)))

    (mode-switching
      (confirm-dialog-required)
      (server-re-sorts-queue-on-switch)
      (karaoke→jukebox                    ;; queue re-sorted by votes only
        "epochs preserved but ignored. fairness mechanism suspended")
      (jukebox→karaoke                    ;; queue re-sorted by epoch → votes → joinedAt
        "epochs reactivate. users who waited longest play first again")

      (edge-cases
        (user-adds-during-switch          ;; 200ms window between server switch and client update
          "user sends join to old-mode endpoint. server already in new mode"
          "server may accept (forgiving) or reject (confusing error)")
        (mode-not-reactive-on-guest       ;; roomConfig fetched once on mount, never updated
          "admin switches mode. guest still shows old mode badge"
          "guest's add-song uses old mode logic. wrong endpoint called"
          "FIX: listen to mode changes via WS state updates")
        (stacks-after-switch-to-karaoke   ;; personal stacks still in storage
          "stacks preserved but UI hides MyStack component"
          "data orphaned. not lost, but inaccessible until mode switches back")))

    (social-config
      (toggles
        (reactions-enabled → shows/hides reaction-panel)
        (boo-enabled → shows/hides boo-button requires-reactions-enabled)
        (chat-enabled → shows/hides chat-panel)
        (energy-skip-enabled → enables energy-skip-trigger))
      (sliders
        (energy-skip-threshold 10-40)
        (energy-skip-duration 5-30s))
      (update-mechanic optimistic-with-rollback)

      (edge-cases
        (reaction-sent-during-disable     ;; user sends 🔥, admin disables reactions
          "server receives reaction, checks config, silently drops"
          "user sees their reaction disappear. no feedback")
        (threshold-change-triggers-skip   ;; admin raises threshold while energy is low
          "energy=15, old threshold=20, new threshold=30"
          "energy already below new threshold. duration timer already running"
          "could trigger skip immediately if duration already elapsed")
        (all-social-features-are-admin-gated
          "the room can only speak as much as the admin allows"
          "this is the fundamental power structure of the system")))

    (race-conditions
      (concurrent-skip                    ;; singer skips own song + admin skips simultaneously
        "first skip advances queue. second skip's videoId doesn't match → ignored"
        "BUT if both process before broadcast: both operate on same state"
        "second skip advances the NEXT song. Bob's song skipped without his consent"
        "single-threaded DO prevents true concurrency but sequential processing can still race")
      (remove-while-voting               ;; admin removes entry while user votes on it
        "vote finds entry by ID in queue. entry removed between find and apply"
        "vote on ghost entry. optimistic UI shows +1. API error. reverts")
      (admin-add-during-reorder          ;; admin adds to front while queue is being reordered
        "add-to-front inserts at [0] with epoch=-1"
        "reorder calculates newPosition based on pre-add state"
        "song ends up at wrong position")))

  ;; === THE CONNECTION LIFECYCLE: the transport layer ===
  (connection-lifecycle

    (websocket
      (states
        (closed → opening → authenticating → subscribed → active)
        (active → closed (on error | timeout | server-close))
        (closed → reconnecting → opening))  ;; exponential backoff

      (subscription
        (on-connect send-subscribe-with-clientType)
        (server-responds-with full-state)
        (server-stores socket→role socket→identity))

      (heartbeat
        (interval 30s)
        (client sends-ping-with-clientTime)
        (server responds-pong-with-serverTime)
        (client calculates-clock-offset))

      (what-happens-on-disconnect
        (messages-in-flight lost)         ;; no delivery guarantee
        (chat-sent-while-offline silently-dropped)
        (reactions-sent-while-offline silently-dropped)
        (votes-sent-via-http still-work)  ;; votes use fetch, not WS
        (state-becomes-stale)             ;; no indicator on guest/admin
        (reconnect-gets-full-state)))     ;; catches up, but with position notification burst

    (http-fallback
      (admin 2s-polling-until-ws-connects ;; then stops and never resumes
        "if WS connects then drops, admin has no updates until refresh")
      (guest no-polling                   ;; WS only
        "if WS never connects, guest sees empty queue forever")
      (player no-polling                  ;; WS only
        "player offline = frozen screen. venue problem")))

  ;; === ENERGY: the room's unconscious ===
  (energy-lifecycle

    (accumulation
      (every-reaction → prune-old → recalculate → broadcast → check-skip)
      (formula (clamp 0 100 (+ 50 (* weighted-sum 2))))
      (decay "reactions older than 30s pruned on next calculation"
        "no periodic decay. level only changes when new reactions arrive"
        "silent room = frozen energy at 50 indefinitely"))

    (skip-trigger
      (states
        (normal                           ;; energy ≥ threshold
          (timer nil)
          (→ declining (on energy-drops-below-threshold)))
        (declining                        ;; energy < threshold, timer started
          (timer started-at)
          (→ normal (on energy-rises-above-threshold))  ;; timer reset
          (→ auto-skip (on timer-exceeds-duration)))
        (auto-skip                        ;; room vetoed the song
          (records performance-skipped-by-admin) ;; labeled as admin, not "room"
          (advances queue)
          (broadcasts energy-skip message)
          (→ normal)))

      (edge-cases
        (labeled-as-admin-skip            ;; energy skip recorded as { by: 'admin' }
          "history shows 'skipped by admin' but admin didn't touch anything"
          "singer sees 'admin skipped your song'. blame misattributed")
        (no-reactions-no-decay            ;; room goes quiet
          "energy stays at whatever it was. could be 15 (below threshold)"
          "timer keeps counting. song gets auto-skipped because nobody reacted"
          "FIX: energy should decay toward 50 over time, not freeze")
        (threshold-changed-mid-timer      ;; admin adjusts while declining
          "new threshold applies immediately. timer keeps its start time"
          "if new threshold is higher, energy has been below it 'longer' than intended"))))

  ;; === THE SEAMS: where mechanical time meets human time ===
  (seams
    ;; These aren't bugs in the traditional sense.
    ;; They're places where the system forgets it's serving a human in a moment.

    (the-singer-doesnt-know-theyre-next
      "position notification from #2→#1 doesn't fire (code checks previousPosition > 2)"
      "singer is texting, looks up, their song is playing. missed the preparation moment")

    (the-message-that-vanished
      "user types encouragement in chat. WS is reconnecting. send succeeds locally"
      "message silently dropped. no error. user thinks room heard them. room didn't")

    (the-song-that-disappeared
      "admin removes entry. no notification to the singer"
      "singer checks phone: their song is gone. no explanation. did I imagine adding it?")

    (the-frozen-room
      "WS disconnects. no indicator on phone. user votes, chats, reacts"
      "everything looks normal. nothing is reaching the room"
      "reconnects 30s later. burst of state changes. position jumped. confusion")

    (the-mode-that-changed-underneath
      "admin switches karaoke→jukebox. guest's phone still shows karaoke UI"
      "guest tries to add song with name. gets jukebox error. has no session"
      "roomConfig fetched once on mount. never updated. UI lies about current mode")

    (the-celebration-that-blocks
      "song finishes. 4s recap overlay. can't dismiss. can't interact"
      "if next song loads fast, singer misses seeing who's next"
      "celebration intended as reward becomes a wall")

    (the-admin-who-isnt
      "legacy room. no PIN configured. anyone at /room/admin is admin"
      "no UI to set up admin PIN on existing room. no upgrade path"
      "at a public venue, anyone who guesses the URL pattern has full control")))


;; ============================================================================
;; PART III: THE SHAPE — what the model reveals
;; ============================================================================

;; Read Parts I and II together and a shape emerges:
;;
;; The system has three time-scales:
;;   1. Mechanical time — WebSocket messages, state broadcasts, API calls (milliseconds)
;;   2. Queue time — songs playing, countdowns, epoch increments (minutes)
;;   3. Human time — building courage, feeling nervous, celebrating (unbounded)
;;
;; Most edge cases live at the boundary between time-scales.
;; The pause countdown (mechanical) vs the singer's nerves (human).
;; The mode switch (instant) vs the guest's stale UI (until refresh).
;; The chat message (mechanical) vs the encouragement intended (human).
;;
;; The system is honest about its mechanical layer (single-threaded, no races,
;; idempotent advances). It is less honest about its human layer (no offline
;; indicators, silent message drops, no notification when your song is removed).
;;
;; The deepest structural observation:
;;   The admin is the only entity that can change how much the room speaks.
;;   Reactions, chat, energy, boo — all gated by admin config booleans.
;;   The room breathes only as much as the admin allows.
;;   But the room *is* the people. The admin controls the room's voice
;;   through configuration. This is not a bug. It's the architecture.
;;   Whether it's the right architecture depends on what kind of room you want.
;;
;; The latent section in Part I lists types that don't flow.
;; Part II reveals behaviors that don't reach the human:
;;   - The connection state that's never shown
;;   - The removal that's never announced
;;   - The mode change that's never propagated
;;   - The energy skip that's blamed on the admin
;;
;; These are the living system's latent forms:
;;   not dead code, but dead communication.
