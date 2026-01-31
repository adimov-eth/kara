import { describe, it, expect } from 'vitest'
import type { Entry, QueueState, VoteRecord, StackedSong } from '@karaoke/types'
import {
  sortQueue,
  sortByVotes,
  sortQueueByMode,
  createEntry,
  canJoinQueue,
  canAddToGeneralQueue,
  canAddToStack,
  createStackedSong,
  promoteFromStack,
  applyVote,
  advanceQueue,
  removeFromQueue,
  canRemoveEntry,
  canSkipCurrent,
  reorderEntry,
} from './queue.js'

// Helper to create test entries
function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'test-id',
    name: 'Test User',
    videoId: 'abc123',
    title: 'Test Song',
    source: 'youtube',
    votes: 0,
    epoch: 0,
    joinedAt: 1000,
    ...overrides,
  }
}

function makeState(overrides: Partial<QueueState> = {}): QueueState {
  return {
    queue: [],
    currentEpoch: 0,
    nowPlaying: null,
    ...overrides,
  }
}

describe('sortQueue', () => {
  it('returns empty array for empty queue', () => {
    expect(sortQueue([])).toEqual([])
  })

  it('returns single entry unchanged', () => {
    const entry = makeEntry()
    expect(sortQueue([entry])).toEqual([entry])
  })

  it('sorts by epoch ASC (lower epoch first)', () => {
    const e1 = makeEntry({ id: 'e1', epoch: 2, votes: 10 })
    const e2 = makeEntry({ id: 'e2', epoch: 1, votes: 0 })
    const e3 = makeEntry({ id: 'e3', epoch: 0, votes: 5 })

    const result = sortQueue([e1, e2, e3])
    expect(result.map((e) => e.id)).toEqual(['e3', 'e2', 'e1'])
  })

  it('sorts by votes DESC within same epoch', () => {
    const e1 = makeEntry({ id: 'e1', epoch: 0, votes: 5 })
    const e2 = makeEntry({ id: 'e2', epoch: 0, votes: 10 })
    const e3 = makeEntry({ id: 'e3', epoch: 0, votes: 3 })

    const result = sortQueue([e1, e2, e3])
    expect(result.map((e) => e.id)).toEqual(['e2', 'e1', 'e3'])
  })

  it('sorts by joinedAt ASC within same epoch and votes', () => {
    const e1 = makeEntry({ id: 'e1', epoch: 0, votes: 5, joinedAt: 3000 })
    const e2 = makeEntry({ id: 'e2', epoch: 0, votes: 5, joinedAt: 1000 })
    const e3 = makeEntry({ id: 'e3', epoch: 0, votes: 5, joinedAt: 2000 })

    const result = sortQueue([e1, e2, e3])
    expect(result.map((e) => e.id)).toEqual(['e2', 'e3', 'e1'])
  })

  it('handles negative votes correctly', () => {
    const e1 = makeEntry({ id: 'e1', epoch: 0, votes: -2 })
    const e2 = makeEntry({ id: 'e2', epoch: 0, votes: 1 })
    const e3 = makeEntry({ id: 'e3', epoch: 0, votes: -5 })

    const result = sortQueue([e1, e2, e3])
    expect(result.map((e) => e.id)).toEqual(['e2', 'e1', 'e3'])
  })

  it('does not mutate original array', () => {
    const original = [
      makeEntry({ id: 'e1', votes: 0 }),
      makeEntry({ id: 'e2', votes: 10 }),
    ]
    const originalCopy = [...original]
    sortQueue(original)
    expect(original).toEqual(originalCopy)
  })
})

