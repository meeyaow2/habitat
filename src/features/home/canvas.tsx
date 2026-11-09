"use client";

import Konva from "konva";
import * as React from "react";
import { Circle, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Text, Transformer } from "react-konva";
import { toast } from "sonner";
import { category } from "@/lib/domain/categories";
import {
  add, angleDeg, clampOpening, DEFAULTS, dist, doorSymbol, dot, enclosedRegions, formatArea, formatLength, lerp, mul, nearestWall,
  openingConflicts, openingSpan, perp, pointAtLength, pointInPolygon, polygonArea, polygonCentroid, regionAt, roundPt, samePt, snapPoint, splitWallAt,
  sub, unit, wallDir, wallLength, wallSegments,
  type Geometry, type Opening, type OpeningKind, type Pt, type SnapResult, type Wall,
} from "./cad";
import { docBounds, furniturePlacementIssues, moveBoundaryCorner, moveRoom, moveWallBoundary, newId, objectBounds, roomLabelPlacement, roomPolygon, snapFurnitureToRoom, withPolygon, type FloorDoc, type PlanObject, type Rect as R } from "./model";
import { FURNITURE_FILL, FURNITURE_STROKE, PLAN, ROOM_FILL, ROOM_FILL_SELECTED } from "./palette";
import { iconImage } from "./icon-images";

Konva.dragDistance = 4;
Konva.hitOnDragEnabled = true;

export type Tool = "select" | "pan" | "wall" | "room" | "fill" | "door" | "window" | "opening" | "dimension" | "text" | "measure";
export type SelectionKind = "room" | "object" | "wall" | "opening" | "dimension" | "label";
export type Selection = { kind: SelectionKind; id: string } | null;
export type MarkerTone = "neutral" | "warning" | "danger";
export type MarkerInfo = { name: string; categoryId: string; tone: MarkerTone; reason: string | null };
export type LayerKey = "walls" | "openings" | "rooms" | "furniture" | "appliances" | "dimensions" | "labels" | "grid";
export type Layers = Record<LayerKey, boolean>;
export type DraftSettings = { wallThickness: number; snap: boolean; ortho: boolean; grid: boolean; layers: Layers };

export type CanvasHandle = {
  fit: () => void;
  zoomBy: (factor: number) => void;
  viewCentre: () => Pt;
  focusRect: (r: R) => void;
  /** Typed length while drawing walls/rooms/dimensions/measuring: place the next point. */
  applyLength: (cm: number) => boolean;
  finish: () => void;
  cancel: () => void;
  undoPoint: () => void;
  exportPng: () => string | null;
  isDrafting: () => boolean;
};

type Props = {
  doc: FloorDoc;
  editable: boolean;
  tool: Tool;
  settings: DraftSettings;
  extent: { width: number; height: number };
  selection: Selection;
  onSelect: (s: Selection) => void;
  onCommit: (doc: FloorDoc) => void;
  markers: Record<string, MarkerInfo>;
  onOpenAsset: (assetId: string) => void;
  onDropAsset: (assetId: string, p: Pt) => void;
  onCursor: (p: Pt | null, snap: SnapResult["kind"] | null) => void;
  onPrompt: (text: string) => void;
  onRequestText: (at: Pt) => void;
  onMeasure: (cm: number | null) => void;
  illustrative: boolean;
  height: number;
  ariaLabel: string;
  showMeasurements?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onDeleteSelection?: () => void;
};

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
const FONT = "Instrument Sans, system-ui, sans-serif";

const PROMPTS: Record<Tool, [string, string?]> = {
  select: ["Select an object to edit it · drag empty space to pan · W wall · R room · F fill room · D door · N window · M dimension · T text"],
  pan: ["Drag to pan · scroll or pinch to zoom"],
  wall: ["WALL  Specify start point", "WALL  Specify next point or type a length, then Enter · Enter/Esc to finish · Backspace removes the last wall"],
  fill: ["FILL ROOM  Click inside closed walls to make a room · click an existing room to fit it to its walls"],
  room: ["ROOM  Click the first corner", "ROOM  Click the next corner or type a length · click the first point or press Enter to close"],
  door: ["DOOR  Click a wall to place a door"],
  window: ["WINDOW  Click a wall to place a window"],
  opening: ["OPENING  Click a wall to place an opening"],
  dimension: ["DIMENSION  Specify the first point", "DIMENSION  Specify the second point or type a length"],
  text: ["TEXT  Click where the text should go"],
  measure: ["MEASURE  Specify the first point", "MEASURE  Specify the second point"],
};

