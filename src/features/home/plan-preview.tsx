import { boundsOf, objectBounds, type PlanObject, type RoomShape } from "./model";
import { FURNITURE_FILL, FURNITURE_STROKE, ROOM_FILL } from "./palette";

type Marker = { x: number; y: number; tone?: "neutral" | "warning" | "danger" };

/** Static, non-interactive SVG rendering of a floor (thumbnails, marketing). */
export function PlanPreview({
  rooms,
  objects = [],
  markers = [],
  labels = false,
  className,
  title,
}: {
  rooms: Pick<RoomShape, "x" | "y" | "width" | "height" | "roomType" | "name">[];
  objects?: PlanObject[];
  markers?: Marker[];
  labels?: boolean;
  className?: string;
  title: string;
}) {
  const b = boundsOf(rooms) ?? { x: 0, y: 0, width: 800, height: 600 };
  const pad = 30;
  const vb = `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`;
  if (rooms.length === 0) {
    return (
      <svg viewBox="0 0 400 300" className={className} role="img" aria-label={title}>
        <defs>
          <pattern id="pp-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="var(--plan-grid)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="400" height="300" fill="url(#pp-grid)" />
        <rect x="120" y="90" width="160" height="120" fill="none" stroke="var(--line-strong)" strokeDasharray="8 6" strokeWidth="2" rx="2" />
      </svg>
    );
  }
  return (
    <svg viewBox={vb} className={className} role="img" aria-label={title}>
      {rooms.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill={ROOM_FILL[r.roomType] ?? ROOM_FILL.other} stroke="var(--plan-wall)" strokeWidth={Math.max(6, b.width / 220)} />
      ))}
      {objects.filter((o) => o.kind === "furniture").map((o) => {
        const ob = objectBounds(o);
        return <rect key={o.id} x={ob.x} y={ob.y} width={ob.width} height={ob.height} rx={8} fill={FURNITURE_FILL} stroke={FURNITURE_STROKE} strokeWidth={3} />;
      })}
      {labels &&
        rooms.map((r, i) =>
          r.width > 160 && r.height > 110 ? (
            <text key={`l${i}`} x={r.x + 18} y={r.y + 44} fontSize={Math.min(34, r.width / 7)} fill="var(--plan-label)" fontWeight={600} fontFamily="var(--font-sans)">
              {r.name}
            </text>
          ) : null,
        )}
      {markers.map((m, i) => (
        <g key={`m${i}`}>
          <circle cx={m.x} cy={m.y} r={26} fill="#fff" stroke={m.tone === "danger" ? "var(--danger)" : m.tone === "warning" ? "var(--warning)" : "var(--accent)"} strokeWidth={6} />
          <circle cx={m.x} cy={m.y} r={9} fill={m.tone === "danger" ? "var(--danger)" : m.tone === "warning" ? "var(--warning)" : "var(--accent)"} />
        </g>
      ))}
    </svg>
  );
}
