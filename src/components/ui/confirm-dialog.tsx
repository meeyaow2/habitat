"use client";

import * as React from "react";
import { AlertDialog as A } from "radix-ui";
import { Button } from "./button";

type ConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
};

/** Named, explicit confirmation for destructive or hard-to-reverse actions. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, tone = "danger", onConfirm, children }: ConfirmProps) {
  const [pending, setPending] = React.useState(false);
  return (
    <A.Root open={open} onOpenChange={onOpenChange}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] data-[state=open]:animate-fade-in" />
        <A.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-5 shadow-lg data-[state=open]:animate-pop-in focus:outline-none">
          <A.Title className="text-lg font-semibold">{title}</A.Title>
          <A.Description asChild>
            <div className="mt-2 text-sm text-fg-muted">{description}</div>
          </A.Description>
          {children}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <A.Cancel asChild>
              <Button variant="secondary" disabled={pending}>Cancel</Button>
            </A.Cancel>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              loading={pending}
              onClick={async () => {
                setPending(true);
                try {
                  await onConfirm();
                  onOpenChange(false);
                } finally {
                  setPending(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
