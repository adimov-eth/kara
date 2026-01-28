import type { Entry, Performance, PerformanceOutcome, SongStats } from '@karaoke/types'

/**
 * Create a performance record from a completed/skipped entry
 * Pure function - id and timestamp are injected
 */
export function createPerformance(
  entry: Entry,
  outcome: PerformanceOutcome,
  id: string,
  timestamp: number
): Performance {
  return {
    id,
    name: entry.name,
    videoId: entry.videoId,
    title: entry.title,
    performedAt: timestamp,
    votes: entry.votes,
    outcome,
  }
}

/**
 * Get popular songs derived from performance history
 * Ranked by play count (demand signal, not votes)
 */
export function getPopularSongs(
  performances: readonly Performance[],
  limit: number
): SongStats[] {
  const counts = new Map<string, SongStats>()

  for (const p of performances) {
    const existing = counts.get(p.videoId)
    if (existing) {
      counts.set(p.videoId, { ...existing, playCount: existing.playCount + 1 })
    } else {
      counts.set(p.videoId, { videoId: p.videoId, title: p.title, playCount: 1 })
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, limit)
}

/**
 * Check if this is the first completed performance for a given name
 */
export function isFirstPerformance(
  performances: readonly Performance[],
  name: string
): boolean {
  const nameLower = name.toLowerCase()
  return !performances.some(
    (p) => p.name.toLowerCase() === nameLower && p.outcome.kind === 'completed'
  )
}

/**
 * Get performance history for a name
 */
export function getPerformanceHistory(
  performances: readonly Performance[],
  name: string
): Performance[] {
  const nameLower = name.toLowerCase()
  return performances
    .filter((p) => p.name.toLowerCase() === nameLower)
    .sort((a, b) => b.performedAt - a.performedAt)
}

/**
 * Calculate stats for a singer
 */
export function calculateSingerStats(
  performances: readonly Performance[],
  name: string
): { totalSongs: number; totalVotes: number; completedSongs: number } {
  const nameLower = name.toLowerCase()
  const userPerformances = performances.filter(
    (p) => p.name.toLowerCase() === nameLower
  )

  return {
    totalSongs: userPerformances.length,
    totalVotes: userPerformances.reduce((sum, p) => sum + p.votes, 0),
    completedSongs: userPerformances.filter((p) => p.outcome.kind === 'completed').length,
  }
}
