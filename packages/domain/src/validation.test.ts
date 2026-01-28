import { describe, it, expect } from 'vitest'
import {
  validateName,
  validateTitle,
  validateVideoId,
  sanitizeName,
  sanitizeTitle,
} from './validation'

describe('validateName', () => {
  it('returns error for empty name', () => {
    expect(validateName('')).toEqual({ field: 'name', message: 'Name is required' })
    expect(validateName('   ')).toEqual({ field: 'name', message: 'Name is required' })
  })

  it('returns error for null/undefined', () => {
    expect(validateName(null)).toEqual({ field: 'name', message: 'Name is required' })
    expect(validateName(undefined)).toEqual({ field: 'name', message: 'Name is required' })
  })

  it('returns error for name over 30 characters', () => {
    const longName = 'a'.repeat(31)
    expect(validateName(longName)).toEqual({
      field: 'name',
      message: 'Name must be 30 characters or less',
    })
  })

  it('returns null for valid names', () => {
    expect(validateName('Alice')).toBeNull()
    expect(validateName('Bob Smith')).toBeNull()
    expect(validateName('a'.repeat(30))).toBeNull()
    expect(validateName('  trimmed  ')).toBeNull()
  })
})

describe('validateTitle', () => {
  it('returns error for empty title', () => {
    expect(validateTitle('')).toEqual({ field: 'title', message: 'Title is required' })
    expect(validateTitle('   ')).toEqual({ field: 'title', message: 'Title is required' })
  })

  it('returns error for null/undefined', () => {
    expect(validateTitle(null)).toEqual({ field: 'title', message: 'Title is required' })
    expect(validateTitle(undefined)).toEqual({ field: 'title', message: 'Title is required' })
  })

  it('returns error for title over 100 characters', () => {
    const longTitle = 'a'.repeat(101)
    expect(validateTitle(longTitle)).toEqual({
      field: 'title',
      message: 'Title must be 100 characters or less',
    })
  })

  it('returns null for valid titles', () => {
    expect(validateTitle('Never Gonna Give You Up')).toBeNull()
    expect(validateTitle('a'.repeat(100))).toBeNull()
  })
})

describe('validateVideoId', () => {
  it('returns error for empty videoId', () => {
    expect(validateVideoId('')).toEqual({ field: 'videoId', message: 'Video ID is required' })
    expect(validateVideoId(null)).toEqual({ field: 'videoId', message: 'Video ID is required' })
    expect(validateVideoId(undefined)).toEqual({ field: 'videoId', message: 'Video ID is required' })
  })

  it('returns error for invalid format', () => {
    // Too short
    expect(validateVideoId('abc123')).toEqual({
      field: 'videoId',
      message: 'Invalid video ID format',
    })
    // Too long
    expect(validateVideoId('dQw4w9WgXcQQ')).toEqual({
      field: 'videoId',
      message: 'Invalid video ID format',
    })
    // Invalid characters
    expect(validateVideoId('dQw4w9WgXc!')).toEqual({
      field: 'videoId',
      message: 'Invalid video ID format',
    })
  })

  it('returns null for valid video IDs', () => {
    expect(validateVideoId('dQw4w9WgXcQ')).toBeNull()
    expect(validateVideoId('abc123_-ABC')).toBeNull()
    expect(validateVideoId('-----------')).toBeNull()
    expect(validateVideoId('___________')).toBeNull()
  })
})

describe('sanitizeName', () => {
  it('trims whitespace', () => {
    expect(sanitizeName('  Alice  ')).toBe('Alice')
  })

  it('limits to 30 characters', () => {
    const longName = 'a'.repeat(50)
    expect(sanitizeName(longName)).toBe('a'.repeat(30))
  })

  it('preserves valid names', () => {
    expect(sanitizeName('Bob')).toBe('Bob')
  })
})

describe('sanitizeTitle', () => {
  it('trims whitespace', () => {
    expect(sanitizeTitle('  Song Title  ')).toBe('Song Title')
  })

  it('limits to 100 characters', () => {
    const longTitle = 'a'.repeat(150)
    expect(sanitizeTitle(longTitle)).toBe('a'.repeat(100))
  })

  it('preserves valid titles', () => {
    expect(sanitizeTitle('Never Gonna Give You Up')).toBe('Never Gonna Give You Up')
  })
})
