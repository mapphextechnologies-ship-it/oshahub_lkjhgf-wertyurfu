-- Let each signed-in user manage only their own notification history.
drop policy if exists cw_user_messages_delete on public.carwash_user_messages;
create policy cw_user_messages_delete
  on public.carwash_user_messages
  for delete
  using (user_id = auth.uid());

revoke delete on public.carwash_user_messages from public, anon, authenticated;
grant delete on public.carwash_user_messages to authenticated;

notify pgrst, 'reload schema';
