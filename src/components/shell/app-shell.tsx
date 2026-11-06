"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { Check, ChevronsUpDown, FlaskConical, LogOut, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Avatar } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { signOutAction } from "@/features/auth/actions";
import { cn } from "@/lib/utils";
import { isActive, NAV } from "./nav";
import { setSidebarCollapsedAction, switchHouseholdAction } from "./shell-actions";
import { useOnChange } from "@/lib/client/use-on-change";

export type ShellProps = {
  user: { name: string; colour: string; email: string | null; isDemo: boolean };
  household: { id: string; name: string };
  memberships: { id: string; name: string; role: string }[];
  initialCollapsed: boolean;
  children: React.ReactNode;
};

export function AppShell({ user, household, memberships, initialCollapsed, children }: ShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
  const [moreOpen, setMoreOpen] = React.useState(false);

  const toggle = React.useCallback(() => {
    setCollapsed((c) => {
      void setSidebarCollapsedAction(!c);
      return !c;
    });
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  useOnChange(pathname, () => setMoreOpen(false));

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-md">
        Skip to content
      </a>
      {user.isDemo && <DemoBanner />}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar: md = icon rail, lg = full (collapsible) */}
        <aside
          className={cn(
            "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-canvas md:flex",
            "transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)]",
            collapsed ? "w-[60px]" : "w-[60px] lg:w-[244px]",
            user.isDemo && "h-[calc(100dvh-40px)] top-10",
          )}
          aria-label="Main"
        >
          <div className={cn("flex h-14 items-center gap-2 px-3", !collapsed && "lg:px-3")}>
            <HouseholdSwitcher household={household} memberships={memberships} collapsed={collapsed} />
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              const link = (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors",
                    active ? "bg-surface text-fg shadow-xs ring-1 ring-line" : "text-fg-muted hover:bg-surface-muted hover:text-fg",
                  )}
                >
                  <item.icon className={cn("size-[18px] shrink-0", active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} aria-hidden />
                  <span className={cn("truncate", collapsed ? "sr-only" : "sr-only lg:not-sr-only")}>{item.label}</span>
                </Link>
              );
              return collapsed ? (
                <Tooltip key={item.href} content={item.label} side="right">{link}</Tooltip>
              ) : (
                <React.Fragment key={item.href}>
                  <span className="lg:hidden">
                    <Tooltip content={item.label} side="right">{link}</Tooltip>
                  </span>
                  <span className="hidden lg:block">{link}</span>
                </React.Fragment>
              );
            })}
          </nav>
          <div className="flex flex-col gap-1 border-t border-line p-2">
            <UserMenu user={user} collapsed={collapsed} />
            <button
              type="button"
              onClick={toggle}
              className="hidden h-8 items-center gap-3 rounded-md px-2.5 text-xs text-fg-subtle hover:bg-surface-muted hover:text-fg lg:flex"
              aria-label={collapsed ? "Expand sidebar" : undefined}
              aria-keyshortcuts="Control+Backslash"
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              {!collapsed && (
                <span className="flex flex-1 justify-between">
                  Collapse<span className="sr-only"> sidebar</span> <kbd className="font-mono text-[10px]" aria-hidden>Ctrl \</kbd>
                </span>
              )}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line bg-canvas/95 px-4 backdrop-blur md:hidden">
            <HouseholdSwitcher household={household} memberships={memberships} collapsed={false} compact />
            <UserMenu user={user} collapsed compact />
          </header>

          <main id="main" className="min-w-0 flex-1 pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.filter((n) => n.mobilePrimary).map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-accent" : "text-fg-muted")}
            >
              <item.icon className="size-5" aria-hidden />
              {item.short}
            </Link>
          );
        })}
        <D.Root open={moreOpen} onOpenChange={setMoreOpen}>
          <D.Trigger
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
              NAV.some((n) => !n.mobilePrimary && isActive(pathname, n.href)) ? "text-accent" : "text-fg-muted",
            )}
          >
            <MoreHorizontal className="size-5" aria-hidden />
            More
          </D.Trigger>
          <D.Portal>
            <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] data-[state=open]:animate-fade-in" />
            <D.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-lg border-t border-line bg-surface p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg data-[state=open]:animate-slide-in-bottom">
              <div className="flex items-center justify-between px-3 py-2">
                <D.Title className="text-md font-semibold">More</D.Title>
                <D.Description className="sr-only">Other sections of Habitat</D.Description>
                <D.Close className="grid size-9 place-items-center rounded-md text-fg-muted" aria-label="Close">
                  <X className="size-4" />
                </D.Close>
              </div>
              <ul className="grid gap-0.5">
                {NAV.filter((n) => !n.mobilePrimary).map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive(pathname, item.href) ? "page" : undefined}
                      className="flex h-12 items-center gap-3 rounded-md px-3 text-base font-medium aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-soft-fg"
                    >
                      <item.icon className="size-5 text-fg-subtle" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </D.Content>
          </D.Portal>
        </D.Root>
      </nav>
    </div>
  );
}

