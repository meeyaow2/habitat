"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ArrowLeft, ArrowRight, Boxes, Building, Building2, Check, FileText, House, Hotel, Info, Trees, Upload, Wrench } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { useAction } from "@/lib/client/use-action";
import { cn } from "@/lib/utils";
import { AssetFields, emptyAsset, toPayload, type AssetFormValues } from "@/features/assets/asset-form";
import { PlanPreview } from "@/features/home/plan-preview";
import { instantiateFloor, suggestedTemplate, templatesFor, TEMPLATES, type TemplateKey } from "@/features/home/templates";
import type { RoomOption } from "@/features/shared/options";
import { addFirstApplianceAction, applyLayoutAction, createHomeAction, finishOnboardingAction, setOnboardingStep } from "./actions";

type Step = "welcome" | "home" | "layout" | "appliance" | "explore";
const ORDER: Step[] = ["welcome", "home", "layout", "appliance", "explore"];
const LABELS: Record<Step, string> = { welcome: "Welcome", home: "Your home", layout: "Layout", appliance: "First item", explore: "Explore" };

const PROPERTY_TYPES = [
  { value: "hdb", label: "HDB flat", icon: Building2 },
  { value: "condo", label: "Condominium", icon: Hotel },
  { value: "landed", label: "Landed house", icon: Trees },
  { value: "apartment", label: "Apartment", icon: Building },
  { value: "other", label: "Other", icon: House },
] as const;

const HDB_TYPES = [
  { value: "2_room", label: "2-room" },
  { value: "3_room", label: "3-room" },
  { value: "4_room", label: "4-room" },
  { value: "5_room", label: "5-room" },
  { value: "executive", label: "Executive" },
];

