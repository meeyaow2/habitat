-- =============================================================================
-- Habitat — local Postgres compatibility shim
-- =============================================================================
-- Hosted Supabase (and `supabase start`) already provide the `auth` schema,
-- `auth.uid()` and the anon / authenticated / service_role roles.
--
-- This file recreates the minimum surface needed so that the *same* migrations
-- and Row Level Security policies in supabase/migrations run unchanged on a
-- plain PostgreSQL 15+ server. It is applied by `npm run db:migrate` only when
-- the target database has no `auth` schema. Never apply it to Supabase.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- The application connects as a privileged role and switches to
-- `authenticated` per transaction, exactly as it does on Supabase.
grant anon, authenticated, service_role to current_user;

create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  encrypted_password  text,
  is_anonymous        boolean not null default false,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  raw_app_meta_data   jsonb not null default '{}'::jsonb,
  last_sign_in_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Same semantics as Supabase's auth.uid(): read the `sub` claim of the
-- request JWT that the server sets with set_config(..., is_local => true).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
