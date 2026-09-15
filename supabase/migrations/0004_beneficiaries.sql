-- Lista reutilizable de clientes / beneficiarios para autocompletar operaciones

create table if not exists public.beneficiaries (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  contact_name text not null,
  contact_phone text not null,
  address text not null default '',
  lat double precision,
  lng double precision,
  cuba_phone text not null default '',
  cuba_recipient_name text not null default '',
  cuba_address text not null default '',
  province_id uuid references public.provinces (id),
  notes text not null default ''
);

create index if not exists beneficiaries_contact_phone_idx
  on public.beneficiaries (contact_phone);

create index if not exists beneficiaries_last_used_idx
  on public.beneficiaries (last_used_at desc);

alter table public.beneficiaries enable row level security;
