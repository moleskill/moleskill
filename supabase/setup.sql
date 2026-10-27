-- Prisma migrations create every public application table. This file contains only
-- Supabase-specific objects that Prisma cannot manage: the private audio bucket and RLS.
insert into storage.buckets (id, name, public, file_size_limit)
values ('meetings', 'meetings', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

do $$
declare
  table_name text;
begin
  for table_name in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

-- Supabase creates storage.objects with RLS enabled by default. This app adds no
-- client policies; audio is accessed through server-side service-role calls and signed URLs.
