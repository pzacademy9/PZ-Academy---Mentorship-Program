-- 0055_crm_segment_source_security_invoker.sql
--
-- 0054's `create or replace view public.crm_contact_segment_source` dropped
-- the `with (security_invoker = true)` option that 0049 and 0050 both set.
-- CREATE OR REPLACE VIEW does not preserve options that aren't restated, so
-- the view silently reverted to running with its owner's privileges,
-- bypassing RLS on contacts/contact_purchases/email_metrics for a view that
-- exposes ~1,900 people's names, emails and phones. Caught in final review
-- of the WhatsApp click-to-chat feature (which is what 0054 shipped for).
--
-- Not exploitable today because 0050's revoke of anon/authenticated is still
-- in effect, but a future grant would expose it, and Supabase's security
-- advisor flags an owner-privileged view as an ERROR. Restoring the option
-- forward here rather than editing 0054, since 0054 already ran against the
-- live project with its original text.
alter view public.crm_contact_segment_source set (security_invoker = true);

revoke all on public.crm_contact_segment_source from anon, authenticated;
