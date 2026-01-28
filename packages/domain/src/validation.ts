/**
 * Validation functions for user input
 * Returns null if valid, error message if invalid
 */

const NAME_MAX_LENGTH = 30
const TITLE_MAX_LENGTH = 100
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/

export interface ValidationError {
  field: string
  message: string
}

/**
 * Validate a singer/user name
 * - Must be non-empty after trimming
 * - Max 30 characters
 */
export function validateName(name: string | undefined | null): ValidationError | null {
  if (!name || name.trim() === '') {
    return { field: 'name', message: 'Name is required' }
  }
  const trimmed = name.trim()
  if (trimmed.length > NAME_MAX_LENGTH) {
    return { field: 'name', message: `Name must be ${NAME_MAX_LENGTH} characters or less` }
  }
  return null
}

/**
 * Validate a song title
 * - Must be non-empty after trimming
 * - Max 100 characters
 */
export function validateTitle(title: string | undefined | null): ValidationError | null {
  if (!title || title.trim() === '') {
    return { field: 'title', message: 'Title is required' }
  }
  const trimmed = title.trim()
  if (trimmed.length > TITLE_MAX_LENGTH) {
    return { field: 'title', message: `Title must be ${TITLE_MAX_LENGTH} characters or less` }
  }
  return null
}

/**
 * Validate a YouTube video ID
 * - Must be exactly 11 characters
 * - Only alphanumeric, underscore, and hyphen allowed
 */
export function validateVideoId(videoId: string | undefined | null): ValidationError | null {
  if (!videoId) {
    return { field: 'videoId', message: 'Video ID is required' }
  }
  if (!VIDEO_ID_PATTERN.test(videoId)) {
    return { field: 'videoId', message: 'Invalid video ID format' }
  }
  return null
}

/**
 * Sanitize a name by trimming and limiting length
 */
export function sanitizeName(name: string): string {
  return name.trim().slice(0, NAME_MAX_LENGTH)
}

/**
 * Sanitize a title by trimming and limiting length
 */
export function sanitizeTitle(title: string): string {
  return title.trim().slice(0, TITLE_MAX_LENGTH)
}
