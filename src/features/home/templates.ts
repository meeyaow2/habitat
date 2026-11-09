import { furnitureSpec, newId, roomPolygon, type FloorDoc, type PlanObject, type RoomShape, type RoomType } from "./model";
import { DEFAULTS, nearestWall, rectPolygon, wallsFromPolygons, type OpeningKind } from "./cad";

/**
 * Editable starter layouts. HDB totals and room relationships reference the
 * published brochure named below; individual room dimensions are approximate.
 * Condo layouts are illustrative, consistently scaled arrangements.
 */
type TemplateRoom = { name: string; type: RoomType; x: number; y: number; w: number; h: number; furniture?: TemplateFurniture[]; locked?: boolean };
type TemplateFurniture = { type: string; at?: "centre" | "top" | "bottom" | "left" | "right"; rotate?: number; x?: number; y?: number; kind?: "furniture" | "fixture" };
type TemplateOpening = { kind: OpeningKind; x: number; y: number; width?: number; flip?: boolean; hingeEnd?: boolean; style?: "single" | "double" | "sliding" | "pocket" };
type TemplateFloor = { name: string; level: number; rooms: TemplateRoom[]; openings?: TemplateOpening[] };

export type TemplateReference = {
  title: string;
  url: string;
  totalAreaM2: number;
  internalAreaM2: number;
  separateSpaces: string;
  note: string;
};

export type TemplateKey =
  | "blank" | "hdb_2_room" | "hdb_3_room" | "hdb_4_room" | "hdb_5_room" | "hdb_executive"
  | "condo_1br" | "condo_2br" | "condo_3br" | "condo_4br" | "landed_terrace";

export type HomeTemplate = {
  key: TemplateKey;
  label: string;
  summary: string;
  approxAreaM2: number | null;
  propertyTypes: string[];
  hdbFlatType?: string;
  reference?: TemplateReference;
  floors: TemplateFloor[];
};

const M = 100; // metres → cm

function room(name: string, type: RoomType, x: number, y: number, w: number, h: number, furniture?: TemplateFurniture[], locked = false): TemplateRoom {
  return { name, type, x: Math.round(x * M), y: Math.round(y * M), w: Math.round(w * M), h: Math.round(h * M), furniture, locked };
}

const bed = (type = "bed_double"): TemplateFurniture => ({ type, at: "centre" });

const HDB_SOURCE = "https://assets.hdb.gov.sg/residential/buying-a-flat/finding-a-flat/sales-brochure/25JULBTO_pdf_selection/bangkit_breeze.pdf";
const hdbReference = (totalAreaM2: number, internalAreaM2: number): TemplateReference => ({
  title: "HDB Bangkit Breeze sales brochure (Jul 2025)",
  url: HDB_SOURCE,
  totalAreaM2,
  internalAreaM2,
  separateSpaces: `Air-con ledge ≈ ${totalAreaM2 - internalAreaM2} m²`,
  note: "Published total and internal areas; individual room dimensions are inferred from the scaled plan and are approximate.",
});

function scaleTemplateFloor(floor: TemplateFloor, factor: number): TemplateFloor {
  const scale = (value: number) => Math.round(value * factor * 10) / 10;
  return {
    ...floor,
    rooms: floor.rooms.map((candidate) => ({
      ...candidate,
      x: scale(candidate.x), y: scale(candidate.y), w: scale(candidate.w), h: scale(candidate.h),
      furniture: candidate.furniture?.map((furniture) => ({ ...furniture, x: furniture.x === undefined ? undefined : furniture.x * factor, y: furniture.y === undefined ? undefined : furniture.y * factor })),
    })),
    openings: floor.openings?.map((opening) => ({ ...opening, x: opening.x * factor, y: opening.y * factor })),
  };
}

