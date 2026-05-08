"use client";

import { useState } from "react";
import {
  MathCaptcha,
  type CaptchaAppearance,
} from "react-math-captcha/react";

/**
 * Each preset corresponds to one of the documented theming approaches.
 * The component re-mounts the captcha when switching presets (via `key`)
 * so a verified state from a previous variant doesn't bleed across — the
 * goal here is to *see* each style fresh, not preserve verification.
 */
type PresetId =
  | "default"
  | "dark"
  | "auto"
  | "purple"
  | "rose"
  | "emerald"
  | "byo-css";

interface Preset {
  id: PresetId;
  label: string;
  description: string;
  /** Code shown in the snippet pane; kept in sync with the rendered widget. */
  snippet: string;
  /** Render the variant. */
  render: () => React.ReactNode;
}

const PURPLE: CaptchaAppearance = {
  primary: "#8b5cf6",
  primaryHover: "#7c3aed",
  primaryDisabled: "#c4b5fd",
  success: "#10b981",
  radius: "12px",
  modalRadius: "20px",
  sliderTrackFrom: "#f3e8ff",
  sliderTrackTo: "#e9d5ff",
  sliderTrackBorder: "#d8b4fe",
  sliderLabel: "#6b21a8",
  sliderActive: "#5b21b6",
  sliderFillFrom: "#c4b5fd",
  sliderFillTo: "#a78bfa",
};

const ROSE: CaptchaAppearance = {
  primary: "#e11d48",
  primaryHover: "#be123c",
  primaryDisabled: "#fda4af",
  radius: "999px",
  modalRadius: "24px",
  sliderTrackFrom: "#ffe4e6",
  sliderTrackTo: "#fecdd3",
  sliderTrackBorder: "#fda4af",
  sliderLabel: "#9f1239",
  sliderActive: "#881337",
  sliderFillFrom: "#fecaca",
  sliderFillTo: "#f87171",
};

const PRESETS: Preset[] = [
  {
    id: "default",
    label: "Default",
    description: "No props — what you get out of the box.",
    snippet: `<MathCaptcha />`,
    render: () => <MathCaptcha />,
  },
  {
    id: "dark",
    label: "Dark preset",
    description: "Built-in dark theme. One prop, done.",
    snippet: `<MathCaptcha theme="dark" />`,
    render: () => <MathCaptcha theme="dark" />,
  },
  {
    id: "auto",
    label: "Auto",
    description:
      "Follows prefers-color-scheme. Toggle your OS theme to see it switch.",
    snippet: `<MathCaptcha theme="auto" />`,
    render: () => <MathCaptcha theme="auto" />,
  },
  {
    id: "purple",
    label: "Purple brand",
    description:
      "Custom appearance object. Combine with theme=\"dark\" if you want dark surfaces too.",
    snippet: `const purple: CaptchaAppearance = {
  primary: '#8b5cf6',
  primaryHover: '#7c3aed',
  radius: '12px',
  modalRadius: '20px',
  // ...slider tints
}

<MathCaptcha appearance={purple} />`,
    render: () => <MathCaptcha appearance={PURPLE} />,
  },
  {
    id: "rose",
    label: "Rose pill",
    description: "Pill-shaped buttons via radius: '999px'.",
    snippet: `<MathCaptcha
  appearance={{
    primary: '#e11d48',
    primaryHover: '#be123c',
    radius: '999px',
    modalRadius: '24px',
  }}
/>`,
    render: () => <MathCaptcha appearance={ROSE} />,
  },
  {
    id: "emerald",
    label: "Emerald + dark base",
    description:
      "theme=\"dark\" gives the base; appearance overrides win per-property.",
    snippet: `<MathCaptcha theme="dark" appearance={{
  primary: '#10b981',
  primaryHover: '#059669',
  sliderActive: '#34d399',
}} />`,
    render: () => (
      <MathCaptcha
        theme="dark"
        appearance={{
          primary: "#10b981",
          primaryHover: "#059669",
          sliderActive: "#34d399",
        }}
      />
    ),
  },
  {
    id: "byo-css",
    label: "Plain CSS vars",
    description:
      "Skip theme/appearance, set --rmc-* on an ancestor. Useful for global theming.",
    snippet: `/* globals.css */
.my-emerald-zone {
  --rmc-primary: #059669;
  --rmc-primary-hover: #047857;
  --rmc-radius: 10px;
}

/* page.tsx */
<div className="my-emerald-zone">
  <MathCaptcha />
</div>`,
    render: () => (
      <div
        // Inline equivalent of `.my-emerald-zone` so the demo works without
        // touching globals.css. In a real app you'd put these in a class.
        style={
          {
            "--rmc-primary": "#059669",
            "--rmc-primary-hover": "#047857",
            "--rmc-radius": "10px",
          } as React.CSSProperties
        }
      >
        <MathCaptcha />
      </div>
    ),
  },
];

export function ThemingDemo() {
  const [active, setActive] = useState<PresetId>("default");
  const preset = PRESETS.find((p) => p.id === active)!;

  return (
    <div className="grid lg:grid-cols-[220px_1fr] gap-4 sm:gap-6">
      {/* Preset switcher.
          Mobile/tablet: wrapping pill row (compact and contained — no
          overflow tricks).
          Desktop (lg+): vertical sidebar. */}
      <aside className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 px-1">
          Variants
        </h2>
        <div className="flex flex-wrap lg:flex-col gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              className={`text-left px-3 py-2 lg:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition border ${
                active === p.id
                  ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white"
                  : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </aside>

      {/* Live preview + code */}
      <section className="flex flex-col gap-4 sm:gap-5 min-w-0">
        <div className="rounded-xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
              {preset.label}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {preset.description}
            </p>
          </div>

          {/* Re-mount on preset change so each variant starts from a clean
              "idle" state — otherwise a verified token from variant A would
              keep the trigger green when you switch to variant B.
              `overflow-x-auto` lets the captcha (which has min-width 260px)
              scroll horizontally on very narrow screens instead of breaking
              the layout. */}
          <div
            key={preset.id}
            className="p-4 sm:p-8 flex items-center justify-center min-h-[180px] sm:min-h-[200px] bg-zinc-50/60 dark:bg-zinc-950/60 overflow-x-auto"
          >
            {preset.render()}
          </div>
        </div>

        {/* `min-w-0` on the parent + `overflow-x-auto` here lets long code
            lines scroll inside the pane instead of expanding the whole grid
            column on mobile. */}
        <div className="rounded-xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 overflow-hidden">
          <div className="px-4 sm:px-5 py-2.5 border-b border-zinc-800 flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-zinc-400 truncate">
              {preset.id === "byo-css" ? "globals.css + page.tsx" : "page.tsx"}
            </span>
            <CopyButton text={preset.snippet} />
          </div>
          <pre className="px-4 sm:px-5 py-3 sm:py-4 text-xs sm:text-sm text-zinc-100 overflow-x-auto font-mono leading-relaxed">
            <code>{preset.snippet}</code>
          </pre>
        </div>

        <div className="text-xs text-zinc-500 dark:text-zinc-400 px-1 leading-relaxed">
          💡 Tip: precedence is <code className="font-mono">appearance</code>{" "}
          &gt; <code className="font-mono">theme</code> &gt; ancestor CSS vars
          &gt; defaults. Inline style on the wrapper always wins.
        </div>
      </section>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard may be blocked (insecure context, no permission) —
          // silently no-op rather than crash the demo.
        }
      }}
      className="text-xs px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}