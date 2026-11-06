"use client";

import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  size = "md",
  ...props
}: React.ComponentProps<typeof D.Content> & { title: string; description?: React.ReactNode; size?: "sm" | "md" | "lg" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] data-[state=open]:animate-fade-in" />
      <D.Content
        className={cn(
          "fixed z-50 flex max-h-[min(92dvh,860px)] flex-col overflow-hidden border border-line bg-surface shadow-lg focus:outline-none",
          // Mobile: bottom sheet. Desktop: centred dialog.
          "inset-x-0 bottom-0 rounded-t-lg data-[state=open]:animate-slide-in-bottom",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[8vh] sm:w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:rounded-lg sm:data-[state=open]:animate-pop-in",
          size === "sm" && "sm:max-w-md",
          size === "md" && "sm:max-w-xl",
          size === "lg" && "sm:max-w-3xl",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <D.Title className="text-lg font-semibold text-fg">{title}</D.Title>
            {description ? (
              <D.Description className="mt-0.5 text-sm text-fg-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close className="-mr-1.5 -mt-0.5 grid size-8 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-5", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "sticky bottom-0 flex flex-col-reverse gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}
