-- Tarifas de efectivo en apertura + disponibilidad por provincia

alter table public.openings
  add column if not exists cash_cup_per_1000_gyn numeric(18, 2) not null default 0,
  add column if not exists cash_usd_per_1000_gyn numeric(18, 6) not null default 0;

alter type public.operation_kind add value if not exists 'cash_cup';
alter type public.operation_kind add value if not exists 'cash_usd';

alter table public.operations
  add column if not exists cuba_recipient_name text not null default '',
  add column if not exists cuba_address text not null default '',
  add column if not exists province_id uuid,
  add column if not exists amount_usd numeric(18, 2) not null default 0,
  add column if not exists rate_cash_cup_per_1000_gyn numeric(18, 2) not null default 0,
  add column if not exists rate_cash_usd_per_1000_gyn numeric(18, 6) not null default 0;

create table if not exists public.provinces (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  cash_cup numeric(18, 2) not null default 0,
  cash_usd numeric(18, 2) not null default 0,
  notes text not null default ''
);

create table if not exists public.province_movements (
  id uuid primary key default gen_random_uuid(),
  province_id uuid not null references public.provinces (id),
  operation_id uuid not null references public.operations (id),
  currency text not null check (currency in ('CUP', 'USD')),
  amount numeric(18, 2) not null,
  kind text not null check (kind in ('consume', 'release')),
  created_at timestamptz not null default now()
);

alter table public.provinces enable row level security;
alter table public.province_movements enable row level security;
