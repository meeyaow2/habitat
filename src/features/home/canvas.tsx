"use client";

import Konva from "konva";
import * as React from "react";
import { Circle, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Text, Transformer } from "react-konva";
import { category } from "@/lib/domain/categories";
import {
  alignRect,
  areaM2,
  docBounds,
  GRID_CM,
  MIN_OBJECT_CM,
  MIN_ROOM_CM,
  objectBounds,
  snap,
  type FloorDoc,
  type Guide,
  type PlanObject,
  type Rect as R,
  type RoomShape,
} from "./model";
import { FURNITURE_FILL, FURNITURE_STROKE, PLAN, ROOM_FILL, ROOM_FILL_SELECTED } from "./palette";
import { iconImage } from "./icon-images";

Konva.dragDistance = 4;
Konva.hitOnDragEnabled = true;

export type Selection = { kind: "room" | "object"; id: string } | null;
export type MarkerTone = "neutral" | "warning" | "danger";
export type MarkerInfo = { name: string; categoryId: string; tone: MarkerTone; reason: string | null };

export type CanvasHandle = {
  fit: () => void;
  zoomBy: (factor: number) => void;
  viewCentre: () => { x: number; y: number };
  focusRect: (r: R) => void;
};

type Props = {
  doc: FloorDoc;
  editable: boolean;
  extent: { width: number; height: number };
  selection: Selection;
  onSelect: (s: Selection) => void;
  onCommit: (doc: FloorDoc) => void;
  markers: Record<string, MarkerInfo>;
  onOpenAsset: (assetId: string) => void;
  onDropAsset: (assetId: string, p: { x: number; y: number }) => void;
  illustrative: boolean;
  height: number;
  ariaLabel: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
};

