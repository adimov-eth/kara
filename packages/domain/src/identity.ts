/**
 * Generate a random 16-byte salt as hex string
 * Uses Web Crypto API (available in Workers and browsers)
 */
export function generateSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Hash a PIN with a salt using SHA-256
 * Returns hex string
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(salt + pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Verify a PIN against stored hash
 */
export async function verifyPin(
  pin: string,
  salt: string,
  storedHash: string
): Promise<boolean> {
  const computedHash = await hashPin(pin, salt)
  return computedHash === storedHash
}

/**
 * Validate PIN format (6 digits)
 */
export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

/**
 * Normalize name for identity lookups (lowercase)
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
