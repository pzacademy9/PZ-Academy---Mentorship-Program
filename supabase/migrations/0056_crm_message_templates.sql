-- 0056_crm_message_templates.sql
--
-- Reusable message starting points shared by both outreach channels
-- (CampaignsPanel for email, WhatsAppPanel for WhatsApp). A template is
-- copied into the compose form when picked — editing it there never
-- touches the saved template row, same "load a copy, edit the copy"
-- pattern campaigns already use for duplicateCampaign.

create table if not exists public.crm_message_templates (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null check (channel in ('email', 'whatsapp')),
  name        text not null,
  subject     text,
  body        text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists crm_message_templates_channel_idx
  on public.crm_message_templates (channel);

alter table public.crm_message_templates enable row level security;
-- Zero policies: service-role only, same convention as every other CRM
-- table (0047). All reads/writes go through createAdminSupabase() behind
-- requireAdmin().

-- Starter templates, drafted from this CRM's real message tone (the live
-- DMC WhatsApp batch and the W20 webinar campaign) with bracketed
-- placeholders in place of anything course/date-specific, so they stay
-- reusable rather than going stale. The admin edits these freely — this
-- is a starting point, not a fixed set (save-as-template adds more).
insert into public.crm_message_templates (channel, name, subject, body)
values
  (
    'whatsapp',
    'Free webinar invite',
    null,
    E'Hi {{first_name}},\n\nWe''re running a free session on [TOPIC] on [DATE], [TIME] PKT over Zoom — open to everyone, no cost to attend.\n\nDetails and sign-up: [LINK]\n\nWould you like to join?'
  ),
  (
    'whatsapp',
    'New course follow-up',
    null,
    E'Hi {{first_name}},\n\nSince you joined our [PREVIOUS COURSE] batch, we thought you''d want to know first — our new [NEW COURSE] just launched, and it builds well on what you''ve already covered.\n\n*Early bird pricing ends [DATE]!*\n\nWould you like to enroll?'
  ),
  (
    'email',
    'Free webinar invite',
    'Free session on [TOPIC] — [DATE]',
    E'<p>Hi {{first_name}},</p>\n<p>We''re holding a free session on [TOPIC] on [DATE], [TIME] PKT, over Zoom — about an hour, open to everyone, no cost to attend.</p>\n<p>Details and sign-up: <a href="[LINK]">[LINK]</a></p>\n<p>Reply and let me know if you''re joining — helps me plan the Zoom capacity.</p>\n<p>Hope to see you there.</p>'
  ),
  (
    'email',
    'New course follow-up',
    'You''re invited: [NEW COURSE] is now open for enrollment',
    E'<p>Hi {{first_name}},</p>\n<p>Since you joined our [PREVIOUS COURSE], we thought you''d want to know first — our new [NEW COURSE] just launched, and it builds well on what you''ve already covered.</p>\n<p>Early bird pricing ends [DATE].</p>\n<p>Would you like to enroll? Details and sign-up: <a href="[LINK]">[LINK]</a></p>'
  );
