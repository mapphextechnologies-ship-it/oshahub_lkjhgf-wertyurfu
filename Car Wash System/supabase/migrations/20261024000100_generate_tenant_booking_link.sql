create or replace function public.carwash_generate_booking_link(target_tenant uuid)
returns text
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare link_slug text;
begin
  if not public.carwash_has_tenant_access(target_tenant,array['BUSINESS_ADMIN']) then
    raise exception 'Business administrator access is required.' using errcode='42501';
  end if;

  update public.carwash_tenants
    set booking_slug=coalesce(
      nullif(booking_slug,''),
      coalesce(nullif(trim(both '-' from regexp_replace(lower(name),'[^a-z0-9]+','-','g')),''),'business')
        || '-' || left(replace(id::text,'-',''),8)
    )
    where id=target_tenant
    returning booking_slug into link_slug;

  if link_slug is null then
    raise exception 'Business workspace not found.' using errcode='P0002';
  end if;

  return link_slug;
end;
$$;

revoke all on function public.carwash_generate_booking_link(uuid) from public,anon;
grant execute on function public.carwash_generate_booking_link(uuid) to authenticated;

notify pgrst,'reload schema';
