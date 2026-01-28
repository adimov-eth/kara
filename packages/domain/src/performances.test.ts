import { describe, it, expect } from 'vitest'
import type { Entry, Performance } from '@karaoke/types'
import {
  createPerformance,
  isFirstPerformance,
  getPerformanceHistory,
  calculateSingerStats,
  getPopularSongs,
} from './performances.js'

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-id',
    name: 'Test User',
    videoId: 'abc123',
    title: 'Test Song',
    source: 'youtube',
    votes: 5,
    epoch: 0,
    joinedAt: 1000,
    ...overrides,
  }
}

function makePerformance(overrides: Partial<Performance> = {}): Performance {
  return {
    id: 'perf-id',
    name: 'Test User',
    videoId: 'abc123',
    title: 'Test Song',
    performedAt: 1000,
    votes: 5,
    outcome: { kind: 'completed' },
    ...overrides,
  }
}

describe('createPerformance', () => {
  it('creates performance from entry', () => {
    const entry = makeEntry({ name: 'Singer', videoId: 'vid123', title: 'My Song', votes: 10 })
    const perf = createPerformance(entry, { kind: 'completed' }, 'perf-123', 5000)

    expect(perf).toEqual({
      id: 'perf-123',
      name: 'Singer',
      videoId: 'vid123',
      title: 'My Song',
      performedAt: 5000,
      votes: 10,
      outcome: { kind: 'completed' },
    })
  })

  it('preserves outcome type', () => {
    const entry = makeEntry()

    expect(createPerformance(entry, { kind: 'skipped', by: 'singer' }, 'id', 0).outcome)
      .toEqual({ kind: 'skipped', by: 'singer' })
    expect(createPerformance(entry, { kind: 'skipped', by: 'admin' }, 'id', 0).outcome)
      .toEqual({ kind: 'skipped', by: 'admin' })
    expect(createPerformance(entry, { kind: 'errored', reason: 'test' }, 'id', 0).outcome)
      .toEqual({ kind: 'errored', reason: 'test' })
  })
})

describe('isFirstPerformance', () => {
  it('returns true when no performances exist', () => {
    const result = isFirstPerformance([], 'Alice')
    expect(result).toBe(true)
  })

  it('returns true when no completed performances for name', () => {
    const performances = [
      makePerformance({ name: 'Bob', outcome: { kind: 'completed' } }),
      makePerformance({ name: 'Alice', outcome: { kind: 'skipped', by: 'admin' } }),
    ]

    const result = isFirstPerformance(performances, 'Alice')
    expect(result).toBe(true)
  })

  it('returns false when has completed performance', () => {
    const performances = [
      makePerformance({ name: 'Alice', outcome: { kind: 'completed' } }),
    ]

    const result = isFirstPerformance(performances, 'Alice')
    expect(result).toBe(false)
  })

  it('is case-insensitive', () => {
    const performances = [
      makePerformance({ name: 'alice', outcome: { kind: 'completed' } }),
    ]

    expect(isFirstPerformance(performances, 'ALICE')).toBe(false)
    expect(isFirstPerformance(performances, 'Alice')).toBe(false)
  })

  it('skipped performances do not count as first', () => {
    const performances = [
      makePerformance({ name: 'Alice', outcome: { kind: 'skipped', by: 'singer' } }),
      makePerformance({ name: 'Alice', outcome: { kind: 'skipped', by: 'admin' } }),
    ]

    const result = isFirstPerformance(performances, 'Alice')
    expect(result).toBe(true)
  })

  it('errored performances do not count as first', () => {
    const performances = [
      makePerformance({ name: 'Alice', outcome: { kind: 'errored', reason: 'test' } }),
    ]

    const result = isFirstPerformance(performances, 'Alice')
    expect(result).toBe(true)
  })
})

describe('getPerformanceHistory', () => {
  it('returns empty array when no performances', () => {
    const result = getPerformanceHistory([], 'Alice')
    expect(result).toEqual([])
  })

  it('filters by name', () => {
    const performances = [
      makePerformance({ id: 'p1', name: 'Alice' }),
      makePerformance({ id: 'p2', name: 'Bob' }),
      makePerformance({ id: 'p3', name: 'Alice' }),
    ]

    const result = getPerformanceHistory(performances, 'Alice')

    expect(result).toHaveLength(2)
    expect(result.every((p) => p.name === 'Alice')).toBe(true)
  })

  it('is case-insensitive', () => {
    const performances = [
      makePerformance({ name: 'alice' }),
      makePerformance({ name: 'ALICE' }),
      makePerformance({ name: 'Alice' }),
    ]

    const result = getPerformanceHistory(performances, 'ALICE')
    expect(result).toHaveLength(3)
  })

  it('sorts by performedAt DESC (most recent first)', () => {
    const performances = [
      makePerformance({ id: 'oldest', name: 'Alice', performedAt: 1000 }),
      makePerformance({ id: 'newest', name: 'Alice', performedAt: 3000 }),
      makePerformance({ id: 'middle', name: 'Alice', performedAt: 2000 }),
    ]

    const result = getPerformanceHistory(performances, 'Alice')

    expect(result.map((p) => p.id)).toEqual(['newest', 'middle', 'oldest'])
  })

  it('does not mutate original array', () => {
    const performances = [
      makePerformance({ name: 'Alice', performedAt: 1000 }),
      makePerformance({ name: 'Alice', performedAt: 2000 }),
    ]
    const originalOrder = performances.map((p) => p.performedAt)

    getPerformanceHistory(performances, 'Alice')

    expect(performances.map((p) => p.performedAt)).toEqual(originalOrder)
  })
})

