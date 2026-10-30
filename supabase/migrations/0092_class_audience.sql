-- 0092: class audience. Each class stores who its emails go to.
-- batch_sessions.audience is jsonb written by the app: { mode, modules, ... } (see src/lib/classes/audience.ts).
-- NULL means "send nothing": the class has no audience yet, so no reminder or follow-up email is sent for it.
-- No default, so every existing class has no audience until an admin picks one.
-- No data is deleted or rewritten. Safe to re-run.

alter table public.batch_sessions
  add column if not exists audience jsonb;

comment on column public.batch_sessions.audience is
  'Who this class emails. NULL = send nothing. Shape defined in src/lib/classes/audience.ts.';
