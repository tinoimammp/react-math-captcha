/**
 * Next.js App Router handler factory.
 *
 *   // app/api/captcha/route.ts
 *   import { createCaptchaHandler } from 'react-math-captcha/server'
 *   export const { POST } = createCaptchaHandler()
 *
 * Endpoints:
 *   POST /api/captcha?action=gate     → issue gate token
 *   POST /api/captcha?action=reveal   → redeem gate token → first challenge
 *   POST /api/captcha?action=refresh  → new challenge (within reveal grace)
 *   POST /api/captcha                 → verify answer
 *
 * Edge-runtime compatible (Web APIs + jose only).
 */

import {
  CaptchaError,
  generateChallenge,
  renderSvg,
  type GeneratorOptions,
  type Operator,
  type CaptchaIssueResponse,
  type CaptchaVerifyResponse,
  type CaptchaFailure,
} from '../core/index.js'
import {
  decodeSession,
  encodeSession,
  buildSessionCookie,
  DEFAULT_SESSION_TTL,
  SESSION_COOKIE_NAME,
  type SessionData,
} from '../core/session.js'
import {
  DEFAULT_LIFECYCLE_CONFIG,
  transition,
  type LifecycleConfig,
} from '../core/lifecycle.js'
import {
  issueChallengeToken,
  issueVerificationToken,
  issueRevealToken,
  readChallengeToken,
  readRevealToken,
} from '../core/tokens.js'
import type {
  CaptchaRevealTokenSuccess,
} from '../core/api-types.js'

/** Gate token TTL — long enough for a slow drag, short enough to discourage replay. */
const GATE_TOKEN_TTL_SEC = 60

export interface CreateCaptchaHandlerOptions {
  /** Override env CAPTCHA_SECRET. */
  secret?: string
  /** Restrict operators (e.g. ['+'] for kid-friendly mode). */
  operators?: Operator[]
  /** Override lifecycle thresholds. Code > env > default. */
  lifecycle?: Partial<LifecycleConfig>
  /** Override SVG render options. */
  render?: { width?: number; height?: number; background?: string; foreground?: string }
  /** Cookie attributes overrides. */
  cookie?: { sameSite?: 'lax' | 'strict' | 'none'; secure?: boolean; maxAgeSec?: number }
}

/**
 * Reject configs where the cookie expires before the lock or verification
 * token does — both would silently weaken security (lock bypass / token
 * unredeemable). Fail fast at handler construction.
 */
function validateConfig(
  lifecycle: LifecycleConfig,
  cookieMaxAgeSec: number,
): void {
  const cookieMs = cookieMaxAgeSec * 1000
  if (lifecycle.lockDurationMs > cookieMs) {
    throw new CaptchaError(
      'CONFIG_ERROR',
      `cookie maxAgeSec (${cookieMaxAgeSec}s) must be >= lockDurationMs `
      + `(${Math.ceil(lifecycle.lockDurationMs / 1000)}s); otherwise abusers can `
      + 'bypass the cooldown by waiting for the cookie to drop.',
      500,
    )
  }
  if (lifecycle.verificationTtlMs > cookieMs) {
    throw new CaptchaError(
      'CONFIG_ERROR',
      `cookie maxAgeSec (${cookieMaxAgeSec}s) must be >= verificationTtlMs `
      + `(${Math.ceil(lifecycle.verificationTtlMs / 1000)}s); a verification token `
      + 'outliving its session cookie cannot be redeemed.',
      500,
    )
  }
}

/** Read a positive integer env var. */
function envInt(key: string): number | undefined {
  const v = typeof process !== 'undefined' ? process.env?.[key] : undefined
  if (!v) return undefined
  const n = parseInt(v, 10)
  return isNaN(n) || n <= 0 ? undefined : n
}

/** Merge config: code option > env var > default. */
function resolveLifecycleConfig(override?: Partial<LifecycleConfig>): LifecycleConfig {
  const D = DEFAULT_LIFECYCLE_CONFIG
  return {
    challengeTtlMs:    override?.challengeTtlMs    ?? (envInt('CAPTCHA_TTL_SEC')      != null ? envInt('CAPTCHA_TTL_SEC')!  * 1000 : D.challengeTtlMs),
    verificationTtlMs: override?.verificationTtlMs ?? D.verificationTtlMs,
    maxAttempts:       override?.maxAttempts        ?? envInt('CAPTCHA_MAX_ATTEMPTS')  ?? D.maxAttempts,
    maxReloads:        override?.maxReloads         ?? envInt('CAPTCHA_MAX_RELOADS')   ?? D.maxReloads,
    lockDurationMs:    override?.lockDurationMs     ?? (envInt('CAPTCHA_LOCK_SEC')     != null ? envInt('CAPTCHA_LOCK_SEC')! * 1000 : D.lockDurationMs),
    revealGraceMs:     override?.revealGraceMs      ?? (envInt('CAPTCHA_REVEAL_GRACE_SEC') != null ? envInt('CAPTCHA_REVEAL_GRACE_SEC')! * 1000 : D.revealGraceMs),
  }
}

