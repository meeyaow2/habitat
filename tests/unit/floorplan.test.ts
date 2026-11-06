import { describe, expect, it } from "vitest";
import { docsEqual, historyReducer, HISTORY_LIMIT, initHistory } from "@/features/home/editor-store";
import { alignRect, areaM2, boundsOf, objectBounds, roomAt, snap, validateDoc, type FloorDoc, type PlanObject, type RoomShape } from "@/features/home/model";
import { floorExtent, instantiateFloor, suggestedTemplate, TEMPLATES } from "@/features/home/templates";

const room = (id: string, x: number, y: number, w: number, h: number): RoomShape => ({ id, name: id, roomType: "other", x, y, width: w, height: h, sortOrder: 0 });
const doc = (rooms: RoomShape[] = [], objects: PlanObject[] = []): FloorDoc => ({ rooms, objects });

describe("geometry", () => {
  it("snaps to the grid", () => {
    expect(snap(123)).toBe(120);
    expect(snap(125)).toBe(130);
    expect(snap(-14)).toBe(-10);
  });

  it("computes areas in square metres", () => {
    expect(areaM2({ width: 540, height: 460 })).toBe(24.8);
  });

  it("rotates object bounds about their centre in 90° steps", () => {
    const o = { x: 0, y: 0, width: 200, height: 100, rotation: 90 };
    expect(objectBounds(o)).toEqual({ x: 50, y: -50, width: 100, height: 200 });
    expect(objectBounds({ ...o, rotation: 180 })).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(objectBounds({ ...o, rotation: -90 })).toEqual({ x: 50, y: -50, width: 100, height: 200 });
  });

  it("finds the smallest room containing a point", () => {
    const big = room("big", 0, 0, 1000, 1000);
    const small = room("small", 100, 100, 200, 200);
    expect(roomAt([big, small], { x: 150, y: 150 })?.id).toBe("small");
    expect(roomAt([big, small], { x: 900, y: 900 })?.id).toBe("big");
    expect(roomAt([big], { x: 2000, y: 0 })).toBeNull();
  });

  it("aligns a dragged room to neighbouring edges and reports guides", () => {
    const a = room("a", 0, 0, 300, 300);
    const res = alignRect({ x: 307, y: 4, width: 200, height: 200 }, [a], 12);
    expect(res.x).toBe(300); // left edge snaps to a's right edge
    expect(res.y).toBe(0); // top edges align
    expect(res.guides.map((g) => g.orientation).sort()).toEqual(["horizontal", "vertical"]);
  });

  it("falls back to the grid when nothing is close", () => {
    const res = alignRect({ x: 523, y: 777, width: 100, height: 100 }, [room("a", 0, 0, 100, 100)], 12);
    expect(res).toMatchObject({ x: 520, y: 780, guides: [] });
  });

  it("validates document invariants", () => {
    const asset = (id: string, assetId: string | null): PlanObject => ({ id, kind: "asset", assetId, furnitureType: null, label: null, x: 0, y: 0, width: 44, height: 44, rotation: 0 });
    expect(validateDoc(doc([room("r", 0, 0, 300, 300)]))).toEqual([]);
    expect(validateDoc(doc([room("r", 0, 0, 30, 300)]))[0]).toMatch(/smaller/);
    expect(validateDoc(doc([], [asset("o1", null)]))[0]).toMatch(/reference an asset/);
    expect(validateDoc(doc([], [asset("o1", "x"), asset("o2", "x")]))[0]).toMatch(/placed once/);
    expect(validateDoc(doc([room("r", 0, 0, 300, 300), room("r", 0, 0, 300, 300)]))[0]).toMatch(/Duplicate/);
  });

  it("computes overall bounds", () => {
    expect(boundsOf([room("a", 0, 0, 100, 100), room("b", 200, 50, 100, 300)])).toEqual({ x: 0, y: 0, width: 300, height: 350 });
    expect(boundsOf([])).toBeNull();
  });
});

describe("undo/redo history", () => {
  const d0 = doc();
  const d1 = doc([room("a", 0, 0, 100, 100)]);
  const d2 = doc([room("a", 10, 0, 100, 100)]);

  it("commits, undoes and redoes", () => {
    let h = initHistory(d0);
    h = historyReducer(h, { type: "commit", doc: d1 });
    h = historyReducer(h, { type: "commit", doc: d2 });
    expect(h.present).toBe(d2);
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(d1);
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(d0);
    expect(historyReducer(h, { type: "undo" })).toBe(h); // nothing left
    h = historyReducer(h, { type: "redo" });
    expect(h.present).toBe(d1);
  });

  it("clears the redo stack on a new commit", () => {
    let h = historyReducer(historyReducer(initHistory(d0), { type: "commit", doc: d1 }), { type: "undo" });
    h = historyReducer(h, { type: "commit", doc: d2 });
    expect(h.future).toHaveLength(0);
    expect(historyReducer(h, { type: "redo" })).toBe(h);
  });

  it("caps history length", () => {
    let h = initHistory(d0);
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = historyReducer(h, { type: "commit", doc: doc([room("a", i, 0, 100, 100)]) });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });

  it("compares documents for unsaved changes, ignoring float noise and object order", () => {
    const a = doc([room("a", 0, 0, 100, 100)]);
    expect(docsEqual(a, doc([room("a", 0.00001, 0, 100, 100)]))).toBe(true);
    expect(docsEqual(a, doc([room("a", 10, 0, 100, 100)]))).toBe(false);
  });
});

describe("starter templates", () => {
  for (const t of TEMPLATES) {
    describe(t.label, () => {
      for (const floor of t.floors) {
        const d = instantiateFloor(floor);
        it(`${floor.name}: produces a valid document`, () => {
          expect(validateDoc(d)).toEqual([]);
        });
        it(`${floor.name}: rooms do not overlap`, () => {
          for (let i = 0; i < d.rooms.length; i++)
            for (let j = i + 1; j < d.rooms.length; j++) {
              const a = d.rooms[i], b = d.rooms[j];
              const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
              const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
              expect(overlapX > 1 && overlapY > 1, `${a.name} overlaps ${b.name}`).toBe(false);
            }
        });
        it(`${floor.name}: furniture sits inside its room`, () => {
          for (const o of d.objects) {
            const b = objectBounds(o);
            const r = roomAt(d.rooms, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
            expect(r, `${o.label} outside rooms`).not.toBeNull();
            expect(b.x >= r!.x && b.y >= r!.y && b.x + b.width <= r!.x + r!.width && b.y + b.height <= r!.y + r!.height, `${o.label} spills out of ${r!.name}`).toBe(true);
          }
        });
        it(`${floor.name}: extent contains every room`, () => {
          const e = floorExtent(floor);
          for (const r of d.rooms) expect(r.x + r.width <= e.widthCm && r.y + r.height <= e.depthCm).toBe(true);
        });
      }
    });
  }

  it("suggests a template per property type", () => {
    expect(suggestedTemplate("hdb", "3_room")).toBe("hdb_3_room");
    expect(suggestedTemplate("hdb", null)).toBe("hdb_4_room");
    expect(suggestedTemplate("condo")).toBe("condo_3br");
    expect(suggestedTemplate("landed")).toBe("landed_terrace");
    expect(suggestedTemplate("other")).toBe("blank");
  });

  it("generates fresh ids on every instantiation", () => {
    const a = instantiateFloor(TEMPLATES[0].floors[0]);
    const b = instantiateFloor(TEMPLATES[0].floors[0]);
    expect(a.rooms[0].id).not.toBe(b.rooms[0].id);
  });
});
