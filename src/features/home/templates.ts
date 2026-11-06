import { furnitureSpec, newId, type FloorDoc, type PlanObject, type RoomShape, type RoomType } from "./model";

/**
 * Starter layouts. These are ILLUSTRATIVE arrangements to get people started
 * quickly — they are not official HDB or developer floor plans and make no
 * claim about real dimensions. Every room is editable.
 */
type TemplateRoom = { name: string; type: RoomType; x: number; y: number; w: number; h: number; furniture?: TemplateFurniture[] };
type TemplateFurniture = { type: string; at?: "centre" | "top" | "bottom" | "left" | "right"; rotate?: number };
type TemplateFloor = { name: string; level: number; rooms: TemplateRoom[] };

export type TemplateKey =
  | "blank" | "hdb_2_room" | "hdb_3_room" | "hdb_4_room" | "hdb_5_room" | "hdb_executive"
  | "condo_2br" | "condo_3br" | "landed_terrace";

export type HomeTemplate = {
  key: TemplateKey;
  label: string;
  summary: string;
  approxAreaM2: number | null;
  propertyTypes: string[];
  hdbFlatType?: string;
  floors: TemplateFloor[];
};

const M = 100; // metres → cm

function room(name: string, type: RoomType, x: number, y: number, w: number, h: number, furniture?: TemplateFurniture[]): TemplateRoom {
  return { name, type, x: x * M, y: y * M, w: w * M, h: h * M, furniture };
}

const bed = (type = "bed_double"): TemplateFurniture => ({ type, at: "centre" });

const HDB_4_ROOM: TemplateFloor = {
  name: "Main floor",
  level: 1,
  rooms: [
    room("Living room", "living", 0, 0, 5.4, 4.6, [{ type: "sofa", at: "bottom" }, { type: "tv_console", at: "top" }]),
    room("Dining", "dining", 0, 4.6, 3.0, 3.8, [{ type: "dining_table", at: "centre", rotate: 90 }]),
    room("Kitchen", "kitchen", 3.0, 4.6, 2.4, 2.6, [{ type: "counter", at: "right", rotate: 90 }]),
    room("Service yard", "utility", 3.0, 7.2, 2.4, 1.2),
    room("Hallway", "corridor", 5.4, 0, 1.4, 8.4),
    room("Master bedroom", "bedroom", 6.8, 0, 3.6, 3.6, [bed(), { type: "wardrobe", at: "bottom" }]),
    room("Master bath", "bathroom", 10.4, 0, 1.8, 2.2),
    room("Storage", "storage", 10.4, 2.2, 1.8, 1.4),
    room("Common bath", "bathroom", 6.8, 3.6, 2.2, 1.8),
    room("Household shelter", "household_shelter", 9.0, 3.6, 1.6, 1.8),
    room("Bedroom 2", "bedroom", 6.8, 5.4, 2.7, 3.0, [bed("bed_single")]),
    room("Bedroom 3", "bedroom", 9.5, 5.4, 2.7, 3.0, [{ type: "desk", at: "top" }]),
  ],
};

