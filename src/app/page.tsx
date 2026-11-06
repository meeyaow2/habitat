import Link from "next/link";
import { ArrowRight, Bell, FileText, House, Lock, Receipt, Users, Wrench } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { getSessionUser } from "@/lib/auth";
import { startDemoAction } from "@/features/auth/actions";
import { PlanPreview } from "@/features/home/plan-preview";
import { getTemplate, instantiateFloor } from "@/features/home/templates";

export default async function Landing({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [user, { demo }] = await Promise.all([getSessionUser(), searchParams]);
  const plan = instantiateFloor(getTemplate("hdb_4_room")!.floors[0]);
  const at = (name: string, dx = 0, dy = 0) => {
    const r = plan.rooms.find((x) => x.name === name)!;
    return { x: r.x + r.width / 2 + dx, y: r.y + r.height / 2 + dy };
  };

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Wordmark />
        <nav className="flex items-center gap-2">
          {user && !user.isAnonymous ? (
            <Button asChild variant="primary" size="sm"><Link href="/overview">Open Habitat</Link></Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm"><Link href="/sign-in">Sign in</Link></Button>
              <Button asChild variant="primary" size="sm"><Link href="/sign-up">Get started</Link></Button>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:pt-16">
          <div className="animate-rise-in">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-fg-muted">
              <House className="size-3.5 text-accent" aria-hidden /> Built for HDB flats, condos and landed homes
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-fg sm:text-[52px] sm:leading-[58px]">
              Your home, organised and understood.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-fg-muted">
              Habitat is a living model of your home. Tap an aircon to see when it was last serviced, which receipt proves its warranty, and what it has cost you — all in one place, shared with the people you live with.
            </p>
            {demo === "unavailable" && (
              <Notice tone="warning" className="mt-5 max-w-md">Demo mode isn’t available right now. You can still create a free account.</Notice>
            )}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="primary" size="lg"><Link href="/sign-up">Set up your home <ArrowRight aria-hidden /></Link></Button>
              <form action={startDemoAction}>
                <Button type="submit" size="lg" className="w-full">Explore a sample home</Button>
              </form>
            </div>
            <p className="mt-3 text-sm text-fg-subtle">The sample home is private to you and removed after 24 hours.</p>
          </div>

          <div className="relative">
            <div className="rounded-lg border border-line bg-[var(--plan-bg)] p-4 shadow-md sm:p-6">
              <PlanPreview
                title="Illustration of an HDB 4-room floor plan with appliances marked"
                rooms={plan.rooms}
                objects={plan.objects}
                labels
                markers={[
                  { ...at("Living room", 0, -190) },
                  { ...at("Master bedroom", 0, -140), tone: "warning" },
                  { ...at("Kitchen", 60, -60) },
                  { ...at("Service yard", -40, 0), tone: "danger" },
                  { ...at("Common bath", 60, -40) },
                ]}
                className="h-auto w-full"
              />
            </div>
            <div className="absolute -bottom-6 right-3 w-64 rounded-lg border border-line bg-surface p-4 shadow-lg sm:right-6" aria-hidden>
              <p className="text-xs font-medium text-fg-subtle">Service yard</p>
              <p className="text-md font-semibold">Washing machine</p>
              <p className="text-xs text-fg-muted">LG FV1409S4W</p>
              <div className="mt-3 space-y-1.5 text-xs">
                <p className="flex justify-between"><span className="text-fg-muted">Warranty</span><span className="font-medium text-warning">Ends in 21 days</span></p>
                <p className="flex justify-between"><span className="text-fg-muted">Next task</span><span className="font-medium">Book technician</span></p>
                <p className="flex justify-between"><span className="text-fg-muted">Receipt</span><span className="font-medium">Harvey Norman · PDF</span></p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-10 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
            {[
              { icon: House, title: "Your home is the interface", body: "Start from an illustrative HDB, condo or landed layout — or a blank canvas — and place appliances where they actually are." },
              { icon: Wrench, title: "Upkeep that schedules itself", body: "Recurring tasks roll forward when you complete them. Suggestions are clearly marked as general guidance, never as manufacturer instructions." },
              { icon: Bell, title: "Warranties, before they lapse", body: "Pick your own reminder window. Habitat tells you what’s expiring and links straight to the proof of purchase." },
              { icon: FileText, title: "Every receipt, where you expect it", body: "Receipts, manuals and service invoices stay attached to the appliance they belong to — private to your household." },
              { icon: Receipt, title: "Know what your home costs", body: "Purchases, servicing and repairs add up into clear monthly and yearly totals, calculated exactly — not estimated." },
              { icon: Users, title: "Shared, with the right access", body: "Invite the people you live with. Owners manage the home; members add items, complete tasks and record repairs." },
            ].map((f) => (
              <div key={f.title}>
                <f.icon className="size-5 text-accent" aria-hidden />
                <h2 className="mt-3 text-md font-semibold">{f.title}</h2>
                <p className="mt-1.5 text-fg-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <Lock className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
              <div>
                <h2 className="text-md font-semibold">Private by default</h2>
                <p className="mt-1 text-fg-muted">No street address needed. Floor plans are never public. Documents are stored privately and only shown to members of your household.</p>
              </div>
            </div>
            <Button asChild variant="primary" className="shrink-0"><Link href="/sign-up">Create your home</Link></Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-fg-subtle sm:flex-row sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} Habitat</span>
          <span>Starter layouts are illustrative, not official floor plans.</span>
        </div>
      </footer>
    </div>
  );
}
