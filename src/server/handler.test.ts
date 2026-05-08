import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createCaptchaHandler } from './handler.js'
import {
  encodeSession,
  SESSION_COOKIE_NAME,
  type SessionData,
} from '../core/session.js'
import { issueChallengeToken } from '../core/tokens.js'
import type {
  CaptchaIssueResponse,
  CaptchaRevealTokenResponse,
} from '../core/api-types.js'

/** Minimal stand-in for Next.js's RequestCookies. */
function makeCookies(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    get: (name: string) => {
      const v = store.get(name)
      return v !== undefined ? { value: v } : undefined
    },
    set: () => { /* no-op: handler writes Set-Cookie via Response headers */ },
  }
}

function makeReq(opts: {
  url: string
  method: 'GET' | 'POST'
  cookies?: Record<string, string>
  body?: unknown
}) {
  return {
    url: opts.url,
    method: opts.method,
    cookies: makeCookies(opts.cookies ?? {}),
    json: async () => opts.body ?? {},
  }
}

async function seedCookie(session: SessionData): Promise<string> {
  return encodeSession(session)
}

describe('createCaptchaHandler — gate flow', () => {
  beforeAll(() => {
    process.env.CAPTCHA_SECRET = '12345678901234567890123456789012'
  })

  let handler: ReturnType<typeof createCaptchaHandler>
  beforeEach(() => {
    handler = createCaptchaHandler()
  })

  it('POST ?action=refresh rejects fresh session with REVEAL_TOKEN_MISSING', async () => {
    // No cookie, no reveal — bot's most direct attack vector. Must fail.
    const req = makeReq({
      url: 'http://x/api/captcha?action=refresh',
      method: 'POST',
      body: {},
    })
    const res = await handler.POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe('REVEAL_TOKEN_MISSING')
  })

  it('POST ?action=refresh rejects session with a challenge but no reveal stamp', async () => {
    // A session carrying a challenge but missing revealedAt must still be gated.
    const session: SessionData = {
      v: 1,
      attempts: 0,
      reloads: 0,
      challenge: {
        jti: 'c1',
        answer: 10,
        expiresAt: Date.now() + 30_000,
        used: false,
      },
    }
    const cookieValue = await seedCookie(session)
    const req = makeReq({
      url: 'http://x/api/captcha?action=refresh',
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: cookieValue },
      body: {},
    })
    const res = await handler.POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('REVEAL_TOKEN_MISSING')
  })

  it('POST ?action=refresh accepts session that recently completed reveal', async () => {
    const session: SessionData = {
      v: 1,
      attempts: 0,
      reloads: 0,
      revealedAt: Date.now() - 1_000,
      challenge: {
        jti: 'c1',
        answer: 10,
        expiresAt: Date.now() + 30_000,
        used: false,
      },
    }
    const cookieValue = await seedCookie(session)
    const req = makeReq({
      url: 'http://x/api/captcha?action=refresh',
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: cookieValue },
      body: {},
    })
    const res = await handler.POST(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as CaptchaIssueResponse
    expect(body.ok).toBe(true)
  })

  it('POST ?action=refresh rejects session whose reveal stamp is past the grace window', async () => {
    const session: SessionData = {
      v: 1,
      attempts: 0,
      reloads: 0,
      revealedAt: Date.now() - 10 * 60_000, // 10 min ago — past 5 min default grace
    }
    const cookieValue = await seedCookie(session)
    const req = makeReq({
      url: 'http://x/api/captcha?action=refresh',
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: cookieValue },
      body: {},
    })
    const res = await handler.POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('REVEAL_TOKEN_MISSING')
  })

  it('verify with mismatched challengeToken burns an attempt (lock budget enforced)', async () => {
    // Mismatched token must burn an attempt, otherwise bots could spam
    // random tokens forever without ever tripping maxAttempts.
    const session: SessionData = {
      v: 1,
      attempts: 4,
      reloads: 0,
      revealedAt: Date.now(),
      challenge: {
        jti: 'session-jti',
        answer: 10,
        expiresAt: Date.now() + 30_000,
        used: false,
      },
    }
    const cookieValue = await seedCookie(session)
    const wrongToken = await issueChallengeToken('different-jti', 30)

    const res = await handler.POST(
      makeReq({
        url: 'http://x/api/captcha',
        method: 'POST',
        cookies: { [SESSION_COOKIE_NAME]: cookieValue },
        body: { challengeToken: wrongToken, answer: 10, scope: 'global' },
      }),
    )
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe('SESSION_LOCKED')
  })

  it('verify with expired challenge burns an attempt', async () => {
    // Otherwise bots could wait out the TTL and resubmit indefinitely.
    const jti = 'expired-jti'
    const session: SessionData = {
      v: 1,
      attempts: 4,
      reloads: 0,
      revealedAt: Date.now(),
      challenge: {
        jti,
        answer: 10,
        expiresAt: Date.now() - 1,
        used: false,
      },
    }
    const cookieValue = await seedCookie(session)
    const token = await issueChallengeToken(jti, 30)

    const res = await handler.POST(
      makeReq({
        url: 'http://x/api/captcha',
        method: 'POST',
        cookies: { [SESSION_COOKIE_NAME]: cookieValue },
        body: { challengeToken: token, answer: 10, scope: 'global' },
      }),
    )
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe('SESSION_LOCKED')
  })

  it('?action=reveal short-circuits on locked session before decrypting token', async () => {
    // Bots hammering a locked session shouldn't amplify load via crypto work.
    const session: SessionData = {
      v: 1,
      attempts: 5,
      reloads: 0,
      lockedUntil: Date.now() + 60_000,
    }
    const cookieValue = await seedCookie(session)
    const res = await handler.POST(
      makeReq({
        url: 'http://x/api/captcha?action=reveal',
        method: 'POST',
        cookies: { [SESSION_COOKIE_NAME]: cookieValue },
        body: { revealToken: 'totally-not-a-real-token' },
      }),
    )
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe('SESSION_LOCKED')
    expect(body.retryAfterMs).toBeGreaterThan(0)
  })

  it('REVEAL resets the reload counter (no surprise lock from a stale prior session)', async () => {
    // Regression: a session with reloads at the limit, idled past the grace,
    // would re-reveal and immediately lock on the first refresh — counters
    // persisted across reveal. REVEAL is a fresh proof-of-human moment.
    const session: SessionData = {
      v: 1,
      attempts: 0,
      reloads: 7, // one click from lock under maxReloads=8
    }
    const cookieValue = await seedCookie(session)

    const tokenRes = await handler.POST(
      makeReq({
        url: 'http://x/api/captcha?action=gate',
        method: 'POST',
        cookies: { [SESSION_COOKIE_NAME]: cookieValue },
        body: {},
      }),
    )
    const tokenBody = (await tokenRes.json()) as CaptchaRevealTokenResponse
    expect(tokenBody.ok).toBe(true)
    if (!tokenBody.ok) return

    const tokenCookie = parseCookie(tokenRes.headers.get('set-cookie')!)

    const revealRes = await handler.POST(
      makeReq({
        url: 'http://x/api/captcha?action=reveal',
        method: 'POST',
        cookies: tokenCookie,
        body: { revealToken: tokenBody.revealToken },
      }),
    )
    expect(revealRes.status).toBe(200)
    const revealCookie = parseCookie(revealRes.headers.get('set-cookie')!)

    const refreshRes = await handler.POST(
      makeReq({
        url: 'http://x/api/captcha?action=refresh',
        method: 'POST',
        cookies: revealCookie,
        body: {},
      }),
    )
    expect(refreshRes.status).toBe(200)
    const refreshBody = (await refreshRes.json()) as CaptchaIssueResponse
    expect(refreshBody.ok).toBe(true)
  })

  it('full reveal flow stamps revealedAt and unlocks subsequent refresh', async () => {
    // 1) gate
    const tokenRes = await handler.POST(
      makeReq({
        url: 'http://x/api/captcha?action=gate',
        method: 'POST',
        body: {},
      }),
    )
    expect(tokenRes.status).toBe(200)
    const tokenBody = (await tokenRes.json()) as CaptchaRevealTokenResponse
    expect(tokenBody.ok).toBe(true)
    if (!tokenBody.ok) return

    const cookie1 = parseCookie(tokenRes.headers.get('set-cookie')!)

    // 2) reveal
    const revealRes = await handler.POST(
      makeReq({
        url: 'http://x/api/captcha?action=reveal',
        method: 'POST',
        cookies: cookie1,
        body: { revealToken: tokenBody.revealToken },
      }),
    )
    expect(revealRes.status).toBe(200)
    const revealBody = (await revealRes.json()) as CaptchaIssueResponse
    expect(revealBody.ok).toBe(true)

    const cookie2 = parseCookie(revealRes.headers.get('set-cookie')!)

    // 3) refresh within grace
    const refreshRes = await handler.POST(
      makeReq({
        url: 'http://x/api/captcha?action=refresh',
        method: 'POST',
        cookies: cookie2,
        body: {},
      }),
    )
    expect(refreshRes.status).toBe(200)
    const refreshBody = (await refreshRes.json()) as CaptchaIssueResponse
    expect(refreshBody.ok).toBe(true)
  })
})

