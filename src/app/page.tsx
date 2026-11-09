import { ArrowRight } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { HomeStarter } from "@/features/guest/home-starter";

export default function Landing() {
  const basePath = process.env.PAGES_BASE_PATH ?? "";

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface/90">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4 sm:px-6">
          <Wordmark />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-12 pt-7 sm:px-6 sm:pt-9">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-5xl">Where should the sofa go?</h1>
          <p className="mt-3 text-base leading-relaxed text-fg-muted sm:text-lg">Pick a floor plan that’s close to your home, then move things around to see what feels right.</p>
          <a href={`${basePath}/home/?guest=sample&edit=1`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline">
            Try a furnished sample <ArrowRight className="size-4" aria-hidden />
          </a>
        </div>

        <div className="mt-7 sm:mt-9">
          <HomeStarter />
        </div>

        <footer className="mt-12 border-t border-line py-8 sm:mt-14">
          <p className="text-sm font-medium text-fg">Habitat · Created in 2026</p>
          <p className="mt-1 text-sm text-fg-muted">A little tool for figuring out where things fit at home.</p>
        </footer>
      </main>
    </div>
  );
}
