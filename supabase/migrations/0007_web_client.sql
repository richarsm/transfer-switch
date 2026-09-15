-- App web sin Auth de Google todavía: perfiles propios + acceso anon + realtime.

alter table public.profiles drop constraint if exists profiles_id_fkey;

alter table public.operations drop constraint if exists operations_amount_cup_check;
alter table public.operations
  add constraint operations_amount_cup_check check (amount_cup >= 0);

alter table public.operations drop constraint if exists operations_amount_gyn_check;
alter table public.operations
  add constraint operations_amount_gyn_check check (amount_gyn > 0);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'invites',
    'profiles',
    'openings',
    'cards',
    'operations',
    'transfer_legs',
    'card_movements',
    'travel_offers',
    'itinerary_legs',
    'provinces',
    'province_movements',
    'beneficiaries'
  ]
  loop
    execute format('drop policy if exists web_all on public.%I', t);
    execute format(
      'create policy web_all on public.%I for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles',
    'openings',
    'cards',
    'operations',
    'transfer_legs',
    'card_movements',
    'travel_offers',
    'itinerary_legs',
    'provinces',
    'province_movements',
    'beneficiaries'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;

insert into public.profiles (id, email, display_name, phone, role, active)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'admin@transferswitch.local',
    'Administrador',
    '+592 600 0000',
    'admin',
    true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'asesor@transferswitch.local',
    'Asesor Georgetown',
    '+592 650 1122',
    'operator',
    true
  )
on conflict (id) do update
set
  email = excluded.email,
  display_name = excluded.display_name,
  phone = excluded.phone,
  role = excluded.role,
  active = excluded.active;

insert into public.provinces (id, code, name, cash_cup, cash_usd, notes)
values
  ('a0000000-0000-4000-8000-000000000001', 'PRI', 'Pinar del Río', 0, 0, ''),
  ('a0000000-0000-4000-8000-000000000002', 'ART', 'Artemisa', 0, 0, ''),
  ('a0000000-0000-4000-8000-000000000003', 'HAB', 'La Habana', 800000, 2500, ''),
  ('a0000000-0000-4000-8000-000000000004', 'MAY', 'Mayabeque', 0, 0, ''),
  ('a0000000-0000-4000-8000-000000000005', 'MAT', 'Matanzas', 0, 0, ''),
  ('a0000000-0000-4000-8000-000000000006', 'CFG', 'Cienfuegos', 0, 0, ''),
  ('a0000000-0000-4000-8000-000000000007', 'VCL', 'Villa Clara', 0, 0, ''),
  ('a0000000-0000-4000-8000-000000000008', 'SSP', 'Sancti Spíritus', 0, 0, ''),
  ('a0000000-0000-4000-8000-000000000009', 'CAV', 'Ciego de Ávila', 0, 0, ''),
  ('a0000000-0000-4000-8000-000000000010', 'CMG', 'Camagüey', 150000, 500, ''),
  ('a0000000-0000-4000-8000-000000000011', 'LTU', 'Las Tunas', 0, 0, ''),
  ('a0000000-0000-4000-8000-000000000012', 'HOL', 'Holguín', 120000, 400, ''),
  ('a0000000-0000-4000-8000-000000000013', 'GRA', 'Granma', 0, 0, ''),
  ('a0000000-0000-4000-8000-000000000014', 'SCU', 'Santiago de Cuba', 220000, 800, ''),
  ('a0000000-0000-4000-8000-000000000015', 'GTM', 'Guantánamo', 0, 0, ''),
  ('a0000000-0000-4000-8000-000000000016', 'IJV', 'Isla de la Juventud', 0, 0, '')
on conflict (code) do nothing;

insert into public.cards (id, alias, bank, last4, holder, balance_cup, daily_limit, monthly_limit, active, notes)
values
  (
    '33333333-3333-4333-8333-333333333331',
    'BANDEC Principal',
    'BANDEC',
    '4412',
    'Casa Georgetown',
    450000,
    80000,
    1200000,
    true,
    ''
  ),
  (
    '33333333-3333-4333-8333-333333333332',
    'BPA Operativa',
    'BPA',
    '7781',
    'Casa Georgetown',
    210000,
    50000,
    800000,
    true,
    ''
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'Metropolitano Reserva',
    'Metropolitano',
    '0193',
    'Casa Georgetown',
    980000,
    120000,
    1500000,
    true,
    ''
  )
on conflict (id) do nothing;
