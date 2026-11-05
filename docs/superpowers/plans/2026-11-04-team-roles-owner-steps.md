# Team roles: owner steps

Do these in order, in the Supabase SQL editor, after the Team branch is merged and live.

1. Open `supabase/migrations/0099_manager_role.sql`, paste it, run it ALONE. It adds the new Manager role.
2. Open `supabase/migrations/0100_team_access.sql`, paste it, run it. It makes the table that stores custom access, and turns your own account into Super Admin.
3. Check: run `select email, role from public.profiles p join auth.users u on u.id = p.id where p.role = 'super_admin';` It must show your email only.

Checked on 2026-11-04 (read-only): the database had exactly one admin and no super admin, so step 2 promotes the right account. If a second admin is ever added before you paste, step 2 does nothing by design; tell Claude and it will give you a one-line fix.

4. Open `supabase/migrations/0103_manager_policies.sql`, paste it, run it. It lets the Manager role use the pages in its areas (it keeps every existing rule and only adds Manager to nine of them). Run it only after steps 1 and 2.

After this, "Team" appears in your admin menu. Nobody else can see it.
