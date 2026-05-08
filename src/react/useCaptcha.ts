'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CaptchaIssueResponse,
  CaptchaVerifyResponse,
  CaptchaRevealTokenResponse,
} from '../core/api-types.js'
import type { CaptchaErrorCode } from '../core/errors.js'

export type CaptchaStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'verifying'
  | 'verified'
  | 'error'
  | 'locked'

export interface CaptchaState {
  status: CaptchaStatus
  svg: string | null
  challengeToken: string | null
  verificationToken: string | null
  expiresAt: number | null
  /** Human-readable message. Safe to display. */
  error: string | null
  /** Server error code, or `null` for client-side / success states. */
  errorCode: CaptchaErrorCode | null
  /** Ms until lock release (when status === 'locked'). */
  retryAfterMs: number | null
  /** Remaining attempts (after wrong answer). */
  attemptsLeft: number | null
}

export interface UseCaptchaOptions {
  /** API endpoint where createCaptchaHandler is mounted. */
  endpoint?: string
  /** Form scope. Must match server-side. Defaults to `"global"`. */
  scope?: string
}

export interface UseCaptchaReturn extends CaptchaState {
  /** Issue a new challenge within the reveal grace window. */
  refresh: () => Promise<void>
  /** Issue the first challenge after the drag-to-reveal gate. */
  reveal: () => Promise<void>
  submit: (answer: string | number) => Promise<boolean>
  reset: () => void
}

const DEFAULT_ENDPOINT = '/api/captcha'

