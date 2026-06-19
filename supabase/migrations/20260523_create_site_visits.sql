-- Create the site_visits table for tracking geologist field visits
create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  visit_date date not null,
  geologist_id uuid references public.profiles(id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  feasibility text
    check (feasibility in ('feasible', 'conditional', 'not_feasible')),
  water_confirmed boolean default false,
  access_confirmed boolean default false,
  security_confirmed boolean default false,
  fencing_confirmed boolean default false,
  observations jsonb,
  cost_factors jsonb,
  recommendations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast lookup by enquiry
create index if not exists idx_site_visits_enquiry_id on public.site_visits(enquiry_id);

-- Index for filtering by status
create index if not exists idx_site_visits_status on public.site_visits(status);

-- Auto-update updated_at
create or replace function public.set_site_visits_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_site_visits_updated_at on public.site_visits;
create trigger trg_site_visits_updated_at
  before update on public.site_visits
  for each row
  execute function public.set_site_visits_updated_at();

-- Enable RLS
alter table public.site_visits enable row level security;

-- RLS policies: authenticated users can CRUD
-- (Tightened later in 20260614000007; guarded here so a fresh db push that
--  already created site_visits via the full-schema snapshot does not collide.)
drop policy if exists "Authenticated users can read site_visits" on public.site_visits;
create policy "Authenticated users can read site_visits"
  on public.site_visits for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can insert site_visits" on public.site_visits;
create policy "Authenticated users can insert site_visits"
  on public.site_visits for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update site_visits" on public.site_visits;
create policy "Authenticated users can update site_visits"
  on public.site_visits for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can delete site_visits" on public.site_visits;
create policy "Authenticated users can delete site_visits"
  on public.site_visits for delete
  to authenticated
  using (true);
