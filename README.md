# react-math-captcha

Self-hosted math CAPTCHA for React & Next.js. No Redis, no tracking, no third-party.

- Encrypted cookie sessions (JWE / AES-256-GCM via `jose`)
- One-time challenges, expiry, attempt limit, cooldown
- Drag-to-reveal gate before challenge issuance
- SVG rendering — SSR-safe, no canvas
- Edge-runtime compatible
- TypeScript-first

---

## Install

```bash
npm install react-math-captcha
```

Peers: `react >= 18`, `next >= 14` (optional, only for the route handler).

---

## Quick start (Next.js App Router)

**1. Set the secret** (`.env.local`):

```bash
CAPTCHA_SECRET=at-least-16-characters-please-rotate-me
```

**2. Mount the route**:

```ts
// app/api/captcha/route.ts
import { createCaptchaHandler } from 'react-math-captcha/server'
export const { POST } = createCaptchaHandler()
```

**3. Drop the widget**:

```tsx
'use client'
import { MathCaptcha } from 'react-math-captcha/react'

export default function Form() {
  return (
    <form action={register}>
      <input name="email" />
      <MathCaptcha />
      <button>Sign up</button>
    </form>
  )
}
```

**4. Verify on submit**:

```ts
'use server'
import { verifyCaptchaToken } from 'react-math-captcha/server'

export async function register(formData: FormData) {
  await verifyCaptchaToken(formData) // throws CaptchaError if invalid
  // ...
}
```

Multi-form? Pass a scope:

```tsx
<MathCaptcha scope="register" />
await verifyCaptchaToken(formData, 'register')
```

---

## How it works

```
1. User clicks the widget    → modal opens
2. User drags the slider     → POST ?action=gate     (request to open the gate)
3. Slider completes          → POST ?action=reveal   → SVG challenge
4. User types answer         → POST /api/captcha     → verificationToken
5. Form submits with token   → verifyCaptchaToken()  → consumed (one-time)
```

Within a 5-minute grace window, "New Challenge" clicks (`?action=refresh`)
skip the slider — the user has already proven they're human.

Defaults:

| | |
|---|---|
| Challenge TTL | 30s |
| Verification TTL | 30s |
| Reveal token TTL | 60s |
| Reveal grace window | 5 min |
| Max wrong attempts | 5 |
| Max reloads | 8 |
| Lock duration | 15 min |

---

## Server API

### `createCaptchaHandler(options?)`

```ts
createCaptchaHandler({
  secret: 'override',                    // default: CAPTCHA_SECRET
  operators: ['+', '-'],                 // default: ['+', '-', '*']
  lifecycle: {
    challengeTtlMs: 30_000,
    verificationTtlMs: 30_000,
    maxAttempts: 5,
    maxReloads: 8,
    lockDurationMs: 15 * 60_000,
    revealGraceMs: 5 * 60_000,
  },
  cookie: { sameSite: 'lax', secure: true, maxAgeSec: 1800 },
  render: { width: 200, height: 80, background: '#f3f4f6', foreground: '#111827' },
})
```

Throws `CaptchaError('CONFIG_ERROR')` at construction if `lockDurationMs` or `verificationTtlMs` exceeds `cookie.maxAgeSec` — a cookie expiring before the lock would silently bypass the cooldown.

### `verifyCaptchaToken(token, scope?, opts?)`

Throws `CaptchaError` on any failure. Consumes the token on success (single-use).

```ts
await verifyCaptchaToken(formData)                           // scope='global'
await verifyCaptchaToken(formData, 'login')
await verifyCaptchaToken(rawTokenString, 'login')
await verifyCaptchaToken(formData, 'login', { inputName: 'myField' })
```

```ts
import { CaptchaError } from 'react-math-captcha/server'

try {
  await verifyCaptchaToken(formData, 'register')
} catch (err) {
  if (err instanceof CaptchaError) {
    // err.code, err.status, err.message
    return { ok: false, code: err.code }
  }
  throw err
}
```

---

## Client API

### `<MathCaptcha />`

| Prop | Type | Default |
|---|---|---|
| `scope` | `string` | `'global'` |
| `endpoint` | `string` | `'/api/captcha'` |
| `name` | `string` | `'captchaToken'` |
| `onVerified` | `(token: string) => void` | — |
| `headerLabel` | `string` | — |
| `className` | `string` | — |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` |
| `appearance` | `CaptchaAppearance` | — |
| `disableInjectedStyles` | `boolean` | `false` |
| `styleNonce` | `string` | — |

Styles inject once via `<style data-rmc>`. See [Theming](#theming) below.

### `useCaptcha(options)` — headless hook

```tsx
const c = useCaptcha({ scope: 'login' })