describe('calculateSingerStats', () => {
  it('returns zeros when no performances', () => {
    const result = calculateSingerStats([], 'Alice')

    expect(result).toEqual({
      totalSongs: 0,
      totalVotes: 0,
      completedSongs: 0,
    })
  })

  it('counts total songs', () => {
    const performances = [
      makePerformance({ name: 'Alice', outcome: { kind: 'completed' } }),
      makePerformance({ name: 'Alice', outcome: { kind: 'skipped', by: 'admin' } }),
      makePerformance({ name: 'Bob', outcome: { kind: 'completed' } }),
    ]

    const result = calculateSingerStats(performances, 'Alice')
    expect(result.totalSongs).toBe(2)
  })

  it('sums votes including negative', () => {
    const performances = [
      makePerformance({ name: 'Alice', votes: 10 }),
      makePerformance({ name: 'Alice', votes: -3 }),
      makePerformance({ name: 'Alice', votes: 5 }),
    ]

    const result = calculateSingerStats(performances, 'Alice')
    expect(result.totalVotes).toBe(12) // 10 + (-3) + 5
  })

  it('counts only completed songs', () => {
    const performances = [
      makePerformance({ name: 'Alice', outcome: { kind: 'completed' } }),
      makePerformance({ name: 'Alice', outcome: { kind: 'completed' } }),
      makePerformance({ name: 'Alice', outcome: { kind: 'skipped', by: 'singer' } }),
      makePerformance({ name: 'Alice', outcome: { kind: 'errored', reason: 'test' } }),
    ]

    const result = calculateSingerStats(performances, 'Alice')
    expect(result.completedSongs).toBe(2)
  })

  it('is case-insensitive', () => {
    const performances = [
      makePerformance({ name: 'alice', votes: 5 }),
      makePerformance({ name: 'ALICE', votes: 3 }),
    ]

    const result = calculateSingerStats(performances, 'Alice')
    expect(result.totalSongs).toBe(2)
    expect(result.totalVotes).toBe(8)
  })
})

describe('getPopularSongs', () => {
  it('returns empty array when no performances', () => {
    const result = getPopularSongs([], 10)
    expect(result).toEqual([])
  })

  it('groups by videoId and counts plays', () => {
    const performances = [
      makePerformance({ videoId: 'vid1', title: 'Song 1' }),
      makePerformance({ videoId: 'vid1', title: 'Song 1' }),
      makePerformance({ videoId: 'vid2', title: 'Song 2' }),
    ]

    const result = getPopularSongs(performances, 10)

    expect(result).toHaveLength(2)
    expect(result.find((s) => s.videoId === 'vid1')?.playCount).toBe(2)
    expect(result.find((s) => s.videoId === 'vid2')?.playCount).toBe(1)
  })

  it('sorts by playCount DESC', () => {
    const performances = [
      makePerformance({ videoId: 'vid1', title: 'Song 1' }),
      makePerformance({ videoId: 'vid2', title: 'Song 2' }),
      makePerformance({ videoId: 'vid2', title: 'Song 2' }),
      makePerformance({ videoId: 'vid3', title: 'Song 3' }),
      makePerformance({ videoId: 'vid3', title: 'Song 3' }),
      makePerformance({ videoId: 'vid3', title: 'Song 3' }),
    ]

    const result = getPopularSongs(performances, 10)

    expect(result.map((s) => s.videoId)).toEqual(['vid3', 'vid2', 'vid1'])
    expect(result.map((s) => s.playCount)).toEqual([3, 2, 1])
  })

  it('respects limit', () => {
    const performances = [
      makePerformance({ videoId: 'vid1' }),
      makePerformance({ videoId: 'vid2' }),
      makePerformance({ videoId: 'vid3' }),
      makePerformance({ videoId: 'vid4' }),
      makePerformance({ videoId: 'vid5' }),
    ]

    const result = getPopularSongs(performances, 3)
    expect(result).toHaveLength(3)
  })

  it('preserves title from first occurrence', () => {
    const performances = [
      makePerformance({ videoId: 'vid1', title: 'Original Title' }),
      makePerformance({ videoId: 'vid1', title: 'Different Title' }),
    ]

    const result = getPopularSongs(performances, 10)
    expect(result[0]?.title).toBe('Original Title')
  })

  it('returns correct SongStats shape', () => {
    const performances = [makePerformance({ videoId: 'vid1', title: 'Test Song' })]

    const result = getPopularSongs(performances, 10)

    expect(result[0]).toEqual({
      videoId: 'vid1',
      title: 'Test Song',
      playCount: 1,
    })
  })
})
