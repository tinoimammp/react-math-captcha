/**
 * Token system.
 *
 * Two kinds of tokens are exposed to clients:
 *
 * 1. Challenge token  -> opaque pointer to the active challenge JTI.
 *                        Submitted alongside the user's answer.
 *
 * 2. Verification token -> opaque pointer to a successfully-completed challenge,
 *                        scoped (e.g. "register", "login") and short-lived.
 *                        Submitted with the real form payload.
 *
 * Both tokens are sealed JWEs so the client cannot tamper, and the server checks
 * them against the session state (single source of truth).
 */

import { seal, open, TokenOpenError } from './crypto.js'
import { CaptchaError, type CaptchaErrorCode } from './errors.js'

/**
 * Map a low-level token decrypt failure to a flow-specific CaptchaError.
 *
 * `open()` is flow-agnostic: it only knows whether a token was expired,
 * had a wrong audience, or was malformed. The caller (a `read*Token`
 * helper) supplies the three flow-specific codes to use for each case.
 */
function mapOpenError(
  e: unknown,
  codes: {
    expired: CaptchaErrorCode
    invalid: CaptchaErrorCode
  },
  labelForMessage: string,
): CaptchaError {
  if (e instanceof TokenOpenError) {
    if (e.reason === 'expired') {
      return new CaptchaError(codes.expired, `${labelForMessage} expired`, 400)
    }
    // 'audience' is treated as 'invalid' from the flow's perspective —
    // a token with the wrong audience is, for the caller, simply not a
    // valid token of this kind.
    return new CaptchaError(codes.invalid, `${labelForMessage} invalid`, 400)
  }
  // Unknown error — stay generic but don't leak internals.
  return new CaptchaError(codes.invalid, `${labelForMessage} invalid`, 400)
}

const CHALLENGE_AUD = 'rmc:challenge'
const VERIFICATION_AUD = 'rmc:verification'
const REVEAL_AUD = 'rmc:reveal'

export interface ChallengeTokenPayload {
  jti: string
}

export interface RevealTokenPayload {
  jti: string
}

export interface VerificationTokenPayload {
  jti: string
  scope: string
}

export async function issueChallengeToken(
  jti: string,
  ttlSec: number,
  secret?: string,
): Promise<string> {
  return seal(
    { jti },
    { secret, audience: CHALLENGE_AUD, expiresInSec: ttlSec },
  )
}

export async function readChallengeToken(
  token: string,
  secret?: string,
): Promise<ChallengeTokenPayload> {
  let payload: { jti?: unknown }
  try {
    payload = await open<{ jti?: unknown }>(token, { secret, audience: CHALLENGE_AUD })
  } catch (e) {
    throw mapOpenError(
      e,
      { expired: 'CHALLENGE_TOKEN_EXPIRED', invalid: 'CHALLENGE_TOKEN_INVALID' },
      'Challenge token',
    )
  }
  if (typeof payload.jti !== 'string') {
    throw new CaptchaError('CHALLENGE_TOKEN_INVALID', 'Malformed challenge token')
  }
  return { jti: payload.jti }
}

export async function issueVerificationToken(
  jti: string,
  scope: string,
  ttlSec: number,
  secret?: string,
): Promise<string> {
  return seal(
    { jti, scope },
    { secret, audience: VERIFICATION_AUD, expiresInSec: ttlSec },
  )
}

export async function readVerificationToken(
  token: string,
  secret?: string,
): Promise<VerificationTokenPayload> {
  let payload: { jti?: unknown; scope?: unknown }
  try {
    payload = await open<{ jti?: unknown; scope?: unknown }>(token, {
      secret,
      audience: VERIFICATION_AUD,
    })
  } catch (e) {
    throw mapOpenError(
      e,
      { expired: 'VERIFICATION_TOKEN_EXPIRED', invalid: 'VERIFICATION_TOKEN_INVALID' },
      'Verification token',
    )
  }
  if (typeof payload.jti !== 'string' || typeof payload.scope !== 'string') {
    throw new CaptchaError('VERIFICATION_TOKEN_INVALID', 'Malformed verification token')
  }
  return { jti: payload.jti, scope: payload.scope }
}

/**
 * Gate token — short-lived ticket required to redeem a challenge via
 * `?action=reveal`. Issued by `?action=gate`. Replay within TTL is fine —
 * the cookie session still rate-limits challenge issuance.
 */
export async function issueRevealToken(
  jti: string,
  ttlSec: number,
  secret?: string,
): Promise<string> {
  return seal(
    { jti },
    { secret, audience: REVEAL_AUD, expiresInSec: ttlSec },
  )
}

export async function readRevealToken(
  token: string,
  secret?: string,
): Promise<RevealTokenPayload> {
  let payload: { jti?: unknown }
  try {
    payload = await open<{ jti?: unknown }>(token, {
      secret,
      audience: REVEAL_AUD,
    })
  } catch (e) {
    throw mapOpenError(
      e,
      { expired: 'REVEAL_TOKEN_EXPIRED', invalid: 'REVEAL_TOKEN_INVALID' },
      'Reveal token',
    )
  }
  if (typeof payload.jti !== 'string') {
    throw new CaptchaError('REVEAL_TOKEN_INVALID', 'Malformed reveal token')
  }
  return { jti: payload.jti }
}