export function OnboardingFlow({
  initialStep,
  defaults,
  rooms,
}: {
  initialStep: Step;
  defaults: { householdName: string; propertyName: string; propertyType: string; hdbFlatType: string | null };
  rooms: RoomOption[];
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(initialStep);
  const index = ORDER.indexOf(step);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const go = (s: Step) => {
    setStep(s);
    void setOnboardingStep(s);
  };

  // Step 2 state
  const [home, setHome] = React.useState({ ...defaults, hdbFlatType: defaults.hdbFlatType ?? "4_room" });
  const createHome = useAction(createHomeAction, { silent: true });
  // Step 3
  const [template, setTemplate] = React.useState<TemplateKey>(suggestedTemplate(defaults.propertyType, defaults.hdbFlatType));
  const applyLayout = useAction(applyLayoutAction, { silent: true });
  // Step 4
  const [asset, setAsset] = React.useState<AssetFormValues>(emptyAsset({ categoryId: "washing_machine", name: "Washing machine" }));
  const addAsset = useAction(addFirstApplianceAction, { silent: true });

  const options = templatesFor(home.propertyType);
  const ordered = [...options.filter((t) => t.key !== "blank"), ...TEMPLATES.filter((t) => t.key === "blank")];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Wordmark />
        <ol className="hidden items-center gap-1.5 sm:flex" aria-label="Setup progress">
          {ORDER.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full text-[10px] font-semibold",
                  i < index && "bg-accent text-accent-fg",
                  i === index && "bg-fg text-fg-inverse",
                  i > index && "bg-surface-sunken text-fg-subtle",
                )}
                aria-current={i === index ? "step" : undefined}
              >
                {i < index ? <Check className="size-3" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span className={cn("text-xs", i === index ? "font-medium text-fg" : "text-fg-subtle")}>{LABELS[s]}</span>
              {i < ORDER.length - 1 && <span className="mx-1 h-px w-4 bg-line-strong" aria-hidden />}
            </li>
          ))}
        </ol>
        <p className="text-xs text-fg-muted sm:hidden">Step {index + 1} of {ORDER.length}</p>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-4 sm:px-6 sm:pt-10">
        <div key={step} className="animate-rise-in">
          {step === "welcome" && (
            <section>
              <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight focus:outline-none">Welcome to Habitat</h1>
              <p className="mt-3 max-w-xl text-lg text-fg-muted">
                In the next few minutes you’ll create a simple model of your home and add your first appliance. Everything can be changed later.
              </p>
              <ul className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  { icon: House, t: "Map your home", d: "Start from a layout like yours." },
                  { icon: Boxes, t: "Add what’s in it", d: "Appliances, warranties, receipts." },
                  { icon: Wrench, t: "Stay ahead", d: "Reminders for upkeep and expiries." },
                ].map((x) => (
                  <li key={x.t} className="rounded-lg border border-line bg-surface p-4">
                    <x.icon className="size-5 text-accent" aria-hidden />
                    <p className="mt-2 font-semibold">{x.t}</p>
                    <p className="text-sm text-fg-muted">{x.d}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-10">
                <Button variant="primary" size="lg" onClick={() => go("home")}>
                  Get started <ArrowRight aria-hidden />
                </Button>
              </div>
            </section>
          )}

          {step === "home" && (
            <form
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await createHome.run({
                  ...home,
                  hdbFlatType: home.propertyType === "hdb" ? home.hdbFlatType : null,
                });
                if (ok) {
                  setTemplate(suggestedTemplate(home.propertyType, home.hdbFlatType));
                  setStep("layout");
                  router.refresh();
                }
              }}
            >
              <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight focus:outline-none">Tell us about your home</h1>
              <p className="mt-2 text-fg-muted">We don’t ask for your address.</p>
              {createHome.error && !Object.keys(createHome.fieldErrors).length && <Notice tone="danger" className="mt-4">{createHome.error}</Notice>}
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <Field label="Home name" htmlFor="ob-property" error={createHome.fieldErrors.propertyName} hint="e.g. Punggol flat, Mum’s place">
                  <Input value={home.propertyName} onChange={(e) => setHome({ ...home, propertyName: e.target.value })} autoFocus />
                </Field>
                <Field label="Household name" htmlFor="ob-household" error={createHome.fieldErrors.householdName} hint="Shown to people you invite.">
                  <Input value={home.householdName} onChange={(e) => setHome({ ...home, householdName: e.target.value })} />
                </Field>
              </div>
              <fieldset className="mt-6">
                <legend className="text-sm font-medium">Property type</legend>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {PROPERTY_TYPES.map((t) => (
                    <label
                      key={t.value}
                      className={cn(
                        "flex cursor-pointer flex-col items-start gap-2 rounded-lg border bg-surface p-3 text-sm font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                        home.propertyType === t.value ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong",
                      )}
                    >
                      <input type="radio" name="ptype" value={t.value} className="sr-only" checked={home.propertyType === t.value} onChange={() => setHome({ ...home, propertyType: t.value })} />
                      <t.icon className={cn("size-5", home.propertyType === t.value ? "text-accent" : "text-fg-subtle")} aria-hidden />
                      {t.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {home.propertyType === "hdb" && (
                <fieldset className="mt-6">
                  <legend className="text-sm font-medium">Flat type</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {HDB_TYPES.map((t) => (
                      <label
                        key={t.value}
                        className={cn(
                          "cursor-pointer rounded-md border px-3.5 py-2 text-sm font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                          home.hdbFlatType === t.value ? "border-accent bg-accent-soft text-accent-soft-fg" : "border-line bg-surface hover:border-line-strong",
                        )}
                      >
                        <input type="radio" name="hdb" className="sr-only" value={t.value} checked={home.hdbFlatType === t.value} onChange={() => setHome({ ...home, hdbFlatType: t.value })} />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <StepNav onBack={() => go("welcome")} submitLabel="Continue" pending={createHome.pending} />
            </form>
          )}

          {step === "layout" && (
            <form
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await applyLayout.run({ templateKey: template });
                if (ok) {
                  setStep("appliance");
                  router.refresh();
                }
              }}
            >
              <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight focus:outline-none">Choose a starting layout</h1>
              <p className="mt-2 text-fg-muted">Pick the closest match — you can move, resize and rename every room afterwards.</p>
              <Notice tone="neutral" icon={<Info />} className="mt-4">
                Starter layouts are illustrative arrangements, not official floor plans, and their sizes are approximate.
              </Notice>
              {applyLayout.error && <Notice tone="danger" className="mt-4">{applyLayout.error}</Notice>}
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Layout templates">
                {ordered.map((t) => {
                  const doc = instantiateFloor(t.floors[0]);
                  const selected = template === t.key;
                  return (
                    <label
                      key={t.key}
                      className={cn(
                        "flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-surface transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                        selected ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong",
                      )}
                    >
                      <input type="radio" name="template" className="sr-only" checked={selected} onChange={() => setTemplate(t.key)} />
                      <div className="aspect-[4/3] border-b border-line bg-[var(--plan-bg)] p-3">
                        <PlanPreview rooms={doc.rooms} objects={doc.objects} title={`${t.label} preview`} className="size-full" />
                      </div>
                      <div className="p-3">
                        <p className="flex items-center justify-between text-sm font-semibold">
                          {t.label}
                          {t.floors.length > 1 && <span className="text-xs font-normal text-fg-subtle">{t.floors.length} levels</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-fg-muted">{t.summary}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
              <StepNav onBack={() => go("home")} submitLabel="Use this layout" pending={applyLayout.pending} />
            </form>
          )}

          {step === "appliance" && (
            <form
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await addAsset.run(toPayload(asset));
                if (ok) setStep("explore");
              }}
            >
              <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight focus:outline-none">Add your first appliance</h1>
              <p className="mt-2 text-fg-muted">Start with something that needs looking after. Only the category and name are required.</p>
              {addAsset.error && !Object.keys(addAsset.fieldErrors).length && <Notice tone="danger" className="mt-4">{addAsset.error}</Notice>}
              <div className="mt-6 rounded-lg border border-line bg-surface p-4 sm:p-6">
                <AssetFields values={asset} set={(k, v) => setAsset((s) => ({ ...s, [k]: v }))} errors={addAsset.fieldErrors} rooms={rooms} mode="create" compact />
              </div>
              <p className="mt-4 flex items-start gap-2 text-sm text-fg-muted">
                <Upload className="mt-0.5 size-4 shrink-0" aria-hidden />
                Have the receipt handy? After setup, upload it in <FileText className="inline size-3.5" aria-hidden /> Documents and link it to this item.
              </p>
              <StepNav onBack={() => go("layout")} submitLabel="Add appliance" pending={addAsset.pending} onSkip={() => go("explore")} />
            </form>
          )}

          {step === "explore" && (
            <section>
              <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight focus:outline-none">Your home is ready</h1>
              <p className="mt-3 max-w-xl text-lg text-fg-muted">
                Next, open your floor plan and drag your appliance to where it lives. Its room updates automatically.
              </p>
              <form action={finishOnboardingAction} className="mt-10">
                <Button type="submit" variant="primary" size="lg">
                  Open my home <ArrowRight aria-hidden />
                </Button>
              </form>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function StepNav({ onBack, submitLabel, pending, onSkip }: { onBack: () => void; submitLabel: string; pending: boolean; onSkip?: () => void }) {
  return (
    <div className="mt-10 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
      <Button type="button" variant="ghost" onClick={onBack}>
        <ArrowLeft aria-hidden /> Back
      </Button>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        {onSkip && (
          <Button type="button" variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        )}
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
