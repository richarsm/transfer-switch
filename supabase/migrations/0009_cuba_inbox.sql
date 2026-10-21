alter table public.operations
  add column if not exists tracking_code text not null default '';

alter table public.operations
  add column if not exists cuba_operator_id uuid;

create table if not exists public.cuba_operators (
  id uuid primary key,
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  active boolean not null default true,
  kinds text[] not null default array['transfer', 'mobile_recharge']::text[]
);

create table if not exists public.cuba_threads (
  id uuid primary key,
  operation_id uuid not null references public.operations (id) on delete cascade,
  operator_id uuid not null references public.cuba_operators (id) on delete restrict,
  code text not null default '',
  status text not null default 'queued',
  channel text not null default 'wa_me',
  assigned_at timestamptz not null default now(),
  sent_at timestamptz,
  replied_at timestamptz,
  timeout_at timestamptz,
  parsed_reference text not null default '',
  last_error text not null default ''
);

create table if not exists public.cuba_messages (
  id uuid primary key,
  thread_id uuid not null references public.cuba_threads (id) on delete cascade,
  operation_id uuid not null,
  operator_id uuid not null,
  channel text not null default 'wa_me',
  direction text not null default 'out',
  body text not null default '',
  media_url text not null default '',
  external_id text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists cuba_threads_code_idx on public.cuba_threads (code);
create index if not exists cuba_threads_status_idx on public.cuba_threads (status);
create index if not exists cuba_messages_thread_idx on public.cuba_messages (thread_id);

alter table public.cuba_operators enable row level security;
alter table public.cuba_threads enable row level security;
alter table public.cuba_messages enable row level security;

grant all on table public.cuba_operators to anon, authenticated;
grant all on table public.cuba_threads to anon, authenticated;
grant all on table public.cuba_messages to anon, authenticated;

drop policy if exists web_all on public.cuba_operators;
create policy web_all on public.cuba_operators
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists web_all on public.cuba_threads;
create policy web_all on public.cuba_threads
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists web_all on public.cuba_messages;
create policy web_all on public.cuba_messages
  for all to anon, authenticated
  using (true)
  with check (true);

do $$
begin
  alter publication supabase_realtime add table public.cuba_operators;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.cuba_threads;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.cuba_messages;
exception
  when duplicate_object then null;
end $$;