interface NextCookieJar {
  get(name: string): { value: string } | undefined
  set(opts: {
    name: string
    value: string
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'lax' | 'strict' | 'none'
    path?: string
    maxAge?: number
  }): void
}

interface NextLikeRequest {
  url: string
  method: string
  cookies: NextCookieJar
  json(): Promise<unknown>
}

function jsonResponse(
  data: unknown,
  init: { status?: number; setCookie?: string } = {},
) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  if (init.setCookie) headers.append('set-cookie', init.setCookie)
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers,
  })
}

function errorResponse(err: unknown) {
  if (err instanceof CaptchaError) {
    return jsonResponse(
      { ok: false, error: err.code, message: err.message },
      { status: err.status },
    )
  }
  // Non-CaptchaError = bug or runtime failure. Surface as 500 with generic
  // message so we don't leak internals.
  return jsonResponse(
    { ok: false, error: 'INTERNAL_ERROR', message: 'Unexpected server error' },
    { status: 500 },
  )
}

function serializeCookie(attrs: ReturnType<typeof buildSessionCookie>): string {
  const parts: string[] = [`${attrs.name}=${attrs.value}`]
  parts.push(`Path=${attrs.path}`)
  parts.push(`Max-Age=${attrs.maxAge}`)
  parts.push('HttpOnly')
  if (attrs.secure) parts.push('Secure')
  parts.push(`SameSite=${attrs.sameSite.charAt(0).toUpperCase() + attrs.sameSite.slice(1)}`)
  return parts.join('; ')
}

async function loadSession(
  cookies: NextCookieJar,
  secret?: string,
): Promise<SessionData> {
  const raw = cookies.get(SESSION_COOKIE_NAME)?.value
  return decodeSession(raw, { secret })
}

async function buildSetCookie(
  session: SessionData,
  options: CreateCaptchaHandlerOptions,
): Promise<string> {
  const encoded = await encodeSession(session, {
    secret: options.secret,
    maxAgeSec: options.cookie?.maxAgeSec,
  })
  return serializeCookie(buildSessionCookie(encoded, options.cookie ?? {}))
}

function mergeLifecycle(opts?: Partial<LifecycleConfig>): LifecycleConfig {
  return resolveLifecycleConfig(opts)
}

/**
 * Issue a gate token. Honours session lock; doesn't mutate counters.
 */
async function handleGate(
  req: NextLikeRequest,
  options: CreateCaptchaHandlerOptions,
) {
  const session = await loadSession(req.cookies, options.secret)
  const now = Date.now()

  if (session.lockedUntil && session.lockedUntil > now) {
    const setCookie = await buildSetCookie(session, options)
    const payload: CaptchaFailure = {
      ok: false,
      error: 'SESSION_LOCKED',
      message: 'Session is locked. Try again later.',
      retryAfterMs: session.lockedUntil - now,
    }
    return jsonResponse(payload, { status: 429, setCookie })
  }

  const jti = crypto.randomUUID()
  const revealToken = await issueRevealToken(jti, GATE_TOKEN_TTL_SEC, options.secret)
  const setCookie = await buildSetCookie(session, options)

  const payload: CaptchaRevealTokenSuccess = {
    ok: true,
    revealToken,
    expiresAt: now + GATE_TOKEN_TTL_SEC * 1000,
  }
  return jsonResponse(payload, { setCookie })
}

/**
 * Validate the gate token from POST body. `readRevealToken` already maps
 * decrypt failures to REVEAL_TOKEN_EXPIRED / REVEAL_TOKEN_INVALID.
 */
async function consumeGateToken(
  req: NextLikeRequest,
  options: CreateCaptchaHandlerOptions,
) {
  const body = (await req.json().catch(() => null)) as
    | { revealToken?: unknown }
    | null
  if (!body || typeof body.revealToken !== 'string' || !body.revealToken) {
    throw new CaptchaError('REVEAL_TOKEN_MISSING', 'revealToken required')
  }
  return readRevealToken(body.revealToken, options.secret)
}

