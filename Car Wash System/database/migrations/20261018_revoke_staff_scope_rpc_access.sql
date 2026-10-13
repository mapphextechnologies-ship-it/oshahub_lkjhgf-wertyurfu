-- This function is only called by table triggers. It must not be callable as an RPC.
revoke all on function public.carwash_enforce_staff_record_scope()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
