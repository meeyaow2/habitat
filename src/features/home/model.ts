/**
 * Floor-plan document model and geometry. Pure functions only — shared by the
 * editor, the server save action, templates and tests.
 *
 * Units are centimetres. Rooms are polygons; x/y/width/height hold the
 * polygon's bounding box (kept in sync by `withPolygon`).
 * Objects are rectangles that rotate in 90° steps around their centre.
 */
export type RoomType =
  | "living" | "dining" | "kitchen" | "bedroom" | "bathroom" | "balcony" | "utility"
  | "study" | "storage" | "corridor" | "household_shelter" | "garden" | "garage" | "other";

import { bbox, doorSymbol, EMPTY_GEOMETRY, isSimplePolygon, moveCorner, moveWall, pointAtLength, pointInPolygon, polygonArea, reclampOpenings, rectPolygon, samePt, splitWallAt, type Geometry, type Pt } from "./cad";

export type RoomShape = {
  id: string;
  name: string;
  roomType: RoomType;
  /** Outline; null/absent means the bounding rectangle. */
  polygon?: Pt[] | null;
  x: number;
  y: number;
  width: number;
  height: number;
  sortOrder: number;
  /** Structural spaces such as the household shelter are fixed in starter plans. */
  locked?: boolean;
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

export type FloorDoc = { rooms: RoomShape[]; objects: PlanObject[]; geometry: Geometry };

export function emptyDoc(): FloorDoc {
  return { rooms: [], objects: [], geometry: { ...EMPTY_GEOMETRY } };
}

/** A room's outline, whether stored as a polygon or a legacy rectangle. */
export function roomPolygon(r: Pick<RoomShape, "x" | "y" | "width" | "height" | "polygon">): Pt[] {
  return r.polygon && r.polygon.length >= 3 ? r.polygon : rectPolygon(r);
}

/** Replace a room's outline and keep its bounding box in sync. */
export function withPolygon<T extends RoomShape>(r: T, pts: Pt[]): T {
  const b = bbox(pts);
  return { ...r, polygon: pts, x: b.x, y: b.y, width: b.width, height: b.height };
}

/** Translate a room (outline and box). */
export function moveRoom<T extends RoomShape>(r: T, dx: number, dy: number): T {
  return withPolygon(r, roomPolygon(r).map((p) => ({ x: Math.round((p.x + dx) * 10) / 10, y: Math.round((p.y + dy) * 10) / 10 })));
}

const pointOnBoundary = (point: Pt, a: Pt, b: Pt, tolerance = 1) => {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < tolerance) return false;
  const cross = Math.abs((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) / length;
  const dot = (point.x - a.x) * (point.x - b.x) + (point.y - a.y) * (point.y - b.y);
  return cross <= tolerance && dot <= tolerance;
};

/** Move a joined wall corner and every room corner that uses it. */
export function moveBoundaryCorner(doc: FloorDoc, from: Pt, to: Pt): FloorDoc {
  if (doc.rooms.some((room) => room.locked && roomPolygon(room).some((point) => samePt(point, from, 1)))) return doc;
  let baseGeometry = doc.geometry;
  for (const wall of [...baseGeometry.walls]) {
    if (!samePt(wall.a, from, 1) && !samePt(wall.b, from, 1) && pointOnBoundary(from, wall.a, wall.b)) {
      baseGeometry = splitWallAt(baseGeometry, wall.id, from, newId);
    }
  }
  const geometry = moveCorner(baseGeometry, from, to);
  const rooms = doc.rooms.map((room) => {
    const points = roomPolygon(room);
    const next = points.map((point) => samePt(point, from, 1) ? to : point);
    return next.some((point, index) => !samePt(point, points[index], 0.01)) ? withPolygon(room, next) : room;
  });
  return { ...doc, rooms, geometry };
}

/** Move a complete wall boundary and resize every adjoining room with it. */
export function moveWallBoundary(doc: FloorDoc, wallId: string, dx: number, dy: number): FloorDoc {
  const wall = doc.geometry.walls.find((candidate) => candidate.id === wallId);
  if (!wall || wall.locked) return doc;
  if (doc.rooms.some((room) => room.locked && roomPolygon(room).some((point) => pointOnBoundary(point, wall.a, wall.b)))) return doc;
  const geometry = moveWall(doc.geometry, wallId, dx, dy);
  const rooms = doc.rooms.map((room) => {
    const points = roomPolygon(room);
    const next = points.map((point) => pointOnBoundary(point, wall.a, wall.b) ? { x: point.x + dx, y: point.y + dy } : point);
    return next.some((point, index) => !samePt(point, points[index], 0.01)) ? withPolygon(room, next) : room;
  });
  return { ...doc, rooms, geometry };
}

/** Set a wall length by moving its end corner, keeping joined walls and rooms connected. */
export function setWallBoundaryLength(doc: FloorDoc, wallId: string, length: number): FloorDoc {
  const wall = doc.geometry.walls.find((candidate) => candidate.id === wallId);
  if (!wall || wall.locked || length < 1) return doc;
  return moveBoundaryCorner(doc, wall.b, pointAtLength(wall.a, wall.b, length));
}

/** Resize a room from its top-left corner and carry joined wall corners and neighbouring room corners with it. */
export function resizeRoom(doc: FloorDoc, roomId: string, width: number, height: number): FloorDoc {
  const room = doc.rooms.find((candidate) => candidate.id === roomId);
  if (!room || room.locked || width < MIN_ROOM_CM || height < MIN_ROOM_CM) return doc;
  const old = roomPolygon(room);
  const next = old.map((p) => ({
    x: Math.round((room.x + ((p.x - room.x) / room.width) * width) * 10) / 10,
    y: Math.round((room.y + ((p.y - room.y) / room.height) * height) * 10) / 10,
  }));
  return old.reduce((current, point, index) => samePt(point, next[index], 0.01) ? current : moveBoundaryCorner(current, point, next[index]), doc);
}

/** Scale the flat footprint around its top-left corner while keeping furniture at its physical size. */
export function scaleFloorProportionally(doc: FloorDoc, factor: number): FloorDoc {
  const flat = boundsOf(doc.rooms);
  if (!flat || !Number.isFinite(factor) || factor < 0.25 || factor > 4) return doc;
  const scalePoint = (point: Pt): Pt => ({
    x: Math.round((flat.x + (point.x - flat.x) * factor) * 10) / 10,
    y: Math.round((flat.y + (point.y - flat.y) * factor) * 10) / 10,
  });
  const rooms = doc.rooms.map((room) => withPolygon(room, roomPolygon(room).map(scalePoint)));
  const walls = doc.geometry.walls.map((wall) => ({ ...wall, a: scalePoint(wall.a), b: scalePoint(wall.b) }));
  const openings = reclampOpenings(walls, doc.geometry.openings.map((opening) => ({ ...opening, offset: opening.offset * factor })));
  const objects = doc.objects.map((object) => {
    const centrePoint = scalePoint(centre(objectBounds(object)));
    return { ...object, x: Math.round(centrePoint.x - object.width / 2), y: Math.round(centrePoint.y - object.height / 2) };
  });
  return {
    ...doc,
    rooms,
    objects,
    geometry: {
      ...doc.geometry,
      walls,
      openings,
      dimensions: doc.geometry.dimensions.map((dimension) => ({ ...dimension, a: scalePoint(dimension.a), b: scalePoint(dimension.b), offset: dimension.offset * factor })),
      labels: doc.geometry.labels.map((label) => ({ ...label, at: scalePoint(label.at) })),
    },
  };
}

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
  { value: "dining_chair", label: "Dining chair", w: 48, h: 48 },
  { value: "toilet", label: "Toilet", w: 42, h: 68 },
  { value: "basin", label: "Basin", w: 55, h: 42 },
  { value: "shower", label: "Shower", w: 78, h: 78 },
  { value: "sink", label: "Kitchen sink", w: 70, h: 48 },
  { value: "hob", label: "Hob", w: 60, h: 48 },
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

export function areaM2(r: { width: number; height: number; x?: number; y?: number; polygon?: Pt[] | null }): number {
  const cm2 = r.polygon && r.polygon.length >= 3 ? polygonArea(r.polygon) : r.width * r.height;
  return Math.round((cm2 / 10_000) * 10) / 10;
}

/** Bounding box of an object after its 90°-step rotation about its centre. */
export function objectBounds(o: Pick<PlanObject, "x" | "y" | "width" | "height" | "rotation">): Rect {
  const quarter = ((Math.round(o.rotation / 90) % 4) + 4) % 4;
  if (quarter % 2 === 0) return { x: o.x, y: o.y, width: o.width, height: o.height };
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  return { x: cx - o.height / 2, y: cy - o.width / 2, width: o.height, height: o.width };
}

export type FurniturePlacementIssue = "overlap" | "outside-room" | "door-swing";

const intersects = (a: Rect, b: Rect, inset = 0) => a.x + inset < b.x + b.width && a.x + a.width - inset > b.x && a.y + inset < b.y + b.height && a.y + a.height - inset > b.y;

/** Non-blocking arrangement hints for furniture. The editor still allows every placement. */
export function furniturePlacementIssues(doc: FloorDoc, object: PlanObject): FurniturePlacementIssue[] {
  if (object.kind !== "furniture") return [];
  const bounds = objectBounds(object);
  const issues = new Set<FurniturePlacementIssue>();
  const centrePoint = centre(bounds);
  const room = roomAt(doc.rooms, centrePoint);
  const corners = [
    { x: bounds.x + 2, y: bounds.y + 2 }, { x: bounds.x + bounds.width - 2, y: bounds.y + 2 },
    { x: bounds.x + bounds.width - 2, y: bounds.y + bounds.height - 2 }, { x: bounds.x + 2, y: bounds.y + bounds.height - 2 },
  ];
  if (!room || corners.some((corner) => !pointInPolygon(corner, roomPolygon(room)))) issues.add("outside-room");
  if (doc.objects.some((candidate) => candidate.id !== object.id && candidate.kind === "furniture" && intersects(bounds, objectBounds(candidate), 5))) issues.add("overlap");
  const walls = new Map(doc.geometry.walls.map((wall) => [wall.id, wall]));
  for (const opening of doc.geometry.openings) {
    if (opening.kind !== "door") continue;
    const wall = walls.get(opening.wallId);
    if (!wall) continue;
    for (const leaf of doorSymbol(wall, opening).leaves) {
      const swing = boundsOf([
        { x: leaf.hinge.x, y: leaf.hinge.y, width: 0, height: 0 },
        { x: leaf.closed.x, y: leaf.closed.y, width: 0, height: 0 },
        { x: leaf.tip.x, y: leaf.tip.y, width: 0, height: 0 },
      ]);
      if (swing && intersects(bounds, swing)) issues.add("door-swing");
    }
  }
  return [...issues];
}

/** Gentle furniture-to-room-edge snapping. Hold Alt/Option in the canvas to bypass it. */
export function snapFurnitureToRoom(doc: FloorDoc, object: PlanObject, x: number, y: number, threshold = 12) {
  const candidate = { ...object, x, y };
  const bounds = objectBounds(candidate);
  const room = roomAt(doc.rooms, centre(bounds));
  if (!room) return { x, y };
  const roomBox = boundsOf([room])!;
  const deltasX = [roomBox.x - bounds.x, roomBox.x + roomBox.width - (bounds.x + bounds.width)].filter((delta) => Math.abs(delta) <= threshold);
  const deltasY = [roomBox.y - bounds.y, roomBox.y + roomBox.height - (bounds.y + bounds.height)].filter((delta) => Math.abs(delta) <= threshold);
  const dx = deltasX.sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? 0;
  const dy = deltasY.sort((a, b) => Math.abs(a) - Math.abs(b))[0] ?? 0;
  return { x: Math.round(x + dx), y: Math.round(y + dy) };
}

export type RoomLabelPlacement = { x: number; y: number; width: number; height: number; compact: boolean; outside: boolean; leader?: Pt };

const overlapArea = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** Find clear floor space for a room name. Recomputed after every furniture move. */
export function roomLabelPlacement(doc: FloorDoc, room: RoomShape): RoomLabelPlacement {
  const polygon = roomPolygon(room);
  const compact = room.width < 225 || room.height < 205 || polygonArea(polygon) < 60000;
  const width = Math.min(Math.max(compact ? 96 : 110, room.name.length * (compact ? 11.5 : 12)), Math.max(54, room.width - 18));
  const height = compact ? 26 : 46;
  const obstacles = doc.objects
    .filter((object) => roomAt([room], centre(objectBounds(object))))
    .map((object) => {
      const bounds = objectBounds(object);
      return { x: bounds.x - 8, y: bounds.y - 8, width: bounds.width + 16, height: bounds.height + 16 };
    });
  const walls = new Map(doc.geometry.walls.map((wall) => [wall.id, wall]));
  for (const opening of doc.geometry.openings) {
    if (opening.kind !== "door") continue;
    const wall = walls.get(opening.wallId);
    if (!wall) continue;
    for (const leaf of doorSymbol(wall, opening).leaves) {
      const swing = boundsOf([
        { x: leaf.hinge.x, y: leaf.hinge.y, width: 0, height: 0 },
        { x: leaf.closed.x, y: leaf.closed.y, width: 0, height: 0 },
        { x: leaf.tip.x, y: leaf.tip.y, width: 0, height: 0 },
      ]);
      if (swing && intersects(room, swing)) obstacles.push(swing);
    }
  }
  const candidates = [
    [0.5, 0.5], [0.25, 0.72], [0.75, 0.72], [0.25, 0.35], [0.75, 0.35], [0.5, 0.78], [0.5, 0.24],
  ].map(([fx, fy]) => ({ x: room.x + room.width * fx, y: room.y + room.height * fy }));
  const ranked = candidates
    .map((point) => {
      const box = { x: point.x - width / 2, y: point.y - height / 2, width, height };
      const inside = [
        { x: box.x, y: box.y }, { x: box.x + box.width, y: box.y },
        { x: box.x + box.width, y: box.y + box.height }, { x: box.x, y: box.y + box.height },
      ].every((corner) => pointInPolygon(corner, polygon));
      return { point, score: inside ? obstacles.reduce((sum, obstacle) => sum + overlapArea(box, obstacle), 0) : Number.POSITIVE_INFINITY };
    })
    .sort((a, b) => a.score - b.score);
  const best = ranked[0];
  if (best && Number.isFinite(best.score)) return { ...best.point, width, height, compact, outside: false };
  const centrePoint = centre(room);
  return { x: centrePoint.x, y: room.y - 22, width: Math.max(70, room.name.length * 7.5), height: 24, compact: true, outside: true, leader: centrePoint };
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
    const inside = room.polygon && room.polygon.length >= 3 ? pointInPolygon(p, room.polygon) : contains(room, p);
    if (inside && (!best || areaM2(room) < areaM2(best))) best = room;
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
  for (const r of doc.rooms) {
    if (r.polygon && r.polygon.length >= 3 && !isSimplePolygon(r.polygon)) errors.push(`${r.name}’s outline crosses itself`);
  }
  const g = doc.geometry ?? EMPTY_GEOMETRY;
  const wallIds = new Set(g.walls.map((w) => w.id));
  for (const w of g.walls) {
    if (ids.has(w.id)) errors.push(`Duplicate id ${w.id}`);
    ids.add(w.id);
    if (Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) < 1) errors.push("A wall has no length");
  }
  for (const o of g.openings) if (!wallIds.has(o.wallId)) errors.push("A door or window isn’t on a wall");
  return errors;
}
