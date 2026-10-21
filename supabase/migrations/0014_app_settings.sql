create table if not exists public.app_settings (
  id text primary key default 'default' check (id = 'default'),
  advisor_commission_percent numeric(6, 2) not null default 6,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id)
values ('default')
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

grant all on table public.app_settings to anon, authenticated;

drop policy if exists web_all on public.app_settings;
create policy web_all on public.app_settings
  for all to anon, authenticated
  using (true)
  with check (true);

do $$
begin
  alter publication supabase_realtime add table public.app_settings;
exception
  when duplicate_object then null;
end $$;
