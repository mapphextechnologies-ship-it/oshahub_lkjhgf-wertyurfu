-- Add shared inventory image support and align phone monitoring cadence.

alter table public.inventory_products
  add column if not exists image_url text;

alter table public.inventory_phone_profiles
  add column if not exists lock_reason text,
  add column if not exists locked_at timestamptz,
  add column if not exists unlocked_at timestamptz,
  add column if not exists last_sync_at timestamptz;

alter table public.payments
  add column if not exists payment_status text not null default 'paid',
  add column if not exists grace_period_days integer not null default 3;

create index if not exists idx_inventory_products_image_url
  on public.inventory_products (image_url)
  where nullif(trim(image_url), '') is not null;

create index if not exists idx_inventory_phone_profiles_last_sync_at
  on public.inventory_phone_profiles (last_sync_at)
  where last_sync_at is not null;
