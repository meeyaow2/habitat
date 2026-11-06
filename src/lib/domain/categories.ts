/**
 * Mirror of public.asset_categories (supabase/migrations/*_reference_data.sql).
 * A database test asserts the two stay in sync.
 */
export const CATEGORIES = [
  { id: "air_conditioner", label: "Air conditioner", icon: "air-vent", isAppliance: true, w: 90, d: 30 },
  { id: "refrigerator", label: "Refrigerator", icon: "refrigerator", isAppliance: true, w: 70, d: 70 },
  { id: "washing_machine", label: "Washing machine", icon: "washing-machine", isAppliance: true, w: 60, d: 60 },
  { id: "dryer", label: "Dryer", icon: "wind", isAppliance: true, w: 60, d: 60 },
  { id: "television", label: "Television", icon: "tv", isAppliance: true, w: 120, d: 25 },
  { id: "water_heater", label: "Water heater", icon: "heater", isAppliance: true, w: 40, d: 40 },
  { id: "fan", label: "Fan", icon: "fan", isAppliance: true, w: 45, d: 45 },
  { id: "oven", label: "Oven", icon: "cooking-pot", isAppliance: true, w: 60, d: 60 },
  { id: "microwave", label: "Microwave", icon: "microwave", isAppliance: true, w: 50, d: 40 },
  { id: "dishwasher", label: "Dishwasher", icon: "droplets", isAppliance: true, w: 60, d: 60 },
  { id: "cooker_hob", label: "Hob & hood", icon: "flame", isAppliance: true, w: 80, d: 55 },
  { id: "water_filter", label: "Water filter", icon: "glass-water", isAppliance: true, w: 30, d: 30 },
  { id: "air_purifier", label: "Air purifier", icon: "air-vent", isAppliance: true, w: 35, d: 35 },
  { id: "vacuum", label: "Vacuum / robot", icon: "circle-dot", isAppliance: true, w: 35, d: 35 },
  { id: "computer", label: "Computer", icon: "laptop", isAppliance: true, w: 60, d: 40 },
  { id: "network", label: "Router & network", icon: "router", isAppliance: true, w: 30, d: 20 },
  { id: "lighting", label: "Lighting", icon: "lamp", isAppliance: false, w: 40, d: 40 },
  { id: "furniture", label: "Furniture", icon: "armchair", isAppliance: false, w: 90, d: 60 },
  { id: "other", label: "Other", icon: "package", isAppliance: false, w: 50, d: 50 },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export type IconName = (typeof CATEGORIES)[number]["icon"];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as unknown as [CategoryId, ...CategoryId[]];

const byId = new Map<string, (typeof CATEGORIES)[number]>(CATEGORIES.map((c) => [c.id, c]));

export function category(id: string) {
  return byId.get(id) ?? byId.get("other")!;
}
