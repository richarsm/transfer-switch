-- Estados de operación: pendiente, en proceso, confirmada, cancelada

alter type public.operation_status add value if not exists 'processing';

alter table public.operations
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles (id);
