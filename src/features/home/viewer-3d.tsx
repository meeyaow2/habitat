"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRouter } from "next/navigation";
import * as React from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { boundsOf, centre, objectBounds, type FloorDoc } from "./model";
import { FURNITURE_FILL, PLAN, ROOM_FILL } from "./palette";

/**
 * Lightweight 3D preview built entirely from the 2D floor-plan records:
 * room rectangles become floor slabs and low walls, asset markers become
 * pins. There is no separate 3D dataset to keep in sync.
 */
const WALL_H = 0.9; // metres: low "cutaway" walls keep the interior visible
const WALL_T = 0.08;

function Controls({ target }: { target: [number, number, number] }) {
  const { camera, gl } = useThree();
  const ref = React.useRef<OrbitControls | null>(null);
  React.useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.target.set(...target);
    c.enableDamping = true;
    c.maxPolarAngle = Math.PI / 2.15;
    c.minDistance = 3;
    c.maxDistance = 60;
    ref.current = c;
    return () => c.dispose();
  }, [camera, gl, target]);
  useFrame(() => ref.current?.update());
  return null;
}

type Pin = { assetId: string; name: string; tone: "neutral" | "warning" | "danger" };

export function Viewer3D({ doc, pins }: { doc: FloorDoc; pins: Record<string, Pin> }) {
  const router = useRouter();
  const [hover, setHover] = React.useState<string | null>(null);
  const b = boundsOf(doc.rooms) ?? { x: 0, y: 0, width: 800, height: 600 };
  const cx = (b.x + b.width / 2) / 100;
  const cz = (b.y + b.height / 2) / 100;
  const span = Math.max(b.width, b.height) / 100;
  const m = (cm: number) => cm / 100;

  return (
    <div className="relative h-[calc(100dvh-180px)] min-h-[420px] w-full overflow-hidden rounded-lg border border-line bg-[var(--plan-bg)]">
      <Canvas flat camera={{ position: [cx + span * 0.55, span * 0.9, cz + span * 0.95], fov: 40 }} dpr={[1, 2]} shadows>
        <color attach="background" args={[PLAN.bg]} />
        <hemisphereLight args={["#ffffff", "#e6e1d6", 1.5]} />
        <directionalLight position={[cx + 8, 14, cz + 6]} intensity={1.2} castShadow />
        <Controls target={[cx, 0, cz]} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.02, cz]} receiveShadow>
          <planeGeometry args={[span * 3, span * 3]} />
          <meshStandardMaterial color="#efece5" />
        </mesh>

        {doc.rooms.map((r) => {
          const x = m(r.x), z = m(r.y), w = m(r.width), d = m(r.height);
          return (
            <group key={r.id}>
              <mesh position={[x + w / 2, 0, z + d / 2]} receiveShadow>
                <boxGeometry args={[w, 0.04, d]} />
                <meshStandardMaterial color={ROOM_FILL[r.roomType] ?? ROOM_FILL.other} />
              </mesh>
              {[
                [x + w / 2, z, w, WALL_T],
                [x + w / 2, z + d, w, WALL_T],
                [x, z + d / 2, WALL_T, d],
                [x + w, z + d / 2, WALL_T, d],
              ].map(([px, pz, sx, sz], i) => (
                <mesh key={i} position={[px, WALL_H / 2, pz]} castShadow receiveShadow>
                  <boxGeometry args={[sx, WALL_H, sz]} />
                  <meshStandardMaterial color="#e9e6df" />
                </mesh>
              ))}
            </group>
          );
        })}

        {doc.objects.filter((o) => o.kind === "furniture").map((o) => {
          const bb = objectBounds(o);
          const h = o.furnitureType?.startsWith("bed") ? 0.45 : o.furnitureType === "wardrobe" ? 1.9 : o.furnitureType === "counter" ? 0.9 : 0.6;
          return (
            <mesh key={o.id} position={[m(bb.x + bb.width / 2), h / 2, m(bb.y + bb.height / 2)]} castShadow>
              <boxGeometry args={[m(bb.width), h, m(bb.height)]} />
              <meshStandardMaterial color={FURNITURE_FILL} />
            </mesh>
          );
        })}

        {doc.objects.filter((o) => o.kind === "asset" && o.assetId && pins[o.assetId]).map((o) => {
          const pin = pins[o.assetId!];
          const c = centre(objectBounds(o));
          const colour = pin.tone === "danger" ? PLAN.danger : pin.tone === "warning" ? PLAN.warning : PLAN.accent;
          return (
            <group
              key={o.id}
              position={[m(c.x), 0, m(c.y)]}
              onPointerOver={(e) => { e.stopPropagation(); setHover(pin.name); document.body.style.cursor = "pointer"; }}
              onPointerOut={() => { setHover(null); document.body.style.cursor = ""; }}
              onClick={(e) => { e.stopPropagation(); router.push(`/assets/${pin.assetId}`); }}
            >
              <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.02, 0.02, 1.2, 8]} /><meshStandardMaterial color={colour} /></mesh>
              <mesh position={[0, 1.25, 0]} castShadow><sphereGeometry args={[0.14, 24, 16]} /><meshStandardMaterial color={colour} /></mesh>
            </group>
          );
        })}
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-line bg-surface/95 px-3 py-2 text-xs text-fg-muted shadow-sm">
        {hover ? <span className="font-medium text-fg">{hover}</span> : "Drag to orbit · scroll to zoom · click a pin to open the item"}
      </div>
    </div>
  );
}
