-- ============================================================
-- Migration 0040: feedback_sessions.session_date text -> date
-- Run AFTER 0039. SQL Editor -> New query -> Run
-- ============================================================
-- Was `text` since 0033 (deferred at the time); every write path already
-- produces a cast-safe value (the admin UI's <input type="date"> emits
-- YYYY-MM-DD, the mentorship-sync path writes a timestamptz string that
-- Postgres truncates to its date part on cast). No app code change needed:
-- Supabase's generated types already map both text and date columns to
-- `string`, and every read site treats the value as an opaque string passed
-- to new Date(...)/formatDate(...). Table is empty in production, so this
-- cast carries no data-loss or backfill risk.

alter table public.feedback_sessions
  alter column session_date type date using session_date::date;
