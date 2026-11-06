"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Box, Eye, Info, Maximize, MoreHorizontal, Pencil, Redo2, RotateCcw, Ruler, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Kbd, Notice } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Segmented } from "@/components/ui/segmented";
import { IconButton } from "@/components/ui/tooltip";
import { useAction } from "@/lib/client/use-action";
import { cn } from "@/lib/utils";
import type { AssetOption, MemberOption } from "@/features/shared/options";
import { saveFloorAction, setLayoutAccuracyAction } from "./actions";
import { AssetDrawer } from "./asset-drawer";
import type { CanvasHandle, MarkerInfo, Selection } from "./canvas";
import { AddPanel, LayersPanel, PropertiesPanel, ShortcutHelp, UnplacedPanel, type TwinAsset } from "./edit-panels";
import { docsEqual, historyReducer, initHistory } from "./editor-store";
import { areaM2, centre, furnitureSpec, newId, objectBounds, placeAtCentre, roomAt, snap, type FloorDoc, type PlanObject } from "./model";
import { ResetLayoutDialog } from "./reset-dialog";
import { useOnChange } from "@/lib/client/use-on-change";

const PlanCanvas = dynamic(() => import("./canvas").then((m) => m.PlanCanvas), {
  ssr: false,
  loading: () => <div className="skeleton size-full rounded-none" aria-label="Loading floor plan" />,
});

const MARKER_CM = 44;

export type TwinProps = {
  property: { id: string; name: string; property_type: string; hdb_flat_type: string | null; layout_accuracy: "illustrative" | "measured" };
  isOwner: boolean;
  floors: { id: string; name: string; level: number; version: number; width_cm: number; depth_cm: number }[];
  floorId: string;
  doc: FloorDoc;
  assets: TwinAsset[];
  assetOptions: AssetOption[];
  members: MemberOption[];
  initialEdit: boolean;
  initialAssetId: string | null;
  welcome: boolean;
};

