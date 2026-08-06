create type mentorship_booking_status as enum ('pending', 'confirmed', 'cancelled');
create type mentor_application_status as enum ('pending', 'approved', 'rejected');

create table public.mentorship_bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id),
  full_name text not null,
  email text not null,
  phone text not null,
  mentor_slug text not null,
  mentor_name text not null,
  package_name text not null,
  goals text,
  payment_screenshot_url text,
  status mentorship_booking_status not null default 'pending',
  cancellation_reason text,
  status_changed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.mentor_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid references public.profiles(id),
  full_name text not null,
  email text not null,
  phone text not null,
  country text,
  profession text,
  position text,
  expertise text,
  organization text,
  years_experience text,
  linkedin_url text,
  roles text,
  why_join text,
  value_provide text,
  cv_url text,
  photo_urls text[] not null default '{}',
  status mentor_application_status not null default 'pending',
  rejection_reason text,
  status_changed_at timestamptz,
  created_at timestamptz not null default now()
);

create index mentorship_bookings_student_idx on public.mentorship_bookings(student_id);
create index mentorship_bookings_email_idx on public.mentorship_bookings(email);
create index mentor_applications_applicant_idx on public.mentor_applications(applicant_id);
create index mentor_applications_email_idx on public.mentor_applications(email);

alter table public.mentorship_bookings enable row level security;
alter table public.mentor_applications enable row level security;

create policy "own bookings" on public.mentorship_bookings
  for select using (auth.uid() = student_id);
create policy "own applications" on public.mentor_applications
  for select using (auth.uid() = applicant_id);
