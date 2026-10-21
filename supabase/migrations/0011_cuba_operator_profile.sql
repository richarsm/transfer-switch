alter table public.cuba_operators
  add column if not exists profile_id uuid;