export const TEMPLATES: HomeTemplate[] = [
  {
    key: "hdb_2_room",
    label: "HDB 2-room",
    summary: "1 bedroom, living & dining, kitchen, bathroom, shelter",
    approxAreaM2: 50,
    propertyTypes: ["hdb"],
    hdbFlatType: "2_room",
    floors: [
      {
        name: "Main floor",
        level: 1,
        rooms: [
          room("Living & dining", "living", 0, 0, 4.4, 4.0, [{ type: "sofa", at: "bottom" }]),
          room("Kitchen", "kitchen", 0, 4.0, 2.4, 2.4, [{ type: "counter", at: "right", rotate: 90 }]),
          room("Bathroom", "bathroom", 2.4, 4.0, 2.0, 2.4),
          room("Bedroom", "bedroom", 4.4, 0, 3.4, 3.6, [bed()]),
          room("Service yard", "utility", 4.4, 3.6, 1.8, 2.8),
          room("Household shelter", "household_shelter", 6.2, 3.6, 1.6, 2.8),
        ],
      },
    ],
  },
  {
    key: "hdb_3_room",
    label: "HDB 3-room",
    summary: "2 bedrooms, 2 bathrooms, living, dining, kitchen, shelter",
    approxAreaM2: 70,
    propertyTypes: ["hdb"],
    hdbFlatType: "3_room",
    floors: [
      {
        name: "Main floor",
        level: 1,
        rooms: [
          room("Living room", "living", 0, 0, 4.8, 4.2, [{ type: "sofa", at: "bottom" }, { type: "tv_console", at: "top" }]),
          room("Kitchen", "kitchen", 0, 4.2, 2.6, 2.6, [{ type: "counter", at: "right", rotate: 90 }]),
          room("Service yard", "utility", 0, 6.8, 2.6, 1.2),
          room("Dining", "dining", 2.6, 4.2, 2.2, 3.8, [{ type: "dining_table", at: "centre", rotate: 90 }]),
          room("Hallway", "corridor", 4.8, 0, 1.2, 8.0),
          room("Master bedroom", "bedroom", 6.0, 0, 3.6, 3.4, [bed()]),
          room("Master bath", "bathroom", 9.6, 0, 1.6, 2.0),
          room("Storage", "storage", 9.6, 2.0, 1.6, 3.0),
          room("Common bath", "bathroom", 6.0, 3.4, 1.8, 1.6),
          room("Household shelter", "household_shelter", 7.8, 3.4, 1.8, 1.6),
          room("Bedroom 2", "bedroom", 6.0, 5.0, 5.2, 3.0, [bed("bed_single"), { type: "desk", at: "right", rotate: 90 }]),
        ],
      },
    ],
  },
  {
    key: "hdb_4_room",
    label: "HDB 4-room",
    summary: "3 bedrooms, 2 bathrooms, living, dining, kitchen, yard, shelter",
    approxAreaM2: 90,
    propertyTypes: ["hdb"],
    hdbFlatType: "4_room",
    floors: [HDB_4_ROOM],
  },
  {
    key: "hdb_5_room",
    label: "HDB 5-room",
    summary: "3 bedrooms plus study, 2 bathrooms, larger living and dining",
    approxAreaM2: 110,
    propertyTypes: ["hdb"],
    hdbFlatType: "5_room",
    floors: [
      {
        ...HDB_4_ROOM,
        rooms: [
          ...HDB_4_ROOM.rooms,
          room("Study", "study", 12.2, 0, 2.8, 5.4, [{ type: "desk", at: "top" }, { type: "shelf", at: "bottom" }]),
          room("Balcony", "balcony", 12.2, 5.4, 2.8, 3.0),
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
          room("Study", "study", 12.2, 0, 2.8, 5.4, [{ type: "desk", at: "top" }]),
          room("Balcony", "balcony", 12.2, 5.4, 2.8, 3.0),
          room("Family area", "living", 0, 8.4, 5.4, 3.0, [{ type: "sofa", at: "centre" }]),
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
          room("Living & dining", "living", 0, 0, 5.6, 4.4, [{ type: "sofa", at: "bottom" }, { type: "dining_table", at: "top" }]),
          room("Balcony", "balcony", 0, 4.4, 5.6, 1.6),
          room("Kitchen", "kitchen", 5.6, 0, 2.6, 2.8, [{ type: "counter", at: "right", rotate: 90 }]),
          room("Utility", "utility", 5.6, 2.8, 1.4, 1.6),
          room("Household shelter", "household_shelter", 7.0, 2.8, 1.2, 1.6),
          room("Common bath", "bathroom", 5.6, 4.4, 2.6, 1.6),
          room("Master bedroom", "bedroom", 8.2, 0, 4.4, 3.2, [bed()]),
          room("Master bath", "bathroom", 8.2, 3.2, 1.6, 2.8),
          room("Bedroom 2", "bedroom", 9.8, 3.2, 2.8, 2.8, [bed("bed_single")]),
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
          room("Living & dining", "living", 0, 0, 6.2, 4.6, [{ type: "sofa", at: "bottom" }, { type: "dining_table", at: "top" }]),
          room("Balcony", "balcony", 0, 4.6, 6.2, 1.6),
          room("Kitchen", "kitchen", 6.2, 0, 2.8, 3.0, [{ type: "counter", at: "right", rotate: 90 }]),
          room("Utility", "utility", 6.2, 3.0, 1.6, 1.6),
          room("Household shelter", "household_shelter", 7.8, 3.0, 1.2, 1.6),
          room("Hallway", "corridor", 6.2, 4.6, 2.8, 1.6),
          room("Master bedroom", "bedroom", 9.0, 0, 3.6, 3.6, [bed(), { type: "wardrobe", at: "bottom" }]),
          room("Master bath", "bathroom", 12.6, 0, 1.8, 2.4),
          room("Common bath", "bathroom", 12.6, 2.4, 1.8, 1.8),
          room("Bedroom 2", "bedroom", 9.0, 3.6, 2.8, 2.6, [bed("bed_single")]),
          room("Bedroom 3", "bedroom", 11.8, 4.2, 2.6, 2.0),
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
    label: "Blank canvas",
    summary: "Start from an empty plan and draw your own rooms",
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
  if (f.at === "top") cy = r.y + inset + fh / 2;
  if (f.at === "bottom") cy = r.y + r.h - inset - fh / 2;
  if (f.at === "left") cx = r.x + inset + fw / 2;
  if (f.at === "right") cx = r.x + r.w - inset - fw / 2;
  return {
    id: newId(),
    kind: "furniture",
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
  }));
  const objects: PlanObject[] = floor.rooms.flatMap((r) =>
    (r.furniture ?? []).map((f) => placeFurniture(r, f)).filter((o): o is PlanObject => o !== null),
  );
  return { rooms, objects };
}

/** Canvas extent for a floor, with breathing room around the rooms. */
export function floorExtent(floor: TemplateFloor) {
  const maxX = Math.max(800, ...floor.rooms.map((r) => r.x + r.w));
  const maxY = Math.max(600, ...floor.rooms.map((r) => r.y + r.h));
  return { widthCm: Math.ceil((maxX + 400) / 100) * 100, depthCm: Math.ceil((maxY + 400) / 100) * 100 };
}
