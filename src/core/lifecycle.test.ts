import { describe, it, expect } from 'vitest'
import { transition, DEFAULT_LIFECYCLE_CONFIG } from './lifecycle.js'
import type { SessionData } from './session.js'
import { CaptchaError } from './errors.js'

const dummyChallenge = { a: 5, b: 5, operator: '+' as const, answer: 10, display: '5 + 5' }

describe('Lifecycle State Machine', () => {
  const config = DEFAULT_LIFECYCLE_CONFIG

  it('GENERATE issues a fresh challenge and stamps revealedAt', () => {
    const initial: SessionData = { v: 1, attempts: 0, reloads: 0 }
    const now = Date.now()
    const result = transition(initial, { type: 'GENERATE', challenge: dummyChallenge }, config, now)

    expect(result.challengeJti).toBeDefined()
    expect(result.state.challenge?.answer).toBe(10)
    expect(result.state.challenge?.used).toBe(false)
    expect(result.state.revealedAt).toBe(now)
  })

  it('GENERATE resets attempts and reloads (fresh proof-of-human)', () => {
    // Without this reset, a session that reloaded right up to the limit
    // could re-reveal and immediately lock on the first refresh.
    const initial: SessionData = {
      v: 1,
      attempts: 3,
      reloads: 7,
    }
    const result = transition(initial, { type: 'GENERATE', challenge: dummyChallenge }, config, Date.now())
    expect(result.state.attempts).toBe(0)
    expect(result.state.reloads).toBe(0)
  })

  it('handles VERIFY_FAIL (bumps attempts, burns challenge)', () => {
    const initial: SessionData = {
      v: 1,
      attempts: 0,
      reloads: 0,
      challenge: { jti: 'c1', answer: 10, expiresAt: Date.now() + 10000, used: false },
    }
    const result = transition(initial, { type: 'VERIFY_FAIL' }, config, Date.now())

    expect(result.state.attempts).toBe(1)
    expect(result.state.challenge?.used).toBe(true)
  })

  it('locks session immediately when VERIFY_FAIL hits maxAttempts (boundary)', () => {
    const now = Date.now()
    const initial: SessionData = {
      v: 1,
      attempts: config.maxAttempts - 1,
      reloads: 0,
      challenge: { jti: 'c1', answer: 10, expiresAt: now + 10000, used: false },
    }
    const result = transition(initial, { type: 'VERIFY_FAIL' }, config, now)

    expect(result.state.attempts).toBe(config.maxAttempts)
    expect(result.state.lockedUntil).toBe(now + config.lockDurationMs)
  })

  it('locks RELOAD on the maxReloads-th call (boundary)', () => {
    const now = Date.now()
    const initial: SessionData = {
      v: 1,
      attempts: 0,
      reloads: config.maxReloads - 1,
    }
    const result = transition(initial, { type: 'RELOAD', challenge: dummyChallenge }, config, now)

    expect(result.state.lockedUntil).toBe(now + config.lockDurationMs)
    expect(result.challengeJti).toBeUndefined()
  })

  it('handles VERIFY_SUCCESS (clears counters, issues verification)', () => {
    const initial: SessionData = {
      v: 1,
      attempts: 2,
      reloads: 1,
      challenge: { jti: 'c1', answer: 10, expiresAt: Date.now() + 10000, used: false },
    }
    const now = Date.now()
    const result = transition(initial, { type: 'VERIFY_SUCCESS', scope: 'login' }, config, now)

    expect(result.state.attempts).toBe(0)
    expect(result.state.reloads).toBe(0)
    expect(result.state.challenge?.used).toBe(true)
    expect(result.verificationJti).toBeDefined()
    expect(result.state.verification?.scope).toBe('login')
  })

  it('throws SESSION_LOCKED if action taken while locked', () => {
    const now = Date.now()
    const initial: SessionData = {
      v: 1,
      attempts: 0,
      reloads: 0,
      lockedUntil: now + 50000,
    }

    expect(() => transition(initial, { type: 'GENERATE', challenge: dummyChallenge }, config, now))
      .toThrowError(CaptchaError)
  })

  it('auto-clears lock if lock time has elapsed', () => {
    const now = Date.now()
    const initial: SessionData = {
      v: 1,
      attempts: 5,
      reloads: 0,
      lockedUntil: now - 1000,
    }

    const result = transition(initial, { type: 'GENERATE', challenge: dummyChallenge }, config, now)
    expect(result.state.lockedUntil).toBeUndefined()
    expect(result.state.attempts).toBe(0)
  })

  describe('reveal stamp (revealedAt)', () => {
    // Invariants:
    //   1. GENERATE always stamps revealedAt = now (gate redemption).
    //   2. RELOAD preserves revealedAt (separate from reload counter).
    //   3. VERIFY_SUCCESS wipes revealedAt (end of flow).
    //   4. Lock auto-clear strips revealedAt (fresh start, fresh proof).

    it('RELOAD preserves revealedAt', () => {
      const now = Date.now()
      const stamped = now - 500
      const initial: SessionData = {
        v: 1,
        attempts: 0,
        reloads: 0,
        revealedAt: stamped,
      }
      const result = transition(
        initial,
        { type: 'RELOAD', challenge: dummyChallenge },
        config,
        now,
      )
      expect(result.state.revealedAt).toBe(stamped)
    })

    it('VERIFY_SUCCESS wipes revealedAt', () => {
      const initial: SessionData = {
        v: 1,
        attempts: 0,
        reloads: 0,
        revealedAt: Date.now(),
        challenge: { jti: 'c1', answer: 10, expiresAt: Date.now() + 10000, used: false },
      }
      const result = transition(
        initial,
        { type: 'VERIFY_SUCCESS', scope: 'global' },
        config,
        Date.now(),
      )
      expect(result.state.revealedAt).toBeUndefined()
    })

    it('lock auto-clear strips revealedAt (post-cooldown must re-reveal)', () => {
      const now = Date.now()
      const initial: SessionData = {
        v: 1,
        attempts: 5,
        reloads: 0,
        lockedUntil: now - 1000,
        revealedAt: now - 2000,
      }
      const result = transition(
        initial,
        { type: 'GENERATE', challenge: dummyChallenge },
        config,
        now,
      )
      // GENERATE itself stamps a new revealedAt = now.
      expect(result.state.revealedAt).toBe(now)
      expect(result.state.lockedUntil).toBeUndefined()
    })
  })
})