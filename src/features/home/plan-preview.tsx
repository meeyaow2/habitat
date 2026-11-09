import { add, doorSymbol, EMPTY_GEOMETRY, mul, openingSpan, perp, sub, unit, wallSegments, type Geometry } from "./cad";
import { boundsOf, roomLabelPlacement, roomPolygon, type FloorDoc, type PlanObject, type RoomShape } from "./model";
import { FURNITURE_FILL, FURNITURE_STROKE, ROOM_FILL } from "./palette";

type Marker = { x: number; y: number; tone?: "neutral" | "warning" | "danger" };

/** Static architectural SVG rendering shared by thumbnails and the landing page. */
export function PlanPreview({ rooms, objects = [], geometry, markers = [], labels = false, className, title }: {
  rooms: RoomShape[];
  objects?: PlanObject[];
  geometry?: Geometry;
  markers?: Marker[];
  labels?: boolean;
  className?: string;
  title: string;
}) {
  const b = boundsOf(rooms) ?? { x: 0, y: 0, width: 800, height: 600 };
  const pad = 42;
  const vb = `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`;
  if (rooms.length === 0) return <svg viewBox="0 0 400 300" className={className} role="img" aria-label={title}><defs><pattern id="pp-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--plan-grid)" strokeWidth="1" /></pattern></defs><rect width="400" height="300" fill="url(#pp-grid)" /><rect x="120" y="90" width="160" height="120" fill="none" stroke="var(--line-strong)" strokeDasharray="8 6" strokeWidth="2" rx="2" /></svg>;
  const walls = geometry?.walls ?? [];
  const openings = geometry?.openings ?? [];
  const labelDoc: FloorDoc = { rooms, objects, geometry: geometry ?? EMPTY_GEOMETRY };
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));
  const assetMarkers = objects.filter((object) => object.kind === "asset").map((object) => ({ x: object.x + object.width / 2, y: object.y + object.height / 2 }));
  const markerColour = (marker: Marker) => marker.tone === "danger" ? "var(--danger)" : marker.tone === "warning" ? "var(--warning)" : "var(--accent)";
  return (
    <svg viewBox={vb} className={className} role="img" aria-label={title} data-room-count={rooms.length} data-object-count={objects.length} data-opening-count={openings.length}>
      <rect x={b.x - pad} y={b.y - pad} width={b.width + pad * 2} height={b.height + pad * 2} fill="var(--plan-bg)" />
      {rooms.map((room, index) => <polygon key={index} points={roomPolygon(room).map((p) => `${p.x},${p.y}`).join(" ")} fill={ROOM_FILL[room.roomType] ?? ROOM_FILL.other} stroke={walls.length ? "none" : "var(--plan-wall)"} strokeWidth={8} />)}
      {objects.filter((object) => object.kind !== "asset").map((object) => <PreviewObject key={object.id} object={object} />)}
      {walls.map((wall) => wallSegments(wall, openings).map(([start, end], index) => {
        const direction = unit(sub(wall.b, wall.a));
        const a = add(wall.a, mul(direction, start));
        const z = add(wall.a, mul(direction, end));
        return <line key={`${wall.id}-${index}`} x1={a.x} y1={a.y} x2={z.x} y2={z.y} stroke="var(--plan-wall)" strokeWidth={wall.thickness} strokeLinecap="square" />;
      }))}
      {openings.map((opening) => {
        const wall = wallById.get(opening.wallId);
        if (!wall) return null;
        const span = openingSpan(wall, opening);
        const direction = unit(sub(wall.b, wall.a));
        const normal = perp(direction);
        if (opening.kind === "window") return <g key={opening.id} stroke="#607870" strokeWidth={3}>{[-wall.thickness / 3, 0, wall.thickness / 3].map((offset) => <line key={offset} x1={span.start.x + normal.x * offset} y1={span.start.y + normal.y * offset} x2={span.end.x + normal.x * offset} y2={span.end.y + normal.y * offset} />)}</g>;
        if (opening.kind === "opening") return null;
        const symbol = doorSymbol(wall, opening);
        return <g key={opening.id} fill="none" stroke="#59645f" strokeWidth={2.5}>{symbol.leaves.map((leaf, index) => {
          const cross = (leaf.closed.x - leaf.hinge.x) * (leaf.tip.y - leaf.hinge.y) - (leaf.closed.y - leaf.hinge.y) * (leaf.tip.x - leaf.hinge.x);
          return <g key={index}><line x1={leaf.hinge.x} y1={leaf.hinge.y} x2={leaf.tip.x} y2={leaf.tip.y} /><path d={`M ${leaf.closed.x} ${leaf.closed.y} A ${leaf.radius} ${leaf.radius} 0 0 ${cross > 0 ? 1 : 0} ${leaf.tip.x} ${leaf.tip.y}`} strokeDasharray="5 4" /></g>;
        })}{symbol.panels.map((panel, index) => <polygon key={index} points={panel.pts.map((p) => `${p.x},${p.y}`).join(" ")} />)}</g>;
      })}
      {labels && rooms.map((room, index) => {
        if (room.width < 120 || room.height < 85) return null;
        const placement = roomLabelPlacement(labelDoc, room);
        const size = placement.compact ? Math.max(12, Math.min(17, room.width / 12)) : Math.max(14, Math.min(22, room.width / 10));
        return <g key={`label-${index}`}>
          {placement.outside && placement.leader && <line x1={placement.x} y1={placement.y} x2={placement.leader.x} y2={placement.leader.y} stroke="var(--plan-label-muted)" strokeWidth={1.5} />}
          <rect x={placement.x - placement.width / 2} y={placement.y - size * .75} width={placement.width} height={size * 1.5} rx={3} fill="var(--plan-bg)" opacity={.82} />
          <text x={placement.x} y={placement.y + size / 3} textAnchor="middle" fontSize={size} fill="var(--plan-label)" fontWeight={650} fontFamily="var(--font-sans)">{room.name}</text>
        </g>;
      })}
      {[...markers, ...assetMarkers].map((marker, index) => <g key={`marker-${index}`}><circle cx={marker.x} cy={marker.y} r={16} fill="#fff" stroke={markerColour(marker)} strokeWidth={5} /><circle cx={marker.x} cy={marker.y} r={4.5} fill={markerColour(marker)} /></g>)}
    </svg>
  );
}

