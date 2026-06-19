-- Add token for public form access and notification tracking
alter table public.site_visits
  add column if not exists token text unique,
  add column if not exists notification_sent boolean not null default false,
  add column if not exists notification_sent_at timestamptz;

-- Auto-generate a 32-char URL-safe token on insert using gen_random_uuid
create or replace function public.generate_site_visit_token()
returns trigger as $$
begin
  if new.token is null then
    new.token := replace(gen_random_uuid()::text, '-', '') || left(replace(gen_random_uuid()::text, '-', ''), 8);
    new.token := left(new.token, 32);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_site_visit_token on public.site_visits;
create trigger trg_site_visit_token
  before insert on public.site_visits
  for each row
  execute function public.generate_site_visit_token();

-- Backfill tokens for any existing rows
update public.site_visits
set token = left(replace(gen_random_uuid()::text, '-', '') || left(replace(gen_random_uuid()::text, '-', ''), 8), 32)
where token is null;

-- Now make token NOT NULL
alter table public.site_visits alter column token set not null;

-- Allow anon (public) access for token-based lookups.
-- NOTE: these blanket-anon policies are REMOVED in 20260614000007 and replaced
-- with SECURITY DEFINER RPCs (get_site_visit / submit_site_visit). Kept here for
-- migration-history continuity; guarded so a fresh db push doesn't collide.
drop policy if exists "Anon can read site_visits by token" on public.site_visits;
create policy "Anon can read site_visits by token"
  on public.site_visits for select
  to anon
  using (true);

drop policy if exists "Anon can update site_visits by token" on public.site_visits;
create policy "Anon can update site_visits by token"
  on public.site_visits for update
  to anon
  using (true)
  with check (true);
