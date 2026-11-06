import type { IntervalUnit } from "./dates";

/**
 * General maintenance guidance — common household practice, NOT manufacturer
 * instructions. Every suggestion is stored with source = 'general_guidance'
 * and labelled as such in the UI. Users can change any interval, and should
 * follow their product manual where it differs.
 */
export type Guidance = {
  title: string;
  interval: number;
  unit: IntervalUnit;
  why: string;
  professional?: boolean;
};

export const GENERAL_GUIDANCE: Record<string, Guidance[]> = {
  air_conditioner: [
    { title: "Clean air filters", interval: 1, unit: "month", why: "Dusty filters reduce cooling and raise energy use, especially in humid climates." },
    { title: "Professional aircon servicing", interval: 3, unit: "month", why: "A common practice in Singapore homes to keep coils and drainage clear.", professional: true },
  ],
  washing_machine: [
    { title: "Clean drum, seal and drain filter", interval: 1, unit: "month", why: "Prevents odour, mould and drainage problems." },
  ],
  dryer: [
    { title: "Clear lint filter and check vent", interval: 1, unit: "month", why: "Lint build-up reduces efficiency and is a fire risk. Empty the lint filter after every load." },
  ],
  refrigerator: [
    { title: "Clean door seals and vents", interval: 6, unit: "month", why: "Keeps the seal tight and airflow clear." },
  ],
  water_heater: [
    { title: "Visual check for leaks or corrosion", interval: 6, unit: "month", why: "Early signs of a problem. Do not open or repair the unit yourself." },
    { title: "Inspection by a licensed technician", interval: 1, unit: "year", why: "Electrical and pressure components should only be serviced by a qualified professional.", professional: true },
  ],
  cooker_hob: [
    { title: "Degrease hood filters", interval: 3, unit: "month", why: "Grease build-up reduces suction and is a fire risk." },
  ],
  water_filter: [
    { title: "Replace filter cartridge", interval: 6, unit: "month", why: "Typical cartridge life — check your manual for the exact interval." },
  ],
  dishwasher: [
    { title: "Clean the filter", interval: 1, unit: "month", why: "Keeps wash quality up and prevents drainage issues." },
  ],
  air_purifier: [
    { title: "Check or replace filter", interval: 6, unit: "month", why: "Filter life depends on use and air quality; check the indicator or manual." },
  ],
  fan: [{ title: "Dust blades and grille", interval: 3, unit: "month", why: "Improves airflow and reduces dust circulation." }],
  vacuum: [{ title: "Empty bin, clean brushes and filter", interval: 1, unit: "month", why: "Maintains suction." }],
  oven: [{ title: "Clean interior and door seal", interval: 3, unit: "month", why: "Prevents smoke and odours from residue." }],
  microwave: [{ title: "Clean interior", interval: 1, unit: "month", why: "Prevents residue build-up." }],
};

export const HOUSEHOLD_GUIDANCE: Guidance[] = [
  { title: "Test smoke detector", interval: 1, unit: "month", why: "Press the test button to confirm it sounds. Replace batteries when prompted." },
  { title: "Check sinks and pipes for leaks", interval: 3, unit: "month", why: "Small leaks are cheaper to fix early. Call a licensed plumber for repairs." },
];

export function guidanceFor(categoryId: string): Guidance[] {
  return GENERAL_GUIDANCE[categoryId] ?? [];
}

export const GUIDANCE_DISCLAIMER =
  "General guidance based on common household practice — not manufacturer instructions. Follow your product manual if it says otherwise.";
