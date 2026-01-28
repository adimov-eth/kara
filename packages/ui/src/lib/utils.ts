/**
 * Safely parse JSON with a fallback value
 * Handles null/undefined input and parse errors gracefully
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}
