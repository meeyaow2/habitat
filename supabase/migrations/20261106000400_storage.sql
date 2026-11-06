-- =============================================================================
-- Habitat — private document storage (Supabase only)
-- =============================================================================
-- Skipped automatically on plain Postgres, where the app uses its local
-- filesystem storage adapter instead.
--
-- The server uploads and signs URLs after checking the `documents` row under
-- RLS. These storage policies are defence in depth for any direct client use:
-- objects live under `<household_id>/...` and only members may touch them.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema not present — skipping storage policies';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('household-documents', 'household-documents', false, 20971520,
          array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
  on conflict (id) do update set public = false;

  execute $p$
    create policy "household documents: members read" on storage.objects for select to authenticated
    using (bucket_id = 'household-documents'
           and public.is_household_member(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy "household documents: members upload" on storage.objects for insert to authenticated
    with check (bucket_id = 'household-documents'
                and public.is_household_member(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy "household documents: members delete" on storage.objects for delete to authenticated
    using (bucket_id = 'household-documents'
           and public.is_household_member(((storage.foldername(name))[1])::uuid))
  $p$;
end
$$;