export const PlanCanvas = React.forwardRef<CanvasHandle, Props>(function PlanCanvas(props, ref) {
  const { doc, editable, tool, settings, extent, selection, onSelect, onCommit, markers, onOpenAsset, onDropAsset, illustrative, height } = props;
  const g = doc.geometry;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<Konva.Stage>(null);
  const furnitureTransformerRef = React.useRef<Konva.Transformer>(null);
  const [width, setWidth] = React.useState(0);
  const [view, setView] = React.useState({ scale: 0.6, x: 40, y: 40 });
  const [cursor, setCursor] = React.useState<SnapResult | null>(null);
  // The in-progress shape is tagged with the tool that started it, so switching tools
  // never needs a reset (a reset could race with the next click).
  const [draftState, setDraftState] = React.useState<{ tool: Tool; pts: Pt[] }>({ tool: "select", pts: [] });
  const draft = draftState.tool === tool ? draftState.pts : [];
  const setDraft = (pts: Pt[] | ((prev: Pt[]) => Pt[])) =>
    setDraftState((prev) => ({ tool, pts: typeof pts === "function" ? pts(prev.tool === tool ? prev.pts : []) : pts }));
  /** Dimension tool: after two points, the next click sets the offset. */
  const dimOffsetStage = tool === "dimension" && draft.length === 2;
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<Geometry | null>(null);
  const [roomsPreview, setRoomsPreview] = React.useState<FloorDoc["rooms"] | null>(null);
  const [roomPreview, setRoomPreview] = React.useState<{ id: string; pts: Pt[] } | null>(null);
  const [spaceDown, setSpaceDown] = React.useState(false);
  const [, forceRender] = React.useReducer((n: number) => n + 1, 0);
  const fitted = React.useRef(false);
  const pinch = React.useRef<{ dist: number; centre: Pt } | null>(null);

  const drawing = editable && tool !== "select" && tool !== "pan";
  const selectedFurniture = selection?.kind === "object" ? doc.objects.find((object) => object.id === selection.id && object.kind === "furniture") ?? null : null;
  // Enclosed regions for the fill tool, recomputed only when walls change.
  const regions = React.useMemo(() => (editable && tool === "fill" ? enclosedRegions(g.walls) : []), [editable, tool, g.walls]);
  const geo = preview ?? g;
  const displayedRooms = roomsPreview ?? doc.rooms;
  const displayedDoc = roomsPreview || preview ? { ...doc, rooms: displayedRooms, geometry: geo } : doc;
  const L = settings.layers;
  const s = view.scale;
  const px = (n: number) => n / s;

  // ---------------------------------------------------------------- sizing & view
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitTo = React.useCallback(
    (r: R | null, maxScale = 1.4) => {
      if (!width) return;
      const target = r && r.width > 0 && r.height > 0 ? r : { x: 0, y: 0, width: extent.width, height: extent.height };
      const pad = width < 500 ? 28 : 64;
      const scale = clampScale(Math.min((width - pad * 2) / target.width, (height - pad * 2) / target.height, maxScale));
      setView({ scale, x: (width - target.width * scale) / 2 - target.x * scale, y: (height - target.height * scale) / 2 - target.y * scale });
    },
    [width, height, extent.width, extent.height],
  );

  const allBounds = React.useCallback(() => {
    const pts = [...g.walls.flatMap((w) => [w.a, w.b])];
    const b = docBounds(doc);
    if (pts.length === 0) return b;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const wb = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    if (!b) return wb;
    const x = Math.min(b.x, wb.x), y = Math.min(b.y, wb.y);
    return { x, y, width: Math.max(b.x + b.width, wb.x + wb.width) - x, height: Math.max(b.y + b.height, wb.y + wb.height) - y };
  }, [doc, g.walls]);

  const fit = React.useCallback(() => fitTo(allBounds()), [fitTo, allBounds]);

  React.useEffect(() => {
    if (width && !fitted.current) {
      fitted.current = true;
      fit();
    }
  }, [width, fit]);

  React.useEffect(() => {
    const transformer = furnitureTransformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    const node = selectedFurniture ? stage.findOne((candidate: Konva.Node) => candidate.id() === selectedFurniture.id) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedFurniture, doc.objects]);

  const zoomAround = React.useCallback((factor: number, point?: Pt) => {
    setView((v) => {
      const p = point ?? { x: width / 2, y: height / 2 };
      const scale = clampScale(v.scale * factor);
      const world = { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
      return { scale, x: p.x - world.x * scale, y: p.y - world.y * scale };
    });
  }, [width, height]);

  // ---------------------------------------------------------------- prompts
  React.useEffect(() => {
    const [first, next] = PROMPTS[editable ? tool : "select"];
    props.onPrompt(draft.length > 0 && next ? next : editable ? first : "View mode — select an item to see its details · switch to Edit to draw");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, draft.length, editable]);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => e.code === "Space" && !(e.target as HTMLElement).closest("input,textarea") && setSpaceDown(true);
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Changing tool abandons any half-drawn shape.

  // ---------------------------------------------------------------- snapping
  const snapCtx = React.useCallback(
    (from: Pt | null, exclude?: (w: Wall) => boolean) => ({
      walls: exclude ? geo.walls.filter((w) => !exclude(w)) : geo.walls,
      points: doc.rooms.flatMap((r) => roomPolygon(r)),
      grid: settings.grid ? 10 : 0,
      tolerance: px(12),
      from,
      ortho: settings.ortho,
      enabled: settings.snap ? undefined : { endpoint: false, midpoint: false, onWall: false, tracking: false },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geo.walls, doc.rooms, settings.grid, settings.snap, settings.ortho, s],
  );

  const worldPointer = (evt?: Event): Pt | null => {
    const stage = stageRef.current;
    // Read the position from the event itself when available: a fast first click can
    // arrive before Konva has recorded any pointer position.
    if (stage && evt) stage.setPointersPositions(evt);
    const p = stage?.getPointerPosition();
    if (!p) return null;
    return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
  };

  // ---------------------------------------------------------------- committing helpers
  const commitGeometry = (next: Geometry) => onCommit({ ...doc, geometry: next });

  const addWall = (a: Pt, b: Pt, snapB: SnapResult | null, snapA: SnapResult | null) => {
    if (dist(a, b) < 1) return;
    let next = g;
    // Join into existing walls at T-junctions.
    if (snapA?.kind === "on-wall" && snapA.wallId) next = splitWallAt(next, snapA.wallId, a, newId);
    if (snapB?.kind === "on-wall" && snapB.wallId) next = splitWallAt(next, snapB.wallId, b, newId);
    const wall: Wall = { id: newId(), a: roundPt(a), b: roundPt(b), thickness: settings.wallThickness };
    commitGeometry({ ...next, walls: [...next.walls, wall] });
  };

  const placeOpening = (kind: OpeningKind, p: Pt) => {
    const hit = nearestWall(g.walls, p, px(24) + 20);
    if (!hit) return false;
    const d = DEFAULTS[kind];
    // Doors swing into the room: probe both sides of the wall for an enclosed space.
    // Between two rooms (or with none) they swing to the side that was clicked.
    let flip = false;
    if (kind === "door") {
      const n = perp(wallDir(hit.wall));
      const at = add(hit.wall.a, mul(wallDir(hit.wall), hit.offset));
      const probe = (k: number) => add(at, mul(n, k * (hit.wall.thickness / 2 + 30)));
      let regions: ReturnType<typeof enclosedRegions> | null = null;
      const enclosed = (q: Pt) => doc.rooms.some((r) => pointInPolygon(q, roomPolygon(r))) || !!regionAt((regions ??= enclosedRegions(g.walls)), q);
      // flip=false puts the leaf on the -n side.
      const neg = enclosed(probe(-1)), pos = enclosed(probe(1));
      flip = neg === pos ? dot(sub(p, at), n) > 0 : pos;
    }
    const o: Opening = { id: newId(), wallId: hit.wall.id, kind, offset: hit.offset, width: d.width, flip, hingeEnd: false, height: d.height, sill: d.sill };
    const c = clampOpening(hit.wall, o);
    commitGeometry({ ...g, openings: [...g.openings, { ...o, ...c }] });
    onSelect({ kind: "opening", id: o.id });
    return true;
  };

  const closeRoom = (pts: Pt[]) => {
    if (pts.length < 3 || polygonArea(pts) < 2500) return;
    const room = withPolygon(
      { id: newId(), name: `Room ${doc.rooms.length + 1}`, roomType: "other" as const, x: 0, y: 0, width: 0, height: 0, sortOrder: doc.rooms.length },
      pts.map(roundPt),
    );
    onCommit({ ...doc, rooms: [...doc.rooms, room] });
    onSelect({ kind: "room", id: room.id });
  };

  /** Fill tool: turn the walled region under the cursor into a room, or refit the room already there. */
  const fillAt = (p: Pt) => {
    const region = regionAt(regions, p);
    const existing = [...doc.rooms].reverse().find((r) => pointInPolygon(p, roomPolygon(r)));
    if (existing) {
      onSelect({ kind: "room", id: existing.id });
      const cur = roomPolygon(existing);
      const same = region && region.pts.length === cur.length && region.pts.every((q) => cur.some((c) => samePt(c, q, 1)));
      const ratio = region ? region.area / Math.max(polygonArea(cur), 1) : 0;
      if (region && !same && ratio > 0.5 && ratio < 2) {
        onCommit({ ...doc, rooms: doc.rooms.map((r) => (r.id === existing.id ? withPolygon(r, region.pts) : r)) });
        toast.success(`${existing.name} now follows its walls`, { description: `${formatArea(region.area)} · Ctrl+Z to undo` });
      } else toast(`${existing.name} is already here`, { description: "It’s selected. Switch to Select (V) to edit it." });
      return;
    }
    if (!region) {
      toast.error("No closed boundary here", { description: "Walls need to go all the way round the space. Close any gaps, then click inside." });
      return;
    }
    closeRoom(region.pts);
  };

  const placePoint = (p: Pt, snap: SnapResult | null) => {
    if (tool === "wall") {
      if (draft.length === 0) return setDraft([p]);
      const last = draft[draft.length - 1];
      addWall(last, p, snap, null);
      if (draft.length > 1 && samePt(p, draft[0], 1)) return setDraft([]); // closed a loop
      setDraft([...draft, p]);
    } else if (tool === "room") {
      if (draft.length >= 3 && samePt(p, draft[0], px(10))) {
        closeRoom(draft);
        return setDraft([]);
      }
      setDraft([...draft, p]);
    } else if (tool === "dimension") {
      if (draft.length === 0) return setDraft([p]);
      if (draft.length === 1) {
        if (dist(draft[0], p) < 1) return;
        return setDraft([draft[0], p]);
      }
    } else if (tool === "measure") {
      if (draft.length === 0) {
        props.onMeasure(null);
        return setDraft([p]);
      }
      props.onMeasure(dist(draft[0], p));
      setDraft([]);
    }
  };

  React.useImperativeHandle(ref, () => ({
    fit,
    zoomBy: (f) => zoomAround(f),
    viewCentre: () => ({ x: (width / 2 - view.x) / view.scale, y: (height / 2 - view.y) / view.scale }),
    focusRect: (r) => fitTo({ x: r.x - 150, y: r.y - 150, width: r.width + 300, height: r.height + 300 }, 1.6),
    applyLength: (cm) => {
      if (!draft.length || !["wall", "room", "dimension", "measure"].includes(tool)) return false;
      const from = draft[draft.length - 1];
      const toward = cursor?.point && dist(cursor.point, from) > 0.5 ? cursor.point : add(from, { x: 1, y: 0 });
      const p = pointAtLength(from, toward, cm);
      placePoint(p, null);
      return true;
    },
    finish: () => {
      if (tool === "room" && draft.length >= 3) closeRoom(draft);
      setDraft([]);
    },
    cancel: () => {
      setDraft([]);
      props.onMeasure(null);
    },
    undoPoint: () => {
      if (tool === "wall" && draft.length > 1) {
        // Remove the last wall drawn in this chain.
        const last = draft[draft.length - 1], prev = draft[draft.length - 2];
        const w = [...g.walls].reverse().find((x) => samePt(x.a, prev) && samePt(x.b, last));
        if (w) commitGeometry({ ...g, walls: g.walls.filter((x) => x.id !== w.id), openings: g.openings.filter((o) => o.wallId !== w.id) });
      }
      setDraft((d) => d.slice(0, -1));
    },
    exportPng: () => stageRef.current?.toDataURL({ pixelRatio: 2, mimeType: "image/png" }) ?? null,
    isDrafting: () => draft.length > 0,
  }));

  // Test hook: lets browser automation locate canvas nodes and convert coordinates.
  React.useEffect(() => {
    (window as unknown as { __habitatStage?: Konva.Stage | null; __habitatView?: typeof view }).__habitatStage = stageRef.current;
    (window as unknown as { __habitatView?: typeof view }).__habitatView = view;
  });

  // ---------------------------------------------------------------- stage events
  const onMouseMove = (e?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const p = worldPointer(e?.evt);
    if (!p) return;
    if (!drawing) {
      props.onCursor(p, null);
      return;
    }
    let from: Pt | null = draft.length ? draft[draft.length - 1] : null;
    if (tool === "dimension" && dimOffsetStage) from = null;
    const snap = tool === "door" || tool === "window" || tool === "opening" || tool === "fill" ? { point: p, kind: "none" as const, guides: [] } : snapPoint(p, snapCtx(from));
    setCursor(snap);
    props.onCursor(snap.point, snap.kind);
  };

  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if ("button" in e.evt && e.evt.button !== 0) return;
    if (drawing) {
      const p = worldPointer(e.evt);
      if (!p) return;
      if (tool === "door" || tool === "window" || tool === "opening") return void placeOpening(tool, p);
      if (tool === "fill") return fillAt(p);
      if (tool === "text") return props.onRequestText(roundPt(snapPoint(p, snapCtx(null)).point));
      if (tool === "dimension" && dimOffsetStage && draft.length === 2) {
        const [a, b] = draft;
        const n = perp(unit(sub(b, a)));
        const offset = Math.round(projectSigned(p, a, n));
        commitGeometry({ ...g, dimensions: [...g.dimensions, { id: newId(), a, b, offset: offset || 40 }] });
        setDraft([]);
        return;
      }
      const from = draft.length ? draft[draft.length - 1] : null;
      const snap = snapPoint(p, snapCtx(from));
      return placePoint(snap.point, snap);
    }
    if (e.target === e.target.getStage() || e.target.name() === "backdrop") onSelect(null);
  };

  // Double-click finishes a chain — but only once there is something to finish. (Konva
  // reports any two quick clicks on the stage as a double-click, including the first click
  // of a new wall right after another click.)
  const onDblClick = () => {
    if (tool === "wall" && draft.length >= 3) setDraft([]);
    if (tool === "room" && draft.length >= 4) {
      closeRoom(draft.slice(0, -1));
      setDraft([]);
    }
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pointer = stageRef.current!.getPointerPosition() ?? { x: width / 2, y: height / 2 };
    if (e.evt.ctrlKey || e.evt.metaKey) zoomAround(Math.exp(-e.evt.deltaY * 0.01), pointer);
    else setView((v) => ({ ...v, x: v.x - e.evt.deltaX, y: v.y - e.evt.deltaY }));
  };

  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (t.length !== 2) return onMouseMove(e);
    e.evt.preventDefault();
    const stage = stageRef.current!;
    if (stage.isDragging()) stage.stopDrag();
    const rect = stage.container().getBoundingClientRect();
    const a = { x: t[0].clientX - rect.left, y: t[0].clientY - rect.top };
    const b = { x: t[1].clientX - rect.left, y: t[1].clientY - rect.top };
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (pinch.current) {
      zoomAround(d / pinch.current.dist, centre);
      setView((v) => ({ ...v, x: v.x + centre.x - pinch.current!.centre.x, y: v.y + centre.y - pinch.current!.centre.y }));
    }
    pinch.current = { dist: d, centre };
  };

  const stageDraggable = !drawing || spaceDown;

  // react-konva applies new event handlers through its own reconciler, which can lag a
  // render by a moment; route stage events through a ref so the latest logic always runs.
  const latest = React.useRef({ onStageClick, onMouseMove, onDblClick, onTouchMove });
  React.useLayoutEffect(() => {
    latest.current = { onStageClick, onMouseMove, onDblClick, onTouchMove };
  });
  const stageHandlers = React.useMemo(
    () => ({
      onClick: (e: Konva.KonvaEventObject<MouseEvent>) => latest.current.onStageClick(e),
      onTap: (e: Konva.KonvaEventObject<TouchEvent>) => latest.current.onStageClick(e),
      onMouseMove: (e: Konva.KonvaEventObject<MouseEvent>) => latest.current.onMouseMove(e),
      onTouchMove: (e: Konva.KonvaEventObject<TouchEvent>) => latest.current.onTouchMove(e),
      onDblClick: () => latest.current.onDblClick(),
      onDblTap: () => latest.current.onDblClick(),
    }),
    [],
  );

  // ---------------------------------------------------------------- element handlers (select mode)
  const selectable = editable && tool === "select";
  const isSel = (kind: SelectionKind, id: string) => selection?.kind === kind && selection.id === id;

  const clearBoundaryPreview = () => {
    setPreview(null);
    setRoomsPreview(null);
    setCursor(null);
  };

  const commitBoundaryEdit = (candidate: FloorDoc) => {
    const conflict = openingConflicts(candidate.geometry)[0];
    clearBoundaryPreview();
    if (conflict) {
      const name = conflict.opening.kind === "window" ? "window" : conflict.opening.kind === "door" ? "door" : "opening";
      toast.error(`This wall is too short for its ${name}`, {
        description: `It needs at least ${formatLength(conflict.requiredLength, { precise: true })}. Widen the wall or reduce the ${name} width first.`,
      });
      return;
    }
    onCommit(candidate);
  };

  const cornerDrag = (from: Pt) => ({
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
      const raw = { x: e.target.x(), y: e.target.y() };
      const snap = snapPoint(raw, snapCtx(null, (w) => samePt(w.a, from) || samePt(w.b, from)));
      e.target.position(snap.point);
      setCursor(snap);
      const candidate = moveBoundaryCorner(doc, from, snap.point);
      setPreview(candidate.geometry);
      setRoomsPreview(candidate.rooms);
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;
      const to = roundPt({ x: e.target.x(), y: e.target.y() });
      commitBoundaryEdit(moveBoundaryCorner(doc, from, to));
    },
  });

  // ---------------------------------------------------------------- render helpers
  const wallById = new Map(geo.walls.map((w) => [w.id, w]));

  const renderWall = (w: Wall) => {
    const d = wallDir(w);
    const n = mul(perp(d), w.thickness / 2);
    const Lw = wallLength(w);
    const sel = isSel("wall", w.id);
    const segs = wallSegments(w, geo.openings);
    const colour = sel ? PLAN.accent : PLAN.wall;
    const wallSelectable = selectable && !w.locked;
    const baseWall = g.walls.find((candidate) => candidate.id === w.id) ?? w;
    const baseDirection = wallDir(baseWall);
    const normal = perp(baseDirection);
    const baseMid = lerp(baseWall.a, baseWall.b, 0.5);
    const wallDragDelta = (node: Konva.Node, origin: Pt) => {
      const raw = { x: node.x() - origin.x, y: node.y() - origin.y };
      return mul(normal, dot(raw, normal));
    };
    const previewWallDrag = (e: Konva.KonvaEventObject<DragEvent>, origin: Pt) => {
      const delta = wallDragDelta(e.target, origin);
      e.target.position(add(origin, delta));
      const candidate = moveWallBoundary(doc, baseWall.id, delta.x, delta.y);
      setPreview(candidate.geometry);
      setRoomsPreview(candidate.rooms);
    };
    const finishWallDrag = (e: Konva.KonvaEventObject<DragEvent>, origin: Pt) => {
      e.cancelBubble = true;
      const delta = wallDragDelta(e.target, origin);
      e.target.position(origin);
      commitBoundaryEdit(moveWallBoundary(doc, baseWall.id, Math.round(delta.x), Math.round(delta.y)));
    };
    const wallCursor = Math.abs(baseDirection.x) > 0.9 ? "ns-resize" : Math.abs(baseDirection.y) > 0.9 ? "ew-resize" : "move";
    return (
      <Group key={w.id}>
        {segs.map(([t0, t1], i) => {
          // Extend real wall ends by half the thickness so corners close; not at opening edges.
          const e0 = t0 <= 0.01 ? -w.thickness / 2 : t0;
          const e1 = t1 >= Lw - 0.01 ? Lw + w.thickness / 2 : t1;
          const a = add(w.a, mul(d, e0));
          const b = add(w.a, mul(d, e1));
          const pts = [add(a, n), add(b, n), sub(b, n), sub(a, n)];
          return <Line key={i} points={pts.flatMap((p) => [p.x, p.y])} closed fill={colour} stroke={colour} strokeWidth={px(0.5)} listening={false} />;
        })}
        {/* Hit area spans the whole wall (including openings) */}
        <Line
          id={w.id}
          points={[w.a.x, w.a.y, w.b.x, w.b.y]}
          stroke="transparent"
          strokeWidth={Math.max(w.thickness, px(14))}
          hitStrokeWidth={Math.max(w.thickness, px(14))}
          listening={wallSelectable || !editable}
          draggable={wallSelectable && sel}
          onClick={() => wallSelectable && onSelect({ kind: "wall", id: w.id })}
          onTap={() => wallSelectable && onSelect({ kind: "wall", id: w.id })}
          onMouseEnter={(e) => wallSelectable && (e.target.getStage()!.container().style.cursor = sel ? wallCursor : "pointer")}
          onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = "")}
          onDragMove={(e) => previewWallDrag(e, { x: 0, y: 0 })}
          onDragEnd={(e) => finishWallDrag(e, { x: 0, y: 0 })}
        />
        {sel && wallSelectable && (
          <>
            <LengthTag a={w.a} b={w.b} offset={w.thickness / 2 + px(16)} px={px} text={formatLength(Lw, { precise: true })} />
            <Rect
              x={baseMid.x}
              y={baseMid.y}
              offsetX={px(9)}
              offsetY={px(9)}
              width={px(18)}
              height={px(18)}
              cornerRadius={px(5)}
              fill={PLAN.accent}
              stroke={PLAN.white}
              strokeWidth={px(2)}
              draggable
              onDragMove={(e) => previewWallDrag(e, baseMid)}
              onDragEnd={(e) => finishWallDrag(e, baseMid)}
              onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = wallCursor)}
              onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = "")}
            />
            {[w.a, w.b].map((p, i) => (
              <Rect key={i} x={p.x} y={p.y} offsetX={px(6)} offsetY={px(6)} width={px(12)} height={px(12)} fill={PLAN.white} stroke={PLAN.accent} strokeWidth={px(2)} draggable {...cornerDrag(p)} onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = "crosshair")} onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = "")} />
            ))}
          </>
        )}
      </Group>
    );
  };

  const renderOpening = (o: Opening) => {
    const w = wallById.get(o.wallId);
    if (!w) return null;
    const { start, end } = openingSpan(w, o);
    const d = wallDir(w);
    const half = w.thickness / 2;
    const sel = isSel("opening", o.id);
    const col = sel ? PLAN.accent : PLAN.wall;
    const hitPts = [add(start, mul(perp(d), half + px(4))), add(end, mul(perp(d), half + px(4))), sub(end, mul(perp(d), half + px(4))), sub(start, mul(perp(d), half + px(4)))];
    return (
      <Group key={o.id}>
        {o.kind === "window" && (
          <>
            <Line points={[...flat(add(start, mul(perp(d), half))), ...flat(add(end, mul(perp(d), half))), ...flat(sub(end, mul(perp(d), half))), ...flat(sub(start, mul(perp(d), half)))]} closed fill="#ffffff" stroke={col} strokeWidth={px(1.25)} listening={false} />
            <Line points={[...flat(start), ...flat(end)]} stroke={col} strokeWidth={px(1.25)} listening={false} />
          </>
        )}
        {o.kind === "door" && (() => {
          const sym = doorSymbol(w, o);
          const jamb = (p: Pt, k: string) => <Line key={k} points={[...flat(add(p, mul(perp(d), half))), ...flat(sub(p, mul(perp(d), half)))]} stroke={col} strokeWidth={px(1.5)} listening={false} />;
          return (
            <>
              {sym.leaves.length === 1 ? jamb(sym.leaves[0].hinge, "j") : [jamb(start, "j0"), jamb(end, "j1")]}
              {sym.leaves.map((lf, i) => (
                <React.Fragment key={`l${i}`}>
                  <Line points={[...flat(lf.hinge), ...flat(lf.tip)]} stroke={col} strokeWidth={px(2)} listening={false} />
                  <Shape
                    listening={false}
                    stroke={col}
                    strokeWidth={px(1)}
                    dash={[px(4), px(3)]}
                    sceneFunc={(ctx, shape) => {
                      const a0 = Math.atan2(lf.closed.y - lf.hinge.y, lf.closed.x - lf.hinge.x);
                      const a1 = Math.atan2(lf.tip.y - lf.hinge.y, lf.tip.x - lf.hinge.x);
                      let delta = a1 - a0;
                      while (delta > Math.PI) delta -= 2 * Math.PI;
                      while (delta < -Math.PI) delta += 2 * Math.PI;
                      ctx.beginPath();
                      ctx.arc(lf.hinge.x, lf.hinge.y, lf.radius, a0, a1, delta < 0);
                      ctx.strokeShape(shape);
                    }}
                  />
                </React.Fragment>
              ))}
              {sym.panels.map((pn, i) => (
                <Line
                  key={`p${i}`}
                  points={pn.pts.flatMap((q) => [q.x, q.y])}
                  closed
                  fill="#ffffff"
                  stroke={col}
                  strokeWidth={px(pn.hidden ? 1 : 1.5)}
                  dash={pn.hidden ? [px(4), px(3)] : undefined}
                  listening={false}
                />
              ))}
            </>
          );
        })()}
        {o.kind === "opening" && (
          <>
            <Line points={[...flat(add(start, mul(perp(d), half))), ...flat(sub(start, mul(perp(d), half)))]} stroke={col} strokeWidth={px(1.5)} listening={false} />
            <Line points={[...flat(add(end, mul(perp(d), half))), ...flat(sub(end, mul(perp(d), half)))]} stroke={col} strokeWidth={px(1.5)} listening={false} />
            <Line points={[...flat(start), ...flat(end)]} stroke={col} strokeWidth={px(1)} dash={[px(5), px(4)]} listening={false} />
          </>
        )}
        <Line
          id={o.id}
          points={hitPts.flatMap((p) => [p.x, p.y])}
          closed
          fill={sel ? "rgba(66,99,79,0.12)" : "transparent"}
          listening={selectable}
          draggable={selectable && sel}
          dragBoundFunc={(pos) => {
            // Slide only along the wall: project the drag onto the wall direction (screen space).
            const base = { x: view.x, y: view.y };
            const t = dot2(sub(pos, base), d);
            return add(base, mul(d, t));
          }}
          onDragMove={(e) => {
            const shift = { x: e.target.x(), y: e.target.y() };
            const offset = o.offset + dot2(shift, d);
            setPreview({ ...g, openings: g.openings.map((x) => (x.id === o.id ? { ...x, ...clampOpening(w, { ...x, offset }) } : x)) });
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            const shift = { x: e.target.x(), y: e.target.y() };
            e.target.position({ x: 0, y: 0 });
            const offset = Math.round(o.offset + dot2(shift, d));
            setPreview(null);
            commitGeometry({ ...g, openings: g.openings.map((x) => (x.id === o.id ? { ...x, ...clampOpening(w, { ...x, offset }) } : x)) });
          }}
          onClick={() => onSelect({ kind: "opening", id: o.id })}
          onTap={() => onSelect({ kind: "opening", id: o.id })}
          onMouseEnter={(e) => selectable && (e.target.getStage()!.container().style.cursor = sel ? "ew-resize" : "pointer")}
          onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = "")}
        />
      </Group>
    );
  };

  const renderRoom = (room: FloorDoc["rooms"][number]) => {
    const pts = roomPreview?.id === room.id ? roomPreview.pts : roomPolygon(room);
    const sel = isSel("room", room.id);
    const roomSelectable = selectable && !room.locked;
    return (
      <Group key={room.id}>
        <Line
          id={room.id}
          points={pts.flatMap((p) => [p.x, p.y])}
          closed
          fill={sel ? ROOM_FILL_SELECTED : ROOM_FILL[room.roomType] ?? ROOM_FILL.other}
          stroke={sel ? PLAN.accent : g.walls.length ? "transparent" : PLAN.wall}
          strokeWidth={sel ? px(2) : g.walls.length ? 0 : 6}
          dash={sel ? [px(6), px(4)] : undefined}
          listening={roomSelectable || !editable}
          draggable={roomSelectable && sel}
          onClick={() => roomSelectable && onSelect({ kind: "room", id: room.id })}
          onTap={() => roomSelectable && onSelect({ kind: "room", id: room.id })}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            const dx = Math.round(e.target.x()), dy = Math.round(e.target.y());
            e.target.position({ x: 0, y: 0 });
            onCommit({ ...doc, rooms: doc.rooms.map((r) => (r.id === room.id ? moveRoom(r, dx, dy) : r)) });
          }}
        />
        {sel && roomSelectable &&
          pts.map((p, i) => (
            <Circle
              key={i}
              x={p.x}
              y={p.y}
              radius={px(6)}
              fill={PLAN.white}
              stroke={PLAN.accent}
              strokeWidth={px(2)}
              draggable
              onDragMove={(e) => {
                const snap = snapPoint({ x: e.target.x(), y: e.target.y() }, snapCtx(null));
                e.target.position(snap.point);
                setCursor(snap);
                setRoomPreview({ id: room.id, pts: pts.map((q, j) => (j === i ? snap.point : q)) });
              }}
              onDragEnd={(e) => {
                e.cancelBubble = true;
                const next = pts.map((q, j) => (j === i ? roundPt({ x: e.target.x(), y: e.target.y() }) : q));
                setRoomPreview(null);
                setCursor(null);
                onCommit({ ...doc, rooms: doc.rooms.map((r) => (r.id === room.id ? withPolygon(r, next) : r)) });
              }}
            />
          ))}
      </Group>
    );
  };

  const renderRoomLabel = (room: FloorDoc["rooms"][number]) => {
    if (!L.rooms || room.width * s < 42 || room.height * s < 24) return null;
    const placement = roomLabelPlacement(doc, room);
    const selected = isSel("room", room.id);
    const labelSize = placement.compact ? Math.min(px(11), 42) : Math.min(px(13), 52);
    const showArea = !placement.compact || selected;
    const boxHeight = showArea ? labelSize * 2.15 : labelSize * 1.25;
    return (
      <Group key={`room-label-${room.id}`} listening={false}>
        {placement.outside && placement.leader && <Line points={[placement.x, placement.y + boxHeight / 2, placement.leader.x, placement.leader.y]} stroke={PLAN.labelMuted} strokeWidth={px(1)} />}
        <Group id={`room-label-${room.id}`} name="room-label" x={placement.x} y={placement.y}>
          <Rect x={-placement.width / 2} y={-boxHeight / 2} width={placement.width} height={boxHeight} cornerRadius={px(3)} fill={PLAN.bg} opacity={0.84} />
          <Text text={room.name} x={-placement.width / 2} y={showArea ? -labelSize * 0.9 : -labelSize * 0.55} width={placement.width} align="center" fontSize={labelSize} fontStyle="600" fill={PLAN.label} fontFamily={FONT} wrap="none" ellipsis />
          {showArea && <Text text={`${illustrative ? "≈ " : ""}${formatArea(polygonArea(roomPolygon(room)))}`} x={-placement.width / 2} y={labelSize * 0.25} width={placement.width} align="center" fontSize={labelSize * 0.8} fill={PLAN.labelMuted} fontFamily={FONT} />}
        </Group>
      </Group>
    );
  };

  const renderRoomMeasurements = (room: FloorDoc["rooms"][number]) => {
    const top = room.y - px(24);
    const left = room.x - px(24);
    const colour = PLAN.accent;
    return <Group key={`room-measure-${room.id}`} listening={false}>
      <Line points={[room.x, top, room.x + room.width, top]} stroke={colour} strokeWidth={px(1)} />
      <Line points={[room.x, top - px(4), room.x, top + px(4), room.x + room.width, top - px(4), room.x + room.width, top + px(4)]} stroke={colour} strokeWidth={px(1)} />
      <Text text={`≈ ${formatLength(room.width, { precise: true })}`} x={room.x} y={top - px(18)} width={room.width} align="center" fontSize={px(10)} fontStyle="600" fill={colour} fontFamily={FONT} />
      <Line points={[left, room.y, left, room.y + room.height]} stroke={colour} strokeWidth={px(1)} />
      <Line points={[left - px(4), room.y, left + px(4), room.y, left - px(4), room.y + room.height, left + px(4), room.y + room.height]} stroke={colour} strokeWidth={px(1)} />
      <Text text={`≈ ${formatLength(room.height, { precise: true })}`} x={left - px(15)} y={room.y + room.height} width={room.height} rotation={-90} align="center" fontSize={px(10)} fontStyle="600" fill={colour} fontFamily={FONT} />
    </Group>;
  };

  const renderDimension = (d: Geometry["dimensions"][number], key: string, draftMode = false) => {
    const n = perp(unit(sub(d.b, d.a)));
    const a = add(d.a, mul(n, d.offset));
    const b = add(d.b, mul(n, d.offset));
    const sel = !draftMode && isSel("dimension", d.id);
    const col = sel ? PLAN.accent : "#4b5a52";
    const tick = (p: Pt) => {
      const t = mul(unit(add(unit(sub(b, a)), n)), px(6));
      return [p.x - t.x, p.y - t.y, p.x + t.x, p.y + t.y];
    };
    const mid = lerp(a, b, 0.5);
    let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (ang > 90 || ang < -90) ang += 180;
    const text = formatLength(dist(d.a, d.b), { precise: true });
    return (
      <Group key={key} listening={!draftMode && selectable} onClick={() => onSelect({ kind: "dimension", id: d.id })} onTap={() => onSelect({ kind: "dimension", id: d.id })}>
        <Line points={[d.a.x, d.a.y, a.x + n.x * px(4) * Math.sign(d.offset || 1), a.y + n.y * px(4) * Math.sign(d.offset || 1)]} stroke={col} strokeWidth={px(0.75)} />
        <Line points={[d.b.x, d.b.y, b.x + n.x * px(4) * Math.sign(d.offset || 1), b.y + n.y * px(4) * Math.sign(d.offset || 1)]} stroke={col} strokeWidth={px(0.75)} />
        <Line points={[a.x, a.y, b.x, b.y]} stroke={col} strokeWidth={px(1)} hitStrokeWidth={px(12)} />
        <Line points={tick(a)} stroke={col} strokeWidth={px(1.5)} />
        <Line points={tick(b)} stroke={col} strokeWidth={px(1.5)} />
        <Group x={mid.x} y={mid.y} rotation={ang}>
          <Rect x={-px(text.length * 3.4 + 4)} y={-px(17)} width={px(text.length * 6.8 + 8)} height={px(14)} fill={PLAN.bg} opacity={0.9} />
          <Text text={text} x={-px(80)} width={px(160)} y={-px(16)} align="center" fontSize={px(11)} fontStyle="600" fill={col} fontFamily={FONT} />
        </Group>
      </Group>
    );
  };

  // ---------------------------------------------------------------- draft preview
  const renderDraft = () => {
    if (!drawing || !cursor) return null;
    const p = cursor.point;
    const nodes: React.ReactNode[] = [];
    const last = draft[draft.length - 1];
    if ((tool === "wall" || tool === "measure" || (tool === "dimension" && !dimOffsetStage)) && last) {
      if (tool === "wall") {
        const tmp: Wall = { id: "draft", a: last, b: p, thickness: settings.wallThickness };
        const n = mul(perp(wallDir(tmp)), tmp.thickness / 2);
        nodes.push(<Line key="dw" points={[...flat(add(last, n)), ...flat(add(p, n)), ...flat(sub(p, n)), ...flat(sub(last, n))]} closed fill="rgba(66,99,79,0.35)" stroke={PLAN.accent} strokeWidth={px(1)} listening={false} />);
      } else {
        nodes.push(<Line key="dl" points={[...flat(last), ...flat(p)]} stroke={PLAN.accent} strokeWidth={px(1.5)} dash={[px(6), px(4)]} listening={false} />);
      }
      nodes.push(<LengthTag key="dt" a={last} b={p} offset={px(18)} px={px} text={`${formatLength(dist(last, p), { precise: true })} · ${Math.round(angleDeg(last, p))}°`} />);
    }
    if (tool === "room" && draft.length) {
      const pts = [...draft, p];
      nodes.push(<Line key="dr" points={pts.flatMap((q) => [q.x, q.y])} closed={draft.length >= 2} fill="rgba(66,99,79,0.12)" stroke={PLAN.accent} strokeWidth={px(1.5)} dash={[px(6), px(4)]} listening={false} />);
      nodes.push(<LengthTag key="dt" a={last} b={p} offset={px(18)} px={px} text={formatLength(dist(last, p), { precise: true })} />);
      if (draft.length >= 3) nodes.push(<Circle key="close" x={draft[0].x} y={draft[0].y} radius={px(8)} stroke={PLAN.accent} strokeWidth={px(2)} listening={false} />);
      if (draft.length >= 2) nodes.push(<Text key="ar" x={p.x + px(14)} y={p.y + px(10)} text={formatArea(polygonArea(pts))} fontSize={px(11)} fill={PLAN.accent} fontStyle="600" fontFamily={FONT} listening={false} />);
    }
    if (tool === "fill") {
      const r = regionAt(regions, p);
      if (r) {
        const c = polygonCentroid(r.pts);
        nodes.push(<Line key="fr" points={r.pts.flatMap((q) => [q.x, q.y])} closed fill="rgba(66,99,79,0.16)" stroke={PLAN.accent} strokeWidth={px(2)} dash={[px(6), px(4)]} listening={false} />);
        nodes.push(<Text key="fa" x={c.x - px(60)} y={c.y - px(7)} width={px(120)} align="center" text={formatArea(r.area)} fontSize={px(13)} fill={PLAN.accent} fontStyle="600" fontFamily={FONT} listening={false} />);
      }
    }
    if (tool === "dimension" && dimOffsetStage && draft.length === 2) {
      const [a, b] = draft;
      const n = perp(unit(sub(b, a)));
      nodes.push(renderDimension({ id: "draft", a, b, offset: Math.round(projectSigned(p, a, n)) || 40 }, "dd", true));
    }
    if (tool === "door" || tool === "window" || tool === "opening") {
      const hit = nearestWall(g.walls, p, px(24) + 20);
      if (hit) {
        const d = DEFAULTS[tool];
        const c = clampOpening(hit.wall, { offset: hit.offset, width: d.width });
        const sp = openingSpan(hit.wall, c);
        nodes.push(<Line key="op" points={[...flat(sp.start), ...flat(sp.end)]} stroke={PLAN.accent} strokeWidth={hit.wall.thickness + px(4)} opacity={0.5} listening={false} />);
        nodes.push(<LengthTag key="opt" a={sp.start} b={sp.end} offset={hit.wall.thickness / 2 + px(14)} px={px} text={`${tool} ${formatLength(d.width, { precise: true })}`} />);
      }
    }
    // Snap marker and tracking guides
    for (const [i, gd] of cursor.guides.entries()) {
      nodes.push(<Line key={`g${i}`} points={[gd.a.x, gd.a.y, gd.b.x, gd.b.y]} stroke={PLAN.guide} strokeWidth={px(1)} dash={[px(3), px(4)]} opacity={0.8} listening={false} />);
    }
    nodes.push(<SnapGlyph key="snap" p={p} kind={cursor.kind} px={px} />);
    draft.forEach((q, i) => nodes.push(<Circle key={`dp${i}`} x={q.x} y={q.y} radius={px(3)} fill={PLAN.accent} listening={false} />));
    return nodes;
  };

  // ---------------------------------------------------------------- furniture & markers (as before)
  const objectDragEnd = (o: PlanObject) => (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    const node = e.target;
    const x = Math.round(node.x() - o.width / 2);
    const y = Math.round(node.y() - o.height / 2);
    const next = e.evt.altKey ? { x, y } : snapFurnitureToRoom(doc, o, x, y);
    node.position({ x: next.x + o.width / 2, y: next.y + o.height / 2 });
    onCommit({ ...doc, objects: doc.objects.map((p) => (p.id === o.id ? { ...p, ...next } : p)) });
  };

  const objectTransformEnd = (o: PlanObject) => (e: Konva.KonvaEventObject<Event>) => {
    e.cancelBubble = true;
    const node = e.target;
    const width = Math.max(20, Math.round(o.width * Math.abs(node.scaleX())));
    const height = Math.max(20, Math.round(o.height * Math.abs(node.scaleY())));
    const rotation = ((Math.round((o.rotation + node.rotation()) / 90) * 90) % 360 + 360) % 360;
    const x = Math.round(node.x() - width / 2);
    const y = Math.round(node.y() - height / 2);
    node.scale({ x: 1, y: 1 });
    node.rotation(0);
    onCommit({ ...doc, objects: doc.objects.map((candidate) => candidate.id === o.id ? { ...candidate, x, y, width, height, rotation } : candidate) });
  };

  const labelSize = (n: number) => n;

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={props.ariaLabel}
      aria-roledescription="floor plan drawing"
      tabIndex={0}
      onKeyDown={props.onKeyDown}
      onMouseLeave={() => {
        setCursor(null);
        props.onCursor(null, null);
      }}
      onDragOver={(e) => {
        if (editable && e.dataTransfer.types.includes("application/x-habitat-asset")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(e) => {
        const assetId = e.dataTransfer.getData("application/x-habitat-asset");
        const stage = stageRef.current;
        if (!assetId || !stage || !editable) return;
        e.preventDefault();
        stage.setPointersPositions(e.nativeEvent);
        const p = stage.getPointerPosition();
        if (p) onDropAsset(assetId, { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale });
      }}
      className="relative w-full touch-none select-none overflow-hidden bg-[var(--plan-bg)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      style={{ height, cursor: drawing && !spaceDown ? "crosshair" : undefined }}
    >
      {width > 0 && (
        <Stage
          ref={stageRef}
          width={width}
          height={height}
          scaleX={s}
          scaleY={s}
          x={view.x}
          y={view.y}
          draggable={stageDraggable}
          onDragEnd={(e) => {
            if (e.target === e.target.getStage()) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }}
          onWheel={onWheel}
          {...stageHandlers}
          onTouchEnd={() => (pinch.current = null)}
        >
          <Layer listening={false}>
            <Rect name="backdrop" x={-5000} y={-5000} width={extent.width + 10000} height={extent.height + 10000} fill={PLAN.bg} />
            {L.grid && s > 0.18 && <GridShape extent={extent} step={50} colour={PLAN.grid} />}
            {L.grid && <GridShape extent={extent} step={100} colour={PLAN.gridMajor} />}
          </Layer>

          <Layer listening={!drawing}>
            {L.rooms && doc.rooms.map(renderRoom)}

            {L.furniture &&
              doc.objects.filter((o) => o.kind !== "asset").map((o) => {
                const sel = isSel("object", o.id);
                const b = objectBounds(o);
                const issues = furniturePlacementIssues(doc, o);
                return (
                  <Group
                    key={o.id}
                    id={o.id}
                    x={o.x + o.width / 2}
                    y={o.y + o.height / 2}
                    draggable={selectable}
                    listening={selectable}
                    onDragStart={() => onSelect({ kind: "object", id: o.id })}
                    onDragEnd={objectDragEnd(o)}
                    onTransformEnd={objectTransformEnd(o)}
                    onClick={() => onSelect({ kind: "object", id: o.id })}
                    onTap={() => onSelect({ kind: "object", id: o.id })}
                    onMouseEnter={(e) => {
                      setHovered(o.id);
                      e.target.getStage()!.container().style.cursor = "move";
                    }}
                    onMouseLeave={(e) => {
                      setHovered(null);
                      e.target.getStage()!.container().style.cursor = "";
                    }}
                  >
                    <Group rotation={o.rotation} offsetX={o.width / 2} offsetY={o.height / 2}>
                      <Rect width={o.width} height={o.height} cornerRadius={6} fill={FURNITURE_FILL} stroke={issues.length ? PLAN.warning : sel ? PLAN.accent : FURNITURE_STROKE} strokeWidth={issues.length || sel ? px(2) : px(1.25)} dash={issues.length ? [px(5), px(4)] : undefined} opacity={editable ? 1 : 0.85} />
                      <FurnitureDetail o={o} />
                      {issues.length > 0 && <Circle x={o.width - px(7)} y={px(7)} radius={px(4)} fill={PLAN.warning} stroke={PLAN.white} strokeWidth={px(1.5)} listening={false} />}
                    </Group>
                    {(hovered === o.id || sel) && b.width * s > 54 && b.height * s > 16 && (
                      <Text text={o.label ?? ""} x={-b.width / 2} y={-b.height / 2} width={b.width} height={b.height} align="center" verticalAlign="middle" fontSize={Math.min(px(11), b.height * 0.4)} fill={PLAN.labelMuted} fontFamily={FONT} wrap="none" ellipsis listening={false} />
                    )}
                  </Group>
                );
              })}

            {L.walls && geo.walls.map(renderWall)}
            {L.openings && geo.openings.map(renderOpening)}
            {L.dimensions && geo.dimensions.map((d) => renderDimension(d, d.id))}
            {doc.rooms.map(renderRoomLabel)}
            {(props.showMeasurements ? doc.rooms : selection?.kind === "room" ? doc.rooms.filter((room) => room.id === selection.id) : []).map(renderRoomMeasurements)}
            {L.labels &&
              geo.labels.map((lb) => (
                <Text
                  key={lb.id}
                  id={lb.id}
                  x={lb.at.x}
                  y={lb.at.y}
                  text={lb.text}
                  fontSize={labelSize(lb.size)}
                  fontStyle="600"
                  fill={isSel("label", lb.id) ? PLAN.accent : PLAN.label}
                  fontFamily={FONT}
                  listening={selectable}
                  draggable={selectable && isSel("label", lb.id)}
                  onClick={() => onSelect({ kind: "label", id: lb.id })}
                  onTap={() => onSelect({ kind: "label", id: lb.id })}
                  onDragEnd={(e) => {
                    e.cancelBubble = true;
                    commitGeometry({ ...g, labels: g.labels.map((x) => (x.id === lb.id ? { ...x, at: roundPt({ x: e.target.x(), y: e.target.y() }) } : x)) });
                  }}
                />
              ))}
          </Layer>

          <Layer listening={!drawing}>
            {editable && selectedFurniture && (
              <>
                <Transformer
                  ref={furnitureTransformerRef}
                  enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
                  keepRatio={false}
                  flipEnabled={false}
                  rotateEnabled
                  rotationSnaps={[0, 90, 180, 270]}
                  rotationSnapTolerance={45}
                  anchorSize={px(10)}
                  anchorCornerRadius={px(3)}
                  anchorFill={PLAN.white}
                  anchorStroke={PLAN.accent}
                  anchorStrokeWidth={px(2)}
                  borderStroke={PLAN.accent}
                  borderStrokeWidth={px(1.5)}
                  rotateAnchorOffset={px(28)}
                  boundBoxFunc={(oldBox, newBox) => newBox.width < 20 || newBox.height < 20 ? oldBox : newBox}
                />
                {props.onDeleteSelection && (() => {
                  const b = objectBounds(selectedFurniture);
                  return <Group x={b.x + b.width + px(10)} y={b.y - px(10)} scaleX={1 / s} scaleY={1 / s} onClick={props.onDeleteSelection} onTap={props.onDeleteSelection}>
                    <Circle radius={12} fill={PLAN.white} stroke={PLAN.danger} strokeWidth={1.5} shadowColor="#1d221f" shadowOpacity={0.15} shadowBlur={4} />
                    <Text text="×" x={-8} y={-9} width={16} height={18} align="center" fontSize={17} fontStyle="600" fill={PLAN.danger} fontFamily={FONT} />
                  </Group>;
                })()}
              </>
            )}
          </Layer>

          {/* Appliance markers: constant on-screen size */}
          <Layer listening={!drawing}>
            {L.appliances &&
              doc.objects.filter((o) => o.kind === "asset" && o.assetId).map((o) => {
                const info = markers[o.assetId!];
                if (!info) return null;
                const sel = isSel("object", o.id);
                const colour = info.tone === "danger" ? PLAN.danger : info.tone === "warning" ? PLAN.warning : PLAN.accent;
                const img = iconImage(category(info.categoryId).icon, colour, forceRender);
                const showName = sel || hovered === o.id;
                const w = Math.max(80, info.name.length * 7.2 + 20);
                return (
                  <Group
                    key={o.id}
                    id={o.id}
                    x={o.x + o.width / 2}
                    y={o.y + o.height / 2}
                    scaleX={1 / s}
                    scaleY={1 / s}
                    draggable={selectable}
                    onDragStart={() => onSelect({ kind: "object", id: o.id })}
                    onDragEnd={objectDragEnd(o)}
                    onClick={() => (editable ? onSelect({ kind: "object", id: o.id }) : onOpenAsset(o.assetId!))}
                    onTap={() => (editable ? onSelect({ kind: "object", id: o.id }) : onOpenAsset(o.assetId!))}
                    onMouseEnter={(e) => {
                      setHovered(o.id);
                      e.target.getStage()!.container().style.cursor = editable ? "move" : "pointer";
                    }}
                    onMouseLeave={(e) => {
                      setHovered(null);
                      e.target.getStage()!.container().style.cursor = "";
                    }}
                  >
                    {sel && <Circle radius={23} fill={PLAN.accentSoft} stroke={PLAN.accent} strokeWidth={1.5} />}
                    <Circle radius={17} fill={PLAN.white} stroke={colour} strokeWidth={2.5} shadowColor="#1d221f" shadowOpacity={0.18} shadowBlur={6} shadowOffsetY={2} />
                    <KImage image={img} width={18} height={18} x={-9} y={-9} listening={false} />
                    {info.tone !== "neutral" && <Circle x={12} y={-12} radius={5} fill={colour} stroke={PLAN.white} strokeWidth={1.5} listening={false} />}
                    {showName && (
                      <Group y={24} listening={false}>
                        <Rect x={-w / 2} width={w} height={info.reason ? 36 : 22} cornerRadius={4} fill="#1d221f" opacity={0.92} />
                        <Text text={info.name} x={-w / 2} width={w} y={5} align="center" fontSize={12} fontStyle="600" fill="#fff" fontFamily={FONT} />
                        {info.reason && <Text text={info.reason} x={-w / 2} width={w} y={20} align="center" fontSize={10.5} fill="#e7e3da" fontFamily={FONT} />}
                      </Group>
                    )}
                  </Group>
                );
              })}
          </Layer>

          <Layer listening={false}>{renderDraft()}</Layer>
          {!drawing && cursor && (preview || roomPreview) && (
            <Layer listening={false}>
              {cursor.guides.map((gd, i) => <Line key={i} points={[gd.a.x, gd.a.y, gd.b.x, gd.b.y]} stroke={PLAN.guide} strokeWidth={px(1)} dash={[px(3), px(4)]} />)}
              <SnapGlyph p={cursor.point} kind={cursor.kind} px={px} />
            </Layer>
          )}
        </Stage>
      )}
    </div>
  );
});

