import { describe, it, expect } from 'vitest'
import {
  isValidPin,
  hashPin,
  verifyPin,
  generateSalt,
  normalizeName,
} from './identity.js'

describe('isValidPin', () => {
  it('returns true for 6-digit PIN', () => {
    expect(isValidPin('123456')).toBe(true)
    expect(isValidPin('000000')).toBe(true)
    expect(isValidPin('999999')).toBe(true)
  })

  it('returns false for PIN too short', () => {
    expect(isValidPin('12345')).toBe(false)
    expect(isValidPin('1')).toBe(false)
    expect(isValidPin('')).toBe(false)
  })

  it('returns false for PIN too long', () => {
    expect(isValidPin('1234567')).toBe(false)
    expect(isValidPin('12345678901234')).toBe(false)
  })

  it('returns false for non-digit characters', () => {
    expect(isValidPin('12345a')).toBe(false)
    expect(isValidPin('abcdef')).toBe(false)
    expect(isValidPin('123 56')).toBe(false)
    expect(isValidPin('12-456')).toBe(false)
  })
})

describe('generateSalt', () => {
  it('returns a 32-character hex string', () => {
    const salt = generateSalt()
    expect(salt).toHaveLength(32)
    expect(salt).toMatch(/^[0-9a-f]{32}$/)
  })

  it('returns different values on each call', () => {
    const salt1 = generateSalt()
    const salt2 = generateSalt()
    const salt3 = generateSalt()

    expect(salt1).not.toBe(salt2)
    expect(salt2).not.toBe(salt3)
    expect(salt1).not.toBe(salt3)
  })
})

describe('hashPin', () => {
  it('returns a 64-character hex string (SHA-256)', async () => {
    const hash = await hashPin('123456', 'somesalt')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns same hash for same PIN and salt', async () => {
    const salt = 'testsalt123'
    const hash1 = await hashPin('123456', salt)
    const hash2 = await hashPin('123456', salt)

    expect(hash1).toBe(hash2)
  })

  it('returns different hash for different PINs', async () => {
    const salt = 'testsalt123'
    const hash1 = await hashPin('123456', salt)
    const hash2 = await hashPin('654321', salt)

    expect(hash1).not.toBe(hash2)
  })

  it('returns different hash for different salts', async () => {
    const hash1 = await hashPin('123456', 'salt1')
    const hash2 = await hashPin('123456', 'salt2')

    expect(hash1).not.toBe(hash2)
  })
})

describe('verifyPin', () => {
  it('returns true for correct PIN', async () => {
    const salt = 'testsalt123'
    const hash = await hashPin('123456', salt)

    const result = await verifyPin('123456', salt, hash)
    expect(result).toBe(true)
  })

  it('returns false for wrong PIN', async () => {
    const salt = 'testsalt123'
    const hash = await hashPin('123456', salt)

    const result = await verifyPin('654321', salt, hash)
    expect(result).toBe(false)
  })

  it('returns false for wrong salt', async () => {
    const hash = await hashPin('123456', 'correctsalt')

    const result = await verifyPin('123456', 'wrongsalt', hash)
    expect(result).toBe(false)
  })

  it('works with generateSalt output', async () => {
    const salt = generateSalt()
    const pin = '987654'
    const hash = await hashPin(pin, salt)

    expect(await verifyPin(pin, salt, hash)).toBe(true)
    expect(await verifyPin('000000', salt, hash)).toBe(false)
  })
})

describe('normalizeName', () => {
  it('lowercases the name', () => {
    expect(normalizeName('Alice')).toBe('alice')
    expect(normalizeName('ALICE')).toBe('alice')
    expect(normalizeName('aLiCe')).toBe('alice')
  })

  it('trims whitespace', () => {
    expect(normalizeName('  ALICE  ')).toBe('alice')
    expect(normalizeName('\tBob\n')).toBe('bob')
    expect(normalizeName('   ')).toBe('')
  })
})
