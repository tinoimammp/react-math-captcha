"use client";

import { useRef, useState, type FormEvent } from "react";
import { MathCaptcha } from "react-math-captcha/react";

interface LoginResult {
  ok: boolean;
  message: string;
  error?: string;
}

export function LoginApiForm() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LoginResult | null>(null);
  const [verified, setVerified] = useState(false);

  // We track the verification token in state so we can include it in the
  // JSON payload when calling /api/login. The hidden input is still rendered
  // by <MathCaptcha />, but for fetch() we don't go through FormData.
  const captchaTokenRef = useRef<string>("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);

    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    // Read the token that <MathCaptcha /> wrote into the hidden input.
    const captchaToken = String(fd.get("captchaToken") ?? captchaTokenRef.current);

    if (!captchaToken) {
      setResult({ ok: false, message: "Please solve the CAPTCHA first." });
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin", // ensure session cookie is sent
        body: JSON.stringify({ email, password, captchaToken }),
      });
      const data = (await res.json()) as LoginResult;
      setResult(data);
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-5 w-full max-w-md p-6 sm:p-8 rounded-2xl bg-white dark:bg-zinc-900 shadow-xl border border-zinc-200 dark:border-zinc-800"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Sign in (API)
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Submits via{" "}
          <code className="font-mono">fetch(&apos;/api/login&apos;)</code> instead of a Server Action.
        </p>
      </header>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500"
          placeholder="you@example.com"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">Password</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          minLength={4}
          className="px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500"
          placeholder="••••••••"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <MathCaptcha
          onVerified={(token) => {
            captchaTokenRef.current = token;
            setVerified(true);
          }}
        />
      </div>

      {result && !result.ok && (
        <div
          role="alert"
          className="text-sm px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300"
        >
          {result.message}
        </div>
      )}
      {result?.ok && (
        <div
          role="status"
          className="text-sm px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-300"
        >
          ✓ {result.message}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !verified}
        className="mt-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
      >
        {pending ? "Signing in…" : verified ? "Sign in" : "Verify CAPTCHA first"}
      </button>

      <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
        Hint: any password ≥ 4 chars is accepted in this demo.
      </p>
    </form>
  );
}