export function HomeTwin(props: TwinProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const floor = props.floors.find((f) => f.id === props.floorId)!;
  const illustrative = props.property.layout_accuracy === "illustrative";

  const [mode, setMode] = React.useState<"view" | "edit">(props.initialEdit ? "edit" : "view");
  const [saved, setSaved] = React.useState({ doc: props.doc, version: floor.version, floorId: props.floorId });
  const [history, dispatch] = React.useReducer(historyReducer, props.doc, initHistory);
  const doc = mode === "edit" ? history.present : saved.doc;
  // Deep links: ?asset= opens the drawer (view mode) or selects the marker (edit mode).
  const linked = props.initialAssetId ? props.doc.objects.find((o) => o.assetId === props.initialAssetId) : undefined;
  const [selection, setSelection] = React.useState<Selection>(() => (props.initialEdit && linked ? { kind: "object", id: linked.id } : null));
  const [drawerAsset, setDrawerAsset] = React.useState<string | null>(() => (!props.initialEdit && linked ? props.initialAssetId : null));
  const [confirm, setConfirm] = React.useState<null | { action: () => void }>(null);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");
  const canvasRef = React.useRef<CanvasHandle>(null);
  const [canvasHeight, setCanvasHeight] = React.useState(560);

  const dirty = mode === "edit" && !docsEqual(history.present, saved.doc);

  // Server data changed (refresh after save, another tab) → adopt it unless editing with unsaved work.
  useOnChange(props.doc, (incoming) => {
    if (!dirty) {
      setSaved({ doc: incoming, version: floor.version, floorId: props.floorId });
      dispatch({ type: "reset", doc: incoming });
      setSelection(null);
    }
  });

  // Canvas height follows the viewport (an external system; read once on mount, then on resize).
  React.useEffect(() => {
    const update = () => setCanvasHeight(Math.max(380, Math.min(window.innerHeight - (window.innerWidth >= 768 ? 150 : 250), 980)));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Warn before leaving with unsaved edits.
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

  // ---------------------------------------------------------------------
  // Editing operations (all go through history)
  // ---------------------------------------------------------------------
  const commit = React.useCallback((d: FloorDoc) => dispatch({ type: "commit", doc: d }), []);

  const select = (s: Selection) => {
    setSelection(s);
    if (s) {
      const label = s.kind === "room" ? doc.rooms.find((r) => r.id === s.id)?.name : (() => {
        const o = doc.objects.find((x) => x.id === s.id);
        return o?.assetId ? assetName(o.assetId) : o?.label;
      })();
      setAnnounce(`${label ?? "Item"} selected`);
    }
  };

  const freeSpot = (target: { x: number; y: number }) => {
    let p = { ...target };
    for (let i = 0; i < 12; i++) {
      const clash = doc.objects.some((o) => o.kind === "asset" && Math.hypot(o.x + o.width / 2 - p.x, o.y + o.height / 2 - p.y) < 50);
      if (!clash) break;
      p = { x: target.x + 60 * ((i % 3) - 1 || 1), y: target.y + 60 * Math.floor(i / 3 + 1) * (i % 2 ? 1 : -1) };
    }
    return p;
  };

  const placeAsset = (assetId: string, at?: { x: number; y: number }) => {
    const asset = assetById.get(assetId);
    const room = asset?.room_id ? doc.rooms.find((r) => r.id === asset.room_id) : null;
    const target = at ?? freeSpot(room ? centre(room) : canvasRef.current?.viewCentre() ?? { x: 400, y: 300 });
    const obj: PlanObject = { id: newId(), kind: "asset", assetId, furnitureType: null, label: null, ...placeAtCentre({ width: MARKER_CM, height: MARKER_CM }, target), width: MARKER_CM, height: MARKER_CM, rotation: 0 };
    commit({ ...doc, objects: [...doc.objects.filter((o) => o.assetId !== assetId), obj] });
    setSelection({ kind: "object", id: obj.id });
    const inRoom = roomAt(doc.rooms, target);
    setAnnounce(`${asset?.name ?? "Item"} placed${inRoom ? ` in ${inRoom.name}` : ""}`);
  };

  const addRoom = () => {
    const c = canvasRef.current?.viewCentre() ?? { x: 400, y: 300 };
    const room = { id: newId(), name: `Room ${doc.rooms.length + 1}`, roomType: "other" as const, x: snap(c.x - 150), y: snap(c.y - 150), width: 300, height: 300, sortOrder: doc.rooms.length };
    commit({ ...doc, rooms: [...doc.rooms, room] });
    setSelection({ kind: "room", id: room.id });
  };

  const addFurniture = (type: string) => {
    const spec = furnitureSpec(type)!;
    const sel = selection?.kind === "room" ? doc.rooms.find((r) => r.id === selection.id) : null;
    const c = sel ? centre(sel) : canvasRef.current?.viewCentre() ?? { x: 400, y: 300 };
    const obj: PlanObject = { id: newId(), kind: "furniture", assetId: null, furnitureType: spec.value, label: spec.label, ...placeAtCentre({ width: spec.w, height: spec.h }, c), width: spec.w, height: spec.h, rotation: 0 };
    commit({ ...doc, objects: [...doc.objects, obj] });
    setSelection({ kind: "object", id: obj.id });
  };

  const deleteSelection = () => {
    if (!selection) return;
    if (selection.kind === "room") {
      commit({ ...doc, rooms: doc.rooms.filter((r) => r.id !== selection.id) });
    } else {
      commit({ ...doc, objects: doc.objects.filter((o) => o.id !== selection.id) });
    }
    setSelection(null);
  };

  const duplicateSelection = () => {
    if (!selection) return;
    if (selection.kind === "room") {
      const r = doc.rooms.find((x) => x.id === selection.id);
      if (!r) return;
      const copy = { ...r, id: newId(), name: `${r.name} copy`.slice(0, 60), x: r.x + 50, y: r.y + 50 };
      commit({ ...doc, rooms: [...doc.rooms, copy] });
      setSelection({ kind: "room", id: copy.id });
    } else {
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
    if (selection.kind === "room") commit({ ...doc, rooms: doc.rooms.map((r) => (r.id === selection.id ? { ...r, x: r.x + dx, y: r.y + dy } : r)) });
    else commit({ ...doc, objects: doc.objects.map((o) => (o.id === selection.id ? { ...o, x: o.x + dx, y: o.y + dy } : o)) });
  };

  // ---------------------------------------------------------------------
  // Save / discard / mode
  // ---------------------------------------------------------------------
  const save = useAction(saveFloorAction, { silent: true });
  const setLayoutAccuracy = useAction(setLayoutAccuracyAction, { success: "Layout updated" });
  const doSave = async () => {
    if (!dirty || save.pending) return;
    const snapshot = history.present;
    const res = await save.run({ floorId: props.floorId, baseVersion: saved.version, doc: snapshot });
    if (res) {
      setSaved({ doc: snapshot, version: res.data.version, floorId: props.floorId });
      toast.success("Floor plan saved", { description: res.data.reassigned ? `${res.data.reassigned} item${res.data.reassigned === 1 ? "" : "s"} moved to a new room.` : undefined });
      router.refresh();
    } else {
      toast.error("Couldn’t save the floor plan", {
        description: save.error ?? undefined,
        action: { label: "Reload", onClick: () => window.location.reload() },
      });
    }
  };

  // Error from useAction arrives after render; surface it.
  React.useEffect(() => {
    if (save.error) toast.error(save.error, { id: "save-error" });
  }, [save.error]);

  const discard = () => {
    dispatch({ type: "reset", doc: saved.doc });
    setSelection(null);
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
    setDrawerAsset(null);
    setSelection(obj ? { kind: "object", id: obj.id } : null);
    setUrl({ edit: "1", asset: null });
  };

  // ---------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "+" || e.key === "=") return canvasRef.current?.zoomBy(1.25);
    if (e.key === "-") return canvasRef.current?.zoomBy(0.8);
    if (e.key === "0") return canvasRef.current?.fit();
    if (e.key === "Escape") return setSelection(null);
    if (mode !== "edit") return;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return dispatch({ type: e.shiftKey ? "redo" : "undo" });
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      return dispatch({ type: "redo" });
    }
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      return void doSave();
    }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      return duplicateSelection();
    }
    if (!selection) return;
    const step = e.shiftKey ? 50 : 10;
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
    if (moves[e.key]) {
      e.preventDefault();
      return nudge(...moves[e.key]);
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      return deleteSelection();
    }
    if (e.key.toLowerCase() === "r") return rotateSelection();
  };

  // Global shortcuts (undo/redo/save) while editing, even when focus is in a panel.
  React.useEffect(() => {
    if (mode !== "edit") return;
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const t = e.target as HTMLElement;
      if (!mod || t.closest("input, textarea, select, [role=application]")) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void doSave();
      } else if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const roomsWithAssets = doc.rooms.map((r) => ({
    room: r,
    items: doc.objects.filter((o) => o.assetId && roomAt(doc.rooms, centre(objectBounds(o)))?.id === r.id).map((o) => assetById.get(o.assetId!)).filter(Boolean) as TwinAsset[],
  }));
  const issues = props.assets.filter((a) => a.tone !== "neutral" && placedHere.has(a.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-canvas px-4 py-2.5 sm:px-6">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-semibold">{props.property.name}</h1>
          <Badge tone={illustrative ? "neutral" : "success"} title={illustrative ? "Room sizes are approximate. Owners can mark the plan as measured in the menu." : "Dimensions entered by the household"}>
            {illustrative ? "Illustrative layout" : <><Ruler aria-hidden /> Measured</>}
          </Badge>
        </div>
        {props.floors.length > 1 && (
          <Segmented size="sm" label="Floor" value={props.floorId} onChange={switchFloor} options={props.floors.map((f) => ({ value: f.id, label: f.name }))} />
        )}
        <Segmented
          label="Mode"
          value={mode}
          onChange={switchMode}
          options={[
            { value: "view", label: "View", icon: <Eye aria-hidden /> },
            { value: "edit", label: "Edit", icon: <Pencil aria-hidden /> },
          ]}
        />
        {mode === "edit" && (
          <div className="flex items-center gap-1">
            <IconButton label="Undo" shortcut="Ctrl Z" onClick={() => dispatch({ type: "undo" })} disabled={history.past.length === 0}><Undo2 /></IconButton>
            <IconButton label="Redo" shortcut="Ctrl Shift Z" onClick={() => dispatch({ type: "redo" })} disabled={history.future.length === 0}><Redo2 /></IconButton>
            <Button variant="ghost" size="sm" onClick={discard} disabled={!dirty}>Discard</Button>
            <Button variant="primary" size="sm" onClick={doSave} disabled={!dirty} loading={save.pending} aria-keyshortcuts="Control+S">
              {dirty ? "Save changes" : "Saved"}
            </Button>
          </div>
        )}
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Layout options"><MoreHorizontal aria-hidden /></Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => canvasRef.current?.fit()}><Maximize /> Fit to screen</MenuItem>
            <MenuItem asChild><Link href={`/home/3d?floor=${props.floorId}`}><Box /> 3D preview</Link></MenuItem>
            {props.isOwner && (
              <>
                <MenuSeparator />
                <MenuItem onSelect={() => setLayoutAccuracy.run({ accuracy: illustrative ? "measured" : "illustrative" })}>
                  <Ruler /> {illustrative ? "Mark dimensions as measured" : "Mark as illustrative"}
                </MenuItem>
                <MenuItem tone="danger" onSelect={() => setResetOpen(true)}><RotateCcw /> Reset to a template…</MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </div>

      {props.welcome && mode === "view" && (
        <div className="px-4 pt-3 sm:px-6">
          <Notice tone="info" icon={<Info />} title="This is your home">
            Switch to <strong>Edit</strong> to move rooms, add furniture and drag your appliances to where they live. Changes are saved when you press Save.
          </Notice>
        </div>
      )}

      <div className={cn("grid min-h-0 flex-1 grid-cols-1", mode === "edit" ? "lg:grid-cols-[264px_1fr_288px]" : "lg:grid-cols-[1fr_300px]")}>
        {mode === "edit" && (
          <aside className="order-3 border-line bg-surface lg:order-1 lg:max-h-[calc(100dvh-57px)] lg:overflow-y-auto lg:border-r" aria-label="Add to plan">
            <AddPanel onAddRoom={addRoom} onAddFurniture={addFurniture} />
            <UnplacedPanel assets={unplaced} onPlace={(id) => placeAsset(id)} />
            <LayersPanel doc={doc} selection={selection} onSelect={select} assetName={assetName} />
          </aside>
        )}

        <div className="relative order-1 min-w-0 lg:order-2">
          <PlanCanvas
            ref={canvasRef}
            doc={doc}
            editable={mode === "edit"}
            extent={{ width: floor.width_cm, height: floor.depth_cm }}
            selection={selection}
            onSelect={select}
            onCommit={commit}
            markers={markers}
            onOpenAsset={(id) => setDrawerAsset(id)}
            onDropAsset={(id, p) => placeAsset(id, p)}
            illustrative={illustrative}
            height={canvasHeight}
            ariaLabel={`${floor.name} floor plan, ${mode} mode. ${mode === "edit" ? "Select with Layers, arrows to move, Delete to remove." : "Use the item list to open details."}`}
            onKeyDown={onKeyDown}
          />
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-md border border-line bg-surface p-0.5 shadow-sm">
            <IconButton label="Zoom out" shortcut="−" onClick={() => canvasRef.current?.zoomBy(0.8)}><ZoomOut /></IconButton>
            <IconButton label="Fit to screen" shortcut="0" onClick={() => canvasRef.current?.fit()}><Maximize /></IconButton>
            <IconButton label="Zoom in" shortcut="+" onClick={() => canvasRef.current?.zoomBy(1.25)}><ZoomIn /></IconButton>
          </div>
          {mode === "edit" && dirty && (
            <p className="absolute right-3 top-3 rounded-sm bg-warning-soft px-2 py-1 text-xs font-medium text-warning" role="status">Unsaved changes</p>
          )}
          {doc.rooms.length === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
              <div className="pointer-events-auto max-w-xs rounded-lg border border-line bg-surface p-5 text-center shadow-md">
                <p className="font-semibold">This floor is empty</p>
                <p className="mt-1 text-sm text-fg-muted">{mode === "edit" ? "Add a room to start drawing your plan." : "Switch to Edit to draw rooms, or reset to a template."}</p>
                <Button className="mt-3" variant="primary" size="sm" onClick={() => (mode === "edit" ? addRoom() : switchMode("edit"))}>
                  {mode === "edit" ? "Add a room" : "Start editing"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {mode === "edit" ? (
          <aside className="order-2 border-line bg-surface lg:order-3 lg:max-h-[calc(100dvh-57px)] lg:overflow-y-auto lg:border-l" aria-label="Properties">
            <PropertiesPanel doc={doc} selection={selection} onChange={commit} onDelete={deleteSelection} onDuplicate={duplicateSelection} onRotate={rotateSelection} onNudge={nudge} assetName={assetName} illustrative={illustrative} />
            <div className="hidden lg:block"><ShortcutHelp /></div>
          </aside>
        ) : (
          <aside className="order-2 border-line bg-surface lg:max-h-[calc(100dvh-57px)] lg:overflow-y-auto lg:border-l" aria-label="Rooms and items">
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
              <ul className="flex flex-col gap-3">
                {roomsWithAssets.map(({ room, items }) => (
                  <li key={room.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelection({ kind: "room", id: room.id });
                        canvasRef.current?.focusRect(room);
                      }}
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
                  <button type="button" className="font-medium text-accent hover:underline" onClick={() => switchMode("edit")}>Place {unplaced.length === 1 ? "it" : "them"}</button>
                </p>
              )}
              <p className="mt-4 hidden text-xs text-fg-subtle md:block">
                Scroll to pan, <Kbd>Ctrl</Kbd> + scroll or pinch to zoom.
              </p>
            </section>
          </aside>
        )}
      </div>

      <p className="sr-only" aria-live="polite">{announce}</p>

      <AssetDrawer
        assetId={mode === "view" ? drawerAsset : null}
        onClose={() => setDrawerAsset(null)}
        onEditPosition={editPosition}
        assets={props.assetOptions}
        members={props.members}
        refreshKey={props.assets}
      />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Discard unsaved changes?"
        description="Your edits to this floor plan haven’t been saved."
        confirmLabel="Discard changes"
        onConfirm={() => {
          confirm?.action();
          setConfirm(null);
        }}
      />
      <ResetLayoutDialog open={resetOpen} onOpenChange={setResetOpen} propertyType={props.property.property_type} hdbFlatType={props.property.hdb_flat_type} />
    </div>
  );
}