function DemoBanner() {
  return (
    <div className="sticky top-0 z-40 flex h-10 items-center justify-center gap-2 border-b border-warning/20 bg-warning-soft px-4 text-sm text-warning">
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      <span className="truncate">
        <strong className="font-semibold">Demo household</strong>
        <span className="hidden sm:inline"> — sample data, private to you, deleted after 24 hours.</span>
      </span>
      <Link href="/sign-up" className="shrink-0 font-semibold underline underline-offset-2">
        Create your account
      </Link>
    </div>
  );
}

function HouseholdSwitcher({
  household,
  memberships,
  collapsed,
  compact,
}: {
  household: { id: string; name: string };
  memberships: { id: string; name: string; role: string }[];
  collapsed: boolean;
  compact?: boolean;
}) {
  return (
    <Menu>
      <MenuTrigger
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-md p-1 text-left hover:bg-surface-muted",
          !compact && !collapsed && "lg:flex-1 lg:px-1.5",
        )}
      >
        <BrandMark className="size-7 shrink-0" />
        <span className={cn("min-w-0 flex-1", compact ? "" : collapsed ? "hidden" : "hidden lg:block")}>
          <span className="block truncate text-sm font-semibold text-fg">{household.name}</span>
          <span className="block text-[11px] leading-3 text-fg-subtle">Habitat</span>
        </span>
        <ChevronsUpDown className={cn("size-3.5 shrink-0 text-fg-subtle", compact ? "" : collapsed ? "hidden" : "hidden lg:block")} aria-hidden />
        <span className="sr-only">{compact || collapsed ? household.name : ""} — switch household</span>
      </MenuTrigger>
      <MenuContent align="start" className="w-64">
        <MenuLabel>Households</MenuLabel>
        {memberships.map((m) => (
          <MenuItem key={m.id} onSelect={() => m.id !== household.id && void switchHouseholdAction(m.id)}>
            <span className="flex-1 truncate">{m.name}</span>
            <span className="text-xs capitalize text-fg-subtle">{m.role}</span>
            {m.id === household.id && <Check className="!text-accent" />}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/household">
            <Plus /> Invite or manage members
          </Link>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function UserMenu({ user, collapsed, compact }: { user: ShellProps["user"]; collapsed: boolean; compact?: boolean }) {
  return (
    <Menu>
      <MenuTrigger
        className={cn("flex h-10 min-w-0 items-center gap-2.5 rounded-md px-1.5 text-left hover:bg-surface-muted", compact && "h-9 px-0.5")}
      >
        <Avatar name={user.name} colour={user.colour} size="sm" />
        {!compact && (
          <span className={cn("min-w-0 flex-1", collapsed ? "hidden" : "hidden lg:block")}>
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-[11px] leading-3 text-fg-subtle">{user.isDemo ? "Demo visitor" : user.email}</span>
          </span>
        )}
        <span className="sr-only">{compact || collapsed ? user.name : ""} account menu</span>
      </MenuTrigger>
      <MenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"} className="w-56">
        <MenuLabel className="truncate">{user.isDemo ? "Demo visitor" : user.email}</MenuLabel>
        <MenuItem asChild>
          <Link href="/settings">Settings</Link>
        </MenuItem>
        <MenuSeparator />
        <form action={signOutAction}>
          <MenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut /> {user.isDemo ? "Leave demo" : "Sign out"}
            </button>
          </MenuItem>
        </form>
      </MenuContent>
    </Menu>
  );
}
