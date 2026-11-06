-- =============================================================================
-- Habitat — reference data
-- =============================================================================
-- Asset categories are global and read-only for end users. Default footprints
-- are illustrative sizes used when placing an item on the floor plan.

insert into public.asset_categories (id, label, icon, is_appliance, default_width_cm, default_depth_cm, sort_order) values
  ('air_conditioner', 'Air conditioner',   'air-vent',        true,  90, 30, 10),
  ('refrigerator',    'Refrigerator',      'refrigerator',    true,  70, 70, 20),
  ('washing_machine', 'Washing machine',   'washing-machine', true,  60, 60, 30),
  ('dryer',           'Dryer',             'wind',            true,  60, 60, 40),
  ('television',      'Television',        'tv',              true, 120, 25, 50),
  ('water_heater',    'Water heater',      'heater',          true,  40, 40, 60),
  ('fan',             'Fan',               'fan',             true,  45, 45, 70),
  ('oven',            'Oven',              'cooking-pot',     true,  60, 60, 80),
  ('microwave',       'Microwave',         'microwave',       true,  50, 40, 90),
  ('dishwasher',      'Dishwasher',        'droplets',        true,  60, 60, 100),
  ('cooker_hob',      'Hob & hood',        'flame',           true,  80, 55, 110),
  ('water_filter',    'Water filter',      'glass-water',     true,  30, 30, 120),
  ('air_purifier',    'Air purifier',      'air-vent',        true,  35, 35, 130),
  ('vacuum',          'Vacuum / robot',    'circle-dot',      true,  35, 35, 140),
  ('computer',        'Computer',          'laptop',          true,  60, 40, 150),
  ('network',         'Router & network',  'router',          true,  30, 20, 160),
  ('lighting',        'Lighting',          'lamp',            false, 40, 40, 170),
  ('furniture',       'Furniture',         'armchair',        false, 90, 60, 180),
  ('other',           'Other',             'package',         false, 50, 50, 999)
on conflict (id) do update set
  label = excluded.label,
  icon = excluded.icon,
  is_appliance = excluded.is_appliance,
  default_width_cm = excluded.default_width_cm,
  default_depth_cm = excluded.default_depth_cm,
  sort_order = excluded.sort_order;
