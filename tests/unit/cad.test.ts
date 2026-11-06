import { describe, expect, it } from "vitest";
import {
  angleDeg, clampOpening, isSimplePolygon, moveCorner, nearestWall, openingSpan, parseLength, pointAtLength, pointInPolygon,
  polygonArea, polygonCentroid, rectPolygon, snapPoint, toDxf, wallEndsAt, wallOutline, wallSegments, wallsFromPolygons,
  type Geometry, type Opening, type Wall,
} from "@/features/home/cad";

let n = 0;
const id = () => `id${++n}`;
const wall = (ax: number, ay: number, bx: number, by: number, t = 10): Wall => ({ id: id(), a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness: t });
const door = (w: Wall, offset: number, width = 90): Opening => ({ id: id(), wallId: w.id, kind: "door", offset, width, flip: false, hingeEnd: false, height: 210, sill: 0 });

describe("lengths", () => {
  it("parses typed lengths in metres by default and other units explicitly", () => {
    expect(parseLength("3.2")).toBe(320);
    expect(parseLength("3,2")).toBe(320);
    expect(parseLength("320cm")).toBe(320);
    expect(parseLength("3200mm")).toBe(320);
    expect(parseLength("3m20")).toBe(320);
    expect(parseLength("3m 20cm")).toBe(320);
    expect(parseLength("2.75 m")).toBe(275);
    expect(parseLength("")).toBeNull();
    expect(parseLength("abc")).toBeNull();
    expect(parseLength("-2")).toBeNull();
  });
  it("places a point at an exact distance in the cursor direction", () => {
    expect(pointAtLength({ x: 0, y: 0 }, { x: 10, y: 0 }, 320)).toEqual({ x: 320, y: 0 });
    expect(pointAtLength({ x: 100, y: 100 }, { x: 100, y: -50 }, 250)).toEqual({ x: 100, y: -150 });
  });
  it("reports angles counter-clockwise from east on a y-down screen", () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe(90);
    expect(angleDeg({ x: 0, y: 0 }, { x: -10, y: 0 })).toBe(180);
  });
});

describe("polygons", () => {
  const L = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 400 }, { x: 0, y: 400 }];
  it("computes area of any simple polygon (L-shaped room)", () => {
    expect(polygonArea(L)).toBe(400 * 200 + 200 * 200);
    expect(polygonArea(rectPolygon({ x: 0, y: 0, width: 300, height: 250 }))).toBe(75_000);
  });
  it("hit-tests points inside concave rooms", () => {
    expect(pointInPolygon({ x: 100, y: 300 }, L)).toBe(true);
    expect(pointInPolygon({ x: 300, y: 300 }, L)).toBe(false);
  });
  it("finds the centroid", () => {
    expect(polygonCentroid(rectPolygon({ x: 0, y: 0, width: 200, height: 100 }))).toEqual({ x: 100, y: 50 });
  });
  it("rejects self-intersecting outlines", () => {
    expect(isSimplePolygon(L)).toBe(true);
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }])).toBe(false);
  });
});

describe("walls and openings", () => {
  it("builds a thickened outline", () => {
    expect(wallOutline(wall(0, 0, 100, 0, 20))).toEqual([{ x: 0, y: 10 }, { x: 100, y: 10 }, { x: 100, y: -10 }, { x: 0, y: -10 }]);
  });
  it("keeps openings inside their wall", () => {
    const w = wall(0, 0, 300, 0);
    expect(clampOpening(w, { offset: 10, width: 90 })).toEqual({ offset: 50, width: 90 });
    expect(clampOpening(w, { offset: 299, width: 90 })).toEqual({ offset: 250, width: 90 });
    expect(clampOpening(w, { offset: 150, width: 900 }).width).toBe(290);
  });
  it("splits a wall around its openings", () => {
    const w = wall(0, 0, 500, 0);
    expect(wallSegments(w, [door(w, 100), door(w, 400, 100)])).toEqual([[0, 55], [145, 350], [450, 500]]);
    expect(openingSpan(w, door(w, 100))).toEqual({ start: { x: 55, y: 0 }, end: { x: 145, y: 0 } });
  });
  it("moves a shared corner for every wall that meets there", () => {
    const w1 = wall(0, 0, 300, 0);
    const w2 = wall(300, 0, 300, 200);
    const w3 = wall(0, 0, 0, 200);
    const g: Geometry = { walls: [w1, w2, w3], openings: [door(w1, 150)], dimensions: [], labels: [] };
    expect(wallEndsAt(g.walls, { x: 300, y: 0 })).toHaveLength(2);
    const moved = moveCorner(g, { x: 300, y: 0 }, { x: 350, y: -20 });
    expect(moved.walls[0].b).toEqual({ x: 350, y: -20 });
    expect(moved.walls[1].a).toEqual({ x: 350, y: -20 });
    expect(moved.walls[2]).toEqual(w3);
  });
  it("finds the nearest wall for door placement", () => {
    const ws = [wall(0, 0, 300, 0), wall(0, 0, 0, 300)];
    const hit = nearestWall(ws, { x: 120, y: 8 }, 30)!;
    expect(hit.wall.id).toBe(ws[0].id);
    expect(hit.offset).toBe(120);
    expect(nearestWall(ws, { x: 150, y: 150 }, 30)).toBeNull();
  });
});

