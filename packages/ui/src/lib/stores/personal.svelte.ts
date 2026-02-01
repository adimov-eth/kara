// Derives personal meaning from impersonal server events.
//
// The machine broadcasts everything that happens: removals, skips, advances, state.
// But it never says what it means for YOU. This store bridges that gap.
//
// It tracks who "I" am, snapshots the queue between updates, and when event
// messages arrive (before the next state update), asks: "Was that about me?"
// If yes, it fires a contextual toast so the person knows what happened.

import type { Entry, QueueState } from '@karaoke/types';
import { toastStore } from './toast.svelte';

// Who am I in this room?
let myName = $state('');
let myUserId = $state<string | null>(null);

// Snapshot of queue at last state update — used to look up entries by ID
// when event messages (removed, energySkip) arrive before the next state push
let lastQueue = $state<Entry[]>([]);
let lastNowPlaying = $state<Entry | null>(null);

// Flag: was the most recent skip an energy skip?
// Consumed by GuestView to suppress the congratulatory "Nice!" toast.
let wasEnergySkip = $state(false);

function isMyEntry(entry: Entry): boolean {
  if (myUserId && entry.userId === myUserId) return true;
  if (myName && entry.name.toLowerCase() === myName.toLowerCase()) return true;
  return false;
}

/**
 * Update identity. Call whenever myName or session changes.
 */
function setIdentity(name: string, userId?: string): void {
  myName = name;
  myUserId = userId ?? null;
}

/**
 * Handle { kind: 'removed', entryId } from server.
 * Arrives BEFORE the state update that reflects the removal.
 */
function handleRemoved(entryId: string): void {
  const entry = lastQueue.find(e => e.id === entryId);
  if (entry && isMyEntry(entry)) {
    toastStore.info('Your song was removed from the queue');
  }
}

/**
 * Handle { kind: 'energySkip' } from server.
 * Arrives BEFORE the state update that advances the queue.
 * Sets a flag so GuestView can suppress the normal "song finished" toast.
 */
function handleEnergySkip(): void {
  wasEnergySkip = true;
  if (lastNowPlaying && isMyEntry(lastNowPlaying)) {
    toastStore.info('The room energy was low \u2014 song skipped');
  }
}

/**
 * Check and consume the energy skip flag.
 * Returns true if the last skip was energy-triggered.
 * GuestView uses this to avoid showing "Nice! You got X votes" after an energy skip.
 */
function consumeEnergySkipFlag(): boolean {
  if (wasEnergySkip) {
    wasEnergySkip = false;
    return true;
  }
  return false;
}

/**
 * Snapshot the current state for future event diffing.
 * Call at the END of every state update handler.
 */
function trackState(state: QueueState): void {
  lastQueue = [...state.queue];
  lastNowPlaying = state.nowPlaying;
}

export const personalStore = {
  setIdentity,
  handleRemoved,
  handleEnergySkip,
  consumeEnergySkipFlag,
  trackState,
};
