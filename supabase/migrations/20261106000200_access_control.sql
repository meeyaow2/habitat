-- =============================================================================
-- Habitat — access control
-- =============================================================================
-- Every table has RLS enabled. Access is granted only through household
-- membership. The app never relies on hidden buttons for authorisation: each
-- server request runs as the `authenticated` role with the caller's JWT claims,
-- so these policies apply to every query.
--
-- Roles
--   owner  — everything, including property settings, members, invitations,
--            and deleting any record.
--   member — read all household records; create assets, documents, tasks,
--            events and expenses; edit assets and the floor plan; update
--            tasks they created or are assigned; delete records they created.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper predicates (SECURITY DEFINER so they can read membership without
-- recursing into household_members' own policies).
-- -----------------------------------------------------------------------------
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid())
  )
$$;

create or replace function public.is_household_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid()) and m.role = 'owner'
  )
$$;

create or replace function public.shares_household_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs on theirs.household_id = mine.household_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  )
$$;

revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.is_household_owner(uuid) from public;
revoke all on function public.shares_household_with(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.shares_household_with(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Table privileges. RLS narrows these further.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.profiles               enable row level security;
alter table public.households             enable row level security;
alter table public.household_members      enable row level security;
alter table public.household_invitations  enable row level security;
alter table public.properties             enable row level security;
alter table public.floors                 enable row level security;
alter table public.rooms                  enable row level security;
alter table public.asset_categories       enable row level security;
alter table public.assets                 enable row level security;
alter table public.floor_plan_objects     enable row level security;
alter table public.documents              enable row level security;
alter table public.document_extractions   enable row level security;
alter table public.warranties             enable row level security;
alter table public.maintenance_tasks      enable row level security;
alter table public.maintenance_events     enable row level security;
alter table public.expenses               enable row level security;
alter table public.notifications          enable row level security;
alter table public.activity_logs          enable row level security;

-- Profiles ---------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_household_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Inserts happen through the auth.users trigger; deletes through account deletion.

-- Households -------------------------------------------------------------------
create policy households_select on public.households for select to authenticated
  using (public.is_household_member(id));
create policy households_update on public.households for update to authenticated
  using (public.is_household_owner(id)) with check (public.is_household_owner(id));
create policy households_delete on public.households for delete to authenticated
  using (public.is_household_owner(id));
-- Inserts happen only through create_household(), which also creates the owner membership.

-- Membership -------------------------------------------------------------------
create policy members_select on public.household_members for select to authenticated
  using (public.is_household_member(household_id));
create policy members_update on public.household_members for update to authenticated
  using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));
create policy members_delete on public.household_members for delete to authenticated
  using (public.is_household_owner(household_id) or user_id = (select auth.uid()));
-- Inserts happen only through create_household() and accept_invitation().

-- Invitations (owners only) ----------------------------------------------------
create policy invitations_select on public.household_invitations for select to authenticated
  using (public.is_household_owner(household_id));
create policy invitations_insert on public.household_invitations for insert to authenticated
  with check (public.is_household_owner(household_id) and invited_by = (select auth.uid()));
create policy invitations_update on public.household_invitations for update to authenticated
  using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));
create policy invitations_delete on public.household_invitations for delete to authenticated
  using (public.is_household_owner(household_id));

-- Properties (owners manage, members read) -------------------------------------
create policy properties_select on public.properties for select to authenticated
  using (public.is_household_member(household_id));
create policy properties_insert on public.properties for insert to authenticated
  with check (public.is_household_owner(household_id));
create policy properties_update on public.properties for update to authenticated
  using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));
create policy properties_delete on public.properties for delete to authenticated
  using (public.is_household_owner(household_id));

-- Floors -----------------------------------------------------------------------
create policy floors_select on public.floors for select to authenticated
  using (public.is_household_member(household_id));
create policy floors_insert on public.floors for insert to authenticated
  with check (public.is_household_owner(household_id));
-- Members may edit the layout, which bumps the floor version.
create policy floors_update on public.floors for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy floors_delete on public.floors for delete to authenticated
  using (public.is_household_owner(household_id));

-- Rooms & floor-plan objects (any member may edit the layout) --------------------
create policy rooms_all on public.rooms for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy floor_plan_objects_all on public.floor_plan_objects for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

-- Asset categories (global reference data) -------------------------------------
create policy asset_categories_select on public.asset_categories for select to authenticated
  using (true);
revoke insert, update, delete on public.asset_categories from authenticated;

-- Assets -----------------------------------------------------------------------
create policy assets_select on public.assets for select to authenticated
  using (public.is_household_member(household_id));