function PreviewObject({ object }: { object: PlanObject }) {
  const cx = object.x + object.width / 2;
  const cy = object.y + object.height / 2;
  return <g transform={`translate(${cx} ${cy}) rotate(${object.rotation}) translate(${-object.width / 2} ${-object.height / 2})`}>
    <rect width={object.width} height={object.height} rx={5} fill={FURNITURE_FILL} stroke={FURNITURE_STROKE} strokeWidth={2.5} />
    {(object.furnitureType === "bed_double" || object.furnitureType === "bed_single") && <g fill="none" stroke={FURNITURE_STROKE} strokeWidth={2}><rect x={12} y={10} width={object.width - 24} height={30} rx={5} /><line x1={0} y1={52} x2={object.width} y2={52} /></g>}
    {object.furnitureType === "sofa" && <rect x={10} y={object.height * .35} width={object.width - 20} height={object.height * .52} rx={8} fill="none" stroke={FURNITURE_STROKE} strokeWidth={2} />}
    {object.furnitureType === "dining_table" && <g>{[-18, object.height + 18].map((y) => <g key={y}>{[object.width * .25, object.width * .75].map((x) => <rect key={x} x={x - 15} y={y - 15} width={30} height={30} rx={7} fill={FURNITURE_FILL} stroke={FURNITURE_STROKE} strokeWidth={2} />)}</g>)}</g>}
    {(object.furnitureType === "sink" || object.furnitureType === "basin") && <rect x={7} y={7} width={object.width - 14} height={object.height - 14} rx={7} fill="none" stroke={FURNITURE_STROKE} strokeWidth={2} />}
    {object.furnitureType === "hob" && <g fill="none" stroke={FURNITURE_STROKE} strokeWidth={2}>{[[.3,.3],[.7,.3],[.3,.7],[.7,.7]].map(([x,y], i) => <circle key={i} cx={object.width*x} cy={object.height*y} r={8} />)}</g>}
    {object.furnitureType === "toilet" && <ellipse cx={object.width / 2} cy={object.height * .62} rx={object.width * .3} ry={object.height * .22} fill="none" stroke={FURNITURE_STROKE} strokeWidth={2} />}
    {object.furnitureType === "shower" && <g stroke={FURNITURE_STROKE} strokeWidth={1.5}><line x1={8} y1={8} x2={object.width - 8} y2={object.height - 8} /><line x1={object.width - 8} y1={8} x2={8} y2={object.height - 8} /></g>}
  </g>;
}
