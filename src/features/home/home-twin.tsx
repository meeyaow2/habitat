"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  Box, Columns2, DoorOpen, PaintBucket, Download, Eye, Hand, Info, Layers as LayersIcon, Maximize, MousePointer2, MoreHorizontal, PanelsTopLeft, Pencil, Plus,
  Redo2, RotateCcw, Ruler, RulerDimensionLine, Square, SquareDashed, Type, Undo2, ZoomIn, ZoomOut, AppWindow, Trash2,
} from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Segmented } from "@/components/ui/segmented";
import { IconButton, Tooltip } from "@/components/ui/tooltip";
import { useAction } from "@/lib/client/use-action";
import { cn } from "@/lib/utils";
import type { AssetOption, MemberOption } from "@/features/shared/options";
import { addLevelAction, deleteLevelAction, saveFloorAction, setLayoutAccuracyAction, updateLevelAction } from "./actions";
import { AssetDrawer } from "./asset-drawer";
import { formatLength, moveWall, parseLength, toDxf, type Pt, type SnapKind } from "./cad";
import { CadProperties, LayerToggles } from "./cad-panels";
import type { CanvasHandle, DraftSettings, Layers, MarkerInfo, Selection, Tool } from "./canvas";
import { AddPanel, CommitInput, LayersPanel, PanelSection, UnplacedPanel, type TwinAsset } from "./edit-panels";
import { docsEqual, historyReducer, initHistory } from "./editor-store";
import { areaM2, centre, furnitureSpec, moveRoom, newId, objectBounds, placeAtCentre, roomAt, roomPolygon, type FloorDoc, type PlanObject } from "./model";
import { ResetLayoutDialog } from "./reset-dialog";

const PlanCanvas = dynamic(() => import("./canvas").then((m) => m.PlanCanvas), {
  ssr: false,
  loading: () => <div className="skeleton size-full rounded-none" aria-label="Loading floor plan" />,
});
const Viewer3D = dynamic(() => import("./viewer-3d").then((m) => m.Viewer3D), {
  ssr: false,
  loading: () => <div className="skeleton size-full rounded-none" aria-label="Loading 3D view" />,
});

const MARKER_CM = 44;

export type TwinProps = {
  property: { id: string; name: string; property_type: string; hdb_flat_type: string | null; layout_accuracy: "illustrative" | "measured" };
  isOwner: boolean;
  floors: { id: string; name: string; level: number; version: number; width_cm: number; depth_cm: number; wall_height_cm: number }[];
  floorId: string;
  doc: FloorDoc;
  assets: TwinAsset[];
  assetOptions: AssetOption[];
  members: MemberOption[];
  initialEdit: boolean;
  initialAssetId: string | null;
  welcome: boolean;
};

const TOOLS: { tool: Tool; label: string; key: string; icon: React.ReactNode }[] = [
  { tool: "select", label: "Select", key: "V", icon: <MousePointer2 /> },
  { tool: "pan", label: "Pan", key: "H", icon: <Hand /> },
  { tool: "wall", label: "Wall", key: "W", icon: <PanelsTopLeft /> },
  { tool: "room", label: "Room", key: "R", icon: <SquareDashed /> },
  { tool: "fill", label: "Fill room inside walls", key: "F", icon: <PaintBucket /> },
  { tool: "door", label: "Door", key: "D", icon: <DoorOpen /> },
  { tool: "window", label: "Window", key: "N", icon: <AppWindow /> },
  { tool: "opening", label: "Opening", key: "O", icon: <Square /> },
  { tool: "dimension", label: "Dimension", key: "M", icon: <RulerDimensionLine /> },
  { tool: "text", label: "Text", key: "T", icon: <Type /> },
  { tool: "measure", label: "Measure distance", key: "I", icon: <Ruler /> },
];
const KEY_TO_TOOL = Object.fromEntries(TOOLS.map((t) => [t.key.toLowerCase(), t.tool])) as Record<string, Tool>;

const DEFAULT_LAYERS: Layers = { walls: true, openings: true, rooms: true, furniture: true, appliances: true, dimensions: true, labels: true, grid: true };

function loadSettings(): DraftSettings {
  const base: DraftSettings = { wallThickness: 10, snap: true, ortho: false, grid: true, layers: DEFAULT_LAYERS };
  try {
    const saved = JSON.parse(localStorage.getItem("habitat.cad.settings") ?? "null");
    if (saved && typeof saved === "object") return { ...base, ...saved, layers: { ...DEFAULT_LAYERS, ...(saved.layers ?? {}) } };
  } catch {}
  return base;
}

