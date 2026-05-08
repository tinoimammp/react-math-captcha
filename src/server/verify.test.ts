import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { CaptchaError } from '../core/errors.js'
import { issueVerificationToken, issueChallengeToken } from '../core/tokens.js'
import {
  encodeSession,
  SESSION_COOKIE_NAME,
  type SessionData,
} from '../core/session.js'

// In-memory cookie jar that mimics the shape of next/headers' cookies()
// store. We replace the real `next/headers` module with this mock so we can
// drive the verify flow without spinning up a Next runtime.
interface StoredCookie {
  value: string
}
const cookieStore = new Map<string, StoredCookie>()
const setCalls: Array<{ name: string; value: string }> = []

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => cookieStore.get(name),
    set: (opts: { name: string; value: string }) => {
      setCalls.push({ name: opts.name, value: opts.value })
      cookieStore.set(opts.name, { value: opts.value })
    },
  }),
}))

// Import AFTER the mock is registered.
import { verifyCaptchaToken } from './verify.js'

async function seedSession(session: SessionData): Promise<void> {
  const encoded = await encodeSession(session)
  cookieStore.set(SESSION_COOKIE_NAME, { value: encoded })
}

describe('verifyCaptchaToken', () => {
  beforeAll(() => {
    process.env.CAPTCHA_SECRET = '12345678901234567890123456789012'
  })

  beforeEach(() => {
    cookieStore.clear()
    setCalls.length = 0
  })

  it('throws VERIFICATION_TOKEN_MISSING when no token provided', async () => {
    await expect(verifyCaptchaToken(null)).rejects.toMatchObject({
      code: 'VERIFICATION_TOKEN_MISSING',
    })
    await expect(verifyCaptchaToken(undefined)).rejects.toMatchObject({
      code: 'VERIFICATION_TOKEN_MISSING',
    })
    await expect(verifyCaptchaToken('')).rejects.toMatchObject({
      code: 'VERIFICATION_TOKEN_MISSING',
    })
  })

  it('extracts token from FormData using default field name', async () => {
    const jti = 'jti-form-1'
    const token = await issueVerificationToken(jti, 'global', 30)
    await seedSession({
      v: 1,
      attempts: 0,
      reloads: 0,
      verification: { jti, scope: 'global', expiresAt: Date.now() + 30_000 },
    })

    const fd = new FormData()
    fd.set('captchaToken', token)

    await expect(verifyCaptchaToken(fd)).resolves.toBeUndefined()
  })

  it('extracts token from FormData using custom inputName', async () => {
    const jti = 'jti-form-2'
    const token = await issueVerificationToken(jti, 'global', 30)
    await seedSession({
      v: 1,
      attempts: 0,
      reloads: 0,
      verification: { jti, scope: 'global', expiresAt: Date.now() + 30_000 },
    })

    const fd = new FormData()
    fd.set('myCaptcha', token)

    await expect(
      verifyCaptchaToken(fd, 'global', { inputName: 'myCaptcha' }),
    ).resolves.toBeUndefined()
  })

  it('throws VERIFICATION_TOKEN_MISSING when FormData lacks the field', async () => {
    const fd = new FormData()
    fd.set('email', 'test@example.com')
    await expect(verifyCaptchaToken(fd)).rejects.toMatchObject({
      code: 'VERIFICATION_TOKEN_MISSING',
    })
  })

  it('throws VERIFICATION_TOKEN_INVALID for malformed token string', async () => {
    await expect(verifyCaptchaToken('garbage-token')).rejects.toMatchObject({
      code: 'VERIFICATION_TOKEN_INVALID',
    })
  })

  it('throws VERIFICATION_TOKEN_EXPIRED when token TTL elapsed', async () => {
    // Token is sealed with negative TTL, so jose itself reports it as
    // expired during decryption — that path maps to VERIFICATION_TOKEN_EXPIRED.
    const token = await issueVerificationToken('jti-x', 'global', -1)
    await expect(verifyCaptchaToken(token)).rejects.toMatchObject({
      code: 'VERIFICATION_TOKEN_EXPIRED',
    })
  })

  it('throws VERIFICATION_SCOPE_MISMATCH when scope does not match', async () => {
    const jti = 'jti-scope'
    const token = await issueVerificationToken(jti, 'login', 30)
    await seedSession({
      v: 1,
      attempts: 0,
      reloads: 0,
      verification: { jti, scope: 'login', expiresAt: Date.now() + 30_000 },
    })
    await expect(verifyCaptchaToken(token, 'register')).rejects.toMatchObject({
      code: 'VERIFICATION_SCOPE_MISMATCH',
    })
  })

  it('throws VERIFICATION_TOKEN_INVALID when session has no matching record', async () => {
    // Token cryptographically valid, but no session has been started — so
    // the server has no record of issuing it. Replay defence.
    const token = await issueVerificationToken('jti-orphan', 'global', 30)
    await expect(verifyCaptchaToken(token)).rejects.toMatchObject({
      code: 'VERIFICATION_TOKEN_INVALID',
    })
  })

  it('throws VERIFICATION_TOKEN_INVALID when jti does not match session', async () => {
    // Token's jti doesn't match what the session recorded — typical of a
    // token from a previous session being replayed.
    const token = await issueVerificationToken('jti-A', 'global', 30)
    await seedSession({
      v: 1,
      attempts: 0,
      reloads: 0,
      verification: { jti: 'jti-B', scope: 'global', expiresAt: Date.now() + 30_000 },
    })
    await expect(verifyCaptchaToken(token)).rejects.toMatchObject({
      code: 'VERIFICATION_TOKEN_INVALID',
    })
  })

  it('throws VERIFICATION_TOKEN_EXPIRED when session record has elapsed', async () => {
    // The jose-level token can outlive the server's record (it's sealed
    // with TTL >= the record's TTL in some configs). When the record itself
    // is past expiresAt we must reject — even if the token decrypts fine.
    const jti = 'jti-stale'
    const token = await issueVerificationToken(jti, 'global', 30)
    await seedSession({
      v: 1,
      attempts: 0,
      reloads: 0,
      verification: { jti, scope: 'global', expiresAt: Date.now() - 1 },
    })
    await expect(verifyCaptchaToken(token)).rejects.toMatchObject({
      code: 'VERIFICATION_TOKEN_EXPIRED',
    })
  })

  it('rejects a challenge token (audience mismatch) as INVALID', async () => {
    // A challenge token must never pass form-side verification — it has the
    // wrong audience. This pins down cross-flow isolation at the public API.
    const challenge = await issueChallengeToken('cjti', 30)
    await expect(verifyCaptchaToken(challenge)).rejects.toMatchObject({
      code: 'VERIFICATION_TOKEN_INVALID',
    })
  })

  it('consumes the verification record on success (replay protection)', async () => {
    const jti = 'jti-once'
    const token = await issueVerificationToken(jti, 'global', 30)
    await seedSession({
      v: 1,
      attempts: 0,
      reloads: 0,
      verification: { jti, scope: 'global', expiresAt: Date.now() + 30_000 },
    })

    // First call succeeds.
    await expect(verifyCaptchaToken(token)).resolves.toBeUndefined()

    // The handler must have written a fresh cookie (with verification cleared).
    expect(setCalls.length).toBeGreaterThan(0)
    expect(setCalls[setCalls.length - 1]!.name).toBe(SESSION_COOKIE_NAME)

    // Second call with the same token must now fail — replay defence.
    await expect(verifyCaptchaToken(token)).rejects.toMatchObject({
      code: 'VERIFICATION_TOKEN_INVALID',
    })
  })

  it('throws SESSION_LOCKED when session is locked, even if token is otherwise valid', async () => {
    // Threat model: a user solves the captcha, banks the verification token,
    // then triggers enough wrong answers to lock the session before
    // submitting the form. The token is still cryptographically valid and
    // its session record still matches — but accepting it would defeat the
    // lock. Verify the form-side check refuses with SESSION_LOCKED.
    const jti = 'jti-locked'
    const token = await issueVerificationToken(jti, 'global', 30)
    await seedSession({
      v: 1,
      attempts: 5,
      reloads: 0,
      lockedUntil: Date.now() + 60_000, // currently locked
      verification: { jti, scope: 'global', expiresAt: Date.now() + 30_000 },
    })

    let caught: unknown
    try {
      await verifyCaptchaToken(token)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(CaptchaError)
    expect(caught).toMatchObject({
      code: 'SESSION_LOCKED',
      status: 429,
    })
  })

  it('accepts the token once the lock has elapsed', async () => {
    // Companion test to the one above: a stale lockedUntil (in the past)
    // must NOT block verification. The lock has already lifted.
    const jti = 'jti-elapsed'
    const token = await issueVerificationToken(jti, 'global', 30)
    await seedSession({
      v: 1,
      attempts: 5,
      reloads: 0,
      lockedUntil: Date.now() - 1, // already elapsed
      verification: { jti, scope: 'global', expiresAt: Date.now() + 30_000 },
    })

    await expect(verifyCaptchaToken(token)).resolves.toBeUndefined()
  })

  it('failed verifications are CaptchaError instances (for instanceof checks)', async () => {
    // Documented pattern in README: `if (err instanceof CaptchaError) ...`.
    // Make sure that contract holds across every failure branch.
    let caught: unknown
    try {
      await verifyCaptchaToken('not-a-token')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(CaptchaError)
  })
})