const HDB_4_ROOM = scaleTemplateFloor({
  name: "Main floor",
  level: 1,
  rooms: [
    room("Main bedroom", "bedroom", 0, 0, 3.0, 4.2, [{ type: "bed_double", x: 1.0, y: 0.76, rotate: 270 }, { type: "wardrobe", x: 1.0, y: 3.85 }]),
    room("Bedroom 2", "bedroom", 3.0, 0, 2.6, 3.0, [{ type: "bed_single", x: 1.6, y: 0.55, rotate: 90 }, { type: "wardrobe", x: 0.35, y: 1.95, rotate: 90 }]),
    room("Bedroom 3", "bedroom", 5.6, 0, 2.6, 3.0, [{ type: "bed_single", x: 1.0, y: 0.55, rotate: 270 }, { type: "wardrobe", x: 2.25, y: 1.95, rotate: 90 }]),
    room("Living room", "living", 8.2, 0, 3.8, 5.2, [{ type: "tv_console", at: "top" }, { type: "sofa", at: "bottom" }, { type: "coffee_table", at: "centre" }]),
    room("Bedroom corridor", "corridor", 3.0, 3.0, 5.2, 1.2),
    room("Common bath", "bathroom", 1.6, 4.2, 1.9, 1.8, [
      { type: "toilet", x: 0.48, y: 1.28, kind: "fixture" }, { type: "basin", x: 1.48, y: 0.42, rotate: 90, kind: "fixture" }, { type: "shower", x: 0.52, y: 0.48, kind: "fixture" },
    ]),
    room("Main bath", "bathroom", 3.5, 4.2, 1.9, 1.8, [
      { type: "toilet", x: 1.38, y: 1.28, kind: "fixture" }, { type: "basin", x: 0.42, y: 0.42, rotate: 90, kind: "fixture" }, { type: "shower", x: 1.36, y: 0.48, kind: "fixture" },
    ]),
    room("Dining", "dining", 5.4, 4.2, 2.8, 1.8, [
      { type: "dining_table", at: "centre" },
      { type: "dining_chair", x: 0.38, y: 0.9 }, { type: "dining_chair", x: 2.42, y: 0.9 },
    ]),
    room("Air-con ledge", "balcony", 1.6, 6.0, 1.9, 1.98),
    room("Service yard", "utility", 3.5, 6.0, 1.9, 2.3, [{ type: "counter", at: "bottom" }]),
    room("Kitchen", "kitchen", 5.4, 6.0, 2.8, 2.3, [
      { type: "counter", at: "right", rotate: 90 }, { type: "sink", x: 2.48, y: 1.72, rotate: 90, kind: "fixture" }, { type: "hob", x: 2.48, y: 0.55, rotate: 90, kind: "fixture" },
    ]),
    room("Entrance", "corridor", 8.2, 5.2, 1.9, 2.0),
    room("Household shelter", "household_shelter", 10.1, 5.2, 1.9, 2.0, undefined, true),
  ],
  openings: [
    { kind: "window", x: 1.5, y: 0, width: 150 }, { kind: "window", x: 4.3, y: 0, width: 120 }, { kind: "window", x: 6.9, y: 0, width: 120 }, { kind: "window", x: 10.0, y: 0, width: 180 },
    { kind: "door", x: 3.0, y: 3.55, width: 82, flip: true },
    { kind: "door", x: 4.75, y: 3.0, width: 82, hingeEnd: true }, { kind: "door", x: 6.45, y: 3.0, width: 82 },
    { kind: "door", x: 2.55, y: 4.2, width: 72 }, { kind: "door", x: 4.45, y: 4.2, width: 72, hingeEnd: true },
    { kind: "opening", x: 7.0, y: 4.2, width: 150 }, { kind: "opening", x: 8.2, y: 4.65, width: 150 },
    { kind: "opening", x: 9.15, y: 5.2, width: 150 },
    { kind: "door", x: 10.1, y: 6.25, width: 72, flip: true }, { kind: "door", x: 9.15, y: 7.2, width: 92, flip: true },
    { kind: "door", x: 5.4, y: 7.05, width: 86, style: "sliding" }, { kind: "door", x: 6.8, y: 6.0, width: 100, style: "sliding" },
    { kind: "window", x: 4.45, y: 8.3, width: 110 }, { kind: "window", x: 6.8, y: 8.3, width: 120 },
  ],
}, Math.sqrt(94 / 88.252));

