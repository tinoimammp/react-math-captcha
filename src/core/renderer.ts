/**
 * SVG renderer for math CAPTCHA challenges.
 *
 * Per README philosophy:
 *   - Readable, clean, human-friendly
 *   - Slight random rotation (max ~8 degrees)
 *   - Random spacing
 *   - Light noise (a few lines + dots)
 *
 * Output is a pure SVG string (no DOM dependency).
 *
 * Glyphs are emitted as <path> strokes (not <text>) so the literal
 * answer characters never appear in the markup — defeating the cheap
 * `regex on the SVG response` bypass.
 */

import type { Challenge } from './generator.js'
import { GLYPH_HEIGHT, SPACE_ADVANCE, getGlyph } from './glyphs.js'

export interface RenderOptions {
  width?: number
  height?: number
  background?: string
  foreground?: string
  /** Deterministic randomness seed. If omitted, uses crypto. */
  seed?: number
}

function makeRng(seed?: number): () => number {
  if (seed === undefined) {
    return () => {
      const buf = new Uint32Array(1)
      crypto.getRandomValues(buf)
      return buf[0]! / 0xffffffff
    }
  }
  // Mulberry32 deterministic PRNG
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function renderSvg(challenge: Challenge, options: RenderOptions = {}): string {
  const width = options.width ?? 200
  const height = options.height ?? 80
  const bg = options.background ?? '#f3f4f6'
  const fg = options.foreground ?? '#111827'
  const rand = makeRng(options.seed)

  // Append the unsolved-equation suffix so a human sees "3 + 5 = ?".
  const text = `${challenge.display} = ?`
  const chars = [...text]

  // Layout: distribute glyph boxes horizontally with jitter.
  // Glyphs are 24×36 native. We aim for ~60% of canvas height so there's
  // breathing room around them (matches the look of the old <text> renderer).
  const padX = 14
  const targetGlyphH = Math.min(height * 0.6, 32)
  const scale = targetGlyphH / GLYPH_HEIGHT
  // Vertically center the glyph box in the canvas.
  const baselineY = (height - GLYPH_HEIGHT * scale) / 2

  // Pre-compute layout to also center horizontally.
  type Item = { ch: string; x: number; y: number; rot: number; advance: number }
  const items: Item[] = []
  let cursorX = padX
  for (const ch of chars) {
    const isSpace = ch === ' '
    const glyph = isSpace ? null : getGlyph(ch)
    const advance = (glyph?.advance ?? SPACE_ADVANCE) * scale
    const jitterX = (rand() - 0.5) * 4
    const jitterY = (rand() - 0.5) * 6
    const rot = (rand() - 0.5) * 16 // -8..+8 degrees
    items.push({
      ch,
      x: cursorX + jitterX,
      y: baselineY + jitterY,
      rot,
      advance,
    })
    cursorX += advance + 2 + (rand() - 0.5) * 3
  }

  // Center horizontally (cursorX is the right edge after last advance)
  const totalWidth = cursorX + padX
  const offsetX = (width - totalWidth) / 2

  const glyphs: string[] = []
  for (const item of items) {
    if (item.ch === ' ') continue
    const glyph = getGlyph(item.ch)
    if (!glyph) continue
    glyphs.push(
      `<path d="${glyph.d}" ` +
        `transform="translate(${(item.x + offsetX).toFixed(2)} ${item.y.toFixed(2)}) ` +
        `scale(${scale.toFixed(3)}) ` +
        `rotate(${item.rot.toFixed(2)} ${(glyph.advance / 2).toFixed(2)} ${(GLYPH_HEIGHT / 2).toFixed(2)})" ` +
        `fill="none" stroke="${fg}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />`,
    )
  }

  // Noise: 2 thin lines
  const lines: string[] = []
  for (let i = 0; i < 2; i++) {
    const x1 = rand() * width
    const y1 = rand() * height
    const x2 = rand() * width
    const y2 = rand() * height
    lines.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${fg}" stroke-opacity="0.25" stroke-width="1" />`,
    )
  }

  // Noise: 8 dots
  const dots: string[] = []
  for (let i = 0; i < 8; i++) {
    const cx = rand() * width
    const cy = rand() * height
    const r = 0.8 + rand() * 1.4
    dots.push(
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(2)}" fill="${fg}" fill-opacity="0.35" />`,
    )
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="math captcha">` +
    `<rect width="100%" height="100%" fill="${bg}" />` +
    lines.join('') +
    glyphs.join('') +
    dots.join('') +
    `</svg>`
  )
}

/** Convenience: SVG string -> data URL for use in <img src>. */
export function svgToDataUrl(svg: string): string {
  // Use base64 to avoid URL-encoding edge cases.
  const b64
    = typeof Buffer !== 'undefined'
      ? Buffer.from(svg, 'utf8').toString('base64')
      : btoa(unescape(encodeURIComponent(svg)))
  return `data:image/svg+xml;base64,${b64}`
}