c.status              // 'idle' | 'loading' | 'ready' | 'verifying' | 'verified' | 'error' | 'locked'
c.svg                 // string | null
c.challengeToken      // string | null
c.verificationToken   // string | null  ← put this in your form
c.expiresAt           // epoch ms
c.attemptsLeft        // number | null
c.retryAfterMs        // number | null  (when locked)
c.error               // string | null
c.errorCode           // CaptchaErrorCode | null

await c.reveal()       // first challenge after drag-to-reveal gate
await c.refresh()      // new challenge (within grace window)
await c.submit(answer) // returns boolean
c.reset()
```

Options: `endpoint`, `scope`.

The widget auto-resets when the verification token expires, so a stale token never reaches your server.

---

## HTTP API

For non-React clients. Types exported from `react-math-captcha/core`.

| Endpoint | Purpose |
|---|---|
| `POST /api/captcha?action=gate` | Get a gate token (the "key" required to open the gate) |
| `POST /api/captcha?action=reveal` | Redeem gate token → first challenge |
| `POST /api/captcha?action=refresh` | New challenge within reveal grace |
| `POST /api/captcha` | Verify answer |

**Verify request:**

```json
{ "challengeToken": "...", "answer": 8, "scope": "global" }
```

**Success:**

```json
{ "ok": true, "verificationToken": "...", "expiresAt": 1735689630000 }
```

**Failure:**

```json
{ "ok": false, "error": "INCORRECT_ANSWER", "message": "...", "attemptsLeft": 3, "maxAttempts": 5 }
```

```ts
import type { CaptchaIssueResponse, CaptchaVerifyResponse } from 'react-math-captcha/core'
```

### Error codes

**Reveal flow** — `REVEAL_TOKEN_MISSING` · `REVEAL_TOKEN_EXPIRED` · `REVEAL_TOKEN_INVALID`
**Challenge flow** — `CHALLENGE_TOKEN_MISSING` · `CHALLENGE_TOKEN_EXPIRED` · `CHALLENGE_TOKEN_INVALID` · `CHALLENGE_NOT_FOUND` · `CHALLENGE_ALREADY_USED` · `INCORRECT_ANSWER`
**Verification flow** — `VERIFICATION_TOKEN_MISSING` · `VERIFICATION_TOKEN_EXPIRED` · `VERIFICATION_TOKEN_INVALID` · `VERIFICATION_SCOPE_MISMATCH`
**Other** — `SESSION_LOCKED` (429) · `INVALID_INPUT` · `CONFIG_ERROR` · `INTERNAL_ERROR`

UI behavior in `<MathCaptcha />`:

- `REVEAL_TOKEN_*` → returns to slider
- `CHALLENGE_*` / `INCORRECT_ANSWER` → stays in modal, auto-loads new challenge
- `SESSION_LOCKED` → shows countdown, auto-unlocks when `retryAfterMs` elapses

---

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `CAPTCHA_SECRET` | — | **Required.** Min 16 chars. Falls back to `AUTH_SECRET` / `NEXTAUTH_SECRET`. |
| `CAPTCHA_MAX_ATTEMPTS` | `5` | |
| `CAPTCHA_MAX_RELOADS` | `8` | |
| `CAPTCHA_TTL_SEC` | `30` | Challenge expiry |
| `CAPTCHA_LOCK_SEC` | `900` | Cooldown |
| `CAPTCHA_REVEAL_GRACE_SEC` | `300` | Refresh grace after reveal |

Code options in `createCaptchaHandler()` override env vars.

---

## Theming

Every visual property maps to a `--rmc-*` CSS variable. Defaults reproduce the original look exactly — the new theming API is fully backward-compatible.

**Four ways to theme**, in precedence order (later wins):

### 1. `theme` preset

```tsx
<MathCaptcha theme="dark" />        // dark surfaces
<MathCaptcha theme="auto" />        // follows prefers-color-scheme
<MathCaptcha theme="light" />       // default
```

### 2. `appearance` prop — typed, per-instance

```tsx
<MathCaptcha
  appearance={{
    primary: '#8b5cf6',
    primaryHover: '#7c3aed',
    radius: '12px',
    surface: '#fafafa',
  }}
