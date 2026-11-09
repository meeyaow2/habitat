import type { TemplateKey } from "@/features/home/templates";

export type StarterChoice = {
  key: TemplateKey;
  label: string;
  bedrooms: number;
  summary: string;
};

export const STARTER_CHOICES: StarterChoice[] = [
  { key: "hdb_2_room", label: "HDB 2-room Flexi", bedrooms: 1, summary: "Compact living, kitchen and household shelter" },
  { key: "hdb_3_room", label: "HDB 3-room", bedrooms: 2, summary: "Living, dining, kitchen and household shelter" },
  { key: "hdb_4_room", label: "HDB 4-room", bedrooms: 3, summary: "Three bedrooms, service yard and household shelter" },
  { key: "hdb_5_room", label: "HDB 5-room", bedrooms: 3, summary: "A larger living and dining area with a connected study" },
  { key: "condo_2br", label: "Condo · 2 bedrooms", bedrooms: 2, summary: "A compact apartment with a balcony" },
  { key: "condo_3br", label: "Condo · 3 bedrooms", bedrooms: 3, summary: "A larger apartment with a balcony and two bathrooms" },
  { key: "blank", label: "Start from scratch", bedrooms: 0, summary: "Begin with an empty canvas and add the spaces you need" },
];
