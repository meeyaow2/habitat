"use client";

import * as React from "react";
import { DropdownMenu as M } from "radix-ui";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn(
          "z-50 min-w-48 overflow-hidden rounded-md border border-line bg-surface p-1 shadow-md data-[state=open]:animate-pop-in",
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function MenuItem({ className, tone, ...props }: React.ComponentProps<typeof M.Item> & { tone?: "danger" }) {
  return (
    <M.Item
      className={cn(
        "flex min-h-9 cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted [&_svg]:size-4 [&_svg]:text-fg-subtle",
        tone === "danger" && "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2.5 py-1.5 text-xs font-medium text-fg-subtle", className)} {...props} />;
}

export function MenuSeparator() {
  return <M.Separator className="-mx-1 my-1 h-px bg-line" />;
}