/** Minimal Set-Cookie header parser — extracts the name=value pair. */
function parseCookie(setCookie: string): Record<string, string> {
  const firstPair = setCookie.split(';')[0]!
  const eq = firstPair.indexOf('=')
  if (eq === -1) return {}
  return { [firstPair.slice(0, eq).trim()]: firstPair.slice(eq + 1).trim() }
}

describe('createCaptchaHandler — config validation', () => {
  beforeAll(() => {
    process.env.CAPTCHA_SECRET = '12345678901234567890123456789012'
  })

  it('rejects lockDurationMs greater than cookie maxAgeSec', () => {
    // Without this guard, a locked abuser waits maxAgeSec for the cookie
    // to drop and arrives with a clean slate — silently shortening the
    // cooldown to whatever the cookie TTL happens to be.
    expect(() =>
      createCaptchaHandler({
        lifecycle: { lockDurationMs: 60 * 60_000 },
        cookie: { maxAgeSec: 10 * 60 },
      }),
    ).toThrow(/lockDurationMs/)
  })

  it('rejects verificationTtlMs greater than cookie maxAgeSec', () => {
    // A verification token outliving its session cookie cannot be redeemed.
    // Lower lockDurationMs so the lockDuration check passes and we test
    // the verificationTtl check specifically.
    expect(() =>
      createCaptchaHandler({
        lifecycle: {
          verificationTtlMs: 2 * 60 * 60_000,
          lockDurationMs: 5 * 60_000,
        },
        cookie: { maxAgeSec: 60 * 60 },
      }),
    ).toThrow(/verificationTtlMs/)
  })

  it('accepts safely-aligned config (lock < cookie)', () => {
    expect(() =>
      createCaptchaHandler({
        lifecycle: { lockDurationMs: 5 * 60_000 },
        cookie: { maxAgeSec: 30 * 60 },
      }),
    ).not.toThrow()
  })

  it('accepts default config (no overrides)', () => {
    expect(() => createCaptchaHandler()).not.toThrow()
  })
})