/**
 * Issue a challenge.
 *
 *   REVEAL   — after gate token redemption. Stamps revealedAt = now.
 *   REFRESH  — "New Challenge" click. Requires fresh revealedAt within grace.
 */
async function handleIssue(
  req: NextLikeRequest,
  options: CreateCaptchaHandlerOptions,
  kind: 'REFRESH' | 'REVEAL',
) {
  const lifecycle = mergeLifecycle(options.lifecycle)
  const session = await loadSession(req.cookies, options.secret)

  // Refresh requires recent reveal. Lock auto-clear strips revealedAt too
  // (post-cooldown = fresh start, fresh proof).
  if (kind === 'REFRESH') {
    const now = Date.now()
    const stillLocked = session.lockedUntil !== undefined && session.lockedUntil > now
    const recentlyRevealed
      = !stillLocked
      && session.revealedAt !== undefined
      && (now - session.revealedAt) <= lifecycle.revealGraceMs
    if (!recentlyRevealed) {
      throw new CaptchaError(
        'REVEAL_TOKEN_MISSING',
        'Reveal required before requesting a new challenge',
        400,
      )
    }
  }

  const generatorOptions: GeneratorOptions = options.operators ? { operators: options.operators } : {}
  const challenge = generateChallenge(generatorOptions)

  // REVEAL stamps revealedAt (via GENERATE); REFRESH bumps the reload counter.
  const result = transition(
    session,
    kind === 'REFRESH'
      ? { type: 'RELOAD', challenge }
      : { type: 'GENERATE', challenge },
    lifecycle,
  )

  // Lock case: state mutated to lockedUntil; no challenge issued.
  if (!result.challengeJti || !result.state.challenge) {
    const setCookie = await buildSetCookie(result.state, options)
    const retryAfter = result.state.lockedUntil
      ? Math.max(0, result.state.lockedUntil - Date.now())
      : lifecycle.lockDurationMs
    const payload: CaptchaIssueResponse = {
      ok: false,
      error: 'SESSION_LOCKED',
      message: 'Session is locked. Try again later.',
      retryAfterMs: retryAfter,
    }
    return jsonResponse(payload, { status: 429, setCookie })
  }

  const ttlSec = Math.ceil(lifecycle.challengeTtlMs / 1000)
  const challengeToken = await issueChallengeToken(result.challengeJti, ttlSec, options.secret)
  const svg = renderSvg(challenge, options.render)
  const setCookie = await buildSetCookie(result.state, options)

  const payload: CaptchaIssueResponse = {
    ok: true,
    challengeToken,
    svg,
    expiresAt: result.state.challenge.expiresAt,
  }
  return jsonResponse(payload, { setCookie })
}