export const TEMPLATES: HomeTemplate[] = [
  {
    key: "hdb_2_room",
    label: "HDB 2-room Flexi",
    summary: "1 bedroom, living & dining, kitchen, bathroom, shelter",
    approxAreaM2: 49,
    propertyTypes: ["hdb"],
    hdbFlatType: "2_room",
    reference: hdbReference(49, 46),
    floors: [
      {
        name: "Main floor",
        level: 1,
        rooms: [
          room("Living & dining", "living", 0, 0, 4.4, 4.4, [{ type: "sofa", x: 1.55, y: 3.45 }, { type: "dining_table", x: 3.35, y: 2.0, rotate: 90 }]),
          room("Kitchen", "kitchen", 0, 4.4, 2.4, 2.4, [{ type: "counter", at: "right", rotate: 90 }]),
          room("Bathroom", "bathroom", 2.4, 4.4, 2.0, 2.4),
          room("Bedroom", "bedroom", 4.4, 0, 3.4, 3.6, [
            { type: "bed_double", x: 2.38, y: 0.85, rotate: 90 },
            { type: "wardrobe", x: 2.45, y: 3.3 },
          ]),
          room("Household shelter", "household_shelter", 4.4, 3.6, 1.2, 3.2, undefined, true),
          room("Air-con ledge", "balcony", 5.6, 4.8, 1.5, 2.0),
        ],
        openings: [
          { kind: "door", x: 0, y: 3.2, width: 92, flip: true },
          { kind: "door", x: 4.4, y: 1.85, width: 82, hingeEnd: true },
          { kind: "opening", x: 1.2, y: 4.4, width: 120 },
          { kind: "door", x: 3.35, y: 4.4, width: 72, hingeEnd: true },
          { kind: "door", x: 4.4, y: 4.0, width: 72, flip: true },
          { kind: "window", x: 1.6, y: 0, width: 150 },
          { kind: "window", x: 6.1, y: 0, width: 150 },
          { kind: "window", x: 1.2, y: 6.8, width: 110 },
          { kind: "window", x: 3.35, y: 6.8, width: 90 },
        ],
      },
    ],
  },
  {
    key: "hdb_3_room",
    label: "HDB 3-room",
    summary: "2 bedrooms, 2 bathrooms, living, dining, kitchen, shelter",
    approxAreaM2: 69,
    propertyTypes: ["hdb"],
    hdbFlatType: "3_room",
    reference: hdbReference(69, 66),
    floors: [
      {
        name: "Main floor",
        level: 1,
        rooms: [
          room("Main bedroom", "bedroom", 0, 0, 3.2, 3.0, [{ type: "bed_double", x: 1.02, y: 0.8, rotate: 270 }, { type: "wardrobe", x: 2.85, y: 1.9, rotate: 90 }]),
          room("Bedroom 2", "bedroom", 3.2, 0, 3.0, 3.0, [{ type: "bed_single", x: 1.0, y: 0.65, rotate: 270 }, { type: "wardrobe", x: 2.65, y: 1.9, rotate: 90 }]),
          room("Hallway", "corridor", 0, 3.0, 6.2, 1.0),
          room("Living & dining", "living", 6.2, 0, 3.8, 4.2, [{ type: "sofa", x: 2.5, y: 3.35 }, { type: "dining_table", x: 1.0, y: 1.6, rotate: 90 }, { type: "tv_console", x: 2.7, y: 0.3 }]),
          room("Main bath", "bathroom", 0, 4.0, 1.8, 2.1),
          room("Common bath", "bathroom", 1.8, 4.0, 1.8, 2.1),
          room("Dry kitchen", "dining", 3.6, 4.0, 2.0, 1.8),
          room("Kitchen / utility", "kitchen", 3.6, 5.8, 3.0, 3.4, [{ type: "counter", at: "right", rotate: 90 }]),
          room("Household shelter", "household_shelter", 6.6, 4.2, 1.6, 2.4, undefined, true),
          room("Air-con ledge", "balcony", 0, 6.1, 1.5, 2.0),
        ],
        openings: [
          { kind: "door", x: 10.0, y: 3.3, width: 92 },
          { kind: "opening", x: 6.2, y: 3.5, width: 90 },
          { kind: "door", x: 1.65, y: 3.0, width: 82, flip: true },
          { kind: "door", x: 4.7, y: 3.0, width: 82 },
          { kind: "door", x: 0.9, y: 4.0, width: 72 },
          { kind: "door", x: 2.7, y: 4.0, width: 72, hingeEnd: true },
          { kind: "opening", x: 4.6, y: 4.0, width: 120 },
          { kind: "door", x: 7.4, y: 4.2, width: 72, flip: true },
          { kind: "door", x: 4.6, y: 5.8, width: 110, style: "sliding" },
          { kind: "window", x: 1.6, y: 0, width: 140 },
          { kind: "window", x: 4.7, y: 0, width: 130 },
          { kind: "window", x: 8.2, y: 0, width: 150 },
          { kind: "window", x: 5.0, y: 9.2, width: 130 },
        ],
      },
    ],
  },
  {
    key: "hdb_4_room",
    label: "HDB 4-room",
    summary: "3 bedrooms, 2 bathrooms, living, dining, kitchen, yard, shelter",
    approxAreaM2: 94,
    propertyTypes: ["hdb"],
    hdbFlatType: "4_room",
    reference: hdbReference(94, 90),
    floors: [HDB_4_ROOM],
  },
  {
    key: "hdb_5_room",
    label: "HDB 5-room",
    summary: "3 bedrooms plus study, 2 bathrooms, larger living and dining",
    approxAreaM2: 114,
    propertyTypes: ["hdb"],
    hdbFlatType: "5_room",
    reference: hdbReference(114, 110),
    floors: [
      {
        name: "Main floor",
        level: 1,
        rooms: [
          room("Main bedroom", "bedroom", 0, 0, 3.4, 3.2, [{ type: "bed_double", x: 1.0, y: 0.8, rotate: 270 }, { type: "wardrobe", x: 3.05, y: 2.15, rotate: 90 }]),
          room("Bedroom 2", "bedroom", 3.4, 0, 3.0, 3.2, [{ type: "bed_single", x: 1.0, y: 0.6, rotate: 270 }, { type: "wardrobe", x: 2.65, y: 2.05, rotate: 90 }]),
          room("Bedroom 3", "bedroom", 6.4, 0, 3.0, 3.2, [{ type: "bed_single", x: 2.0, y: 0.6, rotate: 90 }, { type: "wardrobe", x: 0.35, y: 2.05, rotate: 90 }]),
          room("Bedroom hallway", "corridor", 0, 3.2, 9.4, 1.0),
          room("Living & dining", "living", 9.4, 0, 5.7, 6.0, [{ type: "tv_console", x: 2.85, y: 0.3 }, { type: "dining_table", x: 1.25, y: 2.4, rotate: 90 }, { type: "sofa", x: 3.75, y: 4.8 }, { type: "coffee_table", x: 3.75, y: 3.55 }]),
          room("Main bath", "bathroom", 0, 4.2, 2.0, 1.8),
          room("Common bath", "bathroom", 2.0, 4.2, 2.0, 1.8),
          room("Suggested study", "study", 4.0, 4.2, 2.8, 1.8, [{ type: "desk", x: 0.85, y: 1.45 }, { type: "shelf", x: 2.35, y: 1.55 }]),
          room("Kitchen", "kitchen", 6.8, 4.2, 2.6, 3.0, [{ type: "counter", at: "right", rotate: 90 }, { type: "sink", x: 2.3, y: 2.3, rotate: 90, kind: "fixture" }, { type: "hob", x: 2.3, y: 0.65, rotate: 90, kind: "fixture" }]),
          room("Air-con ledge", "balcony", 0, 6.0, 2.0, 2.0),
          room("Service yard", "utility", 6.8, 7.2, 2.6, 2.0),
          room("Entrance", "corridor", 9.4, 6.0, 2.6, 2.0),
          room("Household shelter", "household_shelter", 12.0, 6.0, 3.1, 2.0, undefined, true),
        ],
        openings: [
          { kind: "door", x: 10.7, y: 8.0, width: 92, flip: true },
          { kind: "opening", x: 10.7, y: 6.0, width: 150 },
          { kind: "opening", x: 9.4, y: 3.65, width: 150 },
          { kind: "door", x: 1.7, y: 3.2, width: 82, flip: true },
          { kind: "door", x: 4.9, y: 3.2, width: 82 },
          { kind: "door", x: 7.9, y: 3.2, width: 82, hingeEnd: true },
          { kind: "door", x: 1.0, y: 4.2, width: 72 },
          { kind: "door", x: 3.0, y: 4.2, width: 72, hingeEnd: true },
          { kind: "opening", x: 5.4, y: 4.2, width: 140 },
          { kind: "opening", x: 8.1, y: 4.2, width: 120 },
          { kind: "opening", x: 9.4, y: 5.15, width: 120 },
          { kind: "door", x: 8.1, y: 7.2, width: 110, style: "sliding" },
          { kind: "door", x: 12.0, y: 7.0, width: 72, flip: true },
          { kind: "window", x: 1.7, y: 0, width: 150 },
          { kind: "window", x: 4.9, y: 0, width: 130 },
          { kind: "window", x: 7.9, y: 0, width: 130 },
          { kind: "window", x: 12.2, y: 0, width: 180 },
          { kind: "window", x: 8.1, y: 9.2, width: 120 },
        ],
      },
    ],
  },
  {
    key: "hdb_executive",
    label: "HDB Executive",
    summary: "5-room layout with an additional family area",
    approxAreaM2: 130,
    propertyTypes: ["hdb"],
    hdbFlatType: "executive",
    floors: [
      {
        ...HDB_4_ROOM,
        rooms: [
          ...HDB_4_ROOM.rooms,
          room("Study", "study", 12.4, 0, 2.8, 5.4, [{ type: "desk", at: "top" }]),
          room("Balcony", "balcony", 12.4, 5.4, 2.8, 3.0),
          room("Family area", "living", 0, 8.6, 5.4, 3.0, [{ type: "sofa", at: "centre" }]),
        ],
      },
    ],
  },
  {
    key: "condo_1br",
    label: "Condo — 1 bedroom",
    summary: "Open living & dining, kitchen, bedroom, bath and balcony",
    approxAreaM2: 50,
    propertyTypes: ["condo", "apartment"],
    floors: [
      {
        name: "Main floor",
        level: 1,
        rooms: [
          room("Living & dining", "living", 0, 0, 5.0, 4.0, [{ type: "sofa", at: "bottom" }, { type: "dining_table", at: "top" }]),
          room("Balcony", "balcony", 0, 4.0, 5.0, 1.4),
          room("Kitchen", "kitchen", 5.0, 0, 2.2, 2.5, [{ type: "counter", at: "right", rotate: 90 }]),
          room("Bathroom", "bathroom", 5.0, 2.5, 2.2, 1.5),
          room("Entrance", "corridor", 5.0, 4.0, 2.2, 1.4),
          room("Bedroom", "bedroom", 7.2, 0, 3.4, 4.0, [bed(), { type: "wardrobe", at: "bottom" }]),
        ],
      },
    ],
  },
  {
    key: "condo_2br",
    label: "Condo — 2 bedrooms",
    summary: "Open living & dining, kitchen, 2 bedrooms, 2 baths, balcony",
    approxAreaM2: 70,
    propertyTypes: ["condo", "apartment"],
    floors: [
      {
        name: "Main floor",
        level: 1,
        rooms: [
          room("Living & dining", "living", 0, 0, 5.6, 4.4, [{ type: "sofa", x: 1.5, y: 3.45 }, { type: "dining_table", x: 4.25, y: 2.4, rotate: 90 }, { type: "tv_console", x: 1.5, y: 0.3 }]),
          room("Balcony", "balcony", 0, 4.4, 5.6, 1.6),
          room("Kitchen", "kitchen", 5.6, 0, 2.6, 2.8, [{ type: "counter", at: "right", rotate: 90 }]),
          room("Entry hall", "corridor", 5.6, 2.8, 2.6, 1.6),
          room("Common bath", "bathroom", 5.6, 4.4, 2.6, 1.8),
          room("Bedroom hallway", "corridor", 8.2, 3.2, 4.4, 1.2),
          room("Main bedroom", "bedroom", 8.2, 0, 4.4, 3.2, [{ type: "bed_double", x: 1.0, y: 0.8, rotate: 270 }, { type: "wardrobe", x: 3.95, y: 1.85, rotate: 90 }]),
          room("Main bath", "bathroom", 8.2, 4.4, 1.8, 1.8),
          room("Bedroom 2", "bedroom", 10.0, 4.4, 2.6, 3.0, [{ type: "bed_single", x: 1.0, y: 2.3, rotate: 270 }, { type: "wardrobe", x: 2.3, y: 0.95, rotate: 90 }]),
        ],
        openings: [
          { kind: "door", x: 0, y: 3.35, width: 92, flip: true },
          { kind: "opening", x: 5.6, y: 3.55, width: 110 },
          { kind: "door", x: 6.9, y: 2.8, width: 90, style: "sliding" },
          { kind: "opening", x: 8.2, y: 3.75, width: 100 },
          { kind: "door", x: 10.5, y: 3.2, width: 82 },
          { kind: "door", x: 6.9, y: 4.4, width: 72 },
          { kind: "door", x: 9.1, y: 4.4, width: 72, hingeEnd: true },
          { kind: "door", x: 11.3, y: 4.4, width: 82 },
          { kind: "door", x: 2.8, y: 4.4, width: 180, style: "sliding" },
          { kind: "window", x: 2.8, y: 0, width: 180 },
          { kind: "window", x: 6.9, y: 0, width: 120 },
          { kind: "window", x: 10.4, y: 0, width: 170 },
          { kind: "window", x: 6.9, y: 6.2, width: 100 },
          { kind: "window", x: 11.3, y: 7.4, width: 120 },
        ],
      },
    ],
  },
  {
    key: "condo_3br",
    label: "Condo — 3 bedrooms",
    summary: "Living & dining, kitchen, 3 bedrooms, 2 baths, balcony, utility",
    approxAreaM2: 100,
    propertyTypes: ["condo", "apartment"],
    floors: [
      {
        name: "Main floor",
        level: 1,
        rooms: [
          room("Living & dining", "living", 0, 0, 6.2, 4.6, [{ type: "sofa", x: 1.6, y: 3.65 }, { type: "dining_table", x: 4.8, y: 2.4, rotate: 90 }, { type: "tv_console", x: 1.6, y: 0.3 }]),
          room("Balcony", "balcony", 0, 4.6, 6.2, 1.6),
          room("Kitchen", "kitchen", 6.2, 0, 2.8, 3.0, [{ type: "counter", at: "right", rotate: 90 }]),
          room("Entry hall", "corridor", 6.2, 3.0, 2.8, 1.6),
          room("Common bath", "bathroom", 6.2, 4.6, 2.8, 1.8),
          room("Bedroom hallway", "corridor", 9.0, 3.4, 5.4, 1.2),
          room("Main bedroom", "bedroom", 9.0, 0, 3.6, 3.4, [{ type: "bed_double", x: 1.0, y: 0.8, rotate: 270 }, { type: "wardrobe", x: 3.25, y: 2.0, rotate: 90 }]),
          room("Main bath", "bathroom", 12.6, 0, 1.8, 3.4),
          room("Bedroom 2", "bedroom", 9.0, 4.6, 2.7, 3.0, [{ type: "bed_single", x: 1.0, y: 2.3, rotate: 270 }, { type: "wardrobe", x: 2.4, y: 0.95, rotate: 90 }]),
          room("Bedroom 3", "bedroom", 11.7, 4.6, 2.7, 3.0, [{ type: "bed_single", x: 1.7, y: 2.3, rotate: 90 }, { type: "wardrobe", x: 0.3, y: 0.95, rotate: 90 }]),
        ],
        openings: [
          { kind: "door", x: 0, y: 3.5, width: 92, flip: true },
          { kind: "opening", x: 6.2, y: 3.7, width: 110 },
          { kind: "door", x: 7.6, y: 3.0, width: 100, style: "sliding" },
          { kind: "opening", x: 9.0, y: 3.9, width: 100 },
          { kind: "door", x: 10.8, y: 3.4, width: 82 },
          { kind: "door", x: 13.5, y: 3.4, width: 72, hingeEnd: true },
          { kind: "door", x: 7.6, y: 4.6, width: 72 },
          { kind: "door", x: 10.35, y: 4.6, width: 82 },
          { kind: "door", x: 13.05, y: 4.6, width: 82, hingeEnd: true },
          { kind: "door", x: 3.1, y: 4.6, width: 190, style: "sliding" },
          { kind: "window", x: 3.1, y: 0, width: 200 },
          { kind: "window", x: 7.6, y: 0, width: 130 },
          { kind: "window", x: 10.8, y: 0, width: 150 },
          { kind: "window", x: 14.4, y: 1.7, width: 140 },
          { kind: "window", x: 10.35, y: 7.6, width: 120 },
          { kind: "window", x: 13.05, y: 7.6, width: 120 },
        ],
      },
    ],
  },
  {
    key: "condo_4br",
    label: "Condo — 4 bedrooms",
    summary: "Larger living & dining, kitchen, 4 bedrooms, 2 baths and balcony",
    approxAreaM2: 125,
    propertyTypes: ["condo", "apartment"],
    floors: [
      {
        name: "Main floor",
        level: 1,
        rooms: [
          room("Living & dining", "living", 0, 0, 6.2, 4.6, [{ type: "sofa", at: "bottom" }, { type: "dining_table", at: "top" }]),
          room("Balcony", "balcony", 0, 4.6, 6.2, 1.6),
          room("Kitchen", "kitchen", 6.2, 0, 2.8, 3.0, [{ type: "counter", at: "right", rotate: 90 }]),
          room("Utility", "utility", 6.2, 3.0, 1.6, 1.6),
          room("Household shelter", "household_shelter", 7.8, 3.0, 1.2, 1.6),
          room("Hallway", "corridor", 6.2, 4.6, 2.8, 1.6),
          room("Master bedroom", "bedroom", 9.0, 0, 3.6, 3.4, [bed(), { type: "wardrobe", at: "bottom" }]),
          room("Master bath", "bathroom", 12.6, 0, 1.8, 1.7),
          room("Common bath", "bathroom", 12.6, 1.7, 1.8, 1.7),
          room("Bedroom 2", "bedroom", 9.0, 3.4, 2.7, 2.8, [bed("bed_single")]),
          room("Bedroom 3", "bedroom", 11.7, 3.4, 2.7, 2.8, [bed("bed_single")]),
          room("Bedroom 4", "bedroom", 14.4, 0, 2.8, 3.1, [bed("bed_single")]),
        ],
      },
    ],
  },
  {
    key: "landed_terrace",
    label: "Landed — terrace house",
    summary: "Two levels: living, dining, kitchen, porch; 3 bedrooms upstairs",
    approxAreaM2: 180,
    propertyTypes: ["landed"],
    floors: [
      {
        name: "Level 1",
        level: 1,
        rooms: [
          room("Car porch", "garage", 0, 0, 6.0, 5.0),
          room("Living room", "living", 0, 5.0, 6.0, 5.0, [{ type: "sofa", at: "bottom" }, { type: "tv_console", at: "top" }]),
          room("Dining", "dining", 0, 10.0, 3.6, 4.0, [{ type: "dining_table", at: "centre", rotate: 90 }]),
          room("Kitchen", "kitchen", 3.6, 10.0, 2.4, 4.0, [{ type: "counter", at: "right", rotate: 90 }]),
          room("Yard", "utility", 0, 14.0, 3.6, 2.0),
          room("Guest bath", "bathroom", 3.6, 14.0, 2.4, 2.0),
        ],
      },
      {
        name: "Level 2",
        level: 2,
        rooms: [
          room("Master bedroom", "bedroom", 0, 5.0, 6.0, 4.4, [bed(), { type: "wardrobe", at: "bottom" }]),
          room("Master bath", "bathroom", 0, 9.4, 2.6, 2.4),
          room("Family area", "living", 2.6, 9.4, 3.4, 2.4, [{ type: "sofa", at: "centre" }]),
          room("Bedroom 2", "bedroom", 0, 11.8, 3.2, 4.2, [bed("bed_single")]),
          room("Bedroom 3", "bedroom", 3.2, 11.8, 2.8, 2.6, [{ type: "desk", at: "top" }]),
          room("Common bath", "bathroom", 3.2, 14.4, 2.8, 1.6),
        ],
      },
    ],
  },
  {
    key: "blank",
    label: "Draw it yourself",
    summary: "Empty canvas — draw walls, doors and windows to your own measurements",
    approxAreaM2: null,
    propertyTypes: ["hdb", "condo", "landed", "apartment", "other"],
    floors: [{ name: "Main floor", level: 1, rooms: [] }],
  },
];

