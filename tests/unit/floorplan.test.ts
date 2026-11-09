import { describe, expect, it } from "vitest";
import { openingConflicts, rectPolygon, wallsFromPolygons } from "@/features/home/cad";
import { docsEqual, historyReducer, HISTORY_LIMIT, initHistory } from "@/features/home/editor-store";
import { alignRect, areaM2, boundsOf, furniturePlacementIssues, moveBoundaryCorner, moveWallBoundary, objectBounds, roomAt, roomLabelPlacement, scaleFloorProportionally, setWallBoundaryLength, snap, validateDoc, type FloorDoc, type PlanObject, type RoomShape } from "@/features/home/model";
import { floorExtent, instantiateFloor, suggestedTemplate, TEMPLATES } from "@/features/home/templates";

const room = (id: string, x: number, y: number, w: number, h: number): RoomShape => ({ id, name: id, roomType: "other", x, y, width: w, height: h, sortOrder: 0 });
const doc = (rooms: RoomShape[] = [], objects: PlanObject[] = []): FloorDoc => ({ rooms, objects, geometry: { walls: [], openings: [], dimensions: [], labels: [] } });

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

  it("keeps furniture size while proportionally scaling rooms, walls and door positions", () => {
    const bed: PlanObject = { id: "bed", kind: "furniture", assetId: null, furnitureType: "bed_double", label: "Queen bed", x: 100, y: 80, width: 155, height: 200, rotation: 0 };
    const source: FloorDoc = {
      rooms: [room("bedroom", 0, 0, 400, 400)],
      objects: [bed],
      geometry: { walls: [{ id: "wall", a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, thickness: 10 }], openings: [{ id: "door", wallId: "wall", kind: "door", offset: 100, width: 80, flip: false, hingeEnd: false, height: 210, sill: 0 }], dimensions: [], labels: [] },
    };
    const scaled = scaleFloorProportionally(source, 0.8);
    expect(scaled.rooms[0].width).toBe(320);
    expect(scaled.objects[0]).toMatchObject({ width: 155, height: 200 });
    expect(scaled.geometry.walls[0].b.x).toBe(320);
    expect(scaled.geometry.openings[0]).toMatchObject({ wallId: "wall", offset: 80, width: 80 });
  });

  it("moves a room label when furniture covers its previous clear position", () => {
    const living = room("living", 0, 0, 400, 400);
    const empty = doc([living]);
    const first = roomLabelPlacement(empty, living);
    const sofa: PlanObject = { id: "sofa", kind: "furniture", assetId: null, furnitureType: "sofa", label: "Sofa", x: first.x - 100, y: first.y - 50, width: 200, height: 100, rotation: 0 };
    const shifted = roomLabelPlacement(doc([living], [sofa]), living);
    expect({ x: shifted.x, y: shifted.y }).not.toEqual({ x: first.x, y: first.y });
  });

  it("moves walls, connected room fills and attached windows as one boundary edit", () => {
    const kitchen = room("kitchen", 0, 0, 200, 200);
    const yard = room("yard", 200, 0, 200, 200);
    let sequence = 0;
    const walls = wallsFromPolygons([rectPolygon(kitchen), rectPolygon(yard)], () => `wall-${sequence++}`);
    const bottom = walls.find((wall) => wall.a.y === 200 && wall.b.y === 200 && Math.abs(wall.b.x - wall.a.x) === 400)!;
    const source: FloorDoc = {
      rooms: [kitchen, yard],
      objects: [],
      geometry: {
        walls,
        openings: [{ id: "window", wallId: bottom.id, kind: "window", offset: 300, width: 90, height: 120, sill: 90, flip: false, hingeEnd: false }],
        dimensions: [], labels: [],
      },
    };

    const deeper = moveWallBoundary(source, bottom.id, 0, 50);
    expect(deeper.geometry.walls.find((wall) => wall.id === bottom.id)).toMatchObject({ a: { y: 250 }, b: { y: 250 } });
    expect(deeper.geometry.openings[0]).toMatchObject({ wallId: bottom.id, width: 90, offset: 300 });
    expect(deeper.rooms.map((candidate) => [candidate.id, candidate.height])).toEqual([["kitchen", 250], ["yard", 250]]);

    const shared = deeper.geometry.walls.find((wall) => wall.a.x === 200 && wall.b.x === 200)!;
    const widerKitchen = moveWallBoundary(deeper, shared.id, 50, 0);
    expect(widerKitchen.rooms.find((candidate) => candidate.id === "kitchen")).toMatchObject({ width: 250 });
    expect(widerKitchen.rooms.find((candidate) => candidate.id === "yard")).toMatchObject({ x: 250, width: 150 });

    let history = historyReducer(initHistory(source), { type: "commit", doc: deeper });
    history = historyReducer(history, { type: "undo" });
    expect(docsEqual(history.present, source)).toBe(true);
  });

  it("makes a room corner handle split and move the actual joined wall corner", () => {
    const kitchen = room("kitchen", 0, 0, 200, 200);
    const yard = room("yard", 200, 0, 200, 200);
    let sequence = 0;
    const source: FloorDoc = {
      rooms: [kitchen, yard], objects: [],
      geometry: { walls: wallsFromPolygons([rectPolygon(kitchen), rectPolygon(yard)], () => `wall-${sequence++}`), openings: [], dimensions: [], labels: [] },
    };
    const resized = moveBoundaryCorner(source, { x: 200, y: 200 }, { x: 200, y: 250 });
    expect(resized.rooms.every((candidate) => candidate.height === 250)).toBe(true);
    expect(resized.geometry.walls.some((wall) => (wall.a.x === 200 && wall.a.y === 250) || (wall.b.x === 200 && wall.b.y === 250))).toBe(true);
  });

  it("preserves opening width and reports when an exact wall length is too short", () => {
    const source: FloorDoc = {
      rooms: [room("room", 0, 0, 300, 200)], objects: [],
      geometry: {
        walls: [{ id: "wall", a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, thickness: 10 }],
        openings: [{ id: "window", wallId: "wall", kind: "window", offset: 150, width: 120, height: 120, sill: 90, flip: false, hingeEnd: false }],
        dimensions: [], labels: [],
      },
    };
    const shortened = setWallBoundaryLength(source, "wall", 100);
    expect(shortened.geometry.openings[0].width).toBe(120);
    expect(openingConflicts(shortened.geometry)).toHaveLength(1);
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

  it("treats wall, door and dimension edits as unsaved changes", () => {
    const a = doc();
    const withWall = { ...a, geometry: { ...a.geometry, walls: [{ id: "w", a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 10 }] } };
    expect(docsEqual(a, withWall)).toBe(false);
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

  it("starts the 4-room HDB beds and wardrobes clear of conflicts", () => {
    const template = TEMPLATES.find((candidate) => candidate.key === "hdb_4_room")!;
    const d = instantiateFloor(template.floors[0]);
    const bedroomFurniture = d.objects.filter((object) =>
      object.kind === "furniture" && ["bed_double", "bed_single", "wardrobe"].includes(object.furnitureType ?? ""),
    );
    expect(bedroomFurniture.length).toBeGreaterThanOrEqual(6);
    for (const object of bedroomFurniture) expect(furniturePlacementIssues(d, object), object.label ?? object.id).toEqual([]);
  });

  it("matches each published HDB reference area at one real-world scale", () => {
    for (const key of ["hdb_2_room", "hdb_3_room", "hdb_4_room", "hdb_5_room"] as const) {
      const template = TEMPLATES.find((candidate) => candidate.key === key)!;
      const d = instantiateFloor(template.floors[0]);
      const modeledArea = d.rooms.reduce((sum, candidate) => sum + candidate.width * candidate.height / 10000, 0);
      expect(modeledArea, key).toBeCloseTo(template.reference!.totalAreaM2, 0);
      expect(template.reference!.url).toContain("hdb.gov.sg");
    }
  });

  it("gives every required starter a front-door route to each usable room", () => {
    const required = ["hdb_2_room", "hdb_3_room", "hdb_4_room", "hdb_5_room", "condo_2br", "condo_3br"] as const;
    for (const key of required) {
      const template = TEMPLATES.find((candidate) => candidate.key === key)!;
      const d = instantiateFloor(template.floors[0]);
      const graph = new Map<string, Set<string>>();
      const connect = (a: string, b: string) => {
        graph.set(a, new Set([...(graph.get(a) ?? []), b]));
        graph.set(b, new Set([...(graph.get(b) ?? []), a]));
      };
      for (const opening of d.geometry.openings.filter((candidate) => candidate.kind !== "window")) {
        const wall = d.geometry.walls.find((candidate) => candidate.id === opening.wallId)!;
        const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
        const direction = { x: (wall.b.x - wall.a.x) / length, y: (wall.b.y - wall.a.y) / length };
        const at = { x: wall.a.x + direction.x * opening.offset, y: wall.a.y + direction.y * opening.offset };
        const normal = { x: -direction.y * 30, y: direction.x * 30 };
        const a = roomAt(d.rooms, { x: at.x + normal.x, y: at.y + normal.y })?.id ?? "outside";
        const b = roomAt(d.rooms, { x: at.x - normal.x, y: at.y - normal.y })?.id ?? "outside";
        if (a !== b) connect(a, b);
      }
      const reached = new Set<string>(["outside"]);
      const queue = ["outside"];
      while (queue.length) {
        const current = queue.shift()!;
        for (const next of graph.get(current) ?? []) if (!reached.has(next)) { reached.add(next); queue.push(next); }
      }
      const usable = d.rooms.filter((candidate) => candidate.name !== "Air-con ledge");
      for (const candidate of usable) expect(reached.has(candidate.id), `${key}: no route to ${candidate.name}`).toBe(true);
      expect(d.geometry.openings.some((candidate) => candidate.kind === "window"), `${key}: needs exterior windows`).toBe(true);
    }
  });

  it("starts all six required plans without furniture conflicts or blocked doors", () => {
    const required = ["hdb_2_room", "hdb_3_room", "hdb_4_room", "hdb_5_room", "condo_2br", "condo_3br"] as const;
    for (const key of required) {
      const template = TEMPLATES.find((candidate) => candidate.key === key)!;
      const d = instantiateFloor(template.floors[0]);
      for (const object of d.objects.filter((candidate) => candidate.kind === "furniture")) {
        expect(furniturePlacementIssues(d, object), `${key}: ${object.label}`).toEqual([]);
      }
    }
  });

  it("starts every required bed with its pillow end against a bedroom wall", () => {
    const required = ["hdb_2_room", "hdb_3_room", "hdb_4_room", "hdb_5_room", "condo_2br", "condo_3br"] as const;
    for (const key of required) {
      const d = instantiateFloor(TEMPLATES.find((candidate) => candidate.key === key)!.floors[0]);
      const beds = d.objects.filter((candidate) => candidate.furnitureType === "bed_double" || candidate.furnitureType === "bed_single");
      expect(beds.length, `${key}: furnished beds`).toBeGreaterThan(0);
      for (const bed of beds) {
        const centre = { x: bed.x + bed.width / 2, y: bed.y + bed.height / 2 };
        const bedroom = roomAt(d.rooms, centre)!;
        const radians = bed.rotation * Math.PI / 180;
        // Pillows are drawn along the local top edge, so this is the centre of the headboard.
        const headboard = {
          x: centre.x + Math.sin(radians) * bed.height / 2,
          y: centre.y - Math.cos(radians) * bed.height / 2,
        };
        const wallGap = Math.min(
          Math.abs(headboard.x - bedroom.x),
          Math.abs(headboard.x - (bedroom.x + bedroom.width)),
          Math.abs(headboard.y - bedroom.y),
          Math.abs(headboard.y - (bedroom.y + bedroom.height)),
        );
        expect(wallGap, `${key}: ${bedroom.name} headboard gap`).toBeLessThanOrEqual(10);
      }
    }
  });

  it("reports an overlap as a gentle furniture placement hint", () => {
    const sofa: PlanObject = { id: "sofa", kind: "furniture", assetId: null, furnitureType: "sofa", label: "Sofa", x: 60, y: 60, width: 120, height: 80, rotation: 0 };
    const table: PlanObject = { ...sofa, id: "table", furnitureType: "coffee_table", label: "Coffee table", x: 100 };
    const d = doc([room("living", 0, 0, 400, 300)], [sofa, table]);
    expect(furniturePlacementIssues(d, sofa)).toContain("overlap");
  });

  it("generates fresh ids on every instantiation", () => {
    const a = instantiateFloor(TEMPLATES[0].floors[0]);
    const b = instantiateFloor(TEMPLATES[0].floors[0]);
    expect(a.rooms[0].id).not.toBe(b.rooms[0].id);
  });
});
