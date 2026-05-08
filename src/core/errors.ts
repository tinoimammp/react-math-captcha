/**
 * Error codes returned by the CAPTCHA API.
 *
 * Naming convention: codes are grouped by the flow they belong to so client
 * code can branch on a single string without ambiguity. The wire format is
 * a stable contract — changes here are breaking changes for API consumers.
 *
 *   REVEAL_TOKEN_*       — drag-to-reveal gate (POST ?action=reveal)
 *   CHALLENGE_*          — challenge issuance + answer verification
 *   VERIFICATION_*       — form-side token check (verifyCaptchaToken)
 *   SESSION_*            — session lifecycle (rate limit / lock)
 *   INVALID_INPUT        — request-level malformed body / missing field
 *   CONFIG_ERROR         — server misconfiguration (e.g. missing secret)
 *   INTERNAL_ERROR       — server-side bug; should never reach the client
 *
 * Strings are user-facing-safe (no internal info leak).
 */

export type CaptchaErrorCode =
  // ── Reveal flow ─────────────────────────────────────────────────────────
  /** POST ?action=reveal: body missing or revealToken not a non-empty string. */
  | 'REVEAL_TOKEN_MISSING'
  /** POST ?action=reveal: revealToken TTL elapsed (user idled past the window). */
  | 'REVEAL_TOKEN_EXPIRED'
  /** POST ?action=reveal: revealToken signature / audience / format invalid. */
  | 'REVEAL_TOKEN_INVALID'

  // ── Challenge flow ──────────────────────────────────────────────────────
  /** POST verify: body missing or challengeToken not a non-empty string. */
  | 'CHALLENGE_TOKEN_MISSING'
  /** POST verify: challenge TTL elapsed before the answer was submitted. */
  | 'CHALLENGE_TOKEN_EXPIRED'
  /** POST verify: challengeToken signature / format invalid. */
  | 'CHALLENGE_TOKEN_INVALID'
  /** POST verify: token is well-formed but doesn't match the session's active challenge. */
  | 'CHALLENGE_NOT_FOUND'
  /** POST verify: challenge already consumed (one-time use). */
  | 'CHALLENGE_ALREADY_USED'
  /** POST verify: answer is wrong. Includes attemptsLeft / maxAttempts. */
  | 'INCORRECT_ANSWER'

  // ── Verification (form-side) flow ───────────────────────────────────────
  /** verifyCaptchaToken: no token in form / argument. */
  | 'VERIFICATION_TOKEN_MISSING'
  /** verifyCaptchaToken: verificationToken TTL elapsed. */
  | 'VERIFICATION_TOKEN_EXPIRED'
  /** verifyCaptchaToken: verificationToken signature / format invalid. */
  | 'VERIFICATION_TOKEN_INVALID'
  /** verifyCaptchaToken: token issued for a different scope than expected. */
  | 'VERIFICATION_SCOPE_MISMATCH'

  // ── Session lifecycle ───────────────────────────────────────────────────
  /** Session is in cooldown after too many failed attempts / reloads. */
  | 'SESSION_LOCKED'

  // ── Generic ─────────────────────────────────────────────────────────────
  /** Malformed request body / missing required field. */
  | 'INVALID_INPUT'
  /** Server misconfiguration (e.g. missing CAPTCHA_SECRET). */
  | 'CONFIG_ERROR'
  /** Server-side bug; should never reach the client in normal operation. */
  | 'INTERNAL_ERROR'

export class CaptchaError extends Error {
  readonly code: CaptchaErrorCode
  readonly status: number

  constructor(code: CaptchaErrorCode, message?: string, status = 400) {
    super(message ?? code)
    this.name = 'CaptchaError'
    this.code = code
    this.status = status
  }
}
