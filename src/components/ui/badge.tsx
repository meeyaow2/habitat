import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs font-medium [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-surface-muted text-fg-muted",
        accent: "bg-accent-soft text-accent-soft-fg",
        info: "bg-info-soft text-info",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
        outline: "border border-line text-fg-muted",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Small coloured dot + label, for status where colour alone must not carry meaning. */
export function StatusDot({ tone, label }: { tone: "success" | "warning" | "danger" | "info" | "neutral"; label: string }) {
  const colour = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
    neutral: "bg-fg-subtle",
  }[tone];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
      <span className={cn("size-1.5 rounded-full", colour)} aria-hidden />
      {label}
    </span>
  );
}