describe("snapping", () => {
  const walls = [wall(0, 0, 400, 0), wall(400, 0, 400, 300)];
  const base = { walls, grid: 10, tolerance: 15 };
  it("snaps to endpoints first", () => {
    expect(snapPoint({ x: 405, y: 8 }, base)).toMatchObject({ point: { x: 400, y: 0 }, kind: "endpoint" });
  });
  it("snaps to midpoints", () => {
    expect(snapPoint({ x: 203, y: 6 }, base)).toMatchObject({ point: { x: 200, y: 0 }, kind: "midpoint" });
  });
  it("tracks alignment with existing points", () => {
    const r = snapPoint({ x: 397, y: 500 }, base);
    expect(r.kind).toBe("tracking");
    expect(r.point).toEqual({ x: 400, y: 500 });
    expect(r.guides).toHaveLength(1);
  });
  it("falls back to the grid", () => {
    expect(snapPoint({ x: 123, y: 456 }, base)).toMatchObject({ point: { x: 120, y: 460 }, kind: "grid" });
  });
  it("locks to 90° steps in ortho mode", () => {
    const r = snapPoint({ x: 250, y: 212 }, { ...base, from: { x: 0, y: 200 }, ortho: true });
    expect(r.point).toEqual({ x: 250, y: 200 });
    expect(r.kind).toBe("polar");
  });
});

describe("rooms to walls", () => {
  it("merges shared edges between adjacent rooms and marks the outline as exterior", () => {
    const a = rectPolygon({ x: 0, y: 0, width: 300, height: 300 });
    const b = rectPolygon({ x: 300, y: 0, width: 200, height: 300 });
    const walls = wallsFromPolygons([a, b], id);
    // Outline: top (0–500), bottom (0–500), left, right = 4 exterior; shared x=300 = 1 interior.
    expect(walls).toHaveLength(5);
    const shared = walls.find((w) => w.a.x === 300 && w.b.x === 300)!;
    expect(shared.thickness).toBe(10);
    const top = walls.find((w) => w.a.y === 0 && w.b.y === 0)!;
    expect([top.a.x, top.b.x]).toEqual([0, 500]);
    expect(top.thickness).toBe(20);
  });
});

describe("DXF export", () => {
  it("produces an R12 file with layered entities in millimetres", () => {
    const w = wall(0, 0, 300, 0);
    const dxf = toDxf({
      geometry: { walls: [w], openings: [door(w, 150)], dimensions: [{ id: "d", a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, offset: 50 }], labels: [{ id: "l", at: { x: 10, y: 10 }, text: "North", size: 20 }] },
      rooms: [{ name: "Kitchen", polygon: rectPolygon({ x: 0, y: 0, width: 300, height: 200 }) }],
      furniture: [],
      appliances: [{ name: "Fridge", at: { x: 50, y: 50 } }],
    });
    expect(dxf.startsWith("0\r\nSECTION\r\n2\r\nHEADER")).toBe(true);
    expect(dxf).toContain("AC1009");
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
    expect(dxf).toContain("\r\nARC\r\n8\r\nDOORS");
    expect(dxf).toContain("Kitchen");
    expect(dxf).toContain("6.0 m²");
    expect(dxf).toContain("3.00 m");
    expect(dxf).toContain("\r\n3000\r\n"); // 300 cm → 3000 mm
  });
});
