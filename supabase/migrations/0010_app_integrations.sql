create table if not exists public.app_integrations (
  id text primary key default 'default' check (id = 'default'),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  gmail_address text not null default 't-transfer@gmail.com',
  gmail_client_id text not null default '',
  gmail_client_secret text not null default '',
  gmail_refresh_token text not null default '',
  gmail_connected_email text not null default '',
  gmail_connected_at timestamptz,
  gmail_status text not null default 'disconnected',
  gmail_error text not null default '',
  whatsapp_phone_number_id text not null default '',
  whatsapp_access_token text not null default '',
  whatsapp_verify_token text not null default '',
  whatsapp_app_secret text not null default '',
  whatsapp_template_name text not null default '',
  whatsapp_template_lang text not null default 'es',
  whatsapp_connected_at timestamptz,
  whatsapp_status text not null default 'disconnected',
  whatsapp_error text not null default ''
);

insert into public.app_integrations (id)
values ('default')
on conflict (id) do nothing;

alter table public.app_integrations enable row level security;

revoke all on table public.app_integrations from public, anon, authenticated;
grant all on table public.app_integrations to postgres, service_role;
