"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import * as React from "react";
import { AppWindow, DoorOpen, Eye, Hand, House, MousePointer2, PanelsTopLeft, Pencil, Plus, Redo2, RotateCcw, Ruler, ScanLine, SquareDashed, Undo2 } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { CadProperties } from "@/features/home/cad-panels";
import { moveWall, polygonArea, rectPolygon, wallsFromPolygons } from "@/features/home/cad";
import type { CanvasHandle, DraftSettings, Layers, MarkerInfo, Selection, Tool } from "@/features/home/canvas";
import { AddPanel, LayersPanel, PanelSection } from "@/features/home/edit-panels";
import { historyReducer, initHistory } from "@/features/home/editor-store";
import { boundsOf, docBounds, furnitureSpec, moveRoom, newId, placeAtCentre, roomPolygon, scaleFloorProportionally, type FloorDoc, type PlanObject, type RoomType } from "@/features/home/model";
import { getTemplate } from "@/features/home/templates";
import { GuestApplianceDetails } from "./appliance-details";
import { addGuestAsset, createSampleGuestHome, GUEST_KEYS, isGuestHome, type GuestHome } from "./data";

const PlanCanvas = dynamic(() => import("@/features/home/canvas").then((m) => m.PlanCanvas), {
  ssr: false,
  loading: () => <div className="skeleton h-[620px] w-full" aria-label="Loading floor plan" />,
});

const DEFAULT_LAYERS: Layers = { walls: true, openings: true, rooms: true, furniture: true, appliances: true, dimensions: false, labels: true, grid: true };
const SETTINGS: DraftSettings = { wallThickness: 10, snap: true, ortho: false, grid: true, layers: DEFAULT_LAYERS };
const TOOLS: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: "select", label: "Select", icon: <MousePointer2 /> },
  { tool: "pan", label: "Pan", icon: <Hand /> },
  { tool: "wall", label: "Wall", icon: <PanelsTopLeft /> },
  { tool: "room", label: "Room", icon: <SquareDashed /> },
  { tool: "door", label: "Door", icon: <DoorOpen /> },
  { tool: "window", label: "Window", icon: <AppWindow /> },
];