async function handleVerify(req: NextLikeRequest, options: CreateCaptchaHandlerOptions) {
  const lifecycle = mergeLifecycle(options.lifecycle)
  const body = (await req.json().catch(() => null)) as
    | { challengeToken?: unknown; answer?: unknown; scope?: unknown }
    | null
  if (!body) throw new CaptchaError('INVALID_INPUT', 'Invalid JSON body')

  const challengeToken = body.challengeToken
  const answerRaw = body.answer
  const scope = body.scope

  if (typeof challengeToken !== 'string' || !challengeToken) {
    throw new CaptchaError('CHALLENGE_TOKEN_MISSING', 'challengeToken required')
  }
  if (typeof scope !== 'string' || !scope) {
    throw new CaptchaError('INVALID_INPUT', 'scope required')
  }
  const answerNum
    = typeof answerRaw === 'number'
      ? answerRaw
      : typeof answerRaw === 'string' && /^-?\d+$/.test(answerRaw.trim())
        ? parseInt(answerRaw.trim(), 10)
        : NaN
  if (Number.isNaN(answerNum)) {
    throw new CaptchaError('INVALID_INPUT', 'answer must be an integer')
  }

  const session = await loadSession(req.cookies, options.secret)
  const tokenPayload = await readChallengeToken(challengeToken, options.secret)

  const ch = session.challenge
  const now = Date.now()

  // All failure paths burn an attempt — wrong answer, mismatched token,
  // already-used, expired challenge. Otherwise bots could grind verify
  // without ever tripping maxAttempts.
  const failureCode
    : 'CHALLENGE_NOT_FOUND' | 'CHALLENGE_ALREADY_USED' | 'CHALLENGE_TOKEN_EXPIRED' | 'INCORRECT_ANSWER' | null
    = !ch || ch.jti !== tokenPayload.jti
      ? 'CHALLENGE_NOT_FOUND'
      : ch.used
        ? 'CHALLENGE_ALREADY_USED'
        : ch.expiresAt <= now
          ? 'CHALLENGE_TOKEN_EXPIRED'
          : answerNum !== ch.answer
            ? 'INCORRECT_ANSWER'
            : null

  if (failureCode !== null) {
    const result = transition(session, { type: 'VERIFY_FAIL' }, lifecycle, now)
    const setCookie = await buildSetCookie(result.state, options)
    if (result.state.lockedUntil && result.state.lockedUntil > now) {
      const payload: CaptchaFailure = {
        ok: false,
        error: 'SESSION_LOCKED',
        message: 'Session is locked. Try again later.',
        retryAfterMs: result.state.lockedUntil - now,
      }
      return jsonResponse(payload, { status: 429, setCookie })
    }
    const attemptsLeft = Math.max(0, lifecycle.maxAttempts - result.state.attempts)
    if (failureCode === 'INCORRECT_ANSWER') {
      const payload: CaptchaFailure = {
        ok: false,
        error: 'INCORRECT_ANSWER',
        message: `Incorrect answer. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.`,
        attempts: result.state.attempts,
        attemptsLeft,
        maxAttempts: lifecycle.maxAttempts,
      }
      return jsonResponse(payload, { status: 400, setCookie })
    }
    const messageByCode: Record<
      Exclude<NonNullable<typeof failureCode>, 'INCORRECT_ANSWER'>,
      string
    > = {
      CHALLENGE_NOT_FOUND:    'No active challenge for this session',
      CHALLENGE_ALREADY_USED: 'Challenge already used',
      CHALLENGE_TOKEN_EXPIRED: 'Challenge expired',
    }
    const payload: CaptchaFailure = {
      ok: false,
      error: failureCode,
      message: messageByCode[failureCode],
    }
    return jsonResponse(payload, { status: 400, setCookie })
  }

  const result = transition(session, { type: 'VERIFY_SUCCESS', scope }, lifecycle, now)
  if (!result.verificationJti || !result.state.verification) {
    throw new CaptchaError('INTERNAL_ERROR', 'Failed to issue verification', 500)
  }
  const setCookie = await buildSetCookie(result.state, options)
  const verTtlSec = Math.ceil(lifecycle.verificationTtlMs / 1000)
  const verificationToken = await issueVerificationToken(
    result.verificationJti,
    scope,
    verTtlSec,
    options.secret,
  )
  const payload: CaptchaVerifyResponse = {
    ok: true,
    verificationToken,
    expiresAt: result.state.verification.expiresAt,
  }
  return jsonResponse(payload, { setCookie })
}

export function createCaptchaHandler(options: CreateCaptchaHandlerOptions = {}) {
  // Validate at construction so misconfigs surface at server start, not in production.
  validateConfig(
    resolveLifecycleConfig(options.lifecycle),
    options.cookie?.maxAgeSec ?? DEFAULT_SESSION_TTL,
  )

  async function POST(req: NextLikeRequest): Promise<Response> {
    try {
      const url = new URL(req.url)
      const action = url.searchParams.get('action')
      if (action === 'refresh') {
        return await handleIssue(req, options, 'REFRESH')
      }
      if (action === 'gate') {
        return await handleGate(req, options)
      }
      if (action === 'reveal') {
        // Cheap-check the lock before decrypting the gate token — bots
        // hammering a locked session shouldn't amplify load via crypto work.
        const session = await loadSession(req.cookies, options.secret)
        const now = Date.now()
        if (session.lockedUntil && session.lockedUntil > now) {
          const setCookie = await buildSetCookie(session, options)
          const payload: CaptchaFailure = {
            ok: false,
            error: 'SESSION_LOCKED',
            message: 'Session is locked. Try again later.',
            retryAfterMs: session.lockedUntil - now,
          }
          return jsonResponse(payload, { status: 429, setCookie })
        }
        await consumeGateToken(req, options)
        return await handleIssue(req, options, 'REVEAL')
      }
      return await handleVerify(req, options)
    } catch (err) {
      return errorResponse(err)
    }
  }

  return { POST }
}