describe('createEntry', () => {
  it('creates an entry with provided values', () => {
    const entry = createEntry({
      id: 'my-id',
      name: 'Singer',
      videoId: 'xyz789',
      title: 'My Song',
      source: 'youtube',
      currentEpoch: 3,
      timestamp: 5000,
    })

    expect(entry).toEqual({
      id: 'my-id',
      name: 'Singer',
      videoId: 'xyz789',
      title: 'My Song',
      source: 'youtube',
      votes: 0,
      epoch: 3,
      joinedAt: 5000,
    })
  })

  it('trims name to 30 characters', () => {
    const longName = 'A'.repeat(50)
    const entry = createEntry({
      id: 'id',
      name: longName,
      videoId: 'vid',
      title: 'Title',
      source: 'youtube',
      currentEpoch: 0,
      timestamp: 0,
    })

    expect(entry.name).toHaveLength(30)
    expect(entry.name).toBe('A'.repeat(30))
  })

  it('trims title to 100 characters', () => {
    const longTitle = 'B'.repeat(150)
    const entry = createEntry({
      id: 'id',
      name: 'Name',
      videoId: 'vid',
      title: longTitle,
      source: 'youtube',
      currentEpoch: 0,
      timestamp: 0,
    })

    expect(entry.title).toHaveLength(100)
    expect(entry.title).toBe('B'.repeat(100))
  })

  it('trims whitespace from name', () => {
    const entry = createEntry({
      id: 'id',
      name: '  Padded Name  ',
      videoId: 'vid',
      title: 'Title',
      source: 'youtube',
      currentEpoch: 0,
      timestamp: 0,
    })

    expect(entry.name).toBe('Padded Name')
  })

  it('always sets votes to 0', () => {
    const entry = createEntry({
      id: 'id',
      name: 'Name',
      videoId: 'vid',
      title: 'Title',
      source: 'youtube',
      currentEpoch: 5,
      timestamp: 1000,
    })

    expect(entry.votes).toBe(0)
  })
})

describe('canJoinQueue', () => {
  it('returns null if name is not in queue', () => {
    const state = makeState({
      queue: [makeEntry({ name: 'Alice' })],
    })

    const result = canJoinQueue(state, 'Bob')
    expect(result).toBeNull()
  })

  it('returns error if name is already in queue', () => {
    const state = makeState({
      queue: [makeEntry({ name: 'Alice' })],
    })

    const result = canJoinQueue(state, 'Alice')
    expect(result).toBe('You already have a song in the queue')
  })

  it('is case-insensitive when checking queue', () => {
    const state = makeState({
      queue: [makeEntry({ name: 'Alice' })],
    })

    const result = canJoinQueue(state, 'ALICE')
    expect(result).toBe('You already have a song in the queue')
  })

  it('returns error if name is nowPlaying', () => {
    const state = makeState({
      nowPlaying: makeEntry({ name: 'Bob' }),
    })

    const result = canJoinQueue(state, 'Bob')
    expect(result).toBe('Wait until your current song finishes')
  })

  it('is case-insensitive when checking nowPlaying', () => {
    const state = makeState({
      nowPlaying: makeEntry({ name: 'Bob' }),
    })

    const result = canJoinQueue(state, 'BOB')
    expect(result).toBe('Wait until your current song finishes')
  })

  it('returns null for empty queue with no nowPlaying', () => {
    const state = makeState()
    const result = canJoinQueue(state, 'Anyone')
    expect(result).toBeNull()
  })
})

describe('applyVote', () => {
  it('applies new vote', () => {
    const entry = makeEntry({ votes: 0 })

    const up = applyVote(entry, {}, 'voter1', 1)
    expect(up.entry.votes).toBe(1)
    expect(up.votes[entry.id]?.['voter1']).toBe(1)

    const down = applyVote(entry, {}, 'voter2', -1)
    expect(down.entry.votes).toBe(-1)
    expect(down.votes[entry.id]?.['voter2']).toBe(-1)
  })

  it('changes vote direction', () => {
    const entry = makeEntry({ id: 'e1', votes: 1 })
    const votes: VoteRecord = { e1: { voter1: 1 } }

    const result = applyVote(entry, votes, 'voter1', -1)

    expect(result.entry.votes).toBe(-1)
    expect(result.votes['e1']?.['voter1']).toBe(-1)
  })

  it('removes vote when direction is 0', () => {
    const entry = makeEntry({ id: 'e1', votes: 1 })
    const votes: VoteRecord = { e1: { voter1: 1 } }

    const result = applyVote(entry, votes, 'voter1', 0)

    expect(result.entry.votes).toBe(0)
    expect(result.votes['e1']?.['voter1']).toBeUndefined()
  })

  it('tracks multiple voters separately', () => {
    const entry = makeEntry({ id: 'e1', votes: 0 })

    const r1 = applyVote(entry, {}, 'voter1', 1)
    const r2 = applyVote(r1.entry, r1.votes, 'voter2', 1)
    const r3 = applyVote(r2.entry, r2.votes, 'voter3', -1)

    expect(r3.entry.votes).toBe(1)
    expect(r3.votes['e1']).toEqual({ voter1: 1, voter2: 1, voter3: -1 })
  })

  it('does not mutate original entry', () => {
    const entry = makeEntry({ votes: 5 })
    const votes: VoteRecord = {}

    applyVote(entry, votes, 'voter1', 1)

    expect(entry.votes).toBe(5)
  })

  it('does not mutate original votes record', () => {
    const entry = makeEntry({ id: 'e1' })
    const votes: VoteRecord = { e1: { existing: 1 } }

    applyVote(entry, votes, 'voter1', 1)

    expect(votes['e1']).toEqual({ existing: 1 })
  })
})

