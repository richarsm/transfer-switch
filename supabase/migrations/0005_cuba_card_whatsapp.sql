-- Datos de destino cubano para confirmación por WhatsApp

alter table public.operations
  add column if not exists cuba_card_number text not null default '';

alter table public.beneficiaries
  add column if not exists cuba_card_number text not null default '';