export function HomeTwin(props: TwinProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const floor = props.floors.find((f) => f.id === props.floorId)!;
  const illustrative = props.property.layout_accuracy === "illustrative";

  const [mode, setMode] = React.useState<"view" | "edit">(props.initialEdit ? "edit" : "view");
  const [tool, setTool] = React.useState<Tool>("select");
  const [settings, setSettings] = React.useState<DraftSettings>(() => ({ wallThickness: 10, snap: true, ortho: false, grid: true, layers: DEFAULT_LAYERS }));
  const [viewKind, setViewKind] = React.useState<"2d" | "split" | "3d">("2d");
  const [saved, setSaved] = React.useState({ doc: props.doc, version: floor.version, floorId: props.floorId });
  const [history, dispatch] = React.useReducer(historyReducer, props.doc, initHistory);
  const doc = mode === "edit" ? history.present : saved.doc;
  const linked = props.initialAssetId ? props.doc.objects.find((o) => o.assetId === props.initialAssetId) : undefined;
  const [selection, setSelection] = React.useState<Selection>(() => (props.initialEdit && linked ? { kind: "object", id: linked.id } : null));
  const [drawerAsset, setDrawerAsset] = React.useState<string | null>(() => (!props.initialEdit && linked ? props.initialAssetId : null));
  const [confirm, setConfirm] = React.useState<null | { action: () => void; title?: string; description?: string; label?: string }>(null);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [levelDialog, setLevelDialog] = React.useState<null | "add" | "edit">(null);
  const [announce, setAnnounce] = React.useState("");
  const [cursor, setCursor] = React.useState<{ p: Pt | null; snap: SnapKind | null }>({ p: null, snap: null });
  const [prompt, setPrompt] = React.useState("");
  const [command, setCommand] = React.useState("");
  const [pendingText, setPendingText] = React.useState<Pt | null>(null);
  const [measure, setMeasure] = React.useState<number | null>(null);
  const [panel, setPanel] = React.useState<"props" | "items" | "layers">("props");
  const canvasRef = React.useRef<CanvasHandle>(null);
  const commandRef = React.useRef<HTMLInputElement>(null);
  const [canvasHeight, setCanvasHeight] = React.useState(560);

  const dirty = mode === "edit" && !docsEqual(history.present, saved.doc);

  // Re-fit the 2D plan when its pane changes size (2D ↔ split).
  React.useEffect(() => {
    if (viewKind === "3d") return;
    const t = setTimeout(() => canvasRef.current?.fit(), 120);
    return () => clearTimeout(t);
  }, [viewKind]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- settings live in localStorage (client only)
    setSettings(loadSettings());
  }, []);
  const updateSettings = (next: DraftSettings) => {
    setSettings(next);
    try { localStorage.setItem("habitat.cad.settings", JSON.stringify(next)); } catch {}
  };

  // Adopt fresh server data unless there are unsaved edits.
  const [prevDoc, setPrevDoc] = React.useState(props.doc);
  if (prevDoc !== props.doc) {
    setPrevDoc(props.doc);
    if (!dirty) {
      setSaved({ doc: props.doc, version: floor.version, floorId: props.floorId });
      dispatch({ type: "reset", doc: props.doc });
      setSelection(null);
    }
  }

  React.useEffect(() => {
    const update = () => setCanvasHeight(Math.max(400, Math.min(window.innerHeight - (window.innerWidth >= 768 ? 158 : 280), 1000)));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const assetById = React.useMemo(() => new Map(props.assets.map((a) => [a.id, a])), [props.assets]);
  const assetName = React.useCallback((id: string) => assetById.get(id)?.name ?? "Item", [assetById]);
  const markers = React.useMemo(() => {
    const m: Record<string, MarkerInfo> = {};
    for (const a of props.assets) m[a.id] = { name: a.name, categoryId: a.category_id, tone: a.tone, reason: a.reason };
    return m;
  }, [props.assets]);

  const placedHere = new Set(doc.objects.filter((o) => o.assetId).map((o) => o.assetId!));
  const unplaced = props.assets.filter((a) => !placedHere.has(a.id) && (a.placed_floor_id === null || a.placed_floor_id === props.floorId));

  // ---------------------------------------------------------------- edits
  const commit = React.useCallback((d: FloorDoc) => dispatch({ type: "commit", doc: d }), []);
  const g = doc.geometry;

  const select = (s: Selection) => {
    setSelection(s);
    if (!s) return;
    if (mode === "edit") setPanel("props");
    const label =
      s.kind === "room" ? doc.rooms.find((r) => r.id === s.id)?.name
      : s.kind === "wall" ? "Wall"
      : s.kind === "opening" ? g.openings.find((o) => o.id === s.id)?.kind
      : s.kind === "dimension" ? "Dimension"
      : s.kind === "label" ? g.labels.find((l) => l.id === s.id)?.text
      : (() => { const o = doc.objects.find((x) => x.id === s.id); return o?.assetId ? assetName(o.assetId) : o?.label; })();
    setAnnounce(`${label ?? "Item"} selected`);
  };

  const freeSpot = (target: Pt) => {
    let p = { ...target };
    for (let i = 0; i < 12; i++) {
      if (!doc.objects.some((o) => o.kind === "asset" && Math.hypot(o.x + o.width / 2 - p.x, o.y + o.height / 2 - p.y) < 50)) break;
      p = { x: target.x + 60 * ((i % 3) - 1 || 1), y: target.y + 60 * Math.floor(i / 3 + 1) * (i % 2 ? 1 : -1) };
    }
    return p;
  };

  const placeAsset = (assetId: string, at?: Pt) => {
    const asset = assetById.get(assetId);
    const room = asset?.room_id ? doc.rooms.find((r) => r.id === asset.room_id) : null;
    const target = at ?? freeSpot(room ? centre(room) : canvasRef.current?.viewCentre() ?? { x: 400, y: 300 });
    const obj: PlanObject = { id: newId(), kind: "asset", assetId, furnitureType: null, label: null, ...placeAtCentre({ width: MARKER_CM, height: MARKER_CM }, target), width: MARKER_CM, height: MARKER_CM, rotation: 0 };
    commit({ ...doc, objects: [...doc.objects.filter((o) => o.assetId !== assetId), obj] });
    setSelection({ kind: "object", id: obj.id });
    setTool("select");
    const inRoom = roomAt(doc.rooms, target);
    setAnnounce(`${asset?.name ?? "Item"} placed${inRoom ? ` in ${inRoom.name}` : ""}`);
  };

  const addFurniture = (type: string) => {
    const spec = furnitureSpec(type)!;
    const sel = selection?.kind === "room" ? doc.rooms.find((r) => r.id === selection.id) : null;
    const c = sel ? centre(sel) : canvasRef.current?.viewCentre() ?? { x: 400, y: 300 };
    const obj: PlanObject = { id: newId(), kind: "furniture", assetId: null, furnitureType: spec.value, label: spec.label, ...placeAtCentre({ width: spec.w, height: spec.h }, c), width: spec.w, height: spec.h, rotation: 0 };
    commit({ ...doc, objects: [...doc.objects, obj] });
    setSelection({ kind: "object", id: obj.id });
    setTool("select");
  };

  const deleteSelection = () => {
    if (!selection) return;
    const id = selection.id;
    if (selection.kind === "room") commit({ ...doc, rooms: doc.rooms.filter((r) => r.id !== id) });
    else if (selection.kind === "object") commit({ ...doc, objects: doc.objects.filter((o) => o.id !== id) });
    else if (selection.kind === "wall") commit({ ...doc, geometry: { ...g, walls: g.walls.filter((w) => w.id !== id), openings: g.openings.filter((o) => o.wallId !== id) } });
    else if (selection.kind === "opening") commit({ ...doc, geometry: { ...g, openings: g.openings.filter((o) => o.id !== id) } });
    else if (selection.kind === "dimension") commit({ ...doc, geometry: { ...g, dimensions: g.dimensions.filter((d) => d.id !== id) } });
    else if (selection.kind === "label") commit({ ...doc, geometry: { ...g, labels: g.labels.filter((l) => l.id !== id) } });
    setSelection(null);
  };

  const duplicateSelection = () => {
    if (!selection) return;
    if (selection.kind === "room") {
      const r = doc.rooms.find((x) => x.id === selection.id);
      if (!r) return;
      const copy = moveRoom({ ...r, id: newId(), name: `${r.name} copy`.slice(0, 60) }, 50, 50);
      commit({ ...doc, rooms: [...doc.rooms, copy] });
      setSelection({ kind: "room", id: copy.id });
    } else if (selection.kind === "object") {
      const o = doc.objects.find((x) => x.id === selection.id);
      if (!o || o.kind === "asset") return;
      const copy = { ...o, id: newId(), x: o.x + 30, y: o.y + 30 };
      commit({ ...doc, objects: [...doc.objects, copy] });
      setSelection({ kind: "object", id: copy.id });
    }
  };

  const rotateSelection = () => {
    if (selection?.kind !== "object") return;
    commit({ ...doc, objects: doc.objects.map((o) => (o.id === selection.id && o.kind !== "asset" ? { ...o, rotation: (o.rotation + 90) % 360 } : o)) });
  };

  const nudge = (dx: number, dy: number) => {
    if (!selection) return;
    const id = selection.id;
    if (selection.kind === "room") commit({ ...doc, rooms: doc.rooms.map((r) => (r.id === id ? moveRoom(r, dx, dy) : r)) });
    else if (selection.kind === "object") commit({ ...doc, objects: doc.objects.map((o) => (o.id === id ? { ...o, x: o.x + dx, y: o.y + dy } : o)) });
    else if (selection.kind === "wall") commit({ ...doc, geometry: moveWall(g, id, dx, dy) });
    else if (selection.kind === "label") commit({ ...doc, geometry: { ...g, labels: g.labels.map((l) => (l.id === id ? { ...l, at: { x: l.at.x + dx, y: l.at.y + dy } } : l)) } });
    else if (selection.kind === "dimension") commit({ ...doc, geometry: { ...g, dimensions: g.dimensions.map((d) => (d.id === id ? { ...d, a: { x: d.a.x + dx, y: d.a.y + dy }, b: { x: d.b.x + dx, y: d.b.y + dy } } : d)) } });
  };

  // ---------------------------------------------------------------- save / mode / levels
  const save = useAction(saveFloorAction, { silent: true });
  const setLayoutAccuracy = useAction(setLayoutAccuracyAction, { success: "Layout updated" });
  const addLevel = useAction(addLevelAction, { success: "Level added" });
  const updateLevel = useAction(updateLevelAction, { success: "Level updated" });
  const deleteLevel = useAction(deleteLevelAction, { success: "Level deleted" });

  const doSave = async () => {
    if (!dirty || save.pending) return;
    const snapshot = history.present;
    const res = await save.run({ floorId: props.floorId, baseVersion: saved.version, doc: snapshot });
    if (res) {
      setSaved({ doc: snapshot, version: res.data.version, floorId: props.floorId });
      toast.success("Drawing saved", { description: res.data.reassigned ? `${res.data.reassigned} item${res.data.reassigned === 1 ? "" : "s"} moved to a new room.` : undefined });
      router.refresh();
    }
  };
  React.useEffect(() => {
    if (save.error) toast.error("Couldn’t save the drawing", { id: "save-error", description: save.error, action: { label: "Reload", onClick: () => window.location.reload() } });
  }, [save.error]);

  const discard = () => {
    dispatch({ type: "reset", doc: saved.doc });
    setSelection(null);
    canvasRef.current?.cancel();
  };

  const setUrl = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("welcome");
    window.history.replaceState(null, "", `${pathname}${next.size ? `?${next}` : ""}`);
  };

  const switchMode = (m: "view" | "edit") => {
    if (m === mode) return;
    const go = () => {
      if (m === "edit") dispatch({ type: "reset", doc: saved.doc });
      setMode(m);
      setTool(m === "edit" && saved.doc.geometry.walls.length === 0 ? "wall" : "select");
      setSelection(null);
      setDrawerAsset(null);
      setUrl({ edit: m === "edit" ? "1" : null, asset: null });
    };
    if (m === "view" && dirty) setConfirm({ action: () => { discard(); go(); } });
    else go();
  };

  const switchFloor = (id: string) => {
    const go = () => router.push(`/home?floor=${id}${mode === "edit" ? "&edit=1" : ""}`);
    if (dirty) setConfirm({ action: go });
    else go();
  };

  const editPosition = (assetId: string) => {
    const obj = saved.doc.objects.find((o) => o.assetId === assetId);
    dispatch({ type: "reset", doc: saved.doc });
    setMode("edit");
    setTool("select");
    setDrawerAsset(null);
    setSelection(obj ? { kind: "object", id: obj.id } : null);
    setUrl({ edit: "1", asset: null });
  };

  // ---------------------------------------------------------------- export
  const download = (name: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const fileBase = `${props.property.name}-${floor.name}`.replace(/[^\w-]+/g, "-").toLowerCase();
  const exportDxf = () => {
    const d = doc;
    const dxf = toDxf({
      geometry: d.geometry,
      rooms: d.rooms.map((r) => ({ name: r.name, polygon: roomPolygon(r) })),
      furniture: d.objects.filter((o) => o.kind === "furniture").map((o) => {
        const b = objectBounds(o);
        return { label: o.label ?? "", corners: [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y }, { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height }] };
      }),
      appliances: d.objects.filter((o) => o.kind === "asset" && o.assetId).map((o) => ({ name: assetName(o.assetId!), at: centre(objectBounds(o)) })),
    });
    download(`${fileBase}.dxf`, new Blob([dxf], { type: "application/dxf" }));
    toast.success("DXF exported", { description: "Opens in AutoCAD and other CAD apps. Units: millimetres." });
  };
  const exportPng = () => {
    const url = canvasRef.current?.exportPng();
    if (!url) return toast.error("Switch to the 2D view to export an image.");
    fetch(url).then((r) => r.blob()).then((b) => download(`${fileBase}.png`, b));
  };

  // ---------------------------------------------------------------- command line
  const submitCommand = () => {
    const v = command.trim();
    if (pendingText) {
      if (v) commit({ ...doc, geometry: { ...g, labels: [...g.labels, { id: newId(), at: pendingText, text: v.slice(0, 80), size: 24 }] } });
      setPendingText(null);
      setCommand("");
      return;
    }
    if (!v) {
      canvasRef.current?.finish();
      return;
    }
    const lenCm = parseLength(v);
    if (lenCm && canvasRef.current?.applyLength(lenCm)) {
      setCommand("");
      return;
    }
    const word = v.toLowerCase();
    const t = KEY_TO_TOOL[word] ?? TOOLS.find((x) => x.tool === word || x.label.toLowerCase() === word)?.tool;
    if (t) {
      setTool(t);
      setCommand("");
      return;
    }
    toast.error(lenCm ? "Start drawing first, then type a length." : `“${v}” isn’t a length or command. Try 3.2, 320cm, or W for wall.`);
  };

  // ---------------------------------------------------------------- keyboard
  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "+" || e.key === "=") return canvasRef.current?.zoomBy(1.25);
    if (e.key === "-") return canvasRef.current?.zoomBy(0.8);
    if (e.key === "0" && !canvasRef.current?.isDrafting()) return canvasRef.current?.fit();
    if (mode !== "edit") {
      if (e.key === "Escape") setSelection(null);
      return;
    }
    if (e.key === "F3") { e.preventDefault(); return updateSettings({ ...settings, snap: !settings.snap }); }
    if (e.key === "F7") { e.preventDefault(); return updateSettings({ ...settings, grid: !settings.grid }); }
    if (e.key === "F8") { e.preventDefault(); return updateSettings({ ...settings, ortho: !settings.ortho }); }
    if (e.key === "Escape") {
      if (canvasRef.current?.isDrafting()) canvasRef.current.cancel();
      else if (tool !== "select") setTool("select");
      else setSelection(null);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      return canvasRef.current?.finish();
    }
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); return dispatch({ type: e.shiftKey ? "redo" : "undo" }); }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); return dispatch({ type: "redo" }); }
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); return void doSave(); }
    if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); return duplicateSelection(); }
    if (mod) return;
    // Typing a number while drawing goes to the command line (like AutoCAD).
    if (/^[0-9.]$/.test(e.key) && canvasRef.current?.isDrafting()) {
      e.preventDefault();
      setCommand(e.key);
      commandRef.current?.focus();
      return;
    }
    if (e.key === "Backspace" && canvasRef.current?.isDrafting()) { e.preventDefault(); return canvasRef.current.undoPoint(); }
    const t = KEY_TO_TOOL[e.key.toLowerCase()];
    if (t && !e.altKey) { setTool(t); return; }
    if (selection) {
      const step = e.shiftKey ? 50 : 10;
      const moves: Record<string, [number, number]> = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
      if (moves[e.key]) { e.preventDefault(); return nudge(...moves[e.key]); }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); return deleteSelection(); }
      if (e.key.toLowerCase() === "q") return rotateSelection();
    }
  };

  React.useEffect(() => {
    if (mode !== "edit") return;
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const t = e.target as HTMLElement;
      if (!mod || t.closest("input, textarea, select, [role=application]")) return;
      if (e.key.toLowerCase() === "s") { e.preventDefault(); void doSave(); }
      else if (e.key.toLowerCase() === "z") { e.preventDefault(); dispatch({ type: e.shiftKey ? "redo" : "undo" }); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const roomsWithAssets = doc.rooms.map((r) => ({
    room: r,
    items: doc.objects.filter((o) => o.assetId && roomAt(doc.rooms, centre(objectBounds(o)))?.id === r.id).map((o) => assetById.get(o.assetId!)).filter(Boolean) as TwinAsset[],
  }));
  const issues = props.assets.filter((a) => a.tone !== "neutral" && placedHere.has(a.id));
  const emptyDrawing = doc.rooms.length === 0 && g.walls.length === 0;
  const wallsWithoutRooms = doc.rooms.length === 0 && g.walls.length >= 3;
  const show2d = viewKind !== "3d";
  const show3d = viewKind !== "2d";

  const levelPanel = (
    <PanelSection title="Level">
      <div className="flex flex-col gap-3">
        <CommitInput id="lvl-name" label="Name" value={floor.name} onCommit={(v) => v.trim() && updateLevel.run({ floorId: floor.id, name: v.trim().slice(0, 40), wallHeight: floor.wall_height_cm })} />
        <CommitInput id="lvl-h" label="Wall height (3D)" value={String(floor.wall_height_cm)} suffix="cm" onCommit={(v) => { const n = Math.round(Number(v)); if (n >= 200 && n <= 600) updateLevel.run({ floorId: floor.id, name: floor.name, wallHeight: n }); }} />
      </div>
    </PanelSection>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top toolbar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-canvas px-4 py-2.5 sm:px-6">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-semibold">{props.property.name}</h1>
          <Badge tone={illustrative ? "neutral" : "success"} title={illustrative ? "Sizes are approximate. Owners can mark the drawing as measured." : "Dimensions entered by the household"}>
            {illustrative ? "Illustrative" : <><Ruler aria-hidden /> Measured</>}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Segmented size="sm" label="Level" value={props.floorId} onChange={switchFloor} options={props.floors.map((f) => ({ value: f.id, label: f.name }))} />
          {props.isOwner && mode === "edit" && <IconButton label="Add a level" onClick={() => setLevelDialog("add")}><Plus /></IconButton>}
        </div>
        <Segmented
          size="sm"
          label="View"
          value={viewKind}
          onChange={setViewKind}
          options={[
            { value: "2d", label: "2D", ariaLabel: "2D plan" },
            { value: "split", label: <span className="hidden sm:inline">Split</span>, icon: <Columns2 aria-hidden className="sm:hidden" />, ariaLabel: "2D and 3D side by side" },
            { value: "3d", label: "3D", ariaLabel: "3D view" },
          ]}
        />
        <Segmented label="Mode" value={mode} onChange={switchMode} options={[{ value: "view", label: "View", icon: <Eye aria-hidden /> }, { value: "edit", label: "Edit", icon: <Pencil aria-hidden /> }]} />
        {mode === "edit" && (
          <div className="flex items-center gap-1">
            <IconButton label="Undo" shortcut="Ctrl Z" onClick={() => dispatch({ type: "undo" })} disabled={history.past.length === 0}><Undo2 /></IconButton>
            <IconButton label="Redo" shortcut="Ctrl Shift Z" onClick={() => dispatch({ type: "redo" })} disabled={history.future.length === 0}><Redo2 /></IconButton>
            <Button variant="ghost" size="sm" onClick={discard} disabled={!dirty}>Discard</Button>
            <Button variant="primary" size="sm" onClick={doSave} disabled={!dirty} loading={save.pending} aria-keyshortcuts="Control+S">{dirty ? "Save" : "Saved"}</Button>
          </div>
        )}
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Drawing options"><MoreHorizontal aria-hidden /></Button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>Export</MenuLabel>
            <MenuItem onSelect={exportDxf}><Download /> DXF for AutoCAD</MenuItem>
            <MenuItem onSelect={exportPng} disabled={!show2d}><Download /> PNG image</MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => canvasRef.current?.fit()}><Maximize /> Zoom to drawing</MenuItem>
            <MenuItem onSelect={() => setViewKind("3d")}><Box /> 3D view</MenuItem>
            {props.isOwner && (
              <>
                <MenuSeparator />
                <MenuLabel>Levels</MenuLabel>
                <MenuItem onSelect={() => setLevelDialog("add")}><Plus /> Add a level</MenuItem>
                {props.floors.length > 1 && (
                  <MenuItem tone="danger" onSelect={() => setConfirm({
                    title: `Delete “${floor.name}”?`,
                    description: "Its walls, rooms and furniture are removed. Appliances stay in your records and can be placed again.",
                    label: "Delete level",
                    action: async () => { const ok = await deleteLevel.run({ floorId: floor.id }); if (ok) router.push("/home"); },
                  })}><Trash2 /> Delete this level</MenuItem>
                )}
                <MenuSeparator />
                <MenuItem onSelect={() => setLayoutAccuracy.run({ accuracy: illustrative ? "measured" : "illustrative" })}><Ruler /> {illustrative ? "Mark dimensions as measured" : "Mark as illustrative"}</MenuItem>
                <MenuItem tone="danger" onSelect={() => setResetOpen(true)}><RotateCcw /> Start from a template…</MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </div>

      {props.welcome && mode === "view" && (
        <div className="px-4 pt-3 sm:px-6">
          <Notice tone="info" icon={<Info />} title="This is your home">
            Switch to <strong>Edit</strong> to draw walls, doors and windows like a CAD program, add rooms and furniture, and drag your appliances to where they live.
          </Notice>
        </div>
      )}

      <div className={cn("grid min-h-0 flex-1 grid-cols-1", mode === "edit" ? "lg:grid-cols-[52px_1fr_300px]" : "lg:grid-cols-[1fr_300px]")}>
        {/* Tool palette */}
        {mode === "edit" && (
          <div role="toolbar" aria-label="Drawing tools" aria-orientation="vertical" className="order-1 flex gap-1 overflow-x-auto border-b border-line bg-surface p-1.5 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r">
            {TOOLS.map((t) => (
              <IconButton key={t.tool} label={t.label} shortcut={t.key} side="right" aria-pressed={tool === t.tool} onClick={() => setTool(t.tool)} className="size-10">
                {t.icon}
              </IconButton>
            ))}
          </div>
        )}

        <div className="relative order-2 flex min-w-0 flex-col">
          <div className={cn("grid min-h-0", viewKind === "split" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
            {show2d && (
              <div className="relative min-w-0">
                <PlanCanvas
                  ref={canvasRef}
                  doc={doc}
                  editable={mode === "edit"}
                  tool={mode === "edit" ? tool : "select"}
                  settings={settings}
                  extent={{ width: floor.width_cm, height: floor.depth_cm }}
                  selection={selection}
                  onSelect={select}
                  onCommit={commit}
                  markers={markers}
                  onOpenAsset={(id) => setDrawerAsset(id)}
                  onDropAsset={(id, p) => placeAsset(id, p)}
                  onCursor={(p, snap) => setCursor({ p, snap })}
                  onPrompt={setPrompt}
                  onRequestText={(at) => { setPendingText(at); setCommand(""); setTimeout(() => commandRef.current?.focus(), 0); }}
                  onMeasure={setMeasure}
                  illustrative={illustrative}
                  height={viewKind === "split" ? Math.min(canvasHeight, 640) : canvasHeight}
                  ariaLabel={`${floor.name} drawing, ${mode} mode. ${mode === "edit" ? "Tools: W wall, R room, D door, N window, M dimension, T text. Type a length while drawing and press Enter." : "Use the room list to open items."}`}
                  onKeyDown={onKeyDown}
                />
                <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-md border border-line bg-surface p-0.5 shadow-sm">
                  <IconButton label="Zoom out" shortcut="−" onClick={() => canvasRef.current?.zoomBy(0.8)}><ZoomOut /></IconButton>
                  <IconButton label="Zoom to drawing" shortcut="0" onClick={() => canvasRef.current?.fit()}><Maximize /></IconButton>
                  <IconButton label="Zoom in" shortcut="+" onClick={() => canvasRef.current?.zoomBy(1.25)}><ZoomIn /></IconButton>
                </div>
                {mode === "edit" && dirty && <p className="absolute right-3 top-3 rounded-sm bg-warning-soft px-2 py-1 text-xs font-medium text-warning" role="status">Unsaved changes</p>}
                {emptyDrawing && mode === "edit" && (
                  <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-center" role="note">
                    <p className="max-w-xl rounded-md border border-line bg-surface/95 px-3 py-2 text-center text-sm text-fg-muted shadow-sm">
                      <strong className="text-fg">Draw your home:</strong> press <kbd className="rounded-xs border border-line px-1 font-mono text-xs">W</kbd>, click to start a wall, move the mouse, type a length like <kbd className="rounded-xs border border-line px-1 font-mono text-xs">3.2</kbd> and press Enter. Click your first point to close the shape.
                    </p>
                  </div>
                )}
                {wallsWithoutRooms && mode === "edit" && tool !== "fill" && tool !== "room" && (
                  <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-center" role="note">
                    <p className="max-w-xl rounded-md border border-line bg-surface/95 px-3 py-2 text-center text-sm text-fg-muted shadow-sm">
                      <strong className="text-fg">Walls closed?</strong> Press <kbd className="rounded-xs border border-line px-1 font-mono text-xs">F</kbd> and click inside them to make a room with its area worked out.
                    </p>
                  </div>
                )}
                {emptyDrawing && mode === "view" && (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
                    <div className="pointer-events-auto max-w-sm rounded-lg border border-line bg-surface p-5 text-center shadow-md">
                      <p className="font-semibold">Draw your home</p>
                      <p className="mt-1 text-sm text-fg-muted">Switch to Edit to draw walls, doors, windows and rooms — or start from a template.</p>
                      <Button className="mt-3" variant="primary" size="sm" onClick={() => switchMode("edit")}>Start drawing</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {show3d && (
              <div className={cn("relative min-w-0 border-line", viewKind === "split" && "md:border-l")} style={{ height: viewKind === "split" ? Math.min(canvasHeight, 640) : canvasHeight }}>
                <Viewer3D doc={doc} wallHeight={floor.wall_height_cm} pins={markers} onOpenAsset={(id) => setDrawerAsset(id)} />
              </div>
            )}
          </div>

          {/* Command line + status bar (edit mode) */}
          {mode === "edit" && (
            <div className="border-t border-line bg-surface">
              <form
                className="flex items-center gap-2 px-3 py-1.5"
                onSubmit={(e) => { e.preventDefault(); submitCommand(); }}
              >
                <span className="hidden max-w-[55%] truncate font-mono text-xs text-fg-muted md:inline" aria-live="polite">{pendingText ? "TEXT  Type the text and press Enter" : prompt}</span>
                <label htmlFor="cad-command" className="sr-only">Command line: type a length or command</label>
                <input
                  id="cad-command"
                  ref={commandRef}
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setCommand(""); setPendingText(null); canvasRef.current?.cancel(); (document.querySelector("[role=application]") as HTMLElement | null)?.focus(); }
                  }}
                  placeholder={pendingText ? "Text…" : "Type a length (3.2, 320cm) or a command (W, R, D…)"}
                  className="h-8 min-w-0 flex-1 rounded-sm border border-line-input bg-surface px-2 font-mono text-sm outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
                  autoComplete="off"
                  spellCheck={false}
                />
              </form>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-1 font-mono text-[11px] text-fg-muted">
                <span className="tabular-nums" aria-label="Cursor position">{cursor.p ? `X ${formatLength(cursor.p.x, { precise: true }).replace(" ", "")}  Y ${formatLength(cursor.p.y, { precise: true }).replace(" ", "")}` : "X —  Y —"}</span>
                {cursor.snap && cursor.snap !== "none" && <span className="text-accent">{cursor.snap}</span>}
                {measure !== null && <span className="rounded-xs bg-accent-soft px-1.5 text-accent-soft-fg" role="status">Distance {formatLength(measure, { precise: true })}</span>}
                <span className="ml-auto flex items-center gap-1">
                  {([["snap", "SNAP", "F3"], ["ortho", "ORTHO", "F8"], ["grid", "GRID", "F7"]] as const).map(([k, label, key]) => (
                    <Tooltip key={k} content={`${label} on/off`} shortcut={key}>
                      <button type="button" aria-pressed={settings[k]} onClick={() => updateSettings({ ...settings, [k]: !settings[k] })} className="rounded-xs px-1.5 py-0.5 font-semibold aria-pressed:bg-accent aria-pressed:text-accent-fg">{label}</button>
                    </Tooltip>
                  ))}
                  <label className="ml-2 flex items-center gap-1">
                    Wall
                    <select value={settings.wallThickness} onChange={(e) => updateSettings({ ...settings, wallThickness: Number(e.target.value) })} className="rounded-xs border border-line bg-surface px-1 py-0.5" aria-label="Wall thickness for new walls">
                      {[10, 15, 20, 25, 30].map((t) => <option key={t} value={t}>{t} cm</option>)}
                    </select>
                  </label>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        {mode === "edit" ? (
          <aside className="order-3 border-line bg-surface lg:max-h-[calc(100dvh-57px)] lg:overflow-y-auto lg:border-l" aria-label="Properties">
            <div className="sticky top-0 z-10 border-b border-line bg-surface p-2">
              <Segmented size="sm" label="Panel" value={panel} onChange={setPanel} className="w-full [&>button]:flex-1" options={[{ value: "props", label: "Properties" }, { value: "items", label: "Add" }, { value: "layers", label: "Layers", icon: <LayersIcon aria-hidden /> }]} />
            </div>
            {panel === "props" && (
              <CadProperties doc={doc} selection={selection} onChange={commit} onDelete={deleteSelection} onDuplicate={duplicateSelection} onRotate={rotateSelection} onNudge={nudge} assetName={assetName} illustrative={illustrative} level={levelPanel} />
            )}
            {panel === "items" && (
              <>
                <UnplacedPanel assets={unplaced} onPlace={(id) => placeAsset(id)} />
                <AddPanel onAddRoom={() => setTool("room")} onAddFurniture={addFurniture} />
              </>
            )}
            {panel === "layers" && (
              <>
                <LayerToggles layers={settings.layers} onChange={(l) => updateSettings({ ...settings, layers: l })} />
                <LayersPanel doc={doc} selection={selection} onSelect={select} assetName={assetName} />
                <KeyboardHelp />
              </>
            )}
          </aside>
        ) : (
          <aside className="order-3 border-line bg-surface lg:max-h-[calc(100dvh-57px)] lg:overflow-y-auto lg:border-l" aria-label="Rooms and items">
            {issues.length > 0 && (
              <section className="border-b border-line px-4 py-4">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Needs attention</h2>
                <ul className="flex flex-col gap-0.5">
                  {issues.map((a) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => setDrawerAsset(a.id)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-muted">
                        <span className={cn("size-2 shrink-0 rounded-full", a.tone === "danger" ? "bg-danger" : "bg-warning")} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{a.name}</span>
                          <span className="block truncate text-xs text-fg-muted">{a.reason}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="px-4 py-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Rooms</h2>
              {doc.rooms.length === 0 && <p className="text-sm text-fg-muted">No rooms yet. In Edit mode, use the Room tool to outline them.</p>}
              <ul className="flex flex-col gap-3">
                {roomsWithAssets.map(({ room, items }) => (
                  <li key={room.id}>
                    <button
                      type="button"
                      onClick={() => { setSelection({ kind: "room", id: room.id }); canvasRef.current?.focusRect(room); }}
                      aria-pressed={selection?.id === room.id}
                      className="flex w-full items-baseline justify-between rounded-sm text-left text-sm font-medium hover:text-accent aria-pressed:text-accent"
                    >
                      {room.name}
                      <span className="text-xs font-normal text-fg-subtle">{illustrative ? "≈" : ""}{areaM2(room)} m²</span>
                    </button>
                    {items.length > 0 && (
                      <ul className="mt-1 flex flex-col">
                        {items.map((a) => (
                          <li key={a.id}>
                            <button type="button" onClick={() => setDrawerAsset(a.id)} className="flex w-full items-center gap-2 rounded-sm py-1 pl-1 text-left text-sm text-fg-muted hover:bg-surface-muted hover:text-fg">
                              <CategoryIcon categoryId={a.category_id} className="size-3.5" />
                              <span className="truncate">{a.name}</span>
                              {a.tone !== "neutral" && <span className={cn("ml-auto size-1.5 shrink-0 rounded-full", a.tone === "danger" ? "bg-danger" : "bg-warning")} aria-label={a.reason ?? "Needs attention"} />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              {unplaced.length > 0 && (
                <p className="mt-4 border-t border-line pt-3 text-sm text-fg-muted">
                  {unplaced.length} item{unplaced.length === 1 ? " isn’t" : "s aren’t"} on the plan yet.{" "}
                  <button type="button" className="font-medium text-accent hover:underline" onClick={() => { switchMode("edit"); setPanel("items"); }}>Place {unplaced.length === 1 ? "it" : "them"}</button>
                </p>
              )}
            </section>
          </aside>
        )}
      </div>

      <p className="sr-only" aria-live="polite">{announce}</p>

      <AssetDrawer assetId={mode === "view" ? drawerAsset : null} onClose={() => setDrawerAsset(null)} onEditPosition={editPosition} assets={props.assetOptions} members={props.members} refreshKey={props.assets} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.title ?? "Discard unsaved changes?"}
        description={confirm?.description ?? "Your edits to this drawing haven’t been saved."}
        confirmLabel={confirm?.label ?? "Discard changes"}
        onConfirm={async () => { await confirm?.action(); setConfirm(null); }}
      />
      <ResetLayoutDialog open={resetOpen} onOpenChange={setResetOpen} propertyType={props.property.property_type} hdbFlatType={props.property.hdb_flat_type} />
      <LevelDialog
        open={levelDialog === "add"}
        onOpenChange={(o) => setLevelDialog(o ? "add" : null)}
        suggested={`Level ${props.floors.length + 1}`}
        pending={addLevel.pending}
        onSubmit={async (name) => { const ok = await addLevel.run({ name }); if (ok) { setLevelDialog(null); router.push(`/home?floor=${ok.data.id}&edit=1`); } }}
      />
    </div>
  );
}

function LevelDialog({ open, onOpenChange, suggested, pending, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; suggested: string; pending: boolean; onSubmit: (name: string) => void }) {
  const [name, setName] = React.useState(suggested);
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setName(suggested);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a level" description="For landed homes, maisonettes, lofts or a roof terrace." size="sm">
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit(name.trim().slice(0, 40)); }}>
          <DialogBody>
            <Field label="Level name" htmlFor="level-name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending}>Add level</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function KeyboardHelp() {
  const rows: [string, string][] = [
    ["W R D N O", "Wall, room, door, window, opening"],
    ["M T I", "Dimension, text, measure"],
    ["V / H", "Select / pan (or hold Space)"],
    ["3.2 Enter", "Type a length while drawing"],
    ["Enter / Esc", "Finish / cancel"],
    ["Backspace", "Undo last point"],
    ["F3 F7 F8", "Snap, grid, ortho"],
    ["Arrows", "Nudge selection (Shift 50 cm)"],
    ["Del", "Delete selection"],
    ["Ctrl Z / S", "Undo / save"],
  ];
  return (
    <PanelSection title="Keyboard">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="font-mono text-fg">{k}</dt>
            <dd className="text-fg-muted">{v}</dd>
          </React.Fragment>
        ))}
      </dl>
    </PanelSection>
  );
}
