/**
 * SVG path glyphs for the limited set of characters used by math CAPTCHA.
 *
 * Coordinate system per glyph: 24 wide × 36 tall, top-left origin.
 * Baseline of digits sits roughly at y=32 (typographic descender at y=36).
 *
 * Strokes are rendered with `stroke` (no fill) so a single path data
 * value is reusable. Each glyph is a small set of straight + quadratic
 * Bézier segments — readable to humans, opaque to OCR text-extraction
 * (since there's no <text> node) and harder to regex out of the SVG.
 */

export interface Glyph {
  /** Path 'd' attribute value. */
  d: string
  /** Advance width (used by layout). */
  advance: number
}

// Reusable points
// Convention: each digit roughly fits in box (4..20, 4..32).
// Curves use Q (quadratic) for smoothness without overengineering.

const GLYPHS: Record<string, Glyph> = {
  '0': {
    advance: 22,
    // Oval
    d: 'M 12 4 Q 4 4 4 18 Q 4 32 12 32 Q 20 32 20 18 Q 20 4 12 4 Z',
  },
  '1': {
    advance: 16,
    // Slanted top + vertical stem + base
    d: 'M 6 10 L 12 4 L 12 32 M 6 32 L 18 32',
  },
  '2': {
    advance: 22,
    // top curve, diagonal, bottom line
    d: 'M 4 10 Q 4 4 12 4 Q 20 4 20 12 Q 20 18 12 22 L 4 32 L 20 32',
  },
  '3': {
    advance: 22,
    // two right-facing bumps
    d: 'M 4 8 Q 8 4 14 4 Q 20 4 20 10 Q 20 16 12 18 Q 20 18 20 26 Q 20 32 14 32 Q 8 32 4 28',
  },
  '4': {
    advance: 22,
    // diagonal down + horizontal + vertical stem
    d: 'M 14 4 L 4 22 L 20 22 M 16 4 L 16 32',
  },
  '5': {
    advance: 22,
    // top bar, left stem half, bottom bowl
    d: 'M 20 4 L 6 4 L 5 16 Q 12 14 18 18 Q 20 22 18 28 Q 14 32 6 30',
  },
  '6': {
    advance: 22,
    // descending arc into closed loop
    d: 'M 18 6 Q 12 4 8 10 Q 4 18 4 24 Q 4 32 12 32 Q 20 32 20 24 Q 20 16 12 16 Q 6 16 4 22',
  },
  '7': {
    advance: 22,
    // top bar + diagonal
    d: 'M 4 4 L 20 4 L 8 32',
  },
  '8': {
    advance: 22,
    // two stacked loops
    d: 'M 12 4 Q 6 4 6 10 Q 6 16 12 18 Q 18 18 18 12 Q 18 4 12 4 M 12 18 Q 4 18 4 25 Q 4 32 12 32 Q 20 32 20 25 Q 20 18 12 18',
  },
  '9': {
    advance: 22,
    // closed loop top + descending tail
    d: 'M 20 18 Q 18 16 12 16 Q 4 16 4 10 Q 4 4 12 4 Q 20 4 20 12 Q 20 22 16 28 Q 12 32 6 30',
  },
  '+': {
    advance: 22,
    // crosshair centered around (12,18)
    d: 'M 12 8 L 12 28 M 4 18 L 20 18',
  },
  '-': {
    advance: 18,
    d: 'M 4 18 L 16 18',
  },
  '×': {
    advance: 22,
    d: 'M 5 11 L 19 25 M 19 11 L 5 25',
  },
  '=': {
    advance: 22,
    d: 'M 4 14 L 20 14 M 4 22 L 20 22',
  },
  '?': {
    advance: 22,
    d: 'M 4 10 Q 4 4 12 4 Q 20 4 20 10 Q 20 16 12 18 L 12 24 M 12 30 L 12 32',
  },
}

/** Width of a space character (advance only, no stroke). */
export const SPACE_ADVANCE = 8

/** Get the glyph for a character, or null if unsupported. */
export function getGlyph(ch: string): Glyph | null {
  return GLYPHS[ch] ?? null
}

/** Glyph box height (for layout). */
export const GLYPH_HEIGHT = 36
/** Glyph box width baseline (for layout). */
export const GLYPH_WIDTH = 24
