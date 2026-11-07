/**
 * Drafting geometry for the Habitat plan editor. Pure functions only.
 * Units are centimetres; the y axis points down (screen convention).
 */
export type Pt = { x: number; y: number };

export type Wall = { id: string; a: Pt; b: Pt; thickness: number };

export type OpeningKind = "door" | "window" | "opening";
export const DOOR_STYLES = ["single", "double", "sliding", "pocket"] as const;
export type DoorStyle = (typeof DOOR_STYLES)[number];
export const DOOR_STYLE_LABELS: Record<DoorStyle, string> = {
  single: "Single swing",
  double: "Double swing",
  sliding: "Sliding (bypass)",
  pocket: "Pocket (slides into wall)",
};
export type Opening = {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Distance along the wall from `a` to the opening's centre. */
  offset: number;
  width: number;
  /** Door swings to the other side of the wall. */
  flip: boolean;
  /** Door hinge at the end nearer `b` instead of `a` (pocket doors: the side the pocket is on). */
  hingeEnd: boolean;
  /** Doors only; missing means a single swing door. */
  style?: DoorStyle;
  /** Height in cm (doors ~210, windows ~120). */
  height: number;
  /** Windows: height of the sill above the floor. */
  sill: number;
};

export type Dimension = { id: string; a: Pt; b: Pt; offset: number };
export type Label = { id: string; at: Pt; text: string; size: number };

export type Geometry = { walls: Wall[]; openings: Opening[]; dimensions: Dimension[]; labels: Label[] };

export const EMPTY_GEOMETRY: Geometry = { walls: [], openings: [], dimensions: [], labels: [] };

export const DEFAULTS = {
  wallThickness: 10,
  exteriorThickness: 20,
  door: { width: 90, height: 210, sill: 0 },
  window: { width: 120, height: 120, sill: 90 },
  opening: { width: 100, height: 210, sill: 0 },
} as const;

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
export const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
export const len = (a: Pt) => Math.hypot(a.x, a.y);
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const unit = (a: Pt): Pt => {
  const l = len(a);
  return l === 0 ? { x: 1, y: 0 } : { x: a.x / l, y: a.y / l };
};
export const perp = (a: Pt): Pt => ({ x: -a.y, y: a.x });
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const samePt = (a: Pt, b: Pt, eps = 0.5) => dist(a, b) <= eps;
export const round1 = (n: number) => Math.round(n * 10) / 10;
export const roundPt = (p: Pt): Pt => ({ x: round1(p.x), y: round1(p.y) });

/** Angle in degrees, 0 = +x, counter-clockwise on screen (y down → negate). */
export function angleDeg(a: Pt, b: Pt) {
  const deg = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function projectOnSegment(p: Pt, a: Pt, b: Pt) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const point = lerp(a, b, t);
  return { t, point, dist: dist(p, point) };
}

