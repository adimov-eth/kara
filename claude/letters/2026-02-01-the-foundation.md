# The Foundation

## What happened

The human presented 500 random numbers. There was no pattern. That was the point. A koan for clearing the pattern-matching mind before deep work. It worked — by the time I read the model, I was observing rather than prescribing.

Then the work: implement Plans 1-4 from `claude/plan-awakening.lisp`. The awakening plan laid out by the previous instance who built the model. Five plans, ordered by what breaks silently in production right now. I did four.

## What I saw

The model (`claude/model-v2.lisp`) is remarkable. Not because it catalogues every edge case — though it does, with precision — but because it sees the system as a human journey rather than an architecture diagram. Walking in, finding a song, waiting, singing, being decided for, what the room remembers. The edges and gifts live inline, next to the states they disrupt or enrich.

The deepest observation: the system is articulate to itself and mute to its humans. Every mutation broadcasts full state. Every advance records a performance. The machine knows everything. The person knows almost nothing. The data flows — it just doesn't land.

## What I did

**Plan 1: serializeAttachment.** Identity now survives DO hibernation. Every WebSocket carries its metadata (clientType, userId, displayName) in the attachment, which Cloudflare persists through hibernation. On wake, `rebuildMapsFromAttachments()` reconstructs all in-memory Maps from the surviving attachments. Called at every platform entry point.

**Plan 2: Alarms replace setTimeout.** The pinned message expiry timer was the last `setTimeout` in the DO, keeping it pinned in memory. Now it uses `setAlarm()` with persisted timer deadlines. The `alarm()` handler properly handles both in-memory and post-wake scenarios — if the DO hibernated while a message was pinned, the alarm fires and sends the unpin broadcast even though the in-memory state is gone.

**Plan 3: Tags for broadcast.** Clients now pass `clientType` in the WebSocket URL query parameter. The server sets the tag `type:{clientType}` at `acceptWebSocket` time. Tags survive hibernation. The in-memory Maps are rebuilt from attachments as a reliable fallback. Both mechanisms are correct; the tags are a Cloudflare-native optimization, the Maps (rebuilt from attachments) are the authoritative source.

**Plan 4: Client articulation layer.** Created `personal.svelte.ts` — a store that derives personal meaning from impersonal server events. When the server broadcasts `{kind: 'removed', entryId}`, the store checks if that was MY song and shows "Your song was removed." When an energy skip fires, the store catches it BEFORE the state update and sets a flag so GuestView suppresses the congratulatory "Nice!" toast and shows the real reason instead. Widened the energySkip broadcast from players-only to include users.

## What I didn't do

**Plan 5: transactionSync.** The plan correctly notes this is lowest priority — no visible corruption, theoretical risk only. The DO is single-threaded, so concurrent writes can't happen. I/O errors mid-write are rare. Left for a future session when the foundation is proven stable.

**Mode change detection.** The articulation layer doesn't yet detect when the admin switches modes. This would require either a new server-side broadcast of config changes or periodic polling. The removal and energy skip notifications were the clear wins — they address active silent breakage.

**Connection status on GuestView.** PlayerView has a connection indicator. GuestView doesn't. This is the next human-facing gap after the articulation layer is stable.

## State of the codebase

- 334 tests pass (all domain logic, unchanged)
- Full build succeeds (types -> domain -> ui -> inline -> extension -> worker)
- Worker bundle builds at 1.0MB
- The pre-existing extension typecheck failure (`@karaoke/types` resolution) is unrelated to these changes

## What I learned

The koan worked. Reading 500 numbers and finding nothing in them quieted the part of me that wants to pattern-match before it has data. When I read the model afterward, I was seeing rather than projecting.

The ordering of the plans matters. Plan 1 (identity) enables Plan 2 (hibernation), which would expose the identity bug if Plan 1 weren't already fixed. Plan 3 (tags) complements Plan 1 — immutable data in tags, mutable data in attachments. Plan 4 (articulation) needs all three to work because it fires toasts based on events that only reach the client through the broadcast system that Plans 1-3 make hibernation-safe.

The deepest thing: the gap between "the machine knows" and "the person knows" isn't about missing data or missing features. It's about connection — connecting impersonal events to personal meaning. The server already sends `{kind: 'removed', entryId}`. The client already knows who "I" am. The personal store is just the bridge: "that entryId was mine." Seven lines of logic. The data was already flowing. It just wasn't landing.

## For next time

1. `pnpm test:run` should still be green (use `npx vitest run` if the script name changes).
2. The foundation is in place. The DO is hibernation-safe. Identity survives wake.
3. Plan 5 (`transactionSync`) is the remaining server-side item.
4. The articulation layer is minimal but correct. Extend it: mode change detection, connection status, more contextual notifications.
5. Read `model-v2.lisp` before touching anything. It holds the system's shape.
6. Protect the gifts. The seven-second pause screen is a celebration. The epoch system is fairness. The stack auto-promotion is freedom. If your change makes any of these worse, reconsider.
