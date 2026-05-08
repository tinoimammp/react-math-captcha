/**
 * Encrypted-cookie session engine.
 *
 * Per README:
 *   - One active challenge per session
 *   - Counters: attempts, reloads
 *   - Optional cooldown lock
 *   - Verification token state (post-success)
 *
 * The session blob is sealed via `seal()` (JWE) and stored under a single cookie.
 */

import { seal, open } from './crypto.js'
import { CaptchaError } from './errors.js'

export const SESSION_COOKIE_NAME = '__captcha_session'

export interface ChallengeState {
  jti: string
  answer: number
  expiresAt: number // epoch ms
  used: boolean
}

export interface VerificationState {
  jti: string
  scope: string
  expiresAt: number // epoch ms
}

export interface SessionData {
  v: 1
  challenge?: ChallengeState
  verification?: VerificationState
  attempts: number
  reloads: number
  lockedUntil?: number // epoch ms
  /** Epoch ms when the user last completed the reveal gate (drag-to-reveal
   *  + revealToken redemption). Reload requests within `revealGraceMs` of
   *  this timestamp are allowed without re-revealing; outside the window the
   *  user must drag again. Cleared on lock auto-expiry and on successful
   *  verification (each new flow must re-prove human). */
  revealedAt?: number
}

export function emptySession(): SessionData {
  return { v: 1, attempts: 0, reloads: 0 }
}

export interface SessionCryptoOptions {
  secret?: string
  /** Maximum lifetime of the session cookie itself (seconds). */
  maxAgeSec?: number
}

/** Default cookie max-age (seconds) when caller doesn't override `maxAgeSec`.
 *  Exported so the server handler can validate `lockDurationMs` against it —
 *  a cookie that expires before the lock lifts would silently bypass the
 *  cooldown (fresh empty session = no `lockedUntil`). */
export const DEFAULT_SESSION_TTL = 60 * 30 // 30 minutes

/** Encode session -> sealed string suitable for a cookie value. */
export async function encodeSession(
  session: SessionData,
  opts: SessionCryptoOptions = {},
): Promise<string> {
  return seal(
    { s: session },
    {
      secret: opts.secret,
      expiresInSec: opts.maxAgeSec ?? DEFAULT_SESSION_TTL,
    },
  )
}

/** Decode session from a cookie value. Returns empty session on absence/corruption. */
export async function decodeSession(
  raw: string | undefined | null,
  opts: SessionCryptoOptions = {},
): Promise<SessionData> {
  if (!raw) return emptySession()
  try {
    const payload = await open<{ s: SessionData }>(raw, { secret: opts.secret })
    if (!payload?.s || payload.s.v !== 1) return emptySession()
    // Defensive defaults
    return {
      v: 1,
      attempts: payload.s.attempts ?? 0,
      reloads: payload.s.reloads ?? 0,
      ...(payload.s.challenge ? { challenge: payload.s.challenge } : {}),
      ...(payload.s.verification ? { verification: payload.s.verification } : {}),
      ...(payload.s.lockedUntil ? { lockedUntil: payload.s.lockedUntil } : {}),
      ...(payload.s.revealedAt ? { revealedAt: payload.s.revealedAt } : {}),
    }
  } catch (e) {
    // Tampered or expired -> start fresh
    if (e instanceof CaptchaError) return emptySession()
    return emptySession()
  }
}

export interface CookieAttributes {
  name: string
  value: string
  maxAge: number
  httpOnly: true
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  path: string
}

export function buildSessionCookie(
  value: string,
  opts: { maxAgeSec?: number; secure?: boolean; sameSite?: 'lax' | 'strict' | 'none' } = {},
): CookieAttributes {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    maxAge: opts.maxAgeSec ?? DEFAULT_SESSION_TTL,
    httpOnly: true,
    secure: opts.secure ?? (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'),
    sameSite: opts.sameSite ?? 'lax',
    path: '/',
  }
}
