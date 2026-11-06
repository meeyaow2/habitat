export type RoomOption = { id: string; name: string; floor_name: string; floor_count: number };
export type AssetOption = { id: string; name: string; category_id: string; room_name: string | null };
export type MemberOption = { user_id: string; display_name: string; avatar_color: string; role: string };

export function roomLabel(r: RoomOption) {
  return r.floor_count > 1 ? `${r.name} · ${r.floor_name}` : r.name;
}
