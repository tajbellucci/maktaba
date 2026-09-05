-- Maktaba Naumania — Supabase setup, Stage 1: login + single-active-master lock
-- Run this once in your Supabase project's SQL Editor (Dashboard → SQL Editor → New query).

-- ── The lock itself: exactly one row, ever ──────────────────────────────────
create table if not exists public.master_lock (
  id               int primary key default 1,
  holder_device_id text,
  holder_label     text,           -- e.g. "Librarian's PC" — shown to whoever is refused
  claimed_at       timestamptz,
  heartbeat_at     timestamptz,
  constraint single_row check (id = 1)
);

insert into public.master_lock (id) values (1)
  on conflict (id) do nothing;

alter table public.master_lock enable row level security;

-- Nobody touches this table directly — only through the function below,
-- which runs with elevated rights and does the check-and-claim atomically.
create policy "lock is readable by anyone" on public.master_lock
  for select using (true);

-- ── Atomic claim: prevents two devices claiming at the same instant ────────
-- STALE_SECONDS: if the current holder hasn't sent a heartbeat this long,
-- treat them as gone (crashed, lost power, closed without logging out) and
-- let a new device claim it. 120s matches a 60s heartbeat interval below.
create or replace function public.claim_master_lock(
  p_device_id text,
  p_label text,
  p_stale_seconds int default 120
) returns jsonb
language plpgsql
security definer
as $$
declare
  row_holder text;
  row_heartbeat timestamptz;
begin
  select holder_device_id, heartbeat_at into row_holder, row_heartbeat
  from public.master_lock where id = 1
  for update;  -- locks the row for the duration of this transaction

  if row_holder is null
     or row_holder = p_device_id
     or row_heartbeat < now() - (p_stale_seconds || ' seconds')::interval
  then
    update public.master_lock
    set holder_device_id = p_device_id,
        holder_label = p_label,
        claimed_at = case when row_holder is distinct from p_device_id then now() else claimed_at end,
        heartbeat_at = now()
    where id = 1;
    return jsonb_build_object('ok', true);
  else
    return jsonb_build_object('ok', false, 'held_by', row_holder, 'label',
      (select holder_label from public.master_lock where id = 1));
  end if;
end;
$$;

-- Any logged-in device calls this every ~60s while it holds the lock, to
-- prove it is still alive. If it stops calling, the lock goes stale and
-- another device may claim it.
create or replace function public.heartbeat_master_lock(p_device_id text)
returns boolean
language plpgsql
security definer
as $$
begin
  update public.master_lock
  set heartbeat_at = now()
  where id = 1 and holder_device_id = p_device_id;
  return found;
end;
$$;

-- Explicit logout: frees the lock immediately instead of waiting out the
-- stale timeout, so the next device doesn't have to wait 2 minutes.
create or replace function public.release_master_lock(p_device_id text)
returns boolean
language plpgsql
security definer
as $$
begin
  update public.master_lock
  set holder_device_id = null, holder_label = null, heartbeat_at = null
  where id = 1 and holder_device_id = p_device_id;
  return found;
end;
$$;

-- Anonymous devices (readers, and anyone attempting to log in) need to call
-- these three functions and read the lock row. They do NOT get general
-- write access to the table — only through the SECURITY DEFINER functions.
grant select on public.master_lock to anon, authenticated;
grant execute on function public.claim_master_lock to anon, authenticated;
grant execute on function public.heartbeat_master_lock to anon, authenticated;
grant execute on function public.release_master_lock to anon, authenticated;
