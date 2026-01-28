import { describe, it, expect } from 'vitest'
import {
  extractVideoId,
  buildYoutubeUrl,
  buildEmbedUrl,
  parseDuration,
  parseSearchResponse,
} from './youtube.js'

describe('extractVideoId', () => {
  it('returns null for invalid input', () => {
    expect(extractVideoId(null)).toBeNull()
    expect(extractVideoId(undefined)).toBeNull()
    expect(extractVideoId('')).toBeNull()
  })

  it('extracts from standard watch URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts from short youtu.be URL', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts from embed URL', () => {
    expect(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts from shorts URL', () => {
    expect(extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts from music.youtube.com URL', () => {
    expect(extractVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts from m.youtube.com URL', () => {
    expect(extractVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts from /v/ URL format', () => {
    expect(extractVideoId('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts with additional query parameters', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120')).toBe('dQw4w9WgXcQ')
    expect(extractVideoId('https://www.youtube.com/watch?list=PLabc&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('handles whitespace around URL', () => {
    expect(extractVideoId('  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ')
  })

  it('returns null for invalid URLs', () => {
    expect(extractVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(extractVideoId('not a url')).toBeNull()
    expect(extractVideoId('https://www.youtube.com/watch')).toBeNull()
  })

  it('handles video IDs with underscores and hyphens', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=abc_123-XYZ')).toBe('abc_123-XYZ')
  })
})

describe('buildYoutubeUrl', () => {
  it('builds standard watch URL from video ID', () => {
    expect(buildYoutubeUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })
})

describe('buildEmbedUrl', () => {
  it('builds embed URL from video ID', () => {
    expect(buildEmbedUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
  })
})

describe('parseDuration', () => {
  it('parses MM:SS format', () => {
    expect(parseDuration('3:45')).toBe(225) // 3*60 + 45
    expect(parseDuration('0:30')).toBe(30)
    expect(parseDuration('10:00')).toBe(600)
  })

  it('parses HH:MM:SS format', () => {
    expect(parseDuration('1:23:45')).toBe(5025) // 1*3600 + 23*60 + 45
    expect(parseDuration('2:00:00')).toBe(7200)
    expect(parseDuration('0:05:30')).toBe(330)
  })

  it('returns 0 for invalid format', () => {
    expect(parseDuration('')).toBe(0)
    expect(parseDuration('invalid')).toBe(0)
    expect(parseDuration('1:2:3:4')).toBe(0) // too many parts
  })

  it('handles single digit components', () => {
    expect(parseDuration('1:05')).toBe(65)
    expect(parseDuration('0:09')).toBe(9)
  })
})

describe('parseSearchResponse', () => {
  it('returns empty array for invalid input', () => {
    expect(parseSearchResponse(null)).toEqual([])
    expect(parseSearchResponse(undefined)).toEqual([])
    expect(parseSearchResponse({})).toEqual([])
    expect(parseSearchResponse({ contents: {} })).toEqual([])
  })

  it('parses valid YouTube API response structure', () => {
    const mockResponse = {
      contents: {
        twoColumnSearchResultsRenderer: {
          primaryContents: {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: [
                      {
                        videoRenderer: {
                          videoId: 'abc123',
                          title: { runs: [{ text: 'Test Video' }] },
                          ownerText: { runs: [{ text: 'Test Channel' }] },
                          lengthText: { simpleText: '3:45' },
                          thumbnail: { thumbnails: [{ url: 'https://example.com/thumb.jpg' }] },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    }

    const results = parseSearchResponse(mockResponse)

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      id: 'abc123',
      title: 'Test Video',
      channel: 'Test Channel',
      duration: '3:45',
      durationSeconds: 225,
      thumbnail: 'https://example.com/thumb.jpg',
      source: 'youtube',
      playable: true,
    })
  })

  it('skips videos without duration (livestreams)', () => {
    const mockResponse = {
      contents: {
        twoColumnSearchResultsRenderer: {
          primaryContents: {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: [
                      {
                        videoRenderer: {
                          videoId: 'live123',
                          title: { runs: [{ text: 'Live Stream' }] },
                          // No lengthText = livestream
                        },
                      },
                      {
                        videoRenderer: {
                          videoId: 'normal123',
                          title: { runs: [{ text: 'Normal Video' }] },
                          lengthText: { simpleText: '2:00' },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    }

    const results = parseSearchResponse(mockResponse)
    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe('normal123')
  })

  it('skips LIVE indicator videos', () => {
    const mockResponse = {
      contents: {
        twoColumnSearchResultsRenderer: {
          primaryContents: {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: [
                      {
                        videoRenderer: {
                          videoId: 'live123',
                          title: { runs: [{ text: 'Live Video' }] },
                          lengthText: { simpleText: 'LIVE' },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    }

    const results = parseSearchResponse(mockResponse)
    expect(results).toEqual([])
  })

  it('limits to 10 results', () => {
    const videos = Array.from({ length: 15 }, (_, i) => ({
      videoRenderer: {
        videoId: `vid${i}`,
        title: { runs: [{ text: `Video ${i}` }] },
        lengthText: { simpleText: '1:00' },
      },
    }))

    const mockResponse = {
      contents: {
        twoColumnSearchResultsRenderer: {
          primaryContents: {
            sectionListRenderer: {
              contents: [{ itemSectionRenderer: { contents: videos } }],
            },
          },
        },
      },
    }

    const results = parseSearchResponse(mockResponse)
    expect(results).toHaveLength(10)
  })

  it('handles missing optional fields with defaults', () => {
    const mockResponse = {
      contents: {
        twoColumnSearchResultsRenderer: {
          primaryContents: {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: [
                      {
                        videoRenderer: {
                          videoId: 'abc123',
                          lengthText: { simpleText: '1:00' },
                          // Missing: title, ownerText, thumbnail
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    }

    const results = parseSearchResponse(mockResponse)
    expect(results[0]).toEqual({
      id: 'abc123',
      title: 'Unknown Title',
      channel: 'Unknown Channel',
      duration: '1:00',
      durationSeconds: 60,
      thumbnail: '',
      source: 'youtube',
      playable: true,
    })
  })

  it('skips non-video items', () => {
    const mockResponse = {
      contents: {
        twoColumnSearchResultsRenderer: {
          primaryContents: {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: [
                      { channelRenderer: { channelId: 'ch123' } }, // channel, not video
                      { playlistRenderer: { playlistId: 'pl123' } }, // playlist, not video
                      {
                        videoRenderer: {
                          videoId: 'vid123',
                          title: { runs: [{ text: 'Actual Video' }] },
                          lengthText: { simpleText: '2:30' },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    }

    const results = parseSearchResponse(mockResponse)
    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe('vid123')
  })
})
