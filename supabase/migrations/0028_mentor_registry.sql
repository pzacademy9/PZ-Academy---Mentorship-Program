-- ============================================================
-- Migration 0028: Mentor registry (Supabase-backed mentor CRUD)
-- Run AFTER 0027. SQL Editor → New query → Run
-- ============================================================
-- The 8 public mentors lived in a hardcoded TS file
-- (src/lib/mentorship/mentors.ts) — every edit needed a code change and a
-- redeploy. This migration turns public.mentors into the real registry
-- behind /mentorship, /mentorship/mentors/[slug] and
-- /mentorship/book/[slug], and adds full admin CRUD support.
--
-- WHY EXTEND public.mentors RATHER THAN CREATE A NEW TABLE: the table
-- already exists (0001) with an FK to profiles, but has never been read by
-- app code. Subsystem B (mentor auth accounts, not part of this migration)
-- then only has to set profile_id on an existing row. A parallel table
-- would leave this one dead and force a reconciliation later.
--
-- WHY profile_id BECOMES NULLABLE: none of the 8 current mentors has an
-- auth account. Postgres allows multiple NULLs under a UNIQUE constraint,
-- so account-less mentors coexist while one profile still maps to at most
-- one mentor row.

-- ─── 1. Visibility enum ──────────────────────────────────────
-- One three-state enum instead of copying courses' status + is_published
-- pair. That pair permits contradictory rows (status='draft' AND
-- is_published=true); a single enum makes "is this live?" unambiguous.
-- draft/hidden both 404 publicly and are indistinguishable to a visitor;
-- hidden differs only in admin semantics (was live, temporarily withdrawn)
-- and in preserving order_index so re-publishing restores grid position.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'mentor_visibility') then
    create type public.mentor_visibility as enum ('draft', 'published', 'hidden');
  end if;
end $$;

-- ─── 2. Drop the policy + columns that can't express 3 states ─
-- Order matters: the policy depends on is_active, so it must go first.
drop policy if exists "mentors: public read active" on public.mentors;
alter table public.mentors drop column if exists is_active;
alter table public.mentors drop column if exists specializations;

-- ─── 3. Loosen profile_id for account-less mentors ───────────
alter table public.mentors alter column profile_id drop not null;
alter table public.mentors drop constraint if exists mentors_profile_id_fkey;
alter table public.mentors
  add constraint mentors_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete set null;

comment on column public.mentors.profile_id is
  'Optional link to this mentor''s auth account. NULL for every mentor seeded '
  'from the old hardcoded list — they have no login yet. A future mentor-'
  'accounts subsystem sets this. ON DELETE SET NULL, not CASCADE: deleting a '
  'login must never erase the mentor''s public marketing profile.';

-- ─── 4. Registry columns ─────────────────────────────────────
alter table public.mentors
  add column if not exists slug                      text,
  add column if not exists name                       text not null default '',
  add column if not exists title                      text,
  add column if not exists expertise                  text,
  add column if not exists short_bio                  text,
  add column if not exists full_bio                   text[] not null default '{}',
  add column if not exists photo_url                  text,
  add column if not exists experience                 text,
  add column if not exists domain                     text,
  add column if not exists language                   text,
  add column if not exists format                     text,
  add column if not exists price_per_session_pkr      integer not null default 0,
  add column if not exists packages                   jsonb   not null default '[]'::jsonb,
  add column if not exists availability_text          text,
  add column if not exists lead_time                  text,
  add column if not exists credentials                jsonb   not null default '[]'::jsonb,
  add column if not exists skills                     text[]  not null default '{}',
  add column if not exists intro_video_url             text,
  add column if not exists linkedin_url                text,
  add column if not exists social_links                jsonb   not null default '[]'::jsonb,
  add column if not exists testimonials                jsonb   not null default '[]'::jsonb,
  add column if not exists session_duration_minutes    integer not null default 60,
  add column if not exists session_duration_text       text,
  add column if not exists timezone                    text,
  add column if not exists visibility                  public.mentor_visibility not null default 'draft',
  add column if not exists order_index                 integer not null default 0,
  add column if not exists updated_at                  timestamptz not null default now();

