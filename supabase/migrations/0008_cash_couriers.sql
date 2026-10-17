create table if not exists public.cash_couriers (
  id uuid primary key,
  province_id uuid not null references public.provinces (id) on delete cascade,
  name text not null default '',
  phone text not null default '',
  active boolean not null default true
);

alter table public.cash_couriers enable row level security;

grant all on table public.cash_couriers to anon, authenticated;

drop policy if exists web_all on public.cash_couriers;
create policy web_all on public.cash_couriers
  for all to anon, authenticated
  using (true)
  with check (true);

do $$
begin
  alter publication supabase_realtime add table public.cash_couriers;
exception
  when duplicate_object then null;
end $$;