export function getTemplate(key: string): HomeTemplate | undefined {
  return TEMPLATES.find((t) => t.key === key);
}

export function templatesFor(propertyType: string): HomeTemplate[] {
  return TEMPLATES.filter((t) => t.propertyTypes.includes(propertyType));
}

export function suggestedTemplate(propertyType: string, hdbFlatType?: string | null): TemplateKey {
  if (propertyType === "hdb") {
    return (TEMPLATES.find((t) => t.hdbFlatType === hdbFlatType)?.key ?? "hdb_4_room") as TemplateKey;
  }
  if (propertyType === "condo" || propertyType === "apartment") return "condo_3br";
  if (propertyType === "landed") return "landed_terrace";
  return "blank";
}

function placeFurniture(r: TemplateRoom, f: TemplateFurniture): PlanObject | null {
  const spec = furnitureSpec(f.type);
  if (!spec) return null;
  const rotation = f.rotate ?? 0;
  const rotated = rotation % 180 !== 0;
  // Visual footprint after rotation
  const fw = rotated ? spec.h : spec.w;
  const fh = rotated ? spec.w : spec.h;
  if (fw > r.w - 20 || fh > r.h - 20) return null;
  const inset = 25;
  let cx = r.x + r.w / 2;
  let cy = r.y + r.h / 2;
  if (f.x !== undefined) cx = r.x + Math.round(f.x * M);
  if (f.y !== undefined) cy = r.y + Math.round(f.y * M);
  if (f.at === "top") cy = r.y + inset + fh / 2;
  if (f.at === "bottom") cy = r.y + r.h - inset - fh / 2;
  if (f.at === "left") cx = r.x + inset + fw / 2;
  if (f.at === "right") cx = r.x + r.w - inset - fw / 2;
  return {
    id: newId(),
    kind: f.kind ?? "furniture",
    assetId: null,
    furnitureType: spec.value,
    label: spec.label,
    // Stored as the unrotated box, rotated about its centre.
    x: Math.round(cx - spec.w / 2),
    y: Math.round(cy - spec.h / 2),
    width: spec.w,
    height: spec.h,
    rotation,
  };
}

