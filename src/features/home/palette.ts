import type { RoomType } from "./model";

/** Muted room fills — distinguish room types without competing with status colours. */
export const ROOM_FILL: Record<RoomType, string> = {
  living: "#edf0e7",
  dining: "#f2efe5",
  kitchen: "#f4ece1",
  bedroom: "#e7ecef",
  bathroom: "#e1ebec",
  balcony: "#e9efe2",
  utility: "#eeece6",
  study: "#eceee8",
  storage: "#efede7",
  corridor: "#f7f6f2",
  household_shelter: "#e8e6df",
  garden: "#e3ecdc",
  garage: "#ebeae5",
  other: "#f0eee8",
};

export const ROOM_FILL_SELECTED = "#dce7df";
export const FURNITURE_FILL = "#ffffff";
export const FURNITURE_STROKE = "#b9b4a8";

/** Canvas colours (Konva cannot read CSS variables). Keep in sync with globals.css. */
export const PLAN = {
  bg: "#fbfaf7",
  grid: "#ebe8e1",
  gridMajor: "#dcd8cf",
  wall: "#3a403c",
  label: "#2a302c",
  labelMuted: "#5f6761",
  accent: "#42634f",
  accentSoft: "#e4ece6",
  warning: "#8a560b",
  danger: "#a3352c",
  guide: "#42634f",
  white: "#ffffff",
};
