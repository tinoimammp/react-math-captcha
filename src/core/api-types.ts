/**
 * Wire-format types for the CAPTCHA HTTP API.
 *
 * These types describe the JSON payloads exchanged between
 * `createCaptchaHandler` (server) and `useCaptcha` (client).
 *
 * Both sides import from this file so any change to the
 * contract is enforced at compile time on both ends.
 *
 * Power users consuming the API directly (without the React hook)
 * can also import these types via `react-math-captcha/core`.
 */

import type { CaptchaErrorCode } from './errors.js'

/**
 * Response to `POST /api/captcha?action=gate`. The returned `revealToken`
 * must be POSTed to `?action=reveal` to obtain the challenge SVG.
 * Short-lived (~60s), bound to the cookie session.
 */
export interface CaptchaRevealTokenSuccess {
  ok: true
  /** Opaque token to send back via `POST ?action=reveal` body. */
  revealToken: string
  /** Epoch ms after which the gate token will be rejected. */
  expiresAt: number
}

/** Union response type for `POST /api/captcha?action=gate`. */
export type CaptchaRevealTokenResponse = CaptchaRevealTokenSuccess | CaptchaFailure

/** Request body for `POST /api/captcha?action=reveal`. */
export interface CaptchaRevealRequest {
  revealToken: string
}

/** Successful response to `POST ?action=reveal` and `POST ?action=refresh`. */
export interface CaptchaIssueSuccess {
  ok: true
  /** Opaque token identifying this challenge — submit it back with the answer. */
  challengeToken: string
  /** SVG markup of the math problem. Safe to render via `dangerouslySetInnerHTML`. */
  svg: string
  /** Epoch ms after which the challenge can no longer be answered. */
  expiresAt: number
}

/** Successful response to `POST /api/captcha` with a correct answer. */
export interface CaptchaVerifySuccess {
  ok: true
  /** Token to forward in your form (hidden input or header). */
  verificationToken: string
  /** Epoch ms after which the verification token is no longer accepted. */
  expiresAt: number
}

/**
 * Failure response shape — used by every endpoint when `ok: false`.
 *
 * - `error` and `message` are always present.
 * - `retryAfterMs`, `attempts`, `attemptsLeft`, `maxAttempts` are populated
 *   only for the codes documented on each field.
 */
export interface CaptchaFailure {
  ok: false
  error: CaptchaErrorCode
  /** Human-readable message. Always present; safe to display to end users. */
  message: string
  /** Present when `error === 'SESSION_LOCKED'`. Milliseconds until the lock lifts. */
  retryAfterMs?: number
  /** Present when `error === 'INCORRECT_ANSWER'`. Total wrong answers so far. */
  attempts?: number
  /** Present when `error === 'INCORRECT_ANSWER'`. Wrong answers remaining before lock. */
  attemptsLeft?: number
  /** Present when `error === 'INCORRECT_ANSWER'`. Server-configured `maxAttempts`. */
  maxAttempts?: number
}

/** Union response type for `POST ?action=reveal` and `POST ?action=refresh`. */
export type CaptchaIssueResponse = CaptchaIssueSuccess | CaptchaFailure

/** Union response type for `POST /api/captcha` (verify). */
export type CaptchaVerifyResponse = CaptchaVerifySuccess | CaptchaFailure

/** Request body for `POST /api/captcha` (verify). */
export interface CaptchaVerifyRequest {
  challengeToken: string
  answer: string | number
  scope: string
}