export function useCaptcha(options: UseCaptchaOptions = {}): UseCaptchaReturn {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT
  const { scope = 'global' } = options

  const [state, setState] = useState<CaptchaState>({
    status: 'idle',
    svg: null,
    challengeToken: null,
    verificationToken: null,
    expiresAt: null,
    error: null,
    errorCode: null,
    retryAfterMs: null,
    attemptsLeft: null,
  })

  // Separate aborters for fetch and submit so they can cancel each other
  // (and themselves on unmount) without trampling.
  const fetchAbortRef = useRef<AbortController | null>(null)
  const submitAbortRef = useRef<AbortController | null>(null)
  // Mirror challengeToken in a ref so submit() reads the freshest value
  // without re-creating the callback on every state change.
  const challengeTokenRef = useRef<string | null>(null)

  const fetchChallenge = useCallback(
    async (mode: 'refresh' | 'reveal') => {
      fetchAbortRef.current?.abort()
      const ac = new AbortController()
      fetchAbortRef.current = ac
      setState(s => ({ ...s, status: 'loading', error: null, errorCode: null }))
      try {
        let url: string
        let body: string

        if (mode === 'reveal') {
          // Two-step: gate token first, then redeem.
          const tokenRes = await fetch(`${endpoint}?action=gate`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: '{}',
            signal: ac.signal,
            cache: 'no-store',
          })
          const tokenData = (await tokenRes.json()) as CaptchaRevealTokenResponse
          if (!tokenData.ok) {
            if (tokenData.error === 'SESSION_LOCKED') {
              setState({
                status: 'locked',
                svg: null,
                challengeToken: null,
                verificationToken: null,
                expiresAt: null,
                error: tokenData.message ?? tokenData.error,
                errorCode: tokenData.error,
                retryAfterMs: tokenData.retryAfterMs ?? null,
                attemptsLeft: null,
              })
              return
            }
            setState(s => ({
              ...s,
              status: 'error',
              error: tokenData.message ?? tokenData.error,
              errorCode: tokenData.error,
            }))
            return
          }
          url = `${endpoint}?action=reveal`
          body = JSON.stringify({ revealToken: tokenData.revealToken })
        } else {
          url = `${endpoint}?action=refresh`
          body = '{}'
        }

        const res = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body,
          signal: ac.signal,
          cache: 'no-store',
        })
        const data = (await res.json()) as CaptchaIssueResponse
        if (!data.ok) {
          if (data.error === 'SESSION_LOCKED') {
            setState({
              status: 'locked',
              svg: null,
              challengeToken: null,
              verificationToken: null,
              expiresAt: null,
              error: data.message ?? data.error,
              errorCode: data.error,
              retryAfterMs: data.retryAfterMs ?? null,
              attemptsLeft: null,
            })
            return
          }
          // Reveal-flow errors invalidate any cached challenge — wipe it so
          // the UI doesn't show a stale SVG and MathCaptcha can detect
          // "no active challenge" cleanly.
          const isRevealFlowError
            = data.error === 'REVEAL_TOKEN_MISSING'
            || data.error === 'REVEAL_TOKEN_EXPIRED'
            || data.error === 'REVEAL_TOKEN_INVALID'
          if (isRevealFlowError) {
            setState({
              status: 'error',
              svg: null,
              challengeToken: null,
              verificationToken: null,
              expiresAt: null,
              error: data.message ?? data.error,
              errorCode: data.error,
              retryAfterMs: null,
              attemptsLeft: null,
            })
            return
          }
          setState(s => ({
            ...s,
            status: 'error',
            error: data.message ?? data.error,
            errorCode: data.error,
          }))
          return
        }
        setState({
          status: 'ready',
          svg: data.svg,
          challengeToken: data.challengeToken,
          verificationToken: null,
          expiresAt: data.expiresAt,
          error: null,
          errorCode: null,
          retryAfterMs: null,
          attemptsLeft: null,
        })
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setState(s => ({ ...s, status: 'error', error: (e as Error).message, errorCode: null }))
      }
    },
    [endpoint],
  )

  const refresh = useCallback(() => fetchChallenge('refresh'), [fetchChallenge])
  const reveal = useCallback(() => fetchChallenge('reveal'), [fetchChallenge])

  // Sync the ref with state. Read only inside async callbacks, never during render.
  useEffect(() => {
    challengeTokenRef.current = state.challengeToken
  }, [state.challengeToken])

  const submit = useCallback(
    async (answer: string | number): Promise<boolean> => {
      // Read via ref to avoid stale closures when a concurrent refresh has
      // landed between the user clicking Verify and this call running.
      const token = challengeTokenRef.current
      if (!token) return false

      // Abort any in-flight fetch and any previous submit (e.g. double-click).
      fetchAbortRef.current?.abort()
      submitAbortRef.current?.abort()
      const ac = new AbortController()
      submitAbortRef.current = ac

      setState(s => ({ ...s, status: 'verifying', error: null, errorCode: null }))

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ challengeToken: token, answer, scope }),
          signal: ac.signal,
          cache: 'no-store',
        })
        const data = (await res.json()) as CaptchaVerifyResponse
        if (!data.ok) {
          // Treat "out of attempts" as locked even if server says INCORRECT_ANSWER
          // (defensive guard against client/server version skew).
          const isLocked =
            data.error === 'SESSION_LOCKED' ||
            (data.error === 'INCORRECT_ANSWER' &&
              typeof data.attemptsLeft === 'number' &&
              data.attemptsLeft <= 0)
          if (isLocked) {
            setState({
              status: 'locked',
              svg: null,
              challengeToken: null,
              verificationToken: null,
              expiresAt: null,
              error: data.message ?? data.error,
              errorCode: data.error,
              retryAfterMs: data.retryAfterMs ?? null,
              attemptsLeft: 0,
            })
            return false
          }
          // Trust the server's `attemptsLeft` so we honour whatever maxAttempts is configured.
          const attemptsLeft =
            data.error === 'INCORRECT_ANSWER' && typeof data.attemptsLeft === 'number'
              ? data.attemptsLeft
              : null
          await fetchChallenge('refresh')
          // If refresh surfaced a fresher reveal-flow error, keep it — that's
          // more actionable than the original verify error.
          setState(s => {
            const refreshHadRevealError
              = s.errorCode === 'REVEAL_TOKEN_MISSING'
              || s.errorCode === 'REVEAL_TOKEN_EXPIRED'
              || s.errorCode === 'REVEAL_TOKEN_INVALID'
              || s.status === 'locked'
            if (refreshHadRevealError) return s
            return {
              ...s,
              status: s.status === 'ready' ? 'error' : s.status,
              error: data.message ?? data.error,
              errorCode: data.error,
              attemptsLeft,
            }
          })
          return false
        }
        setState(s => ({
          ...s,
          status: 'verified',
          verificationToken: data.verificationToken,
          expiresAt: data.expiresAt,
          error: null,
          errorCode: null,
        }))
        return true
      } catch (e) {
        if ((e as Error).name === 'AbortError') return false
        setState(s => ({ ...s, status: 'error', error: (e as Error).message, errorCode: null }))
        return false
      }
    },
    // No state.challengeToken dep — read via ref to keep callback identity stable.
    [endpoint, scope, fetchChallenge],
  )

  const reset = useCallback(() => {
    fetchAbortRef.current?.abort()
    submitAbortRef.current?.abort()
    setState({
      status: 'idle',
      svg: null,
      challengeToken: null,
      verificationToken: null,
      expiresAt: null,
      error: null,
      errorCode: null,
      retryAfterMs: null,
      attemptsLeft: null,
    })
  }, [])

  // Cleanup pending requests on unmount. No auto-load: drag-to-reveal is the gate.
  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort()
      submitAbortRef.current?.abort()
    }
  }, [])

  return { ...state, refresh, reveal, submit, reset }
}