'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useCaptcha, type UseCaptchaOptions } from './useCaptcha.js'
import { RevealSlider } from './RevealSlider.js'
import type { CaptchaErrorCode } from '../core/errors.js'

/**
 * Appearance overrides. Every visual property maps to a CSS variable
 * (`--rmc-*`) so consumers can customise via:
 *
 *   1. The `appearance` prop — typed; scoped to this widget instance via inline style.
 *   2. The `theme` prop — `'light' | 'dark' | 'auto'` presets.
 *   3. Plain CSS — set `--rmc-*` on any ancestor and it cascades in.
 *   4. `disableInjectedStyles: true` + your own stylesheet for full control.
 *
 * Defaults reproduce the original visual design 1:1, so adopting overrides
 * is fully backward-compatible: existing users see no change.
 */
export interface CaptchaAppearance {
  fontFamily?: string
  surface?: string
  surfaceText?: string
  mutedText?: string
  border?: string
  radius?: string
  modalRadius?: string
  primary?: string
  primaryHover?: string
  primaryDisabled?: string
  primaryText?: string
  success?: string
  successSurface?: string
  danger?: string
  dangerSurface?: string
  dangerBorder?: string
  challengeBg?: string
  challengeBorder?: string
  backdrop?: string
  sliderTrackFrom?: string
  sliderTrackTo?: string
  sliderTrackBorder?: string
  sliderFillFrom?: string
  sliderFillTo?: string
  sliderKnob?: string
  sliderLabel?: string
  sliderActive?: string
}

/** Map TS keys → CSS var names. Stable: part of the public API. */
const APPEARANCE_VAR_MAP: Record<keyof CaptchaAppearance, string> = {
  fontFamily:        '--rmc-font-family',
  surface:           '--rmc-surface',
  surfaceText:       '--rmc-surface-text',
  mutedText:         '--rmc-muted-text',
  border:            '--rmc-border',
  radius:            '--rmc-radius',
  modalRadius:       '--rmc-modal-radius',
  primary:           '--rmc-primary',
  primaryHover:      '--rmc-primary-hover',
  primaryDisabled:   '--rmc-primary-disabled',
  primaryText:       '--rmc-primary-text',
  success:           '--rmc-success',
  successSurface:    '--rmc-success-surface',
  danger:            '--rmc-danger',
  dangerSurface:     '--rmc-danger-surface',
  dangerBorder:      '--rmc-danger-border',
  challengeBg:       '--rmc-challenge-bg',
  challengeBorder:   '--rmc-challenge-border',
  backdrop:          '--rmc-backdrop',
  sliderTrackFrom:   '--rmc-slider-track-from',
  sliderTrackTo:     '--rmc-slider-track-to',
  sliderTrackBorder: '--rmc-slider-track-border',
  sliderFillFrom:    '--rmc-slider-fill-from',
  sliderFillTo:      '--rmc-slider-fill-to',
  sliderKnob:        '--rmc-slider-knob',
  sliderLabel:       '--rmc-slider-label',
  sliderActive:      '--rmc-slider-active',
}

/** appearance → inline `style` map of `--rmc-*` vars (scoped to widget instance). */
function appearanceToStyle(appearance?: CaptchaAppearance): React.CSSProperties | undefined {
  if (!appearance) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(appearance)) {
    if (typeof v !== 'string') continue
    const cssVar = APPEARANCE_VAR_MAP[k as keyof CaptchaAppearance]
    if (cssVar) out[cssVar] = v
  }
  return out as React.CSSProperties
}

/** Pick user-facing copy per error code, scoped to the visible panel. */
function errorMessage(
  code: CaptchaErrorCode | null,
  fallback: string,
  panel: 'reveal' | 'challenge',
): string {
  if (panel === 'reveal') {
    switch (code) {
      case 'REVEAL_TOKEN_EXPIRED':
        return 'Reveal expired. Slide again to get a fresh challenge.'
      case 'REVEAL_TOKEN_INVALID':
        return 'Reveal token was rejected. Slide again to retry.'
      case 'REVEAL_TOKEN_MISSING':
        return 'Reveal token missing. Slide again to retry.'
      case 'INTERNAL_ERROR':
        return 'Something went wrong on our side. Slide again to retry.'
      default:
        return `${fallback}. Slide again to retry.`
    }
  }
  // panel === 'challenge'
  switch (code) {
    case 'CHALLENGE_TOKEN_EXPIRED':
      return 'Challenge expired. A new one was loaded — please solve it.'
    case 'CHALLENGE_NOT_FOUND':
    case 'CHALLENGE_ALREADY_USED':
    case 'CHALLENGE_TOKEN_INVALID':
      return 'Challenge is no longer valid. A new one was loaded.'
    case 'INTERNAL_ERROR':
      return 'Something went wrong. Please try again.'
    default:
      return fallback
  }
}

