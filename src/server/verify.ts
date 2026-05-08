/**
 * Server-side CAPTCHA validation.
 *
 * Validates the verification token from a form submission:
 *   1. Token integrity & scope (cryptographic)
 *   2. Match against session (single-use, expiry check)
 *
 * On success, the token is consumed so it cannot be replayed.
 */

import { CaptchaError } from '../core/errors.js'
import {
  decodeSession,
  encodeSession,
  buildSessionCookie,
  SESSION_COOKIE_NAME,
} from '../core/session.js'
import { readVerificationToken } from '../core/tokens.js'

export interface VerifyOptions {
  secret?: string
  /** Cookie attributes used when re-saving the session (after consumption). */
  cookie?: { sameSite?: 'lax' | 'strict' | 'none'; secure?: boolean; maxAgeSec?: number }
  /** Hidden input name to read from FormData. Defaults to `"captchaToken"`. */
  inputName?: string
}

interface CookieJarLike {
  get(name: string): { value: string } | undefined
  set?(opts: {
    name: string
    value: string
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'lax' | 'strict' | 'none'
    path?: string
    maxAge?: number
  }): void
}

async function getCookieJar(): Promise<CookieJarLike> {
  const mod = (await import('next/headers')) as {
    cookies: () => CookieJarLike | Promise<CookieJarLike>
  }
  return await mod.cookies()
}

function extractToken(
  input: string | FormData | null | undefined,
  inputName: string,
): string | null {
  if (!input) return null
  if (input instanceof FormData) {
    const val = input.get(inputName)
    return typeof val === 'string' ? val : null
  }
  return typeof input === 'string' ? input : null
}

/**
 * Validate a CAPTCHA — throws `CaptchaError` if invalid.
 *
 * Accepts the raw token string **or** the form's `FormData` directly.
 *
  * Possible thrown error codes (all `CaptchaError`):
 *   - `VERIFICATION_TOKEN_MISSING`   (400) no token in the form / argument
 *   - `VERIFICATION_TOKEN_EXPIRED`   (400) token TTL elapsed
 *   - `VERIFICATION_TOKEN_INVALID`   (400) bad signature, malformed, or doesn't
 *                                          match the session's verification record
 *   - `VERIFICATION_SCOPE_MISMATCH`  (400) token issued for a different scope
 *   - `SESSION_LOCKED`               (429) session is in cooldown — the token
 *                                          may itself be valid, but the session
 *                                          it was issued from has since been
 *                                          locked out due to abuse
 *
 * After a successful verify, the verification record is consumed (cleared
 * from the session) so the same token cannot be replayed.
 *
 * @param token  raw token string, or the form's `FormData`
 * @param scope  expected scope — defaults to `"global"` for single-form apps
 *
 * @example
 * // Single-form app — zero config:
 * await verifyCaptchaToken(formData)
 *
 * // Multi-form app:
 * await verifyCaptchaToken(formData, 'register')
 *
 * @example
 * // Branching on specific failures:
 * try {
 *   await verifyCaptchaToken(formData, 'login')
 * } catch (err) {
 *   if (err instanceof CaptchaError) {
 *     if (err.code === 'VERIFICATION_TOKEN_EXPIRED') {
 *       return { ok: false, message: 'Captcha expired, please try again' }
 *     }
 *     return { ok: false, message: 'Captcha verification failed' }
 *   }
 *   throw err
 * }
 */
export async function verifyCaptchaToken(
  token: string | FormData | null | undefined,
  scope = 'global',
  opts: VerifyOptions = {},
): Promise<void> {
  const raw = extractToken(token, opts.inputName ?? 'captchaToken')
  if (!raw) {
    throw new CaptchaError('VERIFICATION_TOKEN_MISSING', 'Captcha token missing', 400)
  }

  // `readVerificationToken` already maps low-level decrypt failures to
  // VERIFICATION_TOKEN_EXPIRED / VERIFICATION_TOKEN_INVALID — re-throw as-is
  // so the caller sees a precise error code.
  const payload = await readVerificationToken(raw, opts.secret)

  if (payload.scope !== scope) {
    throw new CaptchaError(
      'VERIFICATION_SCOPE_MISMATCH',
      `Captcha token issued for scope '${payload.scope}', expected '${scope}'`,
      400,
    )
  }

    const jar = await getCookieJar()
  const sessionRaw = jar.get(SESSION_COOKIE_NAME)?.value
  const session = await decodeSession(sessionRaw, { secret: opts.secret })
  const now = Date.now()

  // Honour an active session lock. A verification token issued *before* the
  // session was locked is still cryptographically valid, but accepting it
  // would defeat the point of the lock — the abuser could solve once,
  // bank a token, then keep submitting forms while the session burns wrong
  // answers in the background. Refuse with SESSION_LOCKED so the caller
  // gets the same signal it would on the issuance endpoints.
  if (session.lockedUntil !== undefined && session.lockedUntil > now) {
    throw new CaptchaError(
      'SESSION_LOCKED',
      'Session is locked. Try again later.',
      429,
    )
  }

  const v = session.verification
  // No verification record at all, or it doesn't match this token's JTI/scope.
  if (!v || v.jti !== payload.jti || v.scope !== scope) {
    throw new CaptchaError(
      'VERIFICATION_TOKEN_INVALID',
      'Captcha token does not match an active verification',
      400,
    )
  }
  // Record exists but TTL elapsed.
  if (v.expiresAt <= now) {
    throw new CaptchaError('VERIFICATION_TOKEN_EXPIRED', 'Captcha token expired', 400)
  }

  // Consume — clear so the token cannot be replayed.
  const updated = { ...session, verification: undefined }
  if (jar.set) {
    const encoded = await encodeSession(updated, {
      secret: opts.secret,
      maxAgeSec: opts.cookie?.maxAgeSec,
    })
    const attrs = buildSessionCookie(encoded, opts.cookie ?? {})
    jar.set({
      name: attrs.name,
      value: attrs.value,
      httpOnly: attrs.httpOnly,
      secure: attrs.secure,
      sameSite: attrs.sameSite,
      path: attrs.path,
      maxAge: attrs.maxAge,
    })
  }
}
