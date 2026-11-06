-- =============================================================================
-- Habitat — core schema
-- =============================================================================
-- Tenancy model: every household-owned row carries `household_id`.
-- Child tables reference parents through composite foreign keys on
-- (household_id, id). This guarantees at the database layer that a record can
-- never point at another household's record (foreign-key checks bypass RLS, so
-- RLS alone would not prevent cross-tenant references).
--
-- Money is stored as integer minor units (cents) with an ISO-4217 currency.
-- Floor-plan geometry is stored in centimetres.
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  display_name             text not null default '' check (char_length(display_name) <= 80),
  avatar_color             text not null default 'sage'
                           check (avatar_color in ('sage', 'slate', 'clay', 'sand', 'teal', 'plum')),
  locale                   text not null default 'en-SG' check (char_length(locale) between 2 and 16),
  currency                 char(3) not null default 'SGD',
  timezone                 text not null default 'Asia/Singapore',
  is_demo                  boolean not null default false,
  active_household_id      uuid,
  onboarding_step          text not null default 'welcome'
                           check (onboarding_step in ('welcome', 'home', 'layout', 'appliance', 'explore', 'done')),
  onboarding_completed_at  timestamptz,
  ai_consent_at            timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Households & membership
-- -----------------------------------------------------------------------------
create table public.households (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null check (char_length(name) between 1 and 80),
  created_by              uuid references public.profiles (id) on delete set null,
  is_demo                 boolean not null default false,
  currency                char(3) not null default 'SGD',
  locale                  text not null default 'en-SG',
  warranty_reminder_days  integer not null default 60 check (warranty_reminder_days between 7 and 365),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger households_updated_at before update on public.households
  for each row execute function public.set_updated_at();

alter table public.profiles
  add constraint profiles_active_household_fk
  foreign key (active_household_id) references public.households (id) on delete set null;

create table public.household_members (
  household_id  uuid not null references public.households (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  role          text not null check (role in ('owner', 'member')),
  joined_at     timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx on public.household_members (user_id);

create table public.household_invitations (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  email         text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role          text not null default 'member' check (role in ('owner', 'member')),
  token_hash    text not null unique check (char_length(token_hash) = 64),
  invited_by    uuid references public.profiles (id) on delete set null,
  expires_at    timestamptz not null,
  accepted_at   timestamptz,
  accepted_by   uuid references public.profiles (id) on delete set null,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

create unique index household_invitations_pending_uniq
  on public.household_invitations (household_id, email)
  where accepted_at is null and revoked_at is null;

-- -----------------------------------------------------------------------------
-- Properties, floors, rooms
-- -----------------------------------------------------------------------------
create table public.properties (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 80),
  property_type    text not null check (property_type in ('hdb', 'condo', 'landed', 'apartment', 'other')),
  hdb_flat_type    text check (hdb_flat_type in ('2_room', '3_room', '4_room', '5_room', 'executive')),
  template_key     text check (char_length(template_key) <= 64),
  -- Starter templates are illustrative. A user can mark a plan as measured
  -- once they have entered real dimensions.
  layout_accuracy  text not null default 'illustrative' check (layout_accuracy in ('illustrative', 'measured')),
  country          char(2) not null default 'SG',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (household_id, id),
  check (hdb_flat_type is null or property_type = 'hdb')
);

create index properties_household_idx on public.properties (household_id);
create trigger properties_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

create table public.floors (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null,
  property_id   uuid not null,
  name          text not null check (char_length(name) between 1 and 40),
  level         integer not null default 1,
  -- Optimistic concurrency token for the floor-plan editor.
  version       integer not null default 1,
  width_cm      integer not null default 1600 check (width_cm between 200 and 20000),
  depth_cm      integer not null default 1200 check (depth_cm between 200 and 20000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, id),
  unique (property_id, level),
  foreign key (household_id, property_id) references public.properties (household_id, id) on delete cascade
);

create trigger floors_updated_at before update on public.floors
  for each row execute function public.set_updated_at();

create table public.rooms (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null,
  floor_id      uuid not null,
  name          text not null check (char_length(name) between 1 and 60),
  room_type     text not null default 'other' check (room_type in (
                  'living', 'dining', 'kitchen', 'bedroom', 'bathroom', 'balcony', 'utility',
                  'study', 'storage', 'corridor', 'household_shelter', 'garden', 'garage', 'other')),
  x             double precision not null,
  y             double precision not null,
  width         double precision not null check (width >= 50 and width <= 20000),
  height        double precision not null check (height >= 50 and height <= 20000),
  rotation      double precision not null default 0,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, floor_id) references public.floors (household_id, id) on delete cascade
);

create index rooms_floor_idx on public.rooms (floor_id);
create trigger rooms_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Assets
-- -----------------------------------------------------------------------------
create table public.asset_categories (
  id                text primary key check (id ~ '^[a-z_]+$'),
  label             text not null,
  icon              text not null,
  is_appliance      boolean not null default true,
  default_width_cm  integer not null default 60,
  default_depth_cm  integer not null default 60,
  sort_order        integer not null default 0
);

create table public.assets (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households (id) on delete cascade,
  property_id           uuid,
  room_id               uuid,
  category_id           text not null references public.asset_categories (id),
  name                  text not null check (char_length(name) between 1 and 120),
  brand                 text check (char_length(brand) <= 80),
  model                 text check (char_length(model) <= 80),
  serial_number         text check (char_length(serial_number) <= 120),
  purchase_date         date,
  purchase_price_cents  bigint check (purchase_price_cents >= 0 and purchase_price_cents < 1000000000000),
  currency              char(3) not null default 'SGD',
  vendor                text check (char_length(vendor) <= 120),
  status                text not null default 'active'
                        check (status in ('active', 'needs_attention', 'in_repair', 'retired')),
  notes                 text check (char_length(notes) <= 4000),
  archived_at           timestamptz,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, property_id) references public.properties (household_id, id) on delete set null (property_id),
  foreign key (household_id, room_id) references public.rooms (household_id, id) on delete set null (room_id)
);

create index assets_household_active_idx on public.assets (household_id) where archived_at is null;
create index assets_household_category_idx on public.assets (household_id, category_id);
create index assets_room_idx on public.assets (room_id);
create trigger assets_updated_at before update on public.assets
  for each row execute function public.set_updated_at();

-- An asset has at most one position on a floor plan. The floor plan never
-- stores a copy of asset data: it references the asset record.
create table public.floor_plan_objects (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null,
  floor_id        uuid not null,
  kind            text not null check (kind in ('asset', 'furniture', 'fixture')),
  asset_id        uuid unique,
  furniture_type  text check (char_length(furniture_type) <= 40),
  label           text check (char_length(label) <= 60),
  x               double precision not null,
  y               double precision not null,
  width           double precision not null check (width >= 10 and width <= 5000),
  height          double precision not null check (height >= 10 and height <= 5000),
  rotation        double precision not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (household_id, id),
  check ((kind = 'asset') = (asset_id is not null)),
  foreign key (household_id, floor_id) references public.floors (household_id, id) on delete cascade,
  foreign key (household_id, asset_id) references public.assets (household_id, id) on delete cascade
);

create index floor_plan_objects_floor_idx on public.floor_plan_objects (floor_id);
create trigger floor_plan_objects_updated_at before update on public.floor_plan_objects
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Documents
-- -----------------------------------------------------------------------------
create table public.documents (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  asset_id           uuid,
  kind               text not null default 'other' check (kind in (
                       'receipt', 'manual', 'warranty', 'invoice', 'repair_report', 'renovation', 'other')),
  title              text not null check (char_length(title) between 1 and 160),
  storage_path       text not null unique,
  mime_type          text not null check (mime_type in (
                       'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes         integer not null check (size_bytes between 1 and 20971520),
  original_filename  text check (char_length(original_filename) <= 255),
  document_date      date,
  notes              text check (char_length(notes) <= 4000),
  uploaded_by        uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (household_id, id),
  -- Objects live under a household-scoped prefix in private storage.
  check (storage_path like household_id::text || '/%'),
  foreign key (household_id, asset_id) references public.assets (household_id, id) on delete set null (asset_id)
);

create index documents_household_idx on public.documents (household_id, created_at desc);
create index documents_asset_idx on public.documents (asset_id);
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

create table public.document_extractions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null,
  document_id   uuid not null,
  status        text not null default 'pending'
                check (status in ('pending', 'completed', 'failed', 'applied', 'discarded')),
  provider      text,
  model         text,
  -- { field: { value, status: extracted|inferred|missing|uncertain, evidence } }
  fields        jsonb not null default '{}'::jsonb,
  error         text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  applied_at    timestamptz,
  foreign key (household_id, document_id) references public.documents (household_id, id) on delete cascade
);

create index document_extractions_document_idx on public.document_extractions (document_id);

-- -----------------------------------------------------------------------------
-- Warranties
-- -----------------------------------------------------------------------------
create table public.warranties (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null,
  asset_id      uuid not null,
  kind          text not null default 'manufacturer'
                check (kind in ('manufacturer', 'extended', 'store', 'other')),
  provider      text check (char_length(provider) <= 120),
  starts_on     date,
  expires_on    date not null,
  terms         text check (char_length(terms) <= 4000),
  document_id   uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, id),
  check (starts_on is null or expires_on >= starts_on),
  foreign key (household_id, asset_id) references public.assets (household_id, id) on delete cascade,
  foreign key (household_id, document_id) references public.documents (household_id, id) on delete set null (document_id)
);

create index warranties_household_expiry_idx on public.warranties (household_id, expires_on);
create index warranties_asset_idx on public.warranties (asset_id);
create trigger warranties_updated_at before update on public.warranties
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Maintenance
-- -----------------------------------------------------------------------------
-- A task is a schedule. Recurring tasks stay `open` and their due date rolls
-- forward on completion; every completion is recorded as a maintenance_event.
create table public.maintenance_tasks (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households (id) on delete cascade,
  asset_id             uuid,
  title                text not null check (char_length(title) between 1 and 160),
  description          text check (char_length(description) <= 4000),
  assigned_to          uuid,
  due_on               date not null,
  recurrence_interval  integer check (recurrence_interval between 1 and 120),
  recurrence_unit      text check (recurrence_unit in ('day', 'week', 'month', 'year')),
  status               text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  priority             text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  -- Where the schedule came from. `general_guidance` must never be presented
  -- as manufacturer instructions.
  source               text not null default 'user' check (source in ('user', 'general_guidance', 'manufacturer')),
  last_completed_on    date,
  completed_at         timestamptz,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (household_id, id),
  check ((recurrence_interval is null) = (recurrence_unit is null)),
  foreign key (household_id, asset_id) references public.assets (household_id, id) on delete cascade,
  -- Tasks can only be assigned to members of the same household.
  foreign key (household_id, assigned_to) references public.household_members (household_id, user_id) on delete set null (assigned_to)
);

create index maintenance_tasks_household_due_idx on public.maintenance_tasks (household_id, status, due_on);
create index maintenance_tasks_asset_idx on public.maintenance_tasks (asset_id);
create trigger maintenance_tasks_updated_at before update on public.maintenance_tasks
  for each row execute function public.set_updated_at();

create table public.maintenance_events (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households (id) on delete cascade,
  task_id              uuid,
  asset_id             uuid,
  asset_name_snapshot  text,
  kind                 text not null check (kind in ('completed', 'service', 'repair', 'inspection', 'note')),
  title                text not null check (char_length(title) between 1 and 160),
  performed_on         date not null,
  performed_by         uuid references public.profiles (id) on delete set null,
  vendor               text check (char_length(vendor) <= 120),
  cost_cents           bigint check (cost_cents >= 0 and cost_cents < 1000000000000),
  notes                text check (char_length(notes) <= 4000),
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, task_id) references public.maintenance_tasks (household_id, id) on delete set null (task_id),
  foreign key (household_id, asset_id) references public.assets (household_id, id) on delete set null (asset_id)
);

