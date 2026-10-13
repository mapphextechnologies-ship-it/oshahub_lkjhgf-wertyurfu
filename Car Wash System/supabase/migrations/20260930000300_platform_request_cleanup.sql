-- Restore the platform-only RPC used to clear selected pending/rejected
-- business registration requests. Keep access restricted to authenticated
-- Super Admins and refresh PostgREST's function schema cache after creation.
-- Restore the connection's original owner role if a temporary SET ROLE was used.
reset role;

do $$
begin
  if not has_schema_privilege(current_user, 'public', 'CREATE') then
    raise exception 'Role % (session role %) cannot create functions in public. Run this in the Supabase Dashboard SQL Editor as postgres or the public schema owner.', current_user, session_user
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.carwash_delete_business_requests(p_request_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  deleted_count integer;
begin
  if not public.carwash_is_platform_admin() then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;

  if coalesce(cardinality(p_request_ids), 0) < 1 or cardinality(p_request_ids) > 250 then
    raise exception 'Select between 1 and 250 requests.' using errcode = '22023';
  end if;

  perform public.carwash_consume_rate_limit('REQUEST_DELETE', 30, 3600);

  delete from public.carwash_access_requests
  where id = any(p_request_ids)
    and status in ('PENDING', 'REJECTED');

  get diagnostics deleted_count = row_count;

  insert into public.carwash_audit_logs(actor_user_id, action, entity_type, details)
  values (
    auth.uid(),
    'BUSINESS_REQUESTS_DELETED',
    'ACCESS_REQUEST',
    jsonb_build_object('deleted_count', deleted_count)
  );

  return deleted_count;
end;
$$;

revoke all on function public.carwash_delete_business_requests(uuid[])
  from public, anon;
grant execute on function public.carwash_delete_business_requests(uuid[])
  to authenticated;

notify pgrst, 'reload schema';
