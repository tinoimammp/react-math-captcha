import Link from "next/link";

/**
 * Shared "back" link used across demo pages. Centralised so the icon and
 * hover treatment stay consistent — easier to swap the glyph in one place
 * than chase three pages.
 *
 * The folder is `_components` (underscore prefix) so Next.js treats it as
 * private and won't try to route to it.
 */
interface BackLinkProps {
  href?: string;
  label?: string;
  /** When `true`, renders larger so it fits hero-style page headers. */
  size?: "sm" | "md";
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

export function BackLink({
  href = "/",
  label = "Back to home",
  size = "sm",
}: BackLinkProps) {
  const sizing = size === "md" ? "text-sm gap-2" : "text-sm gap-1.5";
  return (
    <Link
      href={href}
      // `group` lets the icon translate on hover without a separate state.
      className={`group inline-flex items-center ${sizing} text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition w-fit`}
    >
      <ArrowLeftIcon className="transition-transform group-hover:-translate-x-0.5" />
      <span>{label}</span>
    </Link>
  );
}
