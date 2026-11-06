"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, ExternalLink, GripVertical, MapPin, Plus, RotateCw, Square, Trash2 } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { areaM2, FURNITURE_TYPES, ROOM_TYPES, type FloorDoc, type PlanObject, type RoomShape, type RoomType } from "./model";
import type { Selection } from "./canvas";
import { useOnChange } from "@/lib/client/use-on-change";

export type TwinAsset = {
  id: string;
  name: string;
  category_id: string;
  room_id: string | null;
  room_name: string | null;
  tone: "neutral" | "warning" | "danger";
  reason: string | null;
  placed_floor_id: string | null;
};

function PanelSection({ title, children, action, className }: { title: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-b border-line px-4 py-4 last:border-b-0", className)}>
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AddPanel({ onAddRoom, onAddFurniture }: { onAddRoom: () => void; onAddFurniture: (type: string) => void }) {
  return (
    <PanelSection title="Add">
      <Button variant="secondary" className="w-full justify-start" onClick={onAddRoom}><Square aria-hidden /> Room</Button>
      <label htmlFor="add-furniture" className="mt-3 block text-xs font-medium text-fg-muted">Furniture</label>
      <div className="mt-1.5 flex flex-wrap gap-1.5" id="add-furniture">
        {FURNITURE_TYPES.map((f) => (
          <button key={f.value} type="button" onClick={() => onAddFurniture(f.value)} className="h-8 rounded-sm border border-line bg-surface px-2 text-xs text-fg-muted hover:border-line-strong hover:text-fg">
            {f.label}
          </button>
        ))}
      </div>
    </PanelSection>
  );
}

export function UnplacedPanel({ assets, onPlace }: { assets: TwinAsset[]; onPlace: (id: string) => void }) {
  return (
    <PanelSection title={`Not on the plan · ${assets.length}`}>
      {assets.length === 0 ? (
        <p className="text-sm text-fg-muted">Every item is placed. Add more in Appliances & Assets.</p>
      ) : (
        <ul className="-mx-1 flex flex-col gap-0.5">
          {assets.map((a) => (
            <li
              key={a.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-habitat-asset", a.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              className="group flex cursor-grab items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-muted active:cursor-grabbing"
            >
              <GripVertical className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
              <CategoryIcon categoryId={a.category_id} className="size-4 shrink-0 text-fg-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{a.name}</span>
                {a.room_name && <span className="block truncate text-[11px] text-fg-subtle">{a.room_name}</span>}
              </span>
              <Button size="sm" variant="soft" className="h-7 px-2" onClick={() => onPlace(a.id)} aria-label={`Place ${a.name} on the plan`}>
                <MapPin aria-hidden /> Place
              </Button>
            </li>
          ))}
        </ul>
      )}
      {assets.length > 0 && <p className="mt-2 text-[11px] text-fg-subtle">Drag onto the plan, or press Place to drop it in its room.</p>}
    </PanelSection>
  );
}

export function LayersPanel({ doc, selection, onSelect, assetName }: { doc: FloorDoc; selection: Selection; onSelect: (s: Selection) => void; assetName: (id: string) => string }) {
  const item = (s: Selection, label: string, sub?: string) => {
    const active = selection?.id === s?.id;
    return (
      <li key={s!.id}>
        <button
          type="button"
          onClick={() => onSelect(s)}
          aria-pressed={active}
          className={cn("flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm", active ? "bg-accent-soft text-accent-soft-fg" : "hover:bg-surface-muted")}
        >
          <span className="truncate">{label}</span>
          {sub && <span className="shrink-0 text-[11px] text-fg-subtle">{sub}</span>}
        </button>
      </li>
    );
  };
  return (
    <PanelSection title="Layers">
      <ul className="-mx-1 max-h-72 overflow-y-auto" aria-label="Rooms and objects">
        {doc.rooms.map((r) => item({ kind: "room", id: r.id }, r.name, `${areaM2(r)} m²`))}
        {doc.objects.map((o) => item({ kind: "object", id: o.id }, o.kind === "asset" ? assetName(o.assetId!) : o.label ?? "Furniture", o.kind === "asset" ? "item" : "furniture"))}
      </ul>
    </PanelSection>
  );
}

export function CommitInput({ value, onCommit, label, id, type = "text", step, min, suffix }: { value: string; onCommit: (v: string) => void; label: string; id: string; type?: string; step?: string; min?: string; suffix?: string }) {
  const [draft, setDraft] = React.useState(value);
  useOnChange(value, (v) => setDraft(v));
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-fg-muted">{label}</label>
      <div className="relative">
        <Input
          id={id}
          type={type}
          step={step}
          min={min}
          inputMode={type === "number" ? "decimal" : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== value && onCommit(draft)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              if (draft !== value) onCommit(draft);
            }
            if (e.key === "Escape") setDraft(value);
          }}
          className={cn(suffix && "pr-8")}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">{suffix}</span>}
      </div>
    </div>
  );
}