// ------------------------------------------------------------------ small pieces
const flat = (p: Pt) => [p.x, p.y];
const dot2 = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
/** Signed distance of p from the line through a with unit normal n. */
function projectSigned(p: Pt, a: Pt, n: Pt) {
  return dot2(sub(p, a), n);
}

function LengthTag({ a, b, offset, px, text }: { a: Pt; b: Pt; offset: number; px: (n: number) => number; text: string }) {
  const n = perp(unit(sub(b, a)));
  const mid = add(lerp(a, b, 0.5), mul(n, offset));
  const w = px(text.length * 6.4 + 12);
  return (
    <Group x={mid.x} y={mid.y} listening={false}>
      <Rect x={-w / 2} y={-px(10)} width={w} height={px(20)} cornerRadius={px(4)} fill={PLAN.accent} />
      <Text text={text} x={-w / 2} y={-px(10)} width={w} height={px(20)} align="center" verticalAlign="middle" fontSize={px(11)} fontStyle="600" fill={PLAN.white} fontFamily={FONT} />
    </Group>
  );
}

function SnapGlyph({ p, kind, px }: { p: Pt; kind: string; px: (n: number) => number }) {
  const r = px(7);
  const stroke = PLAN.guide;
  const sw = px(1.75);
  if (kind === "endpoint") return <Rect x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} stroke={stroke} strokeWidth={sw} listening={false} />;
  if (kind === "midpoint") return <Line points={[p.x, p.y - r, p.x + r, p.y + r * 0.8, p.x - r, p.y + r * 0.8]} closed stroke={stroke} strokeWidth={sw} listening={false} />;
  if (kind === "on-wall") return <Group listening={false}><Line points={[p.x - r, p.y - r, p.x + r, p.y + r]} stroke={stroke} strokeWidth={sw} /><Line points={[p.x - r, p.y + r, p.x + r, p.y - r]} stroke={stroke} strokeWidth={sw} /></Group>;
  return <Group listening={false}><Line points={[p.x - r, p.y, p.x + r, p.y]} stroke={stroke} strokeWidth={sw} /><Line points={[p.x, p.y - r, p.x, p.y + r]} stroke={stroke} strokeWidth={sw} /></Group>;
}

