/**
 * CAPTCHA endpoint mounted at /api/captcha.
 *
 *   POST /api/captcha?action=gate     → issue gate token
 *   POST /api/captcha?action=reveal   → redeem gate → first challenge
 *   POST /api/captcha?action=refresh  → new challenge (within grace)
 *   POST /api/captcha                 → verify answer
 *
 * Reads `CAPTCHA_SECRET` from env. Edge-compatible.
 */
import { createCaptchaHandler } from "react-math-captcha/server";

export const { POST } = createCaptchaHandler({
  // Optional overrides — env vars are usually enough.
  // operators: ['+', '-'],
  // lifecycle: { maxAttempts: 5, maxReloads: 8 },
  // render: { width: 220, height: 70 },
});