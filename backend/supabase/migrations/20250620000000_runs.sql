-- Lightfern Reach: persisted run state (optional, behind SUPABASE_URL/SUPABASE_KEY)
create table if not exists public.runs (
  id uuid primary key,
  status text not null check (status in ('pending', 'running', 'completed', 'error')),
  brief jsonb not null,
  cards jsonb not null default '[]'::jsonb,
  stats jsonb not null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists runs_updated_at_idx on public.runs (updated_at desc);

-- Allow service-role key full access (adjust RLS for production)
alter table public.runs enable row level security;

create policy "service role full access"
  on public.runs
  for all
  using (true)
  with check (true);
