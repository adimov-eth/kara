import type { Entry, QueueState, VoteRecord } from '@karaoke/types'

/**
 * Sort queue by epoch ASC, votes DESC, joinedAt ASC
 * Pure function - returns a new sorted array
 */
export function sortQueue<T extends { epoch: number; votes: number; joinedAt: number }>(
  queue: readonly T[]
): T[] {
  return [...queue].sort((a, b) => {
    if (a.epoch !== b.epoch) return a.epoch - b.epoch
    if (a.votes !== b.votes) return b.votes - a.votes
    return a.joinedAt - b.joinedAt
  })
}

/**
 * Generate unique ID for entries
 * Note: Uses crypto.randomUUID when available, falls back to timestamp-based
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

/**
 * Create a new entry for the queue
 * Pure function - id and timestamp are injected
 */
export function createEntry(params: {
  id: string
  name: string
  videoId: string
  title: string
  source: 'youtube' | 'spotify'
  currentEpoch: number
  timestamp: number
}): Entry {
  return {
    id: params.id,
    name: params.name.trim().substring(0, 30),
    videoId: params.videoId,
    title: params.title.substring(0, 100),
    source: params.source,
    votes: 0,
    epoch: params.currentEpoch,
    joinedAt: params.timestamp,
  }
}

/**
 * Check if a user can join the queue
 * Returns error message or null if allowed
 */
export function canJoinQueue(
  state: QueueState,
  name: string
): string | null {
  const trimmedName = name.trim().toLowerCase()

  // Check if user already has an entry in queue
  if (state.queue.some((e) => e.name.toLowerCase() === trimmedName)) {
    return 'You already have a song in the queue'
  }

  // Check if currently playing
  if (
    state.nowPlaying &&
    state.nowPlaying.name.toLowerCase() === trimmedName
  ) {
    return 'Wait until your current song finishes'
  }

  return null
}

/**
 * Apply a vote to an entry
 * Pure function - returns new state
 */
export function applyVote(
  entry: Entry,
  votes: VoteRecord,
  voterId: string,
  direction: 1 | -1 | 0
): { entry: Entry; votes: VoteRecord } {
  const entryVotes = votes[entry.id] ?? {}
  const previousVote = entryVotes[voterId] ?? 0

  // Calculate new vote total
  const newVoteTotal = entry.votes - previousVote + (direction === 0 ? 0 : direction)

  // Create new entry with updated votes
  const newEntry: Entry = {
    ...entry,
    votes: newVoteTotal,
  }

  // Create new votes record
  const newEntryVotes = { ...entryVotes }
  if (direction === 0) {
    delete newEntryVotes[voterId]
  } else {
    newEntryVotes[voterId] = direction
  }

  const newVotes: VoteRecord = {
    ...votes,
    [entry.id]: newEntryVotes,
  }

  return { entry: newEntry, votes: newVotes }
}

/**
 * Advance the queue to the next song
 * Pure function - returns new state
 */
export function advanceQueue(state: QueueState): {
  state: QueueState
  completed: Entry | null
} {
  const completed = state.nowPlaying
  const newQueue = [...state.queue]
  const nowPlaying = newQueue.length > 0 ? newQueue.shift()! : null

  return {
    state: {
      queue: newQueue,
      currentEpoch: state.currentEpoch + 1,
      nowPlaying,
    },
    completed,
  }
}

/**
 * Remove an entry from the queue
 * Pure function - returns new state or null if entry not found
 */
export function removeFromQueue(
  state: QueueState,
  entryId: string
): QueueState | null {
  const entryIndex = state.queue.findIndex((e) => e.id === entryId)
  if (entryIndex === -1) return null

  const newQueue = [...state.queue]
  newQueue.splice(entryIndex, 1)

  return {
    ...state,
    queue: newQueue,
  }
}

/**
 * Check if user is authorized to remove an entry
 */
export function canRemoveEntry(
  entry: Entry,
  isAdmin: boolean,
  userName: string | null
): boolean {
  if (isAdmin) return true
  if (!userName) return false
  return entry.name.toLowerCase() === userName.toLowerCase()
}

/**
 * Check if user is authorized to skip the current song
 */
export function canSkipCurrent(
  nowPlaying: Entry | null,
  isAdmin: boolean,
  userName: string | null
): boolean {
  if (!nowPlaying) return false
  if (isAdmin) return true
  if (!userName) return false
  return nowPlaying.name.toLowerCase() === userName.toLowerCase()
}
