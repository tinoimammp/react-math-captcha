import { describe, it, expect, beforeAll } from 'vitest'
import { seal, open, TokenOpenError } from './crypto.js'

describe('Crypto JWE', () => {
  beforeAll(() => {
    // Mock env secret
    process.env.CAPTCHA_SECRET = '12345678901234567890123456789012'
  })

  it('seals and opens data seamlessly', async () => {
    const payload = { userId: 123, role: 'admin' }
    const token = await seal(payload)
    
    expect(typeof token).toBe('string')
    expect(token.split('.').length).toBe(5) // JWE has 5 parts

    const opened = await open(token)
    expect(opened).toEqual(expect.objectContaining(payload))
  })

  it('throws on tampered token', async () => {
    const token = await seal({ test: true })
    const tampered = token.slice(0, -5) + 'abcde'

    await expect(open(tampered)).rejects.toThrow(TokenOpenError)
    await expect(open(tampered)).rejects.toMatchObject({ reason: 'invalid' })
  })

  it('respects expiration', async () => {
    const token = await seal({ test: true }, { expiresInSec: -1 }) // Expired in the past

    await expect(open(token)).rejects.toThrow(TokenOpenError)
    await expect(open(token)).rejects.toMatchObject({ reason: 'expired' })
  })

  it('respects audience (scope)', async () => {
    const token = await seal({ test: true }, { audience: 'login' })
    
    // Valid audience
    await expect(open(token, { audience: 'login' })).resolves.toBeDefined()
    
    // Invalid audience
    await expect(open(token, { audience: 'register' })).rejects.toThrow(TokenOpenError)
    await expect(open(token, { audience: 'register' })).rejects.toMatchObject({ reason: 'audience' })
  })
})
