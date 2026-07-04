-- ============================================================
-- Phase 2 demo seed (TEMPORARY — not a numbered migration)
-- ------------------------------------------------------------
-- Real course content lifted from the old static portals
-- (docs/Old Portals/ppc-portal.html, mdc-portal-v2.html) so the
-- new LMS can be tested end-to-end before the Phase 3 admin
-- builder (authors content) and Phase 6 admin panel (approves
-- enrollments) exist. In production this content comes from the
-- builder and activation from admin approval.
--
-- Idempotent: deletes and recreates both demo courses each run.
-- Test student: hamzaansari4you@gmail.com
--   (a86ed1b1-9fcc-462e-938e-45801af5be18)
--   → PPC enrollment ACTIVE (drip demo, 12 lessons / 4 modules)
--   → MDC enrollment PENDING (awaiting-verification screen demo)
-- ============================================================

delete from public.courses where slug in ('ppc-batch-2', 'mdc-workshop', 'ppc-2026');

update public.profiles
  set full_name = 'Hamza Ansari'
  where id = 'a86ed1b1-9fcc-462e-938e-45801af5be18'
    and coalesce(full_name, '') = '';

-- ─── COURSE 1: Practical Pharmacology Course (PPC) ───────────
insert into public.courses (
  id, slug, title, type, description, price_pkr, status, is_published,
  tagline, level, duration_weeks, register_url, mentor_name, mentor_title, features
)
values (
  '11111111-1111-4111-8111-111111111111',
  'ppc-batch-2',
  'Practical Pharmacology Course (PPC)',
  'course',
  'A 12-day clinical pharmacology program for hospital practice — from pharmacokinetics and prescribing to ICU, emergency medications and IV therapy.',
  15000,
  'open',
  true,
  'A hands-on clinical pharmacology program for real hospital practice — from pharmacokinetics and prescribing to ICU, emergency medications and IV therapy.',
  'All Levels',
  8,
  'https://pharmacozyme.com/official-ppc-registration-page/',
  'PZ Academy Clinical Faculty',
  'Board-Certified Pharmacists & Clinical Specialists',
  array[
    'Drug mechanisms, receptor pharmacology & pharmacokinetics',
    'Pediatric, renal & weight-based dose calculations',
    'Drug-drug interactions & adverse effect management',
    'Clinical case studies with worked solutions',
    'Board exam preparation strategies & MCQ banks',
    'Live Q&A sessions with expert faculty'
  ]
);

insert into public.modules (id, course_id, title, order_index) values
  ('11111111-2222-4222-8222-000000000001', '11111111-1111-4111-8111-111111111111', 'Module 1: Foundations of Clinical Pharmacology & Safe Prescribing', 0),
  ('11111111-2222-4222-8222-000000000002', '11111111-1111-4111-8111-111111111111', 'Module 2: Therapeutics in Acute & Chronic Care', 1),
  ('11111111-2222-4222-8222-000000000003', '11111111-1111-4111-8111-111111111111', 'Module 3: Special Populations, Critical Care & Emergency Pharmacology', 2),
  ('11111111-2222-4222-8222-000000000004', '11111111-1111-4111-8111-111111111111', 'Module 4: IV Therapy, Medication Safety & Clinical Integration', 3);