comment on column public.mentors.slug is
  'URL segment for /mentorship/mentors/<slug> and /mentorship/book/<slug>. '
  'IMMUTABLE after creation: mentorship_bookings.mentor_slug is a denormalized '
  'text snapshot with no FK, so renaming would orphan every historical '
  'booking. The admin form renders it read-only.';

comment on column public.mentors.name is
  'Public display name, e.g. "Dr. Roha". Not derived from profiles.full_name — '
  'a mentor may have no account, and the marketing name may differ from the '
  'legal name on the account.';

comment on column public.mentors.full_bio is
  'The "About" section, one array element per paragraph. text[] rather than a '
  'single text blob so the admin form is an explicit paragraph repeater and no '
  'delimiter parsing is needed — same shape as courses.features/outcomes.';

comment on column public.mentors.photo_url is
  'Either a local /mentor-*.png path (the 8 seeded mentors) or a Google Drive '
  'thumbnail URL from /api/admin/uploads/course-image. Rendered with a plain '
  '<img referrerPolicy="no-referrer">, never next/image — next.config.mjs has '
  'no images.remotePatterns, so next/image would hard-fail on any Drive URL.';

comment on column public.mentors.price_per_session_pkr is
  'Headline single-session price in PKR. Display price only — the amount a '
  'student actually agreed to is frozen in mentorship_bookings.package_name at '
  'booking time and is unaffected by later edits here.';

comment on column public.mentors.packages is
  'jsonb array of {name, sessions, price, savings?}. jsonb rather than a child '
  'table because this list is edited atomically in one admin form and is never '
  'queried by inner field — same call as courses.faqs and lessons.resources. '
  'name must be unique within the array: the public booking <select> uses it as '
  'both the React key and the posted packageName.';

comment on column public.mentors.availability_text is
  'Human-readable schedule blurb shown on the public profile, e.g. '
  '"Mon, Tue, Fri (Full Day)". DELIBERATELY separate from availability_json, '
  'which is reserved for a future real slot-based scheduling subsystem. Do not '
  'merge them: one is marketing copy, the other will be machine-readable.';

comment on column public.mentors.credentials is
  'jsonb array of {title, institution, icon}. icon is constrained by the app '
  'layer (CREDENTIAL_ICONS in src/lib/validations/admin-mentor.ts) to the keys '
  'MentorProfileClient''s iconMap actually supports; an unknown value would '
  'silently fall back to the Award icon.';

comment on column public.mentors.intro_video_url is
  'Optional YouTube/Vimeo URL embedded on the public mentor profile page.';

comment on column public.mentors.linkedin_url is
  'First-class because the profile page gives LinkedIn dedicated treatment; '
  'every other social link goes in social_links.';

comment on column public.mentors.social_links is
  'jsonb array of {label, url} for anything other than LinkedIn.';

comment on column public.mentors.testimonials is
  'jsonb array of {quote, author, role}.';

comment on column public.mentors.session_duration_minutes is
  'Session length in minutes. Integer, not the literal "60 Minutes" string the '
  'UI hardcoded before, so a future scheduling subsystem can compute slot '
  'boundaries without re-entering the data.';

comment on column public.mentors.session_duration_text is
  'Optional display override, e.g. "60–90 min" or "Varies", shown on the '
  'public profile instead of the formatted session_duration_minutes when set. '
  'The minutes value still drives any future scheduling math either way.';

comment on column public.mentors.timezone is
  'IANA timezone identifier, e.g. "Asia/Karachi". Stored as an id rather than a '
  'friendly label so a future scheduling subsystem can do arithmetic on it; '
  'the admin form offers a short curated <select> so the value is always '
  'IANA-valid.';

