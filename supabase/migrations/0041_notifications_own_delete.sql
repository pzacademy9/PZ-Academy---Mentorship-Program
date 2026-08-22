-- Lets a user delete their own notification rows, so the bell/history UI can
-- offer a delete action and read notifications don't accumulate forever.
-- Same shape as 0002's "notifications: own update" policy.

create policy "notifications: own delete"
  on public.notifications for delete
  using (user_id = auth.uid());
