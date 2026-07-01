-- ============================================================
-- Migration 0001: Enums + All Tables
-- Run in Supabase SQL Editor → New query → Run
-- ============================================================

-- ─── ENUMS ───────────────────────────────────────────────────

create type public.user_role as enum ('student', 'mentor', 'admin', 'super_admin');
create type public.course_type as enum ('course', 'workshop', 'webinar', 'mentorship');
create type public.course_status as enum ('draft', 'open', 'closed', 'archived');
create type public.lesson_content_type as enum ('video', 'text', 'pdf');
create type public.progress_status as enum ('locked', 'unlocked', 'completed');
create type public.enrollment_status as enum ('pending', 'active', 'rejected', 'expired');
create type public.session_type as enum ('1on1', 'group', 'cv_review', 'interview_prep', 'career_guidance');
create type public.session_status as enum ('pending', 'confirmed', 'completed', 'cancelled');
create type public.banner_slot as enum ('hero', 'mid_page', 'sidebar', 'footer');
create type public.featured_item_type as enum ('course', 'webinar');

-- ─── PROFILES (extends auth.users) ───────────────────────────

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          public.user_role not null default 'student',
  full_name     text not null default '',
  phone         text,
  profession    text,
  city          text,
  avatar_url    text,
  bio           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── COURSES ─────────────────────────────────────────────────

create table public.courses (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  title          text not null,
  type           public.course_type not null default 'course',
  description    text,
  price_pkr      integer not null default 0,
  status         public.course_status not null default 'draft',
  thumbnail_url  text,
  portal_url     text,
  is_published   boolean not null default false,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ─── MODULES (LMS structure) ─────────────────────────────────

create table public.modules (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  title       text not null,
  order_index integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ─── LESSONS (LMS structure) ─────────────────────────────────

create table public.lessons (
  id             uuid primary key default gen_random_uuid(),
  module_id      uuid not null references public.modules(id) on delete cascade,
  title          text not null,
  content_type   public.lesson_content_type not null default 'text',
  video_url      text,
  text_content   text,
  pdf_url        text,
  order_index    integer not null default 0,
  created_at     timestamptz not null default now()
);

-- ─── LESSON PROGRESS (drip tracking) ─────────────────────────

create table public.lesson_progress (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles(id) on delete cascade,
  lesson_id    uuid not null references public.lessons(id) on delete cascade,
  status       public.progress_status not null default 'locked',
  completed_at timestamptz,
  unique (student_id, lesson_id)
);

-- ─── ENROLLMENTS ─────────────────────────────────────────────

create table public.enrollments (
  id                          uuid primary key default gen_random_uuid(),
  student_id                  uuid not null references public.profiles(id) on delete cascade,
  course_id                   uuid not null references public.courses(id) on delete cascade,
  status                      public.enrollment_status not null default 'pending',
  payment_screenshot_url      text,
  payment_amount_pkr          integer,
  verified_by                 uuid references public.profiles(id) on delete set null,
  verified_at                 timestamptz,
  rejection_reason            text,
  cert_issued                 boolean not null default false,
  cert_url                    text,
  enrolled_at                 timestamptz not null default now(),
  unique (student_id, course_id)
);

-- ─── SESSIONS (mentorship) ────────────────────────────────────

create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles(id) on delete cascade,
  mentor_id        uuid not null references public.profiles(id) on delete cascade,
  session_type     public.session_type not null default '1on1',
  status           public.session_status not null default 'pending',
  scheduled_at     timestamptz,
  duration_min     integer,
  mentor_notes     text,
  student_feedback text,
  rating           integer check (rating >= 1 and rating <= 5),
  booked_at        timestamptz not null default now()
);

-- ─── BANNERS (marketing CMS) ─────────────────────────────────

create table public.banners (
  id           uuid primary key default gen_random_uuid(),
  slot         public.banner_slot not null default 'hero',
  image_url    text,
  headline     text not null,
  cta_text     text not null,
  cta_link     text not null,
  active_from  timestamptz,
  active_until timestamptz,
  is_active    boolean not null default true,
  order_index  integer not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ─── FEATURED ITEMS (homepage order) ─────────────────────────

create table public.featured_items (
  id          uuid primary key default gen_random_uuid(),
  item_type   public.featured_item_type not null,
  item_id     uuid not null,
  order_index integer not null default 0,
  is_featured boolean not null default true
);

-- ─── MENTORS (extended mentor profile) ───────────────────────

create table public.mentors (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null unique references public.profiles(id) on delete cascade,
  specializations   text[] not null default '{}',
  availability_json jsonb,
  is_active         boolean not null default true,
  total_sessions    integer not null default 0,
  created_at        timestamptz not null default now()
);

-- ─── WEBINARS ────────────────────────────────────────────────

create table public.webinars (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  speaker_name  text not null,
  credentials   text,
  youtube_url   text,
  held_at       timestamptz,
  topic         text,
  is_upcoming   boolean not null default false,
  slug          text unique,
  created_at    timestamptz not null default now()
);

-- ─── ATTENDANCE ───────────────────────────────────────────────

create table public.attendance (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  course_id      uuid not null references public.courses(id) on delete cascade,
  session_date   date not null,
  marked_at      timestamptz not null default now(),
  marked_by      uuid references public.profiles(id) on delete set null,
  session_code   text
);

-- ─── NOTIFICATIONS ───────────────────────────────────────────

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  is_read    boolean not null default false,
  link       text,
  created_at timestamptz not null default now()
);

-- ─── CERTIFICATES ────────────────────────────────────────────

create table public.certificates (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  cert_url    text,
  issued_at   timestamptz,
  created_at  timestamptz not null default now(),
  unique (student_id, course_id)
);

-- ─── GAS SYNC LOG ────────────────────────────────────────────

create table public.gas_sync_log (
  id                uuid primary key default gen_random_uuid(),
  student_email     text not null,
  course_slug       text not null,
  sync_status       text not null check (sync_status in ('success', 'failed')),
  error_message     text,
  synced_at         timestamptz not null default now(),
  supabase_user_id  uuid
);

-- ─── EVENT REGISTRATIONS (marketing pipeline bridge) ─────────

create table public.event_registrations (
  id                   uuid primary key default gen_random_uuid(),
  event_name           text not null,
  student_email        text not null,
  sheets_row_ref       text,
  registered_at        timestamptz not null default now(),
  payment_verified_at  timestamptz,
  synced_to_platform   boolean not null default false
);
