"use server";

import { CaptchaError, verifyCaptchaToken } from "react-math-captcha/server";

export interface LoginState {
  ok: boolean;
  message: string;
  email?: string;
}

/**
 * Server Action that simulates a login submission.
 * It verifies the CAPTCHA before "authenticating" the user.
 */
export async function loginAction(
  _prev: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, message: "Email and password are required." };
  }

  // 1. CAPTCHA — throws CaptchaError if invalid.
  try {
    // Single-form app: scope is 'global' (the package's default).
    await verifyCaptchaToken(formData);
  } catch (err) {
    if (err instanceof CaptchaError) {
      return { ok: false, message: `CAPTCHA failed: ${err.message}` };
    }
    return { ok: false, message: "CAPTCHA verification failed." };
  }

  // 2. Pretend to authenticate (replace with real auth logic).
  await new Promise((r) => setTimeout(r, 400));
  if (password.length < 4) {
    return { ok: false, message: "Invalid credentials.", email };
  }

  return { ok: true, message: `Welcome back, ${email}!`, email };
}