describe('advanceQueue', () => {
  it('returns nowPlaying as null when queue is empty', () => {
    const state = makeState({ nowPlaying: makeEntry() })
    const result = advanceQueue(state)

    expect(result.state.nowPlaying).toBeNull()
  })

  it('pops first entry to nowPlaying', () => {
    const e1 = makeEntry({ id: 'e1' })
    const e2 = makeEntry({ id: 'e2' })
    const state = makeState({ queue: [e1, e2] })

    const result = advanceQueue(state)

    expect(result.state.nowPlaying?.id).toBe('e1')
    expect(result.state.queue).toHaveLength(1)
    expect(result.state.queue[0]?.id).toBe('e2')
  })

  it('increments epoch', () => {
    const state = makeState({ currentEpoch: 5 })
    const result = advanceQueue(state)

    expect(result.state.currentEpoch).toBe(6)
  })

  it('returns completed as the previous nowPlaying', () => {
    const previous = makeEntry({ id: 'previous' })
    const state = makeState({ nowPlaying: previous })

    const result = advanceQueue(state)

    expect(result.completed?.id).toBe('previous')
  })

  it('returns completed as null when nothing was playing', () => {
    const state = makeState({ nowPlaying: null })
    const result = advanceQueue(state)

    expect(result.completed).toBeNull()
  })

  it('does not mutate original state', () => {
    const e1 = makeEntry({ id: 'e1' })
    const state = makeState({ queue: [e1], currentEpoch: 0 })
    const originalQueue = [...state.queue]

    advanceQueue(state)

    expect(state.queue).toEqual(originalQueue)
    expect(state.currentEpoch).toBe(0)
  })
})

describe('removeFromQueue', () => {
  it('removes entry by ID', () => {
    const e1 = makeEntry({ id: 'e1' })
    const e2 = makeEntry({ id: 'e2' })
    const state = makeState({ queue: [e1, e2] })

    const result = removeFromQueue(state, 'e1')

    expect(result?.queue).toHaveLength(1)
    expect(result?.queue[0]?.id).toBe('e2')
  })

  it('returns null if entry not found', () => {
    const state = makeState({ queue: [makeEntry({ id: 'e1' })] })
    const result = removeFromQueue(state, 'nonexistent')

    expect(result).toBeNull()
  })

  it('preserves other state properties', () => {
    const state = makeState({
      queue: [makeEntry({ id: 'e1' })],
      currentEpoch: 5,
      nowPlaying: makeEntry({ id: 'playing' }),
    })

    const result = removeFromQueue(state, 'e1')

    expect(result?.currentEpoch).toBe(5)
    expect(result?.nowPlaying?.id).toBe('playing')
  })

  it('does not mutate original state', () => {
    const e1 = makeEntry({ id: 'e1' })
    const state = makeState({ queue: [e1] })
    const originalQueue = [...state.queue]

    removeFromQueue(state, 'e1')

    expect(state.queue).toEqual(originalQueue)
  })
})

