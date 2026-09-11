/**
 * Lifecycle state machine. Pure: (state, action, config, now) → new state.
 *
 *   GENERATE       — gate-redeemed challenge. Resets counters, stamps revealedAt.
 *   RELOAD         — refresh within grace. Bumps reloads, may lock.
 *   VERIFY_FAIL    — bump attempts, may lock.
 *   VERIFY_SUCCESS — issue verification, reset counters.
 */

import type { Challenge } from './generator.js'
import type { SessionData, ChallengeState } from './session.js'
import { CaptchaError } from './errors.js'

export interface LifecycleConfig {
  /** Challenge time-to-live in ms. */
  challengeTtlMs: number
  /** Verification token TTL in ms (set on session). */
  verificationTtlMs: number
  /** Max wrong attempts before lock. */
  maxAttempts: number
  /** Max reloads (manual or implicit) before lock. */
  maxReloads: number
  /** Cooldown duration in ms once locked. */
  lockDurationMs: number
  /** Grace window after a successful reveal during which the session may
   *  request reloads without having to drag-to-reveal again. The drag is a
   *  proof-of-human gate, not a per-action friction — once a session has
   *  proven humanness recently, repeated "New Challenge" clicks within this
   *  window are allowed. Outside the window, the user must reveal again. */
  revealGraceMs: number
}

export const DEFAULT_LIFECYCLE_CONFIG: LifecycleConfig = {
  challengeTtlMs: 30_000, // 30s, per README
  verificationTtlMs: 30_000, // 30s — short by design; submit the form promptly
  maxAttempts: 5,
  maxReloads: 8,
  lockDurationMs: 15 * 60_000, // 15 min cooldown
  revealGraceMs: 5 * 60_000, // 5 min — covers a relaxed solve-and-retry session
}

export type LifecycleAction =
  /** Issue a fresh challenge after gate redemption. Resets counters and
   *  stamps revealedAt = now. */
  | { type: 'GENERATE'; challenge: Challenge }
  | { type: 'VERIFY_FAIL' }
  | { type: 'VERIFY_SUCCESS'; scope: string }
  | { type: 'RELOAD'; challenge: Challenge }

export interface TransitionResult {
  state: SessionData
  /** Newly-issued challenge ID, when applicable. */
  challengeJti?: string
  /** Newly-issued verification ID, when applicable. */
  verificationJti?: string
}

function isLocked(state: SessionData, now: number): boolean {
  return state.lockedUntil !== undefined && state.lockedUntil > now
}

function clearLockIfElapsed(state: SessionData, now: number): SessionData {
  if (state.lockedUntil !== undefined && state.lockedUntil <= now) {
    // Strip lockedUntil AND revealedAt: a freshly-unlocked session must
    // prove humanness again before grinding more challenges.
    const { lockedUntil, revealedAt, ...rest } = state
    void lockedUntil
    void revealedAt
    return { ...rest, attempts: 0, reloads: 0 }
  }
  return state
}

function makeChallengeState(challenge: Challenge, now: number, ttlMs: number): ChallengeState {
  return {
    jti: crypto.randomUUID(),
    answer: challenge.answer,
    expiresAt: now + ttlMs,
    used: false,
  }
}

/**
 * Apply a lifecycle action.
 * @throws CaptchaError when the action is illegal in the current state.
 */
export function transition(
  prev: SessionData,
  action: LifecycleAction,
  config: LifecycleConfig = DEFAULT_LIFECYCLE_CONFIG,
  now: number = Date.now(),
): TransitionResult {
  // Auto-clear stale lock first.
  const state = clearLockIfElapsed(prev, now)

  if (isLocked(state, now)) {
    throw new CaptchaError('SESSION_LOCKED', 'Session is locked. Try again later.', 429)
  }

  switch (action.type) {
    case 'GENERATE': {
      // Gate redemption = fresh proof-of-human. Reset counters and stamp
      // revealedAt so a dangling reload counter from a stale prior session
      // can't immediately trip the lock on the first refresh.
      const ch = makeChallengeState(action.challenge, now, config.challengeTtlMs)
      return {
        state: {
          ...state,
          attempts: 0,
          reloads: 0,
          challenge: ch,
          revealedAt: now,
        },
        challengeJti: ch.jti,
      }
    }

    case 'RELOAD': {
      const reloads = state.reloads + 1
      if (reloads >= config.maxReloads) {
        return {
          state: {
            ...state,
            reloads,
            challenge: undefined,
            lockedUntil: now + config.lockDurationMs,
          },
        }
      }
      const ch = makeChallengeState(action.challenge, now, config.challengeTtlMs)
      return {
        state: { ...state, challenge: ch, reloads },
        challengeJti: ch.jti,
      }
    }

    case 'VERIFY_FAIL': {
      const attempts = state.attempts + 1
      // Burn the current challenge regardless of failure mode.
      const challenge = state.challenge ? { ...state.challenge, used: true } : undefined
      if (attempts >= config.maxAttempts) {
        return {
          state: {
            ...state,
            attempts,
            challenge,
            lockedUntil: now + config.lockDurationMs,
          },
        }
      }
      return { state: { ...state, attempts, challenge } }
    }

    case 'VERIFY_SUCCESS': {
      const verification = {
        jti: crypto.randomUUID(),
        scope: action.scope,
        expiresAt: now + config.verificationTtlMs,
      }
      // revealedAt is NOT carried over: success ends the proof-of-human
      // flow. Subsequent challenges (follow-up forms) require fresh reveal.
      return {
        state: {
          v: 1,
          attempts: 0,
          reloads: 0,
          verification,
          // Burn the challenge so it cannot be replayed.
          ...(state.challenge ? { challenge: { ...state.challenge, used: true } } : {}),
        },
        verificationJti: verification.jti,
      }
    }
  }
}
