import { describe, it, expect } from 'vitest'
import type { Entry, QueueState, VoteRecord } from '@karaoke/types'
import {
  sortQueue,
  createEntry,
  canJoinQueue,
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