describe('canRemoveEntry', () => {
  it('allows admin regardless of userName', () => {
    const entry = makeEntry({ name: 'Alice' })
    expect(canRemoveEntry(entry, true, null)).toBe(true)
    expect(canRemoveEntry(entry, true, 'Bob')).toBe(true)
  })

  it('allows matching userName (case-insensitive)', () => {
    const entry = makeEntry({ name: 'Alice' })
    expect(canRemoveEntry(entry, false, 'Alice')).toBe(true)
    expect(canRemoveEntry(entry, false, 'ALICE')).toBe(true)
  })

  it('rejects non-admin with wrong or missing userName', () => {
    const entry = makeEntry({ name: 'Alice' })
    expect(canRemoveEntry(entry, false, null)).toBe(false)
    expect(canRemoveEntry(entry, false, 'Bob')).toBe(false)
  })
})

describe('canSkipCurrent', () => {
  it('returns false when nothing is playing', () => {
    expect(canSkipCurrent(null, true, 'Admin')).toBe(false)
    expect(canSkipCurrent(null, false, 'User')).toBe(false)
  })

  it('allows admin when something is playing', () => {
    const nowPlaying = makeEntry({ name: 'Singer' })
    expect(canSkipCurrent(nowPlaying, true, null)).toBe(true)
  })

  it('allows matching singer (case-insensitive)', () => {
    const nowPlaying = makeEntry({ name: 'Singer' })
    expect(canSkipCurrent(nowPlaying, false, 'Singer')).toBe(true)
    expect(canSkipCurrent(nowPlaying, false, 'SINGER')).toBe(true)
  })

  it('rejects non-admin with wrong or missing userName', () => {
    const nowPlaying = makeEntry({ name: 'Singer' })
    expect(canSkipCurrent(nowPlaying, false, 'AnotherUser')).toBe(false)
    expect(canSkipCurrent(nowPlaying, false, null)).toBe(false)
  })
})

describe('reorderEntry', () => {
  it('returns null if entry not found', () => {
    const queue = [makeEntry({ id: 'e1' })]
    const result = reorderEntry(queue, 'nonexistent', 0)

    expect(result).toBeNull()
  })

  it('moves entry to new position', () => {
    const queue = [
      makeEntry({ id: 'e1' }),
      makeEntry({ id: 'e2' }),
      makeEntry({ id: 'e3' }),
    ]

    const result = reorderEntry(queue, 'e3', 0)

    expect(result?.map((e) => e.id)).toEqual(['e3', 'e1', 'e2'])
  })

  it('clamps position to queue bounds (too high)', () => {
    const queue = [
      makeEntry({ id: 'e1' }),
      makeEntry({ id: 'e2' }),
    ]

    const result = reorderEntry(queue, 'e1', 100)

    // e1 should be at end (position 1 after removal)
    expect(result?.map((e) => e.id)).toEqual(['e2', 'e1'])
  })

  it('clamps position to queue bounds (negative)', () => {
    const queue = [
      makeEntry({ id: 'e1' }),
      makeEntry({ id: 'e2' }),
    ]

    const result = reorderEntry(queue, 'e2', -5)

    expect(result?.map((e) => e.id)).toEqual(['e2', 'e1'])
  })

  it('adjusts epoch/joinedAt to match previous entry', () => {
    const queue = [
      makeEntry({ id: 'e1', epoch: 0, joinedAt: 1000 }),
      makeEntry({ id: 'e2', epoch: 1, joinedAt: 2000 }),
      makeEntry({ id: 'e3', epoch: 2, joinedAt: 3000 }),
    ]

    const result = reorderEntry(queue, 'e3', 1)

    // e3 should now have epoch matching e1 (the entry before position 1)
    const movedEntry = result?.find((e) => e.id === 'e3')
    expect(movedEntry?.epoch).toBe(0) // matches previous entry
    expect(movedEntry?.joinedAt).toBe(999) // previous entry's joinedAt - 1
  })

  it('adjusts epoch/joinedAt when moving to position 0', () => {
    const queue = [
      makeEntry({ id: 'e1', epoch: 0, joinedAt: 1000 }),
      makeEntry({ id: 'e2', epoch: 1, joinedAt: 2000 }),
    ]

    const result = reorderEntry(queue, 'e2', 0)

    // When at position 0, should match the next entry
    const movedEntry = result?.find((e) => e.id === 'e2')
    expect(movedEntry?.epoch).toBe(0)
    expect(movedEntry?.joinedAt).toBe(999)
  })

  it('does not mutate original queue', () => {
    const queue = [
      makeEntry({ id: 'e1' }),
      makeEntry({ id: 'e2' }),
    ]
    const originalOrder = queue.map((e) => e.id)

    reorderEntry(queue, 'e2', 0)

    expect(queue.map((e) => e.id)).toEqual(originalOrder)
  })
})

