alter table public.mentorship_bookings
  drop constraint mentorship_bookings_student_id_fkey,
  add constraint mentorship_bookings_student_id_fkey
    foreign key (student_id) references public.profiles(id) on delete set null;

alter table public.mentor_applications
  drop constraint mentor_applications_applicant_id_fkey,
  add constraint mentor_applications_applicant_id_fkey
    foreign key (applicant_id) references public.profiles(id) on delete set null;
