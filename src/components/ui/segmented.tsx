"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Accessible segmented control (radio group semantics, arrow-key navigation). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode; ariaLabel?: string }[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const index = options.findIndex((o) => o.value === value);
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-md border border-line bg-surface-muted p-0.5", className)}>
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.ariaLabel}
            tabIndex={selected || (index === -1 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
              e.preventDefault();
              const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
              const next = (i + dir + options.length) % options.length;
              onChange(options[next].value);
              refs.current[next]?.focus();
            }}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-sm font-medium text-fg-muted transition-colors [&_svg]:size-4",
              size === "md" ? "h-8 px-3 text-sm" : "h-7 px-2 text-xs",
              selected ? "bg-surface text-fg shadow-xs" : "hover:text-fg",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
