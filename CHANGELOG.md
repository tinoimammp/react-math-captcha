# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-09-11

### Changed
- Upgraded `jose` to v6 (JWE seal/open behavior unchanged; no public API impact)
- Dropped the `nanoid` dependency — challenge/verification `jti` values are now generated with the built-in `crypto.randomUUID()` (already used elsewhere in the codebase), avoiding a transitive dependency whose newer major requires Node ≥22 while this package targets Node ≥18

## [0.1.0] - 2026-05-09

Initial public release.

### Added

#### Core
- Stateless, encrypted-cookie session engine using JWE (`dir` + `A256GCM` via `jose`)
- Per-session lifecycle state machine: challenge issuance, attempts, reloads, lock-out
- One-time challenges with TTL, max-attempts cooldown, and reload budget
- Drag-to-reveal gate with grace window for repeated reloads (proof-of-human)
- SVG-based challenge rendering — SSR-safe, no canvas, Edge-runtime compatible
- Configurable operators (`+`, `-`, `*`)
- Granular error codes for every failure mode (16 codes total)

#### Server
- `createCaptchaHandler()` — Next.js App Router handler factory with route actions:
  - `?action=gate` — issue gate token
  - `?action=reveal` — redeem gate token, issue first challenge
  - `?action=refresh` — new challenge within reveal grace window
  - default — verify answer
- `verifyCaptchaToken()` — server-side validation accepting either `FormData` or raw token string
- Eager config validation: rejects `lockDurationMs > cookieMaxAgeSec` at construction
- Lock enforcement on the verify endpoint (defends against banking a token before lock)
- Burn-on-fail attempts policy (mismatched / expired / used tokens all decrement budget)
- Environment variable fallbacks: `CAPTCHA_SECRET` → `AUTH_SECRET` → `NEXTAUTH_SECRET`

#### React
- `<MathCaptcha />` — drop-in widget with built-in modal, slider, and verification flow
- `useCaptcha()` — headless hook for custom UI
- Auto-reset on verification token expiry (no stale tokens reach the server)
- Abort-controller-based cancellation for fetch and submit
- Defensive client/server skew handling for `attemptsLeft <= 0`

#### Theming
- `theme` prop with `'light' | 'dark' | 'auto'` presets (auto follows `prefers-color-scheme`)
- `appearance` prop accepting a typed `CaptchaAppearance` object (27 design tokens) — applied as scoped inline CSS variables
- All built-in styles use `var(--rmc-*, fallback)` so plain CSS overrides cascade in from any ancestor
- `disableInjectedStyles` for bring-your-own-CSS setups (Tailwind, CSS Modules, etc.)
- `styleNonce` prop for strict-CSP environments using `style-src 'nonce-...'`

### Tested
- 64 unit tests covering crypto seal/open, generator, lifecycle state machine, token issuance/validation, server handler, and `verifyCaptchaToken`

### Documentation
- Full README with quick-start, server/client/HTTP API reference, theming guide, environment variables, recipes, and security model
- Interactive demo project (`demo-nextjs/`) with three pages: Server Action login, API route login, and a live theming playground showcasing seven preset variants

[0.1.1]: https://github.com/tinoimammp/react-math-captcha/releases/tag/v0.1.1
[0.1.0]: https://github.com/tinoimammp/react-math-captcha/releases/tag/v0.1.0
