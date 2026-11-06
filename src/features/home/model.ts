/**
 * Floor-plan document model and geometry. Pure functions only — shared by the
 * editor, the server save action, templates and tests.
 *
 * Units are centimetres. Rooms are axis-aligned rectangles (x, y = top-left).
 * Objects are rectangles that rotate in 90° steps around their centre.
 */
export type RoomType =
  | "living" | "dining" | "kitchen" | "bedroom" | "bathroom" | "balcony" | "utility"
  | "study" | "storage" | "corridor" | "household_shelter" | "garden" | "garage" | "other";

export type RoomShape = {
  id: string;
  name: string;
  roomType: RoomType;
  x: number;
  y: number;
  width: number;
  height: number;
  sortOrder: number;
};

export type PlanObjectKind = "asset" | "furniture" | "fixture";

export type PlanObject = {
  id: string;
  kind: PlanObjectKind;
  assetId: string | null;
  furnitureType: string | null;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // 0 | 90 | 180 | 270
};

export type FloorDoc = { rooms: RoomShape[]; objects: PlanObject[] };

export type Rect = { x: number; y: number; width: number; height: number };

export const GRID_CM = 10;
export const MAJOR_GRID_CM = 100;
export const MIN_ROOM_CM = 50;
export const MIN_OBJECT_CM = 10;

export const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: "living", label: "Living room" },
  { value: "dining", label: "Dining" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bedroom", label: "Bedroom" },
  { value: "bathroom", label: "Bathroom" },
  { value: "balcony", label: "Balcony" },
  { value: "utility", label: "Service yard / utility" },
  { value: "study", label: "Study" },
  { value: "storage", label: "Storage" },
  { value: "corridor", label: "Hallway" },
  { value: "household_shelter", label: "Household shelter" },
  { value: "garden", label: "Garden" },
  { value: "garage", label: "Car porch / garage" },
  { value: "other", label: "Other" },
];

export const FURNITURE_TYPES = [
  { value: "sofa", label: "Sofa", w: 200, h: 90 },
  { value: "armchair", label: "Armchair", w: 80, h: 80 },
  { value: "coffee_table", label: "Coffee table", w: 100, h: 55 },
  { value: "dining_table", label: "Dining table", w: 150, h: 90 },
  { value: "bed_double", label: "Queen bed", w: 155, h: 200 },
  { value: "bed_single", label: "Single bed", w: 95, h: 195 },
  { value: "wardrobe", label: "Wardrobe", w: 180, h: 60 },
  { value: "desk", label: "Desk", w: 120, h: 60 },
  { value: "cabinet", label: "Cabinet", w: 100, h: 45 },
  { value: "shelf", label: "Shelf", w: 90, h: 35 },
  { value: "tv_console", label: "TV console", w: 180, h: 45 },
  { value: "counter", label: "Kitchen counter", w: 240, h: 60 },
] as const;

export type FurnitureType = (typeof FURNITURE_TYPES)[number]["value"];

export function furnitureSpec(type: string | null) {
  return FURNITURE_TYPES.find((f) => f.value === type) ?? null;
}