/**
 * Every rule uses `var(--rmc-*, fallback)` so the no-theming path looks
 * identical to before. The dark preset just re-declares the vars at a
 * deeper selector. Inline-style overrides from the appearance prop always
 * win because inline style beats class specificity.
 */
const STYLES = `
  .rmc-wrapper {
    font-family: var(--rmc-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif);
    display: inline-block;
  }

  .rmc-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--rmc-muted-text, #6b7280);
    letter-spacing: 0.03em;
    margin-bottom: 4px;
  }

  .rmc-trigger {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border: 1.5px solid var(--rmc-border, #d1d5db);
    border-radius: var(--rmc-radius, 8px);
    background: var(--rmc-surface, #ffffff);
    cursor: pointer;
    user-select: none;
    min-width: 260px;
    max-width: 380px;
    transition: border-color 0.2s, background 0.2s;
    box-sizing: border-box;
  }
  .rmc-trigger[data-status="verified"] {
    border-color: var(--rmc-success, #22c55e);
    background: var(--rmc-success-surface, #f0fdf4);
    cursor: default;
  }
  .rmc-trigger[data-status="locked"],
  .rmc-trigger[data-status="error"] {
    border-color: var(--rmc-danger, #ef4444);
    background: var(--rmc-danger-surface, #fef2f2);
    cursor: default;
  }

  .rmc-checkbox {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    border: 2px solid var(--rmc-muted-text, #9ca3af);
    background: var(--rmc-surface, #ffffff);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.2s;
  }
  .rmc-checkbox[data-checked="true"] {
    border-color: var(--rmc-success, #22c55e);
    background: var(--rmc-success, #22c55e);
  }

  .rmc-trigger-text {
    flex: 1;
    font-size: 14px;
    color: var(--rmc-surface-text, #374151);
    font-weight: 500;
  }
  .rmc-trigger-text[data-verified="true"] { color: var(--rmc-success, #15803d); }

  .rmc-shield {
    flex-shrink: 0;
    color: var(--rmc-primary, #3b82f6);
    opacity: 0.9;
  }
  .rmc-shield[data-verified="true"] { color: var(--rmc-success, #22c55e); }

  .rmc-backdrop {
    position: fixed;
    inset: 0;
    background: var(--rmc-backdrop, rgba(0,0,0,0.45));
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }

  .rmc-modal {
    background: var(--rmc-surface, #ffffff);
    border-radius: var(--rmc-modal-radius, 16px);
    padding: 28px 28px 24px;
    width: 380px;
    max-width: calc(100vw - 32px);
    box-shadow: 0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08);
    display: flex;
    flex-direction: column;
    gap: 20px;
    box-sizing: border-box;
    animation: rmc-fadeIn 0.18s ease;
  }

  .rmc-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--rmc-surface-text, #111827);
    margin: 0;
  }

  .rmc-subtitle {
    font-size: 13px;
    color: var(--rmc-muted-text, #6b7280);
    text-align: center;
    margin: 0;
  }

  .rmc-svg-box {
    background: var(--rmc-challenge-bg, #f8fafc);
    border: 1.5px solid var(--rmc-challenge-border, #e5e7eb);
    border-radius: var(--rmc-radius, 10px);
    min-height: 90px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 10px 16px;
  }
  .rmc-svg-box[data-error="true"] {
    background: var(--rmc-danger-surface, #fef2f2);
    border-color: var(--rmc-danger-border, #fca5a5);
  }

  .rmc-svg-placeholder {
    color: var(--rmc-muted-text, #9ca3af);
    font-size: 13px;
  }

  .rmc-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: var(--rmc-danger-surface, #fef2f2);
    border: 1.5px solid var(--rmc-danger-border, #fca5a5);
    border-radius: var(--rmc-radius, 8px);
    color: var(--rmc-danger, #dc2626);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
  }

  .rmc-input {
    width: 100%;
    padding: 11px 14px;
    font-size: 15px;
    border: 1.5px solid var(--rmc-border, #d1d5db);
    border-radius: var(--rmc-radius, 8px);
    outline: none;
    color: var(--rmc-surface-text, #111827);
    background: var(--rmc-surface, #ffffff);
    box-sizing: border-box;
    transition: border-color 0.15s;
    font-family: inherit;
  }
  .rmc-input:focus    { border-color: var(--rmc-primary, #3b82f6); }
  .rmc-input:disabled { background: var(--rmc-challenge-bg, #f9fafb); }

  .rmc-reload-row {
    display: flex;
    justify-content: flex-end;
    margin-top: -8px;
  }

  .rmc-reload-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--rmc-primary, #3b82f6);
    font-size: 13px;
    font-weight: 500;
    padding: 2px 0;
    font-family: inherit;
    transition: opacity 0.15s;
  }
  .rmc-reload-btn:hover:not(:disabled) { text-decoration: underline; }
  .rmc-reload-btn:disabled {
    color: var(--rmc-muted-text, #9ca3af);
    cursor: not-allowed;
    opacity: 0.6;
  }

  .rmc-warning-icon {
    font-size: 15px;
    flex-shrink: 0;
  }

  .rmc-actions {
    display: flex;
    gap: 10px;
    margin-top: 4px;
  }

  .rmc-cancel-btn {
    flex: 1;
    padding: 10px 0;
    border: 1.5px solid var(--rmc-border, #d1d5db);
    border-radius: var(--rmc-radius, 8px);
    background: var(--rmc-surface, #ffffff);
    color: var(--rmc-surface-text, #374151);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }
  .rmc-cancel-btn:hover:not(:disabled) { background: var(--rmc-challenge-bg, #f9fafb); }
  .rmc-cancel-btn:disabled {
    color: var(--rmc-muted-text, #9ca3af);
    cursor: not-allowed;
  }

  .rmc-verify-btn {
    flex: 1;
    padding: 10px 0;
    border: none;
    border-radius: var(--rmc-radius, 8px);
    background: var(--rmc-primary, #2563eb);
    color: var(--rmc-primary-text, #ffffff);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }
  .rmc-verify-btn:hover:not(:disabled) { background: var(--rmc-primary-hover, #1d4ed8); }
  .rmc-verify-btn:disabled {
    background: var(--rmc-primary-disabled, #93c5fd);
    cursor: not-allowed;
  }

  @keyframes rmc-fadeIn {
    from { opacity: 0; transform: scale(0.95) translateY(8px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* Drag-to-reveal slider */
  .rmc-slider-track {
    position: relative;
    height: 52px;
    min-width: 220px;
    border-radius: var(--rmc-radius, 10px);
    background: linear-gradient(
      90deg,
      var(--rmc-slider-track-from, #eef2ff) 0%,
      var(--rmc-slider-track-to,   #e0e7ff) 100%
    );
    border: 1.5px solid var(--rmc-slider-track-border, #c7d2fe);
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
    touch-action: pan-y;
    box-sizing: border-box;
    transition: border-color 0.2s ease;
  }
  .rmc-slider-track[data-state="dragging"],
  .rmc-slider-track[data-state="completed"] {
    border-color: var(--rmc-success, #86efac);
  }
  .rmc-slider-track[data-disabled="true"] { opacity: 0.55; }

  /* The fill trail. Initial width 0; updated imperatively by RevealSlider
     while dragging, and animates to 100% on completion / back to 0 on
     spring-back. Sits behind the label & knob (z-index 0). */
  .rmc-slider-fill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 0;
    background: linear-gradient(
      90deg,
      var(--rmc-slider-fill-from, #86efac) 0%,
      var(--rmc-slider-fill-to,   #4ade80) 100%
    );
    pointer-events: none;
    will-change: width;
    z-index: 0;
  }

  .rmc-slider-label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--rmc-slider-label, #4338ca);
    letter-spacing: 0.01em;
    pointer-events: none;
    padding: 0 24px 0 56px;
    text-align: center;
    z-index: 1;
    /* Soft shadow keeps the label legible once the green fill slides under it. */
    text-shadow: 0 1px 2px rgba(255,255,255,0.6);
    transition: color 0.2s ease;
  }
  .rmc-slider-track[data-state="dragging"]  .rmc-slider-label,
  .rmc-slider-track[data-state="completed"] .rmc-slider-label {
    color: var(--rmc-slider-active, #166534);
  }

  .rmc-slider-knob {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 44px;
    height: 44px;
    border-radius: var(--rmc-radius, 8px);
    background: var(--rmc-slider-knob, #ffffff);
    box-shadow: 0 2px 6px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--rmc-slider-label, #4338ca);
    cursor: grab;
    touch-action: none;
    will-change: transform;
    outline: none;
    z-index: 2;
    transition: color 0.2s ease, box-shadow 0.2s ease;
  }
  .rmc-slider-knob:focus-visible {
    box-shadow: 0 0 0 3px rgba(59,130,246,0.45), 0 2px 6px rgba(0,0,0,0.12);
  }
  .rmc-slider-track[data-state="dragging"] .rmc-slider-knob {
    cursor: grabbing;
    color: var(--rmc-slider-active, #15803d);
    box-shadow: 0 4px 12px rgba(34,197,94,0.35), 0 1px 2px rgba(0,0,0,0.08);
  }
  .rmc-slider-track[data-state="completed"] .rmc-slider-knob {
    color: var(--rmc-slider-active, #15803d);
    cursor: default;
  }

  /* Dark preset: re-declares vars at a deeper selector. Inline-style
     overrides from the appearance prop still win because inline beats class. */
  .rmc-theme-dark {
    --rmc-surface:           #1f2937;
    --rmc-surface-text:      #f3f4f6;
    --rmc-muted-text:        #9ca3af;
    --rmc-border:            #374151;
    --rmc-primary:           #3b82f6;
    --rmc-primary-hover:     #2563eb;
    --rmc-primary-disabled:  #1e3a8a;
    --rmc-primary-text:      #ffffff;
    --rmc-success:           #22c55e;
    --rmc-success-surface:   #052e16;
    --rmc-danger:            #f87171;
    --rmc-danger-surface:    #450a0a;
    --rmc-danger-border:     #7f1d1d;
    --rmc-challenge-bg:      #111827;
    --rmc-challenge-border:  #374151;
    --rmc-backdrop:          rgba(0,0,0,0.65);
    --rmc-slider-track-from: #1e293b;
    --rmc-slider-track-to:   #0f172a;
    --rmc-slider-track-border: #334155;
    --rmc-slider-fill-from:  #15803d;
    --rmc-slider-fill-to:    #166534;
    --rmc-slider-knob:       #f3f4f6;
    --rmc-slider-label:      #cbd5e1;
    --rmc-slider-active:     #4ade80;
  }
  .rmc-theme-dark .rmc-modal {
    box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4);
  }
  .rmc-theme-dark .rmc-slider-label { text-shadow: none; }

  /* Auto: follow OS preference. Same overrides as dark, gated by media query. */
  @media (prefers-color-scheme: dark) {
    .rmc-theme-auto {
      --rmc-surface:           #1f2937;
      --rmc-surface-text:      #f3f4f6;
      --rmc-muted-text:        #9ca3af;
      --rmc-border:            #374151;
      --rmc-primary:           #3b82f6;
      --rmc-primary-hover:     #2563eb;
      --rmc-primary-disabled:  #1e3a8a;
      --rmc-primary-text:      #ffffff;
      --rmc-success:           #22c55e;
      --rmc-success-surface:   #052e16;
      --rmc-danger:            #f87171;
      --rmc-danger-surface:    #450a0a;
      --rmc-danger-border:     #7f1d1d;
      --rmc-challenge-bg:      #111827;
      --rmc-challenge-border:  #374151;
      --rmc-backdrop:          rgba(0,0,0,0.65);
      --rmc-slider-track-from: #1e293b;
      --rmc-slider-track-to:   #0f172a;
      --rmc-slider-track-border: #334155;
      --rmc-slider-fill-from:  #15803d;
      --rmc-slider-fill-to:    #166534;
      --rmc-slider-knob:       #f3f4f6;
      --rmc-slider-label:      #cbd5e1;
      --rmc-slider-active:     #4ade80;
    }
    .rmc-theme-auto .rmc-modal {
      box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4);
    }
    .rmc-theme-auto .rmc-slider-label { text-shadow: none; }
  }
`