/** Instantiate a template floor into a document with fresh ids. */
export function instantiateFloor(floor: TemplateFloor): FloorDoc {
  const rooms: RoomShape[] = floor.rooms.map((r, i) => ({
    id: newId(),
    name: r.name,
    roomType: r.type,
    x: r.x,
    y: r.y,
    width: r.w,
    height: r.h,
    sortOrder: i,
    polygon: rectPolygon({ x: r.x, y: r.y, width: r.w, height: r.h }),
    locked: r.locked,
  }));
  const objects: PlanObject[] = floor.rooms.flatMap((r) =>
    (r.furniture ?? []).map((f) => placeFurniture(r, f)).filter((o): o is PlanObject => o !== null),
  );
  // Walls are generated from the room outlines so the plan is immediately editable as a drawing.
  const shelter = rooms.find((r) => r.roomType === "household_shelter");
  const onSegment = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) < 1 && p.x >= Math.min(a.x, b.x) - 1 && p.x <= Math.max(a.x, b.x) + 1 && p.y >= Math.min(a.y, b.y) - 1 && p.y <= Math.max(a.y, b.y) + 1;
  const shelterEdges = shelter ? roomPolygon(shelter).map((a, i, pts) => [a, pts[(i + 1) % pts.length]] as const) : [];
  const walls = wallsFromPolygons(rooms.map((r) => r.polygon!), newId).map((w) => {
    const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    const locked = shelterEdges.some(([a, b]) => onSegment(mid, a, b));
    return { ...w, locked };
  });
  const openings = (floor.openings ?? []).flatMap((spec) => {
    const p = { x: spec.x * M, y: spec.y * M };
    const hit = nearestWall(walls, p, 8);
    if (!hit) return [];
    const defaults = DEFAULTS[spec.kind];
    return [{
      id: newId(), wallId: hit.wall.id, kind: spec.kind, offset: hit.offset, width: spec.width ?? defaults.width,
      flip: spec.flip ?? false, hingeEnd: spec.hingeEnd ?? false, style: spec.style, height: defaults.height, sill: defaults.sill,
    }];
  });
  return { rooms, objects, geometry: { walls, openings, dimensions: [], labels: [] } };
}

/** Canvas extent for a floor, with breathing room around the rooms. */
export function floorExtent(floor: TemplateFloor) {
  const maxX = Math.max(800, ...floor.rooms.map((r) => r.x + r.w));
  const maxY = Math.max(600, ...floor.rooms.map((r) => r.y + r.h));
  return { widthCm: Math.ceil((maxX + 400) / 100) * 100, depthCm: Math.ceil((maxY + 400) / 100) * 100 };
}
