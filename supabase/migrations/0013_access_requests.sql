create type public.access_request_status as enum ('pending', 'approved', 'rejected');

create table if not exists public.access_requests (
  id uuid primary key,
  email text not null,
  display_name text not null,
  phone text not null default '',
  note text not null default '',
  desk text not null default '' check (desk in ('', 'guyana', 'cuba')),
  status public.access_request_status not null default 'pending',
  decided_role public.user_role,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists access_requests_pending_email
  on public.access_requests (lower(email))
  where status = 'pending';

alter table public.access_requests enable row level security;

grant all on table public.access_requests to anon, authenticated;

drop policy if exists web_all on public.access_requests;
create policy web_all on public.access_requests
  for all to anon, authenticated
  using (true)
  with check (true);

do $$
begin
  alter publication supabase_realtime add table public.access_requests;
exception
  when duplicate_object then null;
end $$;
