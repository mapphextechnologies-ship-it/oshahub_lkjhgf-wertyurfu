-- Inventory product total payable repair migration.
-- Run this on Supabase to add the price field used by agent registration.
-- Existing assigned inventory rows inherit the linked customer's total payable
-- when available so the agent workflow can derive deposit and due date.

begin;

alter table public.inventory_products
  add column if not exists total_payable numeric(14,2) not null default 0;

update public.inventory_products ip
set total_payable = coalesce(nullif(ip.total_payable, 0), c.total_payable, 0)
from public.customers c
where ip.assigned_customer_id = c.id
  and coalesce(ip.total_payable, 0) <= 0
  and coalesce(c.total_payable, 0) > 0;

commit;