export function GuestEditor({ initialHome, initialEdit = false }: { initialHome: GuestHome; initialEdit?: boolean }) {
  const [home, setHome] = React.useState(initialHome);
  const [history, dispatch] = React.useReducer(historyReducer, initialHome.doc, initHistory);
  const [mode, setMode] = React.useState<"view" | "edit">(initialEdit ? "edit" : "view");
  const [tool, setTool] = React.useState<Tool>("select");
  const [selection, setSelection] = React.useState<Selection>(null);
  const [drawerAsset, setDrawerAsset] = React.useState<string | null>(null);
  const [prompt, setPrompt] = React.useState("");
  const [hydrated, setHydrated] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState("Saved in this browser.");
  const [resetOpen, setResetOpen] = React.useState(false);
  const [canvasHeight, setCanvasHeight] = React.useState(620);
  const [showDimensionControls, setShowDimensionControls] = React.useState(false);
  const [showMeasurements, setShowMeasurements] = React.useState(false);
  const [dimensionBasis, setDimensionBasis] = React.useState<"width" | "depth">("width");
  const [dimensionMetres, setDimensionMetres] = React.useState("");
  const canvasRef = React.useRef<CanvasHandle>(null);
  const doc = history.present;
  const flatBounds = React.useMemo(() => boundsOf(doc.rooms) ?? { x: 0, y: 0, width: 0, height: 0 }, [doc.rooms]);
  const floorAreaM2 = React.useMemo(() => doc.rooms.reduce((sum, room) => sum + polygonArea(roomPolygon(room)), 0) / 10000, [doc.rooms]);
  const template = getTemplate(home.templateKey);
  const targetDimensionCm = Number(dimensionMetres) * 100;
  const scaleFactor = targetDimensionCm > 0 ? targetDimensionCm / (dimensionBasis === "width" ? flatBounds.width : flatBounds.height) : 0;

  React.useEffect(() => {
    const key = GUEST_KEYS[initialHome.kind];
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "null");
      if (isGuestHome(parsed) && parsed.kind === initialHome.kind) {
        // Browser storage is the guest data source; hydrate it after the server shell mounts.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHome(parsed);
        dispatch({ type: "reset", doc: parsed.doc });
      }
      localStorage.setItem(GUEST_KEYS.last, initialHome.kind);
    } catch {}
    setHydrated(true);
  }, [initialHome.kind]);

  React.useEffect(() => {
    const resize = () => setCanvasHeight(Math.max(500, window.innerHeight - 184));
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      const next = { ...home, doc, updatedAt: new Date().toISOString() };
      try {
        localStorage.setItem(GUEST_KEYS[next.kind], JSON.stringify(next));
        setSavedAt("Saved in this browser.");
      } catch {
        setSavedAt("Could not save in this browser.");
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [doc, home, hydrated]);

  const markers = React.useMemo(() => Object.fromEntries(home.assets.map((a) => [a.id, {
    name: a.name, categoryId: a.categoryId, tone: a.warrantyTone === "warning" ? "warning" : "neutral", reason: a.note ?? null,
  } satisfies MarkerInfo])), [home.assets]);
  const selectedAsset = home.assets.find((a) => a.id === drawerAsset) ?? null;
  const assetName = (id: string) => home.assets.find((a) => a.id === id)?.name ?? "Appliance";
  const commit = (next: FloorDoc) => dispatch({ type: "commit", doc: next });

  const switchMode = (next: "view" | "edit") => {
    setMode(next);
    setTool("select");
    setSelection(null);
    if (next === "edit") setDrawerAsset(null);
  };

  const addFurniture = (type: string) => {
    const spec = furnitureSpec(type);
    if (!spec) return;
    const at = canvasRef.current?.viewCentre() ?? { x: 650, y: 420 };
    const pos = placeAtCentre({ width: spec.w, height: spec.h }, at);
    const object: PlanObject = { id: newId(), kind: "furniture", assetId: null, furnitureType: spec.value, label: spec.label, ...pos, width: spec.w, height: spec.h, rotation: 0 };
    commit({ ...doc, objects: [...doc.objects, object] });
    setSelection({ kind: "object", id: object.id });
  };

  const addSpace = (roomType: RoomType, name: string, width: number, height: number) => {
    const bounds = docBounds(doc) ?? { x: 0, y: 0, width: 800, height: 600 };
    const x = Math.round(bounds.x);
    const y = Math.round(bounds.y + bounds.height + 40);
    const polygon = rectPolygon({ x, y, width, height });
    const room = { id: newId(), name, roomType, x, y, width, height, sortOrder: doc.rooms.length, polygon };
    const walls = wallsFromPolygons([polygon], newId, { interior: 10, exterior: 20 });
    commit({ ...doc, rooms: [...doc.rooms, room], geometry: { ...doc.geometry, walls: [...doc.geometry.walls, ...walls] } });
    setTool("select");
    setSelection({ kind: "room", id: room.id });
    window.setTimeout(() => canvasRef.current?.focusRect({ x, y, width, height }), 0);
  };

  const removeSelection = () => {
    if (!selection) return;
    if (selection.kind === "room") commit({ ...doc, rooms: doc.rooms.filter((r) => r.id !== selection.id) });
    else if (selection.kind === "object") commit({ ...doc, objects: doc.objects.filter((o) => o.id !== selection.id) });
    else if (selection.kind === "wall") commit({ ...doc, geometry: { ...doc.geometry, walls: doc.geometry.walls.filter((w) => w.id !== selection.id), openings: doc.geometry.openings.filter((o) => o.wallId !== selection.id) } });
    else if (selection.kind === "opening") commit({ ...doc, geometry: { ...doc.geometry, openings: doc.geometry.openings.filter((o) => o.id !== selection.id) } });
    else if (selection.kind === "dimension") commit({ ...doc, geometry: { ...doc.geometry, dimensions: doc.geometry.dimensions.filter((d) => d.id !== selection.id) } });
    else if (selection.kind === "label") commit({ ...doc, geometry: { ...doc.geometry, labels: doc.geometry.labels.filter((l) => l.id !== selection.id) } });
    setSelection(null);
  };

  const rotateSelection = () => {
    if (selection?.kind !== "object") return;
    commit({ ...doc, objects: doc.objects.map((o) => o.id === selection.id ? { ...o, rotation: (o.rotation + 90) % 360 } : o) });
  };

  const duplicateSelection = () => {
    if (selection?.kind !== "object") return;
    const source = doc.objects.find((o) => o.id === selection.id);
    if (!source || source.kind === "asset") return;
    const copy = { ...source, id: newId(), x: source.x + 30, y: source.y + 30 };
    commit({ ...doc, objects: [...doc.objects, copy] });
    setSelection({ kind: "object", id: copy.id });
  };

  const nudgeSelection = (dx: number, dy: number) => {
    if (!selection) return;
    if (selection.kind === "object") commit({ ...doc, objects: doc.objects.map((o) => o.id === selection.id ? { ...o, x: o.x + dx, y: o.y + dy } : o) });
    if (selection.kind === "room") commit({ ...doc, rooms: doc.rooms.map((r) => r.id === selection.id && !r.locked ? moveRoom(r, dx, dy) : r) });
    if (selection.kind === "wall") commit({ ...doc, geometry: moveWall(doc.geometry, selection.id, dx, dy) });
  };

  const addAppliance = (categoryId: string) => {
    const at = canvasRef.current?.viewCentre() ?? { x: 720, y: 500 };
    const next = addGuestAsset({ ...home, doc }, categoryId, at);
    setHome(next);
    dispatch({ type: "reset", doc: next.doc });
    const placed = next.doc.objects[next.doc.objects.length - 1];
    setSelection({ kind: "object", id: placed.id });
  };

  const moveAsset = () => {
    const object = doc.objects.find((o) => o.assetId === drawerAsset);
    setDrawerAsset(null);
    switchMode("edit");
    if (object) setSelection({ kind: "object", id: object.id });
  };

  const resetSample = () => {
    const fresh = createSampleGuestHome();
    setHome(fresh);
    dispatch({ type: "reset", doc: fresh.doc });
    setSelection(null);
    setDrawerAsset(null);
    setMode("view");
    try { localStorage.setItem(GUEST_KEYS.sample, JSON.stringify(fresh)); } catch {}
    setResetOpen(false);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2 sm:px-6">
        <Link href="/" aria-label="Habitat home"><Wordmark /></Link>
        <div className="h-5 w-px bg-line" aria-hidden />
        <div className="min-w-[9rem] flex-1">
          {home.kind === "own" ? (
            <Input
              aria-label="Home name"
              value={home.name}
              maxLength={60}
              onChange={(event) => setHome((current) => ({ ...current, name: event.target.value }))}
              onBlur={() => setHome((current) => ({ ...current, name: current.name.trim() || "My home" }))}
              className="h-8 w-full max-w-64 border-transparent bg-transparent px-2 text-sm font-semibold hover:border-line focus:border-line"
            />
          ) : <p className="truncate text-sm font-semibold">{home.name}</p>}
          <p className="px-2 text-xs text-fg-subtle">{home.kind === "sample" ? "Editable sample · separate from your home" : savedAt}</p>
        </div>
        <Segmented value={mode} onChange={switchMode} label="Editor mode" options={[{ value: "view", label: "View", icon: <Eye /> }, { value: "edit", label: "Edit layout", icon: <Pencil /> }]} />
        {home.kind === "sample" ? <Button variant="ghost" size="sm" onClick={() => setResetOpen(true)}><RotateCcw aria-hidden /> Reset sample</Button> : <Button asChild variant="ghost" size="sm"><Link href="/onboarding"><House aria-hidden /> New home</Link></Button>}
      </header>

      {mode === "edit" && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2" aria-label="Plan tools">
          {TOOLS.map((item) => <button key={item.tool} type="button" onClick={() => setTool(item.tool)} aria-pressed={tool === item.tool} className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm [&_svg]:size-4", tool === item.tool ? "bg-accent text-white" : "text-fg-muted hover:bg-surface-muted hover:text-fg")}>{item.icon}{item.label}</button>)}
          <span className="mx-2 h-5 w-px shrink-0 bg-line" />
          <button type="button" onClick={() => dispatch({ type: "undo" })} disabled={!history.past.length} className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-fg-muted hover:bg-surface-muted disabled:opacity-30" aria-label="Undo"><Undo2 className="size-4" /> Undo</button>
          <button type="button" onClick={() => dispatch({ type: "redo" })} disabled={!history.future.length} className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-fg-muted hover:bg-surface-muted disabled:opacity-30" aria-label="Redo"><Redo2 className="size-4" /> Redo</button>
          <span className="mx-2 h-5 w-px shrink-0 bg-line" />
          <button type="button" onClick={() => setShowDimensionControls((value) => !value)} aria-pressed={showDimensionControls} className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm", showDimensionControls ? "bg-accent-soft text-accent-soft-fg" : "text-fg-muted hover:bg-surface-muted")}><Ruler className="size-4" /> Adjust dimensions</button>
          <button type="button" onClick={() => setShowMeasurements((value) => !value)} aria-pressed={showMeasurements} className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm", showMeasurements ? "bg-accent-soft text-accent-soft-fg" : "text-fg-muted hover:bg-surface-muted")}><ScanLine className="size-4" /> Show measurements</button>
          <span className="ml-auto hidden text-xs text-fg-subtle lg:block">Structural walls and the household shelter are fixed</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {mode === "edit" && (
          <aside className="order-2 max-h-[48dvh] overflow-y-auto border-t border-line bg-surface md:order-none md:max-h-none md:w-[290px] md:shrink-0 md:border-r md:border-t-0" aria-label="Layout editing controls">
            {showDimensionControls && <PanelSection title="Adjust dimensions">
              <div className="flex flex-col gap-3">
                <p className="text-xs text-fg-muted">Current footprint ≈ {(flatBounds.width / 100).toFixed(2)} m × {(flatBounds.height / 100).toFixed(2)} m · modeled area ≈ {floorAreaM2.toFixed(1)} m².</p>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-surface-muted p-1" role="group" aria-label="Overall dimension to set">
                  {(["width", "depth"] as const).map((basis) => <button key={basis} type="button" onClick={() => setDimensionBasis(basis)} aria-pressed={dimensionBasis === basis} className={cn("rounded px-2 py-1.5 text-xs font-medium capitalize", dimensionBasis === basis ? "bg-surface text-fg shadow-sm" : "text-fg-muted")}>{basis}</button>)}
                </div>
                <label className="text-xs font-medium" htmlFor="overall-dimension">Known overall {dimensionBasis}</label>
                <div className="relative"><Input id="overall-dimension" type="number" min="2" max="50" step="0.1" value={dimensionMetres} onChange={(event) => setDimensionMetres(event.target.value)} placeholder={(dimensionBasis === "width" ? flatBounds.width / 100 : flatBounds.height / 100).toFixed(2)} className="pr-9" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">m</span></div>
                {scaleFactor > 0 && <p className="rounded-md bg-accent-soft px-2.5 py-2 text-xs text-accent-soft-fg">Preview: ≈ {(flatBounds.width * scaleFactor / 100).toFixed(2)} m × {(flatBounds.height * scaleFactor / 100).toFixed(2)} m. Furniture keeps its real size.</p>}
                <Button size="sm" variant="primary" disabled={!Number.isFinite(scaleFactor) || scaleFactor < 0.25 || scaleFactor > 4} onClick={() => { commit(scaleFloorProportionally(doc, scaleFactor)); setDimensionMetres(""); }}>Apply proportional change</Button>
                <p className="text-xs text-fg-muted">For one room, select it and enter its approximate width and depth below. Irregular rooms can still be adjusted by dragging a wall.</p>
                {template?.reference && <div className="border-t border-line pt-3 text-xs text-fg-muted"><p className="font-medium text-fg">Reference: {template.reference.totalAreaM2} m² total</p><p>{template.reference.internalAreaM2} m² internal · {template.reference.separateSpaces}</p><p className="mt-1">{template.reference.note}</p><a href={template.reference.url} target="_blank" rel="noreferrer" className="mt-2 inline-block font-medium text-accent hover:underline">View HDB source</a></div>}
              </div>
            </PanelSection>}
            <AddPanel onAddRoom={() => addSpace("other", "New room", 300, 260)} onAddBalcony={() => addSpace("balcony", "Balcony", 280, 140)} onAddFurniture={addFurniture} />
            <PanelSection title="Add appliance">
              <div className="flex flex-wrap gap-1.5">{[["air_conditioner", "Aircon"], ["washing_machine", "Washing machine"], ["refrigerator", "Refrigerator"]].map(([value, label]) => <Button key={value} size="sm" variant="secondary" onClick={() => addAppliance(value)}><Plus aria-hidden /> {label}</Button>)}</div>
            </PanelSection>
            <CadProperties doc={doc} selection={selection} onChange={commit} onDelete={removeSelection} onDuplicate={duplicateSelection} onRotate={rotateSelection} onNudge={nudgeSelection} assetName={assetName} illustrative level={null} onOpenAsset={(id) => { setDrawerAsset(id); switchMode("view"); }} />
            <LayersPanel doc={doc} selection={selection} onSelect={setSelection} assetName={assetName} />
          </aside>
        )}

        <main className="relative min-w-0 flex-1 bg-[var(--plan-bg)]" aria-label="Floor plan editor">
          <PlanCanvas ref={canvasRef} doc={doc} editable={mode === "edit"} tool={tool} settings={SETTINGS} extent={{ width: 1900, height: 1450 }} selection={selection} onSelect={setSelection} onCommit={commit} markers={markers} onOpenAsset={setDrawerAsset} onDropAsset={() => {}} onCursor={() => {}} onPrompt={setPrompt} onRequestText={() => {}} onMeasure={() => {}} illustrative height={canvasHeight} ariaLabel={`${home.name} floor plan`} showMeasurements={showMeasurements} onDeleteSelection={removeSelection} onKeyDown={(event) => {
            if ((event.key === "Delete" || event.key === "Backspace") && selection?.kind === "object") { event.preventDefault(); removeSelection(); }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); dispatch({ type: event.shiftKey ? "redo" : "undo" }); }
          }} />
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
            <p className="max-w-xl rounded-md border border-line bg-surface/95 px-3 py-2 text-xs text-fg-muted shadow-sm">{mode === "edit" ? selection?.kind === "object" ? "Drag to move · corner handles resize · round handle rotates · × removes · Alt/Option ignores wall snap" : prompt || "Start with furniture: select a piece and drag it anywhere on the plan." : "Select an appliance marker to see warranty and maintenance details."}</p>
            <p className="rounded-md border border-line bg-surface/95 px-3 py-2 text-xs text-fg-subtle shadow-sm">{savedAt}</p>
          </div>
        </main>

        {mode === "view" && <GuestApplianceDetails asset={selectedAsset} onClose={() => setDrawerAsset(null)} onMove={moveAsset} />}
      </div>

      <ConfirmDialog open={resetOpen} onOpenChange={setResetOpen} title="Reset the sample home?" description="This restores the original sample layout and appliances. Your own home is not changed." confirmLabel="Reset sample" onConfirm={resetSample} />
    </div>
  );
}