const MIN_SCALE = 0.08;
const MAX_SCALE = 5;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export const PlanCanvas = React.forwardRef<CanvasHandle, Props>(function PlanCanvas(props, ref) {
  const { doc, editable, extent, selection, onSelect, onCommit, markers, onOpenAsset, onDropAsset, illustrative, height } = props;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<Konva.Stage>(null);
  const trRef = React.useRef<Konva.Transformer>(null);
  const [width, setWidth] = React.useState(0);
  const [view, setView] = React.useState({ scale: 0.6, x: 40, y: 40 });
  const [guides, setGuides] = React.useState<Guide[]>([]);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [, forceRender] = React.useReducer((n: number) => n + 1, 0);
  const fitted = React.useRef(false);
  const pinch = React.useRef<{ dist: number; centre: { x: number; y: number } } | null>(null);

  // Track container width.
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
      const target = r ?? { x: 0, y: 0, width: extent.width, height: extent.height };
      const pad = width < 500 ? 24 : 56;
      const scale = clampScale(Math.min((width - pad * 2) / target.width, (height - pad * 2) / target.height, maxScale));
      setView({
        scale,
        x: (width - target.width * scale) / 2 - target.x * scale,
        y: (height - target.height * scale) / 2 - target.y * scale,
      });
    },
    [width, height, extent.width, extent.height],
  );

  const fit = React.useCallback(() => fitTo(docBounds(doc)), [fitTo, doc]);

  React.useEffect(() => {
    if (width && !fitted.current) {
      fitted.current = true;
      fit();
    }
  }, [width, fit]);

  const zoomAround = React.useCallback((factor: number, point?: { x: number; y: number }) => {
    setView((v) => {
      const p = point ?? { x: width / 2, y: height / 2 };
      const scale = clampScale(v.scale * factor);
      const world = { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
      return { scale, x: p.x - world.x * scale, y: p.y - world.y * scale };
    });
  }, [width, height]);

  React.useImperativeHandle(ref, () => ({
    fit,
    zoomBy: (f) => zoomAround(f),
    viewCentre: () => ({ x: (width / 2 - view.x) / view.scale, y: (height / 2 - view.y) / view.scale }),
    focusRect: (r) => fitTo({ x: r.x - 150, y: r.y - 150, width: r.width + 300, height: r.height + 300 }, 1.6),
  }), [fit, zoomAround, width, height, view, fitTo]);

  // Test hook: lets browser automation locate canvas nodes (no data beyond what is rendered).
  React.useEffect(() => {
    (window as unknown as { __habitatStage?: Konva.Stage | null }).__habitatStage = stageRef.current;
  });

  // Attach the transformer to the selected room or furniture node.
  React.useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const obj = selection?.kind === "object" ? doc.objects.find((o) => o.id === selection.id) : null;
    const node = editable && selection && !(obj && obj.kind === "asset") ? stage.findOne(`#${selection.id}`) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selection, editable, doc]);

  const s = view.scale;
  const px = (n: number) => n / s; // screen px → world units

  // ---------------------------------------------------------------------
  // Room handlers
  // ---------------------------------------------------------------------
  const roomDragMove = (room: RoomShape) => (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const others = doc.rooms.filter((r) => r.id !== room.id);
    const res = alignRect({ x: node.x(), y: node.y(), width: room.width, height: room.height }, others, px(10));
    node.position({ x: res.x, y: res.y });
    setGuides(res.guides);
  };
  const roomDragEnd = (room: RoomShape) => (e: Konva.KonvaEventObject<DragEvent>) => {
    setGuides([]);
    const node = e.target;
    onCommit({ ...doc, rooms: doc.rooms.map((r) => (r.id === room.id ? { ...r, x: Math.round(node.x()), y: Math.round(node.y()) } : r)) });
  };
  const roomTransformEnd = (room: RoomShape) => (e: Konva.KonvaEventObject<Event>) => {
    const node = e.target;
    const w = Math.max(MIN_ROOM_CM, snap(room.width * node.scaleX(), GRID_CM));
    const h = Math.max(MIN_ROOM_CM, snap(room.height * node.scaleY(), GRID_CM));
    const x = snap(node.x(), GRID_CM);
    const y = snap(node.y(), GRID_CM);
    node.scale({ x: 1, y: 1 });
    node.position({ x, y });
    onCommit({ ...doc, rooms: doc.rooms.map((r) => (r.id === room.id ? { ...r, x, y, width: w, height: h } : r)) });
  };

  // ---------------------------------------------------------------------
  // Object handlers (centre-anchored groups)
  // ---------------------------------------------------------------------
  const objectDragMove = (o: PlanObject) => (e: Konva.KonvaEventObject<DragEvent>) => {
    if (o.kind === "asset") return;
    const node = e.target;
    const b = objectBounds(o);
    const moving = { x: node.x() - b.width / 2, y: node.y() - b.height / 2, width: b.width, height: b.height };
    const res = alignRect(moving, doc.rooms, px(8), 5);
    node.position({ x: res.x + b.width / 2, y: res.y + b.height / 2 });
    setGuides(res.guides);
  };
  const objectDragEnd = (o: PlanObject) => (e: Konva.KonvaEventObject<DragEvent>) => {
    setGuides([]);
    const node = e.target;
    const x = Math.round(node.x() - o.width / 2);
    const y = Math.round(node.y() - o.height / 2);
    onCommit({ ...doc, objects: doc.objects.map((p) => (p.id === o.id ? { ...p, x, y } : p)) });
  };
  const objectTransformEnd = (o: PlanObject) => (e: Konva.KonvaEventObject<Event>) => {
    const node = e.target;
    // Transformer scales along screen axes; map back onto the unrotated box.
    const rotated = o.rotation % 180 !== 0;
    const w = Math.max(MIN_OBJECT_CM, snap(o.width * (rotated ? node.scaleY() : node.scaleX()), 5));
    const h = Math.max(MIN_OBJECT_CM, snap(o.height * (rotated ? node.scaleX() : node.scaleY()), 5));
    node.scale({ x: 1, y: 1 });
    const cx = node.x();
    const cy = node.y();
    onCommit({ ...doc, objects: doc.objects.map((p) => (p.id === o.id ? { ...p, width: w, height: h, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2) } : p)) });
  };

  // ---------------------------------------------------------------------
  // Stage gestures
  // ---------------------------------------------------------------------
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current!;
    const pointer = stage.getPointerPosition() ?? { x: width / 2, y: height / 2 };
    if (e.evt.ctrlKey || e.evt.metaKey) {
      zoomAround(Math.exp(-e.evt.deltaY * 0.01), pointer);
    } else {
      setView((v) => ({ ...v, x: v.x - e.evt.deltaX, y: v.y - e.evt.deltaY }));
    }
  };

  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (t.length !== 2) return;
    e.evt.preventDefault();
    const stage = stageRef.current!;
    if (stage.isDragging()) stage.stopDrag();
    const rect = stage.container().getBoundingClientRect();
    const a = { x: t[0].clientX - rect.left, y: t[0].clientY - rect.top };
    const b = { x: t[1].clientX - rect.left, y: t[1].clientY - rect.top };
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (pinch.current) {
      zoomAround(dist / pinch.current.dist, centre);
      setView((v) => ({ ...v, x: v.x + centre.x - pinch.current!.centre.x, y: v.y + centre.y - pinch.current!.centre.y }));
    }
    pinch.current = { dist, centre };
  };

  const onStageDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target === e.target.getStage()) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
  };

  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === e.target.getStage() || e.target.name() === "backdrop") onSelect(null);
  };

  const selectedRoom = selection?.kind === "room" ? doc.rooms.find((r) => r.id === selection.id) : null;
  const labelSize = Math.min(px(13), 60);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={props.ariaLabel}
      aria-roledescription="floor plan"
      tabIndex={0}
      onKeyDown={props.onKeyDown}
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
      style={{ height }}
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
          draggable
          onDragEnd={onStageDragEnd}
          onWheel={onWheel}
          onTouchMove={onTouchMove}
          onTouchEnd={() => (pinch.current = null)}
          onClick={onStageClick}
          onTap={onStageClick}
        >
          {/* Grid */}
          <Layer listening={false}>
            <Rect name="backdrop" x={-2000} y={-2000} width={extent.width + 4000} height={extent.height + 4000} fill={PLAN.bg} />
            {s > 0.18 && <GridShape extent={extent} step={50} colour={PLAN.grid} />}
            <GridShape extent={extent} step={100} colour={PLAN.gridMajor} />
          </Layer>

          <Layer>
            {/* Rooms */}
            {doc.rooms.map((room) => {
              const isSel = selection?.kind === "room" && selection.id === room.id;
              const showLabel = room.width * s > 56 && room.height * s > 34;
              return (
                <Group
                  key={room.id}
                  id={room.id}
                  x={room.x}
                  y={room.y}
                  draggable={editable}
                  onDragStart={() => onSelect({ kind: "room", id: room.id })}
                  onDragMove={roomDragMove(room)}
                  onDragEnd={roomDragEnd(room)}
                  onTransformEnd={roomTransformEnd(room)}
                  onClick={() => onSelect({ kind: "room", id: room.id })}
                  onTap={() => onSelect({ kind: "room", id: room.id })}
                  onMouseEnter={(e) => editable && (e.target.getStage()!.container().style.cursor = "move")}
                  onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = "")}
                >
                  <Rect width={room.width} height={room.height} fill={isSel ? ROOM_FILL_SELECTED : ROOM_FILL[room.roomType] ?? ROOM_FILL.other} stroke={PLAN.wall} strokeWidth={8} />
                  {showLabel && (
                    <>
                      <Text text={room.name} x={px(9)} y={px(8)} width={Math.max(10, room.width - px(18))} fontSize={labelSize} fontStyle="600" fill={PLAN.label} fontFamily="Instrument Sans, system-ui, sans-serif" wrap="none" ellipsis listening={false} />
                      {room.height * s > 54 && (
                        <Text text={`${illustrative ? "≈ " : ""}${areaM2(room)} m²`} x={px(9)} y={px(8) + labelSize * 1.35} fontSize={labelSize * 0.86} fill={PLAN.labelMuted} fontFamily="Instrument Sans, system-ui, sans-serif" listening={false} />
                      )}
                    </>
                  )}
                </Group>
              );
            })}

            {/* Furniture: outer group (unrotated, centre origin) is the drag/transform target; the
                inner group carries the 90°-step rotation so labels stay horizontal. */}
            {doc.objects.filter((o) => o.kind !== "asset").map((o) => {
              const isSel = selection?.kind === "object" && selection.id === o.id;
              const b = objectBounds(o);
              return (
                <Group
                  key={o.id}
                  id={o.id}
                  x={o.x + o.width / 2}
                  y={o.y + o.height / 2}
                  draggable={editable}
                  listening={editable}
                  onDragStart={() => onSelect({ kind: "object", id: o.id })}
                  onDragMove={objectDragMove(o)}
                  onDragEnd={objectDragEnd(o)}
                  onTransformEnd={objectTransformEnd(o)}
                  onClick={() => onSelect({ kind: "object", id: o.id })}
                  onTap={() => onSelect({ kind: "object", id: o.id })}
                >
                  <Group rotation={o.rotation} offsetX={o.width / 2} offsetY={o.height / 2}>
                    <Rect width={o.width} height={o.height} cornerRadius={6} fill={FURNITURE_FILL} stroke={isSel ? PLAN.accent : FURNITURE_STROKE} strokeWidth={isSel ? px(2) : px(1.25)} opacity={editable ? 1 : 0.85} />
                    <FurnitureDetail o={o} />
                  </Group>
                  {b.width * s > 54 && b.height * s > 16 && (
                    <Text text={o.label ?? ""} x={-b.width / 2} y={-b.height / 2} width={b.width} height={b.height} align="center" verticalAlign="middle" fontSize={Math.min(px(11), b.height * 0.4)} fill={PLAN.labelMuted} fontFamily="Instrument Sans, system-ui, sans-serif" wrap="none" ellipsis listening={false} />
                  )}
                </Group>
              );
            })}

            {/* Alignment guides */}
            {guides.map((g, i) =>
              g.orientation === "vertical" ? (
                <Line key={i} points={[g.position, g.from - 40, g.position, g.to + 40]} stroke={PLAN.guide} strokeWidth={px(1)} dash={[px(4), px(4)]} listening={false} />
              ) : (
                <Line key={i} points={[g.from - 40, g.position, g.to + 40, g.position]} stroke={PLAN.guide} strokeWidth={px(1)} dash={[px(4), px(4)]} listening={false} />
              ),
            )}

            {/* Dimensions for the selected room */}
            {editable && selectedRoom && (
              <Group listening={false}>
                <DimLabel x={selectedRoom.x + selectedRoom.width / 2} y={selectedRoom.y - px(14)} text={`${(selectedRoom.width / 100).toFixed(1)} m`} px={px} />
                <DimLabel x={selectedRoom.x - px(22)} y={selectedRoom.y + selectedRoom.height / 2} text={`${(selectedRoom.height / 100).toFixed(1)} m`} px={px} />
              </Group>
            )}

            <Transformer
              ref={trRef}
              rotateEnabled={false}
              keepRatio={false}
              flipEnabled={false}
              ignoreStroke
              borderStroke={PLAN.accent}
              anchorStroke={PLAN.accent}
              anchorFill={PLAN.white}
              anchorSize={10}
              anchorCornerRadius={2}
              boundBoxFunc={(oldBox, newBox) => {
                const min = (selection?.kind === "room" ? MIN_ROOM_CM : MIN_OBJECT_CM) * s;
                return newBox.width < min || newBox.height < min ? oldBox : newBox;
              }}
            />
          </Layer>

          {/* Asset markers: constant on-screen size */}
          <Layer>
            {doc.objects.filter((o) => o.kind === "asset" && o.assetId).map((o) => {
              const info = markers[o.assetId!];
              if (!info) return null;
              const isSel = selection?.kind === "object" && selection.id === o.id;
              const colour = info.tone === "danger" ? PLAN.danger : info.tone === "warning" ? PLAN.warning : PLAN.accent;
              const img = iconImage(category(info.categoryId).icon, colour, forceRender);
              const showName = isSel || hovered === o.id;
              return (
                <Group
                  key={o.id}
                  id={o.id}
                  x={o.x + o.width / 2}
                  y={o.y + o.height / 2}
                  scaleX={1 / s}
                  scaleY={1 / s}
                  draggable={editable}
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
                  {isSel && <Circle radius={23} fill={PLAN.accentSoft} stroke={PLAN.accent} strokeWidth={1.5} />}
                  <Circle radius={17} fill={PLAN.white} stroke={colour} strokeWidth={2.5} shadowColor="#1d221f" shadowOpacity={0.18} shadowBlur={6} shadowOffsetY={2} />
                  <KImage image={img} width={18} height={18} x={-9} y={-9} listening={false} />
                  {info.tone !== "neutral" && <Circle x={12} y={-12} radius={5} fill={colour} stroke={PLAN.white} strokeWidth={1.5} listening={false} />}
                  {showName && (
                    <Group y={24} listening={false}>
                      <Rect x={-Math.max(40, info.name.length * 3.6 + 10)} width={Math.max(80, info.name.length * 7.2 + 20)} height={info.reason ? 36 : 22} cornerRadius={4} fill="#1d221f" opacity={0.92} />
                      <Text text={info.name} x={-Math.max(40, info.name.length * 3.6 + 10)} width={Math.max(80, info.name.length * 7.2 + 20)} y={5} align="center" fontSize={12} fontStyle="600" fill="#fff" fontFamily="Instrument Sans, system-ui, sans-serif" />
                      {info.reason && <Text text={info.reason} x={-Math.max(40, info.name.length * 3.6 + 10)} width={Math.max(80, info.name.length * 7.2 + 20)} y={20} align="center" fontSize={10.5} fill="#e7e3da" fontFamily="Instrument Sans, system-ui, sans-serif" />}
                    </Group>
                  )}
                </Group>
              );
            })}
          </Layer>
        </Stage>
      )}
    </div>
  );
});

