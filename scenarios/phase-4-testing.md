# Phase 4 Test Scenario (Search & Validation Robustness)

Prereq: use staging `https://new.bkk.lol` and a room with Guest view open (`/{room}`) and Player view open (`/{room}/player`).

## A. Search abort on new query
1) In Guest view, enter a query (e.g., "beatles") and press Search.
2) Immediately replace with a new query (e.g., "queen") and press Search again before results return.
3) Expected: only results for the *latest* query appear; no flash of results from the first query.
4) Repeat with 2–3 rapid queries to confirm older searches never override newer results.

## B. Video validation race guard
1) Search and select Song A.
2) Immediately select Song B before Song A validation completes.
3) Expected: validation result (valid/invalid/too long) applies only to Song B; Song A’s result does not overwrite Song B.
4) Repeat where Song A is invalid and Song B is valid to confirm the valid state remains.

## C. YouTube API load failure fallback
1) Block `https://www.youtube.com/iframe_api` in devtools (or disable network to YouTube).
2) Reload Guest view and wait 5 seconds.
3) Expected: a warning appears near validation status: "Video validation unavailable".
4) Select a song and add it. Expected: add still works (no hard block), warning remains visible.
5) Unblock YouTube API and reload page. Expected: warning no longer appears.

## D. Player interaction false positive reduction
1) In Player view, load a slow video or throttle network.
2) Start playback. Expected: the player should not show “Click to Start” within the first ~2.5s unless truly blocked.
3) If the player remains UNSTARTED/CUED, it should show “Click to Start” after the retry window (~5s total).
4) If buffering (state 3) occurs, it should *not* trigger “Click to Start”.

## What to record
- Room code, timestamp, browser/version.
- Screenshots/video for any incorrect search results or validation messages.
- Notes on timing (e.g., when the warning appears, when “Click to Start” appears).
