# Progress report emails (bulk): owner steps

Branch `progress-report-emails`. One SQL paste (migration 0105).

## 1. Paste the SQL (once)

Supabase, SQL editor, new query, paste everything below, press Run. It adds two tables that remember
who was sent which report. It deletes nothing.

```sql
-- 0105: bulk progress report emails (Admin > batch > Progress reports).
-- One row per "Send to all" round, one row per student in that round. A student's row moves
-- pending -> claimed -> sent / failed / skipped, so pressing Send again never emails anyone twice.
-- Service role only (RLS on, no policies), like every other admin table. Safe to run more than once.

create table if not exists public.progress_report_sends (
  id              uuid primary key default gen_random_uuid(),
  page_id         uuid not null references public.landing_pages (id) on delete cascade,
  created_by      uuid,
  recipient_count integer not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists progress_report_sends_page_idx
  on public.progress_report_sends (page_id, created_at desc);

create table if not exists public.progress_report_recipients (
  id         uuid primary key default gen_random_uuid(),
  send_id    uuid not null references public.progress_report_sends (id) on delete cascade,
  person_id  uuid references public.pz_people (id) on delete set null,
  email      text not null,
  name       text not null default '',
  state      text not null default 'pending'
             check (state in ('pending','claimed','sent','failed','skipped')),
  reason     text not null default '',
  claimed_at timestamptz,
  sent_at    timestamptz,
  unique (send_id, person_id)
);
create index if not exists progress_report_recipients_send_idx
  on public.progress_report_recipients (send_id, state);

alter table public.progress_report_sends enable row level security;
alter table public.progress_report_recipients enable row level security;
```

Until you paste it you can still preview and send a test to yourself; only "Send to all" waits.

## 2. Try it on the Vercel preview

Admin, Enrollments, a batch's registrations, then **Progress reports** (also linked from the
Classes page).

1. The top shows students, how many have an email, how many are on the leaderboard, how many
   have not taken a quiz, recorded students and quizzes so far.
2. **Preview:** pick any student; the email shows below exactly as they will get it. Check a
   top student, a student outside the top 10 and one with no quiz.
3. **Send a test to me:** it goes to your own admin email with [TEST] in the subject.
4. **Send to all:** confirm, and it sends in small groups with a progress bar. If you leave the
   page, come back and press **Continue sending**. Nobody gets two emails in the same round.
5. **Sent before:** each round with sent / failed / skipped. Press "Try the failed again" if
   any failed. Students who unsubscribed are skipped.

## What is in each email (from your Apps Script)

Rank and points (with medals for the top 3), correct and wrong answers, the PZ ID box,
attendance against the certificate %, accuracy bar, top-10 leaderboard with YOU highlighted
(and their own row under it when below the top 10), how many points to pass the student above,
a class-by-class table, an encouraging message, and buttons for the website leaderboard and
YouTube. Students with no quiz yet get the "get started" version.

Differences from the Apps Script, on purpose:
- Only live students are ranked, like the website. Recorded students get their totals, no rank.
- Points are shown the same way as the website (for example 12,500), not divided by 1000.
- Colours are PZ Academy green. Every email has an unsubscribe link.
- No WhatsApp group button (each batch has its own group; tell me if you want one).
