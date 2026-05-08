import Link from "next/link";

/**
 * Inline SVGs avoid pulling in an icon library for what is just a handful
 * of glyphs. Stroke-based; inherit `currentColor` so they automatically
 * match each button's text colour in both light & dark themes.
 */
function ArrowRightIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24"
      fill="currentColor" aria-hidden="true"
    >
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.93 10.93 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.73 18.27.5 12 .5z" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.27-.38-.62-.38-1 0-.83.67-1.49 1.5-1.49H16c3.31 0 6-2.69 6-6 0-4.97-4.5-9-10-9z" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="7" rx="1" />
      <rect x="2" y="14" width="20" height="7" rx="1" />
      <line x1="6" y1="6.5" x2="6.01" y2="6.5" />
      <line x1="6" y1="17.5" x2="6.01" y2="17.5" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 dark:bg-black px-4 sm:px-6 py-12 sm:py-20">
      <div className="max-w-2xl w-full flex flex-col items-center text-center gap-6 sm:gap-8">
        <span className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-semibold tracking-wide uppercase">
          react-math-captcha • demo
        </span>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Self-hosted math CAPTCHA
          <br className="hidden sm:inline" />
          <span className="sm:hidden"> </span>
          for React &amp; Next.js
        </h1>

        <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
          A lightweight, no-redis, no-tracking CAPTCHA solution. Try the demo
          below to see how the{" "}
          <code className="font-mono px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800">
            &lt;MathCaptcha /&gt;
          </code>{" "}
          widget integrates with a Next.js Server Action.
        </p>

        {/* Buttons wrap to 2 rows on small/medium and stay single row on large.
            `flex-wrap` + `justify-center` keeps everything readable instead of
            forcing a vertical stack on tablets. */}
        {/* Buttons wrap to 2 rows on small/medium and stay single row on large.
            `flex-wrap` + `justify-center` keeps everything readable instead of
            forcing a vertical stack on tablets. */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-3 w-full sm:w-auto">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-medium hover:opacity-90 transition"
          >
            <ServerIcon />
            <span>Server Action demo</span>
            <ArrowRightIcon />
          </Link>
          <Link
            href="/login-api"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
          >
            <CodeIcon />
            <span>API Route demo</span>
            <ArrowRightIcon />
          </Link>
          <Link
            href="/theming"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
          >
            <PaletteIcon />
            <span>Theming</span>
            <ArrowRightIcon />
          </Link>
          <a
            href="https://github.com/tinoimammp/react-math-captcha"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900 transition"
          >
            <GitHubIcon />
            <span>GitHub</span>
          </a>
        </div>
      </div>
    </main>
  );
}
