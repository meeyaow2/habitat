-- =============================================================================
-- Habitat — CAD drafting geometry
-- =============================================================================
-- Walls, door/window openings, dimension lines and text labels are drafting
-- geometry owned by a floor. They are stored together as one validated JSON
-- document per floor (saved atomically with the floor's version check).
-- Rooms stay relational because assets, tasks and expenses reference them;
-- a room may now be any polygon (x/y/width/height remain its bounding box).

alter table public.floors
  add column geometry jsonb not null default '{"walls":[],"openings":[],"dimensions":[],"labels":[]}'::jsonb,
  add column wall_height_cm integer not null default 260 check (wall_height_cm between 200 and 600),
  add constraint floors_geometry_shape check (
    jsonb_typeof(geometry) = 'object'
    and jsonb_typeof(geometry -> 'walls') = 'array'
    and jsonb_typeof(geometry -> 'openings') = 'array'
    and pg_column_size(geometry) < 1048576
  );

alter table public.rooms
  add column polygon jsonb check (
    polygon is null
    or (jsonb_typeof(polygon) = 'array' and jsonb_array_length(polygon) between 3 and 200)
  );

-- Members may rename levels and edit geometry (floors_update policy already
-- allows members); adding/removing levels stays owner-only.
grant update (name, geometry, wall_height_cm, version, width_cm, depth_cm) on public.floors to authenticated;