create policy assets_insert on public.assets for insert to authenticated
  with check (public.is_household_member(household_id) and created_by = (select auth.uid()));
create policy assets_update on public.assets for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy assets_delete on public.assets for delete to authenticated
  using (public.is_household_owner(household_id) or created_by = (select auth.uid()));

-- Warranties follow their asset ---------------------------------------------------
create policy warranties_select on public.warranties for select to authenticated
  using (public.is_household_member(household_id));
create policy warranties_write on public.warranties for insert to authenticated
  with check (public.is_household_member(household_id));
create policy warranties_update on public.warranties for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy warranties_delete on public.warranties for delete to authenticated
  using (public.is_household_member(household_id));

-- Documents --------------------------------------------------------------------
create policy documents_select on public.documents for select to authenticated
  using (public.is_household_member(household_id));
create policy documents_insert on public.documents for insert to authenticated
  with check (public.is_household_member(household_id) and uploaded_by = (select auth.uid()));
create policy documents_update on public.documents for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy documents_delete on public.documents for delete to authenticated
  using (public.is_household_owner(household_id) or uploaded_by = (select auth.uid()));

create policy document_extractions_select on public.document_extractions for select to authenticated
  using (public.is_household_member(household_id));
create policy document_extractions_insert on public.document_extractions for insert to authenticated
  with check (public.is_household_member(household_id) and created_by = (select auth.uid()));
create policy document_extractions_update on public.document_extractions for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy document_extractions_delete on public.document_extractions for delete to authenticated
  using (public.is_household_owner(household_id) or created_by = (select auth.uid()));

-- Maintenance ------------------------------------------------------------------
create policy tasks_select on public.maintenance_tasks for select to authenticated
  using (public.is_household_member(household_id));
create policy tasks_insert on public.maintenance_tasks for insert to authenticated
  with check (public.is_household_member(household_id) and created_by = (select auth.uid()));
create policy tasks_update on public.maintenance_tasks for update to authenticated
  using (
    public.is_household_owner(household_id)
    or (public.is_household_member(household_id)
        and (created_by = (select auth.uid()) or assigned_to = (select auth.uid())))
  )
  with check (public.is_household_member(household_id));
create policy tasks_delete on public.maintenance_tasks for delete to authenticated
  using (public.is_household_owner(household_id) or created_by = (select auth.uid()));

create policy events_select on public.maintenance_events for select to authenticated
  using (public.is_household_member(household_id));
create policy events_insert on public.maintenance_events for insert to authenticated
  with check (public.is_household_member(household_id) and created_by = (select auth.uid()));
create policy events_update on public.maintenance_events for update to authenticated
  using (public.is_household_owner(household_id) or created_by = (select auth.uid()))
  with check (public.is_household_member(household_id));
create policy events_delete on public.maintenance_events for delete to authenticated
  using (public.is_household_owner(household_id) or created_by = (select auth.uid()));

-- Expenses ---------------------------------------------------------------------
create policy expenses_select on public.expenses for select to authenticated
  using (public.is_household_member(household_id));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.is_household_member(household_id) and created_by = (select auth.uid()));
create policy expenses_update on public.expenses for update to authenticated
  using (public.is_household_owner(household_id) or created_by = (select auth.uid()))
  with check (public.is_household_member(household_id));
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.is_household_owner(household_id) or created_by = (select auth.uid()));

-- Notifications (personal) -----------------------------------------------------
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_insert on public.notifications for insert to authenticated
  with check (public.is_household_member(household_id));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- Activity (append-only) -------------------------------------------------------
create policy activity_select on public.activity_logs for select to authenticated
  using (public.is_household_member(household_id));
create policy activity_insert on public.activity_logs for insert to authenticated
  with check (public.is_household_member(household_id) and actor_id = (select auth.uid()));
revoke update, delete on public.activity_logs from authenticated;

-- =============================================================================
-- Integrity triggers
-- =============================================================================

-- Create a profile for every new auth user (works on Supabase and the local shim).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, is_demo)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1), ''), 80),
    coalesce((new.raw_user_meta_data ->> 'is_demo')::boolean, false) or coalesce(new.is_anonymous, false)
  )
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A household must always keep at least one owner while it has members.
create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_owners integer;
  remaining_members integer;
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;
  -- The household itself is being deleted: nothing to protect.
  if not exists (select 1 from public.households h where h.id = old.household_id) then
    return coalesce(new, old);
  end if;

  select count(*) filter (where role = 'owner' and user_id <> old.user_id),
         count(*) filter (where user_id <> old.user_id)
    into remaining_owners, remaining_members
  from public.household_members
  where household_id = old.household_id;

  if remaining_owners = 0 and (tg_op = 'UPDATE' or remaining_members > 0) then
    raise exception 'A household needs at least one owner. Transfer ownership first.'
      using errcode = 'P0001', hint = 'last_owner';
  end if;
  return coalesce(new, old);