comment on column public.mentors.visibility is
  'draft     = never been live; not reachable at any public URL. '
  'published = listed in the /mentorship grid AND reachable at its deep links. '
  'hidden    = was live, temporarily withdrawn (mentor on leave). Not '
  '            reachable publicly — 404s exactly like draft — but keeps its '
  '            order_index so re-publishing restores its grid position, and '
  '            the admin list can distinguish "paused" from "never finished". '
  'One enum instead of courses'' status + is_published pair, which permits '
  'contradictory combinations.';

comment on column public.mentors.order_index is
  'Admin-controlled position in the public /mentorship grid, maintained by '
  'drag-to-reorder via PATCH /api/admin/mentors/reorder. Dense 0..n-1.';

-- ─── 5. updated_at trigger (reuses set_updated_at from 0003) ─
drop trigger if exists mentors_updated_at on public.mentors;
create trigger mentors_updated_at
  before update on public.mentors
  for each row
  execute function public.set_updated_at();

-- ─── 6. Seed the 8 mentors previously hardcoded in ────────────
--        src/lib/mentorship/mentors.ts. Idempotent: skips any slug that
--        already exists, so re-running this migration is a no-op.
--
-- Photos stay as local /mentor-*.png / .jpeg paths — the files remain in
-- public/. Nothing is uploaded to Drive. Filenames are NOT derived from
-- slugs (dr-aftab-alam -> /mentor-aftab-alam.jpeg, dr-hamza-ansari ->
-- /mentor-hamza-ansari.jpeg both break that assumption) — every path below
-- is copied verbatim from the source file.
--
-- intro_video_url, linkedin_url, timezone and session_duration_text seed
-- NULL; social_links and testimonials seed '[]'. These are not invented —
-- Mehwish is in Australia and Imad in Saudi Arabia, so a blanket timezone
-- would be wrong, and no source data exists for the others.
do $$
declare
  m record;
