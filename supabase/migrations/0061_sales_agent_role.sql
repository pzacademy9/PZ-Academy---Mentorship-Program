-- Migration 0061: add the sales_agent role.
-- Kept alone on purpose: a newly added enum value cannot be used in the same
-- transaction that adds it, so nothing else lives in this file.
alter type public.user_role add value if not exists 'sales_agent';
