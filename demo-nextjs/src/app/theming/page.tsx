import { ThemingDemo } from "./ThemingDemo";
import { BackLink } from "../_components/BackLink";

export default function ThemingPage() {
  return (
        <main className="min-h-screen bg-zinc-50 dark:bg-black px-4 sm:px-6 py-10 sm:py-16">
      <div className="max-w-5xl mx-auto flex flex-col gap-6 sm:gap-10">
                <header className="flex flex-col gap-3">
          <BackLink />
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Theming the captcha
          </h1>
          <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 max-w-2xl">
            Four ways to customise the look of <code className="font-mono">&lt;MathCaptcha /&gt;</code>:
            built-in <code className="font-mono">theme</code> presets, the
            typed <code className="font-mono">appearance</code> prop, plain CSS
            variables, or shipping your own stylesheet entirely.
          </p>
        </header>

        <ThemingDemo />
      </div>
    </main>
  );
}