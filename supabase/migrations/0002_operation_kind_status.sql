-- Recarga móvil + estado confirmado de la operación

create type public.operation_kind as enum ('transfer', 'mobile_recharge');
create type public.operation_status as enum ('open', 'confirmed', 'cancelled');
create type public.delivery_status as enum ('pending', 'sent', 'failed');

alter table public.operations
  add column if not exists kind public.operation_kind not null default 'transfer',
  add column if not exists status public.operation_status not null default 'open',
  add column if not exists cuba_phone text not null default '',
  add column if not exists delivery_status public.delivery_status not null default 'pending',
  add column if not exists delivery_reference text not null default '',
  add column if not exists delivered_at timestamptz,
  add column if not exists confirmed_at timestamptz;
