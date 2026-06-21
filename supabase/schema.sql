-- FitTrack schema
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query) after creating your project.
-- Designed for a single user, but uses per-row ownership (user_id + RLS) so it stays
-- correct and secure even if you ever invite a second person later.

create extension if not exists "pgcrypto";

-- ---------- Daily tasks ----------
create table if not exists daily_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  task_date date not null default current_date,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_daily_tasks_date on daily_tasks (user_id, task_date);

-- ---------- Weekly tasks ----------
create table if not exists weekly_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  week_start date not null, -- Monday of the relevant week
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_weekly_tasks_week on weekly_tasks (user_id, week_start);

-- ---------- Food logs ----------
-- Note: we never store the photo itself, only the structured result, so this
-- table stays tiny (a few hundred bytes/row) and storage cost never grows.
create table if not exists food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  source text not null check (source in ('photo', 'manual', 'barcode')),
  food_name text not null,
  grams numeric,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  notes text
);
create index if not exists idx_food_logs_logged_at on food_logs (user_id, logged_at);

-- ---------- Weekly summaries ----------
-- Written by the server-side weekly cron job (using the service role key,
-- which bypasses RLS), then read by the logged-in user on summary.html.
create table if not exists weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  daily_tasks_completed int not null default 0,
  daily_tasks_total int not null default 0,
  weekly_tasks_completed int not null default 0,
  weekly_tasks_total int not null default 0,
  days_logged int not null default 0,
  total_calories numeric,
  avg_daily_calories numeric,
  prev_week_avg_calories numeric,
  recap_text text,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- ---------- Row Level Security ----------
alter table daily_tasks enable row level security;
alter table weekly_tasks enable row level security;
alter table food_logs enable row level security;
alter table weekly_summaries enable row level security;

create policy "own rows only - daily_tasks" on daily_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows only - weekly_tasks" on weekly_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows only - food_logs" on food_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- weekly_summaries: the user can only ever READ their own rows.
-- Inserts/updates happen server-side with the service role key, which bypasses RLS,
-- so there is intentionally no insert/update policy here for regular users.
create policy "read own summaries" on weekly_summaries
  for select using (auth.uid() = user_id);