/>
```

Applied as inline `style` on the wrapper, so it scopes cleanly to this widget. Combine with `theme` for a base preset plus per-property overrides:

```tsx
<MathCaptcha theme="dark" appearance={{ primary: '#22d3ee' }} />
```

### 3. Plain CSS — set `--rmc-*` on any ancestor

```css
.my-app {
  --rmc-primary: #ec4899;
  --rmc-radius: 14px;
}
```

Useful for a global theme that applies to every `<MathCaptcha />` on the page.

### 4. Bring your own CSS

```tsx
<MathCaptcha disableInjectedStyles />
```

Skips style injection entirely. The widget still emits the same `rmc-*` classes — write your own CSS / Tailwind / CSS Modules to match.

### CSP — strict `style-src`

If your app sets `Content-Security-Policy: style-src 'nonce-xyz'`, pass the same nonce:

```tsx
<MathCaptcha styleNonce={cspNonce} />
```

Without it, strict-CSP environments will silently drop the injected `<style>`.

### Appearance reference

| Key | CSS variable | Default |
|---|---|---|
| `fontFamily` | `--rmc-font-family` | system stack |
| `surface` | `--rmc-surface` | `#ffffff` |
| `surfaceText` | `--rmc-surface-text` | `#111827` |
| `mutedText` | `--rmc-muted-text` | `#6b7280` |
| `border` | `--rmc-border` | `#d1d5db` |
| `radius` | `--rmc-radius` | `8px` |
| `modalRadius` | `--rmc-modal-radius` | `16px` |
| `primary` | `--rmc-primary` | `#2563eb` |
| `primaryHover` | `--rmc-primary-hover` | `#1d4ed8` |
| `primaryDisabled` | `--rmc-primary-disabled` | `#93c5fd` |
| `primaryText` | `--rmc-primary-text` | `#ffffff` |
| `success` | `--rmc-success` | `#22c55e` |
| `successSurface` | `--rmc-success-surface` | `#f0fdf4` |
| `danger` | `--rmc-danger` | `#ef4444` |
| `dangerSurface` | `--rmc-danger-surface` | `#fef2f2` |
| `dangerBorder` | `--rmc-danger-border` | `#fca5a5` |
| `challengeBg` | `--rmc-challenge-bg` | `#f8fafc` |
| `challengeBorder` | `--rmc-challenge-border` | `#e5e7eb` |
| `backdrop` | `--rmc-backdrop` | `rgba(0,0,0,0.45)` |
| `sliderTrackFrom` | `--rmc-slider-track-from` | `#eef2ff` |
| `sliderTrackTo` | `--rmc-slider-track-to` | `#e0e7ff` |
| `sliderTrackBorder` | `--rmc-slider-track-border` | `#c7d2fe` |
| `sliderFillFrom` | `--rmc-slider-fill-from` | `#86efac` |
| `sliderFillTo` | `--rmc-slider-fill-to` | `#4ade80` |
| `sliderKnob` | `--rmc-slider-knob` | `#ffffff` |
| `sliderLabel` | `--rmc-slider-label` | `#4338ca` |
| `sliderActive` | `--rmc-slider-active` | `#15803d` |

```ts
import type { CaptchaAppearance } from 'react-math-captcha/react'
```

---

## Recipes

**API route instead of Server Action:**

```ts
export async function POST(req: Request) {
  const { captchaToken } = await req.json()
  try {
    await verifyCaptchaToken(captchaToken, 'login')
  } catch (err) {
    if (err instanceof CaptchaError) {
      return Response.json({ error: err.code }, { status: err.status })
    }
    throw err
  }
  // ...
}
```

**Reset after submit:**

```tsx
const c = useCaptcha({ scope: 'comment' })
async function post() {
  await fetch('/api/comments', {
    method: 'POST',
    body: JSON.stringify({ token: c.verificationToken }),
  })
  c.reset()
}
```

**Custom endpoint:**

```ts
// app/api/auth/captcha/route.ts
export const { POST } = createCaptchaHandler()
```
```tsx
<MathCaptcha endpoint="/api/auth/captcha" />
```

**Kid-friendly:**

```ts
createCaptchaHandler({ operators: ['+'] })
```

---

## Security model

Designed to stop **casual abuse** — spam bots, replay attacks, low-effort automation.

**Not** designed to stop AI OCR, LLM solvers, CAPTCHA farms, or enterprise botnets.

> Make abuse annoying and expensive, not impossible.

---

## License

MIT