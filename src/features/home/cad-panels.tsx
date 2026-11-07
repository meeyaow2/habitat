"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowLeftRight, Copy, ExternalLink, FlipHorizontal2, RotateCw, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  angleDeg, clampOpening, formatArea, formatLength, parseLength, polygonArea, reclampOpenings, setWallLength, wallLength, wallsFromPolygons,
  DOOR_STYLE_LABELS, DOOR_STYLES, type DoorStyle, type Geometry, type OpeningKind,
} from "./cad";
import type { Layers, LayerKey, Selection } from "./canvas";
import { CommitInput, NudgePad, PanelSection } from "./edit-panels";
import { newId, roomPolygon, ROOM_TYPES, type FloorDoc, type PlanObject, type RoomType } from "./model";

const cm = (v: string) => parseLength(v.includes("m") || v.includes("c") ? v : `${v}cm`);

export function CadProperties({
  doc,
  selection,
  onChange,
  onDelete,
  onDuplicate,
  onRotate,
  onNudge,
  assetName,
  illustrative,
  level,
}: {
  doc: FloorDoc;
  selection: Selection;
  onChange: (doc: FloorDoc) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRotate: () => void;
  onNudge: (dx: number, dy: number) => void;
  assetName: (id: string) => string;
  illustrative: boolean;
  level: React.ReactNode;
}) {
  const g = doc.geometry;
  const setG = (next: Geometry) => onChange({ ...doc, geometry: next });

  if (!selection) {
    return (
      <>
        <PanelSection title="Drawing">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-fg-muted">Walls</dt><dd className="text-right tabular-nums">{g.walls.length}</dd>
            <dt className="text-fg-muted">Doors & windows</dt><dd className="text-right tabular-nums">{g.openings.length}</dd>
            <dt className="text-fg-muted">Rooms</dt><dd className="text-right tabular-nums">{doc.rooms.length}</dd>
            <dt className="text-fg-muted">Floor area</dt><dd className="text-right tabular-nums">{illustrative ? "≈ " : ""}{formatArea(doc.rooms.reduce((s, r) => s + polygonArea(roomPolygon(r)), 0))}</dd>
          </dl>
          <p className="mt-3 text-xs text-fg-muted">Select something on the drawing to edit it, or pick a tool on the left.</p>
        </PanelSection>
        {level}
      </>
    );
  }

  if (selection.kind === "wall") {
    const w = g.walls.find((x) => x.id === selection.id);
    if (!w) return null;
    const count = g.openings.filter((o) => o.wallId === w.id).length;
    return (
      <PanelSection title="Wall">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <CommitInput id="wall-len" label="Length" value={(wallLength(w) / 100).toFixed(2)} suffix="m" onCommit={(v) => { const l = parseLength(v); if (l) setG(setWallLength(g, w.id, l)); }} />
            <CommitInput id="wall-th" label="Thickness" value={String(w.thickness)} suffix="cm" onCommit={(v) => { const t = cm(v); if (t && t >= 2 && t <= 100) setG({ ...g, walls: g.walls.map((x) => (x.id === w.id ? { ...x, thickness: t } : x)) }); }} />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Thickness presets">
            {[10, 15, 20, 25].map((t) => (
              <button key={t} type="button" onClick={() => setG({ ...g, walls: g.walls.map((x) => (x.id === w.id ? { ...x, thickness: t } : x)) })} className={cn("h-7 rounded-sm border px-2 text-xs", w.thickness === t ? "border-accent bg-accent-soft text-accent-soft-fg" : "border-line text-fg-muted hover:border-line-strong")}>
                {t} cm
              </button>
            ))}
          </div>
          <p className="text-xs text-fg-muted">Angle {Math.round(angleDeg(w.a, w.b))}° · {count} opening{count === 1 ? "" : "s"}. Drag the square handles to move corners; joined walls follow.</p>
          <NudgePad onNudge={onNudge} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setG({ ...g, walls: g.walls.map((x) => (x.id === w.id ? { ...x, a: x.b, b: x.a } : x)), openings: g.openings.map((o) => (o.wallId === w.id ? { ...o, offset: wallLength(w) - o.offset, hingeEnd: !o.hingeEnd } : o)) })}>
              <ArrowLeftRight aria-hidden /> Reverse
            </Button>
            <Button size="sm" variant="danger-ghost" onClick={onDelete}><Trash2 aria-hidden /> Delete wall</Button>
          </div>
        </div>
      </PanelSection>
    );
  }

  if (selection.kind === "opening") {
    const o = g.openings.find((x) => x.id === selection.id);
    const w = o && g.walls.find((x) => x.id === o.wallId);
    if (!o || !w) return null;
    const update = (patch: Partial<typeof o>) =>
      setG({ ...g, openings: reclampOpenings(g.walls, g.openings.map((x) => (x.id === o.id ? { ...x, ...patch } : x))) });
    const fromStart = o.offset - o.width / 2;
    const style: DoorStyle = o.style ?? "single";
    return (
      <PanelSection title={o.kind === "door" ? "Door" : o.kind === "window" ? "Window" : "Opening"}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="op-kind" className="text-xs font-medium text-fg-muted">Type</label>
            <NativeSelect id="op-kind" value={o.kind} onChange={(e) => {
              const kind = e.target.value as OpeningKind;
              update({ kind, height: kind === "window" ? 120 : 210, sill: kind === "window" ? 90 : 0 });
            }}>
              <option value="door">Door</option>
              <option value="window">Window</option>
              <option value="opening">Opening (no door)</option>
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <CommitInput id="op-w" label="Width" value={String(Math.round(o.width))} suffix="cm" onCommit={(v) => { const x = cm(v); if (x) update(clampOpening(w, { offset: o.offset, width: x })); }} />
            <CommitInput id="op-off" label="From wall start" value={String(Math.round(fromStart))} suffix="cm" onCommit={(v) => { const x = cm(v); if (x !== null) update(clampOpening(w, { offset: x + o.width / 2, width: o.width })); }} />
            <CommitInput id="op-h" label="Height" value={String(o.height)} suffix="cm" onCommit={(v) => { const x = cm(v); if (x && x >= 30 && x <= 600) update({ height: x }); }} />
            {o.kind === "window" && <CommitInput id="op-sill" label="Sill height" value={String(o.sill)} suffix="cm" onCommit={(v) => { const x = cm(v); if (x !== null && x <= 500) update({ sill: x }); }} />}
          </div>
          {o.kind === "door" && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="op-style" className="text-xs font-medium text-fg-muted">Door style</label>
                <NativeSelect id="op-style" value={style} onChange={(e) => {
                  const style = e.target.value as DoorStyle;
                  // A double or sliding door is usually wider; widen a default-width door to suit.
                  const width = (style === "double" || style === "sliding") && o.width < 120 ? 150 : o.width;
                  update({ style, ...clampOpening(w, { offset: o.offset, width }) });
                }}>
                  {DOOR_STYLES.map((st) => <option key={st} value={st}>{DOOR_STYLE_LABELS[st]}</option>)}
                </NativeSelect>
              </div>
              <div className="flex flex-wrap gap-2">
                {style !== "pocket" && (
                  <Button size="sm" variant="secondary" onClick={() => update({ flip: !o.flip })}>
                    <FlipHorizontal2 aria-hidden /> {style === "sliding" ? "Swap panels" : "Flip swing"}
                  </Button>
                )}
                {(style === "single" || style === "pocket") && (
                  <Button size="sm" variant="secondary" onClick={() => update({ hingeEnd: !o.hingeEnd })}>
                    <ArrowLeftRight aria-hidden /> {style === "single" ? "Hinge side" : "Pocket side"}
                  </Button>
                )}
              </div>
            </>
          )}
          <p className="text-xs text-fg-muted">Drag it along the wall to reposition.</p>
          <div><Button size="sm" variant="danger-ghost" onClick={onDelete}><Trash2 aria-hidden /> Delete</Button></div>
        </div>
      </PanelSection>
    );
  }

  if (selection.kind === "dimension") {
    const d = g.dimensions.find((x) => x.id === selection.id);
    if (!d) return null;
    return (
      <PanelSection title="Dimension">
        <p className="text-sm">{formatLength(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y), { precise: true })}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <CommitInput id="dim-off" label="Offset" value={String(d.offset)} suffix="cm" onCommit={(v) => { const x = Number(v); if (Number.isFinite(x)) setG({ ...g, dimensions: g.dimensions.map((y) => (y.id === d.id ? { ...y, offset: Math.max(-2000, Math.min(2000, x)) } : y)) }); }} />
        </div>
        <div className="mt-3"><Button size="sm" variant="danger-ghost" onClick={onDelete}><Trash2 aria-hidden /> Delete</Button></div>
      </PanelSection>
    );
  }

  if (selection.kind === "label") {
    const l = g.labels.find((x) => x.id === selection.id);
    if (!l) return null;
    return (
      <PanelSection title="Text">
        <div className="flex flex-col gap-3">
          <CommitInput id="lbl-text" label="Text" value={l.text} onCommit={(v) => v.trim() && setG({ ...g, labels: g.labels.map((x) => (x.id === l.id ? { ...x, text: v.trim().slice(0, 80) } : x)) })} />
          <CommitInput id="lbl-size" label="Size" value={String(l.size)} suffix="cm" onCommit={(v) => { const x = Number(v); if (x >= 6 && x <= 200) setG({ ...g, labels: g.labels.map((y) => (y.id === l.id ? { ...y, size: x } : y)) }); }} />
          <div><Button size="sm" variant="danger-ghost" onClick={onDelete}><Trash2 aria-hidden /> Delete</Button></div>
        </div>
      </PanelSection>
    );
  }

  if (selection.kind === "room") {
    const room = doc.rooms.find((r) => r.id === selection.id);
    if (!room) return null;
    const pts = roomPolygon(room);
    const perimeter = pts.reduce((s, p, i) => s + Math.hypot(pts[(i + 1) % pts.length].x - p.x, pts[(i + 1) % pts.length].y - p.y), 0);
    const update = (patch: Partial<typeof room>) => onChange({ ...doc, rooms: doc.rooms.map((r) => (r.id === room.id ? { ...r, ...patch } : r)) });
    return (
      <PanelSection title="Room">
        <div className="flex flex-col gap-3">
          <CommitInput id="room-name" label="Name" value={room.name} onCommit={(v) => v.trim() && update({ name: v.trim().slice(0, 60) })} />
          <div className="flex flex-col gap-1">
            <label htmlFor="room-type" className="text-xs font-medium text-fg-muted">Type</label>
            <NativeSelect id="room-type" value={room.roomType} onChange={(e) => update({ roomType: e.target.value as RoomType })}>
              {ROOM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </NativeSelect>
          </div>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-fg-muted">Area</dt><dd className="text-right tabular-nums">{illustrative ? "≈ " : ""}{formatArea(polygonArea(pts))}</dd>
            <dt className="text-fg-muted">Perimeter</dt><dd className="text-right tabular-nums">{formatLength(perimeter)}</dd>
            <dt className="text-fg-muted">Corners</dt><dd className="text-right tabular-nums">{pts.length}</dd>
          </dl>
          <p className="text-xs text-fg-muted">Drag the round handles to reshape it; drag the room to move it.</p>
          <NudgePad onNudge={onNudge} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => {
              const walls = wallsFromPolygons([pts], newId);
              // Skip edges already covered by an existing wall.
              const fresh = walls.filter((nw) => !g.walls.some((ew) => (near(ew.a, nw.a) && near(ew.b, nw.b)) || (near(ew.a, nw.b) && near(ew.b, nw.a))));
              setG({ ...g, walls: [...g.walls, ...fresh] });
            }}><Square aria-hidden /> Draw walls around it</Button>
            <Button size="sm" variant="secondary" onClick={onDuplicate}><Copy aria-hidden /> Duplicate</Button>
            <Button size="sm" variant="danger-ghost" onClick={onDelete}><Trash2 aria-hidden /> Delete room</Button>
          </div>
        </div>
      </PanelSection>
    );
  }

  const o = doc.objects.find((x) => x.id === selection.id);
  if (!o) return null;
  const update = (patch: Partial<PlanObject>) => onChange({ ...doc, objects: doc.objects.map((x) => (x.id === o.id ? { ...x, ...patch } : x)) });
  if (o.kind === "asset") {
    return (
      <PanelSection title="Placed item">
        <p className="font-medium">{assetName(o.assetId!)}</p>
        <p className="mt-0.5 text-xs text-fg-muted">Its room is set automatically from where it sits when you save.</p>
        <div className="mt-3 flex flex-col gap-3">
          <NudgePad onNudge={onNudge} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" asChild><Link href={`/assets/${o.assetId}`}><ExternalLink aria-hidden /> Details</Link></Button>
            <Button size="sm" variant="danger-ghost" onClick={onDelete}><Trash2 aria-hidden /> Remove from plan</Button>
          </div>
        </div>
      </PanelSection>
    );
  }
  return (
    <PanelSection title="Furniture">
      <div className="flex flex-col gap-3">
        <CommitInput id="obj-label" label="Label" value={o.label ?? ""} onCommit={(v) => update({ label: v.trim().slice(0, 60) || null })} />
        <div className="grid grid-cols-2 gap-2">
          <CommitInput id="obj-w" label="Width" type="number" step="5" min="10" suffix="cm" value={String(Math.round(o.width))} onCommit={(v) => Number(v) >= 10 && update({ width: Math.round(Number(v)) })} />
          <CommitInput id="obj-h" label="Depth" type="number" step="5" min="10" suffix="cm" value={String(Math.round(o.height))} onCommit={(v) => Number(v) >= 10 && update({ height: Math.round(Number(v)) })} />
        </div>
        <NudgePad onNudge={onNudge} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onRotate}><RotateCw aria-hidden /> Rotate</Button>
          <Button size="sm" variant="secondary" onClick={onDuplicate}><Copy aria-hidden /> Duplicate</Button>
          <Button size="sm" variant="danger-ghost" onClick={onDelete}><Trash2 aria-hidden /> Delete</Button>
        </div>
      </div>
    </PanelSection>
  );
}

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < 2;

const LAYER_LABELS: [LayerKey, string][] = [
  ["walls", "Walls"],
  ["openings", "Doors & windows"],
  ["rooms", "Rooms & names"],
  ["furniture", "Furniture"],
  ["appliances", "Appliances"],
  ["dimensions", "Dimensions"],
  ["labels", "Text"],
  ["grid", "Grid"],
];

export function LayerToggles({ layers, onChange }: { layers: Layers; onChange: (l: Layers) => void }) {
  return (
    <PanelSection title="Layers">
      <ul className="flex flex-col gap-1">
        {LAYER_LABELS.map(([k, label]) => (
          <li key={k}>
            <label className="flex h-8 items-center gap-2.5 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={layers[k]} onChange={(e) => onChange({ ...layers, [k]: e.target.checked })} />
              {label}
            </label>
          </li>
        ))}
      </ul>
    </PanelSection>
  );
}
