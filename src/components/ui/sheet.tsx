"use client";

import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Contextual side drawer (desktop) / bottom sheet (mobile). */
export const Sheet = D.Root;

export function SheetContent({
  title,
  description,
  children,
  className,
  headerExtra,
  modal = true,
  ...props
}: React.ComponentProps<typeof D.Content> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  headerExtra?: React.ReactNode;
  modal?: boolean;
}) {
  return (
    <D.Portal>
      {modal && <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] data-[state=open]:animate-fade-in md:bg-[rgb(28_32_30/0.18)]" />}
      <D.Content
        className={cn(
          "fixed z-50 flex flex-col border-line bg-surface shadow-lg focus:outline-none",
          "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-lg border-t data-[state=open]:animate-slide-in-bottom",
          "md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[420px] md:rounded-none md:border-l md:border-t-0 md:data-[state=open]:animate-slide-in-right",
          className,
        )}
        {...props}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong md:hidden" aria-hidden />
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <D.Title className="text-lg font-semibold text-fg">{title}</D.Title>
            {description ? (
              <D.Description asChild>
                <div className="mt-0.5 text-sm text-fg-muted">{description}</div>
              </D.Description>
            ) : (
              <D.Description className="sr-only">Details</D.Description>
            )}
          </div>
          {headerExtra}
          <D.Close className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label="Close panel">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