/**
 * One-time style injection. Idempotent across mounts.
 *
 *   - `disable` skips injection entirely so consumers can ship their own
 *     stylesheet (Tailwind, CSS Modules, global CSS) — the widget renders
 *     bare classes and inherits whatever the page provides.
 *   - `nonce` supports CSP `style-src 'nonce-...'` deployments. Without it,
 *     a strict-CSP page would silently drop the injected `<style>`.
 */
let _stylesInjected = false
function injectStyles(disable: boolean, nonce?: string) {
  if (disable || _stylesInjected || typeof document === 'undefined') return
  _stylesInjected = true
  const el = document.createElement('style')
  el.setAttribute('data-rmc', '')
  if (nonce) el.setAttribute('nonce', nonce)
  el.textContent = STYLES
  document.head.appendChild(el)
}

function ShieldIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2L4 5.5V11C4 15.42 7.45 19.57 12 21C16.55 19.57 20 15.42 20 11V5.5L12 2Z" fill={color} opacity="0.15" />
      <path d="M12 2L4 5.5V11C4 15.42 7.45 19.57 12 21C16.55 19.57 20 15.42 20 11V5.5L12 2Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function ReloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12C4 7.58 7.58 4 12 4c2.35 0 4.46.96 6 2.5L20 8M20 12c0 4.42-3.58 8-8 8-2.35 0-4.46-.96-6-2.5L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <polyline points="20,4 20,8 16,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="4,20 4,16 8,16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <polyline points="2,6 5,9 10,3" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export interface MathCaptchaProps extends UseCaptchaOptions {
  /** Name of the hidden input that carries the verification token to your form. */
  name?: string
  /** CSS class on the outer wrapper. */
  className?: string
  /** Optional label above the trigger. Hidden by default. */
  headerLabel?: string
  /** Callback fired after successful verification. */
  onVerified?: (verificationToken: string) => void

  /**
   * Visual preset:
   *   - `'light'` (default) — original look.
   *   - `'dark'` — dark surfaces.
   *   - `'auto'` — follows `prefers-color-scheme`.
   *
   * Appearance overrides still beat the preset, so `theme="dark"` + a
   * custom `appearance.primary` works as expected.
   */
  theme?: 'light' | 'dark' | 'auto'
  /**
   * Per-instance visual overrides. Each key maps to a `--rmc-*` CSS
   * variable applied as inline style on the wrapper, so it scopes cleanly
   * to this widget without touching global CSS.
   */
  appearance?: CaptchaAppearance
  /**
   * Skip injecting the built-in stylesheet — bring your own. Useful when
   * styling via Tailwind/CSS Modules, or when the bundle size of the
   * default styles is unwelcome. The widget renders the same `rmc-*`
   * classes either way.
   */
  disableInjectedStyles?: boolean
  /**
   * CSP nonce for the injected `<style>` element. Required if your page
   * uses `style-src 'nonce-...'`; without it, strict-CSP environments
   * will silently drop the styles.
   */
  styleNonce?: string
}

