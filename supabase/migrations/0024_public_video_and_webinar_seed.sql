-- ============================================================
-- Migration 0024: Public preview video + webinar program seed
-- Run AFTER 0023. SQL Editor → New query → Run
-- ============================================================
-- Part G (public page rewiring) needs webinars to be real `courses` rows
-- (type='webinar') so /webinars can be DB-driven like /courses and /workshops,
-- and so a webinar recording is manageable through the same admin Course
-- Builder as any other lesson.
--
-- Per product decision: watching a webinar recording must be free for anyone,
-- with NO enrollment required — but quizzes, notes, and a certificate still
-- require enrolling (free or paid, admin's choice via price_pkr). The
-- existing "lessons: read if unlocked or admin" RLS policy (0007) is the
-- wrong gate for "free to watch" — weakening it would risk exposing paid
-- course content. Instead, public_video_url lives on `courses` itself,
-- governed by the ALREADY-existing "courses: public read published" policy
-- (0002), so no RLS changes are needed at all. The same YouTube link is also
-- written to a real lesson row below, so the enrolled/portal experience
-- (drip unlock, quiz, notes, certificate eligibility) works unchanged for
-- students who do enroll.

alter table public.courses
  add column if not exists public_video_url text;

comment on column public.courses.public_video_url is
  'A freely watchable preview/recording video (YouTube/Vimeo URL) shown on the '
  'public /courses/[slug] page for ANYONE, regardless of enrollment. Distinct '
  'from this course''s lesson content, which stays gated by the lessons RLS '
  'policy. Used so a webinar recording can be watched for free while quizzes, '
  'notes, and certificate eligibility still require enrolling. Optional for '
  'every course type, not just webinar.';

-- Seed the 13 previously-hardcoded webinars (src/components/marketing/WebinarGrid.tsx)
-- as real webinar programs. Idempotent: skips any slug that already exists.
do $$
declare
  webinar record;
  v_course_id uuid;
  v_module_id uuid;
begin
  for webinar in
    select * from (values
      ('dr-imad',         'Pharmacokinetics in Clinical Practice',      'Dr Imad',        'https://youtube.com/live/Elqiz7k_6PQ', 'closed'),
      ('dr-maheen',       'Managing Drug-Drug Interactions',            'Dr Maheen',      'https://youtube.com/live/2dy8vIKzgtg', 'closed'),
      ('dr-ghazal',       'Antimicrobial Stewardship Essentials',       'Dr Ghazal',      'https://youtube.com/live/HR71q4OycrM', 'closed'),
      ('dr-hina',         'Paediatric Drug Safety & Dosing',            'Dr Hina',        'https://youtube.com/live/yETCHKZH9fA', 'closed'),
      ('dr-mehwish',      'Adverse Drug Reaction Monitoring',           'Dr Mehwish',     'https://youtube.com/live/hPqB_RgTU68', 'closed'),
      ('dr-laiq',         'Evidence-Based Prescribing',                 'Dr Laiq',        'https://youtube.com/live/sSt4U9tzbVE', 'closed'),
      ('dr-maria',        'Clinical Toxicology Essentials',             'Dr Maria',       'https://youtube.com/live/7aSC1hRQIWg', 'closed'),
      ('dr-arzoo',        'Rational Drug Use & Pharmacy Practice',      'Dr Arzoo',       'https://youtube.com/live/SAr3WD4fPVc', 'closed'),
      ('ms-afreen',       'Patient Counselling & Medication Adherence', 'Ms Afreen',      'https://youtube.com/live/M6xeB8C8bU0', 'closed'),
      ('dr-sajjad',       'Critical Care Pharmacology',                 'Dr Sajjad',      'https://youtube.com/live/HuC98JqYbz8', 'open'),
      ('dr-farid',        'Cardiovascular Drug Therapy',                'Dr Farid',       'https://youtube.com/live/8-hWM5LV9CQ', 'open'),
      ('mr-waqar',        'Pharmaceutical Calculations in Practice',    'Mr Waqar',       'https://youtube.com/live/rkQSJ7UMc9g', 'open'),
      ('dr-quratullain',  'Renal & Hepatic Dose Adjustment',            'Dr Quratullain', 'https://youtube.com/live/3gDEFyOsw78', 'open')
    ) as t(slug, topic, mentor_name, video_url, program_status)
  loop
    select id into v_course_id from public.courses where slug = webinar.slug;
    if v_course_id is null then
      insert into public.courses (
        slug, title, type, status, is_published, price_pkr,
        mentor_name, tagline, public_video_url
      )
      values (
        webinar.slug, webinar.topic, 'webinar'::course_type, webinar.program_status::course_status, true, 0,
        webinar.mentor_name, 'A PZ Academy webinar with ' || webinar.mentor_name, webinar.video_url
      )
      returning id into v_course_id;

      insert into public.modules (course_id, title, order_index)
      values (v_course_id, 'Sessions', 0)
      returning id into v_module_id;

      insert into public.lessons (module_id, title, content_type, order_index, video_url)
      values (v_module_id, webinar.topic, 'video'::lesson_content_type, 0, webinar.video_url);
    end if;
  end loop;
end $$;