end
$$;

create trigger household_members_protect_last_owner
  before update or delete on public.household_members
  for each row execute function public.protect_last_owner();

-- Remove a household once its last member leaves (e.g. account deletion).
create or replace function public.delete_orphaned_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.household_members where household_id = old.household_id) then
    delete from public.households where id = old.household_id;
  end if;
  return null;
end
$$;

create trigger household_members_delete_orphan
  after delete on public.household_members
  for each row execute function public.delete_orphaned_household();

-- =============================================================================
-- RPCs
-- =============================================================================

-- Create a household and make the caller its owner, atomically.
create or replace function public.create_household(p_name text, p_currency text default 'SGD', p_locale text default 'en-SG')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hid uuid;
  demo boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select is_demo into demo from public.profiles where id = uid;

  insert into public.households (name, created_by, currency, locale, is_demo)
  values (p_name, uid, upper(p_currency), p_locale, coalesce(demo, false))
  returning id into hid;

  insert into public.household_members (household_id, user_id, role) values (hid, uid, 'owner');

  update public.profiles set active_household_id = hid where id = uid;
  return hid;
end
$$;

-- Accept an invitation. The token never reaches the database; the server
-- passes its SHA-256 hash. The invitation is bound to the invited email.
create or replace function public.accept_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.household_invitations%rowtype;
  caller_email text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into inv from public.household_invitations where token_hash = p_token_hash for update;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002', hint = 'invitation_not_found';
  end if;
  if inv.revoked_at is not null then
    raise exception 'Invitation was revoked' using errcode = 'P0001', hint = 'invitation_revoked';
  end if;
  if inv.accepted_at is not null then
    raise exception 'Invitation already used' using errcode = 'P0001', hint = 'invitation_used';
  end if;
  if inv.expires_at < now() then
    raise exception 'Invitation expired' using errcode = 'P0001', hint = 'invitation_expired';
  end if;

  select lower(email) into caller_email from auth.users where id = uid;
  if caller_email is null or caller_email <> inv.email then
    raise exception 'Invitation is for a different email address' using errcode = '42501', hint = 'invitation_email_mismatch';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (inv.household_id, uid, inv.role)
  on conflict (household_id, user_id) do nothing;

  update public.household_invitations
     set accepted_at = now(), accepted_by = uid
   where id = inv.id;

  update public.profiles set active_household_id = inv.household_id where id = uid;
  return inv.household_id;
end
$$;

revoke all on function public.create_household(text, text, text) from public;
revoke all on function public.accept_invitation(text) from public;
grant execute on function public.create_household(text, text, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

-- Maintenance job: remove demo accounts older than the given age. Not callable
-- by end users; run with the service connection (see scripts/cleanup-demo.ts).
create or replace function public.cleanup_expired_demo_accounts(p_max_age interval default interval '24 hours')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.households where is_demo and created_at < now() - p_max_age;
  with gone as (
    delete from auth.users u
    using public.profiles p
    where p.id = u.id and p.is_demo and p.created_at < now() - p_max_age
    returning u.id
  )
  select count(*) into removed from gone;
  return removed;
end
$$;

revoke all on function public.cleanup_expired_demo_accounts(interval) from public;
revoke all on function public.cleanup_expired_demo_accounts(interval) from authenticated;

revoke all on function public.create_household(text, text, text) from anon;
revoke all on function public.accept_invitation(text) from anon;
revoke all on function public.cleanup_expired_demo_accounts(interval) from anon;
revoke all on function public.is_household_member(uuid) from anon;
revoke all on function public.is_household_owner(uuid) from anon;
revoke all on function public.shares_household_with(uuid) from anon;

-- Column-level update privileges: system-managed columns (demo flags,
-- authorship, tenancy) cannot be rewritten by end users even where RLS
-- permits the row update.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_color, locale, currency, timezone, active_household_id,
              onboarding_step, onboarding_completed_at, ai_consent_at)
  on public.profiles to authenticated;

revoke update on public.households from authenticated;
grant update (name, currency, locale, warranty_reminder_days) on public.households to authenticated;

revoke update on public.household_members from authenticated;
grant update (role) on public.household_members to authenticated;

revoke update on public.household_invitations from authenticated;
grant update (revoked_at) on public.household_invitations to authenticated;

revoke update on public.activity_logs from authenticated;

-- Future tables get the same baseline privileges (Supabase already does this).
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