export function roomTypeLabel(type: string) {
  return ROOM_TYPES.find((r) => r.value === type)?.label ?? "Room";
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
export function snap(value: number, step = GRID_CM): number {
  return Math.round(value / step) * step;
}

export function areaM2(r: { width: number; height: number }): number {
  return Math.round(((r.width * r.height) / 10_000) * 10) / 10;
}

/** Bounding box of an object after its 90°-step rotation about its centre. */
export function objectBounds(o: Pick<PlanObject, "x" | "y" | "width" | "height" | "rotation">): Rect {
  const quarter = ((Math.round(o.rotation / 90) % 4) + 4) % 4;
  if (quarter % 2 === 0) return { x: o.x, y: o.y, width: o.width, height: o.height };
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  return { x: cx - o.height / 2, y: cy - o.width / 2, width: o.height, height: o.width };
}

export function centre(r: Rect) {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function contains(r: Rect, p: { x: number; y: number }) {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** The smallest room containing the point (handles nested/overlapping rooms). */
export function roomAt(rooms: RoomShape[], p: { x: number; y: number }): RoomShape | null {
  let best: RoomShape | null = null;
  for (const room of rooms) {
    if (contains(room, p) && (!best || room.width * room.height < best.width * best.height)) best = room;
  }
  return best;
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export type Guide = { orientation: "vertical" | "horizontal"; position: number; from: number; to: number };

/**
 * Magnetic alignment: snaps a moving rectangle's edges/centre to the edges or
 * centres of nearby rectangles within `threshold` cm, falling back to the grid.
 * Returns the adjusted position and the guide lines to draw.
 */
export function alignRect(moving: Rect, others: Rect[], threshold = 12, grid = GRID_CM): { x: number; y: number; guides: Guide[] } {
  const xs = (r: Rect) => [r.x, r.x + r.width / 2, r.x + r.width];
  const ys = (r: Rect) => [r.y, r.y + r.height / 2, r.y + r.height];

  let bestX: { delta: number; pos: number; other: Rect } | null = null;
  let bestY: { delta: number; pos: number; other: Rect } | null = null;

  const mx = xs(moving);
  const my = ys(moving);
  for (const other of others) {
    for (const ox of xs(other)) {
      for (const m of mx) {
        const d = ox - m;
        if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.delta))) bestX = { delta: d, pos: ox, other };
      }
    }
    for (const oy of ys(other)) {
      for (const m of my) {
        const d = oy - m;
        if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.delta))) bestY = { delta: d, pos: oy, other };
      }
    }
  }

  const x = bestX ? moving.x + bestX.delta : snap(moving.x, grid);
  const y = bestY ? moving.y + bestY.delta : snap(moving.y, grid);
  const guides: Guide[] = [];
  if (bestX) {
    const top = Math.min(y, bestX.other.y);
    const bottom = Math.max(y + moving.height, bestX.other.y + bestX.other.height);
    guides.push({ orientation: "vertical", position: bestX.pos, from: top, to: bottom });
  }
  if (bestY) {
    const left = Math.min(x, bestY.other.x);
    const right = Math.max(x + moving.width, bestY.other.x + bestY.other.width);
    guides.push({ orientation: "horizontal", position: bestY.pos, from: left, to: right });
  }
  return { x, y, guides };
}

/** Place a new item at the centre of a room (or the given point), snapped. */
export function placeAtCentre(size: { width: number; height: number }, target: { x: number; y: number }): { x: number; y: number } {
  return { x: snap(target.x - size.width / 2), y: snap(target.y - size.height / 2) };
}

// ---------------------------------------------------------------------------
// Document helpers
// ---------------------------------------------------------------------------
export function newId(): string {
  return crypto.randomUUID();
}

export function docBounds(doc: FloorDoc): Rect | null {
  return boundsOf([...doc.rooms, ...doc.objects.map(objectBounds)]);
}

/** Validate geometric invariants the database also enforces. */
export function validateDoc(doc: FloorDoc): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const assetIds = new Set<string>();
  for (const r of doc.rooms) {
    if (ids.has(r.id)) errors.push(`Duplicate id ${r.id}`);
    ids.add(r.id);
    if (r.width < MIN_ROOM_CM || r.height < MIN_ROOM_CM) errors.push(`${r.name} is smaller than ${MIN_ROOM_CM} cm`);
    if (!r.name.trim()) errors.push("Every room needs a name");
  }
  for (const o of doc.objects) {
    if (ids.has(o.id)) errors.push(`Duplicate id ${o.id}`);
    ids.add(o.id);
    if ((o.kind === "asset") !== Boolean(o.assetId)) errors.push("Asset markers must reference an asset");
    if (o.assetId) {
      if (assetIds.has(o.assetId)) errors.push("An item can only be placed once");
      assetIds.add(o.assetId);
    }
  }
  return errors;
}
