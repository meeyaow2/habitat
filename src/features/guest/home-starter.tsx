"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ArrowRight } from "lucide-react";
import { PlanPreview } from "@/features/home/plan-preview";
import { getTemplate, instantiateFloor, type TemplateKey } from "@/features/home/templates";
import { createOwnGuestHome, GUEST_KEYS } from "./data";
import { STARTER_CHOICES } from "./starter-choices";

export function HomeStarter() {
  const router = useRouter();
  const [opening, setOpening] = React.useState<TemplateKey | null>(null);

  const openTemplate = (templateKey: TemplateKey) => {
    setOpening(templateKey);
    const home = createOwnGuestHome(templateKey);
    try {
      localStorage.setItem(GUEST_KEYS.own, JSON.stringify(home));
      localStorage.setItem(GUEST_KEYS.last, "own");
    } catch {}
    router.push("/home?guest=own&edit=1");
  };

  return (
    <section aria-labelledby="starting-layouts">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id="starting-layouts" className="text-xl font-semibold tracking-tight sm:text-2xl">Choose a starting layout</h2>
          <p className="mt-1 text-sm text-fg-muted">You can change the rooms and furniture once it opens.</p>
        </div>
        <p className="hidden text-xs text-fg-subtle sm:block">No sign-in · Saved in this browser</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STARTER_CHOICES.map((choice) => {
          const template = getTemplate(choice.key)!;
          const doc = instantiateFloor(template.floors[0]);
          const isOpening = opening === choice.key;
          return (
            <button
              key={choice.key}
              type="button"
              onClick={() => openTemplate(choice.key)}
              disabled={opening !== null}
              aria-label={`Open ${choice.label}`}
              className="group overflow-hidden rounded-xl border border-line bg-surface text-left shadow-xs transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60"
            >
              <div className="aspect-[4/3] border-b border-line bg-[var(--plan-bg)] p-2 sm:p-3">
                <PlanPreview rooms={doc.rooms} objects={doc.objects} geometry={doc.geometry} title={`${choice.label} floor plan`} className="size-full" />
              </div>
              <div className="p-3 sm:p-4">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug sm:text-base">{choice.label}</h3>
                  <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent-soft-fg sm:text-xs">
                    {choice.bedrooms === 0 ? "Blank" : `${choice.bedrooms} bed`}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted sm:text-sm">{choice.summary}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent sm:text-sm">
                  {isOpening ? "Opening…" : "Use this layout"}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-fg-subtle sm:hidden">No sign-in · Saved in this browser</p>
    </section>
  );
}
