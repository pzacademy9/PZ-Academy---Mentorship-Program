-- ============================================================
-- Migration 0013: Enrollment insert hardening + course FAQs (Phase 4)
-- Run AFTER 0012. SQL Editor → New query → Run
-- ============================================================
-- Phase 4 is the first phase that lets a student write to
-- public.enrollments from the UI (POST /api/enrollments). The
-- existing "enrollments: student insert" policy (0002) only
-- constrains student_id, so a student could otherwise insert
-- their own row with status='active', cert_issued=true, or an
-- arbitrary payment_amount_pkr — self-enrolling for free and
-- skipping payment verification entirely. Closing that here,
-- before any client code can reach the table.

drop policy if exists "enrollments: student insert" on public.enrollments;

create policy "enrollments: student insert"
  on public.enrollments for insert
  with check (
    student_id = auth.uid()
    and status = 'pending'
    and verified_by is null
    and verified_at is null
    and cert_issued = false
    and cert_url is null
    and rejection_reason is null
  );

-- ─── Course FAQs ────────────────────────────────────────────
-- Backs the FAQ tab on /courses/[slug]. Array of {question, answer}
-- objects, admin-editable via the existing courses RLS (0002,
-- "courses: super_admin write" already covers all columns).

alter table public.courses
  add column if not exists faqs jsonb not null default '[]';
