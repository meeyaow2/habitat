import * as React from "react";
import { cn, initials } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} aria-hidden {...props} />;
}

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-lg border border-line bg-surface shadow-xs", className)} {...props} />;
}

export function PanelHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pb-2 pt-4 sm:px-5", className)}>
      <div className="min-w-0">
        <h2 className="text-md font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const AVATAR_COLOURS: Record<string, string> = {
  sage: "bg-[#dbe6de] text-[#2c4637]",
  slate: "bg-[#dde4ea] text-[#2e4557]",
  clay: "bg-[#f0dfd6] text-[#6e3b24]",
  sand: "bg-[#efe6d2] text-[#5f4a1c]",
  teal: "bg-[#d6e9e6] text-[#1f4f49]",
  plum: "bg-[#e8dde8] text-[#583a58]",
};

export function Avatar({ name, colour = "sage", size = "md", className }: { name: string | null | undefined; colour?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold",
        AVATAR_COLOURS[colour] ?? AVATAR_COLOURS.sage,
        size === "sm" && "size-6 text-[10px]",
        size === "md" && "size-8 text-xs",
        size === "lg" && "size-10 text-sm",
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-xs border border-line bg-surface-muted px-1 font-mono text-[11px] text-fg-muted">{children}</kbd>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      {icon && <div className="mb-3 grid size-10 place-items-center rounded-lg border border-line bg-surface-muted text-fg-muted [&_svg]:size-5">{icon}</div>}
      <h3 className="text-md font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-fg-muted">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-base text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Notice({ tone = "info", title, children, className, icon }: { tone?: "info" | "warning" | "danger" | "success" | "neutral"; title?: string; children: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  const tones = {
    info: "border-info/25 bg-info-soft text-info",
    warning: "border-warning/25 bg-warning-soft text-warning",
    danger: "border-danger/25 bg-danger-soft text-danger",
    success: "border-success/25 bg-success-soft text-success",
    neutral: "border-line bg-surface-muted text-fg-muted",
  };
  return (
    <div className={cn("flex gap-2.5 rounded-md border px-3 py-2.5 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0", tones[tone], className)} role={tone === "danger" ? "alert" : undefined}>
      {icon}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn(title && "mt-0.5", "[&_a]:font-medium [&_a]:underline")}>{children}</div>
      </div>
    </div>
  );
}
