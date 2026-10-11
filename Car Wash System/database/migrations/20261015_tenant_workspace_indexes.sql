-- Tenant-first indexes keep workspace queries and RLS relationship checks fast
-- as each business accumulates customers, vehicles, staff, and wash history.
create index if not exists carwash_memberships_tenant_status
  on public.carwash_memberships(tenant_id,status,role);
create index if not exists carwash_services_tenant_created
  on public.carwash_services(tenant_id,created_at desc);
create index if not exists carwash_customers_tenant_created
  on public.carwash_customers(tenant_id,created_at desc);
create index if not exists carwash_vehicles_tenant_created
  on public.carwash_vehicles(tenant_id,created_at desc);
create index if not exists carwash_order_services_tenant_order
  on public.carwash_order_services(tenant_id,order_id);
create index if not exists carwash_payments_tenant_order_status
  on public.carwash_payments(tenant_id,order_id,status);
create index if not exists carwash_audit_logs_tenant_created
  on public.carwash_audit_logs(tenant_id,created_at desc);
create index if not exists carwash_subscriptions_tenant_started
  on public.carwash_subscriptions(tenant_id,starts_at desc,created_at desc);
create index if not exists carwash_subscription_payments_tenant_paid
  on public.carwash_subscription_payments(tenant_id,paid_at desc);
create index if not exists carwash_billing_requests_tenant_created
  on public.carwash_billing_requests(tenant_id,created_at desc);

notify pgrst,'reload schema';