// ============================================================================
// JUKEBOX MODE TESTS
// ============================================================================

// Helper to create stacked songs
function makeStackedSong(overrides: Partial<StackedSong> = {}): StackedSong {
  return {
    id: 'stack-id',
    videoId: 'abc123',
    title: 'Stacked Song',
    source: 'youtube',
    addedAt: 1000,
    ...overrides,
  }
}

describe('sortByVotes', () => {
  it('returns empty array for empty queue', () => {
    expect(sortByVotes([])).toEqual([])
  })

  it('returns single entry unchanged', () => {
    const entry = makeEntry()
    expect(sortByVotes([entry])).toEqual([entry])
  })

  it('sorts by votes DESC (higher votes first)', () => {
    const e1 = makeEntry({ id: 'e1', votes: 5 })
    const e2 = makeEntry({ id: 'e2', votes: 10 })
    const e3 = makeEntry({ id: 'e3', votes: 3 })

    const result = sortByVotes([e1, e2, e3])
    expect(result.map((e) => e.id)).toEqual(['e2', 'e1', 'e3'])
  })

  it('sorts by joinedAt ASC within same votes', () => {
    const e1 = makeEntry({ id: 'e1', votes: 5, joinedAt: 3000 })
    const e2 = makeEntry({ id: 'e2', votes: 5, joinedAt: 1000 })
    const e3 = makeEntry({ id: 'e3', votes: 5, joinedAt: 2000 })

    const result = sortByVotes([e1, e2, e3])
    expect(result.map((e) => e.id)).toEqual(['e2', 'e3', 'e1'])
  })

  it('ignores epoch values entirely', () => {
    const e1 = makeEntry({ id: 'e1', epoch: 0, votes: 5 })
    const e2 = makeEntry({ id: 'e2', epoch: 100, votes: 10 }) // high epoch but high votes
    const e3 = makeEntry({ id: 'e3', epoch: 1, votes: 3 })

    const result = sortByVotes([e1, e2, e3])
    // e2 has highest votes, should be first despite epoch 100
    expect(result.map((e) => e.id)).toEqual(['e2', 'e1', 'e3'])
  })

  it('handles negative votes correctly', () => {
    const e1 = makeEntry({ id: 'e1', votes: -2 })
    const e2 = makeEntry({ id: 'e2', votes: 1 })
    const e3 = makeEntry({ id: 'e3', votes: -5 })

    const result = sortByVotes([e1, e2, e3])
    expect(result.map((e) => e.id)).toEqual(['e2', 'e1', 'e3'])
  })

  it('handles zero votes with tiebreak on joinedAt', () => {
    const e1 = makeEntry({ id: 'e1', votes: 0, joinedAt: 2000 })
    const e2 = makeEntry({ id: 'e2', votes: 0, joinedAt: 1000 })

    const result = sortByVotes([e1, e2])
    expect(result.map((e) => e.id)).toEqual(['e2', 'e1'])
  })

  it('does not mutate original array', () => {
    const original = [
      makeEntry({ id: 'e1', votes: 0 }),
      makeEntry({ id: 'e2', votes: 10 }),
    ]
    const originalCopy = [...original]
    sortByVotes(original)
    expect(original).toEqual(originalCopy)
  })
})

