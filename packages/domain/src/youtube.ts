import type { SearchResult } from '@karaoke/types'

/**
 * Extract YouTube video ID from various URL formats
 * Pure function
 */
export function extractVideoId(url: string | null | undefined): string | null {
  if (!url) return null
  const normalizedUrl = url.trim()

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*&v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /music\.youtube\.com\/watch\?.*&v=([a-zA-Z0-9_-]{11})/,
    /m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /m\.youtube\.com\/watch\?.*&v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ]

  for (const pattern of patterns) {
    const match = normalizedUrl.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

/**
 * Build a YouTube URL from a video ID
 */
export function buildYoutubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

/**
 * Build a YouTube embed URL from a video ID
 */
export function buildEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`
}

/**
 * Parse duration string (e.g., "3:45" or "1:23:45") to seconds
 */
export function parseDuration(durationText: string): number {
  const parts = durationText.split(':').map(Number)

  if (parts.length === 2) {
    const [minutes, seconds] = parts
    return (minutes ?? 0) * 60 + (seconds ?? 0)
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts
    return (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0)
  }

  return 0
}

/**
 * Parse YouTube's internal API response to extract video search results
 * Pure function
 */
export function parseSearchResponse(data: unknown): SearchResult[] {
  const videos: SearchResult[] = []

  try {
    const contents =
      (data as Record<string, unknown>)?.contents as Record<string, unknown> | undefined
    const twoColumn = contents?.twoColumnSearchResultsRenderer as Record<string, unknown> | undefined
    const primary = twoColumn?.primaryContents as Record<string, unknown> | undefined
    const sectionList = primary?.sectionListRenderer as Record<string, unknown> | undefined
    const sections = (sectionList?.contents as unknown[]) ?? []

    for (const section of sections) {
      const itemSection = (section as Record<string, unknown>)?.itemSectionRenderer as
        | Record<string, unknown>
        | undefined
      const items = (itemSection?.contents as unknown[]) ?? []

      for (const item of items) {
        const video = (item as Record<string, unknown>)?.videoRenderer as
          | Record<string, unknown>
          | undefined
        if (!video) continue

        const videoId = video.videoId as string | undefined
        if (!videoId) continue

        const lengthText = video.lengthText as Record<string, unknown> | undefined
        const durationText = (lengthText?.simpleText as string) ?? ''

        // Skip livestreams (no duration) and very long videos
        if (!durationText || durationText.includes('LIVE')) continue

        const durationSeconds = parseDuration(durationText)

        const titleRuns = (video.title as Record<string, unknown>)?.runs as
          | Array<Record<string, unknown>>
          | undefined
        const ownerRuns = (video.ownerText as Record<string, unknown>)?.runs as
          | Array<Record<string, unknown>>
          | undefined
        const thumbnails = (video.thumbnail as Record<string, unknown>)?.thumbnails as
          | Array<Record<string, unknown>>
          | undefined

        videos.push({
          id: videoId,
          title: (titleRuns?.[0]?.text as string) ?? 'Unknown Title',
          channel: (ownerRuns?.[0]?.text as string) ?? 'Unknown Channel',
          duration: durationText,
          durationSeconds,
          thumbnail: (thumbnails?.[0]?.url as string) ?? '',
          source: 'youtube',
          playable: true, // Assume playable; extension can verify later
        })

        // Limit to 10 results
        if (videos.length >= 10) break
      }

      if (videos.length >= 10) break
    }
  } catch {
    // Return empty array on parse error
  }

  return videos
}
