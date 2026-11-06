import { cn } from "@/lib/utils";

/** Habitat mark: a plan outline with an interior wall and one placed item. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden fill="none">
      <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="3.5" fill="var(--accent)" />
      <path d="M7 7.5h10v9H7z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12.5 7.5v4.25H17" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9.6" cy="13.9" r="1.25" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight text-fg", className)}>
      <BrandMark />
      <span className="text-lg">Habitat</span>
    </span>
  );
}