export function MathCaptcha(props: MathCaptchaProps) {
  const {
    name = 'captchaToken',
    className,
    headerLabel,
    onVerified,
    theme = 'light',
    appearance,
    disableInjectedStyles = false,
    styleNonce,
    ...hookOpts
  } = props

  injectStyles(disableInjectedStyles, styleNonce)

  // Memoise so we don't allocate a new style object every render —
  // otherwise React would diff inline style on each parent re-render.
  const appearanceStyle = useMemo(() => appearanceToStyle(appearance), [appearance])
  const themeClass = theme === 'dark' ? 'rmc-theme-dark' : theme === 'auto' ? 'rmc-theme-auto' : ''

  const captcha = useCaptcha(hookOpts)

  const [modalOpen, setModalOpen] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [answer, setAnswer] = useState('')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)

  // Hide trigger text until mounted to avoid SSR/hydration flash.
  useEffect(() => { setMounted(true) }, [])

  const isVerified = captcha.status === 'verified'
  const isLocked   = captcha.status === 'locked'
  const isBusy     = captcha.status === 'loading' || captcha.status === 'verifying'
  const hasError   = captcha.status === 'error'
  const isReady    = mounted && captcha.status !== 'loading'

  // Lock countdown + auto-reset when cooldown elapses. Without the reset()
  // the user would be stuck on "Locked — retry in 0s" forever.
  useEffect(() => {
    if (captcha.status !== 'locked' || !captcha.retryAfterMs) {
      setCountdown(null)
      return
    }
    const target = Date.now() + captcha.retryAfterMs
    setCountdown(Math.max(0, target - Date.now()))
    const id = setInterval(() => {
      const left = target - Date.now()
      if (left <= 0) {
        clearInterval(id)
        setCountdown(null)
        captcha.reset()
      } else {
        setCountdown(left)
      }
    }, 250)
    return () => clearInterval(id)
  }, [captcha.status, captcha.retryAfterMs, captcha])

  useEffect(() => {
    if (isVerified && captcha.verificationToken && onVerified) {
      onVerified(captcha.verificationToken)
    }
  }, [isVerified, captcha.verificationToken, onVerified])

  // Send the user back to the slider when the reveal gate is broken:
  // either the initial reveal failed, or a refresh hit REVEAL_TOKEN_*.
  // Other errors (wrong answer, expired challenge) stay in-modal.
  useEffect(() => {
    if (!revealed) return
    const isRevealFlowError
      = captcha.errorCode === 'REVEAL_TOKEN_MISSING'
      || captcha.errorCode === 'REVEAL_TOKEN_EXPIRED'
      || captcha.errorCode === 'REVEAL_TOKEN_INVALID'
    const initialRevealFailed
      = captcha.status === 'error' && !captcha.challengeToken
    if (isRevealFlowError || initialRevealFailed) {
      setRevealed(false)
    }
  }, [revealed, captcha.status, captcha.challengeToken, captcha.errorCode])

  // Auto-expire the verification token so a stale token never reaches the form.
  useEffect(() => {
    if (!isVerified || !captcha.expiresAt) return
    const msLeft = captcha.expiresAt - Date.now()
    if (msLeft <= 0) {
      captcha.reset()
      return
    }
    const id = setTimeout(() => { captcha.reset() }, msLeft)
    return () => clearTimeout(id)
  }, [isVerified, captcha.expiresAt, captcha])

  const handleCancel = useCallback(() => {
    setModalOpen(false)
    setAnswer('')
    setRevealed(false)
    // Abort any in-flight request and snap back to idle.
    captcha.reset()
  }, [captcha])

  // Close on ESC
  useEffect(() => {
    if (!modalOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [modalOpen, handleCancel])

  const handleTrigger = useCallback(() => {
    if (isVerified || isLocked) return
    setAnswer('')
    setRevealed(false)
    setModalOpen(true)
    // No pre-fetch: drag-to-reveal is the gate.
  }, [isVerified, isLocked])

  const handleReveal = useCallback(() => {
    setRevealed(true)
    void captcha.reveal()
  }, [captcha])

  const handleRefresh = useCallback(() => {
    setAnswer('')
    void captcha.refresh()
  }, [captcha])

  const handleVerifySuccess = useCallback(() => {
    setModalOpen(false)
    setAnswer('')
    setRevealed(false)
  }, [])

  async function handleVerify() {
    if (!answer.trim() || isBusy) return
    const ok = await captcha.submit(answer)
    if (ok) {
      handleVerifySuccess()
    } else {
      setAnswer('')
    }
  }

  const triggerStatus = isVerified ? 'verified' : isLocked ? 'locked' : hasError ? 'error' : 'idle'

  // Build wrapper className: base + theme preset + user override.
  const wrapperClass = [
    'rmc-wrapper',
    themeClass,
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={wrapperClass} style={appearanceStyle}>
      {headerLabel && <div className="rmc-label">{headerLabel}</div>}

      <div
        className="rmc-trigger"
        data-status={triggerStatus}
        role="button"
        tabIndex={isVerified || isLocked ? -1 : 0}
        aria-label={isVerified ? 'Verification complete' : 'Click to verify'}
        onClick={handleTrigger}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleTrigger()}
      >
        <span className="rmc-checkbox" data-checked={String(isVerified)}>
          {isVerified && <CheckIcon />}
        </span>
        {isReady && (
          <>
            <span className="rmc-trigger-text" data-verified={String(isVerified)}>
              {isLocked
                ? `Locked${countdown !== null ? ` — retry in ${Math.ceil(countdown / 1000)}s` : ''}`
                : "I'm not a robot"}
            </span>
            <span className="rmc-shield" data-verified={String(isVerified)}>
              <ShieldIcon color={isVerified ? '#22c55e' : '#3b82f6'} />
            </span>
          </>
        )}
      </div>

      {modalOpen && (
        <div
          className="rmc-backdrop"
          onClick={e => { if (e.target === e.currentTarget) handleCancel() }}
          aria-modal="true"
          role="dialog"
          aria-label="CAPTCHA Verification"
        >
          <div className="rmc-modal">
            <h2 className="rmc-title">Confirm you&apos;re human</h2>
            {/* Subtitle only shown on the challenge panel — the slider
                already labels itself, so duplicating it here is noise. */}
            {(revealed || isLocked) && (
              <p className="rmc-subtitle">Solve the math problem below:</p>
            )}

            {!revealed && !isLocked ? (
              <>
                {/* Reveal-flow error → tell the user why they're back at the slider. */}
                {hasError && captcha.error && !captcha.challengeToken && (
                  <div className="rmc-warning">
                    <span aria-hidden="true" className="rmc-warning-icon">⚠</span>
                    <span>{errorMessage(captcha.errorCode, captcha.error, 'reveal')}</span>
                  </div>
                )}
                <RevealSlider onComplete={handleReveal} />
              </>
            ) : (
              <>
                {captcha.svg ? (
                  <div
                    className="rmc-svg-box"
                    data-error={String(hasError && !isBusy)}
                    dangerouslySetInnerHTML={{ __html: captcha.svg }}
                  />
                ) : (
                  <div
                    className="rmc-svg-box"
                    data-error={String(hasError && !isBusy)}
                  >
                    <span className="rmc-svg-placeholder">
                      {isBusy ? 'Loading…' : hasError ? 'Failed to load' : '—'}
                    </span>
                  </div>
                )}

                {(captcha.error || isLocked) && (
                  <div className="rmc-warning">
                    <span aria-hidden="true" className="rmc-warning-icon">⚠</span>
                    <span>
                      {isLocked
                        ? `Session locked. Try again${countdown !== null ? ` in ${Math.ceil(countdown / 1000)}s.` : ' later.'}`
                        : captcha.attemptsLeft !== null
                        ? `Incorrect. ${captcha.attemptsLeft} attempt${captcha.attemptsLeft === 1 ? '' : 's'} remaining.`
                        : errorMessage(captcha.errorCode, captcha.error ?? 'Error', 'challenge')}
                    </span>
                  </div>
                )}

                <input
                  className="rmc-input"
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void handleVerify()}
                  placeholder="Type your answer here..."
                  disabled={isBusy || isLocked || !captcha.challengeToken}
                  aria-label="CAPTCHA answer"
                  autoFocus={!isLocked}
                />

                {!isLocked && (
                  <div className="rmc-reload-row">
                    <button
                      type="button"
                      className="rmc-reload-btn"
                      onClick={handleRefresh}
                      disabled={isBusy}
                      aria-label="Get a new challenge"
                    >
                      <ReloadIcon />
                      New Challenge
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="rmc-actions">
              <button
                type="button"
                className="rmc-cancel-btn"
                onClick={handleCancel}
                disabled={isBusy}
              >
                Cancel
              </button>
              {revealed && !isLocked && (
                <button
                  type="button"
                  className="rmc-verify-btn"
                  onClick={() => void handleVerify()}
                  disabled={isBusy || !answer.trim()}
                >
                  {isBusy ? 'Verifying…' : 'Verify'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <input type="hidden" name={name} value={captcha.verificationToken ?? ''} readOnly />
    </div>
  )
}
