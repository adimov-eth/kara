# Phase 2 Test Scenario

Prereq: use staging `https://new.bkk.lol` and a room that has config but no admin (a legacy room). If you don’t have one, see “Fallback” at end.

## A. Legacy Admin Claim Flow
1. Open `/{legacyRoom}/admin`.
2. Expect “Set Admin PIN” UI (not “Admin Login”).
3. Enter a 6-digit PIN and confirm it → click “Set PIN”.
4. Expect: success toast, authenticated admin UI appears, queue controls visible.
5. Refresh page or open a new tab → still authenticated (token persisted).
6. Close the browser, reopen `/{legacyRoom}/admin` within 4 hours → still authenticated.

## B. Claim Endpoint Guarding
1. From a separate browser profile, open the same `/{legacyRoom}/admin`.
2. Expect: Admin Login screen (not claim).
3. Try to claim again via UI → should show “already has an admin PIN”.

## C. PIN Modal Closes on Mode Switch
1. Switch room to karaoke.
2. Use a claimed name so you can trigger the PIN verify modal:
   - If needed, claim a name from another device (Guest view → finish a song → claim PIN).
3. On Guest view, attempt to add a song with the claimed name → PIN verify modal opens.
4. While modal is open, admin switches room to jukebox.
5. Expect: PIN modal closes immediately.

## D. Claim Modal Suppressed in Jukebox
1. In jukebox mode, finish a song on Guest view to trigger the recap flow.
2. Expect: no PIN claim modal appears after the recap.

## E. Admin Token Persistence
1. Login as admin, perform an action (skip/add).
2. Close tab, reopen `/{room}/admin` → still authenticated.
3. Wait past 4 hours (or adjust system clock) → token should be expired and login required.

## Fallback (if no legacy room exists)
- Run locally (wrangler dev) and manually clear the admin key in DO storage, or ask for a staging room that predates admin PINs. The claim flow requires a room with config but no admin set.
