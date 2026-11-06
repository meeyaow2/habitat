"use client";

import * as React from "react";
import { Tooltip as T } from "radix-ui";

export const TooltipProvider = T.Provider;

export function Tooltip({ content, shortcut, children, side = "top" }: { content: string; shortcut?: string; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root delayDuration={350}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-[60] flex items-center gap-2 rounded-sm bg-fg px-2 py-1 text-xs text-fg-inverse shadow-md data-[state=delayed-open]:animate-fade-in"
        >
          {content}
          {shortcut && <kbd className="rounded-xs bg-white/15 px-1 font-mono text-[10px]">{shortcut}</kbd>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

/** Square icon button that always has an accessible name and a tooltip. */
export function IconButton({
  label,
  shortcut,
  children,
  className,
  side,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; shortcut?: string; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tooltip content={label} shortcut={shortcut} side={side}>
      <button
        type="button"
        aria-label={label}
        className={
          "grid size-9 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-accent-soft aria-pressed:text-accent-soft-fg [&_svg]:size-4 " +
          (className ?? "")
        }
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  );
}
