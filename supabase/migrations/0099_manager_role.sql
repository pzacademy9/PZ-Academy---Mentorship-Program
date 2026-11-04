-- Migration 0099: add the manager role.
-- Kept alone on purpose: a newly added enum value cannot be used in the same
-- transaction that adds it, so nothing else lives in this file. Run it by itself,
-- then run 0100.
alter type public.user_role add value if not exists 'manager';
