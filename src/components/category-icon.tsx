import { AirVent, Armchair, CircleDot, CookingPot, Droplets, Fan, Flame, GlassWater, Heater, Lamp, Laptop, Microwave, Package, Refrigerator, Router, Tv, WashingMachine, Wind, type LucideIcon } from "lucide-react";
import { category } from "@/lib/domain/categories";
import { cn } from "@/lib/utils";

export const ICONS: Record<string, LucideIcon> = {
  "air-vent": AirVent,
  refrigerator: Refrigerator,
  "washing-machine": WashingMachine,
  wind: Wind,
  tv: Tv,
  heater: Heater,
  fan: Fan,
  "cooking-pot": CookingPot,
  microwave: Microwave,
  droplets: Droplets,
  flame: Flame,
  "glass-water": GlassWater,
  "circle-dot": CircleDot,
  laptop: Laptop,
  router: Router,
  lamp: Lamp,
  armchair: Armchair,
  package: Package,
};

export function CategoryIcon({ categoryId, className }: { categoryId: string; className?: string }) {
  const Icon = ICONS[category(categoryId).icon] ?? Package;
  return <Icon className={className} aria-hidden />;
}

export function CategoryTile({ categoryId, size = "md", tone = "neutral" }: { categoryId: string; size?: "sm" | "md" | "lg"; tone?: "neutral" | "warning" | "danger" }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-md border",
        tone === "neutral" && "border-line bg-surface-muted text-fg-muted",
        tone === "warning" && "border-warning/20 bg-warning-soft text-warning",
        tone === "danger" && "border-danger/20 bg-danger-soft text-danger",
        size === "sm" && "size-7 [&_svg]:size-3.5",
        size === "md" && "size-9 [&_svg]:size-[18px]",
        size === "lg" && "size-12 [&_svg]:size-6",
      )}
    >
      <CategoryIcon categoryId={categoryId} />
    </span>
  );
}
