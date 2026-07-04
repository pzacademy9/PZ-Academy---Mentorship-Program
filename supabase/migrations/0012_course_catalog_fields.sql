-- ============================================================
-- Migration 0012: Course catalog fields (Phase 4)
-- Run AFTER 0011. SQL Editor → New query → Run
-- ============================================================
-- Extends public.courses with the presentation fields a public
-- catalog + course-detail page needs. The base table (0001) only
-- had slug/title/type/description/price/thumbnail/is_published;
-- tagline, banner, level, duration, features, mentor info and the
-- external registration link were all hardcoded in the static
-- marketing page. These columns move that content into the DB.
--
-- All columns are nullable or defaulted, so existing rows and the
-- Phase 3 admin builder inserts stay valid. No RLS change needed —
-- the existing "courses: public read published" policy already
-- covers new columns.

alter table public.courses
  add column if not exists tagline           text,
  add column if not exists banner_url         text,
  add column if not exists level              text,
  add column if not exists duration_weeks     integer,
  add column if not exists features           text[] not null default '{}',
  add column if not exists outcomes           text[] not null default '{}',
  add column if not exists register_url       text,
  add column if not exists mentor_name        text,
  add column if not exists mentor_title       text,
  add column if not exists mentor_bio         text,
  add column if not exists mentor_avatar_url  text;

-- ─── Backfill the two real courses ─────────────────────────
-- Copy lifted from the static marketing page (src/app/courses/page.tsx)
-- so the DB-backed catalog renders the same real content.

update public.courses set
  tagline        = 'A hands-on clinical pharmacology program for real hospital practice — from pharmacokinetics and prescribing to ICU, emergency medications and IV therapy.',
  level          = 'All Levels',
  duration_weeks = 8,
  register_url   = 'https://pharmacozyme.com/official-ppc-registration-page/',
  mentor_name    = 'PZ Academy Clinical Faculty',
  mentor_title   = 'Board-Certified Pharmacists & Clinical Specialists',
  features = array[
    'Drug mechanisms, receptor pharmacology & pharmacokinetics',
    'Pediatric, renal & weight-based dose calculations',
    'Drug-drug interactions & adverse effect management',
    'Clinical case studies with worked solutions',
    'Board exam preparation strategies & MCQ banks',
    'Live Q&A sessions with expert faculty'
  ]
where slug = 'ppc-batch-2';

update public.courses set
  tagline        = 'A focused workshop that builds confidence in accurate medication dose calculations for safe clinical practice.',
  level          = 'Beginner',
  duration_weeks = 2,
  mentor_name    = 'PZ Academy Clinical Faculty',
  mentor_title   = 'Board-Certified Pharmacists & Clinical Specialists',
  features = array[
    'Weight-based and body-surface-area dosing',
    'Renal and pediatric dose adjustments',
    'IV infusion rate and drip calculations',
    'Worked practice problems with step-by-step solutions'
  ]
where slug = 'mdc-workshop';