function GridShape({ extent, step, colour }: { extent: { width: number; height: number }; step: number; colour: string }) {
  return (
    <Shape
      listening={false}
      stroke={colour}
      strokeWidth={1}
      strokeScaleEnabled={false}
      sceneFunc={(ctx, shape) => {
        ctx.beginPath();
        for (let x = -2000; x <= extent.width + 2000; x += step) {
          ctx.moveTo(x, -2000);
          ctx.lineTo(x, extent.height + 2000);
        }
        for (let y = -2000; y <= extent.height + 2000; y += step) {
          ctx.moveTo(-2000, y);
          ctx.lineTo(extent.width + 2000, y);
        }
        ctx.strokeShape(shape);
      }}
    />
  );
}

/** Light line detail so furniture reads at a glance (pillows, cushions, counter edge). */
function FurnitureDetail({ o }: { o: PlanObject }) {
  const stroke = FURNITURE_STROKE;
  if (o.furnitureType === "bed_double" || o.furnitureType === "bed_single") {
    const pillows = o.furnitureType === "bed_double" ? 2 : 1;
    const pw = (o.width - 30) / pillows;
    return (
      <Group listening={false}>
        {Array.from({ length: pillows }).map((_, i) => (
          <Rect key={i} x={15 + i * pw + 4} y={12} width={pw - 8} height={30} cornerRadius={6} stroke={stroke} strokeWidth={2} />
        ))}
        <Line points={[0, 55, o.width, 55]} stroke={stroke} strokeWidth={2} />
      </Group>
    );
  }
  if (o.furnitureType === "sofa") return <Rect listening={false} x={12} y={o.height * 0.35} width={o.width - 24} height={o.height * 0.55} cornerRadius={6} stroke={stroke} strokeWidth={2} />;
  if (o.furnitureType === "dining_table") return <Rect listening={false} x={10} y={10} width={o.width - 20} height={o.height - 20} cornerRadius={4} stroke={stroke} strokeWidth={1.5} dash={[6, 4]} />;
  if (o.furnitureType === "counter") return <Line listening={false} points={[0, o.height - 12, o.width, o.height - 12]} stroke={stroke} strokeWidth={2} />;
  if (o.furnitureType === "dining_chair") return <Rect listening={false} x={7} y={7} width={o.width - 14} height={o.height - 14} cornerRadius={8} stroke={stroke} strokeWidth={2} />;
  if (o.furnitureType === "toilet") return <Group listening={false}><Rect x={10} y={5} width={o.width - 20} height={18} cornerRadius={4} stroke={stroke} strokeWidth={2} /><Circle x={o.width / 2} y={o.height * 0.62} radius={Math.min(o.width * 0.34, o.height * 0.24)} stroke={stroke} strokeWidth={2} /></Group>;
  if (o.furnitureType === "basin" || o.furnitureType === "sink") return <Group listening={false}><Rect x={6} y={6} width={o.width - 12} height={o.height - 12} cornerRadius={8} stroke={stroke} strokeWidth={2} /><Circle x={o.width / 2} y={o.height / 2} radius={4} fill={stroke} /></Group>;
  if (o.furnitureType === "shower") return <Group listening={false}><Line points={[8, 8, o.width - 8, o.height - 8]} stroke={stroke} strokeWidth={1.5} /><Line points={[o.width - 8, 8, 8, o.height - 8]} stroke={stroke} strokeWidth={1.5} /><Circle x={o.width / 2} y={o.height / 2} radius={8} stroke={stroke} strokeWidth={2} /></Group>;
  if (o.furnitureType === "hob") return <Group listening={false}>{[[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]].map(([x, y], i) => <Circle key={i} x={o.width * x} y={o.height * y} radius={Math.min(o.width, o.height) * 0.12} stroke={stroke} strokeWidth={1.5} />)}</Group>;
  return null;
}

function pointOnSegment(p: Pt, a: Pt, b: Pt) {
  const cross = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  if (cross > Math.max(2, dist(a, b) * 0.005)) return false;
  return p.x >= Math.min(a.x, b.x) - 1 && p.x <= Math.max(a.x, b.x) + 1 && p.y >= Math.min(a.y, b.y) - 1 && p.y <= Math.max(a.y, b.y) + 1;
}
