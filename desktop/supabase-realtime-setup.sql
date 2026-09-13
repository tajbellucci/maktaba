-- Maktaba Naumania — one-time Realtime setup.
-- Paste this whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once (every step is idempotent).

-- 1. A single row that only ever tracks "when was the catalogue last published".
create table if not exists public.catalogue_version (
  id smallint primary key default 1,
  updated_at timestamptz not null default now(),
  publisher_label text,
  constraint catalogue_version_single_row check (id = 1)
);
insert into public.catalogue_version (id) values (1) on conflict (id) do nothing;

-- 2. Anyone (including a reader with no login) can read it — it carries no
--    personal data, just a timestamp and a machine hostname.
alter table public.catalogue_version enable row level security;
drop policy if exists "anyone can read catalogue_version" on public.catalogue_version;
create policy "anyone can read catalogue_version" on public.catalogue_version
  for select using (true);

-- 3. Only a logged-in master can bump it, and only through this one
--    function — never a direct table write. security definer lets it run
--    with the privilege to update the row regardless of the caller's own
--    row-level permissions; "grant execute ... to authenticated" is what
--    actually restricts who may call it to someone who has logged in.
create or replace function public.bump_catalogue_version(p_label text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.catalogue_version
  set updated_at = now(), publisher_label = coalesce(p_label, publisher_label)
  where id = 1;
end;
$$;

grant execute on function public.bump_catalogue_version(text) to authenticated;

-- 4. Turn on Realtime for this one table. Nothing else in this project is
--    exposed by this — every other table is unaffected. Guarded so running
--    this script a second time never errors with "already a member".
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'catalogue_version'
  ) then
    alter publication supabase_realtime add table public.catalogue_version;
  end if;
end $$;