create index maintenance_events_household_idx on public.maintenance_events (household_id, performed_on desc);
create index maintenance_events_asset_idx on public.maintenance_events (asset_id);

-- -----------------------------------------------------------------------------
-- Expenses (deterministic ledger — never AI generated)
-- -----------------------------------------------------------------------------
create table public.expenses (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households (id) on delete cascade,
  asset_id              uuid,
  -- Retained so financial history stays meaningful after an asset is deleted.
  asset_name_snapshot   text,
  maintenance_event_id  uuid,
  document_id           uuid,
  category              text not null check (category in (
                          'appliance_purchase', 'repair', 'servicing', 'renovation', 'parts', 'other')),
  description           text not null check (char_length(description) between 1 and 200),
  amount_cents          bigint not null check (amount_cents >= 0 and amount_cents < 1000000000000),
  currency              char(3) not null default 'SGD',
  incurred_on           date not null,
  vendor                text check (char_length(vendor) <= 120),
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, asset_id) references public.assets (household_id, id) on delete set null (asset_id),
  foreign key (household_id, maintenance_event_id) references public.maintenance_events (household_id, id) on delete set null (maintenance_event_id),
  foreign key (household_id, document_id) references public.documents (household_id, id) on delete set null (document_id)
);

create index expenses_household_date_idx on public.expenses (household_id, incurred_on desc);
create index expenses_asset_idx on public.expenses (asset_id);
create trigger expenses_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Notifications & activity
-- -----------------------------------------------------------------------------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null,
  user_id       uuid not null,
  kind          text not null check (kind in (
                  'task_due', 'task_overdue', 'task_assigned', 'warranty_expiring', 'invitation', 'system')),
  title         text not null check (char_length(title) <= 160),
  body          text check (char_length(body) <= 500),
  -- Internal, relative link only.
  link_path     text check (link_path ~ '^/[^/]'),
  entity_type   text,
  entity_id     uuid,
  dedupe_key    text,
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, dedupe_key),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);

create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

create table public.activity_logs (
  id            bigint generated always as identity primary key,
  household_id  uuid not null references public.households (id) on delete cascade,
  actor_id      uuid references public.profiles (id) on delete set null,
  action        text not null check (char_length(action) <= 40),
  entity_type   text not null check (char_length(entity_type) <= 40),
  entity_id     uuid,
  summary       text not null check (char_length(summary) <= 240),
  created_at    timestamptz not null default now()
);

create index activity_logs_household_idx on public.activity_logs (household_id, created_at desc);
