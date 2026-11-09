"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ArrowLeft, ArrowRight, Building2, House, SquareDashed } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlanPreview } from "@/features/home/plan-preview";
import { getTemplate, instantiateFloor, type TemplateKey } from "@/features/home/templates";
import { cn } from "@/lib/utils";
import { createOwnGuestHome, GUEST_KEYS } from "./data";
import { STARTER_CHOICES } from "./starter-choices";

const CHOICES = STARTER_CHOICES.map((choice) => ({
  ...choice,
  icon: choice.key === "blank" ? SquareDashed : choice.key.startsWith("condo_") ? Building2 : House,
}));

export function GuestSetup() {
  const router = useRouter();
  const [selected, setSelected] = React.useState<TemplateKey>("hdb_4_room");
  const [name, setName] = React.useState("My home");

  const start = () => {
    const home = createOwnGuestHome(selected, name);
    try {
      localStorage.setItem(GUEST_KEYS.own, JSON.stringify(home));
      localStorage.setItem(GUEST_KEYS.last, "own");
    } catch {}
    router.push("/home?guest=own&edit=1");
  };

  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Wordmark />
        <Button asChild variant="ghost" size="sm"><Link href="/"><ArrowLeft aria-hidden /> Home</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-accent">Set up your home</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Choose a starting plan</h1>
          <p className="mt-3 text-fg-muted">Pick the home that feels closest. The proportions are only a starting point—you can rename and resize rooms, add a balcony and rearrange every piece of furniture.</p>
          <label htmlFor="guest-home-name" className="mt-6 block text-sm font-medium">Home name</label>
          <Input id="guest-home-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-2 max-w-sm" maxLength={60} />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Home templates">
          {CHOICES.map((choice) => {
            const template = getTemplate(choice.key)!;
            const doc = instantiateFloor(template.floors[0]);
            const active = selected === choice.key;
            return (
              <label key={choice.key} className={cn("group cursor-pointer overflow-hidden rounded-xl border bg-surface transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring", active ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong")}>
                <input className="sr-only" type="radio" name="template" checked={active} onChange={() => setSelected(choice.key)} />
                <div className="aspect-[4/3] border-b border-line bg-[var(--plan-bg)] p-3">
                  <PlanPreview rooms={doc.rooms} objects={doc.objects} geometry={doc.geometry} title={`${choice.label} preview`} labels className="size-full" />
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2"><choice.icon className="size-4 text-accent" aria-hidden /><span className="font-semibold">{choice.label}</span><span className="ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-soft-fg">{choice.bedrooms === 0 ? "Blank" : `${choice.bedrooms} bedroom${choice.bedrooms === 1 ? "" : "s"}`}</span></div>
                  <p className="mt-1 text-sm text-fg-muted">{choice.summary}</p>
                  {template.reference && <p className="mt-2 text-xs text-fg-subtle">HDB Bangkit Breeze reference · {template.reference.totalAreaM2} m² total · {template.reference.internalAreaM2} m² internal</p>}
                </div>
              </label>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg-muted">Saved in this browser.</p>
          <Button variant="primary" size="lg" onClick={start}>Open editor <ArrowRight aria-hidden /></Button>
        </div>
      </main>
    </div>
  );
}
