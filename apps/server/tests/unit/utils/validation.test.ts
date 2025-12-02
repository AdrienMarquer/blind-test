import { describe, test, expect } from 'bun:test'
import { validatePlayerName } from '@blind-test/shared'

describe('validatePlayerName', () => {
  test('accepts simple ascii names', () => {
    expect(validatePlayerName('Alice')).toBe(true)
    expect(validatePlayerName('Bob 42')).toBe(true)
  })

  test('accepts names with accents and apostrophes', () => {
    expect(validatePlayerName('Élodie')).toBe(true)
    expect(validatePlayerName("Andréa")).toBe(true)
    expect(validatePlayerName("O'Connor")).toBe(true)
  })

  test('accepts names with non latin scripts', () => {
    expect(validatePlayerName('Łukasz')).toBe(true)
    expect(validatePlayerName('Мария')).toBe(true)
  })

  test('accepts special characters (permissive validation)', () => {
    expect(validatePlayerName('Player!')).toBe(true)
    expect(validatePlayerName('Name@')).toBe(true)
    expect(validatePlayerName('DJ_Cool')).toBe(true)
    expect(validatePlayerName('🎵 Music 🎵')).toBe(true)
    expect(validatePlayerName('Winner!!!')).toBe(true)
  })

  test('rejects angle brackets (XSS prevention)', () => {
    expect(validatePlayerName('<script>')).toBe(false)
    expect(validatePlayerName('Player<')).toBe(false)
    expect(validatePlayerName('Name>')).toBe(false)
  })

  test('enforces length constraints', () => {
    expect(validatePlayerName('')).toBe(false)
    expect(validatePlayerName('a'.repeat(21))).toBe(false)
  })
})