export function NudgePad({ onNudge }: { onNudge: (dx: number, dy: number) => void }) {
  const b = "grid size-10 place-items-center rounded-md border border-line bg-surface text-fg-muted hover:bg-surface-muted hover:text-fg [&_svg]:size-4";
  return (
    <div className="flex items-center gap-3">
      <div className="grid grid-cols-3 gap-1" role="group" aria-label="Move selection">
        <span />
        <button type="button" className={b} onClick={() => onNudge(0, -10)} aria-label="Move up 10 cm"><ArrowUp /></button>
        <span />
        <button type="button" className={b} onClick={() => onNudge(-10, 0)} aria-label="Move left 10 cm"><ArrowLeft /></button>
        <span className="grid size-10 place-items-center text-[10px] text-fg-subtle">10cm</span>
        <button type="button" className={b} onClick={() => onNudge(10, 0)} aria-label="Move right 10 cm"><ArrowRight /></button>
        <span />
        <button type="button" className={b} onClick={() => onNudge(0, 10)} aria-label="Move down 10 cm"><ArrowDown /></button>
        <span />
      </div>
      <p className="text-[11px] leading-4 text-fg-subtle">Or use arrow keys on the plan. Hold Shift for 50 cm.</p>
    </div>
  );
}

export function PropertiesPanel({
  doc,
  selection,
  onChange,
  onDelete,
  onDuplicate,
  onRotate,
  onNudge,
  assetName,
  illustrative,
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
}) {
  if (!selection) {
    return (
      <PanelSection title="Selection">
        <p className="text-sm text-fg-muted">Select a room or object on the plan — or from Layers — to edit it.</p>
      </PanelSection>
    );
  }
  if (selection.kind === "room") {
    const room = doc.rooms.find((r) => r.id === selection.id);
    if (!room) return null;
    const update = (patch: Partial<RoomShape>) => onChange({ ...doc, rooms: doc.rooms.map((r) => (r.id === room.id ? { ...r, ...patch } : r)) });
    const metres = (v: string) => Math.max(50, Math.round(Number(v) * 100));
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
          <div className="grid grid-cols-2 gap-2">
            <CommitInput id="room-w" label="Width" type="number" step="0.1" min="0.5" suffix="m" value={(room.width / 100).toFixed(2)} onCommit={(v) => Number(v) > 0 && update({ width: metres(v) })} />
            <CommitInput id="room-h" label="Depth" type="number" step="0.1" min="0.5" suffix="m" value={(room.height / 100).toFixed(2)} onCommit={(v) => Number(v) > 0 && update({ height: metres(v) })} />
          </div>
          <p className="text-xs text-fg-muted">{illustrative ? "Approx. " : ""}{areaM2(room)} m²</p>
          <NudgePad onNudge={onNudge} />
          <div className="flex gap-2">
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

export function ShortcutHelp() {
  const rows: [string, string][] = [
    ["Arrows", "Move selection (Shift = 50 cm)"],
    ["Delete", "Delete / remove from plan"],
    ["R", "Rotate furniture"],
    ["Ctrl D", "Duplicate"],
    ["Ctrl Z / Ctrl Shift Z", "Undo / redo"],
    ["Ctrl S", "Save"],
    ["+ / − / 0", "Zoom in, out, fit"],
    ["Esc", "Clear selection"],
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

export { PanelSection, Plus };