describe('sortQueueByMode', () => {
  it('uses sortByVotes for jukebox mode', () => {
    const e1 = makeEntry({ id: 'e1', epoch: 0, votes: 5 })
    const e2 = makeEntry({ id: 'e2', epoch: 1, votes: 10 })

    const result = sortQueueByMode([e1, e2], 'jukebox')
    // In jukebox, e2 wins by votes despite higher epoch
    expect(result.map((e) => e.id)).toEqual(['e2', 'e1'])
  })

  it('uses sortQueue for karaoke mode', () => {
    const e1 = makeEntry({ id: 'e1', epoch: 0, votes: 5 })
    const e2 = makeEntry({ id: 'e2', epoch: 1, votes: 10 })

    const result = sortQueueByMode([e1, e2], 'karaoke')
    // In karaoke, e1 wins by lower epoch
    expect(result.map((e) => e.id)).toEqual(['e1', 'e2'])
  })
})

describe('canAddToGeneralQueue', () => {
  it('returns true when user has no entries in queue or nowPlaying', () => {
    const state = makeState({
      queue: [makeEntry({ userId: 'user-a' })],
      nowPlaying: makeEntry({ userId: 'user-b' }),
    })

    expect(canAddToGeneralQueue(state, 'user-c')).toBe(true)
  })

  it('returns false when user already has entry in queue', () => {
    const state = makeState({
      queue: [makeEntry({ userId: 'user-a' })],
    })

    expect(canAddToGeneralQueue(state, 'user-a')).toBe(false)
  })

  it('returns false when user is currently playing', () => {
    const state = makeState({
      nowPlaying: makeEntry({ userId: 'user-a' }),
    })

    expect(canAddToGeneralQueue(state, 'user-a')).toBe(false)
  })

  it('returns false when user has entry in queue AND is playing', () => {
    const state = makeState({
      queue: [makeEntry({ userId: 'user-a' })],
      nowPlaying: makeEntry({ userId: 'user-a' }),
    })

    expect(canAddToGeneralQueue(state, 'user-a')).toBe(false)
  })

  it('returns true for empty queue and no nowPlaying', () => {
    const state = makeState()
    expect(canAddToGeneralQueue(state, 'any-user')).toBe(true)
  })

  it('handles entries without userId (legacy karaoke entries)', () => {
    // Legacy entries might not have userId - they shouldn't block new users
    const state = makeState({
      queue: [makeEntry({ userId: undefined })],
    })

    // A user with a defined userId should still be able to add
    expect(canAddToGeneralQueue(state, 'user-a')).toBe(true)
  })

  it('handles undefined userId in nowPlaying', () => {
    const state = makeState({
      nowPlaying: makeEntry({ userId: undefined }),
    })

    expect(canAddToGeneralQueue(state, 'user-a')).toBe(true)
  })
})

describe('canAddToStack', () => {
  it('returns true when stack size is below max', () => {
    expect(canAddToStack(0, 10)).toBe(true)
    expect(canAddToStack(5, 10)).toBe(true)
    expect(canAddToStack(9, 10)).toBe(true)
  })

  it('returns false when stack size equals max', () => {
    expect(canAddToStack(10, 10)).toBe(false)
  })

  it('returns false when stack size exceeds max', () => {
    expect(canAddToStack(11, 10)).toBe(false)
  })

  it('works with max size of 0', () => {
    expect(canAddToStack(0, 0)).toBe(false)
  })

  it('works with max size of 1', () => {
    expect(canAddToStack(0, 1)).toBe(true)
    expect(canAddToStack(1, 1)).toBe(false)
  })
})

describe('createStackedSong', () => {
  it('creates a stacked song with provided values', () => {
    const song = createStackedSong({
      id: 'stack-1',
      videoId: 'xyz789',
      title: 'My Song',
      source: 'youtube',
      timestamp: 5000,
    })

    expect(song).toEqual({
      id: 'stack-1',
      videoId: 'xyz789',
      title: 'My Song',
      source: 'youtube',
      addedAt: 5000,
    })
  })

  it('trims title to 100 characters', () => {
    const longTitle = 'A'.repeat(150)
    const song = createStackedSong({
      id: 'id',
      videoId: 'vid',
      title: longTitle,
      source: 'youtube',
      timestamp: 0,
    })

    expect(song.title).toHaveLength(100)
    expect(song.title).toBe('A'.repeat(100))
  })

  it('supports spotify source', () => {
    const song = createStackedSong({
      id: 'id',
      videoId: 'spotify-track-id',
      title: 'Spotify Song',
      source: 'spotify',
      timestamp: 0,
    })

    expect(song.source).toBe('spotify')
  })
})

