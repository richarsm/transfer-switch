-- Transfer Switch · Postgres / Supabase
-- Timezone de negocio: America/Havana
-- Aplicar en el SQL editor del proyecto cuando exista.

create extension if not exists "pgcrypto";

create type public.user_role as enum ('admin', 'operator');
create type public.period_kind as enum ('day', 'week');
create type public.opening_status as enum ('open', 'closed');
create type public.operation_mode as enum ('collect_then_transfer', 'transfer_then_collect');
create type public.collect_status as enum ('pending', 'collected', 'cancelled');
create type public.leg_status as enum ('pending', 'sent', 'failed');
create type public.travel_kind as enum ('flight', 'ground');
create type public.travel_status as enum ('draft', 'published', 'sold_out', 'archived');

create table public.invites (
  email text primary key,
  role public.user_role not null,
  display_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  display_name text not null,
  phone text not null default '',
  role public.user_role not null default 'operator',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.openings (
  id uuid primary key default gen_random_uuid(),
  kind public.period_kind not null,
  starts_on date not null,
  ends_on date not null,
  cup_per_1000_gyn numeric(18, 2) not null check (cup_per_1000_gyn > 0),
  notes text not null default '',
  status public.opening_status not null default 'open',
  opened_by uuid not null references public.profiles (id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  check (ends_on >= starts_on)
);

create unique index openings_one_open on public.openings (status) where status = 'open';

create extension if not exists btree_gist;

alter table public.openings
  add constraint openings_dates_no_overlap
  exclude using gist (daterange(starts_on, ends_on, '[]') with &&);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  bank text not null,
  last4 text not null,
  holder text not null,
  balance_cup numeric(18, 2) not null default 0,
  daily_limit numeric(18, 2) not null check (daily_limit > 0),
  monthly_limit numeric(18, 2) not null check (monthly_limit > 0),
  active boolean not null default true,
  notes text not null default ''
);

create table public.operations (
  id uuid primary key default gen_random_uuid(),
  opening_id uuid not null references public.openings (id),
  mode public.operation_mode not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  contact_name text not null,
  contact_phone text not null,
  address text not null,
  lat double precision,
  lng double precision,
  amount_gyn numeric(18, 2) not null check (amount_gyn > 0),
  amount_cup numeric(18, 2) not null check (amount_cup > 0),
  rate_cup_per_1000_gyn numeric(18, 2) not null,
  collect_status public.collect_status not null default 'pending',
  collected_at timestamptz,
  notes text not null default ''
);

create table public.transfer_legs (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations (id) on delete cascade,
  card_id uuid not null references public.cards (id),
  amount_cup numeric(18, 2) not null check (amount_cup > 0),
  status public.leg_status not null default 'pending',
  reference text not null default '',
  sent_at timestamptz
);

create table public.card_movements (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id),
  operation_id uuid not null references public.operations (id),
  leg_id uuid not null references public.transfer_legs (id),
  amount_cup numeric(18, 2) not null,
  business_date date not null,
  kind text not null check (kind in ('consume', 'release')),
  created_at timestamptz not null default now()
);

create table public.travel_offers (
  id uuid primary key default gen_random_uuid(),
  kind public.travel_kind not null,
  title text not null,
  origin text not null,
  destination text not null,
  price_gyn numeric(18, 2) not null default 0,
  price_cup numeric(18, 2) not null default 0,
  price_usdt numeric(18, 6) not null default 0,
  seats integer not null default 0,
  status public.travel_status not null default 'draft',
  notes text not null default '',
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table public.itinerary_legs (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.travel_offers (id) on delete cascade,
  sort_order integer not null,
  origin text not null,
  destination text not null,
  departs_at text not null,
  vehicle text not null default '',
  notes text not null default ''
);

alter table public.invites enable row level security;
alter table public.profiles enable row level security;
alter table public.openings enable row level security;
alter table public.cards enable row level security;
alter table public.operations enable row level security;
alter table public.transfer_legs enable row level security;
alter table public.card_movements enable row level security;
alter table public.travel_offers enable row level security;
alter table public.itinerary_legs enable row level security;