begin
  for m in
    select * from (values

      (
        'dr-roha', 0,
        'Dr. Roha',
        'Clinical Medicine & Healthcare Management',
        'Clinical Medicine',
        $b$MBBS doctor and Medical Officer with 5 years of clinical and hospital administration experience.$b$,
        array[
          $b$Dr. Roha is an MBBS-qualified Medical Officer with 5 years of hands-on clinical experience at Alees Medical Center, Islamabad. She combines strong clinical knowledge with a Master's in Healthcare Management, giving her a dual perspective on both patient care and hospital operations.$b$,
          $b$Her mentorship covers clinical reasoning, OPD and IPD pharmacy workflows, and the administrative side of healthcare — an often-overlooked skill set that separates good practitioners from great ones.$b$,
          $b$Dr. Roha is passionate about helping pharmacy and medical students understand how hospitals actually function, bridging the gap between textbook knowledge and real-world practice.$b$
        ],
        '/mentor-dr-roha.png',
        '5 Years', 'Medicine & Healthcare', 'English / Urdu', 'Online via Google Meet',
        3500,
        $j$[{"name":"Single Session","sessions":1,"price":3500},
            {"name":"3-Session Pack","sessions":3,"price":9500,"savings":1000},
            {"name":"5-Session Pack","sessions":5,"price":15500,"savings":2000}]$j$::jsonb,
        'Mon, Tue, Fri (Full Day)', '24 hours advance',
        $j$[{"title":"MBBS","institution":"Pakistan","icon":"GraduationCap"},
            {"title":"MS Healthcare Management","institution":"Pakistan","icon":"Award"},
            {"title":"Medical Officer","institution":"Alees Medical Center","icon":"BookOpen"}]$j$::jsonb,
        array[
          'Clinical Knowledge & Patient Care',
          'OPD & IPD Pharmacy Workflows',
          'Hospital Operations & Administration',
          'Healthcare Management',
          'Patient Counselling',
          'Clinical Decision-Making'
        ]
      ),

      (
        'ghazal-naqvi', 1,
        'Ghazal Naqvi',
        'Clinical Pharmacy & ICU Pharmacotherapy',
        'Clinical Pharmacy',
        $b$PhD-qualified Senior Clinical Pharmacist & Assistant Professor with 13+ years specialising in ICU pharmacotherapy, antimicrobial stewardship, and pharmacovigilance.$b$,
        array[
          $b$Dr. Ghazal Naqvi is a PhD-qualified Clinical Pharmacist and Assistant Professor at Fiji National University with 13+ years of progressive experience across tertiary-care hospitals, critical care units, and academic institutions. She holds a PhD in Pharmacy Practice and an MPhil in Pharmacology, both from Jinnah University for Women.$b$,
          $b$Her clinical career at Dr. Ruth K.M. Pfau Civil Hospital spanned nearly a decade, where she served as Senior Clinical Pharmacist & Research Associate (BPS-18), leading pharmacotherapy management across 5+ specialty units, reducing prescription errors by 28%, and lowering irrational antibiotic usage by 22% through antimicrobial stewardship initiatives. She previously managed pharmacotherapy across Psychiatry, Medical ICU, Pediatric ICU, and Neonatal ICU.$b$,
          $b$Dr. Ghazal brings an evidence-based, research-driven approach to mentorship — helping students master ICU pharmacotherapy, drug utilisation review, pharmacovigilance, and clinical research methodology.$b$
        ],
        '/mentor-ghazal-naqvi.jpeg',
        '13+ Years', 'Clinical Pharmacy', 'English / Urdu', 'Online via Zoom',
        6000,
        $j$[{"name":"Single Session","sessions":1,"price":6000},
            {"name":"3-Session Pack","sessions":3,"price":16000,"savings":2000},
            {"name":"5-Session Pack","sessions":5,"price":26000,"savings":4000}]$j$::jsonb,
        'Sat, Sun 5PM', '24 hours advance',
        $j$[{"title":"PhD in Pharmacy Practice","institution":"Jinnah University for Women","icon":"GraduationCap"},
            {"title":"MPhil in Pharmacology","institution":"Jinnah University for Women","icon":"Award"},
            {"title":"Assistant Professor","institution":"Fiji National University","icon":"BookOpen"}]$j$::jsonb,
        array[
          'ICU & Critical Care Pharmacotherapy',
          'Antimicrobial Stewardship Programs',
          'Medication Safety & Pharmacovigilance',
          'Drug Utilization Review (DUR)',
          'Clinical Research & Evidence-Based Medicine',
          'ADR Monitoring & Reporting'
        ]
      ),

      (
        'mehwish-kanwal', 2,
        'Mehwish Kanwal',
        'Hospital Pharmacy & International Pharmacy Practice',
        'Hospital Pharmacy',
        $b$AHPRA-registered pharmacist with 8+ years across UAE and Australia — former Senior Pharmacist at Kings College Hospital London Dubai, specialising in IV admixture, TPN, and transplant pharmacy.$b$,
        array[
          $b$Mehwish Kanwal is an AHPRA-registered pharmacist (491 Visa, Victoria, Australia) with over 8 years of hospital pharmacy experience, primarily across leading hospitals in Dubai, UAE. She graduated with a Pharm-D from Islamia University Bahawalpur and built her career at Kings College Hospital London – Dubai, Medcare Women and Children Hospital, and Emirates Hospital.$b$,
          $b$Her most recent senior role at Kings College Hospital London – Dubai included leading the Liver Transplant and Infection Control pharmacy departments, supervising IV admixture fluids and total parenteral nutrition (TPN) preparation, and implementing quality assurance systems that reduced medication errors. She is registered with AHPRA (Australia), Dubai Health Authority (UAE), and the Pharmacy Council of Pakistan.$b$,
          $b$Mehwish offers mentees a genuinely international pharmacy perspective — guiding students who aspire to build pharmacy careers abroad, navigate international licensing pathways, and develop the clinical competencies that global employers value.$b$
        ],
        '/mentor-mehwish-kanwal.jpeg',
        '8+ Years', 'Hospital Pharmacy', 'English / Urdu / Arabic', 'Online via Zoom',
        6000,
        $j$[{"name":"Single Session","sessions":1,"price":6000},
            {"name":"3-Session Pack","sessions":3,"price":16000,"savings":2000},
            {"name":"5-Session Pack","sessions":5,"price":26000,"savings":4000}]$j$::jsonb,
        'Flexible (contact to confirm)', '48 hours advance',
        $j$[{"title":"Pharm-D","institution":"Islamia University Bahawalpur","icon":"GraduationCap"},
            {"title":"Senior Pharmacist","institution":"Kings College Hospital London – Dubai, UAE","icon":"Award"},
            {"title":"AHPRA Registered","institution":"Australian Pharmacy Council","icon":"BookOpen"}]$j$::jsonb,
        array[
          'Hospital Pharmacy (UAE & Australia)',
          'IV Admixture & TPN Preparation',
          'Liver Transplant & Infection Control Pharmacy',
          'Medication Reconciliation & Error Reduction',
          'International Pharmacy Licensing (AHPRA, DHA)',
          'Patient Counselling & Medication Safety'
        ]
      ),

      (
        'dr-maheen-waseem', 3,
        'Dr. Maheen Waseem',
        'Infectious Diseases & Clinical Pharmacotherapy',
        'Pharmacotherapy',
        $b$Incharge Clinical Pharmacist at Sindh Infectious Disease Hospital with 9+ years specialising in pharmacotherapy, AUC/MIC vancomycin, TPN, and antibiotic stewardship.$b$,
        array[
          $b$Dr. Maheen Waseem is currently the Incharge of Clinical Pharmacy at Sindh Infectious Disease Hospital, with over 9 years of experience spanning infectious disease pharmacotherapy, IV dilutions, oncology pharmacy, and supply chain management. She previously served at Ziauddin Hospital (Oncology & ICU pharmacist), Child Life Foundation, and Liaquat National Hospital.$b$,
          $b$Her clinical toolkit is exceptionally specialised: she initiated AUC/MIC optimisation therapy for vancomycin, established TPN and pediatric parenteral nutrition programs, developed antibiotic stewardship protocols, and set up controlled drug procedures per ministry of health guidelines. She holds certifications in Adult Infectious Disease (Aga Khan University), Sepsis Management (Berlin University), and is a certified Clinical Trial Pharmacist (USA).$b$,
          $b$Dr. Maheen is a public speaker with internationally conducted sessions, and is driven by building strong clinical mindsets in her mentees — preparing them to handle complex, high-acuity cases with confidence and precision.$b$
        ],
        '/mentor-dr-maheen-waseem.jpeg',
        '9+ Years', 'Clinical Pharmacy', 'English / Urdu', 'Online via Google Meet',
        3000,
        $j$[{"name":"Single Session","sessions":1,"price":3000},
            {"name":"3-Session Pack","sessions":3,"price":8000,"savings":1000},
            {"name":"5-Session Pack","sessions":5,"price":13000,"savings":2000}]$j$::jsonb,
        'All Days Available', '24 hours advance',
        $j$[{"title":"Pharm-D","institution":"Ziauddin University","icon":"GraduationCap"},
            {"title":"Incharge Clinical Pharmacy","institution":"Sindh Infectious Disease Hospital","icon":"Award"},
            {"title":"Clinical Trial Pharmacist","institution":"USA Certified","icon":"BookOpen"}]$j$::jsonb,
        array[
          'Clinical Pharmacotherapy',
          'AUC/MIC Vancomycin Optimization',
          'Total Parenteral Nutrition (TPN)',
          'Antibiotic Stewardship Programs',
          'IV Dilutions & Drug Calculations',
          'Supply Chain Management (SCOR Model)'
        ]
      ),

      (
        'imad-khan', 4,
        'Imad Mohammad Khan',
        'Pharmaceutical Manufacturing & Industry Careers',
        'OSD Manufacturing',
        $b$14+ years in pharma manufacturing and hospital pharmacy across Pakistan and Saudi Arabia — currently Supervisor OSD Manufacturing at Jamjoom Pharma, Jeddah.$b$,
        array[
          $b$Imad Mohammad Khan is a Pharm-D pharmacist with over 14 years of experience spanning OSD (Oral Solid Dosage) manufacturing at Jamjoom Pharma, hospital pharmacy at Al-Mouwasat Hospital Dammam and Shifa Al-Khobar, and medical sales at Mothmir Corporation — all based in Saudi Arabia.$b$,
          $b$His current role as Supervisor OSD Manufacturing at Jamjoom Pharma places him at the heart of GMP-regulated pharmaceutical production, overseeing tablet and capsule manufacturing, API and excipient documentation, and regulatory compliance per SOP guidelines. He holds a Saudi Commission for Health Specialties (SCHS) license as a practicing pharmacist.$b$,
          $b$Imad is passionate about connecting Pakistani pharmacists to global opportunities in the Gulf, sharing his network and real-world insights on breaking into Saudi pharma manufacturing, hospital pharmacy, and medical sales.$b$
        ],
        '/mentor-imad-khan.png',
        '14+ Years', 'Pharmaceutical Industry', 'English / Arabic / Urdu', 'Online via Zoom',
        3000,
        $j$[{"name":"Single Session","sessions":1,"price":3000},
            {"name":"3-Session Pack","sessions":3,"price":8000,"savings":1000},
            {"name":"5-Session Pack","sessions":5,"price":13000,"savings":2000}]$j$::jsonb,
        'Fri (Full Day)', '48 hours advance',
        $j$[{"title":"Pharm-D","institution":"Baqai Institute of Pharmaceutical Sciences","icon":"GraduationCap"},
            {"title":"Supervisor OSD Manufacturing","institution":"Jamjoom Pharma, Saudi Arabia","icon":"Award"},
            {"title":"Hospital Pharmacy","institution":"Al-Mouwasat Hospital, Saudi Arabia","icon":"BookOpen"}]$j$::jsonb,
        array[
          'OSD Pharmaceutical Manufacturing',
          'GMP & Quality Assurance',
          'Hospital Pharmacy (Gulf Region)',
          'Medical Sales & Key Account Management',
          'Career Guidance for Middle East',
          'Regulatory Compliance & SOP Implementation'
        ]
      ),

      (
        'laiq-ur-rehman', 5,
        'Laiq-Ur-Rehman Khan',
        'Forensic Pharmacy, Drug Regulation & Exam Preparation',
        'Forensic Pharmacy',
        $b$Drug Inspector (District Kasur) with 9 years in forensic pharmacy and regulation — author of 4 pharmacy books and founder of Pharmacy Exam Guide (PEG).$b$,
        array[
          $b$Laiq-Ur-Rehman Khan is a Drug Inspector posted at Tehsil Chunian, District Kasur (PPSC Batch 2018) under the Health & Population Department. He previously served as Hospital Pharmacist at THQ Hospital Phalia, District Mandi Bahauddin, where he also acted as Focal Person for COVID-19 response, the IRMNCH Program, and hospital media communications.$b$,
          $b$Beyond his regulatory career, Laiq is an accomplished author of 4 pharmacy books published under the Pharmacy Exam Guide (PEG) brand — including titles on Forensic Pharmacy, Pharma Asset, model papers, and exam preparation for Procurement/Admin Officers. He also runs the Pharmacy Exam Guide YouTube channel, a widely used resource for pharmacists preparing for PPSC and government service examinations.$b$,
          $b$His mentorship uniquely bridges regulatory expertise and exam strategy — ideal for students targeting government pharmacy careers, drug inspection roles, PPSC exams, or careers in pharmaceutical policy and drug regulatory affairs.$b$
        ],
        '/mentor-laiq-ur-rehman.jpeg',
        '9 Years', 'Pharmacy Law & Regulation', 'English / Urdu', 'Online via Google Meet',
        5000,
        $j$[{"name":"Single Session","sessions":1,"price":5000},
            {"name":"3-Session Pack","sessions":3,"price":13000,"savings":2000},
            {"name":"5-Session Pack","sessions":5,"price":21000,"savings":4000}]$j$::jsonb,
        'Flexible (contact to confirm)', '24 hours advance',
        $j$[{"title":"Pharm-D","institution":"Pakistan","icon":"GraduationCap"},
            {"title":"Drug Inspector","institution":"Health & Population Dept, District Kasur","icon":"Award"},
            {"title":"Author of 4 Pharmacy Books","institution":"Pharmacy Exam Guide (PEG)","icon":"BookOpen"}]$j$::jsonb,
        array[
          'Forensic Pharmacy',
          'Drug Regulatory Affairs',
          'Pharmacy Law & Ethics',
          'PPSC & Government Exam Preparation',
          'Pharmacy Books & Content Creation',
          'Government Pharmacy Careers'
        ]
      ),

      (
        'dr-aftab-alam', 6,
        'Dr. Aftab Alam',
        'Entrepreneurship & Medication Counselling',
        'Entrepreneurship',
        $b$CEO of Pharmacozyme with 5 years building pharmacy-focused ventures and mentoring professionals.$b$,
        array[
          $b$Dr. Aftab Alam is the CEO of Pharmacozyme, a pharmacy-focused organization he has built over 5 years. His unique blend of clinical training and entrepreneurial execution gives him a perspective that few pharmacy mentors can offer.$b$,
          $b$His expertise spans medication counselling and entrepreneurship — helping students understand not just how to practice pharmacy, but how to build something around it. He has first-hand experience navigating the challenges of starting and scaling a health-focused business in Pakistan.$b$,
          $b$Dr. Aftab mentors aspiring pharmacist-entrepreneurs who want to go beyond traditional career paths and create their own opportunities in the pharmacy and healthcare space.$b$
        ],
        '/mentor-aftab-alam.jpeg',
        '5 Years', 'Pharmacy & Entrepreneurship', 'English / Urdu', 'Online via Google Meet',
        3000,
        $j$[{"name":"Single Session","sessions":1,"price":3000},
            {"name":"3-Session Pack","sessions":3,"price":8000,"savings":1000},
            {"name":"5-Session Pack","sessions":5,"price":13000,"savings":2000}]$j$::jsonb,
        'Any Time', '24 hours advance',
        $j$[{"title":"Pharm-D","institution":"Pakistan","icon":"GraduationCap"},
            {"title":"CEO","institution":"Pharmacozyme","icon":"Award"},
            {"title":"Medication Counselling","institution":"Pakistan","icon":"BookOpen"}]$j$::jsonb,
        array[
          'Pharmacy Entrepreneurship',
          'Medication Counselling',
          'Business Development',
          'Healthcare Startups',
          'Team Leadership',
          'Career Pivoting for Pharmacists'
        ]
      ),

      (
        'dr-hamza-ansari', 7,
        'Dr. Hamza Ansari',
        'Entrepreneurship, Digital Marketing & Agentic AI',
        'Entrepreneurship',
        $b$COO of Pharmacozyme — pharmacist turned tech entrepreneur specialising in AI, branding, and digital marketing.$b$,
        array[
          $b$Dr. Hamza Ansari is the COO of Pharmacozyme and one of the most multi-disciplinary pharmacists in Pakistan's emerging tech scene. With 5+ years of experience, he bridges the worlds of pharmacy, digital marketing, content creation, web & app development, and agentic AI.$b$,
          $b$His work at Pharmacozyme has put him at the intersection of healthcare and technology — building systems, brands, and workflows that leverage the latest in AI automation. He brings a rare combination of clinical understanding and deep tech execution.$b$,
          $b$Dr. Hamza mentors students who want to future-proof their pharmacy careers by developing skills in branding, digital presence, and AI-powered tools — the competencies that will define the next generation of healthcare professionals.$b$
        ],
        '/mentor-hamza-ansari.jpeg',
        '5+ Years', 'Pharmacy & Technology', 'English / Urdu', 'Online via Zoom',
        6000,
        $j$[{"name":"Single Session","sessions":1,"price":6000},
            {"name":"3-Session Pack","sessions":3,"price":16000,"savings":2000},
            {"name":"5-Session Pack","sessions":5,"price":26000,"savings":4000}]$j$::jsonb,
        '12–2 PM & 8–11 PM', '24 hours advance',
        $j$[{"title":"Pharm-D","institution":"Pakistan","icon":"GraduationCap"},
            {"title":"COO","institution":"Pharmacozyme","icon":"Award"},
            {"title":"Agentic AI & Automations","institution":"Self-taught","icon":"BookOpen"}]$j$::jsonb,
        array[
          'Entrepreneurship & Branding',
          'Digital Marketing',
          'Content Creation & Coaching',
          'Web & App Development',
          'Agentic AI & Automations',
          'Career Development for Pharmacists'
        ]
      )

    ) as t(slug, order_index, name, title, expertise, short_bio, full_bio, photo_url,
           experience, domain, language, format, price_per_session_pkr, packages,
           availability_text, lead_time, credentials, skills)
  loop
    if not exists (select 1 from public.mentors where slug = m.slug) then
      insert into public.mentors (
        slug, order_index, name, title, expertise, short_bio, full_bio, photo_url,
        experience, domain, language, format, price_per_session_pkr, packages,
        availability_text, lead_time, credentials, skills,
        visibility, session_duration_minutes
      ) values (
        m.slug, m.order_index, m.name, m.title, m.expertise, m.short_bio, m.full_bio,
        m.photo_url, m.experience, m.domain, m.language, m.format,
        m.price_per_session_pkr, m.packages, m.availability_text, m.lead_time,
        m.credentials, m.skills,
        'published'::public.mentor_visibility, 60
      );
    end if;
  end loop;
