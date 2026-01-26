import type { Entry, Performance, Song } from '@karaoke/types'

/**
 * Create a performance record from a completed/skipped entry
 * Pure function - id and timestamp are injected
 */
export function createPerformance(
  entry: Entry,
  completed: boolean,
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
    completed,
  }
}

/**
 * Update song statistics with a new performance
 * Pure function - returns new Song object
 */
export function updateSongStats(
  existing: Song | null,
  performance: Performance
): Song {
  if (!existing) {
    // First play of this song
    return {
      videoId: performance.videoId,
      title: performance.title,
      timesPlayed: 1,
      timesCompleted: performance.completed ? 1 : 0,
      totalVotes: performance.votes,
      avgVotes: performance.votes,
      completionRate: performance.completed ? 1 : 0,
      lastPlayedAt: performance.performedAt,
      firstPlayedAt: performance.performedAt,
    }
  }

  const timesPlayed = existing.timesPlayed + 1
  const timesCompleted = existing.timesCompleted + (performance.completed ? 1 : 0)
  const totalVotes = existing.totalVotes + performance.votes

  return {
    videoId: existing.videoId,
    title: performance.title, // Use latest title in case it changed
    timesPlayed,
    timesCompleted,
    totalVotes,
    avgVotes: totalVotes / timesPlayed,
    completionRate: timesCompleted / timesPlayed,
    lastPlayedAt: performance.performedAt,
    firstPlayedAt: existing.firstPlayedAt,
  }
}

/**
 * Calculate popularity score for a song
 * Used for ranking songs in the library
 * Formula: (timesPlayed * 0.3) + (avgVotes * 0.5) + (completionRate * 10 * 0.2)
 */
export function calculatePopularity(song: Song): number {
  return (
    song.timesPlayed * 0.3 +
    song.avgVotes * 0.5 +
    song.completionRate * 10 * 0.2
  )
}

/**
 * Check if this is the first performance for a given name
 */
export function isFirstPerformance(
  performances: readonly Performance[],
  name: string
): boolean {
  const nameLower = name.toLowerCase()
  return !performances.some(
    (p) => p.name.toLowerCase() === nameLower && p.completed
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
    completedSongs: userPerformances.filter((p) => p.completed).length,
  }
}
