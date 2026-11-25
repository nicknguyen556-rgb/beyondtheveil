-- Geocatch Datalink — premium sync schema (apply in Supabase SQL editor).
-- No secrets required. RLS scopes rows to auth.uid().

-- Profiles / entitlement (optional remote source of truth)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  entitlement text not null default 'free'
    check (entitlement in ('free', 'premium')),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "profiles_upsert_own"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id);

-- Observations (last-write-wins via updated_at)
create table if not exists public.observations (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  photo_storage_path text,
  latitude double precision,
  longitude double precision,
  captured_at timestamptz not null,
  place_label text,
  place_source text check (place_source is null or place_source in ('exif', 'device', 'manual')),
  time_source text check (time_source is null or time_source in ('exif', 'device', 'manual')),
  tags_json text not null default '[]',
  outcome_rating integer,
  outcome_notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists idx_observations_user_updated
  on public.observations (user_id, updated_at desc);

alter table public.observations enable row level security;

create policy "observations_select_own"
  on public.observations for select
  using (auth.uid() = user_id);

create policy "observations_insert_own"
  on public.observations for insert
  with check (auth.uid() = user_id);

create policy "observations_update_own"
  on public.observations for update
  using (auth.uid() = user_id);

create policy "observations_delete_own"
  on public.observations for delete
  using (auth.uid() = user_id);

-- Signals (replaced wholesale with the winning observation)
create table if not exists public.signals (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  observation_id text not null references public.observations (id) on delete cascade,
  key text not null,
  source text not null check (source in ('api', 'manual', 'derived')),
  value text,
  unit text,
  confidence double precision,
  created_at timestamptz not null
);

create index if not exists idx_signals_observation
  on public.signals (observation_id);

alter table public.signals enable row level security;

create policy "signals_select_own"
  on public.signals for select
  using (auth.uid() = user_id);

create policy "signals_insert_own"
  on public.signals for insert
  with check (auth.uid() = user_id);

create policy "signals_update_own"
  on public.signals for update
  using (auth.uid() = user_id);

create policy "signals_delete_own"
  on public.signals for delete
  using (auth.uid() = user_id);

-- Storage bucket for observation photos (create via dashboard or API):
--   name: observation-photos
--   public: false
-- Storage policies: authenticated users may read/write only under `{user_id}/`