describe('promoteFromStack', () => {
  it('returns null for empty stack', () => {
    const result = promoteFromStack([], 'user-1', 'User Name', 'entry-id', 1000)
    expect(result).toBeNull()
  })

  it('promotes first song from stack (FIFO order)', () => {
    const stack = [
      makeStackedSong({ id: 's1', videoId: 'vid1', title: 'First' }),
      makeStackedSong({ id: 's2', videoId: 'vid2', title: 'Second' }),
      makeStackedSong({ id: 's3', videoId: 'vid3', title: 'Third' }),
    ]

    const result = promoteFromStack(stack, 'user-1', 'Singer Name', 'entry-id', 5000)

    expect(result).not.toBeNull()
    if (result === null) return // Type guard for TypeScript
    expect(result.entry.videoId).toBe('vid1')
    expect(result.entry.title).toBe('First')
    expect(result.remainingStack).toHaveLength(2)
    expect(result.remainingStack[0]?.videoId).toBe('vid2')
    expect(result.remainingStack[1]?.videoId).toBe('vid3')
  })

  it('creates entry with correct shape', () => {
    const stack = [
      makeStackedSong({
        id: 's1',
        videoId: 'vid123',
        title: 'Test Song',
        source: 'youtube',
      }),
    ]

    const result = promoteFromStack(stack, 'user-abc', 'Display Name', 'new-entry-id', 9999)

    expect(result).not.toBeNull()
    if (result === null) return
    expect(result.entry).toEqual({
      id: 'new-entry-id',
      name: 'Display Name',
      videoId: 'vid123',
      title: 'Test Song',
      source: 'youtube',
      votes: 0,
      epoch: 0,
      joinedAt: 9999,
      userId: 'user-abc',
    })
  })

  it('sets epoch to 0 (jukebox mode ignores epochs)', () => {
    const stack = [makeStackedSong()]
    const result = promoteFromStack(stack, 'user-1', 'Name', 'id', 1000)

    expect(result).not.toBeNull()
    if (result === null) return
    expect(result.entry.epoch).toBe(0)
  })

  it('initializes votes to 0', () => {
    const stack = [makeStackedSong()]
    const result = promoteFromStack(stack, 'user-1', 'Name', 'id', 1000)

    expect(result).not.toBeNull()
    if (result === null) return
    expect(result.entry.votes).toBe(0)
  })

  it('attaches userId to promoted entry', () => {
    const stack = [makeStackedSong()]
    const result = promoteFromStack(stack, 'my-user-id', 'Name', 'id', 1000)

    expect(result).not.toBeNull()
    if (result === null) return
    expect(result.entry.userId).toBe('my-user-id')
  })

  it('uses provided timestamp for joinedAt', () => {
    const stack = [makeStackedSong()]
    const result = promoteFromStack(stack, 'user-1', 'Name', 'id', 12345)

    expect(result).not.toBeNull()
    if (result === null) return
    expect(result.entry.joinedAt).toBe(12345)
  })

  it('returns empty array when promoting last song', () => {
    const stack = [makeStackedSong()]
    const result = promoteFromStack(stack, 'user-1', 'Name', 'id', 1000)

    expect(result).not.toBeNull()
    if (result === null) return
    expect(result.remainingStack).toEqual([])
  })

  it('does not mutate original stack', () => {
    const stack = [
      makeStackedSong({ id: 's1' }),
      makeStackedSong({ id: 's2' }),
    ]
    const originalLength = stack.length

    promoteFromStack(stack, 'user-1', 'Name', 'id', 1000)

    expect(stack).toHaveLength(originalLength)
    expect(stack[0]?.id).toBe('s1')
  })

  it('preserves source from stacked song', () => {
    const stack = [makeStackedSong({ source: 'spotify' })]
    const result = promoteFromStack(stack, 'user-1', 'Name', 'id', 1000)

    expect(result).not.toBeNull()
    if (result === null) return
    expect(result.entry.source).toBe('spotify')
  })
})