end $$;

-- ─── 7. Constraints that require the seed to have run ────────
alter table public.mentors alter column slug set not null;
create unique index if not exists mentors_slug_idx on public.mentors (slug);
create index if not exists mentors_visibility_order_idx
  on public.mentors (visibility, order_index);

-- mentorship_bookings.mentor_slug is queried by the admin mentor detail page
-- (booking count) and by deleteMentor()'s guard. Deliberately still NO
-- foreign key: a deleted or renamed mentor must never invalidate historical
-- bookings.
create index if not exists mentorship_bookings_mentor_slug_idx
  on public.mentorship_bookings (mentor_slug);

-- ─── 8. RLS ──────────────────────────────────────────────────
-- "mentors: public read active" was dropped in step 2 (is_active is gone and
-- could not express three states anyway).
create policy "mentors: public read published"
  on public.mentors for select
  using (visibility = 'published' or get_my_role() in ('admin', 'super_admin'));

-- The old insert-only "mentors: admin write" cannot cover UPDATE or DELETE,
-- and there was no DELETE policy at all. Replaced with the same `for all`
-- shape used by featured_items and webinars in 0002.
drop policy if exists "mentors: admin write" on public.mentors;
create policy "mentors: admin write"
  on public.mentors for all
  using (get_my_role() in ('admin', 'super_admin'))
  with check (get_my_role() in ('admin', 'super_admin'));

-- "mentors: mentor update own" is DROPPED, not hardened. RLS is row-level,
-- not column-level: once a future subsystem sets profile_id on a mentor row,
-- that policy would let a mentor self-publish (visibility='published') or
-- reprice themselves via a direct PostgREST call, bypassing admin review
-- entirely. Reintroducing mentor self-service later needs a SECURITY
-- DEFINER RPC with an explicit column whitelist, not this row-level policy.
drop policy if exists "mentors: mentor update own" on public.mentors;
