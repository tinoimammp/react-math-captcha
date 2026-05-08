/**
 * POST /api/login
 *
 * Accepts JSON: { email, password, captchaToken }
 * Validates CAPTCHA before "authenticating". Returns JSON.
 *
 * Note: when calling `verifyCaptchaToken` outside a Server Action,
 * pass the raw token string (not FormData).
 */
import { NextResponse } from "next/server";
import { CaptchaError, verifyCaptchaToken } from "react-math-captcha/server";

interface LoginBody {
  email?: unknown;
  password?: unknown;
  captchaToken?: unknown;
}

export async function POST(req: Request) {
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const captchaToken =
    typeof body.captchaToken === "string" ? body.captchaToken : "";

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, message: "Email and password are required." },
      { status: 400 },
    );
  }

  // 1. CAPTCHA — pass the raw token string. `verifyCaptchaToken`
  //    reads the session cookie via `next/headers` internally.
  try {
    await verifyCaptchaToken(captchaToken);
  } catch (err) {
    if (err instanceof CaptchaError) {
      return NextResponse.json(
        { ok: false, error: err.code, message: `CAPTCHA failed: ${err.message}` },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { ok: false, message: "CAPTCHA verification failed." },
      { status: 400 },
    );
  }

  // 2. Pretend to authenticate (replace with real auth logic).
  await new Promise((r) => setTimeout(r, 400));
  if (password.length < 4) {
    return NextResponse.json(
      { ok: false, message: "Invalid credentials." },
      { status: 401 },
    );
  }

  // 3. Success — in a real app you'd set an auth cookie / JWT here.
  return NextResponse.json({
    ok: true,
    message: `Welcome back, ${email}!`,
    user: { email },
  });
}