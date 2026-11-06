"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Segmented } from "@/components/ui/segmented";
import { add, mul, openingSpan, wallDir, wallSegments, wallsFromPolygons, type Pt, type Wall } from "./cad";
import { boundsOf, centre, newId, objectBounds, roomPolygon, type FloorDoc } from "./model";
import { FURNITURE_FILL, PLAN, ROOM_FILL } from "./palette";

/**
 * Live 3D view generated from the same drawing as the 2D plan — walls,
 * door/window openings, room floors, furniture and appliance pins. There is
 * no separate 3D model to maintain; edits appear here immediately.
 */
type Pin = { name: string; tone: "neutral" | "warning" | "danger" };

const m = (cm: number) => cm / 100;
const WALL_COLOUR = "#ece9e2";

function Controls({ target }: { target: [number, number, number] }) {
  const { camera, gl } = useThree();
  const ref = React.useRef<OrbitControls | null>(null);
  React.useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.target.set(...target);
    c.enableDamping = true;
    c.maxPolarAngle = Math.PI / 2.05;
    c.minDistance = 1.5;
    c.maxDistance = 80;
    ref.current = c;
    return () => c.dispose();
  }, [camera, gl, target]);
  useFrame(() => ref.current?.update());
  return null;
}

/** A box spanning wall distance [t0, t1] and height [y0, y1]. */
function WallPiece({ w, t0, t1, y0, y1, colour = WALL_COLOUR, opacity = 1 }: { w: Wall; t0: number; t1: number; y0: number; y1: number; colour?: string; opacity?: number }) {
  if (t1 - t0 < 0.5 || y1 - y0 < 0.5) return null;
  const d = wallDir(w);
  const mid = add(w.a, mul(d, (t0 + t1) / 2));
  const angle = -Math.atan2(d.y, d.x);
  return (
    <mesh position={[m(mid.x), m((y0 + y1) / 2), m(mid.y)]} rotation={[0, angle, 0]} castShadow receiveShadow>
      <boxGeometry args={[m(t1 - t0), m(y1 - y0), m(w.thickness)]} />
      <meshStandardMaterial color={colour} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

function RoomFloor({ pts, colour }: { pts: Pt[]; colour: string }) {
  const geometry = React.useMemo(() => {
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(m(p.x), -m(p.y))));
    return new THREE.ShapeGeometry(shape);
  }, [pts]);
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
      <meshStandardMaterial color={colour} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function Viewer3D({ doc, wallHeight, pins, onOpenAsset }: { doc: FloorDoc; wallHeight: number; pins: Record<string, Pin>; onOpenAsset?: (assetId: string) => void }) {
  const [cut, setCut] = React.useState<"full" | "cutaway">("full");
  const [hover, setHover] = React.useState<string | null>(null);
  const H = cut === "full" ? wallHeight : 100;

  const walls = React.useMemo(
    () => (doc.geometry.walls.length ? doc.geometry.walls : wallsFromPolygons(doc.rooms.map((r) => roomPolygon(r)), newId)),
    [doc.geometry.walls, doc.rooms],
  );
  const openings = doc.geometry.walls.length ? doc.geometry.openings : [];

  const all = [...walls.flatMap((w) => [w.a, w.b]), ...doc.rooms.flatMap((r) => roomPolygon(r))];
  const b = boundsOf(all.map((p) => ({ x: p.x, y: p.y, width: 0, height: 0 }))) ?? { x: 0, y: 0, width: 800, height: 600 };
  const cx = m(b.x + b.width / 2), cz = m(b.y + b.height / 2);
  const span = Math.max(m(b.width), m(b.height), 4);
  const target = React.useMemo<[number, number, number]>(() => [cx, 0, cz], [cx, cz]);
  // Frame the whole plan from above at an angle, never closer than ~9 m.
  const distance = Math.max(span * 1.45, 9);
  const camPos: [number, number, number] = [cx + distance * 0.42, distance * 0.78, cz + distance * 0.62];
  const [viewKey, setViewKey] = React.useState(0);

  return (
    <div className="relative size-full bg-[var(--plan-bg)]">
      <Canvas key={viewKey} flat shadows dpr={[1, 2]} camera={{ position: camPos, fov: 40 }} aria-label="3D view of the drawing">
        <color attach="background" args={[PLAN.bg]} />
        <hemisphereLight args={["#ffffff", "#e6e1d6", 1.5]} />
        <directionalLight position={[cx + 8, 16, cz + 6]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />
        <Controls target={target} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.01, cz]} receiveShadow>
          <planeGeometry args={[span * 4, span * 4]} />
          <meshStandardMaterial color="#efece5" />
        </mesh>

        {doc.rooms.map((r) => <RoomFloor key={r.id} pts={roomPolygon(r)} colour={ROOM_FILL[r.roomType] ?? ROOM_FILL.other} />)}

        {walls.map((w) => (
          <group key={w.id}>
            {wallSegments(w, openings).map(([t0, t1], i) => <WallPiece key={i} w={w} t0={t0} t1={t1} y0={0} y1={H} />)}
            {openings.filter((o) => o.wallId === w.id).map((o) => {
              const t0 = o.offset - o.width / 2, t1 = o.offset + o.width / 2;
              if (o.kind === "window") {
                return (
                  <group key={o.id}>
                    <WallPiece w={w} t0={t0} t1={t1} y0={0} y1={Math.min(o.sill, H)} />
                    <WallPiece w={w} t0={t0} t1={t1} y0={Math.min(o.sill + o.height, H)} y1={H} />
                    <WallPiece w={{ ...w, thickness: 2 }} t0={t0} t1={t1} y0={Math.min(o.sill, H)} y1={Math.min(o.sill + o.height, H)} colour="#a9c7d6" opacity={0.45} />
                  </group>
                );
              }
              return <WallPiece key={o.id} w={w} t0={t0} t1={t1} y0={Math.min(o.height, H)} y1={H} />;
            })}
          </group>
        ))}

        {/* Door leaves (open 90°) so doors read clearly */}
        {openings.filter((o) => o.kind === "door").map((o) => {
          const w = walls.find((x) => x.id === o.wallId);
          if (!w) return null;
          const { start, end } = openingSpan(w, o);
          const hinge = o.hingeEnd ? end : start;
          const d = wallDir(w);
          const n = { x: -d.y * (o.flip ? -1 : 1), y: d.x * (o.flip ? -1 : 1) };
          const tip = add(hinge, mul(n, -o.width));
          const mid = { x: (hinge.x + tip.x) / 2, y: (hinge.y + tip.y) / 2 };
          const angle = -Math.atan2(tip.y - hinge.y, tip.x - hinge.x);
          const h = Math.min(o.height, H);
          return (
            <mesh key={`leaf-${o.id}`} position={[m(mid.x), m(h / 2), m(mid.y)]} rotation={[0, angle, 0]} castShadow>
              <boxGeometry args={[m(o.width), m(h), 0.04]} />
              <meshStandardMaterial color="#c9b79c" />
            </mesh>
          );
        })}

        {doc.objects.filter((o) => o.kind === "furniture").map((o) => {
          const bb = objectBounds(o);
          const h = o.furnitureType?.startsWith("bed") ? 45 : o.furnitureType === "wardrobe" ? 190 : o.furnitureType === "counter" ? 90 : o.furnitureType === "shelf" ? 180 : 60;
          return (
            <mesh key={o.id} position={[m(bb.x + bb.width / 2), m(Math.min(h, H) / 2), m(bb.y + bb.height / 2)]} castShadow>
              <boxGeometry args={[m(bb.width), m(Math.min(h, H)), m(bb.height)]} />
              <meshStandardMaterial color={FURNITURE_FILL} />
            </mesh>
          );
        })}

        {doc.objects.filter((o) => o.kind === "asset" && o.assetId && pins[o.assetId]).map((o) => {
          const pin = pins[o.assetId!];
          const c = centre(objectBounds(o));
          const colour = pin.tone === "danger" ? PLAN.danger : pin.tone === "warning" ? PLAN.warning : PLAN.accent;
          const top = m(Math.min(H, wallHeight)) + 0.35;
          return (
            <group
              key={o.id}
              position={[m(c.x), 0, m(c.y)]}
              onPointerOver={(e) => { e.stopPropagation(); setHover(pin.name); document.body.style.cursor = "pointer"; }}
              onPointerOut={() => { setHover(null); document.body.style.cursor = ""; }}
              onClick={(e) => { e.stopPropagation(); onOpenAsset?.(o.assetId!); }}
            >
              <mesh position={[0, top / 2, 0]}><cylinderGeometry args={[0.02, 0.02, top, 8]} /><meshStandardMaterial color={colour} /></mesh>
              <mesh position={[0, top, 0]} castShadow><sphereGeometry args={[0.14, 24, 16]} /><meshStandardMaterial color={colour} /></mesh>
            </group>
          );
        })}
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-line bg-surface/95 px-3 py-2 text-xs text-fg-muted shadow-sm">
        {hover ? <span className="font-medium text-fg">{hover}</span> : "Drag to orbit · scroll to zoom · right-drag to pan"}
      </div>
      <div className="absolute right-3 top-3 flex items-center gap-2">
        <button type="button" onClick={() => setViewKey((k) => k + 1)} className="h-8 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-fg-muted shadow-xs hover:text-fg">Reset view</button>
        <Segmented size="sm" label="Walls" value={cut} onChange={setCut} options={[{ value: "full", label: "Full walls" }, { value: "cutaway", label: "Cutaway" }]} />
      </div>
    </div>
  );
}