// ---------------------------------------------------------------------------
// Polygons
// ---------------------------------------------------------------------------
export function polygonArea(pts: Pt[]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

export function polygonCentroid(pts: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = pts.length || 1;
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function pointInPolygon(p: Pt, pts: Pt[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function bbox(pts: Pt[]) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function rectPolygon(r: { x: number; y: number; width: number; height: number }): Pt[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}

/** Simple polygon check: no edges cross (adjacent edges excluded). */
export function isSimplePolygon(pts: Pt[]) {
  const n = pts.length;
  if (n < 3) return false;
  const intersects = (p1: Pt, p2: Pt, p3: Pt, p4: Pt) => {
    const d1 = cross(sub(p4, p3), sub(p1, p3));
    const d2 = cross(sub(p4, p3), sub(p2, p3));
    const d3 = cross(sub(p2, p1), sub(p3, p1));
    const d4 = cross(sub(p2, p1), sub(p4, p1));
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (intersects(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  return polygonArea(pts) > 1;
}

// ---------------------------------------------------------------------------
// Walls and openings
// ---------------------------------------------------------------------------
export const wallLength = (w: Pick<Wall, "a" | "b">) => dist(w.a, w.b);
export const wallDir = (w: Pick<Wall, "a" | "b">) => unit(sub(w.b, w.a));

/** The four corners of a wall's thickened outline (a-left, b-left, b-right, a-right). */
export function wallOutline(w: Wall): Pt[] {
  const n = mul(perp(wallDir(w)), w.thickness / 2);
  return [add(w.a, n), add(w.b, n), sub(w.b, n), sub(w.a, n)];
}

export function clampOpening(w: Wall, o: Pick<Opening, "offset" | "width">) {
  const L = wallLength(w);
  const width = Math.max(30, Math.min(o.width, Math.max(30, L - 10)));
  const offset = Math.max(width / 2 + 5, Math.min(L - width / 2 - 5, o.offset));
  return { width, offset: L < width + 10 ? L / 2 : offset };
}

/** Start/end points of an opening on the wall centreline. */
export function openingSpan(w: Wall, o: Pick<Opening, "offset" | "width">) {
  const d = wallDir(w);
  return { start: add(w.a, mul(d, o.offset - o.width / 2)), end: add(w.a, mul(d, o.offset + o.width / 2)) };
}

/** Wall pieces between openings, as [t0, t1] distances along the wall (for 2D rendering and 3D). */
export function wallSegments(w: Wall, openings: Opening[]) {
  const L = wallLength(w);
  const cuts = openings
    .filter((o) => o.wallId === w.id)
    .map((o) => [Math.max(0, o.offset - o.width / 2), Math.min(L, o.offset + o.width / 2)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let pos = 0;
  for (const [s, e] of cuts) {
    if (s > pos) out.push([pos, s]);
    pos = Math.max(pos, e);
  }
  if (pos < L) out.push([pos, L]);
  return out;
}

/** Wall ends that touch a point (used to drag shared corners together). */
export function wallEndsAt(walls: Wall[], p: Pt, eps = 1) {
  const out: { wallId: string; end: "a" | "b" }[] = [];
  for (const w of walls) {
    if (samePt(w.a, p, eps)) out.push({ wallId: w.id, end: "a" });
    if (samePt(w.b, p, eps)) out.push({ wallId: w.id, end: "b" });
  }
  return out;
}

/** Move one corner and every wall end joined to it. Openings keep their distance from `a`, clamped. */
export function moveCorner(g: Geometry, from: Pt, to: Pt): Geometry {
  const ends = wallEndsAt(g.walls, from);
  if (ends.length === 0) return g;
  const walls = g.walls.map((w) => {
    const e = ends.filter((x) => x.wallId === w.id);
    if (!e.length) return w;
    let nw = w;
    for (const x of e) nw = { ...nw, [x.end]: roundPt(to) };
    return nw;
  });
  return { ...g, walls: walls.filter((w) => wallLength(w) >= 1), openings: reclampOpenings(walls, g.openings) };
}

export function reclampOpenings(walls: Wall[], openings: Opening[]) {
  const byId = new Map(walls.map((w) => [w.id, w]));
  return openings.filter((o) => byId.has(o.wallId)).map((o) => ({ ...o, ...clampOpening(byId.get(o.wallId)!, o) }));
}

// ---------------------------------------------------------------------------
// Lengths
// ---------------------------------------------------------------------------
/** Parse a typed length into cm: "3.2" (metres), "320cm", "3200mm", "3.2m", "3m20", "3m 20cm". */
export function parseLength(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/,/g, ".").replace(/\s+/g, "");
  if (!s) return null;
  let m = s.match(/^(\d+(?:\.\d+)?)m(\d+(?:\.\d+)?)(?:cm)?$/);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  m = s.match(/^(\d+(?:\.\d+)?)(mm|cm|m)?$/);
  if (!m) return null;
  const v = Number(m[1]);
  const unitName = m[2] ?? "m";
  const cm = unitName === "mm" ? v / 10 : unitName === "cm" ? v : v * 100;
  return cm > 0 && cm < 100_000 ? round1(cm) : null;
}

export function formatLength(cm: number, opts: { precise?: boolean } = {}) {
  if (opts.precise || cm < 100) return cm < 100 ? `${round1(cm)} cm` : `${(cm / 100).toFixed(2)} m`;
  return `${(cm / 100).toFixed(2)} m`;
}

export function formatArea(cm2: number) {
  return `${(cm2 / 10_000).toFixed(1)} m²`;
}

// ---------------------------------------------------------------------------
// Snapping (object snaps, tracking, polar/ortho, grid)
// ---------------------------------------------------------------------------
export type SnapKind = "endpoint" | "midpoint" | "on-wall" | "corner" | "tracking" | "polar" | "grid" | "none";
export type SnapGuide = { a: Pt; b: Pt };
export type SnapResult = { point: Pt; kind: SnapKind; guides: SnapGuide[]; wallId?: string };

export type SnapContext = {
  walls: Wall[];
  points?: Pt[]; // extra snappable points (room corners, dimension ends)
  grid: number;
  tolerance: number; // world units (cm)
  from?: Pt | null; // previous point while drawing
  ortho?: boolean; // force 0/90/180/270 from `from`
  polarStep?: number; // degrees, default 45
  enabled?: { endpoint?: boolean; midpoint?: boolean; onWall?: boolean; tracking?: boolean; grid?: boolean };
};

export function snapPoint(p: Pt, ctx: SnapContext): SnapResult {
  const en = { endpoint: true, midpoint: true, onWall: true, tracking: true, grid: true, ...ctx.enabled };
  const tol = ctx.tolerance;
  const ends = [...ctx.walls.flatMap((w) => [w.a, w.b]), ...(ctx.points ?? [])];

  // Ortho / polar lock relative to the previous point constrains direction first.
  if (ctx.from && ctx.ortho) {
    const d = sub(p, ctx.from);
    const step = ctx.polarStep ?? 90;
    const ang = Math.atan2(d.y, d.x);
    const snapped = (Math.round(((ang * 180) / Math.PI) / step) * step * Math.PI) / 180;
    const l = len(d);
    let q = add(ctx.from, { x: Math.cos(snapped) * l, y: Math.sin(snapped) * l });
    // Allow an endpoint on the constrained ray to win (closing a room exactly).
    for (const e of ends) {
      const pr = projectOnSegment(e, ctx.from, add(ctx.from, { x: Math.cos(snapped) * 1e5, y: Math.sin(snapped) * 1e5 }));
      if (pr.dist < 0.5 && dist(pr.point, q) <= tol) return { point: roundPt(e), kind: "endpoint", guides: [] };
    }
    if (en.grid && ctx.grid > 0 && Math.abs(snapped % (Math.PI / 2)) < 1e-9) {
      q = { x: Math.abs(Math.cos(snapped)) > 0.5 ? Math.round(q.x / ctx.grid) * ctx.grid : ctx.from.x, y: Math.abs(Math.sin(snapped)) > 0.5 ? Math.round(q.y / ctx.grid) * ctx.grid : ctx.from.y };
    }
    return { point: roundPt(q), kind: "polar", guides: [{ a: ctx.from, b: q }] };
  }

  if (en.endpoint) {
    let best: Pt | null = null;
    for (const e of ends) if (dist(e, p) <= tol && (!best || dist(e, p) < dist(best, p))) best = e;
    if (best) return { point: roundPt(best), kind: "endpoint", guides: [] };
  }
  if (en.midpoint) {
    for (const w of ctx.walls) {
      const m = lerp(w.a, w.b, 0.5);
      if (dist(m, p) <= tol * 0.8) return { point: roundPt(m), kind: "midpoint", guides: [], wallId: w.id };
    }
  }

  // Tracking: align x and/or y with existing points (dashed extension lines).
  let q = { ...p };
  const guides: SnapGuide[] = [];
  let tracked = false;
  if (en.tracking) {
    const refs = ctx.from ? [ctx.from, ...ends] : ends;
    let bx: Pt | null = null, by: Pt | null = null;
    for (const e of refs) {
      if (Math.abs(e.x - p.x) <= tol && (!bx || Math.abs(e.x - p.x) < Math.abs(bx.x - p.x))) bx = e;
      if (Math.abs(e.y - p.y) <= tol && (!by || Math.abs(e.y - p.y) < Math.abs(by.y - p.y))) by = e;
    }
    if (bx) { q.x = bx.x; guides.push({ a: bx, b: { x: bx.x, y: p.y } }); tracked = true; }
    if (by) { q.y = by.y; guides.push({ a: by, b: { x: p.x, y: by.y } }); tracked = true; }
  }

  if (en.onWall && !tracked) {
    for (const w of ctx.walls) {
      const pr = projectOnSegment(p, w.a, w.b);
      if (pr.dist <= tol * 0.7) return { point: roundPt(pr.point), kind: "on-wall", guides: [], wallId: w.id };
    }
  }

  if (!tracked && en.grid && ctx.grid > 0) {
    q = { x: Math.round(p.x / ctx.grid) * ctx.grid, y: Math.round(p.y / ctx.grid) * ctx.grid };
    return { point: roundPt(q), kind: "grid", guides: [] };
  }
  if (tracked && en.grid && ctx.grid > 0) {
    // Snap the free axis to the grid.
    if (!guides.some((g) => g.a.x === q.x)) q.x = Math.round(q.x / ctx.grid) * ctx.grid;
    if (!guides.some((g) => g.a.y === q.y)) q.y = Math.round(q.y / ctx.grid) * ctx.grid;
  }
  return { point: roundPt(q), kind: tracked ? "tracking" : "none", guides };
}

/** The point `length` cm from `from` in the direction of `toward`. */
export function pointAtLength(from: Pt, toward: Pt, length: number): Pt {
  return roundPt(add(from, mul(unit(sub(toward, from)), length)));
}

/** Nearest wall to a point (for placing doors/windows). */
export function nearestWall(walls: Wall[], p: Pt, maxDist: number) {
  let best: { wall: Wall; t: number; offset: number; dist: number } | null = null;
  for (const w of walls) {
    const pr = projectOnSegment(p, w.a, w.b);
    if (pr.dist <= maxDist && (!best || pr.dist < best.dist)) best = { wall: w, t: pr.t, offset: pr.t * wallLength(w), dist: pr.dist };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Rooms → walls (for starter templates and "walls around this room")
// ---------------------------------------------------------------------------
/**
 * Build walls along room edges. Collinear, overlapping or touching edges are
 * merged so shared walls between rooms are drawn once. Edges on the outer
 * boundary (used by only one room side) get exterior thickness.
 */
export function wallsFromPolygons(polys: Pt[][], newId: () => string, opts = { interior: DEFAULTS.wallThickness, exterior: DEFAULTS.exteriorThickness }): Wall[] {
  type Seg = { a: Pt; b: Pt };
  const segs: Seg[] = polys.flatMap((pts) => pts.map((p, i) => ({ a: p, b: pts[(i + 1) % pts.length] })));
  const key = (n: number) => Math.round(n * 2) / 2;
  const horizontal = new Map<number, [number, number][]>();
  const vertical = new Map<number, [number, number][]>();
  const other: Seg[] = [];
  for (const s of segs) {
    if (Math.abs(s.a.y - s.b.y) < 0.5) {
      const k = key(s.a.y);
      horizontal.set(k, [...(horizontal.get(k) ?? []), [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x)]]);
    } else if (Math.abs(s.a.x - s.b.x) < 0.5) {
      const k = key(s.a.x);
      vertical.set(k, [...(vertical.get(k) ?? []), [Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y)]]);
    } else other.push(s);
  }
  const all = polys.flat();
  const outer = all.length ? bbox(all) : { x: 0, y: 0, width: 0, height: 0 };
  const isOuter = (axis: "h" | "v", k: number) =>
    axis === "h" ? Math.abs(k - outer.y) < 1 || Math.abs(k - (outer.y + outer.height)) < 1 : Math.abs(k - outer.x) < 1 || Math.abs(k - (outer.x + outer.width)) < 1;

  /**
   * Split intervals at every endpoint so each piece can be classified: a piece
   * covered by two rooms is interior; covered by one is a boundary wall.
   */
  const build = (map: Map<number, [number, number][]>, axis: "h" | "v"): Wall[] => {
    const out: Wall[] = [];
    for (const [k, ivs] of map) {
      // Merge cut points closer than 1 cm (floating-point noise) so no sliver walls appear.
      const cuts = ivs
        .flatMap(([s, e]) => [s, e])
        .sort((x, y) => x - y)
        .filter((v, i, arr) => i === 0 || v - arr[i - 1] >= 1);
      const pieces: { s: number; e: number; cover: number }[] = [];
      for (let i = 0; i < cuts.length - 1; i++) {
        const s = cuts[i], e = cuts[i + 1];
        const cover = ivs.filter(([a, b]) => a <= s + 0.5 && b >= e - 0.5).length;
        if (cover > 0) pieces.push({ s, e, cover });
      }
      // Merge consecutive pieces with the same exterior/interior classification.
      let cur: { s: number; e: number; ext: boolean } | null = null;
      const flush = () => {
        if (!cur) return;
        const t = cur.ext || isOuter(axis, k) ? opts.exterior : opts.interior;
        out.push(
          axis === "h"
            ? { id: newId(), a: { x: cur.s, y: k }, b: { x: cur.e, y: k }, thickness: t }
            : { id: newId(), a: { x: k, y: cur.s }, b: { x: k, y: cur.e }, thickness: t },
        );
        cur = null;
      };
      for (const p of pieces) {
        const ext = p.cover === 1 && isOuter(axis, k);
        if (cur && Math.abs(cur.e - p.s) < 0.01 && cur.ext === ext) cur.e = p.e;
        else {
          flush();
          cur = { s: p.s, e: p.e, ext };
        }
      }
      flush();
    }
    return out;
  };
  return [
    ...build(horizontal, "h"),
    ...build(vertical, "v"),
    ...other.map((s) => ({ id: newId(), a: s.a, b: s.b, thickness: opts.interior })),
  ];
}

export type DoorLeaf = { hinge: Pt; closed: Pt; tip: Pt; radius: number };
export type DoorPanel = { pts: Pt[]; /** Inside the wall (pocket): draw hidden/dashed. */ hidden: boolean };

/**
 * Plan symbol for a door, shared by the 2D canvas, the 3D view and DXF export.
 * Swing doors return leaves drawn open 90° with their swing arcs; sliding and
 * pocket doors return thin panels in the wall.
 */
export function doorSymbol(w: Wall, o: Opening): { leaves: DoorLeaf[]; panels: DoorPanel[] } {
  const { start, end } = openingSpan(w, o);
  const d = wallDir(w);
  const nrm = mul(perp(d), o.flip ? -1 : 1);
  const width = dist(start, end);
  const leaf = (hinge: Pt, closed: Pt, r: number): DoorLeaf => ({ hinge, closed, tip: add(hinge, mul(nrm, -r)), radius: r });
  const panelT = Math.min(4, w.thickness / 3);
  const panel = (a: Pt, b: Pt, shift: number, hidden = false): DoorPanel => {
    const off = mul(nrm, shift);
    const h = mul(nrm, panelT / 2);
    return { hidden, pts: [add(add(a, off), h), add(add(b, off), h), sub(add(b, off), h), sub(add(a, off), h)] };
  };
  switch (o.style ?? "single") {
    case "double": {
      const mid = lerp(start, end, 0.5);
      return { leaves: [leaf(start, mid, width / 2), leaf(end, mid, width / 2)], panels: [] };
    }
    case "sliding": {
      // Two overlapping panels on either side of the centreline (bypass track).
      const lap = Math.min(5, width * 0.05);
      const mid = lerp(start, end, 0.5);
      const shift = Math.min(w.thickness / 4, panelT);
      return {
        leaves: [],
        panels: [panel(start, add(mid, mul(d, lap)), shift), panel(sub(mid, mul(d, lap)), end, -shift)],
      };
    }
    case "pocket": {
      // One panel shown inside the wall cavity beside the opening, on the chosen
      // side if the wall is long enough there, otherwise on the side that fits.
      const roomBefore = o.offset - width / 2;
      const roomAfter = wallLength(w) - (o.offset + width / 2);
      const fits = (after: boolean) => (after ? roomAfter : roomBefore) >= width - 0.5;
      const towardsEnd = fits(o.hingeEnd) || !fits(!o.hingeEnd) ? o.hingeEnd : !o.hingeEnd;
      const a = towardsEnd ? end : start;
      const b = add(a, mul(d, towardsEnd ? width : -width));
      return { leaves: [], panels: [panel(a, b, 0, true)] };
    }
    default: {
      const hinge = o.hingeEnd ? end : start;
      return { leaves: [leaf(hinge, o.hingeEnd ? start : end, width)], panels: [] };
    }
  }
}

// ---------------------------------------------------------------------------
// DXF export (AutoCAD R12 ASCII; units: millimetres; y flipped to y-up)
// ---------------------------------------------------------------------------
export type DxfInput = {
  geometry: Geometry;
  rooms: { name: string; polygon: Pt[] }[];
  furniture: { label: string; corners: Pt[] }[];
  appliances: { name: string; at: Pt }[];
};

export function toDxf(input: DxfInput): string {
  const out: string[] = [];
  const g = (code: number, value: string | number) => out.push(String(code), typeof value === "number" ? String(Math.round(value * 1000) / 1000) : value);
  const X = (p: Pt) => p.x * 10;
  const Y = (p: Pt) => -p.y * 10;
  const line = (layer: string, a: Pt, b: Pt) => {
    g(0, "LINE"); g(8, layer); g(10, X(a)); g(20, Y(a)); g(30, 0); g(11, X(b)); g(21, Y(b)); g(31, 0);
  };
  const text = (layer: string, at: Pt, h: number, s: string) => {
    g(0, "TEXT"); g(8, layer); g(10, X(at)); g(20, Y(at)); g(30, 0); g(40, h * 10); g(1, s.replace(/[\r\n]+/g, " ").slice(0, 250));
  };
  const arc = (layer: string, c: Pt, r: number, start: number, end: number) => {
    g(0, "ARC"); g(8, layer); g(10, X(c)); g(20, Y(c)); g(30, 0); g(40, r * 10); g(50, start); g(51, end);
  };
  const poly = (layer: string, pts: Pt[]) => pts.forEach((p, i) => line(layer, p, pts[(i + 1) % pts.length]));

  const layers = ["WALLS", "DOORS", "WINDOWS", "ROOMS", "ROOM-NAMES", "DIMENSIONS", "TEXT", "FURNITURE", "APPLIANCES"];
  g(0, "SECTION"); g(2, "HEADER"); g(9, "$ACADVER"); g(1, "AC1009"); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES"); g(0, "TABLE"); g(2, "LAYER"); g(70, layers.length);
  layers.forEach((l, i) => { g(0, "LAYER"); g(2, l); g(70, 0); g(62, [7, 1, 5, 8, 7, 3, 7, 9, 4][i]); g(6, "CONTINUOUS"); });
  g(0, "ENDTAB"); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");

  const { walls, openings, dimensions, labels } = input.geometry;
  for (const w of walls) {
    const d = wallDir(w);
    const n = mul(perp(d), w.thickness / 2);
    for (const [s, e] of wallSegments(w, openings)) {
      const a = add(w.a, mul(d, s));
      const b = add(w.a, mul(d, e));
      poly("WALLS", [add(a, n), add(b, n), sub(b, n), sub(a, n)]);
    }
  }
  const byId = new Map(walls.map((w) => [w.id, w]));
  for (const o of openings) {
    const w = byId.get(o.wallId);
    if (!w) continue;
    const { start, end } = openingSpan(w, o);
    const d = wallDir(w);
    const n = mul(perp(d), (o.flip ? -1 : 1));
    if (o.kind === "window") {
      line("WINDOWS", add(start, mul(n, w.thickness / 2)), add(end, mul(n, w.thickness / 2)));
      line("WINDOWS", start, end);
      line("WINDOWS", sub(start, mul(n, w.thickness / 2)), sub(end, mul(n, w.thickness / 2)));
    } else if (o.kind === "door") {
      const sym = doorSymbol(w, o);
      for (const lf of sym.leaves) {
        line("DOORS", lf.hinge, lf.tip);
        const a0 = angleDeg(lf.hinge, lf.closed);
        const a1 = angleDeg(lf.hinge, lf.tip);
        // DXF arcs run counter-clockwise from start to end angle (y-up).
        const ccw = ((a1 - a0 + 360) % 360) <= 180;
        arc("DOORS", lf.hinge, lf.radius, ccw ? a0 : a1, ccw ? a1 : a0);
      }
      for (const pn of sym.panels) poly("DOORS", pn.pts);
    }
  }
  for (const r of input.rooms) {
    poly("ROOMS", r.polygon);
    const c = polygonCentroid(r.polygon);
    text("ROOM-NAMES", c, 18, r.name);
    text("ROOM-NAMES", add(c, { x: 0, y: 26 }), 12, formatArea(polygonArea(r.polygon)));
  }
  for (const d of dimensions) {
    const n = mul(perp(unit(sub(d.b, d.a))), d.offset);
    const a = add(d.a, n), b = add(d.b, n);
    line("DIMENSIONS", d.a, a);
    line("DIMENSIONS", d.b, b);
    line("DIMENSIONS", a, b);
    text("DIMENSIONS", lerp(a, b, 0.5), 12, formatLength(dist(d.a, d.b), { precise: true }));
  }
  for (const l of labels) text("TEXT", l.at, l.size, l.text);
  for (const f of input.furniture) {
    poly("FURNITURE", f.corners);
    text("FURNITURE", polygonCentroid(f.corners), 8, f.label);
  }
  for (const a of input.appliances) {
    const r = 15;
    poly("APPLIANCES", [add(a.at, { x: -r, y: -r }), add(a.at, { x: r, y: -r }), add(a.at, { x: r, y: r }), add(a.at, { x: -r, y: r })]);
    text("APPLIANCES", add(a.at, { x: r + 4, y: 0 }), 9, a.name);
  }
  g(0, "ENDSEC"); g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}

/** Split a wall at a point on it (T-junctions); openings go to whichever piece contains them. */
export function splitWallAt(g: Geometry, wallId: string, p: Pt, newId: () => string): Geometry {
  const w = g.walls.find((x) => x.id === wallId);
  if (!w) return g;
  const pr = projectOnSegment(p, w.a, w.b);
  const at = roundPt(pr.point);
  const L = wallLength(w);
  const cut = pr.t * L;
  if (cut < 5 || L - cut < 5) return g; // too close to an end: it's already a corner
  const w1: Wall = { ...w, b: at };
  const w2: Wall = { ...w, id: newId(), a: at };
  const openings = g.openings.map((o) => (o.wallId !== w.id || o.offset <= cut ? o : { ...o, wallId: w2.id, offset: o.offset - cut }));
  const walls = g.walls.flatMap((x) => (x.id === w.id ? [w1, w2] : [x]));
  return { ...g, walls, openings: reclampOpenings(walls, openings) };
}

/** Move a whole wall; walls joined at its ends stretch to follow. */
export function moveWall(g: Geometry, wallId: string, dx: number, dy: number): Geometry {
  const w = g.walls.find((x) => x.id === wallId);
  if (!w) return g;
  const d = { x: dx, y: dy };
  let next = g;
  // Move the far end first, then the near end, so shared corners resolve correctly.
  next = moveCorner(next, w.b, add(w.b, d));
  const moved = next.walls.find((x) => x.id === wallId)!;
  next = moveCorner(next, moved.a, add(w.a, d));
  return next;
}

/** Change a wall's length by moving its `b` end along its direction (joined walls follow). */
export function setWallLength(g: Geometry, wallId: string, length: number): Geometry {
  const w = g.walls.find((x) => x.id === wallId);
  if (!w || length < 1) return g;
  return moveCorner(g, w.b, add(w.a, mul(wallDir(w), length)));
}

// ---------------------------------------------------------------------------
// Room detection ("boundary pick"): find the enclosed region around a point
// ---------------------------------------------------------------------------
const signedArea = (pts: Pt[]) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
};

/** Drop vertices that sit on a straight line between their neighbours. */
function simplifyPolygon(pts: Pt[]) {
  let out = pts;
  for (let changed = true; changed && out.length > 3; ) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const p = out[(i - 1 + out.length) % out.length];
      const q = out[i];
      const r = out[(i + 1) % out.length];
      const l = dist(p, r);
      if (samePt(p, q, 0.05) || (l > 0 && Math.abs(cross(sub(q, p), sub(r, p))) / l < 0.5 && dot(sub(q, p), sub(r, q)) >= 0)) {
        out = out.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/**
 * Split wall centrelines at every crossing, T-junction and shared corner, and
 * return the resulting planar graph. Ends that stop inside another wall's
 * thickness (a common drafting slip) are treated as touching it.
 */
function wallGraph(walls: Wall[], tol = 1.5) {
  const segs = walls.filter((w) => wallLength(w) > tol);
  const cuts: number[][] = segs.map(() => [0, 1]);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const d = sub(s.b, s.a);
    const L = len(d);
    for (let j = 0; j < segs.length; j++) {
      if (i === j) continue;
      const o = segs[j];
      // Another wall's end lying on (or within half this wall's thickness of) this wall.
      for (const end of [o.a, o.b]) {
        const pr = projectOnSegment(end, s.a, s.b);
        if (pr.dist <= Math.max(tol, s.thickness / 2) && pr.t * L > tol && (1 - pr.t) * L > tol) cuts[i].push(pr.t);
      }
      // Proper crossing.
      if (j > i) {
        const e = sub(o.b, o.a);
        const den = cross(d, e);
        if (Math.abs(den) < 1e-9) continue;
        const t = cross(sub(o.a, s.a), e) / den;
        const u = cross(sub(o.a, s.a), d) / den;
        if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) {
          cuts[i].push(t);
          cuts[j].push(u);
        }
      }
    }
  }

  const verts: Pt[] = [];
  const vertexAt = (p: Pt) => {
    const k = verts.findIndex((v) => dist(v, p) <= tol);
    if (k >= 0) return k;
    verts.push(p);
    return verts.length - 1;
  };
  const edges = new Map<string, [number, number]>();
  segs.forEach((s, i) => {
    const ts = [...new Set(cuts[i])].sort((a, b) => a - b);
    const ids = ts.map((t) => vertexAt(lerp(s.a, s.b, t)));
    for (let k = 0; k < ids.length - 1; k++) {
      const a = ids[k], b = ids[k + 1];
      if (a === b) continue;
      edges.set(a < b ? `${a}:${b}` : `${b}:${a}`, a < b ? [a, b] : [b, a]);
    }
  });

  // Prune dead ends (stub walls) repeatedly: they cannot bound a room.
  const adj = verts.map(() => new Set<number>());
  for (const [a, b] of edges.values()) {
    adj[a].add(b);
    adj[b].add(a);
  }
  const stack = adj.flatMap((s, i) => (s.size === 1 ? [i] : []));
  while (stack.length) {
    const v = stack.pop()!;
    for (const w of adj[v]) {
      adj[w].delete(v);
      if (adj[w].size === 1) stack.push(w);
    }
    adj[v].clear();
  }
  return { verts, adj };
}

export type Region = { pts: Pt[]; area: number };

/**
 * Every region fully enclosed by walls (along their centrelines), smallest
 * first. Regions under `minArea` (default 0.5 m²) are dropped as slivers.
 */
export function enclosedRegions(walls: Wall[], minArea = 5000): Region[] {
  const { verts, adj } = wallGraph(walls);
  const order = adj.map((s, v) =>
    [...s].sort((a, b) => Math.atan2(verts[a].y - verts[v].y, verts[a].x - verts[v].x) - Math.atan2(verts[b].y - verts[v].y, verts[b].x - verts[v].x)),
  );
  const seen = new Set<string>();
  const out: Region[] = [];
  for (let u = 0; u < verts.length; u++)
    for (const v0 of order[u]) {
      if (seen.has(`${u}>${v0}`)) continue;
      // Walk one face: at each vertex turn onto the next edge clockwise from the one we arrived on.
      const face: number[] = [];
      let a = u, b = v0;
      for (let guard = 0; guard <= 4 * verts.length && !seen.has(`${a}>${b}`); guard++) {
        seen.add(`${a}>${b}`);
        face.push(a);
        const around = order[b];
        const i = around.indexOf(a);
        const next = around[(i - 1 + around.length) % around.length];
        a = b;
        b = next;
      }
      const raw = face.map((k) => verts[k]);
      // Bounded faces come out with positive signed area in this traversal (y down); outer faces are negative.
      const area = signedArea(raw);
      if (area <= minArea) continue;
      const pts = simplifyPolygon(raw.map(roundPt));
      if (pts.length >= 3) out.push({ pts, area });
    }
  return out.sort((x, y) => x.area - y.area);
}

/** The smallest region in `regions` (sorted smallest first) that contains `p`. */
export function regionAt(regions: Region[], p: Pt): Region | null {
  return regions.find((r) => pointInPolygon(p, r.pts)) ?? null;
}

/**
 * The smallest region enclosed by walls that contains `p`, as a polygon along
 * the wall centrelines, or null when the walls around `p` don't close.
 */
export function detectRoomAt(walls: Wall[], p: Pt, opts: { minArea?: number } = {}): Pt[] | null {
  return regionAt(enclosedRegions(walls, opts.minArea), p)?.pts ?? null;
}
