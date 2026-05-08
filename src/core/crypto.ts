/**
 * Crypto helpers built on top of `jose`.
 *
 * - Session cookie & verification token use JWE (encrypted, dir alg with A256GCM)
 *   so that:
 *     * Server is the sole authority on its content.
 *     * Client cannot tamper or read the answer.
 *
 * The secret is derived to a fixed-size 32-byte key suitable for A256GCM.
 */

import { EncryptJWT, jwtDecrypt, errors as joseErrors } from 'jose'
import { CaptchaError } from './errors.js'

let cachedKey: { source: string; key: Uint8Array } | null = null

/**
 * Derive a 32-byte key from the configured secret using SHA-256.
 * Cached per-secret to avoid recomputing on every request.
 */
async function getKey(secret: string): Promise<Uint8Array> {
  if (cachedKey && cachedKey.source === secret) return cachedKey.key
  const enc = new TextEncoder().encode(secret)
  const hash = await crypto.subtle.digest('SHA-256', enc)
  const key = new Uint8Array(hash)
  cachedKey = { source: secret, key }
  return key
}

function resolveSecret(explicit?: string): string {
  const fromEnv
    = explicit
    ?? (typeof process !== 'undefined'
      ? process.env?.CAPTCHA_SECRET ?? process.env?.AUTH_SECRET ?? process.env?.NEXTAUTH_SECRET
      : undefined)
  if (!fromEnv || fromEnv.length < 16) {
    throw new CaptchaError(
      'CONFIG_ERROR',
      'Missing CAPTCHA_SECRET (>=16 chars). Set CAPTCHA_SECRET env var or pass `secret` to createCaptchaHandler().',
      500,
    )
  }
  return fromEnv
}

export interface SealOptions {
  /** Override the secret. Defaults to env CAPTCHA_SECRET. */
  secret?: string
  /** Issued-at + this many seconds. */
  expiresInSec?: number
  /** Optional audience claim (used as scope marker). */
  audience?: string
}

/** Seal an arbitrary JSON-serialisable payload into an encrypted JWT. */
export async function seal(payload: Record<string, unknown>, opts: SealOptions = {}): Promise<string> {
  const key = await getKey(resolveSecret(opts.secret))
  let jwt = new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
  if (typeof opts.expiresInSec === 'number') {
    jwt = jwt.setExpirationTime(Math.floor(Date.now() / 1000) + opts.expiresInSec)
  }
  if (opts.audience) {
    jwt = jwt.setAudience(opts.audience)
  }
  return jwt.encrypt(key)
}

export interface OpenOptions {
  secret?: string
  audience?: string
}

/**
 * Tagged failure reason produced by `open()`. Callers map these to a
 * flow-specific `CaptchaError` (e.g. REVEAL_TOKEN_EXPIRED vs
 * CHALLENGE_TOKEN_EXPIRED) — `open()` itself doesn't know which flow it's
 * being called from, so it stays neutral.
 */
export type OpenFailureReason = 'expired' | 'audience' | 'invalid'

export class TokenOpenError extends Error {
  readonly reason: OpenFailureReason
  constructor(reason: OpenFailureReason, message: string) {
    super(message)
    this.name = 'TokenOpenError'
    this.reason = reason
  }
}

/**
 * Inverse of `seal`. Throws `TokenOpenError` (with a tagged reason) on
 * tampering / expiry / audience mismatch. The caller — typically a
 * `read*Token` helper — re-throws as a flow-specific `CaptchaError`.
 */
export async function open<T = Record<string, unknown>>(
  token: string,
  opts: OpenOptions = {},
): Promise<T> {
  const key = await getKey(resolveSecret(opts.secret))
  try {
    const { payload } = await jwtDecrypt(token, key, {
      audience: opts.audience,
    })
    return payload as T
  } catch (e: unknown) {
    // Prefer structured error inspection over message-string regex.
    // `jose` exposes `JWTExpired` (a subclass of `JWTClaimValidationFailed`
    // with `claim === 'exp'`) and a generic `JWTClaimValidationFailed` for
    // every other claim violation, including audience. Each carries a
    // stable `code` static (e.g. ERR_JWT_EXPIRED, ERR_JWT_CLAIM_VALIDATION_FAILED)
    // and a `claim` instance property — both vastly more durable across
    // jose minor/major versions than scraping `error.message`.
    if (e instanceof joseErrors.JWTExpired) {
      throw new TokenOpenError('expired', 'Token expired')
    }
    if (e instanceof joseErrors.JWTClaimValidationFailed) {
      if (e.claim === 'exp') {
        throw new TokenOpenError('expired', 'Token expired')
      }
      if (e.claim === 'aud') {
        throw new TokenOpenError('audience', 'Token audience mismatch')
      }
      // Any other claim mismatch is, from the caller's perspective, just
      // an invalid token of this kind.
      throw new TokenOpenError('invalid', 'Token invalid')
    }
    // Last-resort fallback for the unlikely case that a future jose
    // release re-shapes its error hierarchy. Keep the legacy regex
    // sniffing as a safety net so we degrade gracefully (correct
    // failure reason on best-effort basis) rather than silently
    // collapsing every claim error into 'invalid'.
    const msg = e instanceof Error ? e.message : String(e)
    const code = (e as { code?: string })?.code ?? ''
    if (code === 'ERR_JWT_EXPIRED' || /expired|"exp"/i.test(msg)) {
      throw new TokenOpenError('expired', 'Token expired')
    }
    if (/audience|"aud"|\baud\b/i.test(msg)) {
      throw new TokenOpenError('audience', 'Token audience mismatch')
    }
    throw new TokenOpenError('invalid', 'Token invalid')
  }
}
