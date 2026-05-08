import { describe, it, expect, beforeAll } from 'vitest'
import {
  issueChallengeToken,
  readChallengeToken,
  issueVerificationToken,
  readVerificationToken,
  issueRevealToken,
  readRevealToken,
} from './tokens.js'
import { CaptchaError } from './errors.js'
import { seal } from './crypto.js'

describe('Token system', () => {
  beforeAll(() => {
    process.env.CAPTCHA_SECRET = '12345678901234567890123456789012'
  })

  describe('Challenge token', () => {
    it('issues and reads a valid token', async () => {
      const token = await issueChallengeToken('jti-123', 30)
      const payload = await readChallengeToken(token)
      expect(payload.jti).toBe('jti-123')
    })

    it('maps expired token to CHALLENGE_TOKEN_EXPIRED', async () => {
      const token = await issueChallengeToken('jti-123', -1) // already expired
      await expect(readChallengeToken(token)).rejects.toMatchObject({
        code: 'CHALLENGE_TOKEN_EXPIRED',
        status: 400,
      })
    })

    it('maps tampered token to CHALLENGE_TOKEN_INVALID', async () => {
      const token = await issueChallengeToken('jti-123', 30)
      const tampered = token.slice(0, -5) + 'aaaaa'
      await expect(readChallengeToken(tampered)).rejects.toMatchObject({
        code: 'CHALLENGE_TOKEN_INVALID',
      })
    })

    it('rejects a token with wrong audience (e.g. verification token)', async () => {
      // A verification token is sealed with audience 'rmc:verification' —
      // reading it as a challenge token must fail with CHALLENGE_TOKEN_INVALID,
      // never accidentally succeed. This guards against cross-flow replay.
      const verToken = await issueVerificationToken('vjti', 'login', 30)
      await expect(readChallengeToken(verToken)).rejects.toBeInstanceOf(CaptchaError)
      await expect(readChallengeToken(verToken)).rejects.toMatchObject({
        code: 'CHALLENGE_TOKEN_INVALID',
      })
    })

    it('rejects a payload missing jti', async () => {
      // Forge a token with the right audience but missing jti claim. The
      // crypto layer will accept it (signature valid), but the read helper
      // must reject the malformed payload.
      const token = await seal({ notJti: 'oops' }, { audience: 'rmc:challenge', expiresInSec: 30 })
      await expect(readChallengeToken(token)).rejects.toMatchObject({
        code: 'CHALLENGE_TOKEN_INVALID',
      })
    })
  })

  describe('Verification token', () => {
    it('issues and reads a valid token', async () => {
      const token = await issueVerificationToken('jti-456', 'register', 30)
      const payload = await readVerificationToken(token)
      expect(payload.jti).toBe('jti-456')
      expect(payload.scope).toBe('register')
    })

    it('maps expired token to VERIFICATION_TOKEN_EXPIRED', async () => {
      const token = await issueVerificationToken('jti-456', 'login', -1)
      await expect(readVerificationToken(token)).rejects.toMatchObject({
        code: 'VERIFICATION_TOKEN_EXPIRED',
      })
    })

    it('maps invalid token to VERIFICATION_TOKEN_INVALID', async () => {
      await expect(readVerificationToken('not-a-real-token')).rejects.toMatchObject({
        code: 'VERIFICATION_TOKEN_INVALID',
      })
    })

    it('rejects a challenge token (audience mismatch)', async () => {
      const challengeToken = await issueChallengeToken('cjti', 30)
      await expect(readVerificationToken(challengeToken)).rejects.toMatchObject({
        code: 'VERIFICATION_TOKEN_INVALID',
      })
    })

    it('rejects a payload missing scope', async () => {
      const token = await seal({ jti: 'x' }, { audience: 'rmc:verification', expiresInSec: 30 })
      await expect(readVerificationToken(token)).rejects.toMatchObject({
        code: 'VERIFICATION_TOKEN_INVALID',
      })
    })
  })

  describe('Reveal token', () => {
    it('issues and reads a valid token', async () => {
      const token = await issueRevealToken('rjti', 60)
      const payload = await readRevealToken(token)
      expect(payload.jti).toBe('rjti')
    })

    it('maps expired token to REVEAL_TOKEN_EXPIRED', async () => {
      const token = await issueRevealToken('rjti', -1)
      await expect(readRevealToken(token)).rejects.toMatchObject({
        code: 'REVEAL_TOKEN_EXPIRED',
      })
    })

    it('rejects a verification token (audience mismatch)', async () => {
      const ver = await issueVerificationToken('vjti', 'login', 30)
      await expect(readRevealToken(ver)).rejects.toMatchObject({
        code: 'REVEAL_TOKEN_INVALID',
      })
    })

    it('rejects a challenge token (audience mismatch)', async () => {
      const ch = await issueChallengeToken('cjti', 30)
      await expect(readRevealToken(ch)).rejects.toMatchObject({
        code: 'REVEAL_TOKEN_INVALID',
      })
    })
  })

  describe('Cross-flow isolation', () => {
    // The whole point of using distinct audiences per token kind is so that
    // a token issued for one flow can NEVER be redeemed in another. These
    // tests pin that invariant down explicitly.
    it('challenge token cannot be read as verification or reveal', async () => {
      const t = await issueChallengeToken('jti', 30)
      await expect(readVerificationToken(t)).rejects.toBeInstanceOf(CaptchaError)
      await expect(readRevealToken(t)).rejects.toBeInstanceOf(CaptchaError)
    })

    it('verification token cannot be read as challenge or reveal', async () => {
      const t = await issueVerificationToken('jti', 'global', 30)
      await expect(readChallengeToken(t)).rejects.toBeInstanceOf(CaptchaError)
      await expect(readRevealToken(t)).rejects.toBeInstanceOf(CaptchaError)
    })

    it('reveal token cannot be read as challenge or verification', async () => {
      const t = await issueRevealToken('jti', 30)
      await expect(readChallengeToken(t)).rejects.toBeInstanceOf(CaptchaError)
      await expect(readVerificationToken(t)).rejects.toBeInstanceOf(CaptchaError)
    })
  })
})