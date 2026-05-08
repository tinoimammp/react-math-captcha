import { describe, it, expect } from 'vitest'
import { generateChallenge } from './generator.js'

describe('Math Generator', () => {
  it('generates a valid addition challenge', () => {
    const c = generateChallenge({ operators: ['+'] })
    expect(c.operator).toBe('+')
    expect(c.a).toBeGreaterThan(0)
    expect(c.b).toBeGreaterThan(0)
    expect(c.a + c.b).toBeLessThanOrEqual(100)
    expect(c.answer).toBe(c.a + c.b)
    expect(c.display).toBe(`${c.a} + ${c.b}`)
  })

  it('generates a valid subtraction challenge (no negative results)', () => {
    const c = generateChallenge({ operators: ['-'] })
    expect(c.operator).toBe('-')
    expect(c.a).toBeGreaterThan(0)
    expect(c.b).toBeGreaterThan(0)
    expect(c.a).toBeGreaterThanOrEqual(c.b) // Result must be >= 0
    expect(c.answer).toBe(c.a - c.b)
    expect(c.answer).toBeGreaterThanOrEqual(0)
    expect(c.display).toBe(`${c.a} - ${c.b}`)
  })

  it('generates a valid multiplication challenge', () => {
    const c = generateChallenge({ operators: ['*'] })
    expect(c.operator).toBe('*')
    expect(c.a).toBeGreaterThanOrEqual(2)
    expect(c.b).toBeGreaterThanOrEqual(2)
    expect(c.a * c.b).toBeLessThanOrEqual(100)
    expect(c.answer).toBe(c.a * c.b)
    expect(c.display).toBe(`${c.a} × ${c.b}`)
  })

  it('throws if operators array is empty', () => {
    expect(() => generateChallenge({ operators: [] })).toThrow(/empty/)
  })
})