function GridShape({ extent, step, colour }: { extent: { width: number; height: number }; step: number; colour: string }) {
  return (
    <Shape
      listening={false}
      stroke={colour}
      strokeWidth={1}
      strokeScaleEnabled={false}
      sceneFunc={(ctx, shape) => {
        ctx.beginPath();
        for (let x = 0; x <= extent.width; x += step) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, extent.height);
        }
        for (let y = 0; y <= extent.height; y += step) {
          ctx.moveTo(0, y);
          ctx.lineTo(extent.width, y);
        }
        ctx.strokeShape(shape);
      }}
    />
  );
}

function DimLabel({ x, y, text, px }: { x: number; y: number; text: string; px: (n: number) => number }) {
  const w = px(44);
  const h = px(18);
  return (
    <Group x={x - w / 2} y={y - h / 2}>
      <Rect width={w} height={h} cornerRadius={px(3)} fill={PLAN.accent} />
      <Text text={text} width={w} height={h} align="center" verticalAlign="middle" fontSize={px(11)} fontStyle="600" fill={PLAN.white} fontFamily="Instrument Sans, system-ui, sans-serif" />
    </Group>
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
  if (o.furnitureType === "sofa") {
    return <Rect listening={false} x={12} y={o.height * 0.35} width={o.width - 24} height={o.height * 0.55} cornerRadius={6} stroke={stroke} strokeWidth={2} />;
  }
  if (o.furnitureType === "dining_table") {
    return <Rect listening={false} x={10} y={10} width={o.width - 20} height={o.height - 20} cornerRadius={4} stroke={stroke} strokeWidth={1.5} dash={[6, 4]} />;
  }
  if (o.furnitureType === "counter") {
    return <Line listening={false} points={[0, o.height - 12, o.width, o.height - 12]} stroke={stroke} strokeWidth={2} />;
  }
  return null;
}