insert into public.lessons (id, module_id, title, content_type, video_url, order_index) values
  -- Module 1
  ('11111111-3333-4333-8333-000000000001', '11111111-2222-4222-8222-000000000001', 'Day 1 — Introduction to Clinical Pharmacology in Hospital Settings', 'video', 'https://www.youtube.com/embed/IaCZfx6XslY', 0),
  ('11111111-3333-4333-8333-000000000002', '11111111-2222-4222-8222-000000000001', 'Day 2 — Pharmacokinetics (ADME) & Pharmacodynamics', 'video', 'https://www.youtube.com/embed/oc3OyziKtTs', 1),
  ('11111111-3333-4333-8333-000000000003', '11111111-2222-4222-8222-000000000001', 'Day 3 — Prescription Writing and Interpretation', 'video', 'https://www.youtube.com/embed/o6A_mKms8LI', 2),
  -- Module 2
  ('11111111-3333-4333-8333-000000000004', '11111111-2222-4222-8222-000000000002', 'Day 4 — Practical Use of Antimicrobials in Hospitals', 'video', 'https://www.youtube.com/embed/d3jqSiI_pyI', 0),
  ('11111111-3333-4333-8333-000000000005', '11111111-2222-4222-8222-000000000002', 'Day 5 — Cardiovascular Drugs in Acute and Chronic Care', 'video', 'https://www.youtube.com/embed/8IgaAdW_8dU', 1),
  ('11111111-3333-4333-8333-000000000006', '11111111-2222-4222-8222-000000000002', 'Day 6 — Pain Management and Analgesic Use', 'video', 'https://www.youtube.com/embed/zYMyzY6itS0', 2),
  -- Module 3
  ('11111111-3333-4333-8333-000000000007', '11111111-2222-4222-8222-000000000003', 'Day 7 — Drug Dosing in Renal & Hepatic Impairment / Special Populations', 'video', 'https://www.youtube.com/embed/CSYBjOmt_pk', 0),
  ('11111111-3333-4333-8333-000000000008', '11111111-2222-4222-8222-000000000003', 'Day 8 — Emergency Medications and Crash Carts', 'video', 'https://www.youtube.com/embed/Wm7jbKL2Rx8', 1),
  ('11111111-3333-4333-8333-000000000009', '11111111-2222-4222-8222-000000000003', 'Day 9 — Pharmacology in ICU and Critical Care', 'video', 'https://www.youtube.com/embed/zMB1PFR6R7k', 2),
  -- Module 4
  ('11111111-3333-4333-8333-00000000000a', '11111111-2222-4222-8222-000000000004', 'Day 10 — IV Fluids, Drips, and Infusion Calculations', 'video', 'https://www.youtube.com/embed/Ua3liQRrDIY', 0),
  ('11111111-3333-4333-8333-00000000000b', '11111111-2222-4222-8222-000000000004', 'Day 11 — Medication Safety and Error Prevention', 'video', 'https://www.youtube.com/embed/xMKM-iuP-JU', 1),
  ('11111111-3333-4333-8333-00000000000c', '11111111-2222-4222-8222-000000000004', 'Day 12 — Assessment, Integration & Multidisciplinary Review', 'video', 'https://www.youtube.com/embed/pkzFNUJUl2Q', 2);

-- ─── COURSE 2: Medication Dose Calculations (MDC) Workshop ────
insert into public.courses (
  id, slug, title, type, description, price_pkr, status, is_published,
  tagline, level, duration_weeks, mentor_name, mentor_title, features
)
values (
  '22222222-2222-4222-8222-222222222222',
  'mdc-workshop',
  'Medication Dose Calculations (MDC) Workshop',
  'workshop',
  'A focused 4-day workshop on safe medication dose calculations — from foundations to weight-based, pediatric, IV infusion and case-based mastery.',
  5000,
  'open',
  true,
  'A focused workshop that builds confidence in accurate medication dose calculations for safe clinical practice.',
  'Beginner',
  2,
  'PZ Academy Clinical Faculty',
  'Board-Certified Pharmacists & Clinical Specialists',
  array[
    'Weight-based and body-surface-area dosing',
    'Renal and pediatric dose adjustments',
    'IV infusion rate and drip calculations',
    'Worked practice problems with step-by-step solutions'
  ]
);

insert into public.modules (id, course_id, title, order_index) values
  ('22222222-3333-4333-8333-000000000001', '22222222-2222-4222-8222-222222222222', 'Workshop Sessions', 0);

insert into public.lessons (id, module_id, title, content_type, video_url, order_index) values
  ('22222222-4444-4444-8444-000000000001', '22222222-3333-4333-8333-000000000001', 'Day 1 — Foundations of Dose Calculations', 'video', 'https://www.youtube.com/embed/2_l2QP_iaLo', 0),
  ('22222222-4444-4444-8444-000000000002', '22222222-3333-4333-8333-000000000001', 'Day 2 — Weight-Based, Pediatric & OTC Calculations', 'video', 'https://www.youtube.com/embed/O-AMNzTCNws', 1),
  ('22222222-4444-4444-8444-000000000003', '22222222-3333-4333-8333-000000000001', 'Day 3 — IV Infusions, Dilutions & Emergency Safety', 'video', 'https://www.youtube.com/embed/yySP_7NuBoU', 2),
  ('22222222-4444-4444-8444-000000000004', '22222222-3333-4333-8333-000000000001', 'Day 4 — Case-Based Mastery & Patient Safety', 'video', 'https://www.youtube.com/embed/F7HlE9h3Ne8', 3);

-- ─── ENROLLMENTS (insert pending, then activate to fire trigger) ─
insert into public.enrollments (id, student_id, course_id, status, payment_amount_pkr) values
  ('11111111-5555-4555-8555-000000000001', 'a86ed1b1-9fcc-462e-938e-45801af5be18', '11111111-1111-4111-8111-111111111111', 'pending', 15000),
  ('22222222-5555-4555-8555-000000000001', 'a86ed1b1-9fcc-462e-938e-45801af5be18', '22222222-2222-4222-8222-222222222222', 'pending', 5000);

-- Activate PPC only (MDC stays pending to demo the awaiting screen)
update public.enrollments
  set status = 'active', verified_at = now()
  where id = '11111111-5555-4555-8555-000000000001';
