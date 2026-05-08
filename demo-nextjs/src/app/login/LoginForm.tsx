"use client";

import { useActionState, useState } from "react";
import { MathCaptcha } from "react-math-captcha/react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState | null = null;

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [verified, setVerified] = useState(false);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 w-full max-w-md p-6 sm:p-8 rounded-2xl bg-white dark:bg-zinc-900 shadow-xl border border-zinc-200 dark:border-zinc-800"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Sign in
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Demo of <code className="font-mono">react-math-captcha</code>.
        </p>
      </header>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          defaultValue={state?.email ?? ""}
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

      {/*
        The <MathCaptcha /> widget renders a "I'm not a robot" trigger and
        injects a hidden <input name="captchaToken" /> with the verification
        token, which is read by `verifyCaptchaToken(formData)` server-side.
      */}
      <div className="flex flex-col gap-1.5">
        <MathCaptcha onVerified={() => setVerified(true)} />
      </div>

      {state && !state.ok && (
        <div
          role="alert"
          className="text-sm px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300"
        >
          {state.message}
        </div>
      )}
      {state?.ok && (
        <div
          role="status"
          className="text-sm px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-300"
        >
          ✓ {state.message}
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