import type { Entry, QueueState, VoteRecord, StackedSong, RoomMode } from '@karaoke/types'

/**
 * Sort queue by epoch ASC, votes DESC, joinedAt ASC (karaoke mode)
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
 * Sort queue by votes DESC, joinedAt ASC (jukebox mode)
 * Ignores epochs - votes are the only priority factor
 * Pure function - returns a new sorted array
 */
export function sortByVotes<T extends { votes: number; joinedAt: number }>(
  queue: readonly T[]
): T[] {
  return [...queue].sort((a, b) => {
    if (a.votes !== b.votes) return b.votes - a.votes
    return a.joinedAt - b.joinedAt
  })
}

/**
 * Sort queue based on room mode
 */
export function sortQueueByMode<T extends { epoch: number; votes: number; joinedAt: number }>(
  queue: readonly T[],
  mode: RoomMode
): T[] {
  return mode === 'jukebox' ? sortByVotes(queue) : sortQueue(queue)
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
 * Check if a user can join the queue (karaoke mode - name-based)
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
 * Check if a user can add directly to the general queue (jukebox mode - user ID based)
 * In jukebox mode, each user can only have ONE song in the general queue at a time
 * Returns true if user can add to queue, false if they must add to stack
 */
export function canAddToGeneralQueue(
  state: QueueState,
  userId: string
): boolean {
  // Check if user already has an entry in general queue
  const hasEntryInQueue = state.queue.some((e) => e.userId === userId)
  if (hasEntryInQueue) return false

  // Check if currently playing
  if (state.nowPlaying?.userId === userId) return false

  return true
}

/**
 * Check if user can add to their personal stack
 */
export function canAddToStack(
  currentStackSize: number,
  maxStackSize: number
): boolean {
  return currentStackSize < maxStackSize
}

/**
 * Create a stacked song entry
 */
export function createStackedSong(params: {
  id: string
  videoId: string
  title: string
  source: 'youtube' | 'spotify'
  timestamp: number
}): StackedSong {
  return {
    id: params.id,
    videoId: params.videoId,
    title: params.title.substring(0, 100),
    source: params.source,
    addedAt: params.timestamp,
  }
}

/**
 * Promote the first song from a user's stack to an Entry
 * Returns the new entry and the updated stack
 */
export function promoteFromStack(
  stack: readonly StackedSong[],
  userId: string,
  displayName: string,
  entryId: string,
  timestamp: number
): { entry: Entry; remainingStack: StackedSong[] } | null {
  if (stack.length === 0) return null

  const [first, ...rest] = stack
  const song = first!

  const entry: Entry = {
    id: entryId,
    name: displayName,
    videoId: song.videoId,
    title: song.title,
    source: song.source,
    votes: 0,
    epoch: 0, // Not used in jukebox mode
    joinedAt: timestamp,
    userId,
  }

  return { entry, remainingStack: rest }
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

/**
 * Reorder an entry to a specific position in the queue
 * Adjusts epoch and joinedAt to maintain position after sort
 * Pure function - returns new queue
 */
export function reorderEntry(
  queue: readonly Entry[],
  entryId: string,
  newPosition: number
): Entry[] | null {
  const entryIndex = queue.findIndex((e) => e.id === entryId)
  if (entryIndex === -1) return null

  const newQueue = [...queue]
  const entry = { ...newQueue[entryIndex]! }
  newQueue.splice(entryIndex, 1)

  const targetIndex = Math.min(Math.max(0, newPosition), newQueue.length)
  newQueue.splice(targetIndex, 0, entry)

  // Adjust epoch/joinedAt to maintain position
  if (targetIndex > 0) {
    const prevEntry = newQueue[targetIndex - 1]
    if (prevEntry) {
      entry.epoch = prevEntry.epoch
      entry.joinedAt = prevEntry.joinedAt - 1
    }
  } else if (newQueue.length > 1) {
    const nextEntry = newQueue[1]
    if (nextEntry) {
      entry.epoch = nextEntry.epoch
      entry.joinedAt = nextEntry.joinedAt - 1
    }
  }

  return newQueue
}
