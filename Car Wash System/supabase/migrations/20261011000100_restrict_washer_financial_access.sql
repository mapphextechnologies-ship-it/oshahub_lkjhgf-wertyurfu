-- Keep commission and sales data available to business administrators only.
-- Washers can still update their assigned orders but cannot read the commission ledger.
drop policy if exists cw_commission_read on public.carwash_commission_ledger;
create policy cw_commission_read
on public.carwash_commission_ledger
for select
using (
  public.carwash_is_platform_admin()
  or public.carwash_has_tenant_access(tenant_id, array['BUSINESS_ADMIN'])
);

notify pgrst, 'reload schema';
